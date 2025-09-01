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
from functools import reduce
from typing import Any, Dict, List, Optional, Set, Union, TypeVar
import logging

from erdos._vendor.lsprotocol import types


logger = logging.getLogger(__name__)
T = TypeVar("T")


def get_capability(
    client_capabilities: types.ClientCapabilities, field: str, default: Any = None
) -> Any:
    """Check if ClientCapabilities has some nested value without raising
    AttributeError.
    e.g. get_capability('text_document.synchronization.will_save')
    """
    try:
        value = reduce(getattr, field.split("."), client_capabilities)
    except AttributeError:
        return default

    # If we reach the desired leaf value but it's None, return the default.
    return default if value is None else value


class ServerCapabilitiesBuilder:
    """Create `ServerCapabilities` instance depending on builtin and user registered
    features.
    """

    def __init__(
        self,
        client_capabilities: types.ClientCapabilities,
        features: Set[str],
        feature_options: Dict[str, Any],
        commands: List[str],
        text_document_sync_kind: types.TextDocumentSyncKind,
        notebook_document_sync: Optional[types.NotebookDocumentSyncOptions] = None,
    ):
        self.client_capabilities = client_capabilities
        self.features = features
        self.feature_options = feature_options
        self.commands = commands
        self.text_document_sync_kind = text_document_sync_kind
        self.notebook_document_sync = notebook_document_sync

        self.server_cap = types.ServerCapabilities()

    def _provider_options(self, feature: str, default: T) -> Optional[Union[T, Any]]:
        if feature in self.features:
            return self.feature_options.get(feature, default)
        return None

    def _with_text_document_sync(self):
        open_close = (
            types.TEXT_DOCUMENT_DID_OPEN in self.features
            or types.TEXT_DOCUMENT_DID_CLOSE in self.features
        )
        will_save = (
            get_capability(
                self.client_capabilities, "text_document.synchronization.will_save"
            )
            and types.TEXT_DOCUMENT_WILL_SAVE in self.features
        )
        will_save_wait_until = (
            get_capability(
                self.client_capabilities,
                "text_document.synchronization.will_save_wait_until",
            )
            and types.TEXT_DOCUMENT_WILL_SAVE_WAIT_UNTIL in self.features
        )
        if types.TEXT_DOCUMENT_DID_SAVE in self.features:
            save = self.feature_options.get(types.TEXT_DOCUMENT_DID_SAVE, True)
        else:
            save = False

        self.server_cap.text_document_sync = types.TextDocumentSyncOptions(
            open_close=open_close,
            change=self.text_document_sync_kind,
            will_save=will_save,
            will_save_wait_until=will_save_wait_until,
            save=save,
        )

        return self

    def _with_notebook_document_sync(self):
        if self.client_capabilities.notebook_document is None:
            return self

        self.server_cap.notebook_document_sync = self.notebook_document_sync
        return self

    def _with_completion(self):
        value = self._provider_options(
            types.TEXT_DOCUMENT_COMPLETION, default=types.CompletionOptions()
        )
        if value is not None:
            self.server_cap.completion_provider = value
        return self

    def _with_hover(self):
        value = self._provider_options(types.TEXT_DOCUMENT_HOVER, default=True)
        if value is not None:
            self.server_cap.hover_provider = value
        return self

    def _with_signature_help(self):
        value = self._provider_options(
            types.TEXT_DOCUMENT_SIGNATURE_HELP, default=types.SignatureHelpOptions()
        )
        if value is not None:
            self.server_cap.signature_help_provider = value
        return self

    def _with_declaration(self):
        value = self._provider_options(types.TEXT_DOCUMENT_DECLARATION, default=True)
        if value is not None:
            self.server_cap.declaration_provider = value
        return self

    def _with_definition(self):
        value = self._provider_options(types.TEXT_DOCUMENT_DEFINITION, default=True)
        if value is not None:
            self.server_cap.definition_provider = value
        return self

    def _with_type_definition(self):
        value = self._provider_options(
            types.TEXT_DOCUMENT_TYPE_DEFINITION, default=types.TypeDefinitionOptions()
        )
        if value is not None:
            self.server_cap.type_definition_provider = value
        return self

    def _with_inlay_hints(self):
        value = self._provider_options(
            types.TEXT_DOCUMENT_INLAY_HINT, default=types.InlayHintOptions()
        )
        if value is not None:
            value.resolve_provider = types.INLAY_HINT_RESOLVE in self.features
            self.server_cap.inlay_hint_provider = value
        return self

    def _with_implementation(self):
        value = self._provider_options(
            types.TEXT_DOCUMENT_IMPLEMENTATION, default=types.ImplementationOptions()
        )
        if value is not None:
            self.server_cap.implementation_provider = value
        return self

    def _with_references(self):
        value = self._provider_options(types.TEXT_DOCUMENT_REFERENCES, default=True)
        if value is not None:
            self.server_cap.references_provider = value
        return self

    def _with_document_highlight(self):
        value = self._provider_options(
            types.TEXT_DOCUMENT_DOCUMENT_HIGHLIGHT, default=True
        )
        if value is not None:
            self.server_cap.document_highlight_provider = value
        return self

    def _with_document_symbol(self):
        value = self._provider_options(
            types.TEXT_DOCUMENT_DOCUMENT_SYMBOL, default=True
        )
        if value is not None:
            self.server_cap.document_symbol_provider = value
        return self

    def _with_code_action(self):
        value = self._provider_options(types.TEXT_DOCUMENT_CODE_ACTION, default=True)
        if value is not None:
            self.server_cap.code_action_provider = value
        return self

    def _with_code_lens(self):
        value = self._provider_options(
            types.TEXT_DOCUMENT_CODE_LENS, default=types.CodeLensOptions()
        )
        if value is not None:
            self.server_cap.code_lens_provider = value
        return self

    def _with_document_link(self):
        value = self._provider_options(
            types.TEXT_DOCUMENT_DOCUMENT_LINK, default=types.DocumentLinkOptions()
        )
        if value is not None:
            self.server_cap.document_link_provider = value
        return self

    def _with_color(self):
        value = self._provider_options(types.TEXT_DOCUMENT_DOCUMENT_COLOR, default=True)
        if value is not None:
            self.server_cap.color_provider = value
        return self

    def _with_document_formatting(self):
        value = self._provider_options(types.TEXT_DOCUMENT_FORMATTING, default=True)
        if value is not None:
            self.server_cap.document_formatting_provider = value
        return self

    def _with_document_range_formatting(self):
        value = self._provider_options(
            types.TEXT_DOCUMENT_RANGE_FORMATTING, default=True
        )
        if value is not None:
            self.server_cap.document_range_formatting_provider = value
        return self

    def _with_document_on_type_formatting(self):
        value = self._provider_options(
            types.TEXT_DOCUMENT_ON_TYPE_FORMATTING, default=None
        )
        if value is not None:
            self.server_cap.document_on_type_formatting_provider = value
        return self

    def _with_rename(self):
        value = self._provider_options(types.TEXT_DOCUMENT_RENAME, default=True)
        if value is not None:
            self.server_cap.rename_provider = value
        return self

    def _with_folding_range(self):
        value = self._provider_options(types.TEXT_DOCUMENT_FOLDING_RANGE, default=True)
        if value is not None:
            self.server_cap.folding_range_provider = value
        return self

    def _with_execute_command(self):
        self.server_cap.execute_command_provider = types.ExecuteCommandOptions(
            commands=self.commands
        )
        return self

    def _with_selection_range(self):
        value = self._provider_options(
            types.TEXT_DOCUMENT_SELECTION_RANGE, default=True
        )
        if value is not None:
            self.server_cap.selection_range_provider = value
        return self

    def _with_call_hierarchy(self):
        value = self._provider_options(
            types.TEXT_DOCUMENT_PREPARE_CALL_HIERARCHY, default=True
        )
        if value is not None:
            self.server_cap.call_hierarchy_provider = value
        return self

    def _with_type_hierarchy(self):
        value = self._provider_options(
            types.TEXT_DOCUMENT_PREPARE_TYPE_HIERARCHY, default=True
        )
        if value is not None:
            self.server_cap.type_hierarchy_provider = value
        return self

    def _with_semantic_tokens(self):
        providers = [
            types.TEXT_DOCUMENT_SEMANTIC_TOKENS_FULL,
            types.TEXT_DOCUMENT_SEMANTIC_TOKENS_FULL_DELTA,
            types.TEXT_DOCUMENT_SEMANTIC_TOKENS_RANGE,
        ]

        value = None
        for provider in providers:
            value = self._provider_options(provider, default=None)
            if value is not None:
                break

        if value is None:
            return self

        if isinstance(value, types.SemanticTokensRegistrationOptions):
            self.server_cap.semantic_tokens_provider = value
            return self

        full_support: Union[bool, types.SemanticTokensOptionsFullType1] = (
            types.TEXT_DOCUMENT_SEMANTIC_TOKENS_FULL in self.features
        )

        if types.TEXT_DOCUMENT_SEMANTIC_TOKENS_FULL_DELTA in self.features:
            full_support = types.SemanticTokensOptionsFullType1(delta=True)

        options = types.SemanticTokensOptions(
            legend=value,
            full=full_support or None,
            range=types.TEXT_DOCUMENT_SEMANTIC_TOKENS_RANGE in self.features or None,
        )

        if options.full or options.range:
            self.server_cap.semantic_tokens_provider = options

        return self

    def _with_linked_editing_range(self):
        value = self._provider_options(
            types.TEXT_DOCUMENT_LINKED_EDITING_RANGE, default=True
        )
        if value is not None:
            self.server_cap.linked_editing_range_provider = value
        return self

    def _with_moniker(self):
        value = self._provider_options(types.TEXT_DOCUMENT_MONIKER, default=True)
        if value is not None:
            self.server_cap.moniker_provider = value
        return self

    def _with_workspace_symbol(self):
        value = self._provider_options(
            types.WORKSPACE_SYMBOL, default=types.WorkspaceSymbolOptions()
        )
        if value is not None:
            value.resolve_provider = types.WORKSPACE_SYMBOL_RESOLVE in self.features
            self.server_cap.workspace_symbol_provider = value
        return self

    def _with_workspace_capabilities(self):
        # File operations
        file_operations = types.FileOperationOptions()
        operations = [
            (types.WORKSPACE_WILL_CREATE_FILES, "will_create"),
            (types.WORKSPACE_DID_CREATE_FILES, "did_create"),
            (types.WORKSPACE_WILL_DELETE_FILES, "will_delete"),
            (types.WORKSPACE_DID_DELETE_FILES, "did_delete"),
            (types.WORKSPACE_WILL_RENAME_FILES, "will_rename"),
            (types.WORKSPACE_DID_RENAME_FILES, "did_rename"),
        ]

        for method_name, capability_name in operations:
            client_supports_method = get_capability(
                self.client_capabilities, f"workspace.file_operations.{capability_name}"
            )

            if client_supports_method:
                value = self._provider_options(method_name, default=None)
                setattr(file_operations, capability_name, value)

        self.server_cap.workspace = types.ServerCapabilitiesWorkspaceType(
            workspace_folders=types.WorkspaceFoldersServerCapabilities(
                supported=True,
                change_notifications=True,
            ),
            file_operations=file_operations,
        )
        return self

    def _with_diagnostic_provider(self):
        value = self._provider_options(
            types.TEXT_DOCUMENT_DIAGNOSTIC,
            default=types.DiagnosticOptions(
                inter_file_dependencies=False, workspace_diagnostics=False
            ),
        )
        if value is not None:
            value.workspace_diagnostics = types.WORKSPACE_DIAGNOSTIC in self.features
            self.server_cap.diagnostic_provider = value
        return self

    def _with_inline_value_provider(self):
        value = self._provider_options(types.TEXT_DOCUMENT_INLINE_VALUE, default=True)
        if value is not None:
            self.server_cap.inline_value_provider = value
        return self

    def _with_position_encodings(self):
        self.server_cap.position_encoding = types.PositionEncodingKind.Utf16

        general = self.client_capabilities.general
        if general is None:
            return self

        encodings = general.position_encodings
        if encodings is None:
            return self

        if types.PositionEncodingKind.Utf16 in encodings:
            return self

        if types.PositionEncodingKind.Utf32 in encodings:
            self.server_cap.position_encoding = types.PositionEncodingKind.Utf32
            return self

        if types.PositionEncodingKind.Utf8 in encodings:
            self.server_cap.position_encoding = types.PositionEncodingKind.Utf8
            return self

        logger.warning(f"Unknown `PositionEncoding`s: {encodings}")

        return self

    def _build(self):
        return self.server_cap

    def build(self):
        return (
            self._with_text_document_sync()
            ._with_notebook_document_sync()
            ._with_completion()
            ._with_hover()
            ._with_signature_help()
            ._with_declaration()
            ._with_definition()
            ._with_type_definition()
            ._with_inlay_hints()
            ._with_implementation()
            ._with_references()
            ._with_document_highlight()
            ._with_document_symbol()
            ._with_code_action()
            ._with_code_lens()
            ._with_document_link()
            ._with_color()
            ._with_document_formatting()
            ._with_document_range_formatting()
            ._with_document_on_type_formatting()
            ._with_rename()
            ._with_folding_range()
            ._with_execute_command()
            ._with_selection_range()
            ._with_call_hierarchy()
            ._with_type_hierarchy()
            ._with_semantic_tokens()
            ._with_linked_editing_range()
            ._with_moniker()
            ._with_workspace_symbol()
            ._with_workspace_capabilities()
            ._with_diagnostic_provider()
            ._with_inline_value_provider()
            ._with_position_encodings()
            ._build()
        )
