import functools
import re

# Skip text characters for text token, place those to pending buffer
# and increment current pos
from .state_inline import StateInline

# Rule to skip pure text
# '{}$%@~+=:' reserved for extensions

# !!!! Don't confuse with "Markdown ASCII Punctuation" chars
# http://spec.commonmark.org/0.15/#ascii-punctuation-character


_TerminatorChars = {
    "\n",
    "!",
    "#",
    "$",
    "%",
    "&",
    "*",
    "+",
    "-",
    ":",
    "<",
    "=",
    ">",
    "@",
    "[",
    "\\",
    "]",
    "^",
    "_",
    "`",
    "{",
    "}",
    "~",
}


@functools.cache
def _terminator_char_regex() -> re.Pattern[str]:
    return re.compile("[" + re.escape("".join(_TerminatorChars)) + "]")


def text(state: StateInline, silent: bool) -> bool:
    pos = state.pos
    posMax = state.posMax

    terminator_char = _terminator_char_regex().search(state.src, pos)
    pos = terminator_char.start() if terminator_char else posMax

    if pos == state.pos:
        return False

    if not silent:
        state.pending += state.src[state.pos : pos]

    state.pos = pos

    return True
