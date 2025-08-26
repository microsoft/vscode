"""
    pygments.lexers.amdgpu
    ~~~~~~~~~~~~~~~~~~~~~~

    Lexers for the AMDGPU ISA assembly.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer, words
from lotas.erdos._vendor.pygments.token import Name, Text, Keyword, Whitespace, Number, Comment

import re

__all__ = ['AMDGPULexer']


class AMDGPULexer(RegexLexer):
    """
    For AMD GPU assembly.
    """
    name = 'AMDGPU'
    aliases = ['amdgpu']
    filenames = ['*.isa']
    url = 'https://gpuopen.com/amd-isa-documentation'
    version_added = '2.8'

    flags = re.IGNORECASE

    tokens = {
        'root': [
            (r'\s+', Whitespace),
            (r'[\r\n]+', Text),
            (r'(([a-z_0-9])*:([a-z_0-9])*)', Name.Attribute),
            (r'(\[|\]|\(|\)|,|\:|\&)', Text),
            (r'([;#]|//).*?\n', Comment.Single),
            (r'((s_)?(scratch|ds|buffer|flat|image)_[a-z0-9_]+)', Keyword.Reserved),
            (r'(_lo|_hi)', Name.Variable),
            (r'(vmcnt|lgkmcnt|expcnt)', Name.Attribute),
            (r'(attr[0-9].[a-z])', Name.Attribute),
            (words((
                'op', 'vaddr', 'vdata', 'off', 'soffset', 'srsrc', 'format',
                'offset', 'offen', 'idxen', 'glc', 'dlc', 'slc', 'tfe', 'lds',
                'lit', 'unorm'), suffix=r'\b'), Name.Attribute),
            (r'(label_[a-z0-9]+)', Keyword),
            (r'(_L[0-9]*)', Name.Variable),
            (r'(s|v)_[a-z0-9_]+', Keyword),
            (r'(v[0-9.]+|vcc|exec|v)', Name.Variable),
            (r's[0-9.]+|s', Name.Variable),
            (r'[0-9]+\.[^0-9]+', Number.Float),
            (r'(0[xX][a-z0-9]+)|([0-9]+)', Number.Integer)
        ]
    }
