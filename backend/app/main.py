"""FastAPI application: the HTTP API contract in docs/contract/http-api.md."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import APIRouter, FastAPI, File, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from . import config, datasets, db, export
from .compiler import compile_figure
from .errors import ExportUnavailable, SpecValidationError
from .models.figure_spec import dump_figure_spec, parse_figure_spec
from .providers.factory import build_provider


# --------------------------------------------------------------------------- #
# Request bodies
# --------------------------------------------------------------------------- #

class RenderRequest(BaseModel):
    datasetId: str
    spec: dict


class GenerateRequest(BaseModel):
    datasetId: str
    prompt: str


class PatchRequest(BaseModel):
    datasetId: str
    spec: dict
    prompt: str


class ProjectRequest(BaseModel):
    name: str


class VersionRequest(BaseModel):
    name: str
    spec: dict


class ExportRequest(BaseModel):
    datasetId: str
    spec: dict
    format: str = "html"
    width: Optional[float] = None
    height: Optional[float] = None
    scale: Optional[float] = None


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": code, "message": message})


def _below_threshold(confidence: Optional[float]) -> bool:
    return confidence is not None and confidence < config.confidence_threshold()


def _load_dataframe(dataset_id: str):
    row = db.get_dataset_row(dataset_id)
    if row is None:
        return None
    return datasets.read_dataframe(row["path"], row["filename"])


router = APIRouter(prefix="/api")


# --------------------------------------------------------------------------- #
# Datasets
# --------------------------------------------------------------------------- #

@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.post("/datasets")
async def upload_dataset(file: UploadFile = File(...)) -> Any:
    data = await file.read()
    try:
        return datasets.ingest(file.filename or "dataset.csv", data)
    except datasets.DatasetError as exc:
        return _error(400, exc.code, exc.message)


@router.get("/datasets")
def list_datasets() -> dict:
    return {"datasets": db.list_datasets()}


@router.get("/datasets/{dataset_id}")
def get_dataset(dataset_id: str) -> Any:
    dataset = db.get_dataset(dataset_id)
    if dataset is None:
        return _error(404, "dataset_not_found", f"no dataset '{dataset_id}'")
    return dataset


# --------------------------------------------------------------------------- #
# Rendering
# --------------------------------------------------------------------------- #

@router.post("/figures/render")
def render_figure(req: RenderRequest) -> Any:
    df = _load_dataframe(req.datasetId)
    if df is None:
        return _error(404, "dataset_not_found", f"no dataset '{req.datasetId}'")
    spec = parse_figure_spec(req.spec)
    return {"figure": compile_figure(spec, df)}


# --------------------------------------------------------------------------- #
# AI
# --------------------------------------------------------------------------- #

@router.post("/ai/generate")
def ai_generate(req: GenerateRequest) -> Any:
    summary = db.dataset_summary(req.datasetId)
    if summary is None:
        return _error(404, "dataset_not_found", f"no dataset '{req.datasetId}'")
    provider = build_provider()
    try:
        result = provider.generate(req.prompt, summary)
    except RuntimeError as exc:
        return _error(503, "provider_unavailable", str(exc))
    body = result.to_generate_response()
    body["belowThreshold"] = _below_threshold(result.confidence)
    return body


@router.post("/ai/patch")
def ai_patch(req: PatchRequest) -> Any:
    summary = db.dataset_summary(req.datasetId)
    if summary is None:
        return _error(404, "dataset_not_found", f"no dataset '{req.datasetId}'")
    current = parse_figure_spec(req.spec)
    provider = build_provider()
    try:
        result = provider.patch(req.prompt, current, summary)
    except RuntimeError as exc:
        return _error(503, "provider_unavailable", str(exc))
    body = result.to_patch_response()
    body["belowThreshold"] = _below_threshold(result.confidence)
    return body


# --------------------------------------------------------------------------- #
# Versions
# --------------------------------------------------------------------------- #

@router.post("/projects")
def create_project(req: ProjectRequest) -> dict:
    return db.create_project(req.name)


@router.get("/projects")
def list_projects() -> dict:
    return {"projects": db.list_projects()}


@router.post("/projects/{project_id}/versions")
def create_version(project_id: str, req: VersionRequest) -> Any:
    if db.get_project(project_id) is None:
        return _error(404, "project_not_found", f"no project '{project_id}'")
    spec = parse_figure_spec(req.spec)
    return db.create_version(project_id, req.name, dump_figure_spec(spec))


@router.get("/projects/{project_id}/versions")
def list_versions(project_id: str) -> Any:
    if db.get_project(project_id) is None:
        return _error(404, "project_not_found", f"no project '{project_id}'")
    return {"versions": db.list_versions(project_id)}


@router.get("/versions/{version_id}")
def get_version(version_id: str) -> Any:
    version = db.get_version(version_id)
    if version is None:
        return _error(404, "version_not_found", f"no version '{version_id}'")
    return version


@router.post("/versions/{version_id}/duplicate")
def duplicate_version(version_id: str) -> Any:
    version = db.get_version(version_id)
    if version is None:
        return _error(404, "version_not_found", f"no version '{version_id}'")
    return db.create_version(
        version["projectId"], f"{version['name']} (copy)", version["spec"]
    )


# --------------------------------------------------------------------------- #
# Export
# --------------------------------------------------------------------------- #

@router.post("/export")
def export_figure_endpoint(req: ExportRequest) -> Any:
    df = _load_dataframe(req.datasetId)
    if df is None:
        return _error(404, "dataset_not_found", f"no dataset '{req.datasetId}'")
    spec = parse_figure_spec(req.spec)
    try:
        content, media_type, filename = export.export_figure(
            spec, df, req.format, req.width, req.height, req.scale
        )
    except ExportUnavailable as exc:
        return JSONResponse(
            status_code=501,
            content={"error": "export_unavailable", "format": exc.format},
        )
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --------------------------------------------------------------------------- #
# Application
# --------------------------------------------------------------------------- #

def _format_loc(loc: tuple) -> str:
    parts: list[str] = []
    for item in loc:
        if isinstance(item, int):
            parts[-1] = f"{parts[-1]}[{item}]" if parts else f"[{item}]"
        else:
            parts.append(str(item))
    return ".".join(parts)


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        config.ensure_dirs()
        db.init_db()
        datasets.seed_samples()
        yield

    app = FastAPI(title="FigureLab", version="0.1.0", lifespan=lifespan)

    @app.exception_handler(SpecValidationError)
    async def _spec_error(_request, exc: SpecValidationError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"errors": exc.errors})

    @app.exception_handler(RequestValidationError)
    async def _request_error(_request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"path": _format_loc(err["loc"]), "message": err["msg"]}
            for err in exc.errors()
        ]
        return JSONResponse(status_code=422, content={"errors": errors})

    app.include_router(router)
    return app


app = create_app()
