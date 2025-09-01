"""
    pygments.lexers.esoteric
    ~~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for esoteric languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, include, words, bygroups
from erdos._vendor.pygments.token import Comment, Operator, Keyword, Name, String, Number, \
    Punctuation, Error, Whitespace

__all__ = ['BrainfuckLexer', 'BefungeLexer', 'RedcodeLexer', 'CAmkESLexer',
           'CapDLLexer', 'AheuiLexer']


class BrainfuckLexer(RegexLexer):
    """
    Lexer for the esoteric BrainFuck language.
    """

    name = 'Brainfuck'
    url = 'http://www.muppetlabs.com/~breadbox/bf/'
    aliases = ['brainfuck', 'bf']
    filenames = ['*.bf', '*.b']
    mimetypes = ['application/x-brainfuck']
    version_added = ''

    tokens = {
        'common': [
            # use different colors for different instruction types
            (r'[.,]+', Name.Tag),
            (r'[+-]+', Name.Builtin),
            (r'[<>]+', Name.Variable),
            (r'[^.,+\-<>\[\]]+', Comment),
        ],
        'root': [
            (r'\[', Keyword, 'loop'),
            (r'\]', Error),
            include('common'),
        ],
        'loop': [
            (r'\[', Keyword, '#push'),
            (r'\]', Keyword, '#pop'),
            include('common'),
        ]
    }

    def analyse_text(text):
        """It's safe to assume that a program which mostly consists of + -
        and < > is brainfuck."""
        plus_minus_count = 0
        greater_less_count = 0

        range_to_check = max(256, len(text))

        for c in text[:range_to_check]:
            if c == '+' or c == '-':
                plus_minus_count += 1
            if c == '<' or c == '>':
                greater_less_count += 1

        if plus_minus_count > (0.25 * range_to_check):
            return 1.0
        if greater_less_count > (0.25 * range_to_check):
            return 1.0

        result = 0
        if '[-]' in text:
            result += 0.5

        return result


class BefungeLexer(RegexLexer):
    """
    Lexer for the esoteric Befunge language.
    """
    name = 'Befunge'
    url = 'http://en.wikipedia.org/wiki/Befunge'
    aliases = ['befunge']
    filenames = ['*.befunge']
    mimetypes = ['application/x-befunge']
    version_added = '0.7'

    tokens = {
        'root': [
            (r'[0-9a-f]', Number),
            (r'[+*/%!`-]', Operator),             # Traditional math
            (r'[<>^v?\[\]rxjk]', Name.Variable),  # Move, imperatives
            (r'[:\\$.,n]', Name.Builtin),         # Stack ops, imperatives
            (r'[|_mw]', Keyword),
            (r'[{}]', Name.Tag),                  # Befunge-98 stack ops
            (r'".*?"', String.Double),            # Strings don't appear to allow escapes
            (r'\'.', String.Single),              # Single character
            (r'[#;]', Comment),                   # Trampoline... depends on direction hit
            (r'[pg&~=@iotsy]', Keyword),          # Misc
            (r'[()A-Z]', Comment),                # Fingerprints
            (r'\s+', Whitespace),                 # Whitespace doesn't matter
        ],
    }


class CAmkESLexer(RegexLexer):
    """
    Basic lexer for the input language for the CAmkES component platform.
    """
    name = 'CAmkES'
    url = 'https://sel4.systems/CAmkES/'
    aliases = ['camkes', 'idl4']
    filenames = ['*.camkes', '*.idl4']
    version_added = '2.1'

    tokens = {
        'root': [
            # C pre-processor directive
            (r'^(\s*)(#.*)(\n)', bygroups(Whitespace, Comment.Preproc,
                Whitespace)),

            # Whitespace, comments
            (r'\s+', Whitespace),
            (r'/\*(.|\n)*?\*/', Comment),
            (r'//.*$', Comment),

            (r'[\[(){},.;\]]', Punctuation),
            (r'[~!%^&*+=|?:<>/-]', Operator),

            (words(('assembly', 'attribute', 'component', 'composition',
                    'configuration', 'connection', 'connector', 'consumes',
                    'control', 'dataport', 'Dataport', 'Dataports', 'emits',
                    'event', 'Event', 'Events', 'export', 'from', 'group',
                    'hardware', 'has', 'interface', 'Interface', 'maybe',
                    'procedure', 'Procedure', 'Procedures', 'provides',
                    'template', 'thread', 'threads', 'to', 'uses', 'with'),
                   suffix=r'\b'), Keyword),

            (words(('bool', 'boolean', 'Buf', 'char', 'character', 'double',
                    'float', 'in', 'inout', 'int', 'int16_6', 'int32_t',
                    'int64_t', 'int8_t', 'integer', 'mutex', 'out', 'real',
                    'refin', 'semaphore', 'signed', 'string', 'struct',
                    'uint16_t', 'uint32_t', 'uint64_t', 'uint8_t', 'uintptr_t',
                    'unsigned', 'void'),
                   suffix=r'\b'), Keyword.Type),

            # Recognised attributes
            (r'[a-zA-Z_]\w*_(priority|domain|buffer)', Keyword.Reserved),
            (words(('dma_pool', 'from_access', 'to_access'), suffix=r'\b'),
                Keyword.Reserved),

            # CAmkES-level include
            (r'(import)(\s+)((?:<[^>]*>|"[^"]*");)',
                bygroups(Comment.Preproc, Whitespace, Comment.Preproc)),

            # C-level include
            (r'(include)(\s+)((?:<[^>]*>|"[^"]*");)',
                bygroups(Comment.Preproc, Whitespace, Comment.Preproc)),

            # Literals
            (r'0[xX][\da-fA-F]+', Number.Hex),
            (r'-?[\d]+', Number),
            (r'-?[\d]+\.[\d]+', Number.Float),
            (r'"[^"]*"', String),
            (r'[Tt]rue|[Ff]alse', Name.Builtin),

            # Identifiers
            (r'[a-zA-Z_]\w*', Name),
        ],
    }


class CapDLLexer(RegexLexer):
    """
    Basic lexer for CapDL.

    The source of the primary tool that reads such specifications is available
    at https://github.com/seL4/capdl/tree/master/capDL-tool. Note that this
    lexer only supports a subset of the grammar. For example, identifiers can
    shadow type names, but these instances are currently incorrectly
    highlighted as types. Supporting this would need a stateful lexer that is
    considered unnecessarily complex for now.
    """
    name = 'CapDL'
    url = 'https://ssrg.nicta.com.au/publications/nictaabstracts/Kuz_KLW_10.abstract.pml'
    aliases = ['capdl']
    filenames = ['*.cdl']
    version_added = '2.2'

    tokens = {
        'root': [
            # C pre-processor directive
            (r'^(\s*)(#.*)(\n)',
                bygroups(Whitespace, Comment.Preproc, Whitespace)),

            # Whitespace, comments
            (r'\s+', Whitespace),
            (r'/\*(.|\n)*?\*/', Comment),
            (r'(//|--).*$', Comment),

            (r'[<>\[(){},:;=\]]', Punctuation),
            (r'\.\.', Punctuation),

            (words(('arch', 'arm11', 'caps', 'child_of', 'ia32', 'irq', 'maps',
                    'objects'), suffix=r'\b'), Keyword),

            (words(('aep', 'asid_pool', 'cnode', 'ep', 'frame', 'io_device',
                    'io_ports', 'io_pt', 'notification', 'pd', 'pt', 'tcb',
                    'ut', 'vcpu'), suffix=r'\b'), Keyword.Type),

            # Properties
            (words(('asid', 'addr', 'badge', 'cached', 'dom', 'domainID', 'elf',
                    'fault_ep', 'G', 'guard', 'guard_size', 'init', 'ip',
                    'prio', 'sp', 'R', 'RG', 'RX', 'RW', 'RWG', 'RWX', 'W',
                    'WG', 'WX', 'level', 'masked', 'master_reply', 'paddr',
                    'ports', 'reply', 'uncached'), suffix=r'\b'),
             Keyword.Reserved),

            # Literals
            (r'0[xX][\da-fA-F]+', Number.Hex),
            (r'\d+(\.\d+)?(k|M)?', Number),
            (words(('bits',), suffix=r'\b'), Number),
            (words(('cspace', 'vspace', 'reply_slot', 'caller_slot',
                    'ipc_buffer_slot'), suffix=r'\b'), Number),

            # Identifiers
            (r'[a-zA-Z_][-@\.\w]*', Name),
        ],
    }


class RedcodeLexer(RegexLexer):
    """
    A simple Redcode lexer based on ICWS'94.
    Contributed by Adam Blinkinsop <blinks@acm.org>.
    """
    name = 'Redcode'
    aliases = ['redcode']
    filenames = ['*.cw']
    url = 'https://en.wikipedia.org/wiki/Core_War'
    version_added = '0.8'

    opcodes = ('DAT', 'MOV', 'ADD', 'SUB', 'MUL', 'DIV', 'MOD',
               'JMP', 'JMZ', 'JMN', 'DJN', 'CMP', 'SLT', 'SPL',
               'ORG', 'EQU', 'END')
    modifiers = ('A', 'B', 'AB', 'BA', 'F', 'X', 'I')

    tokens = {
        'root': [
            # Whitespace:
            (r'\s+', Whitespace),
            (r';.*$', Comment.Single),
            # Lexemes:
            #  Identifiers
            (r'\b({})\b'.format('|'.join(opcodes)), Name.Function),
            (r'\b({})\b'.format('|'.join(modifiers)), Name.Decorator),
            (r'[A-Za-z_]\w+', Name),
            #  Operators
            (r'[-+*/%]', Operator),
            (r'[#$@<>]', Operator),  # mode
            (r'[.,]', Punctuation),  # mode
            #  Numbers
            (r'[-+]?\d+', Number.Integer),
        ],
    }


class AheuiLexer(RegexLexer):
    """
    Aheui is esoteric language based on Korean alphabets.
    """

    name = 'Aheui'
    url = 'http://aheui.github.io/'
    aliases = ['aheui']
    filenames = ['*.aheui']
    version_added = ''

    tokens = {
        'root': [
            ('['
             '나-낳냐-냫너-넣녀-녛노-놓뇨-눟뉴-닇'
             '다-닿댜-댷더-덯뎌-뎧도-돟됴-둫듀-딓'
             '따-땋땨-떃떠-떻뗘-뗳또-똫뚀-뚷뜌-띟'
             '라-랗랴-럏러-렇려-렿로-롷료-뤃류-릫'
             '마-맣먀-먛머-멓며-몋모-뫃묘-뭏뮤-믷'
             '바-밯뱌-뱧버-벟벼-볗보-봏뵤-붛뷰-빃'
             '빠-빻뺘-뺳뻐-뻫뼈-뼣뽀-뽛뾰-뿧쀼-삏'
             '사-샇샤-샿서-섷셔-셯소-솧쇼-숳슈-싛'
             '싸-쌓쌰-썋써-쎃쎠-쎻쏘-쏳쑈-쑿쓔-씧'
             '자-잫쟈-쟣저-젛져-졓조-좋죠-줗쥬-즿'
             '차-챃챠-챻처-첳쳐-쳫초-촣쵸-춯츄-칗'
             '카-캏캬-컇커-컿켜-켷코-콯쿄-쿻큐-킣'
             '타-탛탸-턓터-텋텨-톃토-톻툐-퉇튜-틯'
             '파-팧퍄-퍟퍼-펗펴-폏포-퐇표-풓퓨-픻'
             '하-핳햐-햫허-헣혀-혛호-홓효-훟휴-힇'
             ']', Operator),
            ('.', Comment),
        ],
    }
