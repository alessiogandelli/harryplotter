"""SQLite persistence for datasets, projects and versions."""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from . import config

_SCHEMA = """
CREATE TABLE IF NOT EXISTS datasets (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    rows INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    columns_json TEXT NOT NULL,
    stats_json TEXT NOT NULL,
    sample_json TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'upload',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS versions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    spec_json TEXT NOT NULL
);
"""


def _connect() -> sqlite3.Connection:
    config.ensure_dirs()
    conn = sqlite3.connect(str(config.db_path()), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.executescript(_SCHEMA)
        # Lightweight migration for databases created before `kind` existed.
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(datasets)")}
        if "kind" not in columns:
            conn.execute(
                "ALTER TABLE datasets ADD COLUMN kind TEXT NOT NULL DEFAULT 'upload'"
            )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------------- #
# Datasets
# --------------------------------------------------------------------------- #

def insert_dataset(
    *,
    id: str,
    filename: str,
    path: str,
    rows: int,
    content_hash: str,
    columns: list[dict],
    stats: dict,
    sample: list[dict],
    kind: str = "upload",
) -> dict:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO datasets "
            "(id, filename, path, rows, content_hash, columns_json, stats_json, sample_json, kind, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                id,
                filename,
                path,
                rows,
                content_hash,
                json.dumps(columns),
                json.dumps(stats),
                json.dumps(sample),
                kind,
                _now(),
            ),
        )
    return get_dataset(id)  # type: ignore[return-value]


def find_dataset_by_content_hash(hash_value: str) -> Optional[dict]:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM datasets WHERE content_hash = ?", (hash_value,)
        ).fetchone()
    return dict(row) if row else None


def list_datasets() -> list[dict]:
    """Newest first, the library view. Lightweight (no sample rows)."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, filename, rows, columns_json, content_hash, kind, created_at "
            "FROM datasets ORDER BY created_at DESC"
        ).fetchall()
    return [
        {
            "id": row["id"],
            "filename": row["filename"],
            "rows": row["rows"],
            "columnCount": len(json.loads(row["columns_json"])),
            "contentHash": row["content_hash"],
            "kind": row["kind"],
            "createdAt": row["created_at"],
        }
        for row in rows
    ]


def get_dataset_row(id: str) -> Optional[dict]:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM datasets WHERE id = ?", (id,)).fetchone()
    return dict(row) if row else None


def get_dataset(id: str) -> Optional[dict]:
    row = get_dataset_row(id)
    if row is None:
        return None
    return _dataset_response(row)


def _dataset_response(row: dict) -> dict:
    return {
        "id": row["id"],
        "filename": row["filename"],
        "rows": row["rows"],
        "contentHash": row["content_hash"],
        "kind": row["kind"],
        "columns": json.loads(row["columns_json"]),
        "stats": json.loads(row["stats_json"]),
        "sample": json.loads(row["sample_json"]),
    }


def dataset_path(id: str) -> Optional[str]:
    row = get_dataset_row(id)
    return row["path"] if row else None


def dataset_summary(id: str) -> Optional[dict]:
    """Schema + statistics + sample, the reduced view given to AI providers."""
    row = get_dataset_row(id)
    if row is None:
        return None
    return {
        "id": row["id"],
        "filename": row["filename"],
        "rows": row["rows"],
        "contentHash": row["content_hash"],
        "columns": json.loads(row["columns_json"]),
        "stats": json.loads(row["stats_json"]),
        "sample": json.loads(row["sample_json"]),
    }


# --------------------------------------------------------------------------- #
# Projects
# --------------------------------------------------------------------------- #

def create_project(name: str) -> dict:
    id = str(uuid.uuid4())
    created_at = _now()
    with _connect() as conn:
        conn.execute(
            "INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)",
            (id, name, created_at),
        )
    return {"id": id, "name": name, "createdAt": created_at}


def list_projects() -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, name, created_at FROM projects ORDER BY created_at"
        ).fetchall()
    return [{"id": r["id"], "name": r["name"], "createdAt": r["created_at"]} for r in rows]


def get_project(id: str) -> Optional[dict]:
    with _connect() as conn:
        row = conn.execute(
            "SELECT id, name, created_at FROM projects WHERE id = ?", (id,)
        ).fetchone()
    return (
        {"id": row["id"], "name": row["name"], "createdAt": row["created_at"]}
        if row
        else None
    )


# --------------------------------------------------------------------------- #
# Versions
# --------------------------------------------------------------------------- #

def create_version(project_id: str, name: str, spec: dict) -> dict:
    id = str(uuid.uuid4())
    created_at = _now()
    with _connect() as conn:
        conn.execute(
            "INSERT INTO versions (id, project_id, name, created_at, spec_json) "
            "VALUES (?, ?, ?, ?, ?)",
            (id, project_id, name, created_at, json.dumps(spec)),
        )
    return {
        "id": id,
        "projectId": project_id,
        "name": name,
        "createdAt": created_at,
        "spec": spec,
    }


def list_versions(project_id: str) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM versions WHERE project_id = ? ORDER BY created_at",
            (project_id,),
        ).fetchall()
    return [_version_response(r) for r in rows]


def get_version(id: str) -> Optional[dict]:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM versions WHERE id = ?", (id,)).fetchone()
    return _version_response(row) if row else None


def _version_response(row: Any) -> dict:
    return {
        "id": row["id"],
        "projectId": row["project_id"],
        "name": row["name"],
        "createdAt": row["created_at"],
        "spec": json.loads(row["spec_json"]),
    }
