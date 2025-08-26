############################################################################
# Original work Copyright 2017 Palantir Technologies, Inc.                 #
# Original work licensed under the MIT License.                            #
# See ThirdPartyNotices.txt in the project root for license information.   #
# All modifications Copyright (c) Open Law Library. All rights reserved.   #
#                                                                          #
# Licensed under the Apache License, Version 2.0 (the "License")           #
# you may not use this file except in compliance with the License.         #
# You may obtain a copy of the License at                                  #
#                                                                          #
#     http: // www.apache.org/licenses/LICENSE-2.0                         #
#                                                                          #
# Unless required by applicable law or agreed to in writing, software      #
# distributed under the License is distributed on an "AS IS" BASIS,        #
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. #
# See the License for the specific language governing permissions and      #
# limitations under the License.                                           #
############################################################################
import logging
from typing import List, Optional, Union

from lotas.erdos._vendor.lsprotocol import types


log = logging.getLogger(__name__)


class PositionCodec:
    def __init__(
        self,
        encoding: Optional[
            Union[types.PositionEncodingKind, str]
        ] = types.PositionEncodingKind.Utf16,
    ):
        self.encoding = encoding

    @classmethod
    def is_char_beyond_multilingual_plane(cls, char: str) -> bool:
        return ord(char) > 0xFFFF

    def utf16_unit_offset(self, chars: str):
        """
        Calculate the number of characters which need two utf-16 code units.

        Arguments:
            chars (str): The string to count occurrences of utf-16 code units for.
        """
        return sum(self.is_char_beyond_multilingual_plane(ch) for ch in chars)

    def client_num_units(self, chars: str):
        """
        Calculate the length of `str` in client-supported UTF-[32|16|8] code units.

        Arguments:
            chars (str): The string to return the length in UTF-[32|16|8] code units for.
        """
        utf32_units = len(chars)
        if self.encoding == types.PositionEncodingKind.Utf32:
            return utf32_units

        if self.encoding == types.PositionEncodingKind.Utf8:
            return utf32_units + (self.utf16_unit_offset(chars) * 2)

        return utf32_units + self.utf16_unit_offset(chars)

    def position_from_client_units(
        self, lines: List[str], position: types.Position
    ) -> types.Position:
        """
        Convert the position.character from UTF-[32|16|8] code units to UTF-32.

        A python application can't use the character member of `Position`
        directly. As per specification it is represented as a zero-based line and
        character offset based on posible a UTF-[32|16|8] string representation.

        All characters whose code point exceeds the Basic Multilingual Plane are
        represented by 2 UTF-16 or 4 UTF-8 code units.

        The offset of the closing quotation mark in x="😋" is
        - 7 in UTF-8 representation
        - 5 in UTF-16 representation
        - 4 in UTF-32 representation

        see: https://github.com/microsoft/language-server-protocol/issues/376

        Arguments:
            lines (list):
                The content of the document which the position refers to.
            position (Position):
                The line and character offset in UTF-[32|16|8] code units.

        Returns:
            The position with `character` being converted to UTF-32 code units.
        """
        if len(lines) == 0:
            return types.Position(0, 0)
        if position.line >= len(lines):
            return types.Position(len(lines) - 1, self.client_num_units(lines[-1]))

        _line = lines[position.line]
        _line = _line.replace("\r\n", "\n")  # TODO: it's a bit of a hack
        _client_len = self.client_num_units(_line)
        _utf32_len = len(_line)

        if _client_len == 0:
            return types.Position(position.line, 0)

        _client_end_of_line = self.client_num_units(_line)
        if position.character > _client_end_of_line:
            position.character = _client_end_of_line - 1

        _client_index = 0
        utf32_index = 0
        while True:
            _is_searching_queried_position = _client_index < position.character
            _is_before_end_of_line = utf32_index < _utf32_len
            _is_searching_for_position = (
                _is_searching_queried_position and _is_before_end_of_line
            )
            if not _is_searching_for_position:
                break

            _current_char = _line[utf32_index]
            _is_double_width = PositionCodec.is_char_beyond_multilingual_plane(
                _current_char
            )
            if _is_double_width:
                if self.encoding == types.PositionEncodingKind.Utf32:
                    _client_index += 1
                if self.encoding == types.PositionEncodingKind.Utf8:
                    _client_index += 4
                _client_index += 2
            else:
                _client_index += 1
            utf32_index += 1

        position = types.Position(line=position.line, character=utf32_index)
        return position

    def position_to_client_units(
        self, lines: List[str], position: types.Position
    ) -> types.Position:
        """
        Convert the position.character from its internal UTF-32 representation
        to client-supported UTF-[32|16|8] code units.

        Arguments:
            lines (list):
                The content of the document which the position refers to.
            position (Position):
                The line and character offset in UTF-32 code units.

        Returns:
            The position with `character` being converted to UTF-[32|16|8] code units.
        """
        try:
            character = self.client_num_units(
                lines[position.line][: position.character]
            )
            return types.Position(
                line=position.line,
                character=character,
            )
        except IndexError:
            return types.Position(line=len(lines), character=0)

    def range_from_client_units(
        self, lines: List[str], range: types.Range
    ) -> types.Range:
        """
        Convert range.[start|end].character from UTF-[32|16|8] code units to UTF-32.

        Arguments:
            lines (list):
                The content of the document which the range refers to.
            range (Range):
                The line and character offset in UTF-[32|16|8] code units.

        Returns:
            The range with `character` offsets being converted to UTF-32 code units.
        """
        range_new = types.Range(
            start=self.position_from_client_units(lines, range.start),
            end=self.position_from_client_units(lines, range.end),
        )
        return range_new

    def range_to_client_units(
        self, lines: List[str], range: types.Range
    ) -> types.Range:
        """
        Convert range.[start|end].character from UTF-32 to UTF-[32|16|8] code units.

        Arguments:
            lines (list):
                The content of the document which the range refers to.
            range (Range):
                The line and character offset in  code units.

        Returns:
            The range with `character` offsets being converted to UTF-[32|16|8] code units.
        """
        return types.Range(
            start=self.position_to_client_units(lines, range.start),
            end=self.position_to_client_units(lines, range.end),
        )
