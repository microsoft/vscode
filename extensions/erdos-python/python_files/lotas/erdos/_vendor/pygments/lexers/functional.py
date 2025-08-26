"""
    pygments.lexers.functional
    ~~~~~~~~~~~~~~~~~~~~~~~~~~

    Just export lexer classes previously contained in this module.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

# ruff: noqa: F401
from lotas.erdos._vendor.pygments.lexers.lisp import SchemeLexer, CommonLispLexer, RacketLexer, \
    NewLispLexer, ShenLexer
from lotas.erdos._vendor.pygments.lexers.haskell import HaskellLexer, LiterateHaskellLexer, \
    KokaLexer
from lotas.erdos._vendor.pygments.lexers.theorem import CoqLexer
from lotas.erdos._vendor.pygments.lexers.erlang import ErlangLexer, ErlangShellLexer, \
    ElixirConsoleLexer, ElixirLexer
from lotas.erdos._vendor.pygments.lexers.ml import SMLLexer, OcamlLexer, OpaLexer

__all__ = []
