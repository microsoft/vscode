"""
    pygments.lexers.ezhil
    ~~~~~~~~~~~~~~~~~~~~~

    Pygments lexers for Ezhil language.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from lotas.erdos._vendor.pygments.lexer import RegexLexer, include, words
from lotas.erdos._vendor.pygments.token import Keyword, Comment, Name, String, Number, \
    Punctuation, Operator, Whitespace

__all__ = ['EzhilLexer']


class EzhilLexer(RegexLexer):
    """
    Lexer for Ezhil, a Tamil script-based programming language.
    """
    name = 'Ezhil'
    url = 'http://ezhillang.org'
    aliases = ['ezhil']
    filenames = ['*.n']
    mimetypes = ['text/x-ezhil']
    version_added = '2.1'
    # Refer to tamil.utf8.tamil_letters from open-tamil for a stricter version of this.
    # This much simpler version is close enough, and includes combining marks.
    _TALETTERS = '[a-zA-Z_]|[\u0b80-\u0bff]'
    tokens = {
        'root': [
            include('keywords'),
            (r'#.*$', Comment.Single),
            (r'[@+/*,^\-%]|[!<>=]=?|&&?|\|\|?', Operator),
            ('இல்', Operator.Word),
            (words(('assert', 'max', 'min',
                    'நீளம்', 'சரம்_இடமாற்று', 'சரம்_கண்டுபிடி',
                    'பட்டியல்', 'பின்இணை', 'வரிசைப்படுத்து',
                    'எடு', 'தலைகீழ்', 'நீட்டிக்க', 'நுழைக்க', 'வை',
                    'கோப்பை_திற', 'கோப்பை_எழுது', 'கோப்பை_மூடு',
                    'pi', 'sin', 'cos', 'tan', 'sqrt', 'hypot', 'pow',
                    'exp', 'log', 'log10', 'exit',
                    ), suffix=r'\b'), Name.Builtin),
            (r'(True|False)\b', Keyword.Constant),
            (r'[^\S\n]+', Whitespace),
            include('identifier'),
            include('literal'),
            (r'[(){}\[\]:;.]', Punctuation),
        ],
        'keywords': [
            ('பதிப்பி|தேர்ந்தெடு|தேர்வு|ஏதேனில்|ஆனால்|இல்லைஆனால்|இல்லை|ஆக|ஒவ்வொன்றாக|இல்|வரை|செய்|முடியேனில்|பின்கொடு|முடி|நிரல்பாகம்|தொடர்|நிறுத்து|நிரல்பாகம்', Keyword),
        ],
        'identifier': [
            ('(?:'+_TALETTERS+')(?:[0-9]|'+_TALETTERS+')*', Name),
        ],
        'literal': [
            (r'".*?"', String),
            (r'\d+((\.\d*)?[eE][+-]?\d+|\.\d*)', Number.Float),
            (r'\d+', Number.Integer),
        ]
    }

    def analyse_text(text):
        """This language uses Tamil-script. We'll assume that if there's a
        decent amount of Tamil-characters, it's this language. This assumption
        is obviously horribly off if someone uses string literals in tamil
        in another language."""
        if len(re.findall(r'[\u0b80-\u0bff]', text)) > 10:
            return 0.25

    def __init__(self, **options):
        super().__init__(**options)
        self.encoding = options.get('encoding', 'utf-8')
