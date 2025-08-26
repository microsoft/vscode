"""Jedi types mapped to LSP types."""

from lotas.erdos._vendor.lsprotocol.types import CompletionItemKind, SymbolKind

# See docs:
# https://jedi.readthedocs.io/en/latest/docs/api-classes.html?highlight=type#jedi.api.classes.BaseName.type

_JEDI_COMPLETION_TYPE_MAP = {
    "module": CompletionItemKind.Module,
    "class": CompletionItemKind.Class,
    "instance": CompletionItemKind.Variable,
    "function": CompletionItemKind.Function,
    "param": CompletionItemKind.Variable,
    "path": CompletionItemKind.File,
    "keyword": CompletionItemKind.Keyword,
    "property": CompletionItemKind.Property,
    "statement": CompletionItemKind.Variable,
}

_JEDI_SYMBOL_TYPE_MAP = {
    "module": SymbolKind.Module,
    "class": SymbolKind.Class,
    "instance": SymbolKind.Variable,
    "function": SymbolKind.Function,
    "param": SymbolKind.Variable,
    "path": SymbolKind.File,
    "keyword": SymbolKind.Class,
    "property": SymbolKind.Property,
    "statement": SymbolKind.Variable,
}


def get_lsp_completion_type(jedi_type: str) -> CompletionItemKind:
    """Get type map.

    Always return a value.
    """
    return _JEDI_COMPLETION_TYPE_MAP.get(jedi_type, CompletionItemKind.Text)


def get_lsp_symbol_type(jedi_type: str) -> SymbolKind:
    """Get type map.

    Always return a value.
    """
    return _JEDI_SYMBOL_TYPE_MAP.get(jedi_type, SymbolKind.Namespace)
