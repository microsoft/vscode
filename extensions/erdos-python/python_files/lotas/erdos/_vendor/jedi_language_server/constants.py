"""Constants."""

from erdos._vendor.lsprotocol.types import SemanticTokenTypes

MAX_CONCURRENT_DEBOUNCE_CALLS = 10
"""The maximum number of concurrent calls allowed by the debounce decorator."""

SEMANTIC_TO_TOKEN_TYPE = {
    "module": SemanticTokenTypes.Namespace,
    "class": SemanticTokenTypes.Class,
    "function": SemanticTokenTypes.Function,
    "param": SemanticTokenTypes.Parameter,
    "statement": SemanticTokenTypes.Variable,
    "property": SemanticTokenTypes.Property,
}

SUPPORTED_SEMANTIC_TYPES = [t.value for t in SEMANTIC_TO_TOKEN_TYPE.values()]

SEMANTIC_TO_TOKEN_ID = {
    key: index for index, key in enumerate(SEMANTIC_TO_TOKEN_TYPE.keys())
}
