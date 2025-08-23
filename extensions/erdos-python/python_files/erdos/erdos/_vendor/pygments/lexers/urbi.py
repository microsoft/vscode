"""
    pygments.lexers.urbi
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for UrbiScript language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import ExtendedRegexLexer, words
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Number, Punctuation

__all__ = ['UrbiscriptLexer']


class UrbiscriptLexer(ExtendedRegexLexer):
    """
    For UrbiScript source code.
    """

    name = 'UrbiScript'
    aliases = ['urbiscript']
    filenames = ['*.u']
    mimetypes = ['application/x-urbiscript']
    url = 'https://github.com/urbiforge/urbi'
    version_added = '1.5'

    flags = re.DOTALL

    # TODO
    # - handle Experimental and deprecated tags with specific tokens
    # - handle Angles and Durations with specific tokens

    def blob_callback(lexer, match, ctx):
        text_before_blob = match.group(1)
        blob_start = match.group(2)
        blob_size_str = match.group(3)
        blob_size = int(blob_size_str)
        yield match.start(), String, text_before_blob
        ctx.pos += len(text_before_blob)

        # if blob size doesn't match blob format (example : "\B(2)(aaa)")
        # yield blob as a string
        if ctx.text[match.end() + blob_size] != ")":
            result = "\\B(" + blob_size_str + ")("
            yield match.start(), String, result
            ctx.pos += len(result)
            return

        # if blob is well formatted, yield as Escape
        blob_text = blob_start + ctx.text[match.end():match.end()+blob_size] + ")"
        yield match.start(), String.Escape, blob_text
        ctx.pos = match.end() + blob_size + 1  # +1 is the ending ")"

    tokens = {
        'root': [
            (r'\s+', Text),
            # comments
            (r'//.*?\n', Comment),
            (r'/\*', Comment.Multiline, 'comment'),
            (r'(every|for|loop|while)(?:;|&|\||,)', Keyword),
            (words((
                'assert', 'at', 'break', 'case', 'catch', 'closure', 'compl',
                'continue', 'default', 'else', 'enum', 'every', 'external',
                'finally', 'for', 'freezeif', 'if', 'new', 'onleave', 'return',
                'stopif', 'switch', 'this', 'throw', 'timeout', 'try',
                'waituntil', 'whenever', 'while'), suffix=r'\b'),
             Keyword),
            (words((
                'asm', 'auto', 'bool', 'char', 'const_cast', 'delete', 'double',
                'dynamic_cast', 'explicit', 'export', 'extern', 'float', 'friend',
                'goto', 'inline', 'int', 'long', 'mutable', 'namespace', 'register',
                'reinterpret_cast', 'short', 'signed', 'sizeof', 'static_cast',
                'struct', 'template', 'typedef', 'typeid', 'typename', 'union',
                'unsigned', 'using', 'virtual', 'volatile', 'wchar_t'), suffix=r'\b'),
             Keyword.Reserved),
            # deprecated keywords, use a meaningful token when available
            (r'(emit|foreach|internal|loopn|static)\b', Keyword),
            # ignored keywords, use a meaningful token when available
            (r'(private|protected|public)\b', Keyword),
            (r'(var|do|const|function|class)\b', Keyword.Declaration),
            (r'(true|false|nil|void)\b', Keyword.Constant),
            (words((
                'Barrier', 'Binary', 'Boolean', 'CallMessage', 'Channel', 'Code',
                'Comparable', 'Container', 'Control', 'Date', 'Dictionary', 'Directory',
                'Duration', 'Enumeration', 'Event', 'Exception', 'Executable', 'File',
                'Finalizable', 'Float', 'FormatInfo', 'Formatter', 'Global', 'Group',
                'Hash', 'InputStream', 'IoService', 'Job', 'Kernel', 'Lazy', 'List',
                'Loadable', 'Lobby', 'Location', 'Logger', 'Math', 'Mutex', 'nil',
                'Object', 'Orderable', 'OutputStream', 'Pair', 'Path', 'Pattern',
                'Position', 'Primitive', 'Process', 'Profile', 'PseudoLazy', 'PubSub',
                'RangeIterable', 'Regexp', 'Semaphore', 'Server', 'Singleton', 'Socket',
                'StackFrame', 'Stream', 'String', 'System', 'Tag', 'Timeout',
                'Traceable', 'TrajectoryGenerator', 'Triplet', 'Tuple', 'UObject',
                'UValue', 'UVar'), suffix=r'\b'),
             Name.Builtin),
            (r'(?:this)\b', Name.Builtin.Pseudo),
            # don't match single | and &
            (r'(?:[-=+*%/<>~^:]+|\.&?|\|\||&&)', Operator),
            (r'(?:and_eq|and|bitand|bitor|in|not|not_eq|or_eq|or|xor_eq|xor)\b',
             Operator.Word),
            (r'[{}\[\]()]+', Punctuation),
            (r'(?:;|\||,|&|\?|!)+', Punctuation),
            (r'[$a-zA-Z_]\w*', Name.Other),
            (r'0x[0-9a-fA-F]+', Number.Hex),
            # Float, Integer, Angle and Duration
            (r'(?:[0-9]+(?:(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)?'
             r'((?:rad|deg|grad)|(?:ms|s|min|h|d))?)\b', Number.Float),
            # handle binary blob in strings
            (r'"', String.Double, "string.double"),
            (r"'", String.Single, "string.single"),
        ],
        'string.double': [
            (r'((?:\\\\|\\"|[^"])*?)(\\B\((\d+)\)\()', blob_callback),
            (r'(\\\\|\\[^\\]|[^"\\])*?"', String.Double, '#pop'),
        ],
        'string.single': [
            (r"((?:\\\\|\\'|[^'])*?)(\\B\((\d+)\)\()", blob_callback),
            (r"(\\\\|\\[^\\]|[^'\\])*?'", String.Single, '#pop'),
        ],
        # from http://pygments.org/docs/lexerdevelopment/#changing-states
        'comment': [
            (r'[^*/]', Comment.Multiline),
            (r'/\*', Comment.Multiline, '#push'),
            (r'\*/', Comment.Multiline, '#pop'),
            (r'[*/]', Comment.Multiline),
        ]
    }

    def analyse_text(text):
        """This is fairly similar to C and others, but freezeif and
        waituntil are unique keywords."""
        result = 0

        if 'freezeif' in text:
            result += 0.05

        if 'waituntil' in text:
            result += 0.05

        return result
