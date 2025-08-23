#
# Copyright (C) 2025 Lotas Inc. All rights reserved.
#

#
# AUTO-GENERATED from plot.json; do not edit.
#

# flake8: noqa

# For forward declarations
from __future__ import annotations

import enum
from typing import Any, List, Literal, Optional, Union

from ._vendor.pydantic import BaseModel, Field, StrictBool, StrictFloat, StrictInt, StrictStr

@enum.unique
class RenderFormat(str, enum.Enum):
    """
    Possible values for Format in Render
    """

    Png = "png"

    Svg = "svg"

    Pdf = "pdf"

    Jpeg = "jpeg"


@enum.unique
class PlotUnit(str, enum.Enum):
    """
    Possible values for PlotUnit
    """

    Pixels = "pixels"

    Inches = "inches"

    Cm = "cm"


@enum.unique
class PlotRenderFormat(str, enum.Enum):
    """
    Possible values for PlotRenderFormat
    """

    Png = "png"

    Jpeg = "jpeg"

    Svg = "svg"

    Pdf = "pdf"

    Tiff = "tiff"


class IntrinsicSize(BaseModel):
    """
    Natural plot dimensions
    """

    width: Union[StrictInt, StrictFloat] = Field(
        description="Plot width",
    )

    height: Union[StrictInt, StrictFloat] = Field(
        description="Plot height",
    )

    unit: PlotUnit = Field(
        description="Dimension unit",
    )

    source: StrictStr = Field(
        description="Size source identifier",
    )



class RenderResult(BaseModel):
    """
    Rendered plot data
    """

    data: StrictStr = Field(
        description="Base64 encoded plot",
    )

    mime_type: StrictStr = Field(
        description="Content MIME type",
    )



class PlotSize(BaseModel):
    """
    Plot size specification
    """

    width: Union[StrictInt, StrictFloat] = Field(
        description="Width value",
    )

    height: Union[StrictInt, StrictFloat] = Field(
        description="Height value",
    )

    unit: PlotUnit = Field(
        description="Unit of measurement",
    )



class PlotRenderSettings(BaseModel):
    """
    Settings for plot rendering
    """

    size: PlotSize = Field(
        description="Plot size for rendering",
    )

    pixel_ratio: Union[StrictInt, StrictFloat] = Field(
        description="Display device pixel ratio",
    )

    format: PlotRenderFormat = Field(
        description="Plot render format",
    )



@enum.unique
class PlotBackendRequest(str, enum.Enum):
    """
    An enumeration of all the possible requests that can be sent to the backend plot comm.
    """

    # Get plot's natural size
    GetIntrinsicSize = "get_intrinsic_size"

    # Render plot output
    Render = "render"

class GetIntrinsicSizeRequest(BaseModel):
    """
    Returns plot size without constraints
    """

    method: Literal[PlotBackendRequest.GetIntrinsicSize] = Field(
        description="The JSON-RPC method name (get_intrinsic_size)",
    )

    jsonrpc: str = Field(
        default="2.0",        description="The JSON-RPC version specifier",
    )

class RenderParams(BaseModel):
    """
    Generates plot in specified format
    """

    size: Optional[PlotSize] = Field(
        default=None,
        description="Requested plot size",
    )

    pixel_ratio: Optional[Union[StrictInt, StrictFloat]] = Field(
        default=None,
        description="Device pixel ratio",
    )

    format: RenderFormat = Field(
        description="Output format",
    )

class RenderRequest(BaseModel):
    """
    Generates plot in specified format
    """

    params: RenderParams = Field(
        description="Parameters to the Render method",
    )

    method: Literal[PlotBackendRequest.Render] = Field(
        description="The JSON-RPC method name (render)",
    )

    jsonrpc: str = Field(
        default="2.0",        description="The JSON-RPC version specifier",
    )

class PlotBackendMessageContent(BaseModel):
    comm_id: str
    data: Union[
        GetIntrinsicSizeRequest,
        RenderRequest,
    ] = Field(..., discriminator="method")

@enum.unique
class PlotFrontendEvent(str, enum.Enum):
    """
    An enumeration of all the possible events that can be sent to the frontend plot comm.
    """

    # Display new plot
    ShowPlot = "show_plot"

    # Update existing plot
    UpdatePlot = "update_plot"

    # Clear all plots
    ClearPlots = "clear_plots"

class ShowPlotParams(BaseModel):
    """
    Display new plot
    """

    id: StrictStr = Field(
        description="Unique plot identifier",
    )

    parent_id: Optional[StrictStr] = Field(
        description="Parent plot identifier for updates",
    )

    data: StrictStr = Field(
        description="Plot content data",
    )

    mime_type: StrictStr = Field(
        description="Content MIME type",
    )

class UpdatePlotParams(BaseModel):
    """
    Update existing plot
    """

    id: StrictStr = Field(
        description="Plot identifier to update",
    )

    data: StrictStr = Field(
        description="New plot data",
    )

    mime_type: StrictStr = Field(
        description="Updated content type",
    )

IntrinsicSize.update_forward_refs()

RenderResult.update_forward_refs()

PlotSize.update_forward_refs()

PlotRenderSettings.update_forward_refs()

GetIntrinsicSizeRequest.update_forward_refs()

RenderParams.update_forward_refs()

RenderRequest.update_forward_refs()

ShowPlotParams.update_forward_refs()

UpdatePlotParams.update_forward_refs()

