"""
    pygments.lexers.bqn
    ~~~~~~~~~~~~~~~~~~~

    Lexer for BQN.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos.erdos._vendor.pygments.lexer import RegexLexer
from erdos.erdos._vendor.pygments.token import Comment, Operator, Keyword, Name, String, \
    Number, Punctuation, Whitespace

__all__ = ['BQNLexer']


class BQNLexer(RegexLexer):
    """
    A simple BQN lexer.
    """
    name = 'BQN'
    url = 'https://mlochbaum.github.io/BQN/index.html'
    aliases = ['bqn']
    filenames = ['*.bqn']
    mimetypes = []
    version_added = '2.16'

    # An inter_word_char. Necessary because \w matches all alphanumeric
    # Unicode characters, including ones (e.g., 𝕊) that BQN treats special.
    _iwc = r'((?=[^𝕎𝕏𝔽𝔾𝕊𝕨𝕩𝕗𝕘𝕤𝕣])\w)'

    tokens = {
        'root': [
            # Whitespace
            # ==========
            (r'\s+', Whitespace),
            #
            # Comment
            # =======
            # '#' is a comment that continues to the end of the line
            (r'#.*$', Comment.Single),
            #
            # Strings
            # =======
            (r'\'((\'\')|[^\'])*\'', String.Single),
            (r'"(("")|[^"])*"', String.Double),
            #
            # Null Character
            # ==============
            # Literal representation of the null character
            (r'@', String.Symbol),
            #
            # Punctuation
            # ===========
            # This token type is used for diamond, commas
            # and  array and list brackets and strand syntax
            (r'[\.⋄,\[\]⟨⟩‿]', Punctuation),
            #
            # Expression Grouping
            # ===================
            # Since this token type is important in BQN, it is not included in
            # the punctuation token type but rather in the following one
            (r'[\(\)]', String.Regex),
            #
            # Numbers
            # =======
            # Includes the numeric literals and the Nothing character
            (r'¯?[0-9](([0-9]|_)*\.?([0-9]|_)+|([0-9]|_)*)([Ee][¯]?([0-9]|_)+)?|¯|∞|π|·', Number),
            #
            # Variables
            # =========
            (r'[a-z]' + _iwc + r'*', Name.Variable),
            #
            # 2-Modifiers
            # ===========
            # Needs to come before the 1-modifiers due to _𝕣 and _𝕣_
            (r'[∘○⊸⟜⌾⊘◶⎉⚇⍟⎊]', Name.Property),
            (r'_(𝕣|[a-zA-Z0-9]+)_', Name.Property),
            #
            # 1-Modifiers
            # ===========
            (r'[˙˜˘¨⌜⁼´˝`𝕣]', Name.Attribute),
            (r'_(𝕣|[a-zA-Z0-9]+)', Name.Attribute),
            #
            # Functions
            # =========
            # The monadic or dyadic function primitives and function
            # operands and arguments, along with function self-reference
            (r'[+\-×÷\⋆√⌊⌈∧∨¬|≤<>≥=≠≡≢⊣⊢⥊∾≍⋈↑↓↕«»⌽⍉/⍋⍒⊏⊑⊐⊒∊⍷⊔!𝕎𝕏𝔽𝔾𝕊]',
             Operator),
            (r'[A-Z]' + _iwc + r'*|•' + _iwc + r'+', Operator),
            #
            # Constant
            # ========
            (r'˙', Name.Constant),
            #
            # Define/Export/Change
            # ====================
            (r'[←↩⇐]', Keyword.Declaration),
            #
            # Blocks
            # ======
            (r'[{}]', Keyword.Type),
            #
            # Extra characters
            # ================
            (r'[;:?𝕨𝕩𝕗𝕘𝕤]', Name.Entity),
            #

        ],
    }
