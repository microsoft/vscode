"""
    pygments.lexers.vyper
    ~~~~~~~~~~~~~~~~~~~~~

    Lexer for the Vyper Smart Contract language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, bygroups, words
from erdos.erdos._vendor.pygments.token import (Comment, String, Name, Keyword, Number,
                            Operator, Punctuation, Text, Whitespace)

__all__ = ['VyperLexer']


class VyperLexer(RegexLexer):
    """For the Vyper smart contract language.
    """
    name = 'Vyper'
    aliases = ['vyper']
    filenames = ['*.vy']
    url = "https://vyper.readthedocs.io"
    version_added = '2.17'

    tokens = {
        'root': [
            # Whitespace
            (r'\s+', Whitespace),

            # Line continuations
            (r'(\\)(\n|\r\n|\r)', bygroups(Text, Whitespace)),

            # Comments - inline and multiline
            (r'#.*$', Comment.Single),
            (r'\"\"\"', Comment.Multiline, 'multiline-comment'),

            # Strings - single and double
            (r"'", String.Single, 'single-string'),
            (r'"', String.Double, 'double-string'),

            # Functions (working)
            (r'(def)(\s+)([a-zA-Z_][a-zA-Z0-9_]*)',
             bygroups(Keyword, Whitespace, Name.Function)),

            # Event and Struct
            (r'(event|struct|interface|log)(\s+)([a-zA-Z_][a-zA-Z0-9_]*)',
             bygroups(Keyword, Whitespace, Name.Class)),

            # Imports
            (r'(from)(\s+)(vyper\.\w+)(\s+)(import)(\s+)(\w+)',
             bygroups(Keyword, Whitespace, Name.Namespace, Whitespace,
                      Keyword, Whitespace, Name.Class)),

            # Numeric Literals
            (r'\b0x[0-9a-fA-F]+\b', Number.Hex),
            (r'\b(\d{1,3}(?:_\d{3})*|\d+)\b', Number.Integer),
            (r'\b\d+\.\d*\b', Number.Float),

            # Keywords
            (words(('def', 'event', 'pass', 'return', 'for', 'while', 'if', 'elif',
                    'else', 'assert', 'raise', 'import', 'in', 'struct', 'implements',
                    'interface', 'from', 'indexed', 'log', 'extcall', 'staticcall'),
                   prefix=r'\b', suffix=r'\b'), Keyword),

            # Visibility and State Mutability
            (words(('public', 'private', 'view', 'pure', 'constant',
                    'immutable', 'nonpayable'), prefix=r'\b', suffix=r'\b'),
             Keyword.Declaration),

            # Built-in Functions
            (words(('bitwise_and', 'bitwise_not', 'bitwise_or', 'bitwise_xor', 'shift',
                    'create_minimal_proxy_to', 'create_copy_of', 'create_from_blueprint',
                    'ecadd', 'ecmul', 'ecrecover', 'keccak256', 'sha256', 'concat', 'convert',
                    'uint2str', 'extract32', 'slice', 'abs', 'ceil', 'floor', 'max', 'max_value',
                    'min', 'min_value', 'pow_mod256', 'sqrt', 'isqrt', 'uint256_addmod',
                    'uint256_mulmod', 'unsafe_add', 'unsafe_sub', 'unsafe_mul', 'unsafe_div',
                    'as_wei_value', 'blockhash', 'empty', 'len', 'method_id', '_abi_encode',
                    '_abi_decode', 'print', 'range'), prefix=r'\b', suffix=r'\b'),
             Name.Builtin),

            # Built-in Variables and Attributes
            (words(('msg.sender', 'msg.value', 'block.timestamp', 'block.number', 'msg.gas'),
                   prefix=r'\b', suffix=r'\b'),
             Name.Builtin.Pseudo),

            (words(('uint', 'uint8', 'uint16', 'uint32', 'uint64', 'uint128', 'uint256',
                    'int', 'int8', 'int16', 'int32', 'int64', 'int128', 'int256', 'bool',
                    'decimal', 'bytes', 'bytes1', 'bytes2', 'bytes3', 'bytes4', 'bytes5',
                    'bytes6', 'bytes7', 'bytes8', 'bytes9', 'bytes10', 'bytes11',
                    'bytes12', 'bytes13', 'bytes14', 'bytes15', 'bytes16', 'bytes17',
                    'bytes18', 'bytes19', 'bytes20', 'bytes21', 'bytes22', 'bytes23',
                    'bytes24', 'bytes25', 'bytes26', 'bytes27', 'bytes28', 'bytes29',
                    'bytes30', 'bytes31', 'bytes32', 'string', 'String', 'address',
                    'enum', 'struct'), prefix=r'\b', suffix=r'\b'),
             Keyword.Type),

            # indexed keywords
            (r'\b(indexed)\b(\s*)(\()(\s*)(\w+)(\s*)(\))',
             bygroups(Keyword, Whitespace, Punctuation, Whitespace,
                      Keyword.Type, Punctuation)),

            # Operators and Punctuation
            (r'(\+|\-|\*|\/|<=?|>=?|==|!=|=|\||&|%)', Operator),
            (r'[.,:;()\[\]{}]', Punctuation),

            # Other variable names and types
            (r'@[\w.]+', Name.Decorator),
            (r'__\w+__', Name.Magic),  # Matches double underscores followed by word characters
            (r'EMPTY_BYTES32', Name.Constant),
            (r'\bERC20\b', Name.Class),
            (r'\bself\b', Name.Attribute),

            (r'Bytes\[\d+\]', Keyword.Type),

            # Generic names and variables
            (r'\b[a-zA-Z_]\w*\b:', Name.Variable),
            (r'\b[a-zA-Z_]\w*\b', Name),

        ],

        'multiline-comment': [
            (r'\"\"\"', Comment.Multiline, '#pop'),
            (r'[^"]+', Comment.Multiline),
            (r'\"', Comment.Multiline)
        ],

        'single-string': [
            (r"[^\\']+", String.Single),
            (r"'", String.Single, '#pop'),
            (r'\\.', String.Escape),
        ],

        'double-string': [
            (r'[^\\"]+', String.Double),
            (r'"', String.Double, '#pop'),
            (r'\\.', String.Escape),
        ]
    }
