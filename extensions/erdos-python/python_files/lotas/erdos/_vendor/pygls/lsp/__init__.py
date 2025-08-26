############################################################################
# Copyright(c) Open Law Library. All rights reserved.                      #
# See ThirdPartyNotices.txt in the project root for additional notices.    #
#                                                                          #
# Licensed under the Apache License, Version 2.0 (the "License")           #
# you may not use this file except in compliance with the License.         #
# You may obtain a copy of the License at                                  #
#                                                                          #
#     http: // www.apache.org/licenses/LICENSE-2.0                         #
#                                                                          #
# Unless required by applicable law or agreed to in writing, software      #
# distributed under the License is distributed on an "AS IS" BASIS,        #
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. #
# See the License for the specific language governing permissions and      #
# limitations under the License.                                           #
############################################################################
import lotas.erdos._vendor.cattrs
from typing import Any, Callable, List, Optional, Union

from lotas.erdos._vendor.lsprotocol.types import (
    ALL_TYPES_MAP,
    METHOD_TO_TYPES,
    TEXT_DOCUMENT_DID_SAVE,
    TEXT_DOCUMENT_SEMANTIC_TOKENS_FULL,
    TEXT_DOCUMENT_SEMANTIC_TOKENS_FULL_DELTA,
    TEXT_DOCUMENT_SEMANTIC_TOKENS_RANGE,
    WORKSPACE_DID_CREATE_FILES,
    WORKSPACE_DID_DELETE_FILES,
    WORKSPACE_DID_RENAME_FILES,
    WORKSPACE_WILL_CREATE_FILES,
    WORKSPACE_WILL_DELETE_FILES,
    WORKSPACE_WILL_RENAME_FILES,
    FileOperationRegistrationOptions,
    SaveOptions,
    SemanticTokensLegend,
    SemanticTokensRegistrationOptions,
    ShowDocumentResult,
)

from lotas.erdos._vendor.pygls.exceptions import MethodTypeNotRegisteredError

ConfigCallbackType = Callable[[List[Any]], None]
ShowDocumentCallbackType = Callable[[ShowDocumentResult], None]

METHOD_TO_OPTIONS = {
    TEXT_DOCUMENT_DID_SAVE: SaveOptions,
    TEXT_DOCUMENT_SEMANTIC_TOKENS_FULL: Union[
        SemanticTokensLegend, SemanticTokensRegistrationOptions
    ],
    TEXT_DOCUMENT_SEMANTIC_TOKENS_FULL_DELTA: Union[
        SemanticTokensLegend, SemanticTokensRegistrationOptions
    ],
    TEXT_DOCUMENT_SEMANTIC_TOKENS_RANGE: Union[
        SemanticTokensLegend, SemanticTokensRegistrationOptions
    ],
    WORKSPACE_DID_CREATE_FILES: FileOperationRegistrationOptions,
    WORKSPACE_DID_DELETE_FILES: FileOperationRegistrationOptions,
    WORKSPACE_DID_RENAME_FILES: FileOperationRegistrationOptions,
    WORKSPACE_WILL_CREATE_FILES: FileOperationRegistrationOptions,
    WORKSPACE_WILL_DELETE_FILES: FileOperationRegistrationOptions,
    WORKSPACE_WILL_RENAME_FILES: FileOperationRegistrationOptions,
}


def get_method_registration_options_type(
    method_name, lsp_methods_map=METHOD_TO_TYPES
) -> Optional[Any]:
    """The type corresponding with a method's options when dynamically registering
    capability for it."""

    try:
        return lsp_methods_map[method_name][3]
    except KeyError:
        raise MethodTypeNotRegisteredError(method_name)


def get_method_options_type(
    method_name, lsp_options_map=METHOD_TO_OPTIONS, lsp_methods_map=METHOD_TO_TYPES
) -> Optional[Any]:
    """Return the type corresponding with a method's ``ServerCapabilities`` fields.

    In the majority of cases this simply means returning the ``<MethodName>Options``
    type, which we can easily derive from the method's
    ``<MethodName>RegistrationOptions`` type.

    However, where the options are more involved (such as semantic tokens) and
    ``pygls`` does some extra work to help derive the options for the user the type
    has to be provided via the ``lsp_options_map``

    Arguments:
        method_name:
            The lsp method name to retrieve the options for

        lsp_options_map:
            The map used to override the default options type finding behavior

        lsp_methods_map:
            The standard map used to look up the various method types.
    """

    options_type = lsp_options_map.get(method_name, None)
    if options_type is not None:
        return options_type

    registration_type = get_method_registration_options_type(
        method_name, lsp_methods_map
    )
    if registration_type is None:
        return None

    type_name = registration_type.__name__.replace("Registration", "")
    options_type = ALL_TYPES_MAP.get(type_name, None)

    if options_type is None:
        raise MethodTypeNotRegisteredError(method_name)

    return options_type


def get_method_params_type(method_name, lsp_methods_map=METHOD_TO_TYPES):
    try:
        return lsp_methods_map[method_name][2]
    except KeyError:
        raise MethodTypeNotRegisteredError(method_name)


def get_method_return_type(method_name, lsp_methods_map=METHOD_TO_TYPES):
    try:
        return lsp_methods_map[method_name][1]
    except KeyError:
        raise MethodTypeNotRegisteredError(method_name)


def is_instance(cv: lotas.erdos._vendor.cattrs.Converter, o, t):
    try:
        cv.unstructure(o, t)
        return True
    except TypeError:
        return False
