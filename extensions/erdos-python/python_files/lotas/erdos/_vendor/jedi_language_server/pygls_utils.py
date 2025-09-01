"""Utilities to work with pygls.

Helper functions that simplify working with pygls
"""

from typing import Optional

from erdos._vendor.lsprotocol.types import Position, Range
from erdos._vendor.pygls.workspace import TextDocument


def char_before_cursor(
    document: TextDocument, position: Position, default: str = ""
) -> str:
    """Get the character directly before the cursor."""
    try:
        return document.lines[position.line][position.character - 1]
    except IndexError:
        return default


def char_after_cursor(
    document: TextDocument, position: Position, default: str = ""
) -> str:
    """Get the character directly before the cursor."""
    try:
        return document.lines[position.line][position.character]
    except IndexError:
        return default


def current_word_range(
    document: TextDocument, position: Position
) -> Optional[Range]:
    """Get the range of the word under the cursor."""
    word = document.word_at_position(position)
    word_len = len(word)
    line: str = document.lines[position.line]
    start = 0
    for _ in range(1000):  # prevent infinite hanging in case we hit edge case
        begin = line.find(word, start)
        if begin == -1:
            return None
        end = begin + word_len
        if begin <= position.character <= end:
            return Range(
                start=Position(line=position.line, character=begin),
                end=Position(line=position.line, character=end),
            )
        start = end
    return None
