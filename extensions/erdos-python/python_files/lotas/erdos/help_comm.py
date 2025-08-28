#
# Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
#

#
# AUTO-GENERATED from help.json; do not edit.
#

# flake8: noqa

# For forward declarations
from __future__ import annotations

import enum
from typing import Any, List, Literal, Optional, Union

from ._vendor.pydantic import BaseModel, Field, StrictBool, StrictFloat, StrictInt, StrictStr

@enum.unique
class ShowHelpKind(str, enum.Enum):
    """
    Possible values for Kind in ShowHelp
    """

    Html = "html"

    Markdown = "markdown"

    Url = "url"


@enum.unique
class HelpBackendRequest(str, enum.Enum):
    """
    An enumeration of all the possible requests that can be sent to the backend help comm.
    """

    # Find and display help topic
    ShowHelpTopic = "show_help_topic"

class ShowHelpTopicParams(BaseModel):
    """
    Searches for help topic and displays if found
    """

    topic: StrictStr = Field(
        description="Help topic identifier",
    )

class ShowHelpTopicRequest(BaseModel):
    """
    Searches for help topic and displays if found
    """

    params: ShowHelpTopicParams = Field(
        description="Parameters to the ShowHelpTopic method",
    )

    method: Literal[HelpBackendRequest.ShowHelpTopic] = Field(
        description="The JSON-RPC method name (show_help_topic)",
    )

    jsonrpc: str = Field(
        default="2.0",        description="The JSON-RPC version specifier",
    )

class HelpBackendMessageContent(BaseModel):
    comm_id: str
    data: ShowHelpTopicRequest
@enum.unique
class HelpFrontendEvent(str, enum.Enum):
    """
    An enumeration of all the possible events that can be sent to the frontend help comm.
    """

    # Display help content
    ShowHelp = "show_help"

class ShowHelpParams(BaseModel):
    """
    Display help content
    """

    content: StrictStr = Field(
        description="Help content to display",
    )

    kind: ShowHelpKind = Field(
        description="Content format type",
    )

    focus: StrictBool = Field(
        description="Focus help pane on display",
    )

ShowHelpTopicParams.update_forward_refs()

ShowHelpTopicRequest.update_forward_refs()

ShowHelpParams.update_forward_refs()

