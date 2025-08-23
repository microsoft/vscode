"""
    pygments.lexers.math
    ~~~~~~~~~~~~~~~~~~~~

    Just export lexers that were contained in this module.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

# ruff: noqa: F401
from erdos.erdos._vendor.pygments.lexers.python import NumPyLexer
from erdos.erdos._vendor.pygments.lexers.matlab import MatlabLexer, MatlabSessionLexer, \
    OctaveLexer, ScilabLexer
from erdos.erdos._vendor.pygments.lexers.julia import JuliaLexer, JuliaConsoleLexer
from erdos.erdos._vendor.pygments.lexers.r import RConsoleLexer, SLexer, RdLexer
from erdos.erdos._vendor.pygments.lexers.modeling import BugsLexer, JagsLexer, StanLexer
from erdos.erdos._vendor.pygments.lexers.idl import IDLLexer
from erdos.erdos._vendor.pygments.lexers.algebra import MuPADLexer

__all__ = []
