"""Pydantic models for the FigureSpec (v1) contract.

Source of truth: docs/contract/figure-spec.md. If this file and that document
disagree, the document wins.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

ChartType = Literal[
    "scatter", "line", "bar", "box", "histogram", "violin", "heatmap", "area"
]
ScaleType = Literal["linear", "log"]
TickMode = Literal["auto", "step", "count"]
LegendPosition = Literal["top", "bottom", "left", "right"]
LegendOrientation = Literal["h", "v"]
PaletteName = Literal["default", "scientific", "colorblind", "grayscale"]
TransformOp = Literal["filter", "groupby", "sort", "limit"]
AggFn = Literal["mean", "sum", "median", "min", "max", "count"]

_STRICT = ConfigDict(extra="forbid", populate_by_name=True)


class DatasetRef(BaseModel):
    model_config = _STRICT
    id: str
    contentHash: str


class Series(BaseModel):
    model_config = _STRICT
    name: Optional[str] = None
    x: Optional[str] = None
    y: Optional[str] = None
    color: Optional[str] = None


class AxisStyle(BaseModel):
    model_config = _STRICT
    label: Optional[str] = None
    range: List[Optional[float]] = Field(default_factory=lambda: [None, None])
    scale: ScaleType = "linear"
    reverse: bool = False
    grid: bool = True
    tickMode: TickMode = "auto"
    tickStep: Optional[float] = None
    tickCount: Optional[int] = None
    tickRotation: float = 0

    @field_validator("range")
    @classmethod
    def _range_has_two_ends(cls, value: List[Optional[float]]) -> List[Optional[float]]:
        if len(value) != 2:
            raise ValueError("range must have exactly two elements [min, max]")
        return value


class AxesStyle(BaseModel):
    model_config = _STRICT
    x: AxisStyle = Field(default_factory=AxisStyle)
    y: AxisStyle = Field(default_factory=AxisStyle)


class LegendStyle(BaseModel):
    model_config = _STRICT
    show: bool = True
    position: LegendPosition = "right"
    orientation: LegendOrientation = "v"
    columns: Optional[int] = None
    title: Optional[str] = None
    order: Optional[List[str]] = None
    fontSize: int = 12


class FontStyle(BaseModel):
    model_config = _STRICT
    family: str = "Inter, sans-serif"
    size: int = 12


class MarkerStyle(BaseModel):
    model_config = _STRICT
    size: float = 7
    opacity: float = 0.9
    symbol: str = "circle"


class LineStyle(BaseModel):
    model_config = _STRICT
    width: float = 2


class Margins(BaseModel):
    model_config = _STRICT
    l: float = 80
    r: float = 20
    t: float = 60
    b: float = 60


class FigureSize(BaseModel):
    model_config = _STRICT
    width: float = 900
    height: float = 600


class StyleSpec(BaseModel):
    model_config = _STRICT
    title: Optional[str] = None
    subtitle: Optional[str] = None
    axes: AxesStyle = Field(default_factory=AxesStyle)
    legend: LegendStyle = Field(default_factory=LegendStyle)
    font: FontStyle = Field(default_factory=FontStyle)
    palette: PaletteName = "scientific"
    colorway: Optional[List[str]] = None
    marker: MarkerStyle = Field(default_factory=MarkerStyle)
    line: LineStyle = Field(default_factory=LineStyle)
    background: str = "#ffffff"
    margins: Margins = Field(default_factory=Margins)
    size: FigureSize = Field(default_factory=FigureSize)


class FilterTransform(BaseModel):
    model_config = _STRICT
    op: Literal["filter"]
    column: str
    in_: List[Any] = Field(alias="in")

    def to_payload(self) -> dict:
        return {"op": "filter", "column": self.column, "in": self.in_}


class GroupbyTransform(BaseModel):
    model_config = _STRICT
    op: Literal["groupby"]
    by: List[str]
    agg: dict[str, AggFn]

    @field_validator("by")
    @classmethod
    def _by_not_empty(cls, value: List[str]) -> List[str]:
        if not value:
            raise ValueError("groupby requires at least one 'by' column")
        return value

    @field_validator("agg")
    @classmethod
    def _agg_not_empty(cls, value: dict) -> dict:
        if not value:
            raise ValueError("groupby requires at least one aggregation")
        return value


class SortTransform(BaseModel):
    model_config = _STRICT
    op: Literal["sort"]
    column: str
    desc: bool = False


class LimitTransform(BaseModel):
    model_config = _STRICT
    op: Literal["limit"]
    n: int = Field(ge=0)


Transform = Annotated[
    Union[FilterTransform, GroupbyTransform, SortTransform, LimitTransform],
    Field(discriminator="op"),
]


class FigureLayer(BaseModel):
    model_config = _STRICT
    chartType: ChartType
    series: List[Series]


class MetaSpec(BaseModel):
    model_config = _STRICT
    modelVersion: Optional[str] = None
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class FigureSpec(BaseModel):
    model_config = _STRICT
    version: Literal[1] = 1
    dataset: Optional[DatasetRef] = None
    transforms: List[Transform] = Field(default_factory=list)
    figure: FigureLayer
    style: StyleSpec = Field(default_factory=StyleSpec)
    meta: MetaSpec = Field(default_factory=MetaSpec)


def _format_loc(loc: tuple) -> str:
    parts: list[str] = []
    for item in loc:
        if isinstance(item, int):
            if parts:
                parts[-1] = f"{parts[-1]}[{item}]"
            else:
                parts.append(f"[{item}]")
        else:
            parts.append(str(item))
    return ".".join(parts)


def parse_figure_spec(data: Any) -> FigureSpec:
    """Validate raw data into a FigureSpec, raising SpecValidationError."""
    from ..errors import SpecValidationError

    try:
        return FigureSpec.model_validate(data)
    except ValidationError as exc:
        errors = [
            {"path": _format_loc(err["loc"]), "message": err["msg"]}
            for err in exc.errors()
        ]
        raise SpecValidationError(errors) from exc


def dump_figure_spec(spec: FigureSpec) -> dict:
    return spec.model_dump(mode="json", by_alias=True)
