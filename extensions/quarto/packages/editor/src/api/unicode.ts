/*
 * unicode.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

// Tries to parse a unicode codepoint string that a user might enter
// For example:
// U+2A1F
// 2A1F
// 10783
const kMinValidCodepoint = 0;
const kMaxValidCodepoint = 1114112;

const kHexCodepointPrefix = 'U+';
const kHexNumberPrefex = '0x';

export function parseCodepoint(codepointText: string): number | undefined {
  // Try parsing it as a base 10 int
  // Use non primitive Number so we get strict parsing
  const base10Value = Number(codepointText).valueOf();
  if (!Number.isNaN(base10Value)) {
    if (isValidCodepoint(base10Value)) {
      return base10Value;
    }
  }

  // It might have a user prefix for unicode character, remove
  let hexOnlyText = codepointText.toUpperCase();
  if (hexOnlyText.startsWith(kHexCodepointPrefix.toUpperCase())) {
    hexOnlyText = codepointText.substr(kHexCodepointPrefix.length, codepointText.length - kHexCodepointPrefix.length);
  }

  // try parsing it as a hex string
  // Use non primitive Number so we get strict parsing, prefix with 0x to ensure treatment as hex
  if (!hexOnlyText.startsWith(kHexNumberPrefex)) {
    hexOnlyText = kHexNumberPrefex + hexOnlyText;
  }
  const hexValue = Number(hexOnlyText).valueOf();
  if (!Number.isNaN(hexValue) && isValidCodepoint(hexValue)) {
    return hexValue;
  }

  return undefined;
}

function isValidCodepoint(codepoint: number) {
  return codepoint > kMinValidCodepoint && codepoint < kMaxValidCodepoint;
}
