from __future__ import absolute_import

from enum import Enum


class TokenType:
    name: str
    contains_syntax: bool

    def __init__(self, name: str, contains_syntax: bool = False):
        self.name = name
        self.contains_syntax = contains_syntax

    def __repr__(self):
        return '%s(%s)' % (self.__class__.__name__, self.name)


class PythonTokenTypes(Enum):
    STRING = TokenType('STRING')
    NUMBER = TokenType('NUMBER')
    NAME = TokenType('NAME', contains_syntax=True)
    ERRORTOKEN = TokenType('ERRORTOKEN')
    NEWLINE = TokenType('NEWLINE')
    INDENT = TokenType('INDENT')
    DEDENT = TokenType('DEDENT')
    ERROR_DEDENT = TokenType('ERROR_DEDENT')
    FSTRING_STRING = TokenType('FSTRING_STRING')
    FSTRING_START = TokenType('FSTRING_START')
    FSTRING_END = TokenType('FSTRING_END')
    OP = TokenType('OP', contains_syntax=True)
    ENDMARKER = TokenType('ENDMARKER')
