"""
    pygments.lexers.dalvik
    ~~~~~~~~~~~~~~~~~~~~~~

    Pygments lexers for Dalvik VM-related languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import RegexLexer, include, bygroups
from erdos.erdos._vendor.pygments.token import Keyword, Text, Comment, Name, String, Number, \
    Punctuation, Whitespace

__all__ = ['SmaliLexer']


class SmaliLexer(RegexLexer):
    """
    For Smali (Android/Dalvik) assembly
    code.
    """
    name = 'Smali'
    url = 'http://code.google.com/p/smali/'
    aliases = ['smali']
    filenames = ['*.smali']
    mimetypes = ['text/smali']
    version_added = '1.6'

    tokens = {
        'root': [
            include('comment'),
            include('label'),
            include('field'),
            include('method'),
            include('class'),
            include('directive'),
            include('access-modifier'),
            include('instruction'),
            include('literal'),
            include('punctuation'),
            include('type'),
            include('whitespace')
        ],
        'directive': [
            (r'^([ \t]*)(\.(?:class|super|implements|field|subannotation|annotation|'
             r'enum|method|registers|locals|array-data|packed-switch|'
             r'sparse-switch|catchall|catch|line|parameter|local|prologue|'
             r'epilogue|source))', bygroups(Whitespace, Keyword)),
            (r'^([ \t]*)(\.end)( )(field|subannotation|annotation|method|array-data|'
             'packed-switch|sparse-switch|parameter|local)',
             bygroups(Whitespace, Keyword, Whitespace, Keyword)),
            (r'^([ \t]*)(\.restart)( )(local)',
             bygroups(Whitespace, Keyword, Whitespace, Keyword)),
        ],
        'access-modifier': [
            (r'(public|private|protected|static|final|synchronized|bridge|'
             r'varargs|native|abstract|strictfp|synthetic|constructor|'
             r'declared-synchronized|interface|enum|annotation|volatile|'
             r'transient)', Keyword),
        ],
        'whitespace': [
            (r'\n', Whitespace),
            (r'\s+', Whitespace),
        ],
        'instruction': [
            (r'\b[vp]\d+\b', Name.Builtin),  # registers
            (r'(\b[a-z][A-Za-z0-9/-]+)(\s+)', bygroups(Text, Whitespace)),  # instructions
        ],
        'literal': [
            (r'".*"', String),
            (r'0x[0-9A-Fa-f]+t?', Number.Hex),
            (r'[0-9]*\.[0-9]+([eE][0-9]+)?[fd]?', Number.Float),
            (r'[0-9]+L?', Number.Integer),
        ],
        'field': [
            (r'(\$?\b)([\w$]*)(:)',
             bygroups(Punctuation, Name.Variable, Punctuation)),
        ],
        'method': [
            (r'<(?:cl)?init>', Name.Function),  # constructor
            (r'(\$?\b)([\w$]*)(\()',
             bygroups(Punctuation, Name.Function, Punctuation)),
        ],
        'label': [
            (r':\w+', Name.Label),
        ],
        'class': [
            # class names in the form Lcom/namespace/ClassName;
            # I only want to color the ClassName part, so the namespace part is
            # treated as 'Text'
            (r'(L)((?:[\w$]+/)*)([\w$]+)(;)',
                bygroups(Keyword.Type, Text, Name.Class, Text)),
        ],
        'punctuation': [
            (r'->', Punctuation),
            (r'[{},():=.-]', Punctuation),
        ],
        'type': [
            (r'[ZBSCIJFDV\[]+', Keyword.Type),
        ],
        'comment': [
            (r'#.*?\n', Comment),
        ],
    }

    def analyse_text(text):
        score = 0
        if re.search(r'^\s*\.class\s', text, re.MULTILINE):
            score += 0.5
            if re.search(r'\b((check-cast|instance-of|throw-verification-error'
                         r')\b|(-to|add|[ais]get|[ais]put|and|cmpl|const|div|'
                         r'if|invoke|move|mul|neg|not|or|rem|return|rsub|shl|'
                         r'shr|sub|ushr)[-/])|{|}', text, re.MULTILINE):
                score += 0.3
        if re.search(r'(\.(catchall|epilogue|restart local|prologue)|'
                     r'\b(array-data|class-change-error|declared-synchronized|'
                     r'(field|inline|vtable)@0x[0-9a-fA-F]|generic-error|'
                     r'illegal-class-access|illegal-field-access|'
                     r'illegal-method-access|instantiation-error|no-error|'
                     r'no-such-class|no-such-field|no-such-method|'
                     r'packed-switch|sparse-switch))\b', text, re.MULTILINE):
            score += 0.6
        return score
