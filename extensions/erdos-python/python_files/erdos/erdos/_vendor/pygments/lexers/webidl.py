"""
    pygments.lexers.webidl
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexers for Web IDL, including some extensions.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer, default, include, words
from erdos.erdos._vendor.pygments.token import Comment, Keyword, Name, Number, Punctuation, \
    String, Text

__all__ = ['WebIDLLexer']

_builtin_types = (
    # primitive types
    'byte', 'octet', 'boolean',
    r'(?:unsigned\s+)?(?:short|long(?:\s+long)?)',
    r'(?:unrestricted\s+)?(?:float|double)',
    # string types
    'DOMString', 'ByteString', 'USVString',
    # exception types
    'Error', 'DOMException',
    # typed array types
    'Uint8Array', 'Uint16Array', 'Uint32Array', 'Uint8ClampedArray',
    'Float32Array', 'Float64Array',
    # buffer source types
    'ArrayBuffer', 'DataView', 'Int8Array', 'Int16Array', 'Int32Array',
    # other
    'any', 'void', 'object', 'RegExp',
)
_identifier = r'_?[A-Za-z][a-zA-Z0-9_-]*'
_keyword_suffix = r'(?![\w-])'
_string = r'"[^"]*"'


class WebIDLLexer(RegexLexer):
    """
    For Web IDL.
    """

    name = 'Web IDL'
    url = 'https://www.w3.org/wiki/Web_IDL'
    aliases = ['webidl']
    filenames = ['*.webidl']
    version_added = '2.6'

    tokens = {
        'common': [
            (r'\s+', Text),
            (r'(?s)/\*.*?\*/', Comment.Multiline),
            (r'//.*', Comment.Single),
            (r'^#.*', Comment.Preproc),
        ],
        'root': [
            include('common'),
            (r'\[', Punctuation, 'extended_attributes'),
            (r'partial' + _keyword_suffix, Keyword),
            (r'typedef' + _keyword_suffix, Keyword, ('typedef', 'type')),
            (r'interface' + _keyword_suffix, Keyword, 'interface_rest'),
            (r'enum' + _keyword_suffix, Keyword, 'enum_rest'),
            (r'callback' + _keyword_suffix, Keyword, 'callback_rest'),
            (r'dictionary' + _keyword_suffix, Keyword, 'dictionary_rest'),
            (r'namespace' + _keyword_suffix, Keyword, 'namespace_rest'),
            (_identifier, Name.Class, 'implements_rest'),
        ],
        'extended_attributes': [
            include('common'),
            (r',', Punctuation),
            (_identifier, Name.Decorator),
            (r'=', Punctuation, 'extended_attribute_rest'),
            (r'\(', Punctuation, 'argument_list'),
            (r'\]', Punctuation, '#pop'),
        ],
        'extended_attribute_rest': [
            include('common'),
            (_identifier, Name, 'extended_attribute_named_rest'),
            (_string, String),
            (r'\(', Punctuation, 'identifier_list'),
            default('#pop'),
        ],
        'extended_attribute_named_rest': [
            include('common'),
            (r'\(', Punctuation, 'argument_list'),
            default('#pop'),
        ],
        'argument_list': [
            include('common'),
            (r'\)', Punctuation, '#pop'),
            default('argument'),
        ],
        'argument': [
            include('common'),
            (r'optional' + _keyword_suffix, Keyword),
            (r'\[', Punctuation, 'extended_attributes'),
            (r',', Punctuation, '#pop'),
            (r'\)', Punctuation, '#pop:2'),
            default(('argument_rest', 'type'))
        ],
        'argument_rest': [
            include('common'),
            (_identifier, Name.Variable),
            (r'\.\.\.', Punctuation),
            (r'=', Punctuation, 'default_value'),
            default('#pop'),
        ],
        'identifier_list': [
            include('common'),
            (_identifier, Name.Class),
            (r',', Punctuation),
            (r'\)', Punctuation, '#pop'),
        ],
        'type': [
            include('common'),
            (r'(?:' + r'|'.join(_builtin_types) + r')' + _keyword_suffix,
             Keyword.Type, 'type_null'),
            (words(('sequence', 'Promise', 'FrozenArray'),
                   suffix=_keyword_suffix), Keyword.Type, 'type_identifier'),
            (_identifier, Name.Class, 'type_identifier'),
            (r'\(', Punctuation, 'union_type'),
        ],
        'union_type': [
            include('common'),
            (r'or' + _keyword_suffix, Keyword),
            (r'\)', Punctuation, ('#pop', 'type_null')),
            default('type'),
        ],
        'type_identifier': [
            (r'<', Punctuation, 'type_list'),
            default(('#pop', 'type_null'))
        ],
        'type_null': [
            (r'\?', Punctuation),
            default('#pop:2'),
        ],
        'default_value': [
            include('common'),
            include('const_value'),
            (_string, String, '#pop'),
            (r'\[\s*\]', Punctuation, '#pop'),
        ],
        'const_value': [
            include('common'),
            (words(('true', 'false', '-Infinity', 'Infinity', 'NaN', 'null'),
                   suffix=_keyword_suffix), Keyword.Constant, '#pop'),
            (r'-?(?:(?:[0-9]+\.[0-9]*|[0-9]*\.[0-9]+)(?:[Ee][+-]?[0-9]+)?' +
             r'|[0-9]+[Ee][+-]?[0-9]+)', Number.Float, '#pop'),
            (r'-?[1-9][0-9]*', Number.Integer, '#pop'),
            (r'-?0[Xx][0-9A-Fa-f]+', Number.Hex, '#pop'),
            (r'-?0[0-7]*', Number.Oct, '#pop'),
        ],
        'typedef': [
            include('common'),
            (_identifier, Name.Class),
            (r';', Punctuation, '#pop'),
        ],
        'namespace_rest': [
            include('common'),
            (_identifier, Name.Namespace),
            (r'\{', Punctuation, 'namespace_body'),
            (r';', Punctuation, '#pop'),
        ],
        'namespace_body': [
            include('common'),
            (r'\[', Punctuation, 'extended_attributes'),
            (r'readonly' + _keyword_suffix, Keyword),
            (r'attribute' + _keyword_suffix,
             Keyword, ('attribute_rest', 'type')),
            (r'const' + _keyword_suffix, Keyword, ('const_rest', 'type')),
            (r'\}', Punctuation, '#pop'),
            default(('operation_rest', 'type')),
        ],
        'interface_rest': [
            include('common'),
            (_identifier, Name.Class),
            (r':', Punctuation),
            (r'\{', Punctuation, 'interface_body'),
            (r';', Punctuation, '#pop'),
        ],
        'interface_body': [
            (words(('iterable', 'maplike', 'setlike'), suffix=_keyword_suffix),
             Keyword, 'iterable_maplike_setlike_rest'),
            (words(('setter', 'getter', 'creator', 'deleter', 'legacycaller',
                    'inherit', 'static', 'stringifier', 'jsonifier'),
                   suffix=_keyword_suffix), Keyword),
            (r'serializer' + _keyword_suffix, Keyword, 'serializer_rest'),
            (r';', Punctuation),
            include('namespace_body'),
        ],
        'attribute_rest': [
            include('common'),
            (_identifier, Name.Variable),
            (r';', Punctuation, '#pop'),
        ],
        'const_rest': [
            include('common'),
            (_identifier, Name.Constant),
            (r'=', Punctuation, 'const_value'),
            (r';', Punctuation, '#pop'),
        ],
        'operation_rest': [
            include('common'),
            (r';', Punctuation, '#pop'),
            default('operation'),
        ],
        'operation': [
            include('common'),
            (_identifier, Name.Function),
            (r'\(', Punctuation, 'argument_list'),
            (r';', Punctuation, '#pop:2'),
        ],
        'iterable_maplike_setlike_rest': [
            include('common'),
            (r'<', Punctuation, 'type_list'),
            (r';', Punctuation, '#pop'),
        ],
        'type_list': [
            include('common'),
            (r',', Punctuation),
            (r'>', Punctuation, '#pop'),
            default('type'),
        ],
        'serializer_rest': [
            include('common'),
            (r'=', Punctuation, 'serialization_pattern'),
            (r';', Punctuation, '#pop'),
            default('operation'),
        ],
        'serialization_pattern': [
            include('common'),
            (_identifier, Name.Variable, '#pop'),
            (r'\{', Punctuation, 'serialization_pattern_map'),
            (r'\[', Punctuation, 'serialization_pattern_list'),
        ],
        'serialization_pattern_map': [
            include('common'),
            (words(('getter', 'inherit', 'attribute'),
                   suffix=_keyword_suffix), Keyword),
            (r',', Punctuation),
            (_identifier, Name.Variable),
            (r'\}', Punctuation, '#pop:2'),
        ],
        'serialization_pattern_list': [
            include('common'),
            (words(('getter', 'attribute'), suffix=_keyword_suffix), Keyword),
            (r',', Punctuation),
            (_identifier, Name.Variable),
            (r']', Punctuation, '#pop:2'),
        ],
        'enum_rest': [
            include('common'),
            (_identifier, Name.Class),
            (r'\{', Punctuation, 'enum_body'),
            (r';', Punctuation, '#pop'),
        ],
        'enum_body': [
            include('common'),
            (_string, String),
            (r',', Punctuation),
            (r'\}', Punctuation, '#pop'),
        ],
        'callback_rest': [
            include('common'),
            (r'interface' + _keyword_suffix,
             Keyword, ('#pop', 'interface_rest')),
            (_identifier, Name.Class),
            (r'=', Punctuation, ('operation', 'type')),
            (r';', Punctuation, '#pop'),
        ],
        'dictionary_rest': [
            include('common'),
            (_identifier, Name.Class),
            (r':', Punctuation),
            (r'\{', Punctuation, 'dictionary_body'),
            (r';', Punctuation, '#pop'),
        ],
        'dictionary_body': [
            include('common'),
            (r'\[', Punctuation, 'extended_attributes'),
            (r'required' + _keyword_suffix, Keyword),
            (r'\}', Punctuation, '#pop'),
            default(('dictionary_item', 'type')),
        ],
        'dictionary_item': [
            include('common'),
            (_identifier, Name.Variable),
            (r'=', Punctuation, 'default_value'),
            (r';', Punctuation, '#pop'),
        ],
        'implements_rest': [
            include('common'),
            (r'implements' + _keyword_suffix, Keyword),
            (_identifier, Name.Class),
            (r';', Punctuation, '#pop'),
        ],
    }
