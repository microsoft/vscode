/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * This class has a very specific purpose:
 *
 *	It can return convert offset within a decoded JSON string to offset within the encoded JSON string.
 */
export class JsonStringScanner {
  private resultChars = 0;
  private pos = 0;

  /**
   *
   * @param text the encoded JSON string
   * @param pos must not include ", ie must be `stringJSONNode.offset + 1`
   */
  constructor(
    private readonly text: string,
    initialPos: number /* offset within `text` */
  ) {
    this.pos = initialPos;
  }

  // note that we don't do bound checks here, because we know that the offset is within the string
  getOffsetInEncoded(offsetDecoded: number) {
    let start = this.pos;

    while (true) {
      if (this.resultChars > offsetDecoded) {
        return start;
      }

      const ch = this.text.charCodeAt(this.pos);

      if (ch === CharacterCodes.backslash) {
        start = this.pos;
        this.pos++;

        const ch2 = this.text.charCodeAt(this.pos++);
        switch (ch2) {
          case CharacterCodes.doubleQuote:
          case CharacterCodes.backslash:
          case CharacterCodes.slash:
          case CharacterCodes.b:
          case CharacterCodes.f:
          case CharacterCodes.n:
          case CharacterCodes.r:
          case CharacterCodes.t:
            this.resultChars += 1;
            break;
          case CharacterCodes.u: {
            const ch3 = this.scanHexDigits(4, true);
            if (ch3 >= 0) {
              this.resultChars += String.fromCharCode(ch3).length;
            }
            break;
          }
        }
        continue;
      }
      start = this.pos;
      this.pos++;
      this.resultChars++;
    }
  }

  scanHexDigits(count: number, exact?: boolean): number {
    let digits = 0;
    let value = 0;
    while (digits < count || !exact) {
      const ch = this.text.charCodeAt(this.pos);
      if (ch >= CharacterCodes._0 && ch <= CharacterCodes._9) {
        value = value * 16 + ch - CharacterCodes._0;
      } else if (ch >= CharacterCodes.A && ch <= CharacterCodes.F) {
        value = value * 16 + ch - CharacterCodes.A + 10;
      } else if (ch >= CharacterCodes.a && ch <= CharacterCodes.f) {
        value = value * 16 + ch - CharacterCodes.a + 10;
      } else {
        break;
      }
      this.pos++;
      digits++;
    }
    if (digits < count) {
      value = -1;
    }
    return value;
  }
}

const enum CharacterCodes {
  lineFeed = 0x0a, // \n
  carriageReturn = 0x0d, // \r

  space = 0x0020, // " "

  _0 = 0x30,
  _1 = 0x31,
  _2 = 0x32,
  _3 = 0x33,
  _4 = 0x34,
  _5 = 0x35,
  _6 = 0x36,
  _7 = 0x37,
  _8 = 0x38,
  _9 = 0x39,

  a = 0x61,
  b = 0x62,
  c = 0x63,
  d = 0x64,
  e = 0x65,
  f = 0x66,
  g = 0x67,
  h = 0x68,
  i = 0x69,
  j = 0x6a,
  k = 0x6b,
  l = 0x6c,
  m = 0x6d,
  n = 0x6e,
  o = 0x6f,
  p = 0x70,
  q = 0x71,
  r = 0x72,
  s = 0x73,
  t = 0x74,
  u = 0x75,
  v = 0x76,
  w = 0x77,
  x = 0x78,
  y = 0x79,
  z = 0x7a,

  A = 0x41,
  B = 0x42,
  C = 0x43,
  D = 0x44,
  E = 0x45,
  F = 0x46,
  G = 0x47,
  H = 0x48,
  I = 0x49,
  J = 0x4a,
  K = 0x4b,
  L = 0x4c,
  M = 0x4d,
  N = 0x4e,
  O = 0x4f,
  P = 0x50,
  Q = 0x51,
  R = 0x52,
  S = 0x53,
  T = 0x54,
  U = 0x55,
  V = 0x56,
  W = 0x57,
  X = 0x58,
  Y = 0x59,
  Z = 0x5a,

  asterisk = 0x2a, // *
  backslash = 0x5c, // \
  closeBrace = 0x7d, // }
  closeBracket = 0x5d, // ]
  colon = 0x3a, // :
  comma = 0x2c, // ,
  dot = 0x2e, // .
  doubleQuote = 0x22, // "
  minus = 0x2d, // -
  openBrace = 0x7b, // {
  openBracket = 0x5b, // [
  plus = 0x2b, // +
  slash = 0x2f, // /

  formFeed = 0x0c, // \f
  tab = 0x09, // \t
}
