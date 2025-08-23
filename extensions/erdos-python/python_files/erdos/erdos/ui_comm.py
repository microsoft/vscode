#
# Copyright (C) 2025 Lotas Inc. All rights reserved.
#

#
# AUTO-GENERATED from ui.json; do not edit.
#

# flake8: noqa

# For forward declarations
from __future__ import annotations

import enum
from typing import Any, List, Literal, Optional, Union

from ._vendor.pydantic import BaseModel, Field, StrictBool, StrictFloat, StrictInt, StrictStr

from .plot_comm import PlotRenderSettings

Param = Any
CallMethodResult = Any
class GetStateResult(BaseModel):
    """
    Runtime state information
    """

    busy: StrictBool = Field(
        description="Runtime busy status",
    )

    session_id: StrictStr = Field(
        description="Current session identifier",
    )



class Position(BaseModel):
    """
    Line and character position
    """

    character: StrictInt = Field(
        description="Zero-based character offset",
    )

    line: StrictInt = Field(
        description="Zero-based line number",
    )



class Range(BaseModel):
    """
    Text selection range
    """

    start: Position = Field(
        description="Range start position",
    )

    end: Position = Field(
        description="Range end position",
    )



@enum.unique
class UiBackendRequest(str, enum.Enum):
    """
    An enumeration of all the possible requests that can be sent to the backend ui comm.
    """

    # Plot render settings changed
    DidChangePlotsRenderSettings = "did_change_plots_render_settings"

    # Execute interpreter method
    CallMethod = "call_method"

    # Retrieve runtime state
    GetState = "get_state"

class DidChangePlotsRenderSettingsParams(BaseModel):
    """
    Notifies that plot rendering settings have changed
    """

    settings: PlotRenderSettings = Field(
        description="Updated plot render settings",
    )

class DidChangePlotsRenderSettingsRequest(BaseModel):
    """
    Notifies that plot rendering settings have changed
    """

    params: DidChangePlotsRenderSettingsParams = Field(
        description="Parameters to the DidChangePlotsRenderSettings method",
    )

    method: Literal[UiBackendRequest.DidChangePlotsRenderSettings] = Field(
        description="The JSON-RPC method name (did_change_plots_render_settings)",
    )

    jsonrpc: str = Field(
        default="2.0",        description="The JSON-RPC version specifier",
    )

class CallMethodParams(BaseModel):
    """
    Calls runtime-specific method with dynamic parameters
    """

    method: StrictStr = Field(
        description="Target method name",
    )

    params: List[Param] = Field(
        description="Method parameters",
    )

class CallMethodRequest(BaseModel):
    """
    Calls runtime-specific method with dynamic parameters
    """

    params: CallMethodParams = Field(
        description="Parameters to the CallMethod method",
    )

    method: Literal[UiBackendRequest.CallMethod] = Field(
        description="The JSON-RPC method name (call_method)",
    )

    jsonrpc: str = Field(
        default="2.0",        description="The JSON-RPC version specifier",
    )

class GetStateRequest(BaseModel):
    """
    Gets current runtime configuration and status
    """

    method: Literal[UiBackendRequest.GetState] = Field(
        description="The JSON-RPC method name (get_state)",
    )

    jsonrpc: str = Field(
        default="2.0",        description="The JSON-RPC version specifier",
    )

class UiBackendMessageContent(BaseModel):
    comm_id: str
    data: Union[
        DidChangePlotsRenderSettingsRequest,
        CallMethodRequest,
        GetStateRequest,
    ] = Field(..., discriminator="method")

@enum.unique
class UiFrontendEvent(str, enum.Enum):
    """
    An enumeration of all the possible events that can be sent to the frontend ui comm.
    """

    # Runtime busy state changed
    Busy = "busy"

    # Clear console output
    ClearConsole = "clear_console"

    # Open file in editor
    OpenEditor = "open_editor"

    # Display user message
    ShowMessage = "show_message"

    # Runtime prompt state changed
    PromptState = "prompt_state"

    # Working directory changed
    WorkingDirectory = "working_directory"

    # Open workspace request
    OpenWorkspace = "open_workspace"

    # Set editor cursor selections
    SetEditorSelections = "set_editor_selections"

    # Display HTML file
    ShowHtmlFile = "show_html_file"

    # Open with system application
    OpenWithSystem = "open_with_system"

    # Clear webview cache
    ClearWebviewPreloads = "clear_webview_preloads"

    # Display URL in viewer
    ShowUrl = "show_url"

class BusyParams(BaseModel):
    """
    Runtime busy state changed
    """

    busy: StrictBool = Field(
        description="Computation engine busy status",
    )

class OpenEditorParams(BaseModel):
    """
    Open file in editor
    """

    file: StrictStr = Field(
        description="File path to open",
    )

    line: StrictInt = Field(
        description="Target line number",
    )

    column: StrictInt = Field(
        description="Target column position",
    )

class NewDocumentParams(BaseModel):
    """
    Create new document
    """

    contents: StrictStr = Field(
        description="Initial document text",
    )

    language_id: StrictStr = Field(
        description="Document language mode",
    )

class ShowMessageParams(BaseModel):
    """
    Display user message
    """

    message: StrictStr = Field(
        description="Message text to display",
    )

class ExecuteCodeParams(BaseModel):
    """
    Execute code snippet
    """

    language_id: StrictStr = Field(
        description="Code language identifier",
    )

    code: StrictStr = Field(
        description="Code text to execute",
    )

    focus: StrictBool = Field(
        description="Focus console on execution",
    )

    allow_incomplete: StrictBool = Field(
        description="Allow incomplete code blocks",
    )

class PromptStateParams(BaseModel):
    """
    Runtime prompt state changed
    """

    input_prompt: StrictStr = Field(
        description="Primary input prompt",
    )

    continuation_prompt: StrictStr = Field(
        description="Continuation prompt for incomplete input",
    )

class WorkingDirectoryParams(BaseModel):
    """
    Working directory changed
    """

    directory: StrictStr = Field(
        description="New working directory path",
    )

class OpenWorkspaceParams(BaseModel):
    """
    Open workspace request
    """

    path: StrictStr = Field(
        description="Workspace path to open",
    )

    new_window: StrictBool = Field(
        description="Open in new window",
    )

class SetEditorSelectionsParams(BaseModel):
    """
    Set editor cursor selections
    """

    selections: List[Range] = Field(
        description="Selection ranges to set",
    )

class ShowHtmlFileParams(BaseModel):
    """
    Display HTML file
    """

    path: StrictStr = Field(
        description="HTML file path",
    )

    title: StrictStr = Field(
        description="Display title",
    )

    is_plot: StrictBool = Field(
        description="Whether file contains plot",
    )

    height: StrictInt = Field(
        description="Viewer height in pixels",
    )

class OpenWithSystemParams(BaseModel):
    """
    Open with system application
    """

    path: StrictStr = Field(
        description="File path to open",
    )

class ShowUrlParams(BaseModel):
    """
    Display URL in viewer
    """

    url: StrictStr = Field(
        description="URL to display",
    )

GetStateResult.update_forward_refs()

Position.update_forward_refs()

Range.update_forward_refs()

DidChangePlotsRenderSettingsParams.update_forward_refs()

DidChangePlotsRenderSettingsRequest.update_forward_refs()

CallMethodParams.update_forward_refs()

CallMethodRequest.update_forward_refs()

GetStateRequest.update_forward_refs()

BusyParams.update_forward_refs()

OpenEditorParams.update_forward_refs()

NewDocumentParams.update_forward_refs()

ShowMessageParams.update_forward_refs()

ExecuteCodeParams.update_forward_refs()

PromptStateParams.update_forward_refs()

WorkingDirectoryParams.update_forward_refs()

OpenWorkspaceParams.update_forward_refs()

SetEditorSelectionsParams.update_forward_refs()

ShowHtmlFileParams.update_forward_refs()

OpenWithSystemParams.update_forward_refs()

ShowUrlParams.update_forward_refs()

