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
import asyncio
import json
import logging
import re
import sys
from concurrent.futures import Future, ThreadPoolExecutor
from threading import Event
from typing import (
    Any,
    Callable,
    List,
    Optional,
    TextIO,
    Type,
    TypeVar,
    Union,
)

import erdos._vendor.cattrs
from erdos._vendor.pygls import IS_PYODIDE
from erdos._vendor.pygls.lsp import ConfigCallbackType, ShowDocumentCallbackType
from erdos._vendor.pygls.exceptions import (
    FeatureNotificationError,
    JsonRpcInternalError,
    PyglsError,
    JsonRpcException,
    FeatureRequestError,
)
from erdos._vendor.lsprotocol.types import (
    ClientCapabilities,
    Diagnostic,
    MessageType,
    NotebookDocumentSyncOptions,
    RegistrationParams,
    ServerCapabilities,
    ShowDocumentParams,
    TextDocumentSyncKind,
    UnregistrationParams,
    WorkspaceApplyEditResponse,
    WorkspaceEdit,
    WorkspaceConfigurationParams,
)
from erdos._vendor.pygls.progress import Progress
from erdos._vendor.pygls.protocol import JsonRPCProtocol, LanguageServerProtocol, default_converter
from erdos._vendor.pygls.workspace import Workspace

if not IS_PYODIDE:
    from multiprocessing.pool import ThreadPool


logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable)

ServerErrors = Union[
    PyglsError,
    JsonRpcException,
    Type[JsonRpcInternalError],
    Type[FeatureNotificationError],
    Type[FeatureRequestError],
]


async def aio_readline(loop, executor, stop_event, rfile, proxy):
    """Reads data from stdin in separate thread (asynchronously)."""

    CONTENT_LENGTH_PATTERN = re.compile(rb"^Content-Length: (\d+)\r\n$")

    # Initialize message buffer
    message = []
    content_length = 0

    while not stop_event.is_set() and not rfile.closed:
        # Read a header line
        header = await loop.run_in_executor(executor, rfile.readline)
        if not header:
            break
        message.append(header)

        # Extract content length if possible
        if not content_length:
            match = CONTENT_LENGTH_PATTERN.fullmatch(header)
            if match:
                content_length = int(match.group(1))
                logger.debug("Content length: %s", content_length)

        # Check if all headers have been read (as indicated by an empty line \r\n)
        if content_length and not header.strip():
            # Read body
            body = await loop.run_in_executor(executor, rfile.read, content_length)
            if not body:
                break
            message.append(body)

            # Pass message to language server protocol
            proxy(b"".join(message))

            # Reset the buffer
            message = []
            content_length = 0


class StdOutTransportAdapter:
    """Protocol adapter which overrides write method.

    Write method sends data to stdout.
    """

    def __init__(self, rfile, wfile):
        self.rfile = rfile
        self.wfile = wfile

    def close(self):
        self.rfile.close()
        self.wfile.close()

    def write(self, data):
        self.wfile.write(data)
        self.wfile.flush()


class PyodideTransportAdapter:
    """Protocol adapter which overrides write method.

    Write method sends data to stdout.
    """

    def __init__(self, wfile):
        self.wfile = wfile

    def close(self):
        self.wfile.close()

    def write(self, data):
        self.wfile.write(data)
        self.wfile.flush()


class WebSocketTransportAdapter:
    """Protocol adapter which calls write method.

    Write method sends data via the WebSocket interface.
    """

    def __init__(self, ws, loop):
        self._ws = ws
        self._loop = loop

    def close(self) -> None:
        """Stop the WebSocket server."""
        self._ws.close()

    def write(self, data: Any) -> None:
        """Create a task to write specified data into a WebSocket."""
        asyncio.ensure_future(self._ws.send(data))


class Server:
    """Base server class

    Parameters
    ----------
    protocol_cls
       Protocol implementation that must be derive from :class:`~pygls.protocol.JsonRPCProtocol`

    converter_factory
       Factory function to use when constructing a cattrs converter.

    loop
       The asyncio event loop

    max_workers
       Maximum number of workers for `ThreadPool` and `ThreadPoolExecutor`

    """

    def __init__(
        self,
        protocol_cls: Type[JsonRPCProtocol],
        converter_factory: Callable[[], erdos._vendor.cattrs.Converter],
        loop: Optional[asyncio.AbstractEventLoop] = None,
        max_workers: int = 2,
        sync_kind: TextDocumentSyncKind = TextDocumentSyncKind.Incremental,
    ):
        if not issubclass(protocol_cls, asyncio.Protocol):
            raise TypeError("Protocol class should be subclass of asyncio.Protocol")

        self._max_workers = max_workers
        self._server = None
        self._stop_event: Optional[Event] = None
        self._thread_pool: Optional[ThreadPool] = None
        self._thread_pool_executor: Optional[ThreadPoolExecutor] = None

        if sync_kind is not None:
            self.text_document_sync_kind = sync_kind

        if loop is None:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            self._owns_loop = True
        else:
            self._owns_loop = False

        self.loop = loop

        # TODO: Will move this to `LanguageServer` soon
        self.lsp = protocol_cls(self, converter_factory())  # type: ignore

    def shutdown(self):
        """Shutdown server."""
        logger.info("Shutting down the server")

        if self._stop_event is not None:
            self._stop_event.set()

        if self._thread_pool:
            self._thread_pool.terminate()
            self._thread_pool.join()

        if self._thread_pool_executor:
            self._thread_pool_executor.shutdown()

        if self._server:
            self._server.close()
            self.loop.run_until_complete(self._server.wait_closed())

        if self._owns_loop and not self.loop.is_closed():
            logger.info("Closing the event loop.")
            self.loop.close()

    def start_io(self, stdin: Optional[TextIO] = None, stdout: Optional[TextIO] = None):
        """Starts IO server."""
        logger.info("Starting IO server")

        self._stop_event = Event()
        transport = StdOutTransportAdapter(
            stdin or sys.stdin.buffer, stdout or sys.stdout.buffer
        )
        self.lsp.connection_made(transport)  # type: ignore[arg-type]

        try:
            self.loop.run_until_complete(
                aio_readline(
                    self.loop,
                    self.thread_pool_executor,
                    self._stop_event,
                    stdin or sys.stdin.buffer,
                    self.lsp.data_received,
                )
            )
        except BrokenPipeError:
            logger.error("Connection to the client is lost! Shutting down the server.")
        except (KeyboardInterrupt, SystemExit):
            pass
        finally:
            self.shutdown()

    def start_pyodide(self):
        logger.info("Starting Pyodide server")

        # Note: We don't actually start anything running as the main event
        # loop will be handled by the web platform.
        transport = PyodideTransportAdapter(sys.stdout)
        self.lsp.connection_made(transport)  # type: ignore[arg-type]
        self.lsp._send_only_body = True  # Don't send headers within the payload

    def start_tcp(self, host: str, port: int) -> None:
        """Starts TCP server."""
        logger.info("Starting TCP server on %s:%s", host, port)

        self._stop_event = Event()
        self._server = self.loop.run_until_complete(  # type: ignore[assignment]
            self.loop.create_server(self.lsp, host, port)
        )
        try:
            self.loop.run_forever()
        except (KeyboardInterrupt, SystemExit):
            pass
        finally:
            self.shutdown()

    def start_ws(self, host: str, port: int) -> None:
        """Starts WebSocket server."""
        try:
            from websockets.server import serve
        except ImportError:
            logger.error("Run `pip install pygls[ws]` to install `websockets`.")
            sys.exit(1)

        logger.info("Starting WebSocket server on {}:{}".format(host, port))

        self._stop_event = Event()
        self.lsp._send_only_body = True  # Don't send headers within the payload

        async def connection_made(websocket, _):
            """Handle new connection wrapped in the WebSocket."""
            self.lsp.transport = WebSocketTransportAdapter(websocket, self.loop)
            async for message in websocket:
                self.lsp._procedure_handler(
                    json.loads(message, object_hook=self.lsp._deserialize_message)
                )

        start_server = serve(connection_made, host, port, loop=self.loop)
        self._server = start_server.ws_server  # type: ignore[assignment]
        self.loop.run_until_complete(start_server)

        try:
            self.loop.run_forever()
        except (KeyboardInterrupt, SystemExit):
            pass
        finally:
            self._stop_event.set()
            self.shutdown()

    if not IS_PYODIDE:

        @property
        def thread_pool(self) -> ThreadPool:
            """Returns thread pool instance (lazy initialization)."""
            if not self._thread_pool:
                self._thread_pool = ThreadPool(processes=self._max_workers)

            return self._thread_pool

        @property
        def thread_pool_executor(self) -> ThreadPoolExecutor:
            """Returns thread pool instance (lazy initialization)."""
            if not self._thread_pool_executor:
                self._thread_pool_executor = ThreadPoolExecutor(
                    max_workers=self._max_workers
                )

            return self._thread_pool_executor


class LanguageServer(Server):
    """The default LanguageServer

    This class can be extended and it can be passed as a first argument to
    registered commands/features.

    .. |ServerInfo| replace:: :class:`~lsprotocol.types.InitializeResultServerInfoType`

    Parameters
    ----------
    name
       Name of the server, used to populate |ServerInfo| which is sent to
       the client during initialization

    version
       Version of the server, used to populate |ServerInfo| which is sent to
       the client during initialization

    protocol_cls
       The :class:`~pygls.protocol.LanguageServerProtocol` class definition, or any
       subclass of it.

    max_workers
       Maximum number of workers for ``ThreadPool`` and ``ThreadPoolExecutor``

    text_document_sync_kind
       Text document synchronization method

       None
          No synchronization

       :attr:`~lsprotocol.types.TextDocumentSyncKind.Full`
          Send entire document text with each update

       :attr:`~lsprotocol.types.TextDocumentSyncKind.Incremental`
          Send only the region of text that changed with each update

    notebook_document_sync
       Advertise :lsp:`NotebookDocument` support to the client.
    """

    lsp: LanguageServerProtocol

    default_error_message = (
        "Unexpected error in LSP server, see server's logs for details"
    )
    """
    The default error message sent to the user's editor when this server encounters an uncaught
    exception.
    """

    def __init__(
        self,
        name: str,
        version: str,
        loop=None,
        protocol_cls: Type[LanguageServerProtocol] = LanguageServerProtocol,
        converter_factory=default_converter,
        text_document_sync_kind: TextDocumentSyncKind = TextDocumentSyncKind.Incremental,
        notebook_document_sync: Optional[NotebookDocumentSyncOptions] = None,
        max_workers: int = 2,
    ):
        if not issubclass(protocol_cls, LanguageServerProtocol):
            raise TypeError(
                "Protocol class should be subclass of LanguageServerProtocol"
            )

        self.name = name
        self.version = version
        self._text_document_sync_kind = text_document_sync_kind
        self._notebook_document_sync = notebook_document_sync
        self.process_id: Optional[Union[int, None]] = None
        super().__init__(protocol_cls, converter_factory, loop, max_workers)

    def apply_edit(
        self, edit: WorkspaceEdit, label: Optional[str] = None
    ) -> WorkspaceApplyEditResponse:
        """Sends apply edit request to the client."""
        return self.lsp.apply_edit(edit, label)

    def apply_edit_async(
        self, edit: WorkspaceEdit, label: Optional[str] = None
    ) -> WorkspaceApplyEditResponse:
        """Sends apply edit request to the client. Should be called with `await`"""
        return self.lsp.apply_edit_async(edit, label)

    def command(self, command_name: str) -> Callable[[F], F]:
        """Decorator used to register custom commands.

        Example
        -------
        ::

           @ls.command('myCustomCommand')
           def my_cmd(ls, a, b, c):
               pass
        """
        return self.lsp.fm.command(command_name)

    @property
    def client_capabilities(self) -> ClientCapabilities:
        """The client's capabilities."""
        return self.lsp.client_capabilities

    def feature(
        self,
        feature_name: str,
        options: Optional[Any] = None,
    ) -> Callable[[F], F]:
        """Decorator used to register LSP features.

        Example
        -------
        ::

           @ls.feature('textDocument/completion', CompletionOptions(trigger_characters=['.']))
           def completions(ls, params: CompletionParams):
               return CompletionList(is_incomplete=False, items=[CompletionItem("Completion 1")])
        """
        return self.lsp.fm.feature(feature_name, options)

    def get_configuration(
        self,
        params: WorkspaceConfigurationParams,
        callback: Optional[ConfigCallbackType] = None,
    ) -> Future:
        """Gets the configuration settings from the client."""
        return self.lsp.get_configuration(params, callback)

    def get_configuration_async(
        self, params: WorkspaceConfigurationParams
    ) -> asyncio.Future:
        """Gets the configuration settings from the client. Should be called with `await`"""
        return self.lsp.get_configuration_async(params)

    def log_trace(self, message: str, verbose: Optional[str] = None) -> None:
        """Sends trace notification to the client."""
        self.lsp.log_trace(message, verbose)

    @property
    def progress(self) -> Progress:
        """Gets the object to manage client's progress bar."""
        return self.lsp.progress

    def publish_diagnostics(
        self,
        uri: str,
        diagnostics: Optional[List[Diagnostic]] = None,
        version: Optional[int] = None,
        **kwargs
    ):
        """
        Sends diagnostic notification to the client.
        """
        params = self.lsp._construct_publish_diagnostic_type(
            uri, diagnostics, version, **kwargs
        )
        self.lsp.publish_diagnostics(params, **kwargs)

    def register_capability(
        self, params: RegistrationParams, callback: Optional[Callable[[], None]] = None
    ) -> Future:
        """Register a new capability on the client."""
        return self.lsp.register_capability(params, callback)

    def register_capability_async(self, params: RegistrationParams) -> asyncio.Future:
        """Register a new capability on the client. Should be called with `await`"""
        return self.lsp.register_capability_async(params)

    def semantic_tokens_refresh(
        self, callback: Optional[Callable[[], None]] = None
    ) -> Future:
        """Request a refresh of all semantic tokens."""
        return self.lsp.semantic_tokens_refresh(callback)

    def semantic_tokens_refresh_async(self) -> asyncio.Future:
        """Request a refresh of all semantic tokens. Should be called with `await`"""
        return self.lsp.semantic_tokens_refresh_async()

    def send_notification(self, method: str, params: object = None) -> None:
        """Sends notification to the client."""
        self.lsp.notify(method, params)

    @property
    def server_capabilities(self) -> ServerCapabilities:
        """Return server capabilities."""
        return self.lsp.server_capabilities

    def show_document(
        self,
        params: ShowDocumentParams,
        callback: Optional[ShowDocumentCallbackType] = None,
    ) -> Future:
        """Display a particular document in the user interface."""
        return self.lsp.show_document(params, callback)

    def show_document_async(self, params: ShowDocumentParams) -> asyncio.Future:
        """Display a particular document in the user interface. Should be called with `await`"""
        return self.lsp.show_document_async(params)

    def show_message(self, message, msg_type=MessageType.Info) -> None:
        """Sends message to the client to display message."""
        self.lsp.show_message(message, msg_type)

    def show_message_log(self, message, msg_type=MessageType.Log) -> None:
        """Sends message to the client's output channel."""
        self.lsp.show_message_log(message, msg_type)

    def _report_server_error(
        self,
        error: Exception,
        source: ServerErrors,
    ):
        # Prevent recursive error reporting
        try:
            self.report_server_error(error, source)
        except Exception:
            logger.warning("Failed to report error to client")

    def report_server_error(self, error: Exception, source: ServerErrors):
        """
        Sends error to the client for displaying.

        By default this fucntion does not handle LSP request errors. This is because LSP requests
        require direct responses and so already have a mechanism for including unexpected errors
        in the response body.

        All other errors are "out of band" in the sense that the client isn't explicitly waiting
        for them. For example diagnostics are returned as notifications, not responses to requests,
        and so can seemingly be sent at random. Also for example consider JSON RPC serialization
        and deserialization, if a payload cannot be parsed then the whole request/response cycle
        cannot be completed and so one of these "out of band" error messages is sent.

        These "out of band" error messages are not a requirement of the LSP spec. Pygls simply
        offers this behaviour as a recommended default. It is perfectly reasonble to override this
        default.
        """

        if source == FeatureRequestError:
            return

        self.show_message(self.default_error_message, msg_type=MessageType.Error)

    def thread(self) -> Callable[[F], F]:
        """Decorator that mark function to execute it in a thread."""
        return self.lsp.thread()

    def unregister_capability(
        self,
        params: UnregistrationParams,
        callback: Optional[Callable[[], None]] = None,
    ) -> Future:
        """Unregister a new capability on the client."""
        return self.lsp.unregister_capability(params, callback)

    def unregister_capability_async(
        self, params: UnregistrationParams
    ) -> asyncio.Future:
        """Unregister a new capability on the client. Should be called with `await`"""
        return self.lsp.unregister_capability_async(params)

    @property
    def workspace(self) -> Workspace:
        """Returns in-memory workspace."""
        return self.lsp.workspace
