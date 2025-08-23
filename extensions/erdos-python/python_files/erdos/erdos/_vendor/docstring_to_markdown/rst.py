from abc import ABC, abstractmethod
from enum import IntEnum, auto
from types import SimpleNamespace
from typing import Union, List, Dict
import re


class Directive:
    def __init__(
        self, pattern: str, replacement: str,
        name: Union[str, None] = None,
        flags: int = 0
    ):
        self.pattern = pattern
        self.replacement = replacement
        self.name = name
        self.flags = flags


# https://www.sphinx-doc.org/en/master/usage/restructuredtext/domains.html#cross-referencing-python-objects
SPHINX_CROSS_REF_PYTHON = (
    'mod',
    'func',
    'data',
    'const',
    'class',
    'meth',
    'attr',
    'exc',
    'obj'
)

# https://www.sphinx-doc.org/en/master/usage/restructuredtext/domains.html#cross-referencing-c-constructs
SPHINX_CROSS_REF_C = (
    'member',
    'data',
    'func',
    'macro',
    'struct',
    'union',
    'enum',
    'enumerator',
    'type'
)

# https://www.sphinx-doc.org/en/master/usage/restructuredtext/domains.html#cross-referencing
SPHINX_CROSS_REF_CPP = (
    'any',
    'class',
    'struct',
    'func',
    'member',
    'var',
    'type',
    'concept',
    'enum',
    'enumerator'
)

# https://www.sphinx-doc.org/en/master/usage/restructuredtext/domains.html#the-javascript-domain
SPHINX_CROSS_REF_JS = (
    'mod',
    'func',
    'meth',
    'class',
    'data',
    'attr'
)

# https://www.sphinx-doc.org/en/master/usage/restructuredtext/domains.html#the-restructuredtext-domain
SPHINX_CROSS_REF_RST = (
    'dir',
    'role'
)

# https://www.sphinx-doc.org/en/master/usage/restructuredtext/roles.html
SPHINX_CROSS_REF_OTHER = (
    'any',
    # https://www.sphinx-doc.org/en/master/usage/restructuredtext/roles.html#cross-referencing-other-items-of-interest
    'envvar',
    'token',
    'keyword',
    'option',
    'term',
)

SPHINX_PARAM = (
    'param',
    'parameter',
    'arg',
    'argument',
    'key',
    'keyword'
)

SPHINX_RULES: List[Directive] = [
    Directive(
        pattern=r':c:({}):`\.?(?P<name>[^`]+?)`'.format('|'.join(SPHINX_CROSS_REF_C)),
        replacement=r'`\g<name>`'
    ),
    Directive(
        pattern=r':cpp:({}):`\.?(?P<name>[^`]+?)`'.format('|'.join(SPHINX_CROSS_REF_CPP)),
        replacement=r'`\g<name>`'
    ),
    Directive(
        pattern=r':js:({}):`\.?(?P<name>[^`]+?)`'.format('|'.join(SPHINX_CROSS_REF_JS)),
        replacement=r'`\g<name>`'
    ),
    Directive(
        pattern=r'(:py)?:({}):`\.?(?P<name>[^`]+?)`'.format('|'.join(SPHINX_CROSS_REF_PYTHON)),
        replacement=r'`\g<name>`'
    ),
    Directive(
        pattern=r'(:rst)?:({}):`\.?(?P<name>[^`]+?)`'.format('|'.join(SPHINX_CROSS_REF_RST)),
        replacement=r'`\g<name>`'
    ),
    Directive(
        pattern=r':({}):`\.?(?P<name>[^`]+?)`'.format('|'.join(SPHINX_CROSS_REF_OTHER)),
        replacement=r'`\g<name>`'
    ),
    Directive(
        pattern=r'^\s*:({}) (?P<type>\S+) (?P<param>\S+):'.format('|'.join(SPHINX_PARAM)),
        replacement=r'- `\g<param>` (`\g<type>`):',
        flags=re.MULTILINE
    ),
    Directive(
        pattern=r'^\s*:({}) (?P<param>\S+): (?P<desc>.*)(\n|\r\n?):type \2: (?P<type>.*)$'.format('|'.join(SPHINX_PARAM)),
        replacement=r'- `\g<param>` (\g<type>): \g<desc>',
        flags=re.MULTILINE
    ),
    Directive(
        pattern=r'^\s*:({}) (?P<param>\S+):'.format('|'.join(SPHINX_PARAM)),
        replacement=r'- `\g<param>`:',
        flags=re.MULTILINE
    ),
    Directive(
        pattern=r'^\s*:type (?P<param>\S+):',
        replacement=r'  . Type: `\g<param>`:',
        flags=re.MULTILINE
    ),
    Directive(
        pattern=r'^\s*:(return|returns):',
        replacement=r'- returns:',
        flags=re.MULTILINE
    ),
    Directive(
        pattern=r'^\s*:rtype: (?P<type>\S+)',
        replacement=r'- return type: `\g<type>`',
        flags=re.MULTILINE
    ),
    Directive(
        pattern=r'^\s*:(raises|raise|except|exception) (?P<exception>\S+):',
        replacement=r'- raises `\g<exception>`:',
        flags=re.MULTILINE
    ),
]


class Admonition:
    def __init__(self, name: str, label: str, icon: str = ''):
        self.name = name
        self.label = label
        self.icon = icon

    @property
    def block_markdown(self):
        return f'{self.icon} **{self.label}**'

    @property
    def inline_markdown(self):
        return self.block_markdown + ':'


ADMONITIONS = [
    Admonition(
        name='caution',
        label='Caution',
        icon='⚠️ '
    ),
    Admonition(
        name='attention',
        label='Attention',
        icon='⚠️ '
    ),
    Admonition(
        name='danger',
        label='Danger',
        icon='⚠️ '
    ),
    Admonition(
        name='hint',
        label='Hint',
        icon='🛈'
    ),
    Admonition(
        name='important',
        label='Important',
        icon='⚠️ '
    ),
    Admonition(
        name='note',
        label='Note',
        icon='🛈'
    ),
    Admonition(
        name='tip',
        label='Tip',
        icon='🛈'
    ),
    Admonition(
        name='warning',
        label='Warning',
        icon='⚠️ '
    )
]


ADMONITION_DIRECTIVES: List[Directive] = [
    # https://docutils.sourceforge.io/docs/ref/rst/directives.html#admonitions
    Directive(
        pattern=rf'\.\. {admonition.name}::',
        replacement=admonition.inline_markdown
    )
    for admonition in ADMONITIONS
]


RST_DIRECTIVES: List[Directive] = [
    Directive(
        pattern=r'\.\. versionchanged:: (?P<version>\S+)(?P<end>$|\n)',
        replacement=r'*Changed in \g<version>*\g<end>'
    ),
    Directive(
        pattern=r'\.\. versionadded:: (?P<version>\S+)(?P<end>$|\n)',
        replacement=r'*Added in \g<version>*\g<end>'
    ),
    Directive(
        pattern=r'\.\. deprecated:: (?P<version>\S+)(?P<end>$|\n)',
        replacement=r'*Deprecated since \g<version>*\g<end>'
    ),
    *ADMONITION_DIRECTIVES,
    Directive(
        pattern=r'\.\. seealso::(?P<short_form>.*)(?P<end>$|\n)',
        replacement=r'*See also*\g<short_form>\g<end>'
    ),
    Directive(
        pattern=r':ref:`(?P<label>[^<`]+?)\s*<(?P<ref>[^>`]+?)>`',
        replacement=r'\g<label>: `\g<ref>`'
    ),
    Directive(
        pattern=r'`(?P<label>[^<`]+?)(\n?)<(?P<url>[^>`]+)>`_+',
        replacement=r'[\g<label>](\g<url>)'
    ),
    Directive(
        pattern=r':mod:`(?P<label>[^`]+)`',
        replacement=r'`\g<label>`'
    ),
    Directive(
        pattern=r'\.\. currentmodule:: (?P<module>.+)(?P<end>$|\n)',
        replacement=''
    ),
    Directive(
        pattern=r':math:`(?P<latex>[^`]+?)`',
        replacement=r'$\g<latex>$'
    ),
    Directive(
        pattern=r'\.\. math:: (?P<latex>[^`]+?)(?P<end>$|\n)',
        replacement=r'$$\g<latex>$$\g<end>'
    ),
    Directive(
        pattern=r'\.\. highlight:: (?P<language>.+)(?P<end>$|\n)',
        replacement=r'',
        name='highlight'
    ),
    Directive(
        pattern=r'\.\. (code-block|productionlist)::(?P<language>.*)(?P<end>$|\n)',
        replacement=r'\g<end>',
        name='code-block'
    ),
    *SPHINX_RULES
]


_RST_SECTIONS = {
    'Parameters',
    'Returns',
    'See Also',
    'Examples',
    'Attributes',
    'Notes',
    'References'
}


# TODO: type with RstSection = Literal[], and generate _RST_SECTIONS out of it once
#  support for Python 3.6 can be safely dropped
SECTION_DIRECTIVES: Dict[str, List[Directive]] = {
    'Parameters': [
        Directive(
            pattern=r'^(?P<other_args>\*\*kwargs|\*args)$',
            replacement=r'- `\g<other_args>`'
        ),
        Directive(
            pattern=r'^(?P<arg1>[^:\s]+\d), (?P<arg2>[^:\s]+\d), \.\.\. : (?P<type>.+)$',
            replacement=r'- `\g<arg1>`, `\g<arg2>`, `...`: \g<type>'
        )
    ],
    'References': [
        Directive(
            pattern=r'^\.\. \[(?P<number>\d+)\] (?P<first_line>.+)$',
            replacement=r' - [\g<number>] \g<first_line>'
        )
    ]
}


ESCAPING_RULES: List[Directive] = [
    Directive(
        pattern=r'__(?P<text>\S+)__',
        replacement=r'\_\_\g<text>\_\_'
    )
]


def _find_directive_pattern(name: str):
    return [
        directive for directive in RST_DIRECTIVES
        if directive.name == name
    ][0].pattern


HIGHLIGHT_PATTERN = _find_directive_pattern('highlight')
CODE_BLOCK_PATTERN = _find_directive_pattern('code-block')


def looks_like_rst(value: str) -> bool:
    # check if any of the characteristic sections (and the properly formatted underline) is there
    for section in _RST_SECTIONS:
        if (section + '\n' + '-' * len(section) + '\n') in value:
            return True
    for directive in RST_DIRECTIVES:
        if re.search(directive.pattern, value, directive.flags):
            return True
    # allow "text::" or "text ::" but not "^::$" or "^:::$"
    return bool(re.search(r'(\s|\w)::\n', value) or '\n>>> ' in value)


class IBlockBeginning(SimpleNamespace):
    """
    Line that does not belong to the code block and should be prepended and analysed separately
    """
    remainder: str


class IParser(ABC):

    @abstractmethod
    def can_parse(self, line: str) -> bool:
        """Whether the line looks like a valid beginning of parsed block."""

    @abstractmethod
    def initiate_parsing(self, line: str, current_language: str) -> IBlockBeginning:
        """Initiate parsing of given line.

        Arguments:
            line: first line to be parsed (that passed `can_parse()` test)
            current_language: language to use if highlighting code and no other language is specified in `line`
        """

    @abstractmethod
    def can_consume(self, line: str) -> bool:
        """Whether the line can be parsed, or does it look like an end of parsable area?"""

    @abstractmethod
    def consume(self, line: str) -> None:
        """Parse given line."""

    @abstractmethod
    def finish_consumption(self, final: bool) -> str:
        """Finish parsing and return the converted part of the docstring."""

    """Is there another parser that should follow after this parser finished?"""
    follower: Union['IParser', None] = None


class TableParser(IParser):

    class State(IntEnum):
        AWAITS = auto()
        PARSING_HEADER = auto()
        PARSED_HEADER = auto()
        PARSING_ROWS = auto()
        FINISHED = auto()

    outer_border_pattern: str
    column_top_prefix: str
    column_top_border: str
    column_end_offset: int

    _state: int
    _column_starts: List[int]
    _columns_end: int
    _columns: List[str]
    _rows: List[List[str]]
    _max_sizes: List[int]
    _indent: str

    def __init__(self):
        self._reset_state()

    def _reset_state(self):
        self._state = TableParser.State.AWAITS
        self._column_starts = []
        self._columns_end = -1
        self._columns = []
        self._rows = []
        self._max_sizes = []
        self._indent = ''

    def can_parse(self, line: str) -> bool:
        return bool(re.match(self.outer_border_pattern, line))

    def initiate_parsing(self, line: str, current_language: str) -> IBlockBeginning:
        self._reset_state()
        match = re.match(self.outer_border_pattern, line)
        assert match
        groups = match.groupdict()
        self._indent = groups['indent'] or ''
        self._column_starts = []
        self._columns_end = match.end('column')
        previous = self.column_top_prefix
        for i, char in enumerate(line):
            if char == self.column_top_border and previous == self.column_top_prefix:
                self._column_starts.append(i)
            previous = char
        self._max_sizes = [0 for i in self._column_starts]
        self._state = TableParser.State.PARSING_HEADER
        return IBlockBeginning(remainder='')

    def can_consume(self, line: str) -> bool:
        return bool(self._state != TableParser.State.FINISHED)

    def consume(self, line: str) -> None:
        states = TableParser.State
        if self._state == states.PARSING_HEADER:
            self._columns = self._split(line)
            self._state += 1
        elif self._state == states.PARSED_HEADER:
            # TODO: check integrity?
            self._state += 1
        elif self._state == states.PARSING_ROWS:
            self._consume_row(line)

    def _consume_row(self, line: str):
        match = re.match(self.outer_border_pattern, line)
        if match:
            self._state += 1
        else:
            self._rows.append(self._split(line))

    def _split(self, line: str) -> List[str]:
        assert self._column_starts
        fragments = []
        for i, start in enumerate(self._column_starts):
            end = (
                self._column_starts[i + 1] + self.column_end_offset
                if i < len(self._column_starts) - 1 else
                self._columns_end
            )
            fragment = line[start:end].strip()
            fragment = rst_to_markdown(fragment, extract_signature=False)
            self._max_sizes[i] = max(self._max_sizes[i], len(fragment))
            fragments.append(fragment)
        return fragments

    def _wrap(self, row: List[str], align=str.ljust) -> str:
        padded_row = [
            align(e, self._max_sizes[i])
            for i, e in enumerate(row)
        ]
        return self._indent + '| ' + (' | '.join(padded_row)) + ' |\n'

    def finish_consumption(self, final: bool) -> str:
        result = self._wrap(self._columns, align=str.center)
        result += self._wrap([
            '-' * size
            for size in self._max_sizes
        ])

        for row in self._rows:
            result += self._wrap(row)

        return result


class SimpleTableParser(TableParser):
    outer_border_pattern = r'^(?P<indent>\s*)=+(?P<column> +=+)+$'
    column_top_prefix = ' '
    column_top_border = '='
    column_end_offset = 0


class GridTableParser(TableParser):
    outer_border_pattern = r'^(?P<indent>\s*)(?P<column>\+-+)+\+$'
    column_top_prefix = '+'
    column_top_border = '-'
    column_end_offset = -1

    _expecting_row_content: bool

    def _reset_state(self):
        super()._reset_state()
        self._expecting_row_content = True

    def _is_correct_row(self, line: str) -> bool:
        stripped = line.lstrip()
        if self._expecting_row_content:
            return stripped.startswith('|')
        else:
            return stripped.startswith('+-')

    def can_consume(self, line: str) -> bool:
        return (
            bool(self._state != TableParser.State.FINISHED)
            and
            (self._state != TableParser.State.PARSING_ROWS or self._is_correct_row(line))
        )

    def _consume_row(self, line: str):
        if self._is_correct_row(line):
            if self._expecting_row_content:
                self._rows.append(self._split(line))
            self._expecting_row_content = not self._expecting_row_content
        else:
            self._state += 1


class BlockParser(IParser):
    enclosure = '```'
    follower: Union['IParser', None] = None
    _buffer: List[str]
    _block_started: bool

    def __init__(self):
        self._buffer = []
        self._block_started = False

    @abstractmethod
    def can_parse(self, line: str) -> bool:
        """All children should call _start_block in initiate_parsing() implementation."""

    def _start_block(self, language: str):
        self._buffer.append(self.enclosure + language)
        self._block_started = True

    def consume(self, line: str):
        if not self._block_started:
            raise ValueError('Block has not started')   # pragma: no cover
        self._buffer.append(line)

    def finish_consumption(self, final: bool) -> str:
        # if the last line is empty (e.g. a separator of intended block), discard it
        if self._buffer[len(self._buffer) - 1].strip() == '':
            self._buffer.pop()
        self._buffer.append(self.enclosure + '\n')
        result = '\n'.join(self._buffer)
        if not final:
            result += '\n'
        self._buffer = []
        self._block_started = False
        return result


class IndentedBlockParser(BlockParser, ABC):
    _is_block_beginning: bool
    _block_indent_size: Union[int, None]

    def __init__(self):
        super(IndentedBlockParser, self).__init__()
        self._is_block_beginning = False

    def _start_block(self, language: str):
        super()._start_block(language)
        self._block_indent_size = None
        self._is_block_beginning = True

    def can_consume(self, line: str) -> bool:
        if self._is_block_beginning and line.strip() == '':
            return True
        return bool((len(line) > 0 and re.match(r'^\s', line[0])) or len(line) == 0)

    def consume(self, line: str):
        if self._is_block_beginning:
            # skip the first empty line
            self._is_block_beginning = False
            if line.strip() == '':
                return
        if self._block_indent_size is None:
            self._block_indent_size = len(line) - len(line.lstrip())
        super().consume(line[self._block_indent_size:])

    def finish_consumption(self, final: bool) -> str:
        self._is_block_beginning = False
        self._block_indent_size = None
        return super().finish_consumption(final)


class PythonOutputBlockParser(BlockParser):
    def can_consume(self, line: str) -> bool:
        return line.strip() != '' and not line.startswith('>>>')

    def can_parse(self, line: str) -> bool:
        return line.strip() != ''

    def initiate_parsing(self, line: str, current_language: str) -> IBlockBeginning:
        self._start_block('')
        self.consume(line)
        return IBlockBeginning(remainder='')


class PythonPromptCodeBlockParser(BlockParser):
    def can_parse(self, line: str) -> bool:
        return line.startswith('>>>')

    def initiate_parsing(self, line: str, current_language: str) -> IBlockBeginning:
        self._start_block('python')
        self.consume(line)
        return IBlockBeginning(remainder='')

    def can_consume(self, line: str) -> bool:
        return line.startswith('>>>') or line.startswith('...')

    def consume(self, line: str):
        super().consume(self._strip_prompt(line))

    def _strip_prompt(self, line: str) -> str:
        start = 4 if line.startswith('>>> ') or line.startswith('... ') else 3
        return line[start:]

    follower = PythonOutputBlockParser()


class DoubleColonBlockParser(IndentedBlockParser):

    def can_parse(self, line: str):
        # note: Python uses ' ::' but numpy uses just '::'
        return line.rstrip().endswith('::')

    def initiate_parsing(self, line: str, current_language: str):
        language = current_language
        if line.strip() == '.. autosummary::':
            language = ''
            line = ''
        else:
            line = re.sub(r'::$', '', line)

        self._start_block(language)
        return IBlockBeginning(remainder=line.rstrip() + '\n\n')


class MathBlockParser(IndentedBlockParser):
    enclosure = '$$'

    def can_parse(self, line: str):
        return line.strip() == '.. math::'

    def initiate_parsing(self, line: str, current_language: str):
        self._start_block('')
        return IBlockBeginning(remainder='')


class NoteBlockParser(IndentedBlockParser):
    enclosure = '\n---'
    directives = {
        f'.. {admonition.name}::': admonition
        for admonition in ADMONITIONS
    }

    def can_parse(self, line: str):
        return line.strip() in self.directives

    def initiate_parsing(self, line: str, current_language: str):
        admonition = self.directives[line.strip()]
        self._start_block(f'\n{admonition.block_markdown}\n')
        return IBlockBeginning(remainder='')


class ExplicitCodeBlockParser(IndentedBlockParser):
    def can_parse(self, line: str) -> bool:
        return re.match(CODE_BLOCK_PATTERN, line) is not None

    def initiate_parsing(self, line: str, current_language: str) -> IBlockBeginning:
        match = re.match(CODE_BLOCK_PATTERN, line)
        # already checked in can_parse
        assert match
        self._start_block(match.group('language').strip() or current_language)
        return IBlockBeginning(remainder='')


BLOCK_PARSERS = [
    PythonPromptCodeBlockParser(),
    NoteBlockParser(),
    MathBlockParser(),
    ExplicitCodeBlockParser(),
    DoubleColonBlockParser(),
    SimpleTableParser(),
    GridTableParser()
]

RST_SECTIONS = {
    section: '\n' + section + '\n' + '-' * len(section)
    for section in _RST_SECTIONS
}

DIRECTIVES = [
    *RST_DIRECTIVES,
    *ESCAPING_RULES
]


def rst_to_markdown(text: str, extract_signature: bool = True) -> str:
    """
    Try to parse docstrings in following formats to markdown:
    - https://www.python.org/dev/peps/pep-0287/
    - https://www.python.org/dev/peps/pep-0257/
    - https://sphinxcontrib-napoleon.readthedocs.io/en/latest/example_numpy.html
    - https://docutils.sourceforge.io/docs/ref/rst/restructuredtext.html#literal-blocks

    It is intended to improve the UX while better the solutions at the backend
    are being investigated rather than provide a fully-featured implementation.

    Supported features:
    - code blocks:
      - PEP0257 (formatting of code with highlighting, formatting of output without highlighting)
      - after ::
      - production lists,
      - explicit code blocks
    - NumPy-like list items
    - external links (inline only)
    - as subset of paragraph-level and inline directives

    Arguments:
        text - the input docstring
    """
    language = 'python'
    markdown = ''
    active_parser: Union[IParser, None] = None
    lines_buffer: List[str] = []
    most_recent_section: Union[str, None] = None
    is_first_line = True

    def flush_buffer():
        nonlocal lines_buffer
        lines = '\n'.join(lines_buffer)
        # rst markup handling
        for directive in DIRECTIVES:
            lines = re.sub(directive.pattern, directive.replacement, lines, flags=directive.flags)

        for (section, header) in RST_SECTIONS.items():
            lines = lines.replace(header, '\n#### ' + section + '\n')

        lines_buffer = []
        return lines

    for line in text.split('\n'):
        if is_first_line:
            if extract_signature:
                signature_match = re.match(r'^(?P<name>\S+)\((?P<params>.*)\)$', line)
                if signature_match and signature_match.group('name').isidentifier():
                    markdown += '```python\n' + line + '\n```\n'
                    continue
            is_first_line = False

        trimmed_line = line.lstrip()

        if active_parser:
            if active_parser.can_consume(line):
                active_parser.consume(line)
            else:
                markdown += flush_buffer()
                markdown += active_parser.finish_consumption(False)
                follower = active_parser.follower
                if follower and follower.can_parse(line):
                    active_parser = follower
                    active_parser.initiate_parsing(line, language)
                else:
                    active_parser = None

        if not active_parser:
            # we are not in a code block now but maybe we enter start one?
            for parser in BLOCK_PARSERS:
                if parser.can_parse(line):
                    active_parser = parser
                    block_start = parser.initiate_parsing(line, language)
                    line = block_start.remainder
                    break

            # ok, we are not in any code block (it may start with the next line, but this line is clear - or empty)

            # lists handling: items detection
            # this one does NOT allow spaces on the left hand side (to avoid false positive matches)
            match = re.match(r'^(?P<indent>\s*)(?P<argument>[^:\s]+) : (?P<type>.+)$', line)
            if match:
                line = match.group('indent') + '- `' + match.group('argument') + '`: ' + match.group('type') + ''
            else:
                if most_recent_section in SECTION_DIRECTIVES:
                    for section_directive in SECTION_DIRECTIVES[most_recent_section]:
                        if re.match(section_directive.pattern, trimmed_line):
                            line = re.sub(section_directive.pattern, section_directive.replacement, trimmed_line)
                            break
                if trimmed_line.rstrip() in RST_SECTIONS:
                    most_recent_section = trimmed_line.rstrip()

            # change highlight language if requested
            # this should not conflict with the parsers starting above
            # as the highlight directive should be in a line of its own
            highlight_match = re.search(HIGHLIGHT_PATTERN, line)
            if highlight_match and highlight_match.group('language').strip() != '':
                language = highlight_match.group('language').strip()

            lines_buffer.append(line)

    markdown += flush_buffer()
    # close off the code block - if any
    if active_parser:
        markdown += active_parser.finish_consumption(True)
    return markdown
