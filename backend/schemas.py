from __future__ import annotations

from pydantic import BaseModel, Field


class ResearchRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=500)


class ResearchResponse(BaseModel):
    topic: str
    search_results: str
    scraper_results: str
    report: str
    critique: str


class ResearchJobResponse(BaseModel):
    job_id: str
    topic: str
    status: str


class ResearchJobStatusResponse(BaseModel):
    job_id: str
    topic: str
    status: str
    result: ResearchResponse | None = None
    error: ErrorDetail | None = None


class ErrorDetail(BaseModel):
    code: str
    message: str
    retryable: bool = False


class ErrorResponse(BaseModel):
    error: ErrorDetail