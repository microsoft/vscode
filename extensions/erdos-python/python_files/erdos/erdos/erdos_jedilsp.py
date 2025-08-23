#
# Copyright (C) 2025 Lotas Inc. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
#

import asyncio
import enum
import inspect
import logging
import re
import threading
import warnings
from functools import lru_cache
from typing import TYPE_CHECKING, Any, Callable, Dict, List, Optional, Type, Union, cast

from comm.base_comm import BaseComm

from ._vendor import attrs, cattrs
from ._vendor.jedi.api import Interpreter, Project, Script
from ._vendor.jedi.api.classes import Completion
from ._vendor.jedi_language_server import jedi_utils, notebook_utils, pygls_utils, server
from ._vendor.jedi_language_server.server import (
    JediLanguageServer,
    JediLanguageServerProtocol,
    _choose_markup,
    code_action,
    completion_item_resolve,
    declaration,
    definition,
    did_change_configuration,
    did_change_diagnostics,
    did_change_notebook_diagnostics,
    did_close_diagnostics,
    did_close_notebook_diagnostics,
    did_open_diagnostics,
    did_open_notebook_diagnostics,
    did_save_diagnostics,
    did_save_notebook_diagnostics,
    document_symbol,
    highlight,
    hover,
    rename,
    signature_help,
    type_definition,
    workspace_symbol,
)
from ._vendor.lsprotocol.types import (
    CANCEL_REQUEST,
    COMPLETION_ITEM_RESOLVE,
    INITIALIZE,
    NOTEBOOK_DOCUMENT_DID_CHANGE,
    NOTEBOOK_DOCUMENT_DID_CLOSE,
    NOTEBOOK_DOCUMENT_DID_OPEN,
    NOTEBOOK_DOCUMENT_DID_SAVE,
    TEXT_DOCUMENT_CODE_ACTION,
    TEXT_DOCUMENT_COMPLETION,
    TEXT_DOCUMENT_DECLARATION,
    TEXT_DOCUMENT_DEFINITION,
    TEXT_DOCUMENT_DID_CHANGE,
    TEXT_DOCUMENT_DID_CLOSE,
    TEXT_DOCUMENT_DID_OPEN,
    TEXT_DOCUMENT_DID_SAVE,
    TEXT_DOCUMENT_DOCUMENT_HIGHLIGHT,
    TEXT_DOCUMENT_DOCUMENT_SYMBOL,
    TEXT_DOCUMENT_HOVER,
    TEXT_DOCUMENT_REFERENCES,
    TEXT_DOCUMENT_RENAME,
    TEXT_DOCUMENT_SIGNATURE_HELP,
    TEXT_DOCUMENT_TYPE_DEFINITION,
    WORKSPACE_DID_CHANGE_CONFIGURATION,
    WORKSPACE_SYMBOL,
    CodeAction,
    CodeActionKind,
    CodeActionOptions,
    CodeActionParams,
    CompletionItem,
    CompletionItemKind,
    CompletionList,
    CompletionOptions,
    CompletionParams,
    DidChangeConfigurationParams,
    DidChangeNotebookDocumentParams,
    DidChangeTextDocumentParams,
    DidCloseNotebookDocumentParams,
    DidCloseTextDocumentParams,
    DidOpenNotebookDocumentParams,
    DidOpenTextDocumentParams,
    DidSaveNotebookDocumentParams,
    DidSaveTextDocumentParams,
    DocumentHighlight,
    DocumentSymbol,
    DocumentSymbolParams,
    Hover,
    InitializeParams,
    InitializeResult,
    InsertReplaceEdit,
    InsertTextFormat,
    Location,
    MessageType,
    NotebookDocumentSyncOptions,
    NotebookDocumentSyncOptionsNotebookSelectorType2,
    NotebookDocumentSyncOptionsNotebookSelectorType2CellsType,
    Position,
    Range,
    RenameParams,
    SignatureHelp,
    SignatureHelpOptions,
    SymbolInformation,
    TextDocumentIdentifier,
    TextDocumentPositionParams,
    WorkspaceEdit,
    WorkspaceSymbolParams,
)
from ._vendor.pygls.capabilities import get_capability
from ._vendor.pygls.feature_manager import has_ls_param_or_annotation
from ._vendor.pygls.protocol import lsp_method
from ._vendor.pygls.workspace.text_document import TextDocument

from .jedi import apply_jedi_patches
from .utils import debounce

if TYPE_CHECKING:
    from ._vendor.jedi.api.classes import Completion
    from .erdos_ipkernel import ErdosShell

logger = logging.getLogger(__name__)

_COMMENT_PREFIX = r"#"
_LINE_MAGIC_PREFIX = r"%"
_CELL_MAGIC_PREFIX = r"%%"
_SHELL_PREFIX = "!"
_HELP_PREFIX_OR_SUFFIX = "?"

apply_jedi_patches()


def _jedi_utils_script(project: Optional[Project], document: TextDocument) -> Interpreter:
    server = _get_server_from_call_stack()
    if server is None:
        raise AssertionError("Could not find server object in the caller's scope")
    return _interpreter(project, document, server.shell)


def _get_server_from_call_stack() -> Optional["ErdosJediLanguageServer"]:
    level = 0
    frame = inspect.currentframe()
    while frame is not None and level < 3:
        server = frame.f_locals.get("server") or frame.f_locals.get("ls")
        server = getattr(server, "_wrapped", server)
        if isinstance(server, ErdosJediLanguageServer):
            return server
        frame = frame.f_back
        level += 1

    return None


@debounce(1, keyed_by="uri")
def _publish_diagnostics_debounced(
    server: "ErdosJediLanguageServer", uri: str, filename: Optional[str] = None
) -> None:
    try:
        _publish_diagnostics(server, uri, filename)
    except Exception:
        logger.exception(f"Failed to publish diagnostics for uri {uri}", exc_info=True)


def _publish_diagnostics(
    server: "ErdosJediLanguageServer", uri: str, filename: Optional[str] = None
) -> None:
    if uri not in server.workspace.text_documents:
        return
    if filename is None:
        filename = uri

    doc = server.workspace.get_text_document(uri)

    source = "".join(
        (
            f"#{line}"
            if line.lstrip().startswith((_LINE_MAGIC_PREFIX, _SHELL_PREFIX, _HELP_PREFIX_OR_SUFFIX))
            or line.rstrip().endswith(_HELP_PREFIX_OR_SUFFIX)
            else line
        )
        for line in doc.lines
    )

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        diagnostic = jedi_utils.lsp_python_diagnostic(filename, source)

    diagnostics = [diagnostic] if diagnostic else []
    server.publish_diagnostics(uri, diagnostics)


def _apply_jedi_language_server_patches() -> None:
    jedi_utils.script = _jedi_utils_script
    server._publish_diagnostics = _publish_diagnostics_debounced


_apply_jedi_language_server_patches()


@enum.unique
class _MagicType(str, enum.Enum):
    cell = "cell"
    line = "line"


@attrs.define
class ErdosInitializationOptions:
    working_directory: Optional[str] = attrs.field(default=None)


class ErdosJediLanguageServerProtocol(JediLanguageServerProtocol):
    def __init__(self, server, converter):
        super().__init__(server, converter)

        self._messages_to_handle = []

    @lru_cache
    def get_message_type(self, method: str) -> Optional[Type]:
        return super().get_message_type(method)

    @lsp_method(INITIALIZE)
    def lsp_initialize(self, params: InitializeParams) -> InitializeResult:
        result = super().lsp_initialize(params)

        server = self._server

        try:
            raw_initialization_options = (params.initialization_options or {}).get("erdos", {})
            initialization_options = cattrs.structure(
                raw_initialization_options, ErdosInitializationOptions
            )
        except cattrs.BaseValidationError as error:
            msg = f"Invalid ErdosInitializationOptions, using defaults: {cattrs.transform_error(error)}"
            server.show_message(msg, msg_type=MessageType.Error)
            server.show_message_log(msg, msg_type=MessageType.Error)
            initialization_options = ErdosInitializationOptions()

        path = initialization_options.working_directory or self._server.workspace.root_path

        workspace_options = server.initialization_options.workspace
        server.project = (
            Project(
                path=path,
                environment_path=workspace_options.environment_path,
                added_sys_path=workspace_options.extra_paths,
                smart_sys_path=True,
                load_unsafe_extensions=False,
            )
            if path
            else None
        )

        return result

    def _data_received(self, data: bytes) -> None:
        self._messages_to_handle = []
        super()._data_received(data)

        def is_request(message):
            return hasattr(message, "method") and hasattr(message, "id")

        def is_cancel_notification(message):
            return getattr(message, "method", None) == CANCEL_REQUEST

        request_ids = set()
        cancelled_ids = set()
        for message in self._messages_to_handle:
            if is_request(message):
                request_ids.add(message.id)
            elif is_cancel_notification(message) and message.params.id in request_ids:
                cancelled_ids.add(message.params.id)

        self._messages_to_handle = [
            msg
            for msg in self._messages_to_handle
            if not (
                (is_cancel_notification(msg) and msg.params.id in cancelled_ids)
                or (is_request(msg) and msg.id in cancelled_ids)
            )
        ]

        for message in self._messages_to_handle:
            super()._procedure_handler(message)

    def _procedure_handler(self, message) -> None:
        self._messages_to_handle.append(message)


class ErdosJediLanguageServer(JediLanguageServer):
    loop: asyncio.AbstractEventLoop
    lsp: ErdosJediLanguageServerProtocol

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)

        self._comm: Optional[BaseComm] = None

        self.shell: Optional[ErdosShell] = None

        self._server_thread: Optional[threading.Thread] = None

        self._debug = False

    def feature(self, feature_name: str, options: Optional[Any] = None) -> Callable:
        def decorator(f):
            if not has_ls_param_or_annotation(f, type(self)):
                return None

            lsp = self.lsp

            if feature_name in lsp.fm.features:
                del lsp.fm.features[feature_name]
            if feature_name in lsp.fm.feature_options:
                del lsp.fm.feature_options[feature_name]

            return lsp.fm.feature(feature_name, options)(f)

        return decorator

    def start_tcp(self, host: str) -> None:
        self.loop = asyncio.new_event_loop()

        self.loop.set_debug(self._debug)

        asyncio.set_event_loop(self.loop)

        self._stop_event = threading.Event()
        self._server = self.loop.run_until_complete(self.loop.create_server(self.lsp, host))

        listeners = self._server.sockets
        for socket in listeners:
            addr, port = socket.getsockname()
            if addr == host:
                logger.info("LSP server is listening on %s:%d", host, port)
                break
        else:
            raise AssertionError("Unable to determine LSP server port")

        if self._comm is None:
            logger.warning("LSP comm was not set, could not send server_started message")
        else:
            logger.info("LSP server is ready, sending server_started message")
            self._comm.send({"msg_type": "server_started", "content": {"port": port}})

        try:
            while not self._stop_event.is_set():
                self.loop.run_until_complete(asyncio.sleep(1))
        except (KeyboardInterrupt, SystemExit):
            pass
        finally:
            self.shutdown()

    def start(self, lsp_host: str, shell: "ErdosShell", comm: BaseComm) -> None:
        self._comm = comm

        self.shell = shell

        self.lsp._shutdown = False

        if self._server_thread is not None and self._server_thread.is_alive():
            logger.warning("An LSP server thread already exists, shutting it down")
            if self._stop_event is None:
                logger.warning("No stop event was set, dropping the thread")
            else:
                self._stop_event.set()
                self._server_thread.join(timeout=5)
                if self._server_thread is not None and self._server_thread.is_alive():
                    logger.warning("LSP server thread did not exit after 5 seconds, dropping it")

        logger.info("Starting LSP server thread")
        self._server_thread = threading.Thread(
            target=self.start_tcp,
            args=(lsp_host,),
            name="LSPServerThread",
            daemon=True,
        )
        self._server_thread.start()

    def shutdown(self) -> None:
        logger.info("Shutting down LSP server thread")

        if self._stop_event is not None:
            self._stop_event.set()

        if self._thread_pool:
            self._thread_pool.terminate()
            self._thread_pool.join()

        if self._thread_pool_executor:
            self._thread_pool_executor.shutdown()

        if self._server:
            self._server.close()

        if not self.loop.is_closed():
            self.loop.close()
        self._server_thread = None

    def stop(self) -> None:
        if self._stop_event is None:
            logger.warning("Cannot stop the LSP server thread, it was not started")
            return

        self._stop_event.set()

    def set_debug(self, debug: bool) -> None:
        self._debug = debug


def create_server() -> ErdosJediLanguageServer:
    return ErdosJediLanguageServer(
        name="jedi-language-server",
        version="0.18.2",
        protocol_cls=ErdosJediLanguageServerProtocol,
        loop=object(),
        notebook_document_sync=NotebookDocumentSyncOptions(
            notebook_selector=[
                NotebookDocumentSyncOptionsNotebookSelectorType2(
                    cells=[
                        NotebookDocumentSyncOptionsNotebookSelectorType2CellsType(language="python")
                    ]
                )
            ]
        ),
    )


ERDOS = create_server()

_MAGIC_COMPLETIONS: Dict[str, Any] = {}


@ERDOS.feature(
    TEXT_DOCUMENT_COMPLETION,
    CompletionOptions(
        trigger_characters=[".", "'", '"', _LINE_MAGIC_PREFIX], resolve_provider=True
    ),
)
@notebook_utils.supports_notebooks
def erdos_completion(
    server: ErdosJediLanguageServer, params: CompletionParams
) -> Optional[CompletionList]:
    snippet_disable = server.initialization_options.completion.disable_snippets
    resolve_eagerly = server.initialization_options.completion.resolve_eagerly
    ignore_patterns = server.initialization_options.completion.ignore_patterns
    document = server.workspace.get_text_document(params.text_document.uri)
    jedi_lines = jedi_utils.line_column(params.position)

    line = document.lines[params.position.line] if document.lines else ""
    trimmed_line = line.lstrip()
    if trimmed_line.startswith((_COMMENT_PREFIX, _SHELL_PREFIX)):
        return None

    jedi_script = _interpreter(server.project, document, server.shell)

    try:
        jedi_lines = jedi_utils.line_column(params.position)
        completions_jedi_raw = jedi_script.complete(*jedi_lines)
        if not ignore_patterns:
            completions_jedi = (comp for comp in completions_jedi_raw)
        else:
            completions_jedi = (
                comp
                for comp in completions_jedi_raw
                if not any(i.match(comp.name) for i in ignore_patterns)
            )
        snippet_support = get_capability(
            server.client_capabilities,
            "text_document.completion.completion_item.snippet_support",
            default=False,
        )
        markup_kind = _choose_markup(server)
        is_import_context = jedi_utils.is_import(
            script_=jedi_script,
            line=jedi_lines[0],
            column=jedi_lines[1],
        )
        enable_snippets = snippet_support and not snippet_disable and not is_import_context
        char_before_cursor = pygls_utils.char_before_cursor(
            document=server.workspace.get_text_document(params.text_document.uri),
            position=params.position,
        )
        char_after_cursor = pygls_utils.char_after_cursor(
            document=server.workspace.get_text_document(params.text_document.uri),
            position=params.position,
        )
        jedi_utils.clear_completions_cache()

        _MAGIC_COMPLETIONS.clear()

        completion_items = []

        if not trimmed_line.startswith(_LINE_MAGIC_PREFIX):
            for completion in completions_jedi:
                jedi_completion_item = jedi_utils.lsp_completion_item(
                    completion=cast("Completion", completion),
                    char_before_cursor=char_before_cursor,
                    char_after_cursor=char_after_cursor,
                    enable_snippets=enable_snippets,
                    resolve_eagerly=resolve_eagerly,
                    markup_kind=markup_kind,
                    sort_append_text=completion.name,
                )

                jedi_utils._MOST_RECENT_COMPLETIONS[jedi_completion_item.label] = cast(
                    "Completion", completion
                )

                new_text = completion.complete
                if completion.type == "path" and new_text is not None:
                    range_ = Range(params.position, params.position)

                    mapper = notebook_utils.notebook_coordinate_mapper(
                        server.workspace, cell_uri=params.text_document.uri
                    )
                    if mapper is not None:
                        location = mapper.cell_range(range_)
                        if location is not None and location.uri == params.text_document.uri:
                            range_ = location.range

                    jedi_completion_item.text_edit = InsertReplaceEdit(
                        new_text=new_text,
                        insert=range_,
                        replace=range_,
                    )
                completion_items.append(jedi_completion_item)

        is_completing_attribute = "." in trimmed_line
        has_whitespace = " " in trimmed_line
        has_string = '"' in trimmed_line or "'" in trimmed_line
        exclude_magics = is_completing_attribute or has_whitespace or has_string
        if server.shell is not None and not exclude_magics:
            magic_commands = cast(
                "Dict[str, Dict[str, Callable]]", server.shell.magics_manager.lsmagic()
            )

            chars_before_cursor = trimmed_line[: params.position.character]

            cell_magic_completion_items = [
                _magic_completion_item(
                    name=name,
                    magic_type=_MagicType.cell,
                    chars_before_cursor=chars_before_cursor,
                    func=func,
                )
                for name, func in magic_commands[_MagicType.cell].items()
            ]
            completion_items.extend(cell_magic_completion_items)

            if not trimmed_line.startswith(_CELL_MAGIC_PREFIX):
                line_magic_completion_items = [
                    _magic_completion_item(
                        name=name,
                        magic_type=_MagicType.line,
                        chars_before_cursor=chars_before_cursor,
                        func=func,
                    )
                    for name, func in magic_commands[_MagicType.line].items()
                ]
                completion_items.extend(line_magic_completion_items)

    except ValueError:
        logger.info("LSP completion error", exc_info=True)
        completion_items = []

    return CompletionList(is_incomplete=False, items=completion_items) if completion_items else None


def _magic_completion_item(
    name: str,
    magic_type: _MagicType,
    chars_before_cursor: str,
    func: Callable,
) -> CompletionItem:
    if magic_type == _MagicType.line:
        prefix = _LINE_MAGIC_PREFIX
    elif magic_type == _MagicType.cell:
        prefix = _CELL_MAGIC_PREFIX
    else:
        raise AssertionError(f"Invalid magic type: {magic_type}")

    m1 = re.search(r"\s*([^\s]*)$", chars_before_cursor)
    assert m1, f"Regex should always match. chars_before_cursor: {chars_before_cursor}"
    text = m1.group(1)

    m2 = re.match("^(%*)", text)
    assert m2, f"Regex should always match. text: {text}"

    count = len(m2.group(1))
    pad_count = max(0, len(prefix) - count)
    insert_text = prefix[0] * pad_count + name

    label = prefix + name

    _MAGIC_COMPLETIONS[label] = (f"{magic_type.value} magic {name}", func.__doc__)

    return CompletionItem(
        label=label,
        filter_text=name,
        kind=CompletionItemKind.Function,
        sort_text=f"w{name}",
        insert_text=insert_text,
        insert_text_format=InsertTextFormat.PlainText,
    )


@ERDOS.feature(COMPLETION_ITEM_RESOLVE)
def erdos_completion_item_resolve(
    server: ErdosJediLanguageServer, params: CompletionItem
) -> CompletionItem:
    magic_completion = _MAGIC_COMPLETIONS.get(params.label)
    if magic_completion is not None:
        params.detail, params.documentation = magic_completion
        return params
    return completion_item_resolve(server, params)


@ERDOS.feature(
    TEXT_DOCUMENT_SIGNATURE_HELP,
    SignatureHelpOptions(trigger_characters=["(", ","]),
)
def erdos_signature_help(
    server: ErdosJediLanguageServer, params: TextDocumentPositionParams
) -> Optional[SignatureHelp]:
    return signature_help(server, params)


@ERDOS.feature(TEXT_DOCUMENT_DECLARATION)
def erdos_declaration(
    server: ErdosJediLanguageServer, params: TextDocumentPositionParams
) -> Optional[List[Location]]:
    return declaration(server, params)


@ERDOS.feature(TEXT_DOCUMENT_DEFINITION)
def erdos_definition(
    server: ErdosJediLanguageServer, params: TextDocumentPositionParams
) -> Optional[List[Location]]:
    return definition(server, params)


@ERDOS.feature(TEXT_DOCUMENT_TYPE_DEFINITION)
def erdos_type_definition(
    server: ErdosJediLanguageServer, params: TextDocumentPositionParams
) -> Optional[List[Location]]:
    return type_definition(server, params)


@ERDOS.feature(TEXT_DOCUMENT_DOCUMENT_HIGHLIGHT)
def erdos_highlight(
    server: ErdosJediLanguageServer, params: TextDocumentPositionParams
) -> Optional[List[DocumentHighlight]]:
    return highlight(server, params)


@ERDOS.feature(TEXT_DOCUMENT_HOVER)
def erdos_hover(
    server: ErdosJediLanguageServer, params: TextDocumentPositionParams
) -> Optional[Hover]:
    try:
        return hover(server, params)
    except ValueError:
        logger.info("LSP hover error", exc_info=True)

    return None


@ERDOS.feature(TEXT_DOCUMENT_REFERENCES)
@notebook_utils.supports_notebooks
def erdos_references(
    server: ErdosJediLanguageServer, params: TextDocumentPositionParams
) -> Optional[List[Location]]:
    document = server.workspace.get_text_document(params.text_document.uri)
    jedi_script = Script(code=document.source, path=document.path, project=server.project)
    jedi_lines = jedi_utils.line_column(params.position)
    names = jedi_script.get_references(*jedi_lines)
    locations = [
        location
        for location in (jedi_utils.lsp_location(name) for name in names)
        if location is not None
    ]
    return locations if locations else None


@ERDOS.feature(TEXT_DOCUMENT_DOCUMENT_SYMBOL)
def erdos_document_symbol(
    server: ErdosJediLanguageServer, params: DocumentSymbolParams
) -> Optional[Union[List[DocumentSymbol], List[SymbolInformation]]]:
    return document_symbol(server, params)


@ERDOS.feature(WORKSPACE_SYMBOL)
def erdos_workspace_symbol(
    server: ErdosJediLanguageServer, params: WorkspaceSymbolParams
) -> Optional[List[SymbolInformation]]:
    return workspace_symbol(server, params)


@ERDOS.feature(TEXT_DOCUMENT_RENAME)
def erdos_rename(
    server: ErdosJediLanguageServer, params: RenameParams
) -> Optional[WorkspaceEdit]:
    return rename(server, params)


@ERDOS.feature(
    TEXT_DOCUMENT_CODE_ACTION,
    CodeActionOptions(
        code_action_kinds=[
            CodeActionKind.RefactorInline,
            CodeActionKind.RefactorExtract,
        ],
    ),
)
def erdos_code_action(
    server: ErdosJediLanguageServer,
    params: CodeActionParams,
) -> Optional[List[CodeAction]]:
    try:
        return code_action(server, params)
    except ValueError:
        logger.info("LSP codeAction error", exc_info=True)


@ERDOS.feature(WORKSPACE_DID_CHANGE_CONFIGURATION)
def erdos_did_change_configuration(
    server: ErdosJediLanguageServer,
    params: DidChangeConfigurationParams,
) -> None:
    return did_change_configuration(server, params)


@ERDOS.feature(TEXT_DOCUMENT_DID_SAVE)
def erdos_did_save_diagnostics(
    server: ErdosJediLanguageServer, params: DidSaveTextDocumentParams
) -> None:
    return did_save_diagnostics(server, params)


@ERDOS.feature(TEXT_DOCUMENT_DID_CHANGE)
def erdos_did_change_diagnostics(
    server: ErdosJediLanguageServer, params: DidChangeTextDocumentParams
) -> None:
    return did_change_diagnostics(server, params)


@ERDOS.feature(TEXT_DOCUMENT_DID_OPEN)
def erdos_did_open_diagnostics(
    server: ErdosJediLanguageServer, params: DidOpenTextDocumentParams
) -> None:
    return did_open_diagnostics(server, params)


@ERDOS.feature(TEXT_DOCUMENT_DID_CLOSE)
def erdos_did_close_diagnostics(
    server: ErdosJediLanguageServer, params: DidCloseTextDocumentParams
) -> None:
    return did_close_diagnostics(server, params)


@ERDOS.feature(NOTEBOOK_DOCUMENT_DID_SAVE)
def erdos_did_save_notebook_diagnostics(
    server: ErdosJediLanguageServer, params: DidSaveNotebookDocumentParams
) -> None:
    return did_save_notebook_diagnostics(server, params)


@ERDOS.feature(NOTEBOOK_DOCUMENT_DID_CHANGE)
def erdos_did_change_notebook_diagnostics(
    server: ErdosJediLanguageServer, params: DidChangeNotebookDocumentParams
) -> None:
    return did_change_notebook_diagnostics(server, params)


@ERDOS.feature(NOTEBOOK_DOCUMENT_DID_OPEN)
def erdos_did_open_notebook_diagnostics(
    server: JediLanguageServer, params: DidOpenNotebookDocumentParams
) -> None:
    return did_open_notebook_diagnostics(server, params)


@ERDOS.feature(NOTEBOOK_DOCUMENT_DID_CLOSE)
def erdos_did_close_notebook_diagnostics(
    server: JediLanguageServer, params: DidCloseNotebookDocumentParams
) -> None:
    return did_close_notebook_diagnostics(server, params)


def _interpreter(
    project: Optional[Project], document: TextDocument, shell: Optional["ErdosShell"]
) -> Interpreter:
    namespaces: List[Dict[str, Any]] = []
    if shell is not None:
        namespaces.append(shell.user_ns)

    return Interpreter(
        code=document.source, path=document.path, project=project, namespaces=namespaces
    )
