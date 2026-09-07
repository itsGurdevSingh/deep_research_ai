import logging
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from threading import Event, Lock
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.schemas import (
    ErrorDetail,
    ErrorResponse,
    ResearchJobResponse,
    ResearchJobStatusResponse,
    ResearchRequest,
    ResearchResponse,
)
from pipeline import ResearchCancelledError, ResearchPipelineError, run_research_pipeline


logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

app = FastAPI(title="Deep Research API", version="1.0.0")
job_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="research")
job_lock = Lock()


@dataclass
class ResearchJob:
    job_id: str
    topic: str
    cancel_event: Event = field(default_factory=Event)
    status: str = "running"
    result: dict[str, Any] | None = None
    error: ErrorDetail | None = None
    done_event: Event = field(default_factory=Event)


jobs: dict[str, ResearchJob] = {}

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1):517[0-9]$",
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def error_response(
    code: str, message: str, retryable: bool = False, status_code: int = 500
):
    body = ErrorResponse(
        error={"code": code, "message": message, "retryable": retryable}
    )
    return JSONResponse(status_code=status_code, content=body.model_dump())


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return error_response(
        "invalid_request",
        "Please provide a research topic between 1 and 500 characters.",
        status_code=422,
    )


@app.exception_handler(ResearchPipelineError)
async def pipeline_exception_handler(
    request: Request, exc: ResearchPipelineError
) -> JSONResponse:
    logger.warning("Research pipeline failed: %s", exc, exc_info=True)
    status_code = 400 if exc.code == "invalid_topic" else 503
    return error_response(exc.code, exc.message, exc.retryable, status_code)


@app.exception_handler(Exception)
async def unexpected_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    logger.exception("Unexpected API error")
    return error_response(
        "internal_error",
        "The research service encountered an unexpected error. Please try again.",
        retryable=True,
    )


@app.get("/health")
def health_check(response: Response) -> dict[str, str]:
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    return {"status": "ok"}


def run_job(job: ResearchJob) -> None:
    try:
        result = run_research_pipeline(job.topic, job.cancel_event)
        with job_lock:
            if job.cancel_event.is_set():
                job.status = "stopped"
            else:
                job.result = {"topic": job.topic, **result}
                job.status = "complete"
    except ResearchCancelledError:
        with job_lock:
            job.status = "stopped"
    except ResearchPipelineError as error:
        with job_lock:
            job.status = "error"
            job.error = ErrorDetail(
                code=error.code,
                message=error.message,
                retryable=error.retryable,
            )
        logger.warning("Research job %s failed: %s", job.job_id, error, exc_info=True)
    except Exception:
        with job_lock:
            job.status = "error"
            job.error = ErrorDetail(
                code="internal_error",
                message="The research service encountered an unexpected error. Please try again.",
                retryable=True,
            )
        logger.exception("Unexpected error in research job %s", job.job_id)
    finally:
        job.done_event.set()


@app.post("/api/research", response_model=ResearchJobResponse, status_code=202)
def create_research_job(request: ResearchRequest) -> ResearchJobResponse:
    job = ResearchJob(job_id=str(uuid4()), topic=request.topic.strip())
    with job_lock:
        jobs[job.job_id] = job
    job_executor.submit(run_job, job)
    return ResearchJobResponse(job_id=job.job_id, topic=job.topic, status=job.status)


@app.get("/api/research/{job_id}", response_model=ResearchJobStatusResponse)
def get_research_job(job_id: str) -> ResearchJobStatusResponse:
    with job_lock:
        job = jobs.get(job_id)
        if not job:
            return JSONResponse(
                status_code=404,
                content={"error": {"code": "job_not_found", "message": "Research job not found.", "retryable": False}},
            )
        return ResearchJobStatusResponse(
            job_id=job.job_id,
            topic=job.topic,
            status=job.status,
            result=job.result,
            error=job.error,
        )


@app.post("/api/research/{job_id}/cancel", response_model=ResearchJobStatusResponse)
def cancel_research_job(job_id: str) -> ResearchJobStatusResponse:
    with job_lock:
        job = jobs.get(job_id)
        if not job:
            return JSONResponse(
                status_code=404,
                content={"error": {"code": "job_not_found", "message": "Research job not found.", "retryable": False}},
            )
        if job.status == "running":
            job.cancel_event.set()
            job.status = "stopping"
        return ResearchJobStatusResponse(
            job_id=job.job_id,
            topic=job.topic,
            status=job.status,
            result=job.result,
            error=job.error,
        )


@app.get("/api/research/{job_id}/result", response_model=ResearchJobStatusResponse)
def wait_for_research_result(job_id: str) -> ResearchJobStatusResponse:
    with job_lock:
        job = jobs.get(job_id)
    if not job:
        return JSONResponse(
            status_code=404,
            content={"error": {"code": "job_not_found", "message": "Research job not found.", "retryable": False}},
        )

    job.done_event.wait()
    with job_lock:
        return ResearchJobStatusResponse(
            job_id=job.job_id,
            topic=job.topic,
            status=job.status,
            result=job.result,
            error=job.error,
        )