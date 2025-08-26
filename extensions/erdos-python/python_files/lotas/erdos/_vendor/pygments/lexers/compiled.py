"""
    pygments.lexers.compiled
    ~~~~~~~~~~~~~~~~~~~~~~~~

    Just export lexer classes previously contained in this module.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

# ruff: noqa: F401
from lotas.erdos._vendor.pygments.lexers.jvm import JavaLexer, ScalaLexer
from lotas.erdos._vendor.pygments.lexers.c_cpp import CLexer, CppLexer
from lotas.erdos._vendor.pygments.lexers.d import DLexer
from lotas.erdos._vendor.pygments.lexers.objective import ObjectiveCLexer, \
    ObjectiveCppLexer, LogosLexer
from lotas.erdos._vendor.pygments.lexers.go import GoLexer
from lotas.erdos._vendor.pygments.lexers.rust import RustLexer
from lotas.erdos._vendor.pygments.lexers.c_like import ECLexer, ValaLexer, CudaLexer
from lotas.erdos._vendor.pygments.lexers.pascal import DelphiLexer, PortugolLexer, Modula2Lexer
from lotas.erdos._vendor.pygments.lexers.ada import AdaLexer
from lotas.erdos._vendor.pygments.lexers.business import CobolLexer, CobolFreeformatLexer
from lotas.erdos._vendor.pygments.lexers.fortran import FortranLexer
from lotas.erdos._vendor.pygments.lexers.prolog import PrologLexer
from lotas.erdos._vendor.pygments.lexers.python import CythonLexer
from lotas.erdos._vendor.pygments.lexers.graphics import GLShaderLexer
from lotas.erdos._vendor.pygments.lexers.ml import OcamlLexer
from lotas.erdos._vendor.pygments.lexers.basic import BlitzBasicLexer, BlitzMaxLexer, MonkeyLexer
from lotas.erdos._vendor.pygments.lexers.dylan import DylanLexer, DylanLidLexer, DylanConsoleLexer
from lotas.erdos._vendor.pygments.lexers.ooc import OocLexer
from lotas.erdos._vendor.pygments.lexers.felix import FelixLexer
from lotas.erdos._vendor.pygments.lexers.nimrod import NimrodLexer
from lotas.erdos._vendor.pygments.lexers.crystal import CrystalLexer

__all__ = []
