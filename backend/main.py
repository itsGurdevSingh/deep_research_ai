import logging
import os
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.schemas import ErrorResponse, ResearchRequest, ResearchResponse
from pipeline import ResearchPipelineError, run_research_pipeline


logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

app = FastAPI(title="Deep Research API", version="1.0.0")

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
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post(
    "/api/research",
    response_model=ResearchResponse,
    responses={
        400: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)
def research(request: ResearchRequest) -> dict[str, Any]:
    result = run_research_pipeline(request.topic)
    return {"topic": request.topic.strip(), **result}