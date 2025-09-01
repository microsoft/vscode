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
from __future__ import annotations
import asyncio
import json
import logging
import sys
from concurrent.futures import Future
from functools import lru_cache
from itertools import zip_longest
from typing import (
    Callable,
    List,
    Optional,
    Type,
    TypeVar,
    Union,
)


from erdos._vendor.pygls.capabilities import ServerCapabilitiesBuilder
from erdos._vendor.pygls.lsp import ConfigCallbackType, ShowDocumentCallbackType
from erdos._vendor.lsprotocol.types import (
    CLIENT_REGISTER_CAPABILITY,
    CLIENT_UNREGISTER_CAPABILITY,
    EXIT,
    INITIALIZE,
    INITIALIZED,
    METHOD_TO_TYPES,
    NOTEBOOK_DOCUMENT_DID_CHANGE,
    NOTEBOOK_DOCUMENT_DID_CLOSE,
    NOTEBOOK_DOCUMENT_DID_OPEN,
    LOG_TRACE,
    SET_TRACE,
    SHUTDOWN,
    TEXT_DOCUMENT_DID_CHANGE,
    TEXT_DOCUMENT_DID_CLOSE,
    TEXT_DOCUMENT_DID_OPEN,
    TEXT_DOCUMENT_PUBLISH_DIAGNOSTICS,
    WINDOW_LOG_MESSAGE,
    WINDOW_SHOW_DOCUMENT,
    WINDOW_SHOW_MESSAGE,
    WINDOW_WORK_DONE_PROGRESS_CANCEL,
    WORKSPACE_APPLY_EDIT,
    WORKSPACE_CONFIGURATION,
    WORKSPACE_DID_CHANGE_WORKSPACE_FOLDERS,
    WORKSPACE_EXECUTE_COMMAND,
    WORKSPACE_SEMANTIC_TOKENS_REFRESH,
)
from erdos._vendor.lsprotocol.types import (
    ApplyWorkspaceEditParams,
    Diagnostic,
    DidChangeNotebookDocumentParams,
    DidChangeTextDocumentParams,
    DidChangeWorkspaceFoldersParams,
    DidCloseNotebookDocumentParams,
    DidCloseTextDocumentParams,
    DidOpenNotebookDocumentParams,
    DidOpenTextDocumentParams,
    ExecuteCommandParams,
    InitializeParams,
    InitializeResult,
    LogMessageParams,
    LogTraceParams,
    MessageType,
    PublishDiagnosticsParams,
    RegistrationParams,
    SetTraceParams,
    ShowDocumentParams,
    ShowMessageParams,
    TraceValues,
    UnregistrationParams,
    WorkspaceApplyEditResponse,
    WorkspaceEdit,
    InitializeResultServerInfoType,
    WorkspaceConfigurationParams,
    WorkDoneProgressCancelParams,
)
from erdos._vendor.pygls.protocol.json_rpc import JsonRPCProtocol
from erdos._vendor.pygls.protocol.lsp_meta import LSPMeta
from erdos._vendor.pygls.uris import from_fs_path
from erdos._vendor.pygls.workspace import Workspace


F = TypeVar("F", bound=Callable)

logger = logging.getLogger(__name__)


def lsp_method(method_name: str) -> Callable[[F], F]:
    def decorator(f: F) -> F:
        f.method_name = method_name  # type: ignore[attr-defined]
        return f

    return decorator


class LanguageServerProtocol(JsonRPCProtocol, metaclass=LSPMeta):
    """A class that represents language server protocol.

    It contains implementations for generic LSP features.

    Attributes:
        workspace(Workspace): In memory workspace
    """

    def __init__(self, server, converter):
        super().__init__(server, converter)

        self._workspace: Optional[Workspace] = None
        self.trace = None

        from erdos._vendor.pygls.progress import Progress

        self.progress = Progress(self)

        self.server_info = InitializeResultServerInfoType(
            name=server.name,
            version=server.version,
        )

        self._register_builtin_features()

    def _register_builtin_features(self):
        """Registers generic LSP features from this class."""
        for name in dir(self):
            if name in {"workspace"}:
                continue

            attr = getattr(self, name)
            if callable(attr) and hasattr(attr, "method_name"):
                self.fm.add_builtin_feature(attr.method_name, attr)

    @property
    def workspace(self) -> Workspace:
        if self._workspace is None:
            raise RuntimeError(
                "The workspace is not available - has the server been initialized?"
            )

        return self._workspace

    @lru_cache()
    def get_message_type(self, method: str) -> Optional[Type]:
        """Return LSP type definitions, as provided by `lsprotocol`"""
        return METHOD_TO_TYPES.get(method, (None,))[0]

    @lru_cache()
    def get_result_type(self, method: str) -> Optional[Type]:
        return METHOD_TO_TYPES.get(method, (None, None))[1]

    def apply_edit(
        self, edit: WorkspaceEdit, label: Optional[str] = None
    ) -> WorkspaceApplyEditResponse:
        """Sends apply edit request to the client."""
        return self.send_request(
            WORKSPACE_APPLY_EDIT, ApplyWorkspaceEditParams(edit=edit, label=label)
        )

    def apply_edit_async(
        self, edit: WorkspaceEdit, label: Optional[str] = None
    ) -> WorkspaceApplyEditResponse:
        """Sends apply edit request to the client. Should be called with `await`"""
        return self.send_request_async(
            WORKSPACE_APPLY_EDIT, ApplyWorkspaceEditParams(edit=edit, label=label)
        )

    @lsp_method(EXIT)
    def lsp_exit(self, *args) -> None:
        """Stops the server process."""
        if self.transport is not None:
            self.transport.close()

        sys.exit(0 if self._shutdown else 1)

    @lsp_method(INITIALIZE)
    def lsp_initialize(self, params: InitializeParams) -> InitializeResult:
        """Method that initializes language server.
        It will compute and return server capabilities based on
        registered features.
        """
        logger.info("Language server initialized %s", params)

        self._server.process_id = params.process_id

        text_document_sync_kind = self._server._text_document_sync_kind
        notebook_document_sync = self._server._notebook_document_sync

        # Initialize server capabilities
        self.client_capabilities = params.capabilities
        self.server_capabilities = ServerCapabilitiesBuilder(
            self.client_capabilities,
            set({**self.fm.features, **self.fm.builtin_features}.keys()),
            self.fm.feature_options,
            list(self.fm.commands.keys()),
            text_document_sync_kind,
            notebook_document_sync,
        ).build()
        logger.debug(
            "Server capabilities: %s",
            json.dumps(self.server_capabilities, default=self._serialize_message),
        )

        root_path = params.root_path
        root_uri = params.root_uri
        if root_path is not None and root_uri is None:
            root_uri = from_fs_path(root_path)

        # Initialize the workspace
        workspace_folders = params.workspace_folders or []
        self._workspace = Workspace(
            root_uri,
            text_document_sync_kind,
            workspace_folders,
            self.server_capabilities.position_encoding,
        )

        self.trace = TraceValues.Off

        return InitializeResult(
            capabilities=self.server_capabilities,
            server_info=self.server_info,
        )

    @lsp_method(INITIALIZED)
    def lsp_initialized(self, *args) -> None:
        """Notification received when client and server are connected."""
        pass

    @lsp_method(SHUTDOWN)
    def lsp_shutdown(self, *args) -> None:
        """Request from client which asks server to shutdown."""
        for future in self._request_futures.values():
            future.cancel()

        self._shutdown = True
        return None

    @lsp_method(TEXT_DOCUMENT_DID_CHANGE)
    def lsp_text_document__did_change(
        self, params: DidChangeTextDocumentParams
    ) -> None:
        """Updates document's content.
        (Incremental(from server capabilities); not configurable for now)
        """
        for change in params.content_changes:
            self.workspace.update_text_document(params.text_document, change)

    @lsp_method(TEXT_DOCUMENT_DID_CLOSE)
    def lsp_text_document__did_close(self, params: DidCloseTextDocumentParams) -> None:
        """Removes document from workspace."""
        self.workspace.remove_text_document(params.text_document.uri)

    @lsp_method(TEXT_DOCUMENT_DID_OPEN)
    def lsp_text_document__did_open(self, params: DidOpenTextDocumentParams) -> None:
        """Puts document to the workspace."""
        self.workspace.put_text_document(params.text_document)

    @lsp_method(NOTEBOOK_DOCUMENT_DID_OPEN)
    def lsp_notebook_document__did_open(
        self, params: DidOpenNotebookDocumentParams
    ) -> None:
        """Put a notebook document into the workspace"""
        self.workspace.put_notebook_document(params)

    @lsp_method(NOTEBOOK_DOCUMENT_DID_CHANGE)
    def lsp_notebook_document__did_change(
        self, params: DidChangeNotebookDocumentParams
    ) -> None:
        """Update a notebook's contents"""
        self.workspace.update_notebook_document(params)

    @lsp_method(NOTEBOOK_DOCUMENT_DID_CLOSE)
    def lsp_notebook_document__did_close(
        self, params: DidCloseNotebookDocumentParams
    ) -> None:
        """Remove a notebook document from the workspace."""
        self.workspace.remove_notebook_document(params)

    @lsp_method(SET_TRACE)
    def lsp_set_trace(self, params: SetTraceParams) -> None:
        """Changes server trace value."""
        self.trace = params.value

    @lsp_method(WORKSPACE_DID_CHANGE_WORKSPACE_FOLDERS)
    def lsp_workspace__did_change_workspace_folders(
        self, params: DidChangeWorkspaceFoldersParams
    ) -> None:
        """Adds/Removes folders from the workspace."""
        logger.info("Workspace folders changed: %s", params)

        added_folders = params.event.added or []
        removed_folders = params.event.removed or []

        for f_add, f_remove in zip_longest(added_folders, removed_folders):
            if f_add:
                self.workspace.add_folder(f_add)
            if f_remove:
                self.workspace.remove_folder(f_remove.uri)

    @lsp_method(WORKSPACE_EXECUTE_COMMAND)
    def lsp_workspace__execute_command(
        self, params: ExecuteCommandParams, msg_id: str
    ) -> None:
        """Executes commands with passed arguments and returns a value."""
        cmd_handler = self.fm.commands[params.command]
        self._execute_request(msg_id, cmd_handler, params.arguments)

    @lsp_method(WINDOW_WORK_DONE_PROGRESS_CANCEL)
    def lsp_work_done_progress_cancel(
        self, params: WorkDoneProgressCancelParams
    ) -> None:
        """Received a progress cancellation from client."""
        future = self.progress.tokens.get(params.token)
        if future is None:
            logger.warning(
                "Ignoring work done progress cancel for unknown token %s", params.token
            )
        else:
            future.cancel()

    def get_configuration(
        self,
        params: WorkspaceConfigurationParams,
        callback: Optional[ConfigCallbackType] = None,
    ) -> Future:
        """Sends configuration request to the client.

        Args:
            params(WorkspaceConfigurationParams): WorkspaceConfigurationParams from lsp specs
            callback(callable): Callabe which will be called after
                                response from the client is received
        Returns:
            concurrent.futures.Future object that will be resolved once a
            response has been received
        """
        return self.send_request(WORKSPACE_CONFIGURATION, params, callback)

    def get_configuration_async(
        self, params: WorkspaceConfigurationParams
    ) -> asyncio.Future:
        """Calls `get_configuration` method but designed to use with coroutines

        Args:
            params(WorkspaceConfigurationParams): WorkspaceConfigurationParams from lsp specs
        Returns:
            asyncio.Future that can be awaited
        """
        return asyncio.wrap_future(self.get_configuration(params))

    def log_trace(self, message: str, verbose: Optional[str] = None) -> None:
        """Sends trace notification to the client."""
        if self.trace == TraceValues.Off:
            return

        params = LogTraceParams(message=message)
        if verbose and self.trace == TraceValues.Verbose:
            params.verbose = verbose

        self.notify(LOG_TRACE, params)

    def _publish_diagnostics_deprecator(
        self,
        params_or_uri: Union[str, PublishDiagnosticsParams],
        diagnostics: Optional[List[Diagnostic]],
        version: Optional[int],
        **kwargs,
    ) -> PublishDiagnosticsParams:
        if isinstance(params_or_uri, str):
            message = "DEPRECATION: "
            "`publish_diagnostics("
            "self, doc_uri: str, diagnostics: List[Diagnostic], version: Optional[int] = None)`"
            "will be replaced with `publish_diagnostics(self, params: PublishDiagnosticsParams)`"
            logging.warning(message)

            params = self._construct_publish_diagnostic_type(
                params_or_uri, diagnostics, version, **kwargs
            )
        else:
            params = params_or_uri
        return params

    def _construct_publish_diagnostic_type(
        self,
        uri: str,
        diagnostics: Optional[List[Diagnostic]],
        version: Optional[int],
        **kwargs,
    ) -> PublishDiagnosticsParams:
        if diagnostics is None:
            diagnostics = []

        args = {
            **{"uri": uri, "diagnostics": diagnostics, "version": version},
            **kwargs,
        }

        params = PublishDiagnosticsParams(**args)  # type:ignore
        return params

    def publish_diagnostics(
        self,
        params_or_uri: Union[str, PublishDiagnosticsParams],
        diagnostics: Optional[List[Diagnostic]] = None,
        version: Optional[int] = None,
        **kwargs,
    ):
        """Sends diagnostic notification to the client.

        .. deprecated:: 1.0.1

           Passing ``(uri, diagnostics, version)`` as arguments is deprecated.
           Pass an instance of :class:`~lsprotocol.types.PublishDiagnosticParams`
           instead.

        Parameters
        ----------
        params_or_uri
           The :class:`~lsprotocol.types.PublishDiagnosticParams` to send to the client.

        diagnostics
           *Deprecated*. The diagnostics to publish

        version
           *Deprecated*: The version number
        """
        params = self._publish_diagnostics_deprecator(
            params_or_uri, diagnostics, version, **kwargs
        )
        self.notify(TEXT_DOCUMENT_PUBLISH_DIAGNOSTICS, params)

    def register_capability(
        self, params: RegistrationParams, callback: Optional[Callable[[], None]] = None
    ) -> Future:
        """Register a new capability on the client.

        Args:
            params(RegistrationParams): RegistrationParams from lsp specs
            callback(callable): Callabe which will be called after
                                response from the client is received
        Returns:
            concurrent.futures.Future object that will be resolved once a
            response has been received
        """
        return self.send_request(CLIENT_REGISTER_CAPABILITY, params, callback)

    def register_capability_async(self, params: RegistrationParams) -> asyncio.Future:
        """Register a new capability on the client.

        Args:
            params(RegistrationParams): RegistrationParams from lsp specs

        Returns:
            asyncio.Future object that will be resolved once a
            response has been received
        """
        return asyncio.wrap_future(self.register_capability(params, None))

    def semantic_tokens_refresh(
        self, callback: Optional[Callable[[], None]] = None
    ) -> Future:
        """Requesting a refresh of all semantic tokens.

        Args:
            callback(callable): Callabe which will be called after
                                response from the client is received

        Returns:
            concurrent.futures.Future object that will be resolved once a
            response has been received
        """
        return self.send_request(WORKSPACE_SEMANTIC_TOKENS_REFRESH, callback=callback)

    def semantic_tokens_refresh_async(self) -> asyncio.Future:
        """Requesting a refresh of all semantic tokens.

        Returns:
            asyncio.Future object that will be resolved once a
            response has been received
        """
        return asyncio.wrap_future(self.semantic_tokens_refresh(None))

    def show_document(
        self,
        params: ShowDocumentParams,
        callback: Optional[ShowDocumentCallbackType] = None,
    ) -> Future:
        """Display a particular document in the user interface.

        Args:
            params(ShowDocumentParams): ShowDocumentParams from lsp specs
            callback(callable): Callabe which will be called after
                                response from the client is received

        Returns:
            concurrent.futures.Future object that will be resolved once a
            response has been received
        """
        return self.send_request(WINDOW_SHOW_DOCUMENT, params, callback)

    def show_document_async(self, params: ShowDocumentParams) -> asyncio.Future:
        """Display a particular document in the user interface.

        Args:
            params(ShowDocumentParams): ShowDocumentParams from lsp specs

        Returns:
            asyncio.Future object that will be resolved once a
            response has been received
        """
        return asyncio.wrap_future(self.show_document(params, None))

    def show_message(self, message, msg_type=MessageType.Info):
        """Sends message to the client to display message."""
        self.notify(
            WINDOW_SHOW_MESSAGE, ShowMessageParams(type=msg_type, message=message)
        )

    def show_message_log(self, message, msg_type=MessageType.Log):
        """Sends message to the client's output channel."""
        self.notify(
            WINDOW_LOG_MESSAGE, LogMessageParams(type=msg_type, message=message)
        )

    def unregister_capability(
        self,
        params: UnregistrationParams,
        callback: Optional[Callable[[], None]] = None,
    ) -> Future:
        """Unregister a new capability on the client.

        Args:
            params(UnregistrationParams): UnregistrationParams from lsp specs
            callback(callable): Callabe which will be called after
                                response from the client is received
        Returns:
            concurrent.futures.Future object that will be resolved once a
            response has been received
        """
        return self.send_request(CLIENT_UNREGISTER_CAPABILITY, params, callback)

    def unregister_capability_async(
        self, params: UnregistrationParams
    ) -> asyncio.Future:
        """Unregister a new capability on the client.

        Args:
            params(UnregistrationParams): UnregistrationParams from lsp specs
            callback(callable): Callabe which will be called after
                                response from the client is received
        Returns:
            asyncio.Future object that will be resolved once a
            response has been received
        """
        return asyncio.wrap_future(self.unregister_capability(params, None))
