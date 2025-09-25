"""Jedi Language Server.

Creates the language server constant and wraps "features" with it.

Official language server spec:
    https://microsoft.github.io/language-server-protocol/specification
"""

import itertools
from typing import Any, List, NamedTuple, Optional, Union

from erdos._vendor import cattrs
from erdos._vendor.jedi import Project, Script, __version__
from erdos._vendor.jedi.api.classes import Name
from erdos._vendor.jedi.api.refactoring import RefactoringError
from erdos._vendor.lsprotocol.types import (
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
    TEXT_DOCUMENT_SEMANTIC_TOKENS_FULL,
    TEXT_DOCUMENT_SEMANTIC_TOKENS_RANGE,
    TEXT_DOCUMENT_SIGNATURE_HELP,
    TEXT_DOCUMENT_TYPE_DEFINITION,
    WORKSPACE_DID_CHANGE_CONFIGURATION,
    WORKSPACE_SYMBOL,
    CodeAction,
    CodeActionKind,
    CodeActionOptions,
    CodeActionParams,
    CompletionItem,
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
    Location,
    MarkupContent,
    MarkupKind,
    MessageType,
    NotebookDocumentSyncOptions,
    NotebookDocumentSyncOptionsNotebookSelectorType2,
    NotebookDocumentSyncOptionsNotebookSelectorType2CellsType,
    ParameterInformation,
    Position,
    Range,
    RenameParams,
    SemanticTokens,
    SemanticTokensLegend,
    SemanticTokensParams,
    SemanticTokensRangeParams,
    SignatureHelp,
    SignatureHelpOptions,
    SignatureInformation,
    SymbolInformation,
    TextDocumentPositionParams,
    WorkspaceEdit,
    WorkspaceSymbolParams,
)
from erdos._vendor.lsprotocol.validators import INTEGER_MAX_VALUE
from erdos._vendor.pygls.capabilities import get_capability
from erdos._vendor.pygls.protocol import LanguageServerProtocol, lsp_method
from erdos._vendor.pygls.server import LanguageServer

from . import jedi_utils, notebook_utils, pygls_utils, text_edit_utils
from .constants import (
    SEMANTIC_TO_TOKEN_ID,
    SUPPORTED_SEMANTIC_TYPES,
)
from .initialization_options import (
    InitializationOptions,
    initialization_options_converter,
)


class JediLanguageServerProtocol(LanguageServerProtocol):
    """Override some built-in functions."""

    _server: "JediLanguageServer"

    @lsp_method(INITIALIZE)
    def lsp_initialize(self, params: InitializeParams) -> InitializeResult:
        """Override built-in initialization.

        Here, we can conditionally register functions to features based
        on client capabilities and initializationOptions.
        """
        server = self._server
        try:
            server.initialization_options = (
                initialization_options_converter.structure(
                    {}
                    if params.initialization_options is None
                    else params.initialization_options,
                    InitializationOptions,
                )
            )
        except cattrs.BaseValidationError as error:
            msg = (
                "Invalid InitializationOptions, using defaults:"
                f" {cattrs.transform_error(error)}"
            )
            server.show_message(msg, msg_type=MessageType.Error)
            server.show_message_log(msg, msg_type=MessageType.Error)
            server.initialization_options = InitializationOptions()

        initialization_options = server.initialization_options
        jedi_utils.set_jedi_settings(initialization_options)

        # Configure didOpen, didChange, and didSave
        # currently need to be configured manually
        diagnostics = initialization_options.diagnostics
        did_open = (
            did_open_diagnostics
            if diagnostics.enable and diagnostics.did_open
            else did_open_default
        )
        did_change = (
            did_change_diagnostics
            if diagnostics.enable and diagnostics.did_change
            else did_change_default
        )
        did_save = (
            did_save_diagnostics
            if diagnostics.enable and diagnostics.did_save
            else did_save_default
        )
        did_close = (
            did_close_diagnostics if diagnostics.enable else did_close_default
        )
        did_open_notebook = (
            did_open_notebook_diagnostics
            if diagnostics.enable and diagnostics.did_open
            else did_open_notebook_default
        )
        did_change_notebook = (
            did_change_notebook_diagnostics
            if diagnostics.enable and diagnostics.did_change
            else did_change_notebook_default
        )
        did_save_notebook = (
            did_save_notebook_diagnostics
            if diagnostics.enable and diagnostics.did_save
            else did_save_notebook_default
        )
        did_close_notebook = (
            did_close_notebook_diagnostics
            if diagnostics.enable
            else did_close_notebook_default
        )
        server.feature(TEXT_DOCUMENT_DID_OPEN)(did_open)
        server.feature(TEXT_DOCUMENT_DID_CHANGE)(did_change)
        server.feature(TEXT_DOCUMENT_DID_SAVE)(did_save)
        server.feature(TEXT_DOCUMENT_DID_CLOSE)(did_close)
        server.feature(NOTEBOOK_DOCUMENT_DID_OPEN)(did_open_notebook)
        server.feature(NOTEBOOK_DOCUMENT_DID_CHANGE)(did_change_notebook)
        server.feature(NOTEBOOK_DOCUMENT_DID_SAVE)(did_save_notebook)
        server.feature(NOTEBOOK_DOCUMENT_DID_CLOSE)(did_close_notebook)

        if server.initialization_options.hover.enable:
            server.feature(TEXT_DOCUMENT_HOVER)(hover)

        if server.initialization_options.semantic_tokens.enable:
            tokens_legend = SemanticTokensLegend(
                token_types=SUPPORTED_SEMANTIC_TYPES, token_modifiers=[]
            )
            server.feature(TEXT_DOCUMENT_SEMANTIC_TOKENS_FULL, tokens_legend)(
                semantic_tokens_full
            )
            server.feature(TEXT_DOCUMENT_SEMANTIC_TOKENS_RANGE, tokens_legend)(
                semantic_tokens_range
            )

        initialize_result: InitializeResult = super().lsp_initialize(params)
        workspace_options = initialization_options.workspace
        server.project = (
            Project(
                path=server.workspace.root_path,
                environment_path=workspace_options.environment_path,
                added_sys_path=workspace_options.extra_paths,
                smart_sys_path=True,
                load_unsafe_extensions=False,
            )
            if server.workspace.root_path
            else None
        )
        return initialize_result


class JediLanguageServer(LanguageServer):
    """Jedi language server.

    :attr initialization_options: initialized in lsp_initialize from the
        protocol_cls.
    :attr project: a Jedi project. This value is created in
        `JediLanguageServerProtocol.lsp_initialize`.
    """

    initialization_options: InitializationOptions
    project: Optional[Project]

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)


SERVER = JediLanguageServer(
    name="jedi-language-server",
    version=__version__,
    protocol_cls=JediLanguageServerProtocol,
    # Advertise support for Python notebook cells.
    notebook_document_sync=NotebookDocumentSyncOptions(
        notebook_selector=[
            NotebookDocumentSyncOptionsNotebookSelectorType2(
                cells=[
                    NotebookDocumentSyncOptionsNotebookSelectorType2CellsType(
                        language="python"
                    )
                ]
            )
        ]
    ),
)


# Server capabilities


@SERVER.feature(COMPLETION_ITEM_RESOLVE)
def completion_item_resolve(
    server: JediLanguageServer, params: CompletionItem
) -> CompletionItem:
    """Resolves documentation and detail of given completion item."""
    markup_kind = _choose_markup(server)
    return jedi_utils.lsp_completion_item_resolve(
        params, markup_kind=markup_kind
    )


@SERVER.feature(
    TEXT_DOCUMENT_COMPLETION,
    CompletionOptions(
        trigger_characters=[".", "'", '"'], resolve_provider=True
    ),
)
@notebook_utils.supports_notebooks
def completion(
    server: JediLanguageServer, params: CompletionParams
) -> Optional[CompletionList]:
    """Returns completion items."""
    snippet_disable = server.initialization_options.completion.disable_snippets
    resolve_eagerly = server.initialization_options.completion.resolve_eagerly
    ignore_patterns = server.initialization_options.completion.ignore_patterns
    document = server.workspace.get_text_document(params.text_document.uri)
    jedi_script = jedi_utils.script(server.project, document)
    jedi_lines = jedi_utils.line_column(params.position)
    completions_jedi_raw = jedi_script.complete(*jedi_lines)
    if not ignore_patterns:
        # A performance optimization. ignore_patterns should usually be empty;
        # this special case avoid repeated filter checks for the usual case.
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
        False,
    )
    markup_kind = _choose_markup(server)
    is_import_context = jedi_utils.is_import(
        script_=jedi_script,
        line=jedi_lines[0],
        column=jedi_lines[1],
    )
    enable_snippets = (
        snippet_support and not snippet_disable and not is_import_context
    )
    char_before_cursor = pygls_utils.char_before_cursor(
        document=server.workspace.get_text_document(params.text_document.uri),
        position=params.position,
    )
    char_after_cursor = pygls_utils.char_after_cursor(
        document=server.workspace.get_text_document(params.text_document.uri),
        position=params.position,
    )
    jedi_utils.clear_completions_cache()
    # number of characters in the string representation of the total number of
    # completions returned by jedi.
    total_completion_chars = len(str(len(completions_jedi_raw)))
    completion_items = [
        jedi_utils.lsp_completion_item(
            completion=completion,
            char_before_cursor=char_before_cursor,
            char_after_cursor=char_after_cursor,
            enable_snippets=enable_snippets,
            resolve_eagerly=resolve_eagerly,
            markup_kind=markup_kind,
            sort_append_text=str(count).zfill(total_completion_chars),
        )
        for count, completion in enumerate(completions_jedi)
        if completion.type != "path"
    ]
    return (
        CompletionList(is_incomplete=False, items=completion_items)
        if completion_items
        else None
    )


@SERVER.feature(
    TEXT_DOCUMENT_SIGNATURE_HELP,
    SignatureHelpOptions(trigger_characters=["(", ","]),
)
@notebook_utils.supports_notebooks
def signature_help(
    server: JediLanguageServer, params: TextDocumentPositionParams
) -> Optional[SignatureHelp]:
    """Returns signature help.

    Note: for docstring, we currently choose plaintext because coc doesn't
    handle markdown well in the signature. Will update if this changes in the
    future.
    """
    document = server.workspace.get_text_document(params.text_document.uri)
    jedi_script = jedi_utils.script(server.project, document)
    jedi_lines = jedi_utils.line_column(params.position)
    signatures_jedi = jedi_script.get_signatures(*jedi_lines)
    markup_kind = _choose_markup(server)
    signatures = [
        SignatureInformation(
            label=jedi_utils.signature_string(signature),
            documentation=MarkupContent(
                kind=markup_kind,
                value=jedi_utils.convert_docstring(
                    signature.docstring(raw=True),
                    markup_kind,
                ),
            ),
            parameters=[
                ParameterInformation(label=info.to_string())
                for info in signature.params
            ],
        )
        for signature in signatures_jedi
    ]
    return (
        SignatureHelp(
            signatures=signatures,
            active_signature=0,
            active_parameter=(
                signatures_jedi[0].index if signatures_jedi else 0
            ),
        )
        if signatures
        else None
    )


@SERVER.feature(TEXT_DOCUMENT_DECLARATION)
@notebook_utils.supports_notebooks
def declaration(
    server: JediLanguageServer, params: TextDocumentPositionParams
) -> Optional[List[Location]]:
    """Support Goto Declaration."""
    document = server.workspace.get_text_document(params.text_document.uri)
    jedi_script = jedi_utils.script(server.project, document)
    jedi_lines = jedi_utils.line_column(params.position)
    names = jedi_script.goto(*jedi_lines)
    definitions = [
        definition
        for definition in (jedi_utils.lsp_location(name) for name in names)
        if definition is not None
    ]
    return definitions if definitions else None


@SERVER.feature(TEXT_DOCUMENT_DEFINITION)
@notebook_utils.supports_notebooks
def definition(
    server: JediLanguageServer, params: TextDocumentPositionParams
) -> Optional[List[Location]]:
    """Support Goto Definition."""
    document = server.workspace.get_text_document(params.text_document.uri)
    jedi_script = jedi_utils.script(server.project, document)
    jedi_lines = jedi_utils.line_column(params.position)
    names = jedi_script.goto(
        *jedi_lines,
        follow_imports=True,
        follow_builtin_imports=True,
    )
    definitions = [
        definition
        for definition in (jedi_utils.lsp_location(name) for name in names)
        if definition is not None
    ]
    return definitions if definitions else None


@SERVER.feature(TEXT_DOCUMENT_TYPE_DEFINITION)
@notebook_utils.supports_notebooks
def type_definition(
    server: JediLanguageServer, params: TextDocumentPositionParams
) -> Optional[List[Location]]:
    """Support Goto Type Definition."""
    document = server.workspace.get_text_document(params.text_document.uri)
    jedi_script = jedi_utils.script(server.project, document)
    jedi_lines = jedi_utils.line_column(params.position)
    names = jedi_script.infer(*jedi_lines)
    definitions = [
        definition
        for definition in (jedi_utils.lsp_location(name) for name in names)
        if definition is not None
    ]
    return definitions if definitions else None


@SERVER.feature(TEXT_DOCUMENT_DOCUMENT_HIGHLIGHT)
def highlight(
    server: JediLanguageServer, params: TextDocumentPositionParams
) -> Optional[List[DocumentHighlight]]:
    """Support document highlight request.

    This function is called frequently, so we minimize the number of expensive
    calls. These calls are:

    1. Getting assignment of current symbol (script.goto)
    2. Getting all names in the current script (script.get_names)

    Finally, we only return names if there are more than 1. Otherwise, we don't
    want to highlight anything.
    """
    document = server.workspace.get_text_document(params.text_document.uri)
    jedi_script = jedi_utils.script(server.project, document)
    jedi_lines = jedi_utils.line_column(params.position)
    names = jedi_script.get_references(*jedi_lines, scope="file")
    lsp_ranges = [jedi_utils.lsp_range(name) for name in names]
    highlight_names = [
        DocumentHighlight(range=lsp_range)
        for lsp_range in lsp_ranges
        if lsp_range
    ]
    return highlight_names if highlight_names else None


# Registered with HOVER dynamically
@notebook_utils.supports_notebooks
def hover(
    server: JediLanguageServer, params: TextDocumentPositionParams
) -> Optional[Hover]:
    """Support Hover."""
    document = server.workspace.get_text_document(params.text_document.uri)
    jedi_script = jedi_utils.script(server.project, document)
    jedi_lines = jedi_utils.line_column(params.position)
    markup_kind = _choose_markup(server)
    hover_text = jedi_utils.hover_text(
        jedi_script.help(*jedi_lines),
        markup_kind,
        server.initialization_options,
    )
    if not hover_text:
        return None
    contents = MarkupContent(kind=markup_kind, value=hover_text)
    _range = pygls_utils.current_word_range(document, params.position)
    return Hover(contents=contents, range=_range)


@SERVER.feature(TEXT_DOCUMENT_REFERENCES)
@notebook_utils.supports_notebooks
def references(
    server: JediLanguageServer, params: TextDocumentPositionParams
) -> Optional[List[Location]]:
    """Obtain all references to text."""
    document = server.workspace.get_text_document(params.text_document.uri)
    jedi_script = jedi_utils.script(server.project, document)
    jedi_lines = jedi_utils.line_column(params.position)
    names = jedi_script.get_references(*jedi_lines)
    locations = [
        location
        for location in (jedi_utils.lsp_location(name) for name in names)
        if location is not None
    ]
    return locations if locations else None


@SERVER.feature(TEXT_DOCUMENT_DOCUMENT_SYMBOL)
def document_symbol(
    server: JediLanguageServer, params: DocumentSymbolParams
) -> Optional[Union[List[DocumentSymbol], List[SymbolInformation]]]:
    """Document Python document symbols, hierarchically if possible.

    In Jedi, valid values for `name.type` are:

    - `module`
    - `class`
    - `instance`
    - `function`
    - `param`
    - `path`
    - `keyword`
    - `statement`

    We do some cleaning here. For hierarchical symbols, names from scopes that
    aren't directly accessible with dot notation are removed from display. For
    non-hierarchical symbols, we simply remove `param` symbols. Others are
    included for completeness.
    """
    document = server.workspace.get_text_document(params.text_document.uri)
    jedi_script = jedi_utils.script(server.project, document)
    names = jedi_script.get_names(all_scopes=True, definitions=True)
    if get_capability(
        server.client_capabilities,
        "text_document.document_symbol.hierarchical_document_symbol_support",
        False,
    ):
        document_symbols = jedi_utils.lsp_document_symbols(names)
        return document_symbols if document_symbols else None

    symbol_information = [
        symbol_info
        for symbol_info in (
            jedi_utils.lsp_symbol_information(name, document.uri)
            for name in names
            if name.type != "param"
        )
        if symbol_info is not None
    ]
    return symbol_information if symbol_information else None


def _ignore_folder(path_check: str, jedi_ignore_folders: List[str]) -> bool:
    """Determines whether there's an ignore folder in the path.

    Intended to be used with the `workspace_symbol` function
    """
    for ignore_folder in jedi_ignore_folders:
        if f"/{ignore_folder}/" in path_check:
            return True
    return False


@SERVER.feature(WORKSPACE_SYMBOL)
def workspace_symbol(
    server: JediLanguageServer, params: WorkspaceSymbolParams
) -> Optional[List[SymbolInformation]]:
    """Document Python workspace symbols.

    Returns up to maxSymbols, or all symbols if maxSymbols is <= 0, ignoring
    the following symbols:

    1. Those that don't have a module_path associated with them (built-ins)
    2. Those that are not rooted in the current workspace.
    3. Those whose folders contain a directory that is ignored (.venv, etc)
    """
    if not server.project:
        return None
    names = server.project.complete_search(params.query)
    workspace_root = server.workspace.root_path
    ignore_folders = (
        server.initialization_options.workspace.symbols.ignore_folders
    )
    unignored_names = (
        name
        for name in names
        if name.module_path is not None
        and str(name.module_path).startswith(workspace_root)
        and not _ignore_folder(str(name.module_path), ignore_folders)
    )
    _symbols = (
        symbol
        for symbol in (
            jedi_utils.lsp_symbol_information(name) for name in unignored_names
        )
        if symbol is not None
    )
    max_symbols = server.initialization_options.workspace.symbols.max_symbols
    symbols = (
        list(itertools.islice(_symbols, max_symbols))
        if max_symbols > 0
        else list(_symbols)
    )
    return symbols if symbols else None


@SERVER.feature(TEXT_DOCUMENT_RENAME)
@notebook_utils.supports_notebooks
def rename(
    server: JediLanguageServer, params: RenameParams
) -> Optional[WorkspaceEdit]:
    """Rename a symbol across a workspace."""
    document = server.workspace.get_text_document(params.text_document.uri)
    jedi_script = jedi_utils.script(server.project, document)
    jedi_lines = jedi_utils.line_column(params.position)
    try:
        refactoring = jedi_script.rename(*jedi_lines, new_name=params.new_name)
    except RefactoringError:
        return None
    changes = text_edit_utils.lsp_document_changes(
        server.workspace, refactoring
    )
    return WorkspaceEdit(document_changes=changes) if changes else None


@SERVER.feature(
    TEXT_DOCUMENT_CODE_ACTION,
    CodeActionOptions(
        code_action_kinds=[
            CodeActionKind.RefactorInline,
            CodeActionKind.RefactorExtract,
        ],
    ),
)
@notebook_utils.supports_notebooks
def code_action(
    server: JediLanguageServer, params: CodeActionParams
) -> Optional[List[CodeAction]]:
    """Get code actions.

    Currently supports:
        1. Inline variable
        2. Extract variable
        3. Extract function
    """
    # Code actions are not yet supported for notebooks.
    notebook = server.workspace.get_notebook_document(
        cell_uri=params.text_document.uri
    )
    if notebook is not None:
        return None

    document = server.workspace.get_text_document(params.text_document.uri)
    jedi_script = jedi_utils.script(server.project, document)
    code_actions = []
    jedi_lines = jedi_utils.line_column(params.range.start)
    jedi_lines_extract = jedi_utils.line_column_range(params.range)

    try:
        if params.range.start.line != params.range.end.line:
            # refactor this at some point; control flow with exception == bad
            raise RefactoringError("inline only viable for single-line range")
        inline_refactoring = jedi_script.inline(*jedi_lines)
    except (RefactoringError, AttributeError, IndexError):
        inline_changes = []
    else:
        inline_changes = text_edit_utils.lsp_document_changes(
            server.workspace, inline_refactoring
        )
    if inline_changes:
        code_actions.append(
            CodeAction(
                title="Inline variable",
                kind=CodeActionKind.RefactorInline,
                edit=WorkspaceEdit(
                    document_changes=inline_changes,
                ),
            )
        )

    extract_var = (
        server.initialization_options.code_action.name_extract_variable
    )
    try:
        extract_variable_refactoring = jedi_script.extract_variable(
            new_name=extract_var, **jedi_lines_extract
        )
    except (RefactoringError, AttributeError, IndexError):
        extract_variable_changes = []
    else:
        extract_variable_changes = text_edit_utils.lsp_document_changes(
            server.workspace, extract_variable_refactoring
        )
    if extract_variable_changes:
        code_actions.append(
            CodeAction(
                title=f"Extract expression into variable '{extract_var}'",
                kind=CodeActionKind.RefactorExtract,
                edit=WorkspaceEdit(
                    document_changes=extract_variable_changes,
                ),
            )
        )

    extract_func = (
        server.initialization_options.code_action.name_extract_function
    )
    try:
        extract_function_refactoring = jedi_script.extract_function(
            new_name=extract_func, **jedi_lines_extract
        )
    except (RefactoringError, AttributeError, IndexError):
        extract_function_changes = []
    else:
        extract_function_changes = text_edit_utils.lsp_document_changes(
            server.workspace, extract_function_refactoring
        )
    if extract_function_changes:
        code_actions.append(
            CodeAction(
                title=f"Extract expression into function '{extract_func}'",
                kind=CodeActionKind.RefactorExtract,
                edit=WorkspaceEdit(
                    document_changes=extract_function_changes,
                ),
            )
        )

    return code_actions if code_actions else None


@SERVER.feature(WORKSPACE_DID_CHANGE_CONFIGURATION)
def did_change_configuration(
    server: JediLanguageServer,
    params: DidChangeConfigurationParams,
) -> None:
    """Implement event for workspace/didChangeConfiguration.

    Currently does nothing, but necessary for pygls. See::
        <https://github.com/pappasam/jedi-language-server/issues/58>
    """


EncodedSemanticToken = NamedTuple(
    "EncodedSemanticToken",
    [
        ("line", int),
        ("start", int),
        ("length", int),
        ("tokenType", int),
        ("tokenModifiers", int),
    ],
)
"""
Semantic token encoded into integers. Applicable for both absolute and relative positions.

See the LSP spec for details:
    <https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_semanticTokens>
"""


def _raw_semantic_token(
    server: JediLanguageServer, n: Name
) -> Union[EncodedSemanticToken, None]:
    """Find an appropriate semantic token for the name.

    This works by looking up the definition (using jedi ``goto``) of the name and
    matching the definition's type to one of the availabile semantic tokens. Further
    improvements are possible by inspecting context, e.g. semantic token modifiers such
    as ``abstract`` or ``async`` or even different tokens, e.g. ``property`` or
    ``method``. Dunder methods may warrant special treatment/modifiers as well.
    The return is a "raw" semantic token rather than a "diff." This is in the form of a
    length 5 array of integers where the elements are the line number, starting
    character, length, token index, and modifiers (as an integer whose binary
    representation has bits set at the indices of all applicable modifiers).
    """
    definitions: list[Name] = n.goto(
        follow_imports=True,
        follow_builtin_imports=True,
        only_stubs=False,
        prefer_stubs=False,
    )
    if not definitions:
        server.show_message_log(
            f"no definitions found for name \"{n.description}\" of type '{n.type}' ({n.line}:{n.column})",
            MessageType.Debug,
        )
        return None

    if len(definitions) > 1:
        def_lines = "\n".join(
            map(lambda n: str(n), definitions)
        )  # f-string expression part cannot include a backslash
        msg = (
            f"multiple definitions found for name \"{n.description}\" of type '{n.type}' ({n.line}:{n.column}):\n"
            f" {def_lines}"
        )
        server.show_message_log(msg, MessageType.Debug)

    definition, *_ = definitions
    definition_type = SEMANTIC_TO_TOKEN_ID.get(definition.type, None)
    if definition_type is None:
        server.show_message_log(
            f"no matching semantic token for \"{n.description}\" of type '{n.type}' ({n.line}:{n.column})",
            MessageType.Debug,
        )
        return None

    return EncodedSemanticToken(
        n.line - 1, n.column, len(n.name), definition_type, 0
    )


@SERVER.thread()
def semantic_tokens_full(
    server: JediLanguageServer, params: SemanticTokensParams
) -> SemanticTokens:
    """Thin wrap around  _semantic_tokens_range()."""
    document = server.workspace.get_text_document(params.text_document.uri)
    jedi_script = jedi_utils.script(server.project, document)

    server.show_message_log(
        f"semantic_tokens_full {params.text_document.uri} ",
        MessageType.Log,
    )

    return _semantic_tokens_range(
        server,
        jedi_script,
        Range(Position(0, 0), Position(INTEGER_MAX_VALUE, INTEGER_MAX_VALUE)),
    )


@SERVER.thread()
def semantic_tokens_range(
    server: JediLanguageServer, params: SemanticTokensRangeParams
) -> SemanticTokens:
    """Thin wrap around  _semantic_tokens_range()."""
    document = server.workspace.get_text_document(params.text_document.uri)
    jedi_script = jedi_utils.script(server.project, document)

    server.show_message_log(
        f"semantic_tokens_range {params.text_document.uri} {params.range}",
        MessageType.Log,
    )

    return _semantic_tokens_range(server, jedi_script, params.range)


def _semantic_tokens_range(
    server: JediLanguageServer, jedi_script: Script, doc_range: Range
) -> SemanticTokens:
    """General purpose function to do full / range semantic tokens."""
    line, column = doc_range.start.line, doc_range.start.character
    names = jedi_script.get_names(
        all_scopes=True, definitions=True, references=True
    )
    data: list[int] = []

    for n in names:
        if (
            not doc_range.start
            < Position(n.line - 1, n.column)
            < doc_range.end
        ):
            continue

        token = _raw_semantic_token(server, n)

        # server.show_message_log(
        #     f"raw token for name {n.description} ({n.line - 1}:{n.column}): {token}",
        #     MessageType.Debug,
        # )
        if token is None:
            continue

        token_line, token_column = token.line, token.start
        delta_column = (
            token_column - column if token_line == line else token_column
        )
        delta_line = token_line - line

        line = token_line
        column = token_column

        # server.show_message_log(
        #     f"diff token for name {n.description} ({n.line - 1}:{n.column}): {token}",
        #     MessageType.Debug,
        # )
        data.extend(
            [
                delta_line,
                delta_column,
                token.length,
                token.tokenType,
                token.tokenModifiers,
            ]
        )

    return SemanticTokens(data=data)


# Static capability or initializeOptions functions that rely on a specific
# client capability or user configuration. These are associated with
# JediLanguageServer within JediLanguageServerProtocol.lsp_initialize
@jedi_utils.debounce(1, keyed_by="uri")
def _publish_diagnostics(
    server: JediLanguageServer, uri: str, filename: Optional[str] = None
) -> None:
    """Helper function to publish diagnostics for a file."""
    # The debounce decorator delays the execution by 1 second
    # canceling notifications that happen in that interval.
    # Since this function is executed after a delay, we need to check
    # whether the document still exists
    if uri not in server.workspace.documents:
        return
    if filename is None:
        filename = uri

    doc = server.workspace.get_text_document(uri)
    diagnostic = jedi_utils.lsp_python_diagnostic(filename, doc.source)
    diagnostics = [diagnostic] if diagnostic else []

    server.publish_diagnostics(uri, diagnostics)


# TEXT_DOCUMENT_DID_SAVE
def did_save_diagnostics(
    server: JediLanguageServer, params: DidSaveTextDocumentParams
) -> None:
    """Actions run on textDocument/didSave: diagnostics."""
    _publish_diagnostics(server, params.text_document.uri)


def did_save_default(
    server: JediLanguageServer,
    params: DidSaveTextDocumentParams,
) -> None:
    """Actions run on textDocument/didSave: default."""


# TEXT_DOCUMENT_DID_CHANGE
def did_change_diagnostics(
    server: JediLanguageServer, params: DidChangeTextDocumentParams
) -> None:
    """Actions run on textDocument/didChange: diagnostics."""
    _publish_diagnostics(server, params.text_document.uri)


def did_change_default(
    server: JediLanguageServer,
    params: DidChangeTextDocumentParams,
) -> None:
    """Actions run on textDocument/didChange: default."""


# TEXT_DOCUMENT_DID_OPEN
def did_open_diagnostics(
    server: JediLanguageServer, params: DidOpenTextDocumentParams
) -> None:
    """Actions run on textDocument/didOpen: diagnostics."""
    _publish_diagnostics(server, params.text_document.uri)


def did_open_default(
    server: JediLanguageServer,
    params: DidOpenTextDocumentParams,
) -> None:
    """Actions run on textDocument/didOpen: default."""


# TEXT_DOCUMENT_DID_CLOSE
def did_close_diagnostics(
    server: JediLanguageServer, params: DidCloseTextDocumentParams
) -> None:
    """Actions run on textDocument/didClose: diagnostics."""
    _clear_diagnostics(server, params.text_document.uri)


def did_close_default(
    server: JediLanguageServer,
    params: DidCloseTextDocumentParams,
) -> None:
    """Actions run on textDocument/didClose: default."""


# NOTEBOOK_DOCUMENT_DID_SAVE
def did_save_notebook_diagnostics(
    server: JediLanguageServer,
    params: DidSaveNotebookDocumentParams,
) -> None:
    """Actions run on notebookDocument/didSave: diagnostics."""
    notebook_document = server.workspace.get_notebook_document(
        notebook_uri=params.notebook_document.uri
    )
    if notebook_document:
        for cell in notebook_document.cells:
            text_document = server.workspace.text_documents[cell.document]
            _publish_cell_diagnostics(server, text_document.uri)


def did_save_notebook_default(
    server: JediLanguageServer,
    params: DidSaveNotebookDocumentParams,
) -> None:
    """Actions run on notebookDocument/didSave: default."""


# NOTEBOOK_DOCUMENT_DID_CHANGE
def did_change_notebook_diagnostics(
    server: JediLanguageServer,
    params: DidChangeNotebookDocumentParams,
) -> None:
    """Actions run on notebookDocument/didChange: diagnostics."""
    cells = params.change.cells
    if cells:
        structure = cells.structure
        if structure:
            did_open = structure.did_open
            if did_open:
                for text_document_item in did_open:
                    _publish_cell_diagnostics(
                        server,
                        text_document_item.uri,
                    )
            did_close = structure.did_close
            if did_close:
                for text_document in did_close:
                    _clear_diagnostics(server, text_document.uri)
        text_content = cells.text_content
        if text_content:
            for change in text_content:
                _publish_cell_diagnostics(server, change.document.uri)


def did_change_notebook_default(
    server: JediLanguageServer,
    params: DidChangeNotebookDocumentParams,
) -> None:
    """Actions run on notebookDocument/didChange: default."""


# NOTEBOOK_DOCUMENT_DID_OPEN
def did_open_notebook_diagnostics(
    server: JediLanguageServer,
    params: DidOpenNotebookDocumentParams,
) -> None:
    """Actions run on notebookDocument/didOpen: diagnostics."""
    for text_document in params.cell_text_documents:
        _publish_cell_diagnostics(server, text_document.uri)


def did_open_notebook_default(
    server: JediLanguageServer,
    params: DidOpenNotebookDocumentParams,
) -> None:
    """Actions run on notebookDocument/didOpen: default."""


# NOTEBOOK_DOCUMENT_DID_CLOSE
def did_close_notebook_diagnostics(
    server: JediLanguageServer,
    params: DidCloseNotebookDocumentParams,
) -> None:
    """Actions run on notebookDocument/didClose: diagnostics."""
    for text_document in params.cell_text_documents:
        _clear_diagnostics(server, text_document.uri)


def did_close_notebook_default(
    server: JediLanguageServer,
    params: DidCloseNotebookDocumentParams,
) -> None:
    """Actions run on notebookDocument/didClose: default."""


def _clear_diagnostics(server: JediLanguageServer, uri: str) -> None:
    """Helper function to clear diagnostics for a file."""
    server.publish_diagnostics(uri, [])


def _publish_cell_diagnostics(server: JediLanguageServer, uri: str) -> None:
    filename = notebook_utils.cell_filename(server.workspace, uri)
    return _publish_diagnostics(server, uri, filename)


def _choose_markup(server: JediLanguageServer) -> MarkupKind:
    """Returns the preferred or first of supported markup kinds."""
    markup_preferred = server.initialization_options.markup_kind_preferred
    markup_supported = get_capability(
        server.client_capabilities,
        "text_document.completion.completion_item.documentation_format",
        [MarkupKind.PlainText],
    )

    return MarkupKind(
        markup_preferred
        if markup_preferred in markup_supported
        else markup_supported[0]
    )
