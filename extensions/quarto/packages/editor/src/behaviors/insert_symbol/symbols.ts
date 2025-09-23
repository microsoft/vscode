import { SymbolCharacterGroup } from './insert_symbol-dataprovider';

const symbols: SymbolCharacterGroup[] = [
  {
    name: 'Miscellaneous',
    symbols: [
      {
        name: 'NO-BREAK SPACE',
        value: ' ',
        codepoint: 160,
      },
      {
        name: 'INVERTED EXCLAMATION MARK',
        value: '¡',
        codepoint: 161,
      },
      {
        name: 'CENT SIGN',
        value: '¢',
        codepoint: 162,
      },
      {
        name: 'POUND SIGN',
        value: '£',
        codepoint: 163,
      },
      {
        name: 'CURRENCY SIGN',
        value: '¤',
        codepoint: 164,
      },
      {
        name: 'YEN SIGN',
        value: '¥',
        codepoint: 165,
      },
      {
        name: 'BROKEN BAR',
        value: '¦',
        codepoint: 166,
      },
      {
        name: 'SECTION SIGN',
        value: '§',
        codepoint: 167,
      },
      {
        name: 'DIAERESIS',
        value: '¨',
        codepoint: 168,
      },
      {
        name: 'FEMININE ORDINAL INDICATOR',
        value: 'ª',
        codepoint: 170,
      },
      {
        name: 'LEFT-POINTING DOUBLE ANGLE QUOTATION MARK',
        value: '«',
        codepoint: 171,
      },
      {
        name: 'NOT SIGN',
        value: '¬',
        codepoint: 172,
      },
      {
        name: 'MACRON',
        value: '¯',
        codepoint: 175,
      },
      {
        name: 'DEGREE SIGN',
        value: '°',
        codepoint: 176,
      },
      {
        name: 'PLUS-MINUS SIGN',
        value: '±',
        codepoint: 177,
      },
      {
        name: 'SUPERSCRIPT TWO',
        value: '²',
        codepoint: 178,
      },
      {
        name: 'SUPERSCRIPT THREE',
        value: '³',
        codepoint: 179,
      },
      {
        name: 'ACUTE ACCENT',
        value: '´',
        codepoint: 180,
      },
      {
        name: 'MICRO SIGN',
        value: 'µ',
        codepoint: 181,
      },
      {
        name: 'PILCROW SIGN',
        value: '¶',
        codepoint: 182,
      },
      {
        name: 'MIDDLE DOT',
        value: '·',
        codepoint: 183,
      },
      {
        name: 'CEDILLA',
        value: '¸',
        codepoint: 184,
      },
      {
        name: 'SUPERSCRIPT ONE',
        value: '¹',
        codepoint: 185,
      },
      {
        name: 'MASCULINE ORDINAL INDICATOR',
        value: 'º',
        codepoint: 186,
      },
      {
        name: 'RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK',
        value: '»',
        codepoint: 187,
      },
      {
        name: 'VULGAR FRACTION ONE QUARTER',
        value: '¼',
        codepoint: 188,
      },
      {
        name: 'VULGAR FRACTION ONE HALF',
        value: '½',
        codepoint: 189,
      },
      {
        name: 'VULGAR FRACTION THREE QUARTERS',
        value: '¾',
        codepoint: 190,
      },
      {
        name: 'INVERTED QUESTION MARK',
        value: '¿',
        codepoint: 191,
      },
      {
        name: 'LATIN CAPITAL LETTER A WITH GRAVE',
        value: 'À',
        codepoint: 192,
      },
      {
        name: 'LATIN CAPITAL LETTER A WITH ACUTE',
        value: 'Á',
        codepoint: 193,
      },
      {
        name: 'LATIN CAPITAL LETTER A WITH CIRCUMFLEX',
        value: 'Â',
        codepoint: 194,
      },
      {
        name: 'LATIN CAPITAL LETTER A WITH TILDE',
        value: 'Ã',
        codepoint: 195,
      },
      {
        name: 'LATIN CAPITAL LETTER A WITH DIAERESIS',
        value: 'Ä',
        codepoint: 196,
      },
      {
        name: 'LATIN CAPITAL LETTER A WITH RING ABOVE',
        value: 'Å',
        codepoint: 197,
      },
      {
        name: 'LATIN CAPITAL LETTER AE',
        value: 'Æ',
        codepoint: 198,
      },
      {
        name: 'LATIN CAPITAL LETTER C WITH CEDILLA',
        value: 'Ç',
        codepoint: 199,
      },
      {
        name: 'LATIN CAPITAL LETTER E WITH GRAVE',
        value: 'È',
        codepoint: 200,
      },
      {
        name: 'LATIN CAPITAL LETTER E WITH ACUTE',
        value: 'É',
        codepoint: 201,
      },
      {
        name: 'LATIN CAPITAL LETTER E WITH CIRCUMFLEX',
        value: 'Ê',
        codepoint: 202,
      },
      {
        name: 'LATIN CAPITAL LETTER E WITH DIAERESIS',
        value: 'Ë',
        codepoint: 203,
      },
      {
        name: 'LATIN CAPITAL LETTER I WITH GRAVE',
        value: 'Ì',
        codepoint: 204,
      },
      {
        name: 'LATIN CAPITAL LETTER I WITH ACUTE',
        value: 'Í',
        codepoint: 205,
      },
      {
        name: 'LATIN CAPITAL LETTER I WITH CIRCUMFLEX',
        value: 'Î',
        codepoint: 206,
      },
      {
        name: 'LATIN CAPITAL LETTER I WITH DIAERESIS',
        value: 'Ï',
        codepoint: 207,
      },
      {
        name: 'LATIN CAPITAL LETTER ETH',
        value: 'Ð',
        codepoint: 208,
      },
      {
        name: 'LATIN CAPITAL LETTER N WITH TILDE',
        value: 'Ñ',
        codepoint: 209,
      },
      {
        name: 'LATIN CAPITAL LETTER O WITH GRAVE',
        value: 'Ò',
        codepoint: 210,
      },
      {
        name: 'LATIN CAPITAL LETTER O WITH ACUTE',
        value: 'Ó',
        codepoint: 211,
      },
      {
        name: 'LATIN CAPITAL LETTER O WITH CIRCUMFLEX',
        value: 'Ô',
        codepoint: 212,
      },
      {
        name: 'LATIN CAPITAL LETTER O WITH TILDE',
        value: 'Õ',
        codepoint: 213,
      },
      {
        name: 'LATIN CAPITAL LETTER O WITH DIAERESIS',
        value: 'Ö',
        codepoint: 214,
      },
      {
        name: 'MULTIPLICATION SIGN',
        value: '×',
        codepoint: 215,
      },
      {
        name: 'LATIN CAPITAL LETTER O WITH STROKE',
        value: 'Ø',
        codepoint: 216,
      },
      {
        name: 'LATIN CAPITAL LETTER U WITH GRAVE',
        value: 'Ù',
        codepoint: 217,
      },
      {
        name: 'LATIN CAPITAL LETTER U WITH ACUTE',
        value: 'Ú',
        codepoint: 218,
      },
      {
        name: 'LATIN CAPITAL LETTER U WITH CIRCUMFLEX',
        value: 'Û',
        codepoint: 219,
      },
      {
        name: 'LATIN CAPITAL LETTER U WITH DIAERESIS',
        value: 'Ü',
        codepoint: 220,
      },
      {
        name: 'LATIN CAPITAL LETTER Y WITH ACUTE',
        value: 'Ý',
        codepoint: 221,
      },
      {
        name: 'LATIN CAPITAL LETTER THORN',
        value: 'Þ',
        codepoint: 222,
      },
      {
        name: 'LATIN SMALL LETTER SHARP S',
        value: 'ß',
        codepoint: 223,
      },
      {
        name: 'LATIN SMALL LETTER A WITH GRAVE',
        value: 'à',
        codepoint: 224,
      },
      {
        name: 'LATIN SMALL LETTER A WITH ACUTE',
        value: 'á',
        codepoint: 225,
      },
      {
        name: 'LATIN SMALL LETTER A WITH CIRCUMFLEX',
        value: 'â',
        codepoint: 226,
      },
      {
        name: 'LATIN SMALL LETTER A WITH TILDE',
        value: 'ã',
        codepoint: 227,
      },
      {
        name: 'LATIN SMALL LETTER A WITH DIAERESIS',
        value: 'ä',
        codepoint: 228,
      },
      {
        name: 'LATIN SMALL LETTER A WITH RING ABOVE',
        value: 'å',
        codepoint: 229,
      },
      {
        name: 'LATIN SMALL LETTER AE',
        value: 'æ',
        codepoint: 230,
      },
      {
        name: 'LATIN SMALL LETTER C WITH CEDILLA',
        value: 'ç',
        codepoint: 231,
      },
      {
        name: 'LATIN SMALL LETTER E WITH GRAVE',
        value: 'è',
        codepoint: 232,
      },
      {
        name: 'LATIN SMALL LETTER E WITH ACUTE',
        value: 'é',
        codepoint: 233,
      },
      {
        name: 'LATIN SMALL LETTER E WITH CIRCUMFLEX',
        value: 'ê',
        codepoint: 234,
      },
      {
        name: 'LATIN SMALL LETTER E WITH DIAERESIS',
        value: 'ë',
        codepoint: 235,
      },
      {
        name: 'LATIN SMALL LETTER I WITH GRAVE',
        value: 'ì',
        codepoint: 236,
      },
      {
        name: 'LATIN SMALL LETTER I WITH ACUTE',
        value: 'í',
        codepoint: 237,
      },
      {
        name: 'LATIN SMALL LETTER I WITH CIRCUMFLEX',
        value: 'î',
        codepoint: 238,
      },
      {
        name: 'LATIN SMALL LETTER I WITH DIAERESIS',
        value: 'ï',
        codepoint: 239,
      },
      {
        name: 'LATIN SMALL LETTER ETH',
        value: 'ð',
        codepoint: 240,
      },
      {
        name: 'LATIN SMALL LETTER N WITH TILDE',
        value: 'ñ',
        codepoint: 241,
      },
      {
        name: 'LATIN SMALL LETTER O WITH GRAVE',
        value: 'ò',
        codepoint: 242,
      },
      {
        name: 'LATIN SMALL LETTER O WITH ACUTE',
        value: 'ó',
        codepoint: 243,
      },
      {
        name: 'LATIN SMALL LETTER O WITH CIRCUMFLEX',
        value: 'ô',
        codepoint: 244,
      },
      {
        name: 'LATIN SMALL LETTER O WITH TILDE',
        value: 'õ',
        codepoint: 245,
      },
      {
        name: 'LATIN SMALL LETTER O WITH DIAERESIS',
        value: 'ö',
        codepoint: 246,
      },
      {
        name: 'DIVISION SIGN',
        value: '÷',
        codepoint: 247,
      },
      {
        name: 'LATIN SMALL LETTER O WITH STROKE',
        value: 'ø',
        codepoint: 248,
      },
      {
        name: 'LATIN SMALL LETTER U WITH GRAVE',
        value: 'ù',
        codepoint: 249,
      },
      {
        name: 'LATIN SMALL LETTER U WITH ACUTE',
        value: 'ú',
        codepoint: 250,
      },
      {
        name: 'LATIN SMALL LETTER U WITH CIRCUMFLEX',
        value: 'û',
        codepoint: 251,
      },
      {
        name: 'LATIN SMALL LETTER U WITH DIAERESIS',
        value: 'ü',
        codepoint: 252,
      },
      {
        name: 'LATIN SMALL LETTER Y WITH ACUTE',
        value: 'ý',
        codepoint: 253,
      },
      {
        name: 'LATIN SMALL LETTER THORN',
        value: 'þ',
        codepoint: 254,
      },
      {
        name: 'LATIN SMALL LETTER Y WITH DIAERESIS',
        value: 'ÿ',
        codepoint: 255,
      },
      {
        name: 'ACCOUNT OF',
        value: '℀',
        codepoint: 8448,
      },
      {
        name: 'ADDRESSED TO THE SUBJECT',
        value: '℁',
        codepoint: 8449,
      },
      {
        name: 'DOUBLE-STRUCK CAPITAL C',
        value: 'ℂ',
        codepoint: 8450,
      },
      {
        name: 'DEGREE CELSIUS',
        value: '℃',
        codepoint: 8451,
      },
      {
        name: 'CENTRE LINE SYMBOL',
        value: '℄',
        codepoint: 8452,
      },
      {
        name: 'CARE OF',
        value: '℅',
        codepoint: 8453,
      },
      {
        name: 'CADA UNA',
        value: '℆',
        codepoint: 8454,
      },
      {
        name: 'EULER CONSTANT',
        value: 'ℇ',
        codepoint: 8455,
      },
      {
        name: 'SCRUPLE',
        value: '℈',
        codepoint: 8456,
      },
      {
        name: 'DEGREE FAHRENHEIT',
        value: '℉',
        codepoint: 8457,
      },
      {
        name: 'SCRIPT SMALL G',
        value: 'ℊ',
        codepoint: 8458,
      },
      {
        name: 'SCRIPT CAPITAL H',
        value: 'ℋ',
        codepoint: 8459,
      },
      {
        name: 'BLACK-LETTER CAPITAL H',
        value: 'ℌ',
        codepoint: 8460,
      },
      {
        name: 'DOUBLE-STRUCK CAPITAL H',
        value: 'ℍ',
        codepoint: 8461,
      },
      {
        name: 'PLANCK CONSTANT',
        value: 'ℎ',
        codepoint: 8462,
      },
      {
        name: 'PLANCK CONSTANT OVER TWO PI',
        value: 'ℏ',
        codepoint: 8463,
      },
      {
        name: 'SCRIPT CAPITAL I',
        value: 'ℐ',
        codepoint: 8464,
      },
      {
        name: 'BLACK-LETTER CAPITAL I',
        value: 'ℑ',
        codepoint: 8465,
      },
      {
        name: 'SCRIPT CAPITAL L',
        value: 'ℒ',
        codepoint: 8466,
      },
      {
        name: 'SCRIPT SMALL L',
        value: 'ℓ',
        codepoint: 8467,
      },
      {
        name: 'L B BAR SYMBOL',
        value: '℔',
        codepoint: 8468,
      },
      {
        name: 'DOUBLE-STRUCK CAPITAL N',
        value: 'ℕ',
        codepoint: 8469,
      },
      {
        name: 'NUMERO SIGN',
        value: '№',
        codepoint: 8470,
      },
      {
        name: 'SOUND RECORDING COPYRIGHT',
        value: '℗',
        codepoint: 8471,
      },
      {
        name: 'SCRIPT CAPITAL P',
        value: '℘',
        codepoint: 8472,
      },
      {
        name: 'DOUBLE-STRUCK CAPITAL P',
        value: 'ℙ',
        codepoint: 8473,
      },
      {
        name: 'DOUBLE-STRUCK CAPITAL Q',
        value: 'ℚ',
        codepoint: 8474,
      },
      {
        name: 'SCRIPT CAPITAL R',
        value: 'ℛ',
        codepoint: 8475,
      },
      {
        name: 'BLACK-LETTER CAPITAL R',
        value: 'ℜ',
        codepoint: 8476,
      },
      {
        name: 'DOUBLE-STRUCK CAPITAL R',
        value: 'ℝ',
        codepoint: 8477,
      },
      {
        name: 'PRESCRIPTION TAKE',
        value: '℞',
        codepoint: 8478,
      },
      {
        name: 'RESPONSE',
        value: '℟',
        codepoint: 8479,
      },
      {
        name: 'SERVICE MARK',
        value: '℠',
        codepoint: 8480,
      },
      {
        name: 'TELEPHONE SIGN',
        value: '℡',
        codepoint: 8481,
      },
      {
        name: 'VERSICLE',
        value: '℣',
        codepoint: 8483,
      },
      {
        name: 'DOUBLE-STRUCK CAPITAL Z',
        value: 'ℤ',
        codepoint: 8484,
      },
      {
        name: 'OUNCE SIGN',
        value: '℥',
        codepoint: 8485,
      },
      {
        name: 'OHM SIGN',
        value: 'Ω',
        codepoint: 8486,
      },
      {
        name: 'INVERTED OHM SIGN',
        value: '℧',
        codepoint: 8487,
      },
      {
        name: 'BLACK-LETTER CAPITAL Z',
        value: 'ℨ',
        codepoint: 8488,
      },
      {
        name: 'TURNED GREEK SMALL LETTER IOTA',
        value: '℩',
        codepoint: 8489,
      },
      {
        name: 'KELVIN SIGN',
        value: 'K',
        codepoint: 8490,
      },
      {
        name: 'ANGSTROM SIGN',
        value: 'Å',
        codepoint: 8491,
      },
      {
        name: 'SCRIPT CAPITAL B',
        value: 'ℬ',
        codepoint: 8492,
      },
      {
        name: 'BLACK-LETTER CAPITAL C',
        value: 'ℭ',
        codepoint: 8493,
      },
      {
        name: 'ESTIMATED SYMBOL',
        value: '℮',
        codepoint: 8494,
      },
      {
        name: 'SCRIPT SMALL E',
        value: 'ℯ',
        codepoint: 8495,
      },
      {
        name: 'SCRIPT CAPITAL E',
        value: 'ℰ',
        codepoint: 8496,
      },
      {
        name: 'SCRIPT CAPITAL F',
        value: 'ℱ',
        codepoint: 8497,
      },
      {
        name: 'TURNED CAPITAL F',
        value: 'Ⅎ',
        codepoint: 8498,
      },
      {
        name: 'SCRIPT CAPITAL M',
        value: 'ℳ',
        codepoint: 8499,
      },
      {
        name: 'SCRIPT SMALL O',
        value: 'ℴ',
        codepoint: 8500,
      },
      {
        name: 'ALEF SYMBOL',
        value: 'ℵ',
        codepoint: 8501,
      },
      {
        name: 'BET SYMBOL',
        value: 'ℶ',
        codepoint: 8502,
      },
      {
        name: 'GIMEL SYMBOL',
        value: 'ℷ',
        codepoint: 8503,
      },
      {
        name: 'DALET SYMBOL',
        value: 'ℸ',
        codepoint: 8504,
      },
      {
        name: 'ROTATED CAPITAL Q',
        value: '℺',
        codepoint: 8506,
      },
      {
        name: 'FACSIMILE SIGN',
        value: '℻',
        codepoint: 8507,
      },
      {
        name: 'DOUBLE-STRUCK SMALL PI',
        value: 'ℼ',
        codepoint: 8508,
      },
      {
        name: 'DOUBLE-STRUCK SMALL GAMMA',
        value: 'ℽ',
        codepoint: 8509,
      },
      {
        name: 'DOUBLE-STRUCK CAPITAL GAMMA',
        value: 'ℾ',
        codepoint: 8510,
      },
      {
        name: 'DOUBLE-STRUCK CAPITAL PI',
        value: 'ℿ',
        codepoint: 8511,
      },
      {
        name: 'DOUBLE-STRUCK N-ARY SUMMATION',
        value: '⅀',
        codepoint: 8512,
      },
      {
        name: 'TURNED SANS-SERIF CAPITAL G',
        value: '⅁',
        codepoint: 8513,
      },
      {
        name: 'TURNED SANS-SERIF CAPITAL L',
        value: '⅂',
        codepoint: 8514,
      },
      {
        name: 'REVERSED SANS-SERIF CAPITAL L',
        value: '⅃',
        codepoint: 8515,
      },
      {
        name: 'TURNED SANS-SERIF CAPITAL Y',
        value: '⅄',
        codepoint: 8516,
      },
      {
        name: 'DOUBLE-STRUCK ITALIC CAPITAL D',
        value: 'ⅅ',
        codepoint: 8517,
      },
      {
        name: 'DOUBLE-STRUCK ITALIC SMALL D',
        value: 'ⅆ',
        codepoint: 8518,
      },
      {
        name: 'DOUBLE-STRUCK ITALIC SMALL E',
        value: 'ⅇ',
        codepoint: 8519,
      },
      {
        name: 'DOUBLE-STRUCK ITALIC SMALL I',
        value: 'ⅈ',
        codepoint: 8520,
      },
      {
        name: 'DOUBLE-STRUCK ITALIC SMALL J',
        value: 'ⅉ',
        codepoint: 8521,
      },
      {
        name: 'PROPERTY LINE',
        value: '⅊',
        codepoint: 8522,
      },
      {
        name: 'TURNED AMPERSAND',
        value: '⅋',
        codepoint: 8523,
      },
      {
        name: 'PER SIGN',
        value: '⅌',
        codepoint: 8524,
      },
      {
        name: 'AKTIESELSKAB',
        value: '⅍',
        codepoint: 8525,
      },
      {
        name: 'TURNED SMALL F',
        value: 'ⅎ',
        codepoint: 8526,
      },
      {
        name: 'SYMBOL FOR SAMARITAN SOURCE',
        value: '⅏',
        codepoint: 8527,
      },
      {
        name: 'CIRCLED DIGIT ONE',
        value: '①',
        codepoint: 9312,
      },
      {
        name: 'CIRCLED DIGIT TWO',
        value: '②',
        codepoint: 9313,
      },
      {
        name: 'CIRCLED DIGIT THREE',
        value: '③',
        codepoint: 9314,
      },
      {
        name: 'CIRCLED DIGIT FOUR',
        value: '④',
        codepoint: 9315,
      },
      {
        name: 'CIRCLED DIGIT FIVE',
        value: '⑤',
        codepoint: 9316,
      },
      {
        name: 'CIRCLED DIGIT SIX',
        value: '⑥',
        codepoint: 9317,
      },
      {
        name: 'CIRCLED DIGIT SEVEN',
        value: '⑦',
        codepoint: 9318,
      },
      {
        name: 'CIRCLED DIGIT EIGHT',
        value: '⑧',
        codepoint: 9319,
      },
      {
        name: 'CIRCLED DIGIT NINE',
        value: '⑨',
        codepoint: 9320,
      },
      {
        name: 'CIRCLED NUMBER TEN',
        value: '⑩',
        codepoint: 9321,
      },
      {
        name: 'CIRCLED NUMBER ELEVEN',
        value: '⑪',
        codepoint: 9322,
      },
      {
        name: 'CIRCLED NUMBER TWELVE',
        value: '⑫',
        codepoint: 9323,
      },
      {
        name: 'CIRCLED NUMBER THIRTEEN',
        value: '⑬',
        codepoint: 9324,
      },
      {
        name: 'CIRCLED NUMBER FOURTEEN',
        value: '⑭',
        codepoint: 9325,
      },
      {
        name: 'CIRCLED NUMBER FIFTEEN',
        value: '⑮',
        codepoint: 9326,
      },
      {
        name: 'CIRCLED NUMBER SIXTEEN',
        value: '⑯',
        codepoint: 9327,
      },
      {
        name: 'CIRCLED NUMBER SEVENTEEN',
        value: '⑰',
        codepoint: 9328,
      },
      {
        name: 'CIRCLED NUMBER EIGHTEEN',
        value: '⑱',
        codepoint: 9329,
      },
      {
        name: 'CIRCLED NUMBER NINETEEN',
        value: '⑲',
        codepoint: 9330,
      },
      {
        name: 'CIRCLED NUMBER TWENTY',
        value: '⑳',
        codepoint: 9331,
      },
      {
        name: 'PARENTHESIZED DIGIT ONE',
        value: '⑴',
        codepoint: 9332,
      },
      {
        name: 'PARENTHESIZED DIGIT TWO',
        value: '⑵',
        codepoint: 9333,
      },
      {
        name: 'PARENTHESIZED DIGIT THREE',
        value: '⑶',
        codepoint: 9334,
      },
      {
        name: 'PARENTHESIZED DIGIT FOUR',
        value: '⑷',
        codepoint: 9335,
      },
      {
        name: 'PARENTHESIZED DIGIT FIVE',
        value: '⑸',
        codepoint: 9336,
      },
      {
        name: 'PARENTHESIZED DIGIT SIX',
        value: '⑹',
        codepoint: 9337,
      },
      {
        name: 'PARENTHESIZED DIGIT SEVEN',
        value: '⑺',
        codepoint: 9338,
      },
      {
        name: 'PARENTHESIZED DIGIT EIGHT',
        value: '⑻',
        codepoint: 9339,
      },
      {
        name: 'PARENTHESIZED DIGIT NINE',
        value: '⑼',
        codepoint: 9340,
      },
      {
        name: 'PARENTHESIZED NUMBER TEN',
        value: '⑽',
        codepoint: 9341,
      },
      {
        name: 'PARENTHESIZED NUMBER ELEVEN',
        value: '⑾',
        codepoint: 9342,
      },
      {
        name: 'PARENTHESIZED NUMBER TWELVE',
        value: '⑿',
        codepoint: 9343,
      },
      {
        name: 'PARENTHESIZED NUMBER THIRTEEN',
        value: '⒀',
        codepoint: 9344,
      },
      {
        name: 'PARENTHESIZED NUMBER FOURTEEN',
        value: '⒁',
        codepoint: 9345,
      },
      {
        name: 'PARENTHESIZED NUMBER FIFTEEN',
        value: '⒂',
        codepoint: 9346,
      },
      {
        name: 'PARENTHESIZED NUMBER SIXTEEN',
        value: '⒃',
        codepoint: 9347,
      },
      {
        name: 'PARENTHESIZED NUMBER SEVENTEEN',
        value: '⒄',
        codepoint: 9348,
      },
      {
        name: 'PARENTHESIZED NUMBER EIGHTEEN',
        value: '⒅',
        codepoint: 9349,
      },
      {
        name: 'PARENTHESIZED NUMBER NINETEEN',
        value: '⒆',
        codepoint: 9350,
      },
      {
        name: 'PARENTHESIZED NUMBER TWENTY',
        value: '⒇',
        codepoint: 9351,
      },
      {
        name: 'DIGIT ONE FULL STOP',
        value: '⒈',
        codepoint: 9352,
      },
      {
        name: 'DIGIT TWO FULL STOP',
        value: '⒉',
        codepoint: 9353,
      },
      {
        name: 'DIGIT THREE FULL STOP',
        value: '⒊',
        codepoint: 9354,
      },
      {
        name: 'DIGIT FOUR FULL STOP',
        value: '⒋',
        codepoint: 9355,
      },
      {
        name: 'DIGIT FIVE FULL STOP',
        value: '⒌',
        codepoint: 9356,
      },
      {
        name: 'DIGIT SIX FULL STOP',
        value: '⒍',
        codepoint: 9357,
      },
      {
        name: 'DIGIT SEVEN FULL STOP',
        value: '⒎',
        codepoint: 9358,
      },
      {
        name: 'DIGIT EIGHT FULL STOP',
        value: '⒏',
        codepoint: 9359,
      },
      {
        name: 'DIGIT NINE FULL STOP',
        value: '⒐',
        codepoint: 9360,
      },
      {
        name: 'NUMBER TEN FULL STOP',
        value: '⒑',
        codepoint: 9361,
      },
      {
        name: 'NUMBER ELEVEN FULL STOP',
        value: '⒒',
        codepoint: 9362,
      },
      {
        name: 'NUMBER TWELVE FULL STOP',
        value: '⒓',
        codepoint: 9363,
      },
      {
        name: 'NUMBER THIRTEEN FULL STOP',
        value: '⒔',
        codepoint: 9364,
      },
      {
        name: 'NUMBER FOURTEEN FULL STOP',
        value: '⒕',
        codepoint: 9365,
      },
      {
        name: 'NUMBER FIFTEEN FULL STOP',
        value: '⒖',
        codepoint: 9366,
      },
      {
        name: 'NUMBER SIXTEEN FULL STOP',
        value: '⒗',
        codepoint: 9367,
      },
      {
        name: 'NUMBER SEVENTEEN FULL STOP',
        value: '⒘',
        codepoint: 9368,
      },
      {
        name: 'NUMBER EIGHTEEN FULL STOP',
        value: '⒙',
        codepoint: 9369,
      },
      {
        name: 'NUMBER NINETEEN FULL STOP',
        value: '⒚',
        codepoint: 9370,
      },
      {
        name: 'NUMBER TWENTY FULL STOP',
        value: '⒛',
        codepoint: 9371,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER A',
        value: '⒜',
        codepoint: 9372,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER B',
        value: '⒝',
        codepoint: 9373,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER C',
        value: '⒞',
        codepoint: 9374,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER D',
        value: '⒟',
        codepoint: 9375,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER E',
        value: '⒠',
        codepoint: 9376,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER F',
        value: '⒡',
        codepoint: 9377,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER G',
        value: '⒢',
        codepoint: 9378,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER H',
        value: '⒣',
        codepoint: 9379,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER I',
        value: '⒤',
        codepoint: 9380,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER J',
        value: '⒥',
        codepoint: 9381,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER K',
        value: '⒦',
        codepoint: 9382,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER L',
        value: '⒧',
        codepoint: 9383,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER M',
        value: '⒨',
        codepoint: 9384,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER N',
        value: '⒩',
        codepoint: 9385,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER O',
        value: '⒪',
        codepoint: 9386,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER P',
        value: '⒫',
        codepoint: 9387,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER Q',
        value: '⒬',
        codepoint: 9388,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER R',
        value: '⒭',
        codepoint: 9389,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER S',
        value: '⒮',
        codepoint: 9390,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER T',
        value: '⒯',
        codepoint: 9391,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER U',
        value: '⒰',
        codepoint: 9392,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER V',
        value: '⒱',
        codepoint: 9393,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER W',
        value: '⒲',
        codepoint: 9394,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER X',
        value: '⒳',
        codepoint: 9395,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER Y',
        value: '⒴',
        codepoint: 9396,
      },
      {
        name: 'PARENTHESIZED LATIN SMALL LETTER Z',
        value: '⒵',
        codepoint: 9397,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER A',
        value: 'Ⓐ',
        codepoint: 9398,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER B',
        value: 'Ⓑ',
        codepoint: 9399,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER C',
        value: 'Ⓒ',
        codepoint: 9400,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER D',
        value: 'Ⓓ',
        codepoint: 9401,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER E',
        value: 'Ⓔ',
        codepoint: 9402,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER F',
        value: 'Ⓕ',
        codepoint: 9403,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER G',
        value: 'Ⓖ',
        codepoint: 9404,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER H',
        value: 'Ⓗ',
        codepoint: 9405,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER I',
        value: 'Ⓘ',
        codepoint: 9406,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER J',
        value: 'Ⓙ',
        codepoint: 9407,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER K',
        value: 'Ⓚ',
        codepoint: 9408,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER L',
        value: 'Ⓛ',
        codepoint: 9409,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER N',
        value: 'Ⓝ',
        codepoint: 9411,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER O',
        value: 'Ⓞ',
        codepoint: 9412,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER P',
        value: 'Ⓟ',
        codepoint: 9413,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER Q',
        value: 'Ⓠ',
        codepoint: 9414,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER R',
        value: 'Ⓡ',
        codepoint: 9415,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER S',
        value: 'Ⓢ',
        codepoint: 9416,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER T',
        value: 'Ⓣ',
        codepoint: 9417,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER U',
        value: 'Ⓤ',
        codepoint: 9418,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER V',
        value: 'Ⓥ',
        codepoint: 9419,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER W',
        value: 'Ⓦ',
        codepoint: 9420,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER X',
        value: 'Ⓧ',
        codepoint: 9421,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER Y',
        value: 'Ⓨ',
        codepoint: 9422,
      },
      {
        name: 'CIRCLED LATIN CAPITAL LETTER Z',
        value: 'Ⓩ',
        codepoint: 9423,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER A',
        value: 'ⓐ',
        codepoint: 9424,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER B',
        value: 'ⓑ',
        codepoint: 9425,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER C',
        value: 'ⓒ',
        codepoint: 9426,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER D',
        value: 'ⓓ',
        codepoint: 9427,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER E',
        value: 'ⓔ',
        codepoint: 9428,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER F',
        value: 'ⓕ',
        codepoint: 9429,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER G',
        value: 'ⓖ',
        codepoint: 9430,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER H',
        value: 'ⓗ',
        codepoint: 9431,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER I',
        value: 'ⓘ',
        codepoint: 9432,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER J',
        value: 'ⓙ',
        codepoint: 9433,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER K',
        value: 'ⓚ',
        codepoint: 9434,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER L',
        value: 'ⓛ',
        codepoint: 9435,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER M',
        value: 'ⓜ',
        codepoint: 9436,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER N',
        value: 'ⓝ',
        codepoint: 9437,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER O',
        value: 'ⓞ',
        codepoint: 9438,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER P',
        value: 'ⓟ',
        codepoint: 9439,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER Q',
        value: 'ⓠ',
        codepoint: 9440,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER R',
        value: 'ⓡ',
        codepoint: 9441,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER S',
        value: 'ⓢ',
        codepoint: 9442,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER T',
        value: 'ⓣ',
        codepoint: 9443,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER U',
        value: 'ⓤ',
        codepoint: 9444,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER V',
        value: 'ⓥ',
        codepoint: 9445,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER W',
        value: 'ⓦ',
        codepoint: 9446,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER X',
        value: 'ⓧ',
        codepoint: 9447,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER Y',
        value: 'ⓨ',
        codepoint: 9448,
      },
      {
        name: 'CIRCLED LATIN SMALL LETTER Z',
        value: 'ⓩ',
        codepoint: 9449,
      },
      {
        name: 'CIRCLED DIGIT ZERO',
        value: '⓪',
        codepoint: 9450,
      },
      {
        name: 'NEGATIVE CIRCLED NUMBER ELEVEN',
        value: '⓫',
        codepoint: 9451,
      },
      {
        name: 'NEGATIVE CIRCLED NUMBER TWELVE',
        value: '⓬',
        codepoint: 9452,
      },
      {
        name: 'NEGATIVE CIRCLED NUMBER THIRTEEN',
        value: '⓭',
        codepoint: 9453,
      },
      {
        name: 'NEGATIVE CIRCLED NUMBER FOURTEEN',
        value: '⓮',
        codepoint: 9454,
      },
      {
        name: 'NEGATIVE CIRCLED NUMBER FIFTEEN',
        value: '⓯',
        codepoint: 9455,
      },
      {
        name: 'NEGATIVE CIRCLED NUMBER SIXTEEN',
        value: '⓰',
        codepoint: 9456,
      },
      {
        name: 'NEGATIVE CIRCLED NUMBER SEVENTEEN',
        value: '⓱',
        codepoint: 9457,
      },
      {
        name: 'NEGATIVE CIRCLED NUMBER EIGHTEEN',
        value: '⓲',
        codepoint: 9458,
      },
      {
        name: 'NEGATIVE CIRCLED NUMBER NINETEEN',
        value: '⓳',
        codepoint: 9459,
      },
      {
        name: 'NEGATIVE CIRCLED NUMBER TWENTY',
        value: '⓴',
        codepoint: 9460,
      },
      {
        name: 'DOUBLE CIRCLED DIGIT ONE',
        value: '⓵',
        codepoint: 9461,
      },
      {
        name: 'DOUBLE CIRCLED DIGIT TWO',
        value: '⓶',
        codepoint: 9462,
      },
      {
        name: 'DOUBLE CIRCLED DIGIT THREE',
        value: '⓷',
        codepoint: 9463,
      },
      {
        name: 'DOUBLE CIRCLED DIGIT FOUR',
        value: '⓸',
        codepoint: 9464,
      },
      {
        name: 'DOUBLE CIRCLED DIGIT FIVE',
        value: '⓹',
        codepoint: 9465,
      },
      {
        name: 'DOUBLE CIRCLED DIGIT SIX',
        value: '⓺',
        codepoint: 9466,
      },
      {
        name: 'DOUBLE CIRCLED DIGIT SEVEN',
        value: '⓻',
        codepoint: 9467,
      },
      {
        name: 'DOUBLE CIRCLED DIGIT EIGHT',
        value: '⓼',
        codepoint: 9468,
      },
      {
        name: 'DOUBLE CIRCLED DIGIT NINE',
        value: '⓽',
        codepoint: 9469,
      },
      {
        name: 'DOUBLE CIRCLED NUMBER TEN',
        value: '⓾',
        codepoint: 9470,
      },
      {
        name: 'NEGATIVE CIRCLED DIGIT ZERO',
        value: '⓿',
        codepoint: 9471,
      },
      {
        name: 'BLACK STAR',
        value: '★',
        codepoint: 9733,
      },
      {
        name: 'WHITE STAR',
        value: '☆',
        codepoint: 9734,
      },
      {
        name: 'LIGHTNING',
        value: '☇',
        codepoint: 9735,
      },
      {
        name: 'THUNDERSTORM',
        value: '☈',
        codepoint: 9736,
      },
      {
        name: 'SUN',
        value: '☉',
        codepoint: 9737,
      },
      {
        name: 'ASCENDING NODE',
        value: '☊',
        codepoint: 9738,
      },
      {
        name: 'DESCENDING NODE',
        value: '☋',
        codepoint: 9739,
      },
      {
        name: 'CONJUNCTION',
        value: '☌',
        codepoint: 9740,
      },
      {
        name: 'OPPOSITION',
        value: '☍',
        codepoint: 9741,
      },
      {
        name: 'WHITE TELEPHONE',
        value: '☏',
        codepoint: 9743,
      },
      {
        name: 'BALLOT BOX',
        value: '☐',
        codepoint: 9744,
      },
      {
        name: 'BALLOT BOX WITH X',
        value: '☒',
        codepoint: 9746,
      },
      {
        name: 'SALTIRE',
        value: '☓',
        codepoint: 9747,
      },
      {
        name: 'WHITE SHOGI PIECE',
        value: '☖',
        codepoint: 9750,
      },
      {
        name: 'BLACK SHOGI PIECE',
        value: '☗',
        codepoint: 9751,
      },
      {
        name: 'REVERSED ROTATED FLORAL HEART BULLET',
        value: '☙',
        codepoint: 9753,
      },
      {
        name: 'BLACK LEFT POINTING INDEX',
        value: '☚',
        codepoint: 9754,
      },
      {
        name: 'BLACK RIGHT POINTING INDEX',
        value: '☛',
        codepoint: 9755,
      },
      {
        name: 'WHITE LEFT POINTING INDEX',
        value: '☜',
        codepoint: 9756,
      },
      {
        name: 'WHITE RIGHT POINTING INDEX',
        value: '☞',
        codepoint: 9758,
      },
      {
        name: 'WHITE DOWN POINTING INDEX',
        value: '☟',
        codepoint: 9759,
      },
      {
        name: 'CAUTION SIGN',
        value: '☡',
        codepoint: 9761,
      },
      {
        name: 'CADUCEUS',
        value: '☤',
        codepoint: 9764,
      },
      {
        name: 'ANKH',
        value: '☥',
        codepoint: 9765,
      },
      {
        name: 'CHI RHO',
        value: '☧',
        codepoint: 9767,
      },
      {
        name: 'CROSS OF LORRAINE',
        value: '☨',
        codepoint: 9768,
      },
      {
        name: 'CROSS OF JERUSALEM',
        value: '☩',
        codepoint: 9769,
      },
      {
        name: 'FARSI SYMBOL',
        value: '☫',
        codepoint: 9771,
      },
      {
        name: 'ADI SHAKTI',
        value: '☬',
        codepoint: 9772,
      },
      {
        name: 'HAMMER AND SICKLE',
        value: '☭',
        codepoint: 9773,
      },
      {
        name: 'TRIGRAM FOR HEAVEN',
        value: '☰',
        codepoint: 9776,
      },
      {
        name: 'TRIGRAM FOR LAKE',
        value: '☱',
        codepoint: 9777,
      },
      {
        name: 'TRIGRAM FOR FIRE',
        value: '☲',
        codepoint: 9778,
      },
      {
        name: 'TRIGRAM FOR THUNDER',
        value: '☳',
        codepoint: 9779,
      },
      {
        name: 'TRIGRAM FOR WIND',
        value: '☴',
        codepoint: 9780,
      },
      {
        name: 'TRIGRAM FOR WATER',
        value: '☵',
        codepoint: 9781,
      },
      {
        name: 'TRIGRAM FOR MOUNTAIN',
        value: '☶',
        codepoint: 9782,
      },
      {
        name: 'TRIGRAM FOR EARTH',
        value: '☷',
        codepoint: 9783,
      },
      {
        name: 'BLACK SMILING FACE',
        value: '☻',
        codepoint: 9787,
      },
      {
        name: 'WHITE SUN WITH RAYS',
        value: '☼',
        codepoint: 9788,
      },
      {
        name: 'FIRST QUARTER MOON',
        value: '☽',
        codepoint: 9789,
      },
      {
        name: 'LAST QUARTER MOON',
        value: '☾',
        codepoint: 9790,
      },
      {
        name: 'MERCURY',
        value: '☿',
        codepoint: 9791,
      },
      {
        name: 'EARTH',
        value: '♁',
        codepoint: 9793,
      },
      {
        name: 'JUPITER',
        value: '♃',
        codepoint: 9795,
      },
      {
        name: 'SATURN',
        value: '♄',
        codepoint: 9796,
      },
      {
        name: 'URANUS',
        value: '♅',
        codepoint: 9797,
      },
      {
        name: 'NEPTUNE',
        value: '♆',
        codepoint: 9798,
      },
      {
        name: 'PLUTO',
        value: '♇',
        codepoint: 9799,
      },
      {
        name: 'WHITE CHESS KING',
        value: '♔',
        codepoint: 9812,
      },
      {
        name: 'WHITE CHESS QUEEN',
        value: '♕',
        codepoint: 9813,
      },
      {
        name: 'WHITE CHESS ROOK',
        value: '♖',
        codepoint: 9814,
      },
      {
        name: 'WHITE CHESS BISHOP',
        value: '♗',
        codepoint: 9815,
      },
      {
        name: 'WHITE CHESS KNIGHT',
        value: '♘',
        codepoint: 9816,
      },
      {
        name: 'WHITE CHESS PAWN',
        value: '♙',
        codepoint: 9817,
      },
      {
        name: 'BLACK CHESS KING',
        value: '♚',
        codepoint: 9818,
      },
      {
        name: 'BLACK CHESS QUEEN',
        value: '♛',
        codepoint: 9819,
      },
      {
        name: 'BLACK CHESS ROOK',
        value: '♜',
        codepoint: 9820,
      },
      {
        name: 'BLACK CHESS BISHOP',
        value: '♝',
        codepoint: 9821,
      },
      {
        name: 'BLACK CHESS KNIGHT',
        value: '♞',
        codepoint: 9822,
      },
      {
        name: 'WHITE HEART SUIT',
        value: '♡',
        codepoint: 9825,
      },
      {
        name: 'WHITE DIAMOND SUIT',
        value: '♢',
        codepoint: 9826,
      },
      {
        name: 'WHITE SPADE SUIT',
        value: '♤',
        codepoint: 9828,
      },
      {
        name: 'WHITE CLUB SUIT',
        value: '♧',
        codepoint: 9831,
      },
      {
        name: 'QUARTER NOTE',
        value: '♩',
        codepoint: 9833,
      },
      {
        name: 'EIGHTH NOTE',
        value: '♪',
        codepoint: 9834,
      },
      {
        name: 'BEAMED EIGHTH NOTES',
        value: '♫',
        codepoint: 9835,
      },
      {
        name: 'BEAMED SIXTEENTH NOTES',
        value: '♬',
        codepoint: 9836,
      },
      {
        name: 'MUSIC FLAT SIGN',
        value: '♭',
        codepoint: 9837,
      },
      {
        name: 'MUSIC NATURAL SIGN',
        value: '♮',
        codepoint: 9838,
      },
      {
        name: 'MUSIC SHARP SIGN',
        value: '♯',
        codepoint: 9839,
      },
      {
        name: 'WEST SYRIAC CROSS',
        value: '♰',
        codepoint: 9840,
      },
      {
        name: 'EAST SYRIAC CROSS',
        value: '♱',
        codepoint: 9841,
      },
      {
        name: 'UNIVERSAL RECYCLING SYMBOL',
        value: '♲',
        codepoint: 9842,
      },
      {
        name: 'RECYCLING SYMBOL FOR TYPE-1 PLASTICS',
        value: '♳',
        codepoint: 9843,
      },
      {
        name: 'RECYCLING SYMBOL FOR TYPE-2 PLASTICS',
        value: '♴',
        codepoint: 9844,
      },
      {
        name: 'RECYCLING SYMBOL FOR TYPE-3 PLASTICS',
        value: '♵',
        codepoint: 9845,
      },
      {
        name: 'RECYCLING SYMBOL FOR TYPE-4 PLASTICS',
        value: '♶',
        codepoint: 9846,
      },
      {
        name: 'RECYCLING SYMBOL FOR TYPE-5 PLASTICS',
        value: '♷',
        codepoint: 9847,
      },
      {
        name: 'RECYCLING SYMBOL FOR TYPE-6 PLASTICS',
        value: '♸',
        codepoint: 9848,
      },
      {
        name: 'RECYCLING SYMBOL FOR TYPE-7 PLASTICS',
        value: '♹',
        codepoint: 9849,
      },
      {
        name: 'RECYCLING SYMBOL FOR GENERIC MATERIALS',
        value: '♺',
        codepoint: 9850,
      },
      {
        name: 'RECYCLED PAPER SYMBOL',
        value: '♼',
        codepoint: 9852,
      },
      {
        name: 'PARTIALLY-RECYCLED PAPER SYMBOL',
        value: '♽',
        codepoint: 9853,
      },
      {
        name: 'DIE FACE-1',
        value: '⚀',
        codepoint: 9856,
      },
      {
        name: 'DIE FACE-2',
        value: '⚁',
        codepoint: 9857,
      },
      {
        name: 'DIE FACE-3',
        value: '⚂',
        codepoint: 9858,
      },
      {
        name: 'DIE FACE-4',
        value: '⚃',
        codepoint: 9859,
      },
      {
        name: 'DIE FACE-5',
        value: '⚄',
        codepoint: 9860,
      },
      {
        name: 'DIE FACE-6',
        value: '⚅',
        codepoint: 9861,
      },
      {
        name: 'WHITE CIRCLE WITH DOT RIGHT',
        value: '⚆',
        codepoint: 9862,
      },
      {
        name: 'WHITE CIRCLE WITH TWO DOTS',
        value: '⚇',
        codepoint: 9863,
      },
      {
        name: 'BLACK CIRCLE WITH WHITE DOT RIGHT',
        value: '⚈',
        codepoint: 9864,
      },
      {
        name: 'BLACK CIRCLE WITH TWO WHITE DOTS',
        value: '⚉',
        codepoint: 9865,
      },
      {
        name: 'MONOGRAM FOR YANG',
        value: '⚊',
        codepoint: 9866,
      },
      {
        name: 'MONOGRAM FOR YIN',
        value: '⚋',
        codepoint: 9867,
      },
      {
        name: 'DIGRAM FOR GREATER YANG',
        value: '⚌',
        codepoint: 9868,
      },
      {
        name: 'DIGRAM FOR LESSER YIN',
        value: '⚍',
        codepoint: 9869,
      },
      {
        name: 'DIGRAM FOR LESSER YANG',
        value: '⚎',
        codepoint: 9870,
      },
      {
        name: 'DIGRAM FOR GREATER YIN',
        value: '⚏',
        codepoint: 9871,
      },
      {
        name: 'WHITE FLAG',
        value: '⚐',
        codepoint: 9872,
      },
      {
        name: 'BLACK FLAG',
        value: '⚑',
        codepoint: 9873,
      },
      {
        name: 'FLOWER',
        value: '⚘',
        codepoint: 9880,
      },
      {
        name: 'STAFF OF HERMES',
        value: '⚚',
        codepoint: 9882,
      },
      {
        name: 'DOUBLED FEMALE SIGN',
        value: '⚢',
        codepoint: 9890,
      },
      {
        name: 'DOUBLED MALE SIGN',
        value: '⚣',
        codepoint: 9891,
      },
      {
        name: 'INTERLOCKED FEMALE AND MALE SIGN',
        value: '⚤',
        codepoint: 9892,
      },
      {
        name: 'MALE AND FEMALE SIGN',
        value: '⚥',
        codepoint: 9893,
      },
      {
        name: 'MALE WITH STROKE SIGN',
        value: '⚦',
        codepoint: 9894,
      },
      {
        name: 'VERTICAL MALE WITH STROKE SIGN',
        value: '⚨',
        codepoint: 9896,
      },
      {
        name: 'HORIZONTAL MALE WITH STROKE SIGN',
        value: '⚩',
        codepoint: 9897,
      },
      {
        name: 'MEDIUM SMALL WHITE CIRCLE',
        value: '⚬',
        codepoint: 9900,
      },
      {
        name: 'MARRIAGE SYMBOL',
        value: '⚭',
        codepoint: 9901,
      },
      {
        name: 'DIVORCE SYMBOL',
        value: '⚮',
        codepoint: 9902,
      },
      {
        name: 'UNMARRIED PARTNERSHIP SYMBOL',
        value: '⚯',
        codepoint: 9903,
      },
      {
        name: 'NEUTER',
        value: '⚲',
        codepoint: 9906,
      },
      {
        name: 'WHITE DIAMOND IN SQUARE',
        value: '⛋',
        codepoint: 9931,
      },
      {
        name: 'ASTRONOMICAL SYMBOL FOR URANUS',
        value: '⛢',
        codepoint: 9954,
      },
      {
        name: 'UPPER BLADE SCISSORS',
        value: '✁',
        codepoint: 9985,
      },
      {
        name: 'LOWER BLADE SCISSORS',
        value: '✃',
        codepoint: 9987,
      },
      {
        name: 'WHITE SCISSORS',
        value: '✄',
        codepoint: 9988,
      },
      {
        name: 'TELEPHONE LOCATION SIGN',
        value: '✆',
        codepoint: 9990,
      },
      {
        name: 'TAPE DRIVE',
        value: '✇',
        codepoint: 9991,
      },
      {
        name: 'LOWER RIGHT PENCIL',
        value: '✎',
        codepoint: 9998,
      },
      {
        name: 'UPPER RIGHT PENCIL',
        value: '✐',
        codepoint: 10000,
      },
      {
        name: 'WHITE NIB',
        value: '✑',
        codepoint: 10001,
      },
      {
        name: 'CHECK MARK',
        value: '✓',
        codepoint: 10003,
      },
      {
        name: 'MULTIPLICATION X',
        value: '✕',
        codepoint: 10005,
      },
      {
        name: 'BALLOT X',
        value: '✗',
        codepoint: 10007,
      },
      {
        name: 'HEAVY BALLOT X',
        value: '✘',
        codepoint: 10008,
      },
      {
        name: 'OUTLINED GREEK CROSS',
        value: '✙',
        codepoint: 10009,
      },
      {
        name: 'HEAVY GREEK CROSS',
        value: '✚',
        codepoint: 10010,
      },
      {
        name: 'OPEN CENTRE CROSS',
        value: '✛',
        codepoint: 10011,
      },
      {
        name: 'HEAVY OPEN CENTRE CROSS',
        value: '✜',
        codepoint: 10012,
      },
      {
        name: 'SHADOWED WHITE LATIN CROSS',
        value: '✞',
        codepoint: 10014,
      },
      {
        name: 'OUTLINED LATIN CROSS',
        value: '✟',
        codepoint: 10015,
      },
      {
        name: 'MALTESE CROSS',
        value: '✠',
        codepoint: 10016,
      },
      {
        name: 'FOUR TEARDROP-SPOKED ASTERISK',
        value: '✢',
        codepoint: 10018,
      },
      {
        name: 'FOUR BALLOON-SPOKED ASTERISK',
        value: '✣',
        codepoint: 10019,
      },
      {
        name: 'HEAVY FOUR BALLOON-SPOKED ASTERISK',
        value: '✤',
        codepoint: 10020,
      },
      {
        name: 'FOUR CLUB-SPOKED ASTERISK',
        value: '✥',
        codepoint: 10021,
      },
      {
        name: 'BLACK FOUR POINTED STAR',
        value: '✦',
        codepoint: 10022,
      },
      {
        name: 'WHITE FOUR POINTED STAR',
        value: '✧',
        codepoint: 10023,
      },
      {
        name: 'STRESS OUTLINED WHITE STAR',
        value: '✩',
        codepoint: 10025,
      },
      {
        name: 'CIRCLED WHITE STAR',
        value: '✪',
        codepoint: 10026,
      },
      {
        name: 'OPEN CENTRE BLACK STAR',
        value: '✫',
        codepoint: 10027,
      },
      {
        name: 'BLACK CENTRE WHITE STAR',
        value: '✬',
        codepoint: 10028,
      },
      {
        name: 'OUTLINED BLACK STAR',
        value: '✭',
        codepoint: 10029,
      },
      {
        name: 'HEAVY OUTLINED BLACK STAR',
        value: '✮',
        codepoint: 10030,
      },
      {
        name: 'PINWHEEL STAR',
        value: '✯',
        codepoint: 10031,
      },
      {
        name: 'SHADOWED WHITE STAR',
        value: '✰',
        codepoint: 10032,
      },
      {
        name: 'HEAVY ASTERISK',
        value: '✱',
        codepoint: 10033,
      },
      {
        name: 'OPEN CENTRE ASTERISK',
        value: '✲',
        codepoint: 10034,
      },
      {
        name: 'EIGHT POINTED PINWHEEL STAR',
        value: '✵',
        codepoint: 10037,
      },
      {
        name: 'SIX POINTED BLACK STAR',
        value: '✶',
        codepoint: 10038,
      },
      {
        name: 'EIGHT POINTED RECTILINEAR BLACK STAR',
        value: '✷',
        codepoint: 10039,
      },
      {
        name: 'HEAVY EIGHT POINTED RECTILINEAR BLACK STAR',
        value: '✸',
        codepoint: 10040,
      },
      {
        name: 'TWELVE POINTED BLACK STAR',
        value: '✹',
        codepoint: 10041,
      },
      {
        name: 'SIXTEEN POINTED ASTERISK',
        value: '✺',
        codepoint: 10042,
      },
      {
        name: 'TEARDROP-SPOKED ASTERISK',
        value: '✻',
        codepoint: 10043,
      },
      {
        name: 'OPEN CENTRE TEARDROP-SPOKED ASTERISK',
        value: '✼',
        codepoint: 10044,
      },
      {
        name: 'HEAVY TEARDROP-SPOKED ASTERISK',
        value: '✽',
        codepoint: 10045,
      },
      {
        name: 'SIX PETALLED BLACK AND WHITE FLORETTE',
        value: '✾',
        codepoint: 10046,
      },
      {
        name: 'BLACK FLORETTE',
        value: '✿',
        codepoint: 10047,
      },
      {
        name: 'WHITE FLORETTE',
        value: '❀',
        codepoint: 10048,
      },
      {
        name: 'EIGHT PETALLED OUTLINED BLACK FLORETTE',
        value: '❁',
        codepoint: 10049,
      },
      {
        name: 'CIRCLED OPEN CENTRE EIGHT POINTED STAR',
        value: '❂',
        codepoint: 10050,
      },
      {
        name: 'HEAVY TEARDROP-SPOKED PINWHEEL ASTERISK',
        value: '❃',
        codepoint: 10051,
      },
      {
        name: 'TIGHT TRIFOLIATE SNOWFLAKE',
        value: '❅',
        codepoint: 10053,
      },
      {
        name: 'HEAVY CHEVRON SNOWFLAKE',
        value: '❆',
        codepoint: 10054,
      },
      {
        name: 'HEAVY SPARKLE',
        value: '❈',
        codepoint: 10056,
      },
      {
        name: 'BALLOON-SPOKED ASTERISK',
        value: '❉',
        codepoint: 10057,
      },
      {
        name: 'EIGHT TEARDROP-SPOKED PROPELLER ASTERISK',
        value: '❊',
        codepoint: 10058,
      },
      {
        name: 'HEAVY EIGHT TEARDROP-SPOKED PROPELLER ASTERISK',
        value: '❋',
        codepoint: 10059,
      },
      {
        name: 'SHADOWED WHITE CIRCLE',
        value: '❍',
        codepoint: 10061,
      },
      {
        name: 'LOWER RIGHT DROP-SHADOWED WHITE SQUARE',
        value: '❏',
        codepoint: 10063,
      },
      {
        name: 'UPPER RIGHT DROP-SHADOWED WHITE SQUARE',
        value: '❐',
        codepoint: 10064,
      },
      {
        name: 'LOWER RIGHT SHADOWED WHITE SQUARE',
        value: '❑',
        codepoint: 10065,
      },
      {
        name: 'UPPER RIGHT SHADOWED WHITE SQUARE',
        value: '❒',
        codepoint: 10066,
      },
      {
        name: 'BLACK DIAMOND MINUS WHITE X',
        value: '❖',
        codepoint: 10070,
      },
      {
        name: 'LIGHT VERTICAL BAR',
        value: '❘',
        codepoint: 10072,
      },
      {
        name: 'MEDIUM VERTICAL BAR',
        value: '❙',
        codepoint: 10073,
      },
      {
        name: 'HEAVY VERTICAL BAR',
        value: '❚',
        codepoint: 10074,
      },
      {
        name: 'HEAVY SINGLE TURNED COMMA QUOTATION MARK ORNAMENT',
        value: '❛',
        codepoint: 10075,
      },
      {
        name: 'HEAVY SINGLE COMMA QUOTATION MARK ORNAMENT',
        value: '❜',
        codepoint: 10076,
      },
      {
        name: 'HEAVY DOUBLE TURNED COMMA QUOTATION MARK ORNAMENT',
        value: '❝',
        codepoint: 10077,
      },
      {
        name: 'HEAVY DOUBLE COMMA QUOTATION MARK ORNAMENT',
        value: '❞',
        codepoint: 10078,
      },
      {
        name: 'CURVED STEM PARAGRAPH SIGN ORNAMENT',
        value: '❡',
        codepoint: 10081,
      },
      {
        name: 'HEAVY EXCLAMATION MARK ORNAMENT',
        value: '❢',
        codepoint: 10082,
      },
      {
        name: 'ROTATED HEAVY BLACK HEART BULLET',
        value: '❥',
        codepoint: 10085,
      },
      {
        name: 'FLORAL HEART',
        value: '❦',
        codepoint: 10086,
      },
      {
        name: 'ROTATED FLORAL HEART BULLET',
        value: '❧',
        codepoint: 10087,
      },
      {
        name: 'MEDIUM LEFT PARENTHESIS ORNAMENT',
        value: '❨',
        codepoint: 10088,
      },
      {
        name: 'MEDIUM RIGHT PARENTHESIS ORNAMENT',
        value: '❩',
        codepoint: 10089,
      },
      {
        name: 'MEDIUM FLATTENED LEFT PARENTHESIS ORNAMENT',
        value: '❪',
        codepoint: 10090,
      },
      {
        name: 'MEDIUM FLATTENED RIGHT PARENTHESIS ORNAMENT',
        value: '❫',
        codepoint: 10091,
      },
      {
        name: 'MEDIUM LEFT-POINTING ANGLE BRACKET ORNAMENT',
        value: '❬',
        codepoint: 10092,
      },
      {
        name: 'MEDIUM RIGHT-POINTING ANGLE BRACKET ORNAMENT',
        value: '❭',
        codepoint: 10093,
      },
      {
        name: 'HEAVY LEFT-POINTING ANGLE QUOTATION MARK ORNAMENT',
        value: '❮',
        codepoint: 10094,
      },
      {
        name: 'HEAVY RIGHT-POINTING ANGLE QUOTATION MARK ORNAMENT',
        value: '❯',
        codepoint: 10095,
      },
      {
        name: 'HEAVY LEFT-POINTING ANGLE BRACKET ORNAMENT',
        value: '❰',
        codepoint: 10096,
      },
      {
        name: 'HEAVY RIGHT-POINTING ANGLE BRACKET ORNAMENT',
        value: '❱',
        codepoint: 10097,
      },
      {
        name: 'LIGHT LEFT TORTOISE SHELL BRACKET ORNAMENT',
        value: '❲',
        codepoint: 10098,
      },
      {
        name: 'LIGHT RIGHT TORTOISE SHELL BRACKET ORNAMENT',
        value: '❳',
        codepoint: 10099,
      },
      {
        name: 'MEDIUM LEFT CURLY BRACKET ORNAMENT',
        value: '❴',
        codepoint: 10100,
      },
      {
        name: 'MEDIUM RIGHT CURLY BRACKET ORNAMENT',
        value: '❵',
        codepoint: 10101,
      },
      {
        name: 'DINGBAT NEGATIVE CIRCLED DIGIT ONE',
        value: '❶',
        codepoint: 10102,
      },
      {
        name: 'DINGBAT NEGATIVE CIRCLED DIGIT TWO',
        value: '❷',
        codepoint: 10103,
      },
      {
        name: 'DINGBAT NEGATIVE CIRCLED DIGIT THREE',
        value: '❸',
        codepoint: 10104,
      },
      {
        name: 'DINGBAT NEGATIVE CIRCLED DIGIT FOUR',
        value: '❹',
        codepoint: 10105,
      },
      {
        name: 'DINGBAT NEGATIVE CIRCLED DIGIT FIVE',
        value: '❺',
        codepoint: 10106,
      },
      {
        name: 'DINGBAT NEGATIVE CIRCLED DIGIT SIX',
        value: '❻',
        codepoint: 10107,
      },
      {
        name: 'DINGBAT NEGATIVE CIRCLED DIGIT SEVEN',
        value: '❼',
        codepoint: 10108,
      },
      {
        name: 'DINGBAT NEGATIVE CIRCLED DIGIT EIGHT',
        value: '❽',
        codepoint: 10109,
      },
      {
        name: 'DINGBAT NEGATIVE CIRCLED DIGIT NINE',
        value: '❾',
        codepoint: 10110,
      },
      {
        name: 'DINGBAT NEGATIVE CIRCLED NUMBER TEN',
        value: '❿',
        codepoint: 10111,
      },
      {
        name: 'DINGBAT CIRCLED SANS-SERIF DIGIT ONE',
        value: '➀',
        codepoint: 10112,
      },
      {
        name: 'DINGBAT CIRCLED SANS-SERIF DIGIT TWO',
        value: '➁',
        codepoint: 10113,
      },
      {
        name: 'DINGBAT CIRCLED SANS-SERIF DIGIT THREE',
        value: '➂',
        codepoint: 10114,
      },
      {
        name: 'DINGBAT CIRCLED SANS-SERIF DIGIT FOUR',
        value: '➃',
        codepoint: 10115,
      },
      {
        name: 'DINGBAT CIRCLED SANS-SERIF DIGIT FIVE',
        value: '➄',
        codepoint: 10116,
      },
      {
        name: 'DINGBAT CIRCLED SANS-SERIF DIGIT SIX',
        value: '➅',
        codepoint: 10117,
      },
      {
        name: 'DINGBAT CIRCLED SANS-SERIF DIGIT SEVEN',
        value: '➆',
        codepoint: 10118,
      },
      {
        name: 'DINGBAT CIRCLED SANS-SERIF DIGIT EIGHT',
        value: '➇',
        codepoint: 10119,
      },
      {
        name: 'DINGBAT CIRCLED SANS-SERIF DIGIT NINE',
        value: '➈',
        codepoint: 10120,
      },
      {
        name: 'DINGBAT CIRCLED SANS-SERIF NUMBER TEN',
        value: '➉',
        codepoint: 10121,
      },
      {
        name: 'DINGBAT NEGATIVE CIRCLED SANS-SERIF DIGIT ONE',
        value: '➊',
        codepoint: 10122,
      },
      {
        name: 'DINGBAT NEGATIVE CIRCLED SANS-SERIF DIGIT TWO',
        value: '➋',
        codepoint: 10123,
      },
      {
        name: 'DINGBAT NEGATIVE CIRCLED SANS-SERIF DIGIT THREE',
        value: '➌',
        codepoint: 10124,
      },
      {
        name: 'DINGBAT NEGATIVE CIRCLED SANS-SERIF DIGIT FOUR',
        value: '➍',
        codepoint: 10125,
      },
      {
        name: 'DINGBAT NEGATIVE CIRCLED SANS-SERIF DIGIT FIVE',
        value: '➎',
        codepoint: 10126,
      },
      {
        name: 'DINGBAT NEGATIVE CIRCLED SANS-SERIF DIGIT SIX',
        value: '➏',
        codepoint: 10127,
      },
      {
        name: 'DINGBAT NEGATIVE CIRCLED SANS-SERIF DIGIT SEVEN',
        value: '➐',
        codepoint: 10128,
      },
      {
        name: 'DINGBAT NEGATIVE CIRCLED SANS-SERIF DIGIT EIGHT',
        value: '➑',
        codepoint: 10129,
      },
      {
        name: 'DINGBAT NEGATIVE CIRCLED SANS-SERIF DIGIT NINE',
        value: '➒',
        codepoint: 10130,
      },
      {
        name: 'DINGBAT NEGATIVE CIRCLED SANS-SERIF NUMBER TEN',
        value: '➓',
        codepoint: 10131,
      },
      {
        name: 'HEAVY WIDE-HEADED RIGHTWARDS ARROW',
        value: '➔',
        codepoint: 10132,
      },
      {
        name: 'HEAVY SOUTH EAST ARROW',
        value: '➘',
        codepoint: 10136,
      },
      {
        name: 'HEAVY RIGHTWARDS ARROW',
        value: '➙',
        codepoint: 10137,
      },
      {
        name: 'HEAVY NORTH EAST ARROW',
        value: '➚',
        codepoint: 10138,
      },
      {
        name: 'DRAFTING POINT RIGHTWARDS ARROW',
        value: '➛',
        codepoint: 10139,
      },
      {
        name: 'HEAVY ROUND-TIPPED RIGHTWARDS ARROW',
        value: '➜',
        codepoint: 10140,
      },
      {
        name: 'TRIANGLE-HEADED RIGHTWARDS ARROW',
        value: '➝',
        codepoint: 10141,
      },
      {
        name: 'HEAVY TRIANGLE-HEADED RIGHTWARDS ARROW',
        value: '➞',
        codepoint: 10142,
      },
      {
        name: 'DASHED TRIANGLE-HEADED RIGHTWARDS ARROW',
        value: '➟',
        codepoint: 10143,
      },
      {
        name: 'HEAVY DASHED TRIANGLE-HEADED RIGHTWARDS ARROW',
        value: '➠',
        codepoint: 10144,
      },
      {
        name: 'THREE-D TOP-LIGHTED RIGHTWARDS ARROWHEAD',
        value: '➢',
        codepoint: 10146,
      },
      {
        name: 'THREE-D BOTTOM-LIGHTED RIGHTWARDS ARROWHEAD',
        value: '➣',
        codepoint: 10147,
      },
      {
        name: 'BLACK RIGHTWARDS ARROWHEAD',
        value: '➤',
        codepoint: 10148,
      },
      {
        name: 'HEAVY BLACK CURVED DOWNWARDS AND RIGHTWARDS ARROW',
        value: '➥',
        codepoint: 10149,
      },
      {
        name: 'HEAVY BLACK CURVED UPWARDS AND RIGHTWARDS ARROW',
        value: '➦',
        codepoint: 10150,
      },
      {
        name: 'SQUAT BLACK RIGHTWARDS ARROW',
        value: '➧',
        codepoint: 10151,
      },
      {
        name: 'HEAVY CONCAVE-POINTED BLACK RIGHTWARDS ARROW',
        value: '➨',
        codepoint: 10152,
      },
      {
        name: 'RIGHT-SHADED WHITE RIGHTWARDS ARROW',
        value: '➩',
        codepoint: 10153,
      },
      {
        name: 'LEFT-SHADED WHITE RIGHTWARDS ARROW',
        value: '➪',
        codepoint: 10154,
      },
      {
        name: 'BACK-TILTED SHADOWED WHITE RIGHTWARDS ARROW',
        value: '➫',
        codepoint: 10155,
      },
      {
        name: 'FRONT-TILTED SHADOWED WHITE RIGHTWARDS ARROW',
        value: '➬',
        codepoint: 10156,
      },
      {
        name: 'HEAVY LOWER RIGHT-SHADOWED WHITE RIGHTWARDS ARROW',
        value: '➭',
        codepoint: 10157,
      },
      {
        name: 'HEAVY UPPER RIGHT-SHADOWED WHITE RIGHTWARDS ARROW',
        value: '➮',
        codepoint: 10158,
      },
      {
        name: 'NOTCHED LOWER RIGHT-SHADOWED WHITE RIGHTWARDS ARROW',
        value: '➯',
        codepoint: 10159,
      },
      {
        name: 'NOTCHED UPPER RIGHT-SHADOWED WHITE RIGHTWARDS ARROW',
        value: '➱',
        codepoint: 10161,
      },
      {
        name: 'CIRCLED HEAVY WHITE RIGHTWARDS ARROW',
        value: '➲',
        codepoint: 10162,
      },
      {
        name: 'WHITE-FEATHERED RIGHTWARDS ARROW',
        value: '➳',
        codepoint: 10163,
      },
      {
        name: 'BLACK-FEATHERED SOUTH EAST ARROW',
        value: '➴',
        codepoint: 10164,
      },
      {
        name: 'BLACK-FEATHERED RIGHTWARDS ARROW',
        value: '➵',
        codepoint: 10165,
      },
      {
        name: 'BLACK-FEATHERED NORTH EAST ARROW',
        value: '➶',
        codepoint: 10166,
      },
      {
        name: 'HEAVY BLACK-FEATHERED SOUTH EAST ARROW',
        value: '➷',
        codepoint: 10167,
      },
      {
        name: 'HEAVY BLACK-FEATHERED RIGHTWARDS ARROW',
        value: '➸',
        codepoint: 10168,
      },
      {
        name: 'HEAVY BLACK-FEATHERED NORTH EAST ARROW',
        value: '➹',
        codepoint: 10169,
      },
      {
        name: 'TEARDROP-BARBED RIGHTWARDS ARROW',
        value: '➺',
        codepoint: 10170,
      },
      {
        name: 'HEAVY TEARDROP-SHANKED RIGHTWARDS ARROW',
        value: '➻',
        codepoint: 10171,
      },
      {
        name: 'WEDGE-TAILED RIGHTWARDS ARROW',
        value: '➼',
        codepoint: 10172,
      },
      {
        name: 'HEAVY WEDGE-TAILED RIGHTWARDS ARROW',
        value: '➽',
        codepoint: 10173,
      },
      {
        name: 'OPEN-OUTLINED RIGHTWARDS ARROW',
        value: '➾',
        codepoint: 10174,
      },
    ],
  },
  {
    name: 'Mathematical',
    symbols: [
      {
        name: 'FOR ALL',
        value: '∀',
        codepoint: 8704,
      },
      {
        name: 'COMPLEMENT',
        value: '∁',
        codepoint: 8705,
      },
      {
        name: 'PARTIAL DIFFERENTIAL',
        value: '∂',
        codepoint: 8706,
      },
      {
        name: 'THERE EXISTS',
        value: '∃',
        codepoint: 8707,
      },
      {
        name: 'THERE DOES NOT EXIST',
        value: '∄',
        codepoint: 8708,
      },
      {
        name: 'EMPTY SET',
        value: '∅',
        codepoint: 8709,
      },
      {
        name: 'INCREMENT',
        value: '∆',
        codepoint: 8710,
      },
      {
        name: 'NABLA',
        value: '∇',
        codepoint: 8711,
      },
      {
        name: 'ELEMENT OF',
        value: '∈',
        codepoint: 8712,
      },
      {
        name: 'NOT AN ELEMENT OF',
        value: '∉',
        codepoint: 8713,
      },
      {
        name: 'SMALL ELEMENT OF',
        value: '∊',
        codepoint: 8714,
      },
      {
        name: 'CONTAINS AS MEMBER',
        value: '∋',
        codepoint: 8715,
      },
      {
        name: 'DOES NOT CONTAIN AS MEMBER',
        value: '∌',
        codepoint: 8716,
      },
      {
        name: 'SMALL CONTAINS AS MEMBER',
        value: '∍',
        codepoint: 8717,
      },
      {
        name: 'END OF PROOF',
        value: '∎',
        codepoint: 8718,
      },
      {
        name: 'N-ARY PRODUCT',
        value: '∏',
        codepoint: 8719,
      },
      {
        name: 'N-ARY COPRODUCT',
        value: '∐',
        codepoint: 8720,
      },
      {
        name: 'N-ARY SUMMATION',
        value: '∑',
        codepoint: 8721,
      },
      {
        name: 'MINUS SIGN',
        value: '−',
        codepoint: 8722,
      },
      {
        name: 'MINUS-OR-PLUS SIGN',
        value: '∓',
        codepoint: 8723,
      },
      {
        name: 'DOT PLUS',
        value: '∔',
        codepoint: 8724,
      },
      {
        name: 'DIVISION SLASH',
        value: '∕',
        codepoint: 8725,
      },
      {
        name: 'SET MINUS',
        value: '∖',
        codepoint: 8726,
      },
      {
        name: 'ASTERISK OPERATOR',
        value: '∗',
        codepoint: 8727,
      },
      {
        name: 'RING OPERATOR',
        value: '∘',
        codepoint: 8728,
      },
      {
        name: 'BULLET OPERATOR',
        value: '∙',
        codepoint: 8729,
      },
      {
        name: 'SQUARE ROOT',
        value: '√',
        codepoint: 8730,
      },
      {
        name: 'CUBE ROOT',
        value: '∛',
        codepoint: 8731,
      },
      {
        name: 'FOURTH ROOT',
        value: '∜',
        codepoint: 8732,
      },
      {
        name: 'PROPORTIONAL TO',
        value: '∝',
        codepoint: 8733,
      },
      {
        name: 'INFINITY',
        value: '∞',
        codepoint: 8734,
      },
      {
        name: 'RIGHT ANGLE',
        value: '∟',
        codepoint: 8735,
      },
      {
        name: 'ANGLE',
        value: '∠',
        codepoint: 8736,
      },
      {
        name: 'MEASURED ANGLE',
        value: '∡',
        codepoint: 8737,
      },
      {
        name: 'SPHERICAL ANGLE',
        value: '∢',
        codepoint: 8738,
      },
      {
        name: 'DIVIDES',
        value: '∣',
        codepoint: 8739,
      },
      {
        name: 'DOES NOT DIVIDE',
        value: '∤',
        codepoint: 8740,
      },
      {
        name: 'PARALLEL TO',
        value: '∥',
        codepoint: 8741,
      },
      {
        name: 'NOT PARALLEL TO',
        value: '∦',
        codepoint: 8742,
      },
      {
        name: 'LOGICAL AND',
        value: '∧',
        codepoint: 8743,
      },
      {
        name: 'LOGICAL OR',
        value: '∨',
        codepoint: 8744,
      },
      {
        name: 'INTERSECTION',
        value: '∩',
        codepoint: 8745,
      },
      {
        name: 'UNION',
        value: '∪',
        codepoint: 8746,
      },
      {
        name: 'INTEGRAL',
        value: '∫',
        codepoint: 8747,
      },
      {
        name: 'DOUBLE INTEGRAL',
        value: '∬',
        codepoint: 8748,
      },
      {
        name: 'TRIPLE INTEGRAL',
        value: '∭',
        codepoint: 8749,
      },
      {
        name: 'CONTOUR INTEGRAL',
        value: '∮',
        codepoint: 8750,
      },
      {
        name: 'SURFACE INTEGRAL',
        value: '∯',
        codepoint: 8751,
      },
      {
        name: 'VOLUME INTEGRAL',
        value: '∰',
        codepoint: 8752,
      },
      {
        name: 'CLOCKWISE INTEGRAL',
        value: '∱',
        codepoint: 8753,
      },
      {
        name: 'CLOCKWISE CONTOUR INTEGRAL',
        value: '∲',
        codepoint: 8754,
      },
      {
        name: 'ANTICLOCKWISE CONTOUR INTEGRAL',
        value: '∳',
        codepoint: 8755,
      },
      {
        name: 'THEREFORE',
        value: '∴',
        codepoint: 8756,
      },
      {
        name: 'BECAUSE',
        value: '∵',
        codepoint: 8757,
      },
      {
        name: 'RATIO',
        value: '∶',
        codepoint: 8758,
      },
      {
        name: 'PROPORTION',
        value: '∷',
        codepoint: 8759,
      },
      {
        name: 'DOT MINUS',
        value: '∸',
        codepoint: 8760,
      },
      {
        name: 'EXCESS',
        value: '∹',
        codepoint: 8761,
      },
      {
        name: 'GEOMETRIC PROPORTION',
        value: '∺',
        codepoint: 8762,
      },
      {
        name: 'HOMOTHETIC',
        value: '∻',
        codepoint: 8763,
      },
      {
        name: 'TILDE OPERATOR',
        value: '∼',
        codepoint: 8764,
      },
      {
        name: 'REVERSED TILDE',
        value: '∽',
        codepoint: 8765,
      },
      {
        name: 'INVERTED LAZY S',
        value: '∾',
        codepoint: 8766,
      },
      {
        name: 'SINE WAVE',
        value: '∿',
        codepoint: 8767,
      },
      {
        name: 'WREATH PRODUCT',
        value: '≀',
        codepoint: 8768,
      },
      {
        name: 'NOT TILDE',
        value: '≁',
        codepoint: 8769,
      },
      {
        name: 'MINUS TILDE',
        value: '≂',
        codepoint: 8770,
      },
      {
        name: 'ASYMPTOTICALLY EQUAL TO',
        value: '≃',
        codepoint: 8771,
      },
      {
        name: 'NOT ASYMPTOTICALLY EQUAL TO',
        value: '≄',
        codepoint: 8772,
      },
      {
        name: 'APPROXIMATELY EQUAL TO',
        value: '≅',
        codepoint: 8773,
      },
      {
        name: 'APPROXIMATELY BUT NOT ACTUALLY EQUAL TO',
        value: '≆',
        codepoint: 8774,
      },
      {
        name: 'NEITHER APPROXIMATELY NOR ACTUALLY EQUAL TO',
        value: '≇',
        codepoint: 8775,
      },
      {
        name: 'ALMOST EQUAL TO',
        value: '≈',
        codepoint: 8776,
      },
      {
        name: 'NOT ALMOST EQUAL TO',
        value: '≉',
        codepoint: 8777,
      },
      {
        name: 'ALMOST EQUAL OR EQUAL TO',
        value: '≊',
        codepoint: 8778,
      },
      {
        name: 'TRIPLE TILDE',
        value: '≋',
        codepoint: 8779,
      },
      {
        name: 'ALL EQUAL TO',
        value: '≌',
        codepoint: 8780,
      },
      {
        name: 'EQUIVALENT TO',
        value: '≍',
        codepoint: 8781,
      },
      {
        name: 'GEOMETRICALLY EQUIVALENT TO',
        value: '≎',
        codepoint: 8782,
      },
      {
        name: 'DIFFERENCE BETWEEN',
        value: '≏',
        codepoint: 8783,
      },
      {
        name: 'APPROACHES THE LIMIT',
        value: '≐',
        codepoint: 8784,
      },
      {
        name: 'GEOMETRICALLY EQUAL TO',
        value: '≑',
        codepoint: 8785,
      },
      {
        name: 'APPROXIMATELY EQUAL TO OR THE IMAGE OF',
        value: '≒',
        codepoint: 8786,
      },
      {
        name: 'IMAGE OF OR APPROXIMATELY EQUAL TO',
        value: '≓',
        codepoint: 8787,
      },
      {
        name: 'COLON EQUALS',
        value: '≔',
        codepoint: 8788,
      },
      {
        name: 'EQUALS COLON',
        value: '≕',
        codepoint: 8789,
      },
      {
        name: 'RING IN EQUAL TO',
        value: '≖',
        codepoint: 8790,
      },
      {
        name: 'RING EQUAL TO',
        value: '≗',
        codepoint: 8791,
      },
      {
        name: 'CORRESPONDS TO',
        value: '≘',
        codepoint: 8792,
      },
      {
        name: 'ESTIMATES',
        value: '≙',
        codepoint: 8793,
      },
      {
        name: 'EQUIANGULAR TO',
        value: '≚',
        codepoint: 8794,
      },
      {
        name: 'STAR EQUALS',
        value: '≛',
        codepoint: 8795,
      },
      {
        name: 'DELTA EQUAL TO',
        value: '≜',
        codepoint: 8796,
      },
      {
        name: 'EQUAL TO BY DEFINITION',
        value: '≝',
        codepoint: 8797,
      },
      {
        name: 'MEASURED BY',
        value: '≞',
        codepoint: 8798,
      },
      {
        name: 'QUESTIONED EQUAL TO',
        value: '≟',
        codepoint: 8799,
      },
      {
        name: 'NOT EQUAL TO',
        value: '≠',
        codepoint: 8800,
      },
      {
        name: 'IDENTICAL TO',
        value: '≡',
        codepoint: 8801,
      },
      {
        name: 'NOT IDENTICAL TO',
        value: '≢',
        codepoint: 8802,
      },
      {
        name: 'STRICTLY EQUIVALENT TO',
        value: '≣',
        codepoint: 8803,
      },
      {
        name: 'LESS-THAN OR EQUAL TO',
        value: '≤',
        codepoint: 8804,
      },
      {
        name: 'GREATER-THAN OR EQUAL TO',
        value: '≥',
        codepoint: 8805,
      },
      {
        name: 'LESS-THAN OVER EQUAL TO',
        value: '≦',
        codepoint: 8806,
      },
      {
        name: 'GREATER-THAN OVER EQUAL TO',
        value: '≧',
        codepoint: 8807,
      },
      {
        name: 'LESS-THAN BUT NOT EQUAL TO',
        value: '≨',
        codepoint: 8808,
      },
      {
        name: 'GREATER-THAN BUT NOT EQUAL TO',
        value: '≩',
        codepoint: 8809,
      },
      {
        name: 'MUCH LESS-THAN',
        value: '≪',
        codepoint: 8810,
      },
      {
        name: 'MUCH GREATER-THAN',
        value: '≫',
        codepoint: 8811,
      },
      {
        name: 'BETWEEN',
        value: '≬',
        codepoint: 8812,
      },
      {
        name: 'NOT EQUIVALENT TO',
        value: '≭',
        codepoint: 8813,
      },
      {
        name: 'NOT LESS-THAN',
        value: '≮',
        codepoint: 8814,
      },
      {
        name: 'NOT GREATER-THAN',
        value: '≯',
        codepoint: 8815,
      },
      {
        name: 'NEITHER LESS-THAN NOR EQUAL TO',
        value: '≰',
        codepoint: 8816,
      },
      {
        name: 'NEITHER GREATER-THAN NOR EQUAL TO',
        value: '≱',
        codepoint: 8817,
      },
      {
        name: 'LESS-THAN OR EQUIVALENT TO',
        value: '≲',
        codepoint: 8818,
      },
      {
        name: 'GREATER-THAN OR EQUIVALENT TO',
        value: '≳',
        codepoint: 8819,
      },
      {
        name: 'NEITHER LESS-THAN NOR EQUIVALENT TO',
        value: '≴',
        codepoint: 8820,
      },
      {
        name: 'NEITHER GREATER-THAN NOR EQUIVALENT TO',
        value: '≵',
        codepoint: 8821,
      },
      {
        name: 'LESS-THAN OR GREATER-THAN',
        value: '≶',
        codepoint: 8822,
      },
      {
        name: 'GREATER-THAN OR LESS-THAN',
        value: '≷',
        codepoint: 8823,
      },
      {
        name: 'NEITHER LESS-THAN NOR GREATER-THAN',
        value: '≸',
        codepoint: 8824,
      },
      {
        name: 'NEITHER GREATER-THAN NOR LESS-THAN',
        value: '≹',
        codepoint: 8825,
      },
      {
        name: 'PRECEDES',
        value: '≺',
        codepoint: 8826,
      },
      {
        name: 'SUCCEEDS',
        value: '≻',
        codepoint: 8827,
      },
      {
        name: 'PRECEDES OR EQUAL TO',
        value: '≼',
        codepoint: 8828,
      },
      {
        name: 'SUCCEEDS OR EQUAL TO',
        value: '≽',
        codepoint: 8829,
      },
      {
        name: 'PRECEDES OR EQUIVALENT TO',
        value: '≾',
        codepoint: 8830,
      },
      {
        name: 'SUCCEEDS OR EQUIVALENT TO',
        value: '≿',
        codepoint: 8831,
      },
      {
        name: 'DOES NOT PRECEDE',
        value: '⊀',
        codepoint: 8832,
      },
      {
        name: 'DOES NOT SUCCEED',
        value: '⊁',
        codepoint: 8833,
      },
      {
        name: 'SUBSET OF',
        value: '⊂',
        codepoint: 8834,
      },
      {
        name: 'SUPERSET OF',
        value: '⊃',
        codepoint: 8835,
      },
      {
        name: 'NOT A SUBSET OF',
        value: '⊄',
        codepoint: 8836,
      },
      {
        name: 'NOT A SUPERSET OF',
        value: '⊅',
        codepoint: 8837,
      },
      {
        name: 'SUBSET OF OR EQUAL TO',
        value: '⊆',
        codepoint: 8838,
      },
      {
        name: 'SUPERSET OF OR EQUAL TO',
        value: '⊇',
        codepoint: 8839,
      },
      {
        name: 'NEITHER A SUBSET OF NOR EQUAL TO',
        value: '⊈',
        codepoint: 8840,
      },
      {
        name: 'NEITHER A SUPERSET OF NOR EQUAL TO',
        value: '⊉',
        codepoint: 8841,
      },
      {
        name: 'SUBSET OF WITH NOT EQUAL TO',
        value: '⊊',
        codepoint: 8842,
      },
      {
        name: 'SUPERSET OF WITH NOT EQUAL TO',
        value: '⊋',
        codepoint: 8843,
      },
      {
        name: 'MULTISET',
        value: '⊌',
        codepoint: 8844,
      },
      {
        name: 'MULTISET MULTIPLICATION',
        value: '⊍',
        codepoint: 8845,
      },
      {
        name: 'MULTISET UNION',
        value: '⊎',
        codepoint: 8846,
      },
      {
        name: 'SQUARE IMAGE OF',
        value: '⊏',
        codepoint: 8847,
      },
      {
        name: 'SQUARE ORIGINAL OF',
        value: '⊐',
        codepoint: 8848,
      },
      {
        name: 'SQUARE IMAGE OF OR EQUAL TO',
        value: '⊑',
        codepoint: 8849,
      },
      {
        name: 'SQUARE ORIGINAL OF OR EQUAL TO',
        value: '⊒',
        codepoint: 8850,
      },
      {
        name: 'SQUARE CAP',
        value: '⊓',
        codepoint: 8851,
      },
      {
        name: 'SQUARE CUP',
        value: '⊔',
        codepoint: 8852,
      },
      {
        name: 'CIRCLED PLUS',
        value: '⊕',
        codepoint: 8853,
      },
      {
        name: 'CIRCLED MINUS',
        value: '⊖',
        codepoint: 8854,
      },
      {
        name: 'CIRCLED TIMES',
        value: '⊗',
        codepoint: 8855,
      },
      {
        name: 'CIRCLED DIVISION SLASH',
        value: '⊘',
        codepoint: 8856,
      },
      {
        name: 'CIRCLED DOT OPERATOR',
        value: '⊙',
        codepoint: 8857,
      },
      {
        name: 'CIRCLED RING OPERATOR',
        value: '⊚',
        codepoint: 8858,
      },
      {
        name: 'CIRCLED ASTERISK OPERATOR',
        value: '⊛',
        codepoint: 8859,
      },
      {
        name: 'CIRCLED EQUALS',
        value: '⊜',
        codepoint: 8860,
      },
      {
        name: 'CIRCLED DASH',
        value: '⊝',
        codepoint: 8861,
      },
      {
        name: 'SQUARED PLUS',
        value: '⊞',
        codepoint: 8862,
      },
      {
        name: 'SQUARED MINUS',
        value: '⊟',
        codepoint: 8863,
      },
      {
        name: 'SQUARED TIMES',
        value: '⊠',
        codepoint: 8864,
      },
      {
        name: 'SQUARED DOT OPERATOR',
        value: '⊡',
        codepoint: 8865,
      },
      {
        name: 'RIGHT TACK',
        value: '⊢',
        codepoint: 8866,
      },
      {
        name: 'LEFT TACK',
        value: '⊣',
        codepoint: 8867,
      },
      {
        name: 'DOWN TACK',
        value: '⊤',
        codepoint: 8868,
      },
      {
        name: 'UP TACK',
        value: '⊥',
        codepoint: 8869,
      },
      {
        name: 'ASSERTION',
        value: '⊦',
        codepoint: 8870,
      },
      {
        name: 'MODELS',
        value: '⊧',
        codepoint: 8871,
      },
      {
        name: 'TRUE',
        value: '⊨',
        codepoint: 8872,
      },
      {
        name: 'FORCES',
        value: '⊩',
        codepoint: 8873,
      },
      {
        name: 'TRIPLE VERTICAL BAR RIGHT TURNSTILE',
        value: '⊪',
        codepoint: 8874,
      },
      {
        name: 'DOUBLE VERTICAL BAR DOUBLE RIGHT TURNSTILE',
        value: '⊫',
        codepoint: 8875,
      },
      {
        name: 'DOES NOT PROVE',
        value: '⊬',
        codepoint: 8876,
      },
      {
        name: 'NOT TRUE',
        value: '⊭',
        codepoint: 8877,
      },
      {
        name: 'DOES NOT FORCE',
        value: '⊮',
        codepoint: 8878,
      },
      {
        name: 'NEGATED DOUBLE VERTICAL BAR DOUBLE RIGHT TURNSTILE',
        value: '⊯',
        codepoint: 8879,
      },
      {
        name: 'PRECEDES UNDER RELATION',
        value: '⊰',
        codepoint: 8880,
      },
      {
        name: 'SUCCEEDS UNDER RELATION',
        value: '⊱',
        codepoint: 8881,
      },
      {
        name: 'NORMAL SUBGROUP OF',
        value: '⊲',
        codepoint: 8882,
      },
      {
        name: 'CONTAINS AS NORMAL SUBGROUP',
        value: '⊳',
        codepoint: 8883,
      },
      {
        name: 'NORMAL SUBGROUP OF OR EQUAL TO',
        value: '⊴',
        codepoint: 8884,
      },
      {
        name: 'CONTAINS AS NORMAL SUBGROUP OR EQUAL TO',
        value: '⊵',
        codepoint: 8885,
      },
      {
        name: 'ORIGINAL OF',
        value: '⊶',
        codepoint: 8886,
      },
      {
        name: 'IMAGE OF',
        value: '⊷',
        codepoint: 8887,
      },
      {
        name: 'MULTIMAP',
        value: '⊸',
        codepoint: 8888,
      },
      {
        name: 'HERMITIAN CONJUGATE MATRIX',
        value: '⊹',
        codepoint: 8889,
      },
      {
        name: 'INTERCALATE',
        value: '⊺',
        codepoint: 8890,
      },
      {
        name: 'XOR',
        value: '⊻',
        codepoint: 8891,
      },
      {
        name: 'NAND',
        value: '⊼',
        codepoint: 8892,
      },
      {
        name: 'NOR',
        value: '⊽',
        codepoint: 8893,
      },
      {
        name: 'RIGHT ANGLE WITH ARC',
        value: '⊾',
        codepoint: 8894,
      },
      {
        name: 'RIGHT TRIANGLE',
        value: '⊿',
        codepoint: 8895,
      },
      {
        name: 'N-ARY LOGICAL AND',
        value: '⋀',
        codepoint: 8896,
      },
      {
        name: 'N-ARY LOGICAL OR',
        value: '⋁',
        codepoint: 8897,
      },
      {
        name: 'N-ARY INTERSECTION',
        value: '⋂',
        codepoint: 8898,
      },
      {
        name: 'N-ARY UNION',
        value: '⋃',
        codepoint: 8899,
      },
      {
        name: 'DIAMOND OPERATOR',
        value: '⋄',
        codepoint: 8900,
      },
      {
        name: 'DOT OPERATOR',
        value: '⋅',
        codepoint: 8901,
      },
      {
        name: 'STAR OPERATOR',
        value: '⋆',
        codepoint: 8902,
      },
      {
        name: 'DIVISION TIMES',
        value: '⋇',
        codepoint: 8903,
      },
      {
        name: 'BOWTIE',
        value: '⋈',
        codepoint: 8904,
      },
      {
        name: 'LEFT NORMAL FACTOR SEMIDIRECT PRODUCT',
        value: '⋉',
        codepoint: 8905,
      },
      {
        name: 'RIGHT NORMAL FACTOR SEMIDIRECT PRODUCT',
        value: '⋊',
        codepoint: 8906,
      },
      {
        name: 'LEFT SEMIDIRECT PRODUCT',
        value: '⋋',
        codepoint: 8907,
      },
      {
        name: 'RIGHT SEMIDIRECT PRODUCT',
        value: '⋌',
        codepoint: 8908,
      },
      {
        name: 'REVERSED TILDE EQUALS',
        value: '⋍',
        codepoint: 8909,
      },
      {
        name: 'CURLY LOGICAL OR',
        value: '⋎',
        codepoint: 8910,
      },
      {
        name: 'CURLY LOGICAL AND',
        value: '⋏',
        codepoint: 8911,
      },
      {
        name: 'DOUBLE SUBSET',
        value: '⋐',
        codepoint: 8912,
      },
      {
        name: 'DOUBLE SUPERSET',
        value: '⋑',
        codepoint: 8913,
      },
      {
        name: 'DOUBLE INTERSECTION',
        value: '⋒',
        codepoint: 8914,
      },
      {
        name: 'DOUBLE UNION',
        value: '⋓',
        codepoint: 8915,
      },
      {
        name: 'PITCHFORK',
        value: '⋔',
        codepoint: 8916,
      },
      {
        name: 'EQUAL AND PARALLEL TO',
        value: '⋕',
        codepoint: 8917,
      },
      {
        name: 'LESS-THAN WITH DOT',
        value: '⋖',
        codepoint: 8918,
      },
      {
        name: 'GREATER-THAN WITH DOT',
        value: '⋗',
        codepoint: 8919,
      },
      {
        name: 'VERY MUCH LESS-THAN',
        value: '⋘',
        codepoint: 8920,
      },
      {
        name: 'VERY MUCH GREATER-THAN',
        value: '⋙',
        codepoint: 8921,
      },
      {
        name: 'LESS-THAN EQUAL TO OR GREATER-THAN',
        value: '⋚',
        codepoint: 8922,
      },
      {
        name: 'GREATER-THAN EQUAL TO OR LESS-THAN',
        value: '⋛',
        codepoint: 8923,
      },
      {
        name: 'EQUAL TO OR LESS-THAN',
        value: '⋜',
        codepoint: 8924,
      },
      {
        name: 'EQUAL TO OR GREATER-THAN',
        value: '⋝',
        codepoint: 8925,
      },
      {
        name: 'EQUAL TO OR PRECEDES',
        value: '⋞',
        codepoint: 8926,
      },
      {
        name: 'EQUAL TO OR SUCCEEDS',
        value: '⋟',
        codepoint: 8927,
      },
      {
        name: 'DOES NOT PRECEDE OR EQUAL',
        value: '⋠',
        codepoint: 8928,
      },
      {
        name: 'DOES NOT SUCCEED OR EQUAL',
        value: '⋡',
        codepoint: 8929,
      },
      {
        name: 'NOT SQUARE IMAGE OF OR EQUAL TO',
        value: '⋢',
        codepoint: 8930,
      },
      {
        name: 'NOT SQUARE ORIGINAL OF OR EQUAL TO',
        value: '⋣',
        codepoint: 8931,
      },
      {
        name: 'SQUARE IMAGE OF OR NOT EQUAL TO',
        value: '⋤',
        codepoint: 8932,
      },
      {
        name: 'SQUARE ORIGINAL OF OR NOT EQUAL TO',
        value: '⋥',
        codepoint: 8933,
      },
      {
        name: 'LESS-THAN BUT NOT EQUIVALENT TO',
        value: '⋦',
        codepoint: 8934,
      },
      {
        name: 'GREATER-THAN BUT NOT EQUIVALENT TO',
        value: '⋧',
        codepoint: 8935,
      },
      {
        name: 'PRECEDES BUT NOT EQUIVALENT TO',
        value: '⋨',
        codepoint: 8936,
      },
      {
        name: 'SUCCEEDS BUT NOT EQUIVALENT TO',
        value: '⋩',
        codepoint: 8937,
      },
      {
        name: 'NOT NORMAL SUBGROUP OF',
        value: '⋪',
        codepoint: 8938,
      },
      {
        name: 'DOES NOT CONTAIN AS NORMAL SUBGROUP',
        value: '⋫',
        codepoint: 8939,
      },
      {
        name: 'NOT NORMAL SUBGROUP OF OR EQUAL TO',
        value: '⋬',
        codepoint: 8940,
      },
      {
        name: 'DOES NOT CONTAIN AS NORMAL SUBGROUP OR EQUAL',
        value: '⋭',
        codepoint: 8941,
      },
      {
        name: 'VERTICAL ELLIPSIS',
        value: '⋮',
        codepoint: 8942,
      },
      {
        name: 'MIDLINE HORIZONTAL ELLIPSIS',
        value: '⋯',
        codepoint: 8943,
      },
      {
        name: 'UP RIGHT DIAGONAL ELLIPSIS',
        value: '⋰',
        codepoint: 8944,
      },
      {
        name: 'DOWN RIGHT DIAGONAL ELLIPSIS',
        value: '⋱',
        codepoint: 8945,
      },
      {
        name: 'ELEMENT OF WITH LONG HORIZONTAL STROKE',
        value: '⋲',
        codepoint: 8946,
      },
      {
        name: 'ELEMENT OF WITH VERTICAL BAR AT END OF HORIZONTAL STROKE',
        value: '⋳',
        codepoint: 8947,
      },
      {
        name: 'SMALL ELEMENT OF WITH VERTICAL BAR AT END OF HORIZONTAL STROKE',
        value: '⋴',
        codepoint: 8948,
      },
      {
        name: 'ELEMENT OF WITH DOT ABOVE',
        value: '⋵',
        codepoint: 8949,
      },
      {
        name: 'ELEMENT OF WITH OVERBAR',
        value: '⋶',
        codepoint: 8950,
      },
      {
        name: 'SMALL ELEMENT OF WITH OVERBAR',
        value: '⋷',
        codepoint: 8951,
      },
      {
        name: 'ELEMENT OF WITH UNDERBAR',
        value: '⋸',
        codepoint: 8952,
      },
      {
        name: 'ELEMENT OF WITH TWO HORIZONTAL STROKES',
        value: '⋹',
        codepoint: 8953,
      },
      {
        name: 'CONTAINS WITH LONG HORIZONTAL STROKE',
        value: '⋺',
        codepoint: 8954,
      },
      {
        name: 'CONTAINS WITH VERTICAL BAR AT END OF HORIZONTAL STROKE',
        value: '⋻',
        codepoint: 8955,
      },
      {
        name: 'SMALL CONTAINS WITH VERTICAL BAR AT END OF HORIZONTAL STROKE',
        value: '⋼',
        codepoint: 8956,
      },
      {
        name: 'CONTAINS WITH OVERBAR',
        value: '⋽',
        codepoint: 8957,
      },
      {
        name: 'SMALL CONTAINS WITH OVERBAR',
        value: '⋾',
        codepoint: 8958,
      },
      {
        name: 'Z NOTATION BAG MEMBERSHIP',
        value: '⋿',
        codepoint: 8959,
      },
      {
        name: 'THREE DIMENSIONAL ANGLE',
        value: '⟀',
        codepoint: 10176,
      },
      {
        name: 'WHITE TRIANGLE CONTAINING SMALL WHITE TRIANGLE',
        value: '⟁',
        codepoint: 10177,
      },
      {
        name: 'PERPENDICULAR',
        value: '⟂',
        codepoint: 10178,
      },
      {
        name: 'OPEN SUBSET',
        value: '⟃',
        codepoint: 10179,
      },
      {
        name: 'OPEN SUPERSET',
        value: '⟄',
        codepoint: 10180,
      },
      {
        name: 'LEFT S-SHAPED BAG DELIMITER',
        value: '⟅',
        codepoint: 10181,
      },
      {
        name: 'RIGHT S-SHAPED BAG DELIMITER',
        value: '⟆',
        codepoint: 10182,
      },
      {
        name: 'OR WITH DOT INSIDE',
        value: '⟇',
        codepoint: 10183,
      },
      {
        name: 'REVERSE SOLIDUS PRECEDING SUBSET',
        value: '⟈',
        codepoint: 10184,
      },
      {
        name: 'SUPERSET PRECEDING SOLIDUS',
        value: '⟉',
        codepoint: 10185,
      },
      {
        name: 'VERTICAL BAR WITH HORIZONTAL STROKE',
        value: '⟊',
        codepoint: 10186,
      },
      {
        name: 'LONG DIVISION',
        value: '⟌',
        codepoint: 10188,
      },
      {
        name: 'WHITE DIAMOND WITH CENTRED DOT',
        value: '⟐',
        codepoint: 10192,
      },
      {
        name: 'AND WITH DOT',
        value: '⟑',
        codepoint: 10193,
      },
      {
        name: 'ELEMENT OF OPENING UPWARDS',
        value: '⟒',
        codepoint: 10194,
      },
      {
        name: 'LOWER RIGHT CORNER WITH DOT',
        value: '⟓',
        codepoint: 10195,
      },
      {
        name: 'UPPER LEFT CORNER WITH DOT',
        value: '⟔',
        codepoint: 10196,
      },
      {
        name: 'LEFT OUTER JOIN',
        value: '⟕',
        codepoint: 10197,
      },
      {
        name: 'RIGHT OUTER JOIN',
        value: '⟖',
        codepoint: 10198,
      },
      {
        name: 'FULL OUTER JOIN',
        value: '⟗',
        codepoint: 10199,
      },
      {
        name: 'LARGE UP TACK',
        value: '⟘',
        codepoint: 10200,
      },
      {
        name: 'LARGE DOWN TACK',
        value: '⟙',
        codepoint: 10201,
      },
      {
        name: 'LEFT AND RIGHT DOUBLE TURNSTILE',
        value: '⟚',
        codepoint: 10202,
      },
      {
        name: 'LEFT AND RIGHT TACK',
        value: '⟛',
        codepoint: 10203,
      },
      {
        name: 'LEFT MULTIMAP',
        value: '⟜',
        codepoint: 10204,
      },
      {
        name: 'LONG RIGHT TACK',
        value: '⟝',
        codepoint: 10205,
      },
      {
        name: 'LONG LEFT TACK',
        value: '⟞',
        codepoint: 10206,
      },
      {
        name: 'UP TACK WITH CIRCLE ABOVE',
        value: '⟟',
        codepoint: 10207,
      },
      {
        name: 'LOZENGE DIVIDED BY HORIZONTAL RULE',
        value: '⟠',
        codepoint: 10208,
      },
      {
        name: 'WHITE CONCAVE-SIDED DIAMOND',
        value: '⟡',
        codepoint: 10209,
      },
      {
        name: 'WHITE CONCAVE-SIDED DIAMOND WITH LEFTWARDS TICK',
        value: '⟢',
        codepoint: 10210,
      },
      {
        name: 'WHITE CONCAVE-SIDED DIAMOND WITH RIGHTWARDS TICK',
        value: '⟣',
        codepoint: 10211,
      },
      {
        name: 'WHITE SQUARE WITH LEFTWARDS TICK',
        value: '⟤',
        codepoint: 10212,
      },
      {
        name: 'WHITE SQUARE WITH RIGHTWARDS TICK',
        value: '⟥',
        codepoint: 10213,
      },
      {
        name: 'MATHEMATICAL LEFT WHITE SQUARE BRACKET',
        value: '⟦',
        codepoint: 10214,
      },
      {
        name: 'MATHEMATICAL RIGHT WHITE SQUARE BRACKET',
        value: '⟧',
        codepoint: 10215,
      },
      {
        name: 'MATHEMATICAL LEFT ANGLE BRACKET',
        value: '⟨',
        codepoint: 10216,
      },
      {
        name: 'MATHEMATICAL RIGHT ANGLE BRACKET',
        value: '⟩',
        codepoint: 10217,
      },
      {
        name: 'MATHEMATICAL LEFT DOUBLE ANGLE BRACKET',
        value: '⟪',
        codepoint: 10218,
      },
      {
        name: 'MATHEMATICAL RIGHT DOUBLE ANGLE BRACKET',
        value: '⟫',
        codepoint: 10219,
      },
      {
        name: 'MATHEMATICAL LEFT WHITE TORTOISE SHELL BRACKET',
        value: '⟬',
        codepoint: 10220,
      },
      {
        name: 'MATHEMATICAL RIGHT WHITE TORTOISE SHELL BRACKET',
        value: '⟭',
        codepoint: 10221,
      },
      {
        name: 'MATHEMATICAL LEFT FLATTENED PARENTHESIS',
        value: '⟮',
        codepoint: 10222,
      },
      {
        name: 'MATHEMATICAL RIGHT FLATTENED PARENTHESIS',
        value: '⟯',
        codepoint: 10223,
      },
      {
        name: 'TRIPLE VERTICAL BAR DELIMITER',
        value: '⦀',
        codepoint: 10624,
      },
      {
        name: 'Z NOTATION SPOT',
        value: '⦁',
        codepoint: 10625,
      },
      {
        name: 'Z NOTATION TYPE COLON',
        value: '⦂',
        codepoint: 10626,
      },
      {
        name: 'LEFT WHITE CURLY BRACKET',
        value: '⦃',
        codepoint: 10627,
      },
      {
        name: 'RIGHT WHITE CURLY BRACKET',
        value: '⦄',
        codepoint: 10628,
      },
      {
        name: 'LEFT WHITE PARENTHESIS',
        value: '⦅',
        codepoint: 10629,
      },
      {
        name: 'RIGHT WHITE PARENTHESIS',
        value: '⦆',
        codepoint: 10630,
      },
      {
        name: 'Z NOTATION LEFT IMAGE BRACKET',
        value: '⦇',
        codepoint: 10631,
      },
      {
        name: 'Z NOTATION RIGHT IMAGE BRACKET',
        value: '⦈',
        codepoint: 10632,
      },
      {
        name: 'Z NOTATION LEFT BINDING BRACKET',
        value: '⦉',
        codepoint: 10633,
      },
      {
        name: 'Z NOTATION RIGHT BINDING BRACKET',
        value: '⦊',
        codepoint: 10634,
      },
      {
        name: 'LEFT SQUARE BRACKET WITH UNDERBAR',
        value: '⦋',
        codepoint: 10635,
      },
      {
        name: 'RIGHT SQUARE BRACKET WITH UNDERBAR',
        value: '⦌',
        codepoint: 10636,
      },
      {
        name: 'LEFT SQUARE BRACKET WITH TICK IN TOP CORNER',
        value: '⦍',
        codepoint: 10637,
      },
      {
        name: 'RIGHT SQUARE BRACKET WITH TICK IN BOTTOM CORNER',
        value: '⦎',
        codepoint: 10638,
      },
      {
        name: 'LEFT SQUARE BRACKET WITH TICK IN BOTTOM CORNER',
        value: '⦏',
        codepoint: 10639,
      },
      {
        name: 'RIGHT SQUARE BRACKET WITH TICK IN TOP CORNER',
        value: '⦐',
        codepoint: 10640,
      },
      {
        name: 'LEFT ANGLE BRACKET WITH DOT',
        value: '⦑',
        codepoint: 10641,
      },
      {
        name: 'RIGHT ANGLE BRACKET WITH DOT',
        value: '⦒',
        codepoint: 10642,
      },
      {
        name: 'LEFT ARC LESS-THAN BRACKET',
        value: '⦓',
        codepoint: 10643,
      },
      {
        name: 'RIGHT ARC GREATER-THAN BRACKET',
        value: '⦔',
        codepoint: 10644,
      },
      {
        name: 'DOUBLE LEFT ARC GREATER-THAN BRACKET',
        value: '⦕',
        codepoint: 10645,
      },
      {
        name: 'DOUBLE RIGHT ARC LESS-THAN BRACKET',
        value: '⦖',
        codepoint: 10646,
      },
      {
        name: 'LEFT BLACK TORTOISE SHELL BRACKET',
        value: '⦗',
        codepoint: 10647,
      },
      {
        name: 'RIGHT BLACK TORTOISE SHELL BRACKET',
        value: '⦘',
        codepoint: 10648,
      },
      {
        name: 'DOTTED FENCE',
        value: '⦙',
        codepoint: 10649,
      },
      {
        name: 'VERTICAL ZIGZAG LINE',
        value: '⦚',
        codepoint: 10650,
      },
      {
        name: 'MEASURED ANGLE OPENING LEFT',
        value: '⦛',
        codepoint: 10651,
      },
      {
        name: 'RIGHT ANGLE VARIANT WITH SQUARE',
        value: '⦜',
        codepoint: 10652,
      },
      {
        name: 'MEASURED RIGHT ANGLE WITH DOT',
        value: '⦝',
        codepoint: 10653,
      },
      {
        name: 'ANGLE WITH S INSIDE',
        value: '⦞',
        codepoint: 10654,
      },
      {
        name: 'ACUTE ANGLE',
        value: '⦟',
        codepoint: 10655,
      },
      {
        name: 'SPHERICAL ANGLE OPENING LEFT',
        value: '⦠',
        codepoint: 10656,
      },
      {
        name: 'SPHERICAL ANGLE OPENING UP',
        value: '⦡',
        codepoint: 10657,
      },
      {
        name: 'TURNED ANGLE',
        value: '⦢',
        codepoint: 10658,
      },
      {
        name: 'REVERSED ANGLE',
        value: '⦣',
        codepoint: 10659,
      },
      {
        name: 'ANGLE WITH UNDERBAR',
        value: '⦤',
        codepoint: 10660,
      },
      {
        name: 'REVERSED ANGLE WITH UNDERBAR',
        value: '⦥',
        codepoint: 10661,
      },
      {
        name: 'OBLIQUE ANGLE OPENING UP',
        value: '⦦',
        codepoint: 10662,
      },
      {
        name: 'OBLIQUE ANGLE OPENING DOWN',
        value: '⦧',
        codepoint: 10663,
      },
      {
        name: 'MEASURED ANGLE WITH OPEN ARM ENDING IN ARROW POINTING UP AND RIGHT',
        value: '⦨',
        codepoint: 10664,
      },
      {
        name: 'MEASURED ANGLE WITH OPEN ARM ENDING IN ARROW POINTING UP AND LEFT',
        value: '⦩',
        codepoint: 10665,
      },
      {
        name: 'MEASURED ANGLE WITH OPEN ARM ENDING IN ARROW POINTING DOWN AND RIGHT',
        value: '⦪',
        codepoint: 10666,
      },
      {
        name: 'MEASURED ANGLE WITH OPEN ARM ENDING IN ARROW POINTING DOWN AND LEFT',
        value: '⦫',
        codepoint: 10667,
      },
      {
        name: 'MEASURED ANGLE WITH OPEN ARM ENDING IN ARROW POINTING RIGHT AND UP',
        value: '⦬',
        codepoint: 10668,
      },
      {
        name: 'MEASURED ANGLE WITH OPEN ARM ENDING IN ARROW POINTING LEFT AND UP',
        value: '⦭',
        codepoint: 10669,
      },
      {
        name: 'MEASURED ANGLE WITH OPEN ARM ENDING IN ARROW POINTING RIGHT AND DOWN',
        value: '⦮',
        codepoint: 10670,
      },
      {
        name: 'MEASURED ANGLE WITH OPEN ARM ENDING IN ARROW POINTING LEFT AND DOWN',
        value: '⦯',
        codepoint: 10671,
      },
      {
        name: 'REVERSED EMPTY SET',
        value: '⦰',
        codepoint: 10672,
      },
      {
        name: 'EMPTY SET WITH OVERBAR',
        value: '⦱',
        codepoint: 10673,
      },
      {
        name: 'EMPTY SET WITH SMALL CIRCLE ABOVE',
        value: '⦲',
        codepoint: 10674,
      },
      {
        name: 'EMPTY SET WITH RIGHT ARROW ABOVE',
        value: '⦳',
        codepoint: 10675,
      },
      {
        name: 'EMPTY SET WITH LEFT ARROW ABOVE',
        value: '⦴',
        codepoint: 10676,
      },
      {
        name: 'CIRCLE WITH HORIZONTAL BAR',
        value: '⦵',
        codepoint: 10677,
      },
      {
        name: 'CIRCLED VERTICAL BAR',
        value: '⦶',
        codepoint: 10678,
      },
      {
        name: 'CIRCLED PARALLEL',
        value: '⦷',
        codepoint: 10679,
      },
      {
        name: 'CIRCLED REVERSE SOLIDUS',
        value: '⦸',
        codepoint: 10680,
      },
      {
        name: 'CIRCLED PERPENDICULAR',
        value: '⦹',
        codepoint: 10681,
      },
      {
        name: 'CIRCLE DIVIDED BY HORIZONTAL BAR AND TOP HALF DIVIDED BY VERTICAL BAR',
        value: '⦺',
        codepoint: 10682,
      },
      {
        name: 'CIRCLE WITH SUPERIMPOSED X',
        value: '⦻',
        codepoint: 10683,
      },
      {
        name: 'CIRCLED ANTICLOCKWISE-ROTATED DIVISION SIGN',
        value: '⦼',
        codepoint: 10684,
      },
      {
        name: 'UP ARROW THROUGH CIRCLE',
        value: '⦽',
        codepoint: 10685,
      },
      {
        name: 'CIRCLED WHITE BULLET',
        value: '⦾',
        codepoint: 10686,
      },
      {
        name: 'CIRCLED BULLET',
        value: '⦿',
        codepoint: 10687,
      },
      {
        name: 'CIRCLED LESS-THAN',
        value: '⧀',
        codepoint: 10688,
      },
      {
        name: 'CIRCLED GREATER-THAN',
        value: '⧁',
        codepoint: 10689,
      },
      {
        name: 'CIRCLE WITH SMALL CIRCLE TO THE RIGHT',
        value: '⧂',
        codepoint: 10690,
      },
      {
        name: 'CIRCLE WITH TWO HORIZONTAL STROKES TO THE RIGHT',
        value: '⧃',
        codepoint: 10691,
      },
      {
        name: 'SQUARED RISING DIAGONAL SLASH',
        value: '⧄',
        codepoint: 10692,
      },
      {
        name: 'SQUARED FALLING DIAGONAL SLASH',
        value: '⧅',
        codepoint: 10693,
      },
      {
        name: 'SQUARED ASTERISK',
        value: '⧆',
        codepoint: 10694,
      },
      {
        name: 'SQUARED SMALL CIRCLE',
        value: '⧇',
        codepoint: 10695,
      },
      {
        name: 'SQUARED SQUARE',
        value: '⧈',
        codepoint: 10696,
      },
      {
        name: 'TWO JOINED SQUARES',
        value: '⧉',
        codepoint: 10697,
      },
      {
        name: 'TRIANGLE WITH DOT ABOVE',
        value: '⧊',
        codepoint: 10698,
      },
      {
        name: 'TRIANGLE WITH UNDERBAR',
        value: '⧋',
        codepoint: 10699,
      },
      {
        name: 'S IN TRIANGLE',
        value: '⧌',
        codepoint: 10700,
      },
      {
        name: 'TRIANGLE WITH SERIFS AT BOTTOM',
        value: '⧍',
        codepoint: 10701,
      },
      {
        name: 'RIGHT TRIANGLE ABOVE LEFT TRIANGLE',
        value: '⧎',
        codepoint: 10702,
      },
      {
        name: 'LEFT TRIANGLE BESIDE VERTICAL BAR',
        value: '⧏',
        codepoint: 10703,
      },
      {
        name: 'VERTICAL BAR BESIDE RIGHT TRIANGLE',
        value: '⧐',
        codepoint: 10704,
      },
      {
        name: 'BOWTIE WITH LEFT HALF BLACK',
        value: '⧑',
        codepoint: 10705,
      },
      {
        name: 'BOWTIE WITH RIGHT HALF BLACK',
        value: '⧒',
        codepoint: 10706,
      },
      {
        name: 'BLACK BOWTIE',
        value: '⧓',
        codepoint: 10707,
      },
      {
        name: 'TIMES WITH LEFT HALF BLACK',
        value: '⧔',
        codepoint: 10708,
      },
      {
        name: 'TIMES WITH RIGHT HALF BLACK',
        value: '⧕',
        codepoint: 10709,
      },
      {
        name: 'WHITE HOURGLASS',
        value: '⧖',
        codepoint: 10710,
      },
      {
        name: 'BLACK HOURGLASS',
        value: '⧗',
        codepoint: 10711,
      },
      {
        name: 'LEFT WIGGLY FENCE',
        value: '⧘',
        codepoint: 10712,
      },
      {
        name: 'RIGHT WIGGLY FENCE',
        value: '⧙',
        codepoint: 10713,
      },
      {
        name: 'LEFT DOUBLE WIGGLY FENCE',
        value: '⧚',
        codepoint: 10714,
      },
      {
        name: 'RIGHT DOUBLE WIGGLY FENCE',
        value: '⧛',
        codepoint: 10715,
      },
      {
        name: 'INCOMPLETE INFINITY',
        value: '⧜',
        codepoint: 10716,
      },
      {
        name: 'TIE OVER INFINITY',
        value: '⧝',
        codepoint: 10717,
      },
      {
        name: 'INFINITY NEGATED WITH VERTICAL BAR',
        value: '⧞',
        codepoint: 10718,
      },
      {
        name: 'DOUBLE-ENDED MULTIMAP',
        value: '⧟',
        codepoint: 10719,
      },
      {
        name: 'SQUARE WITH CONTOURED OUTLINE',
        value: '⧠',
        codepoint: 10720,
      },
      {
        name: 'INCREASES AS',
        value: '⧡',
        codepoint: 10721,
      },
      {
        name: 'SHUFFLE PRODUCT',
        value: '⧢',
        codepoint: 10722,
      },
      {
        name: 'EQUALS SIGN AND SLANTED PARALLEL',
        value: '⧣',
        codepoint: 10723,
      },
      {
        name: 'EQUALS SIGN AND SLANTED PARALLEL WITH TILDE ABOVE',
        value: '⧤',
        codepoint: 10724,
      },
      {
        name: 'IDENTICAL TO AND SLANTED PARALLEL',
        value: '⧥',
        codepoint: 10725,
      },
      {
        name: 'GLEICH STARK',
        value: '⧦',
        codepoint: 10726,
      },
      {
        name: 'THERMODYNAMIC',
        value: '⧧',
        codepoint: 10727,
      },
      {
        name: 'DOWN-POINTING TRIANGLE WITH LEFT HALF BLACK',
        value: '⧨',
        codepoint: 10728,
      },
      {
        name: 'DOWN-POINTING TRIANGLE WITH RIGHT HALF BLACK',
        value: '⧩',
        codepoint: 10729,
      },
      {
        name: 'BLACK DIAMOND WITH DOWN ARROW',
        value: '⧪',
        codepoint: 10730,
      },
      {
        name: 'BLACK LOZENGE',
        value: '⧫',
        codepoint: 10731,
      },
      {
        name: 'WHITE CIRCLE WITH DOWN ARROW',
        value: '⧬',
        codepoint: 10732,
      },
      {
        name: 'BLACK CIRCLE WITH DOWN ARROW',
        value: '⧭',
        codepoint: 10733,
      },
      {
        name: 'ERROR-BARRED WHITE SQUARE',
        value: '⧮',
        codepoint: 10734,
      },
      {
        name: 'ERROR-BARRED BLACK SQUARE',
        value: '⧯',
        codepoint: 10735,
      },
      {
        name: 'ERROR-BARRED WHITE DIAMOND',
        value: '⧰',
        codepoint: 10736,
      },
      {
        name: 'ERROR-BARRED BLACK DIAMOND',
        value: '⧱',
        codepoint: 10737,
      },
      {
        name: 'ERROR-BARRED WHITE CIRCLE',
        value: '⧲',
        codepoint: 10738,
      },
      {
        name: 'ERROR-BARRED BLACK CIRCLE',
        value: '⧳',
        codepoint: 10739,
      },
      {
        name: 'RULE-DELAYED',
        value: '⧴',
        codepoint: 10740,
      },
      {
        name: 'REVERSE SOLIDUS OPERATOR',
        value: '⧵',
        codepoint: 10741,
      },
      {
        name: 'SOLIDUS WITH OVERBAR',
        value: '⧶',
        codepoint: 10742,
      },
      {
        name: 'REVERSE SOLIDUS WITH HORIZONTAL STROKE',
        value: '⧷',
        codepoint: 10743,
      },
      {
        name: 'BIG SOLIDUS',
        value: '⧸',
        codepoint: 10744,
      },
      {
        name: 'BIG REVERSE SOLIDUS',
        value: '⧹',
        codepoint: 10745,
      },
      {
        name: 'DOUBLE PLUS',
        value: '⧺',
        codepoint: 10746,
      },
      {
        name: 'TRIPLE PLUS',
        value: '⧻',
        codepoint: 10747,
      },
      {
        name: 'LEFT-POINTING CURVED ANGLE BRACKET',
        value: '⧼',
        codepoint: 10748,
      },
      {
        name: 'RIGHT-POINTING CURVED ANGLE BRACKET',
        value: '⧽',
        codepoint: 10749,
      },
      {
        name: 'TINY',
        value: '⧾',
        codepoint: 10750,
      },
      {
        name: 'MINY',
        value: '⧿',
        codepoint: 10751,
      },
      {
        name: 'N-ARY CIRCLED DOT OPERATOR',
        value: '⨀',
        codepoint: 10752,
      },
      {
        name: 'N-ARY CIRCLED PLUS OPERATOR',
        value: '⨁',
        codepoint: 10753,
      },
      {
        name: 'N-ARY CIRCLED TIMES OPERATOR',
        value: '⨂',
        codepoint: 10754,
      },
      {
        name: 'N-ARY UNION OPERATOR WITH DOT',
        value: '⨃',
        codepoint: 10755,
      },
      {
        name: 'N-ARY UNION OPERATOR WITH PLUS',
        value: '⨄',
        codepoint: 10756,
      },
      {
        name: 'N-ARY SQUARE INTERSECTION OPERATOR',
        value: '⨅',
        codepoint: 10757,
      },
      {
        name: 'N-ARY SQUARE UNION OPERATOR',
        value: '⨆',
        codepoint: 10758,
      },
      {
        name: 'TWO LOGICAL AND OPERATOR',
        value: '⨇',
        codepoint: 10759,
      },
      {
        name: 'TWO LOGICAL OR OPERATOR',
        value: '⨈',
        codepoint: 10760,
      },
      {
        name: 'N-ARY TIMES OPERATOR',
        value: '⨉',
        codepoint: 10761,
      },
      {
        name: 'MODULO TWO SUM',
        value: '⨊',
        codepoint: 10762,
      },
      {
        name: 'SUMMATION WITH INTEGRAL',
        value: '⨋',
        codepoint: 10763,
      },
      {
        name: 'QUADRUPLE INTEGRAL OPERATOR',
        value: '⨌',
        codepoint: 10764,
      },
      {
        name: 'FINITE PART INTEGRAL',
        value: '⨍',
        codepoint: 10765,
      },
      {
        name: 'INTEGRAL WITH DOUBLE STROKE',
        value: '⨎',
        codepoint: 10766,
      },
      {
        name: 'INTEGRAL AVERAGE WITH SLASH',
        value: '⨏',
        codepoint: 10767,
      },
      {
        name: 'CIRCULATION FUNCTION',
        value: '⨐',
        codepoint: 10768,
      },
      {
        name: 'ANTICLOCKWISE INTEGRATION',
        value: '⨑',
        codepoint: 10769,
      },
      {
        name: 'LINE INTEGRATION WITH RECTANGULAR PATH AROUND POLE',
        value: '⨒',
        codepoint: 10770,
      },
      {
        name: 'LINE INTEGRATION WITH SEMICIRCULAR PATH AROUND POLE',
        value: '⨓',
        codepoint: 10771,
      },
      {
        name: 'LINE INTEGRATION NOT INCLUDING THE POLE',
        value: '⨔',
        codepoint: 10772,
      },
      {
        name: 'INTEGRAL AROUND A POINT OPERATOR',
        value: '⨕',
        codepoint: 10773,
      },
      {
        name: 'QUATERNION INTEGRAL OPERATOR',
        value: '⨖',
        codepoint: 10774,
      },
      {
        name: 'INTEGRAL WITH LEFTWARDS ARROW WITH HOOK',
        value: '⨗',
        codepoint: 10775,
      },
      {
        name: 'INTEGRAL WITH TIMES SIGN',
        value: '⨘',
        codepoint: 10776,
      },
      {
        name: 'INTEGRAL WITH INTERSECTION',
        value: '⨙',
        codepoint: 10777,
      },
      {
        name: 'INTEGRAL WITH UNION',
        value: '⨚',
        codepoint: 10778,
      },
      {
        name: 'INTEGRAL WITH OVERBAR',
        value: '⨛',
        codepoint: 10779,
      },
      {
        name: 'INTEGRAL WITH UNDERBAR',
        value: '⨜',
        codepoint: 10780,
      },
      {
        name: 'JOIN',
        value: '⨝',
        codepoint: 10781,
      },
      {
        name: 'LARGE LEFT TRIANGLE OPERATOR',
        value: '⨞',
        codepoint: 10782,
      },
      {
        name: 'Z NOTATION SCHEMA COMPOSITION',
        value: '⨟',
        codepoint: 10783,
      },
      {
        name: 'Z NOTATION SCHEMA PIPING',
        value: '⨠',
        codepoint: 10784,
      },
      {
        name: 'Z NOTATION SCHEMA PROJECTION',
        value: '⨡',
        codepoint: 10785,
      },
      {
        name: 'PLUS SIGN WITH SMALL CIRCLE ABOVE',
        value: '⨢',
        codepoint: 10786,
      },
      {
        name: 'PLUS SIGN WITH CIRCUMFLEX ACCENT ABOVE',
        value: '⨣',
        codepoint: 10787,
      },
      {
        name: 'PLUS SIGN WITH TILDE ABOVE',
        value: '⨤',
        codepoint: 10788,
      },
      {
        name: 'PLUS SIGN WITH DOT BELOW',
        value: '⨥',
        codepoint: 10789,
      },
      {
        name: 'PLUS SIGN WITH TILDE BELOW',
        value: '⨦',
        codepoint: 10790,
      },
      {
        name: 'PLUS SIGN WITH SUBSCRIPT TWO',
        value: '⨧',
        codepoint: 10791,
      },
      {
        name: 'PLUS SIGN WITH BLACK TRIANGLE',
        value: '⨨',
        codepoint: 10792,
      },
      {
        name: 'MINUS SIGN WITH COMMA ABOVE',
        value: '⨩',
        codepoint: 10793,
      },
      {
        name: 'MINUS SIGN WITH DOT BELOW',
        value: '⨪',
        codepoint: 10794,
      },
      {
        name: 'MINUS SIGN WITH FALLING DOTS',
        value: '⨫',
        codepoint: 10795,
      },
      {
        name: 'MINUS SIGN WITH RISING DOTS',
        value: '⨬',
        codepoint: 10796,
      },
      {
        name: 'PLUS SIGN IN LEFT HALF CIRCLE',
        value: '⨭',
        codepoint: 10797,
      },
      {
        name: 'PLUS SIGN IN RIGHT HALF CIRCLE',
        value: '⨮',
        codepoint: 10798,
      },
      {
        name: 'VECTOR OR CROSS PRODUCT',
        value: '⨯',
        codepoint: 10799,
      },
      {
        name: 'MULTIPLICATION SIGN WITH DOT ABOVE',
        value: '⨰',
        codepoint: 10800,
      },
      {
        name: 'MULTIPLICATION SIGN WITH UNDERBAR',
        value: '⨱',
        codepoint: 10801,
      },
      {
        name: 'SEMIDIRECT PRODUCT WITH BOTTOM CLOSED',
        value: '⨲',
        codepoint: 10802,
      },
      {
        name: 'SMASH PRODUCT',
        value: '⨳',
        codepoint: 10803,
      },
      {
        name: 'MULTIPLICATION SIGN IN LEFT HALF CIRCLE',
        value: '⨴',
        codepoint: 10804,
      },
      {
        name: 'MULTIPLICATION SIGN IN RIGHT HALF CIRCLE',
        value: '⨵',
        codepoint: 10805,
      },
      {
        name: 'CIRCLED MULTIPLICATION SIGN WITH CIRCUMFLEX ACCENT',
        value: '⨶',
        codepoint: 10806,
      },
      {
        name: 'MULTIPLICATION SIGN IN DOUBLE CIRCLE',
        value: '⨷',
        codepoint: 10807,
      },
      {
        name: 'CIRCLED DIVISION SIGN',
        value: '⨸',
        codepoint: 10808,
      },
      {
        name: 'PLUS SIGN IN TRIANGLE',
        value: '⨹',
        codepoint: 10809,
      },
      {
        name: 'MINUS SIGN IN TRIANGLE',
        value: '⨺',
        codepoint: 10810,
      },
      {
        name: 'MULTIPLICATION SIGN IN TRIANGLE',
        value: '⨻',
        codepoint: 10811,
      },
      {
        name: 'INTERIOR PRODUCT',
        value: '⨼',
        codepoint: 10812,
      },
      {
        name: 'RIGHTHAND INTERIOR PRODUCT',
        value: '⨽',
        codepoint: 10813,
      },
      {
        name: 'Z NOTATION RELATIONAL COMPOSITION',
        value: '⨾',
        codepoint: 10814,
      },
      {
        name: 'AMALGAMATION OR COPRODUCT',
        value: '⨿',
        codepoint: 10815,
      },
      {
        name: 'INTERSECTION WITH DOT',
        value: '⩀',
        codepoint: 10816,
      },
      {
        name: 'UNION WITH MINUS SIGN',
        value: '⩁',
        codepoint: 10817,
      },
      {
        name: 'UNION WITH OVERBAR',
        value: '⩂',
        codepoint: 10818,
      },
      {
        name: 'INTERSECTION WITH OVERBAR',
        value: '⩃',
        codepoint: 10819,
      },
      {
        name: 'INTERSECTION WITH LOGICAL AND',
        value: '⩄',
        codepoint: 10820,
      },
      {
        name: 'UNION WITH LOGICAL OR',
        value: '⩅',
        codepoint: 10821,
      },
      {
        name: 'UNION ABOVE INTERSECTION',
        value: '⩆',
        codepoint: 10822,
      },
      {
        name: 'INTERSECTION ABOVE UNION',
        value: '⩇',
        codepoint: 10823,
      },
      {
        name: 'UNION ABOVE BAR ABOVE INTERSECTION',
        value: '⩈',
        codepoint: 10824,
      },
      {
        name: 'INTERSECTION ABOVE BAR ABOVE UNION',
        value: '⩉',
        codepoint: 10825,
      },
      {
        name: 'UNION BESIDE AND JOINED WITH UNION',
        value: '⩊',
        codepoint: 10826,
      },
      {
        name: 'INTERSECTION BESIDE AND JOINED WITH INTERSECTION',
        value: '⩋',
        codepoint: 10827,
      },
      {
        name: 'CLOSED UNION WITH SERIFS',
        value: '⩌',
        codepoint: 10828,
      },
      {
        name: 'CLOSED INTERSECTION WITH SERIFS',
        value: '⩍',
        codepoint: 10829,
      },
      {
        name: 'DOUBLE SQUARE INTERSECTION',
        value: '⩎',
        codepoint: 10830,
      },
      {
        name: 'DOUBLE SQUARE UNION',
        value: '⩏',
        codepoint: 10831,
      },
      {
        name: 'CLOSED UNION WITH SERIFS AND SMASH PRODUCT',
        value: '⩐',
        codepoint: 10832,
      },
      {
        name: 'LOGICAL AND WITH DOT ABOVE',
        value: '⩑',
        codepoint: 10833,
      },
      {
        name: 'LOGICAL OR WITH DOT ABOVE',
        value: '⩒',
        codepoint: 10834,
      },
      {
        name: 'DOUBLE LOGICAL AND',
        value: '⩓',
        codepoint: 10835,
      },
      {
        name: 'DOUBLE LOGICAL OR',
        value: '⩔',
        codepoint: 10836,
      },
      {
        name: 'TWO INTERSECTING LOGICAL AND',
        value: '⩕',
        codepoint: 10837,
      },
      {
        name: 'TWO INTERSECTING LOGICAL OR',
        value: '⩖',
        codepoint: 10838,
      },
      {
        name: 'SLOPING LARGE OR',
        value: '⩗',
        codepoint: 10839,
      },
      {
        name: 'SLOPING LARGE AND',
        value: '⩘',
        codepoint: 10840,
      },
      {
        name: 'LOGICAL OR OVERLAPPING LOGICAL AND',
        value: '⩙',
        codepoint: 10841,
      },
      {
        name: 'LOGICAL AND WITH MIDDLE STEM',
        value: '⩚',
        codepoint: 10842,
      },
      {
        name: 'LOGICAL OR WITH MIDDLE STEM',
        value: '⩛',
        codepoint: 10843,
      },
      {
        name: 'LOGICAL AND WITH HORIZONTAL DASH',
        value: '⩜',
        codepoint: 10844,
      },
      {
        name: 'LOGICAL OR WITH HORIZONTAL DASH',
        value: '⩝',
        codepoint: 10845,
      },
      {
        name: 'LOGICAL AND WITH DOUBLE OVERBAR',
        value: '⩞',
        codepoint: 10846,
      },
      {
        name: 'LOGICAL AND WITH UNDERBAR',
        value: '⩟',
        codepoint: 10847,
      },
      {
        name: 'LOGICAL AND WITH DOUBLE UNDERBAR',
        value: '⩠',
        codepoint: 10848,
      },
      {
        name: 'SMALL VEE WITH UNDERBAR',
        value: '⩡',
        codepoint: 10849,
      },
      {
        name: 'LOGICAL OR WITH DOUBLE OVERBAR',
        value: '⩢',
        codepoint: 10850,
      },
      {
        name: 'LOGICAL OR WITH DOUBLE UNDERBAR',
        value: '⩣',
        codepoint: 10851,
      },
      {
        name: 'Z NOTATION DOMAIN ANTIRESTRICTION',
        value: '⩤',
        codepoint: 10852,
      },
      {
        name: 'Z NOTATION RANGE ANTIRESTRICTION',
        value: '⩥',
        codepoint: 10853,
      },
      {
        name: 'EQUALS SIGN WITH DOT BELOW',
        value: '⩦',
        codepoint: 10854,
      },
      {
        name: 'IDENTICAL WITH DOT ABOVE',
        value: '⩧',
        codepoint: 10855,
      },
      {
        name: 'TRIPLE HORIZONTAL BAR WITH DOUBLE VERTICAL STROKE',
        value: '⩨',
        codepoint: 10856,
      },
      {
        name: 'TRIPLE HORIZONTAL BAR WITH TRIPLE VERTICAL STROKE',
        value: '⩩',
        codepoint: 10857,
      },
      {
        name: 'TILDE OPERATOR WITH DOT ABOVE',
        value: '⩪',
        codepoint: 10858,
      },
      {
        name: 'TILDE OPERATOR WITH RISING DOTS',
        value: '⩫',
        codepoint: 10859,
      },
      {
        name: 'SIMILAR MINUS SIMILAR',
        value: '⩬',
        codepoint: 10860,
      },
      {
        name: 'CONGRUENT WITH DOT ABOVE',
        value: '⩭',
        codepoint: 10861,
      },
      {
        name: 'EQUALS WITH ASTERISK',
        value: '⩮',
        codepoint: 10862,
      },
      {
        name: 'ALMOST EQUAL TO WITH CIRCUMFLEX ACCENT',
        value: '⩯',
        codepoint: 10863,
      },
      {
        name: 'APPROXIMATELY EQUAL OR EQUAL TO',
        value: '⩰',
        codepoint: 10864,
      },
      {
        name: 'EQUALS SIGN ABOVE PLUS SIGN',
        value: '⩱',
        codepoint: 10865,
      },
      {
        name: 'PLUS SIGN ABOVE EQUALS SIGN',
        value: '⩲',
        codepoint: 10866,
      },
      {
        name: 'EQUALS SIGN ABOVE TILDE OPERATOR',
        value: '⩳',
        codepoint: 10867,
      },
      {
        name: 'DOUBLE COLON EQUAL',
        value: '⩴',
        codepoint: 10868,
      },
      {
        name: 'TWO CONSECUTIVE EQUALS SIGNS',
        value: '⩵',
        codepoint: 10869,
      },
      {
        name: 'THREE CONSECUTIVE EQUALS SIGNS',
        value: '⩶',
        codepoint: 10870,
      },
      {
        name: 'EQUALS SIGN WITH TWO DOTS ABOVE AND TWO DOTS BELOW',
        value: '⩷',
        codepoint: 10871,
      },
      {
        name: 'EQUIVALENT WITH FOUR DOTS ABOVE',
        value: '⩸',
        codepoint: 10872,
      },
      {
        name: 'LESS-THAN WITH CIRCLE INSIDE',
        value: '⩹',
        codepoint: 10873,
      },
      {
        name: 'GREATER-THAN WITH CIRCLE INSIDE',
        value: '⩺',
        codepoint: 10874,
      },
      {
        name: 'LESS-THAN WITH QUESTION MARK ABOVE',
        value: '⩻',
        codepoint: 10875,
      },
      {
        name: 'GREATER-THAN WITH QUESTION MARK ABOVE',
        value: '⩼',
        codepoint: 10876,
      },
      {
        name: 'LESS-THAN OR SLANTED EQUAL TO',
        value: '⩽',
        codepoint: 10877,
      },
      {
        name: 'GREATER-THAN OR SLANTED EQUAL TO',
        value: '⩾',
        codepoint: 10878,
      },
      {
        name: 'LESS-THAN OR SLANTED EQUAL TO WITH DOT INSIDE',
        value: '⩿',
        codepoint: 10879,
      },
      {
        name: 'GREATER-THAN OR SLANTED EQUAL TO WITH DOT INSIDE',
        value: '⪀',
        codepoint: 10880,
      },
      {
        name: 'LESS-THAN OR SLANTED EQUAL TO WITH DOT ABOVE',
        value: '⪁',
        codepoint: 10881,
      },
      {
        name: 'GREATER-THAN OR SLANTED EQUAL TO WITH DOT ABOVE',
        value: '⪂',
        codepoint: 10882,
      },
      {
        name: 'LESS-THAN OR SLANTED EQUAL TO WITH DOT ABOVE RIGHT',
        value: '⪃',
        codepoint: 10883,
      },
      {
        name: 'GREATER-THAN OR SLANTED EQUAL TO WITH DOT ABOVE LEFT',
        value: '⪄',
        codepoint: 10884,
      },
      {
        name: 'LESS-THAN OR APPROXIMATE',
        value: '⪅',
        codepoint: 10885,
      },
      {
        name: 'GREATER-THAN OR APPROXIMATE',
        value: '⪆',
        codepoint: 10886,
      },
      {
        name: 'LESS-THAN AND SINGLE-LINE NOT EQUAL TO',
        value: '⪇',
        codepoint: 10887,
      },
      {
        name: 'GREATER-THAN AND SINGLE-LINE NOT EQUAL TO',
        value: '⪈',
        codepoint: 10888,
      },
      {
        name: 'LESS-THAN AND NOT APPROXIMATE',
        value: '⪉',
        codepoint: 10889,
      },
      {
        name: 'GREATER-THAN AND NOT APPROXIMATE',
        value: '⪊',
        codepoint: 10890,
      },
      {
        name: 'LESS-THAN ABOVE DOUBLE-LINE EQUAL ABOVE GREATER-THAN',
        value: '⪋',
        codepoint: 10891,
      },
      {
        name: 'GREATER-THAN ABOVE DOUBLE-LINE EQUAL ABOVE LESS-THAN',
        value: '⪌',
        codepoint: 10892,
      },
      {
        name: 'LESS-THAN ABOVE SIMILAR OR EQUAL',
        value: '⪍',
        codepoint: 10893,
      },
      {
        name: 'GREATER-THAN ABOVE SIMILAR OR EQUAL',
        value: '⪎',
        codepoint: 10894,
      },
      {
        name: 'LESS-THAN ABOVE SIMILAR ABOVE GREATER-THAN',
        value: '⪏',
        codepoint: 10895,
      },
      {
        name: 'GREATER-THAN ABOVE SIMILAR ABOVE LESS-THAN',
        value: '⪐',
        codepoint: 10896,
      },
      {
        name: 'LESS-THAN ABOVE GREATER-THAN ABOVE DOUBLE-LINE EQUAL',
        value: '⪑',
        codepoint: 10897,
      },
      {
        name: 'GREATER-THAN ABOVE LESS-THAN ABOVE DOUBLE-LINE EQUAL',
        value: '⪒',
        codepoint: 10898,
      },
      {
        name: 'LESS-THAN ABOVE SLANTED EQUAL ABOVE GREATER-THAN ABOVE SLANTED EQUAL',
        value: '⪓',
        codepoint: 10899,
      },
      {
        name: 'GREATER-THAN ABOVE SLANTED EQUAL ABOVE LESS-THAN ABOVE SLANTED EQUAL',
        value: '⪔',
        codepoint: 10900,
      },
      {
        name: 'SLANTED EQUAL TO OR LESS-THAN',
        value: '⪕',
        codepoint: 10901,
      },
      {
        name: 'SLANTED EQUAL TO OR GREATER-THAN',
        value: '⪖',
        codepoint: 10902,
      },
      {
        name: 'SLANTED EQUAL TO OR LESS-THAN WITH DOT INSIDE',
        value: '⪗',
        codepoint: 10903,
      },
      {
        name: 'SLANTED EQUAL TO OR GREATER-THAN WITH DOT INSIDE',
        value: '⪘',
        codepoint: 10904,
      },
      {
        name: 'DOUBLE-LINE EQUAL TO OR LESS-THAN',
        value: '⪙',
        codepoint: 10905,
      },
      {
        name: 'DOUBLE-LINE EQUAL TO OR GREATER-THAN',
        value: '⪚',
        codepoint: 10906,
      },
      {
        name: 'DOUBLE-LINE SLANTED EQUAL TO OR LESS-THAN',
        value: '⪛',
        codepoint: 10907,
      },
      {
        name: 'DOUBLE-LINE SLANTED EQUAL TO OR GREATER-THAN',
        value: '⪜',
        codepoint: 10908,
      },
      {
        name: 'SIMILAR OR LESS-THAN',
        value: '⪝',
        codepoint: 10909,
      },
      {
        name: 'SIMILAR OR GREATER-THAN',
        value: '⪞',
        codepoint: 10910,
      },
      {
        name: 'SIMILAR ABOVE LESS-THAN ABOVE EQUALS SIGN',
        value: '⪟',
        codepoint: 10911,
      },
      {
        name: 'SIMILAR ABOVE GREATER-THAN ABOVE EQUALS SIGN',
        value: '⪠',
        codepoint: 10912,
      },
      {
        name: 'DOUBLE NESTED LESS-THAN',
        value: '⪡',
        codepoint: 10913,
      },
      {
        name: 'DOUBLE NESTED GREATER-THAN',
        value: '⪢',
        codepoint: 10914,
      },
      {
        name: 'DOUBLE NESTED LESS-THAN WITH UNDERBAR',
        value: '⪣',
        codepoint: 10915,
      },
      {
        name: 'GREATER-THAN OVERLAPPING LESS-THAN',
        value: '⪤',
        codepoint: 10916,
      },
      {
        name: 'GREATER-THAN BESIDE LESS-THAN',
        value: '⪥',
        codepoint: 10917,
      },
      {
        name: 'LESS-THAN CLOSED BY CURVE',
        value: '⪦',
        codepoint: 10918,
      },
      {
        name: 'GREATER-THAN CLOSED BY CURVE',
        value: '⪧',
        codepoint: 10919,
      },
      {
        name: 'LESS-THAN CLOSED BY CURVE ABOVE SLANTED EQUAL',
        value: '⪨',
        codepoint: 10920,
      },
      {
        name: 'GREATER-THAN CLOSED BY CURVE ABOVE SLANTED EQUAL',
        value: '⪩',
        codepoint: 10921,
      },
      {
        name: 'SMALLER THAN',
        value: '⪪',
        codepoint: 10922,
      },
      {
        name: 'LARGER THAN',
        value: '⪫',
        codepoint: 10923,
      },
      {
        name: 'SMALLER THAN OR EQUAL TO',
        value: '⪬',
        codepoint: 10924,
      },
      {
        name: 'LARGER THAN OR EQUAL TO',
        value: '⪭',
        codepoint: 10925,
      },
      {
        name: 'EQUALS SIGN WITH BUMPY ABOVE',
        value: '⪮',
        codepoint: 10926,
      },
      {
        name: 'PRECEDES ABOVE SINGLE-LINE EQUALS SIGN',
        value: '⪯',
        codepoint: 10927,
      },
      {
        name: 'SUCCEEDS ABOVE SINGLE-LINE EQUALS SIGN',
        value: '⪰',
        codepoint: 10928,
      },
      {
        name: 'PRECEDES ABOVE SINGLE-LINE NOT EQUAL TO',
        value: '⪱',
        codepoint: 10929,
      },
      {
        name: 'SUCCEEDS ABOVE SINGLE-LINE NOT EQUAL TO',
        value: '⪲',
        codepoint: 10930,
      },
      {
        name: 'PRECEDES ABOVE EQUALS SIGN',
        value: '⪳',
        codepoint: 10931,
      },
      {
        name: 'SUCCEEDS ABOVE EQUALS SIGN',
        value: '⪴',
        codepoint: 10932,
      },
      {
        name: 'PRECEDES ABOVE NOT EQUAL TO',
        value: '⪵',
        codepoint: 10933,
      },
      {
        name: 'SUCCEEDS ABOVE NOT EQUAL TO',
        value: '⪶',
        codepoint: 10934,
      },
      {
        name: 'PRECEDES ABOVE ALMOST EQUAL TO',
        value: '⪷',
        codepoint: 10935,
      },
      {
        name: 'SUCCEEDS ABOVE ALMOST EQUAL TO',
        value: '⪸',
        codepoint: 10936,
      },
      {
        name: 'PRECEDES ABOVE NOT ALMOST EQUAL TO',
        value: '⪹',
        codepoint: 10937,
      },
      {
        name: 'SUCCEEDS ABOVE NOT ALMOST EQUAL TO',
        value: '⪺',
        codepoint: 10938,
      },
      {
        name: 'DOUBLE PRECEDES',
        value: '⪻',
        codepoint: 10939,
      },
      {
        name: 'DOUBLE SUCCEEDS',
        value: '⪼',
        codepoint: 10940,
      },
      {
        name: 'SUBSET WITH DOT',
        value: '⪽',
        codepoint: 10941,
      },
      {
        name: 'SUPERSET WITH DOT',
        value: '⪾',
        codepoint: 10942,
      },
      {
        name: 'SUBSET WITH PLUS SIGN BELOW',
        value: '⪿',
        codepoint: 10943,
      },
      {
        name: 'SUPERSET WITH PLUS SIGN BELOW',
        value: '⫀',
        codepoint: 10944,
      },
      {
        name: 'SUBSET WITH MULTIPLICATION SIGN BELOW',
        value: '⫁',
        codepoint: 10945,
      },
      {
        name: 'SUPERSET WITH MULTIPLICATION SIGN BELOW',
        value: '⫂',
        codepoint: 10946,
      },
      {
        name: 'SUBSET OF OR EQUAL TO WITH DOT ABOVE',
        value: '⫃',
        codepoint: 10947,
      },
      {
        name: 'SUPERSET OF OR EQUAL TO WITH DOT ABOVE',
        value: '⫄',
        codepoint: 10948,
      },
      {
        name: 'SUBSET OF ABOVE EQUALS SIGN',
        value: '⫅',
        codepoint: 10949,
      },
      {
        name: 'SUPERSET OF ABOVE EQUALS SIGN',
        value: '⫆',
        codepoint: 10950,
      },
      {
        name: 'SUBSET OF ABOVE TILDE OPERATOR',
        value: '⫇',
        codepoint: 10951,
      },
      {
        name: 'SUPERSET OF ABOVE TILDE OPERATOR',
        value: '⫈',
        codepoint: 10952,
      },
      {
        name: 'SUBSET OF ABOVE ALMOST EQUAL TO',
        value: '⫉',
        codepoint: 10953,
      },
      {
        name: 'SUPERSET OF ABOVE ALMOST EQUAL TO',
        value: '⫊',
        codepoint: 10954,
      },
      {
        name: 'SUBSET OF ABOVE NOT EQUAL TO',
        value: '⫋',
        codepoint: 10955,
      },
      {
        name: 'SUPERSET OF ABOVE NOT EQUAL TO',
        value: '⫌',
        codepoint: 10956,
      },
      {
        name: 'SQUARE LEFT OPEN BOX OPERATOR',
        value: '⫍',
        codepoint: 10957,
      },
      {
        name: 'SQUARE RIGHT OPEN BOX OPERATOR',
        value: '⫎',
        codepoint: 10958,
      },
      {
        name: 'CLOSED SUBSET',
        value: '⫏',
        codepoint: 10959,
      },
      {
        name: 'CLOSED SUPERSET',
        value: '⫐',
        codepoint: 10960,
      },
      {
        name: 'CLOSED SUBSET OR EQUAL TO',
        value: '⫑',
        codepoint: 10961,
      },
      {
        name: 'CLOSED SUPERSET OR EQUAL TO',
        value: '⫒',
        codepoint: 10962,
      },
      {
        name: 'SUBSET ABOVE SUPERSET',
        value: '⫓',
        codepoint: 10963,
      },
      {
        name: 'SUPERSET ABOVE SUBSET',
        value: '⫔',
        codepoint: 10964,
      },
      {
        name: 'SUBSET ABOVE SUBSET',
        value: '⫕',
        codepoint: 10965,
      },
      {
        name: 'SUPERSET ABOVE SUPERSET',
        value: '⫖',
        codepoint: 10966,
      },
      {
        name: 'SUPERSET BESIDE SUBSET',
        value: '⫗',
        codepoint: 10967,
      },
      {
        name: 'SUPERSET BESIDE AND JOINED BY DASH WITH SUBSET',
        value: '⫘',
        codepoint: 10968,
      },
      {
        name: 'ELEMENT OF OPENING DOWNWARDS',
        value: '⫙',
        codepoint: 10969,
      },
      {
        name: 'PITCHFORK WITH TEE TOP',
        value: '⫚',
        codepoint: 10970,
      },
      {
        name: 'TRANSVERSAL INTERSECTION',
        value: '⫛',
        codepoint: 10971,
      },
      {
        name: 'FORKING',
        value: '⫝̸',
        codepoint: 10972,
      },
      {
        name: 'NONFORKING',
        value: '⫝',
        codepoint: 10973,
      },
      {
        name: 'SHORT LEFT TACK',
        value: '⫞',
        codepoint: 10974,
      },
      {
        name: 'SHORT DOWN TACK',
        value: '⫟',
        codepoint: 10975,
      },
      {
        name: 'SHORT UP TACK',
        value: '⫠',
        codepoint: 10976,
      },
      {
        name: 'PERPENDICULAR WITH S',
        value: '⫡',
        codepoint: 10977,
      },
      {
        name: 'VERTICAL BAR TRIPLE RIGHT TURNSTILE',
        value: '⫢',
        codepoint: 10978,
      },
      {
        name: 'DOUBLE VERTICAL BAR LEFT TURNSTILE',
        value: '⫣',
        codepoint: 10979,
      },
      {
        name: 'VERTICAL BAR DOUBLE LEFT TURNSTILE',
        value: '⫤',
        codepoint: 10980,
      },
      {
        name: 'DOUBLE VERTICAL BAR DOUBLE LEFT TURNSTILE',
        value: '⫥',
        codepoint: 10981,
      },
      {
        name: 'LONG DASH FROM LEFT MEMBER OF DOUBLE VERTICAL',
        value: '⫦',
        codepoint: 10982,
      },
      {
        name: 'SHORT DOWN TACK WITH OVERBAR',
        value: '⫧',
        codepoint: 10983,
      },
      {
        name: 'SHORT UP TACK WITH UNDERBAR',
        value: '⫨',
        codepoint: 10984,
      },
      {
        name: 'SHORT UP TACK ABOVE SHORT DOWN TACK',
        value: '⫩',
        codepoint: 10985,
      },
      {
        name: 'DOUBLE DOWN TACK',
        value: '⫪',
        codepoint: 10986,
      },
      {
        name: 'DOUBLE UP TACK',
        value: '⫫',
        codepoint: 10987,
      },
      {
        name: 'DOUBLE STROKE NOT SIGN',
        value: '⫬',
        codepoint: 10988,
      },
      {
        name: 'REVERSED DOUBLE STROKE NOT SIGN',
        value: '⫭',
        codepoint: 10989,
      },
      {
        name: 'DOES NOT DIVIDE WITH REVERSED NEGATION SLASH',
        value: '⫮',
        codepoint: 10990,
      },
      {
        name: 'VERTICAL LINE WITH CIRCLE ABOVE',
        value: '⫯',
        codepoint: 10991,
      },
      {
        name: 'VERTICAL LINE WITH CIRCLE BELOW',
        value: '⫰',
        codepoint: 10992,
      },
      {
        name: 'DOWN TACK WITH CIRCLE BELOW',
        value: '⫱',
        codepoint: 10993,
      },
      {
        name: 'PARALLEL WITH HORIZONTAL STROKE',
        value: '⫲',
        codepoint: 10994,
      },
      {
        name: 'PARALLEL WITH TILDE OPERATOR',
        value: '⫳',
        codepoint: 10995,
      },
      {
        name: 'TRIPLE VERTICAL BAR BINARY RELATION',
        value: '⫴',
        codepoint: 10996,
      },
      {
        name: 'TRIPLE VERTICAL BAR WITH HORIZONTAL STROKE',
        value: '⫵',
        codepoint: 10997,
      },
      {
        name: 'TRIPLE COLON OPERATOR',
        value: '⫶',
        codepoint: 10998,
      },
      {
        name: 'TRIPLE NESTED LESS-THAN',
        value: '⫷',
        codepoint: 10999,
      },
      {
        name: 'TRIPLE NESTED GREATER-THAN',
        value: '⫸',
        codepoint: 11000,
      },
      {
        name: 'DOUBLE-LINE SLANTED LESS-THAN OR EQUAL TO',
        value: '⫹',
        codepoint: 11001,
      },
      {
        name: 'DOUBLE-LINE SLANTED GREATER-THAN OR EQUAL TO',
        value: '⫺',
        codepoint: 11002,
      },
      {
        name: 'TRIPLE SOLIDUS BINARY RELATION',
        value: '⫻',
        codepoint: 11003,
      },
      {
        name: 'LARGE TRIPLE VERTICAL BAR OPERATOR',
        value: '⫼',
        codepoint: 11004,
      },
      {
        name: 'DOUBLE SOLIDUS OPERATOR',
        value: '⫽',
        codepoint: 11005,
      },
      {
        name: 'WHITE VERTICAL BAR',
        value: '⫾',
        codepoint: 11006,
      },
      {
        name: 'N-ARY WHITE VERTICAL BAR',
        value: '⫿',
        codepoint: 11007,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL A',
        value: '𝐀',
        codepoint: 119808,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL B',
        value: '𝐁',
        codepoint: 119809,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL C',
        value: '𝐂',
        codepoint: 119810,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL D',
        value: '𝐃',
        codepoint: 119811,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL E',
        value: '𝐄',
        codepoint: 119812,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL F',
        value: '𝐅',
        codepoint: 119813,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL G',
        value: '𝐆',
        codepoint: 119814,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL H',
        value: '𝐇',
        codepoint: 119815,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL I',
        value: '𝐈',
        codepoint: 119816,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL J',
        value: '𝐉',
        codepoint: 119817,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL K',
        value: '𝐊',
        codepoint: 119818,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL L',
        value: '𝐋',
        codepoint: 119819,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL M',
        value: '𝐌',
        codepoint: 119820,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL N',
        value: '𝐍',
        codepoint: 119821,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL O',
        value: '𝐎',
        codepoint: 119822,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL P',
        value: '𝐏',
        codepoint: 119823,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL Q',
        value: '𝐐',
        codepoint: 119824,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL R',
        value: '𝐑',
        codepoint: 119825,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL S',
        value: '𝐒',
        codepoint: 119826,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL T',
        value: '𝐓',
        codepoint: 119827,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL U',
        value: '𝐔',
        codepoint: 119828,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL V',
        value: '𝐕',
        codepoint: 119829,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL W',
        value: '𝐖',
        codepoint: 119830,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL X',
        value: '𝐗',
        codepoint: 119831,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL Y',
        value: '𝐘',
        codepoint: 119832,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL Z',
        value: '𝐙',
        codepoint: 119833,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL A',
        value: '𝐚',
        codepoint: 119834,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL B',
        value: '𝐛',
        codepoint: 119835,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL C',
        value: '𝐜',
        codepoint: 119836,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL D',
        value: '𝐝',
        codepoint: 119837,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL E',
        value: '𝐞',
        codepoint: 119838,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL F',
        value: '𝐟',
        codepoint: 119839,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL G',
        value: '𝐠',
        codepoint: 119840,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL H',
        value: '𝐡',
        codepoint: 119841,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL I',
        value: '𝐢',
        codepoint: 119842,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL J',
        value: '𝐣',
        codepoint: 119843,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL K',
        value: '𝐤',
        codepoint: 119844,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL L',
        value: '𝐥',
        codepoint: 119845,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL M',
        value: '𝐦',
        codepoint: 119846,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL N',
        value: '𝐧',
        codepoint: 119847,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL O',
        value: '𝐨',
        codepoint: 119848,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL P',
        value: '𝐩',
        codepoint: 119849,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL Q',
        value: '𝐪',
        codepoint: 119850,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL R',
        value: '𝐫',
        codepoint: 119851,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL S',
        value: '𝐬',
        codepoint: 119852,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL T',
        value: '𝐭',
        codepoint: 119853,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL U',
        value: '𝐮',
        codepoint: 119854,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL V',
        value: '𝐯',
        codepoint: 119855,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL W',
        value: '𝐰',
        codepoint: 119856,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL X',
        value: '𝐱',
        codepoint: 119857,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL Y',
        value: '𝐲',
        codepoint: 119858,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL Z',
        value: '𝐳',
        codepoint: 119859,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL A',
        value: '𝐴',
        codepoint: 119860,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL B',
        value: '𝐵',
        codepoint: 119861,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL C',
        value: '𝐶',
        codepoint: 119862,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL D',
        value: '𝐷',
        codepoint: 119863,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL E',
        value: '𝐸',
        codepoint: 119864,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL F',
        value: '𝐹',
        codepoint: 119865,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL G',
        value: '𝐺',
        codepoint: 119866,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL H',
        value: '𝐻',
        codepoint: 119867,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL I',
        value: '𝐼',
        codepoint: 119868,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL J',
        value: '𝐽',
        codepoint: 119869,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL K',
        value: '𝐾',
        codepoint: 119870,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL L',
        value: '𝐿',
        codepoint: 119871,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL M',
        value: '𝑀',
        codepoint: 119872,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL N',
        value: '𝑁',
        codepoint: 119873,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL O',
        value: '𝑂',
        codepoint: 119874,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL P',
        value: '𝑃',
        codepoint: 119875,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL Q',
        value: '𝑄',
        codepoint: 119876,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL R',
        value: '𝑅',
        codepoint: 119877,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL S',
        value: '𝑆',
        codepoint: 119878,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL T',
        value: '𝑇',
        codepoint: 119879,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL U',
        value: '𝑈',
        codepoint: 119880,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL V',
        value: '𝑉',
        codepoint: 119881,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL W',
        value: '𝑊',
        codepoint: 119882,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL X',
        value: '𝑋',
        codepoint: 119883,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL Y',
        value: '𝑌',
        codepoint: 119884,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL Z',
        value: '𝑍',
        codepoint: 119885,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL A',
        value: '𝑎',
        codepoint: 119886,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL B',
        value: '𝑏',
        codepoint: 119887,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL C',
        value: '𝑐',
        codepoint: 119888,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL D',
        value: '𝑑',
        codepoint: 119889,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL E',
        value: '𝑒',
        codepoint: 119890,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL F',
        value: '𝑓',
        codepoint: 119891,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL G',
        value: '𝑔',
        codepoint: 119892,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL I',
        value: '𝑖',
        codepoint: 119894,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL J',
        value: '𝑗',
        codepoint: 119895,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL K',
        value: '𝑘',
        codepoint: 119896,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL L',
        value: '𝑙',
        codepoint: 119897,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL M',
        value: '𝑚',
        codepoint: 119898,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL N',
        value: '𝑛',
        codepoint: 119899,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL O',
        value: '𝑜',
        codepoint: 119900,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL P',
        value: '𝑝',
        codepoint: 119901,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL Q',
        value: '𝑞',
        codepoint: 119902,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL R',
        value: '𝑟',
        codepoint: 119903,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL S',
        value: '𝑠',
        codepoint: 119904,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL T',
        value: '𝑡',
        codepoint: 119905,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL U',
        value: '𝑢',
        codepoint: 119906,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL V',
        value: '𝑣',
        codepoint: 119907,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL W',
        value: '𝑤',
        codepoint: 119908,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL X',
        value: '𝑥',
        codepoint: 119909,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL Y',
        value: '𝑦',
        codepoint: 119910,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL Z',
        value: '𝑧',
        codepoint: 119911,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL A',
        value: '𝑨',
        codepoint: 119912,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL B',
        value: '𝑩',
        codepoint: 119913,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL C',
        value: '𝑪',
        codepoint: 119914,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL D',
        value: '𝑫',
        codepoint: 119915,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL E',
        value: '𝑬',
        codepoint: 119916,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL F',
        value: '𝑭',
        codepoint: 119917,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL G',
        value: '𝑮',
        codepoint: 119918,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL H',
        value: '𝑯',
        codepoint: 119919,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL I',
        value: '𝑰',
        codepoint: 119920,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL J',
        value: '𝑱',
        codepoint: 119921,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL K',
        value: '𝑲',
        codepoint: 119922,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL L',
        value: '𝑳',
        codepoint: 119923,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL M',
        value: '𝑴',
        codepoint: 119924,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL N',
        value: '𝑵',
        codepoint: 119925,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL O',
        value: '𝑶',
        codepoint: 119926,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL P',
        value: '𝑷',
        codepoint: 119927,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL Q',
        value: '𝑸',
        codepoint: 119928,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL R',
        value: '𝑹',
        codepoint: 119929,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL S',
        value: '𝑺',
        codepoint: 119930,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL T',
        value: '𝑻',
        codepoint: 119931,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL U',
        value: '𝑼',
        codepoint: 119932,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL V',
        value: '𝑽',
        codepoint: 119933,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL W',
        value: '𝑾',
        codepoint: 119934,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL X',
        value: '𝑿',
        codepoint: 119935,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL Y',
        value: '𝒀',
        codepoint: 119936,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL Z',
        value: '𝒁',
        codepoint: 119937,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL A',
        value: '𝒂',
        codepoint: 119938,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL B',
        value: '𝒃',
        codepoint: 119939,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL C',
        value: '𝒄',
        codepoint: 119940,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL D',
        value: '𝒅',
        codepoint: 119941,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL E',
        value: '𝒆',
        codepoint: 119942,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL F',
        value: '𝒇',
        codepoint: 119943,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL G',
        value: '𝒈',
        codepoint: 119944,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL H',
        value: '𝒉',
        codepoint: 119945,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL I',
        value: '𝒊',
        codepoint: 119946,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL J',
        value: '𝒋',
        codepoint: 119947,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL K',
        value: '𝒌',
        codepoint: 119948,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL L',
        value: '𝒍',
        codepoint: 119949,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL M',
        value: '𝒎',
        codepoint: 119950,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL N',
        value: '𝒏',
        codepoint: 119951,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL O',
        value: '𝒐',
        codepoint: 119952,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL P',
        value: '𝒑',
        codepoint: 119953,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL Q',
        value: '𝒒',
        codepoint: 119954,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL R',
        value: '𝒓',
        codepoint: 119955,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL S',
        value: '𝒔',
        codepoint: 119956,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL T',
        value: '𝒕',
        codepoint: 119957,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL U',
        value: '𝒖',
        codepoint: 119958,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL V',
        value: '𝒗',
        codepoint: 119959,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL W',
        value: '𝒘',
        codepoint: 119960,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL X',
        value: '𝒙',
        codepoint: 119961,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL Y',
        value: '𝒚',
        codepoint: 119962,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL Z',
        value: '𝒛',
        codepoint: 119963,
      },
      {
        name: 'MATHEMATICAL SCRIPT CAPITAL A',
        value: '𝒜',
        codepoint: 119964,
      },
      {
        name: 'MATHEMATICAL SCRIPT CAPITAL C',
        value: '𝒞',
        codepoint: 119966,
      },
      {
        name: 'MATHEMATICAL SCRIPT CAPITAL D',
        value: '𝒟',
        codepoint: 119967,
      },
      {
        name: 'MATHEMATICAL SCRIPT CAPITAL G',
        value: '𝒢',
        codepoint: 119970,
      },
      {
        name: 'MATHEMATICAL SCRIPT CAPITAL J',
        value: '𝒥',
        codepoint: 119973,
      },
      {
        name: 'MATHEMATICAL SCRIPT CAPITAL K',
        value: '𝒦',
        codepoint: 119974,
      },
      {
        name: 'MATHEMATICAL SCRIPT CAPITAL N',
        value: '𝒩',
        codepoint: 119977,
      },
      {
        name: 'MATHEMATICAL SCRIPT CAPITAL O',
        value: '𝒪',
        codepoint: 119978,
      },
      {
        name: 'MATHEMATICAL SCRIPT CAPITAL P',
        value: '𝒫',
        codepoint: 119979,
      },
      {
        name: 'MATHEMATICAL SCRIPT CAPITAL Q',
        value: '𝒬',
        codepoint: 119980,
      },
      {
        name: 'MATHEMATICAL SCRIPT CAPITAL S',
        value: '𝒮',
        codepoint: 119982,
      },
      {
        name: 'MATHEMATICAL SCRIPT CAPITAL T',
        value: '𝒯',
        codepoint: 119983,
      },
      {
        name: 'MATHEMATICAL SCRIPT CAPITAL U',
        value: '𝒰',
        codepoint: 119984,
      },
      {
        name: 'MATHEMATICAL SCRIPT CAPITAL V',
        value: '𝒱',
        codepoint: 119985,
      },
      {
        name: 'MATHEMATICAL SCRIPT CAPITAL W',
        value: '𝒲',
        codepoint: 119986,
      },
      {
        name: 'MATHEMATICAL SCRIPT CAPITAL X',
        value: '𝒳',
        codepoint: 119987,
      },
      {
        name: 'MATHEMATICAL SCRIPT CAPITAL Y',
        value: '𝒴',
        codepoint: 119988,
      },
      {
        name: 'MATHEMATICAL SCRIPT CAPITAL Z',
        value: '𝒵',
        codepoint: 119989,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL A',
        value: '𝒶',
        codepoint: 119990,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL B',
        value: '𝒷',
        codepoint: 119991,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL C',
        value: '𝒸',
        codepoint: 119992,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL D',
        value: '𝒹',
        codepoint: 119993,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL F',
        value: '𝒻',
        codepoint: 119995,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL H',
        value: '𝒽',
        codepoint: 119997,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL I',
        value: '𝒾',
        codepoint: 119998,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL J',
        value: '𝒿',
        codepoint: 119999,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL K',
        value: '𝓀',
        codepoint: 120000,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL L',
        value: '𝓁',
        codepoint: 120001,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL M',
        value: '𝓂',
        codepoint: 120002,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL N',
        value: '𝓃',
        codepoint: 120003,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL P',
        value: '𝓅',
        codepoint: 120005,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL Q',
        value: '𝓆',
        codepoint: 120006,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL R',
        value: '𝓇',
        codepoint: 120007,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL S',
        value: '𝓈',
        codepoint: 120008,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL T',
        value: '𝓉',
        codepoint: 120009,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL U',
        value: '𝓊',
        codepoint: 120010,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL V',
        value: '𝓋',
        codepoint: 120011,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL W',
        value: '𝓌',
        codepoint: 120012,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL X',
        value: '𝓍',
        codepoint: 120013,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL Y',
        value: '𝓎',
        codepoint: 120014,
      },
      {
        name: 'MATHEMATICAL SCRIPT SMALL Z',
        value: '𝓏',
        codepoint: 120015,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL A',
        value: '𝓐',
        codepoint: 120016,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL B',
        value: '𝓑',
        codepoint: 120017,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL C',
        value: '𝓒',
        codepoint: 120018,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL D',
        value: '𝓓',
        codepoint: 120019,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL E',
        value: '𝓔',
        codepoint: 120020,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL F',
        value: '𝓕',
        codepoint: 120021,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL G',
        value: '𝓖',
        codepoint: 120022,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL H',
        value: '𝓗',
        codepoint: 120023,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL I',
        value: '𝓘',
        codepoint: 120024,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL J',
        value: '𝓙',
        codepoint: 120025,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL K',
        value: '𝓚',
        codepoint: 120026,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL L',
        value: '𝓛',
        codepoint: 120027,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL M',
        value: '𝓜',
        codepoint: 120028,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL N',
        value: '𝓝',
        codepoint: 120029,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL O',
        value: '𝓞',
        codepoint: 120030,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL P',
        value: '𝓟',
        codepoint: 120031,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL Q',
        value: '𝓠',
        codepoint: 120032,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL R',
        value: '𝓡',
        codepoint: 120033,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL S',
        value: '𝓢',
        codepoint: 120034,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL T',
        value: '𝓣',
        codepoint: 120035,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL U',
        value: '𝓤',
        codepoint: 120036,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL V',
        value: '𝓥',
        codepoint: 120037,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL W',
        value: '𝓦',
        codepoint: 120038,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL X',
        value: '𝓧',
        codepoint: 120039,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL Y',
        value: '𝓨',
        codepoint: 120040,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT CAPITAL Z',
        value: '𝓩',
        codepoint: 120041,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL A',
        value: '𝓪',
        codepoint: 120042,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL B',
        value: '𝓫',
        codepoint: 120043,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL C',
        value: '𝓬',
        codepoint: 120044,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL D',
        value: '𝓭',
        codepoint: 120045,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL E',
        value: '𝓮',
        codepoint: 120046,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL F',
        value: '𝓯',
        codepoint: 120047,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL G',
        value: '𝓰',
        codepoint: 120048,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL H',
        value: '𝓱',
        codepoint: 120049,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL I',
        value: '𝓲',
        codepoint: 120050,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL J',
        value: '𝓳',
        codepoint: 120051,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL K',
        value: '𝓴',
        codepoint: 120052,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL L',
        value: '𝓵',
        codepoint: 120053,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL M',
        value: '𝓶',
        codepoint: 120054,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL N',
        value: '𝓷',
        codepoint: 120055,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL O',
        value: '𝓸',
        codepoint: 120056,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL P',
        value: '𝓹',
        codepoint: 120057,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL Q',
        value: '𝓺',
        codepoint: 120058,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL R',
        value: '𝓻',
        codepoint: 120059,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL S',
        value: '𝓼',
        codepoint: 120060,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL T',
        value: '𝓽',
        codepoint: 120061,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL U',
        value: '𝓾',
        codepoint: 120062,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL V',
        value: '𝓿',
        codepoint: 120063,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL W',
        value: '𝔀',
        codepoint: 120064,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL X',
        value: '𝔁',
        codepoint: 120065,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL Y',
        value: '𝔂',
        codepoint: 120066,
      },
      {
        name: 'MATHEMATICAL BOLD SCRIPT SMALL Z',
        value: '𝔃',
        codepoint: 120067,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL A',
        value: '𝔄',
        codepoint: 120068,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL B',
        value: '𝔅',
        codepoint: 120069,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL D',
        value: '𝔇',
        codepoint: 120071,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL E',
        value: '𝔈',
        codepoint: 120072,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL F',
        value: '𝔉',
        codepoint: 120073,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL G',
        value: '𝔊',
        codepoint: 120074,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL J',
        value: '𝔍',
        codepoint: 120077,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL K',
        value: '𝔎',
        codepoint: 120078,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL L',
        value: '𝔏',
        codepoint: 120079,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL M',
        value: '𝔐',
        codepoint: 120080,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL N',
        value: '𝔑',
        codepoint: 120081,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL O',
        value: '𝔒',
        codepoint: 120082,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL P',
        value: '𝔓',
        codepoint: 120083,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL Q',
        value: '𝔔',
        codepoint: 120084,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL S',
        value: '𝔖',
        codepoint: 120086,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL T',
        value: '𝔗',
        codepoint: 120087,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL U',
        value: '𝔘',
        codepoint: 120088,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL V',
        value: '𝔙',
        codepoint: 120089,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL W',
        value: '𝔚',
        codepoint: 120090,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL X',
        value: '𝔛',
        codepoint: 120091,
      },
      {
        name: 'MATHEMATICAL FRAKTUR CAPITAL Y',
        value: '𝔜',
        codepoint: 120092,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL A',
        value: '𝔞',
        codepoint: 120094,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL B',
        value: '𝔟',
        codepoint: 120095,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL C',
        value: '𝔠',
        codepoint: 120096,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL D',
        value: '𝔡',
        codepoint: 120097,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL E',
        value: '𝔢',
        codepoint: 120098,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL F',
        value: '𝔣',
        codepoint: 120099,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL G',
        value: '𝔤',
        codepoint: 120100,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL H',
        value: '𝔥',
        codepoint: 120101,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL I',
        value: '𝔦',
        codepoint: 120102,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL J',
        value: '𝔧',
        codepoint: 120103,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL K',
        value: '𝔨',
        codepoint: 120104,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL L',
        value: '𝔩',
        codepoint: 120105,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL M',
        value: '𝔪',
        codepoint: 120106,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL N',
        value: '𝔫',
        codepoint: 120107,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL O',
        value: '𝔬',
        codepoint: 120108,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL P',
        value: '𝔭',
        codepoint: 120109,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL Q',
        value: '𝔮',
        codepoint: 120110,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL R',
        value: '𝔯',
        codepoint: 120111,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL S',
        value: '𝔰',
        codepoint: 120112,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL T',
        value: '𝔱',
        codepoint: 120113,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL U',
        value: '𝔲',
        codepoint: 120114,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL V',
        value: '𝔳',
        codepoint: 120115,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL W',
        value: '𝔴',
        codepoint: 120116,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL X',
        value: '𝔵',
        codepoint: 120117,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL Y',
        value: '𝔶',
        codepoint: 120118,
      },
      {
        name: 'MATHEMATICAL FRAKTUR SMALL Z',
        value: '𝔷',
        codepoint: 120119,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK CAPITAL A',
        value: '𝔸',
        codepoint: 120120,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK CAPITAL B',
        value: '𝔹',
        codepoint: 120121,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK CAPITAL D',
        value: '𝔻',
        codepoint: 120123,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK CAPITAL E',
        value: '𝔼',
        codepoint: 120124,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK CAPITAL F',
        value: '𝔽',
        codepoint: 120125,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK CAPITAL G',
        value: '𝔾',
        codepoint: 120126,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK CAPITAL I',
        value: '𝕀',
        codepoint: 120128,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK CAPITAL J',
        value: '𝕁',
        codepoint: 120129,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK CAPITAL K',
        value: '𝕂',
        codepoint: 120130,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK CAPITAL L',
        value: '𝕃',
        codepoint: 120131,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK CAPITAL M',
        value: '𝕄',
        codepoint: 120132,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK CAPITAL O',
        value: '𝕆',
        codepoint: 120134,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK CAPITAL S',
        value: '𝕊',
        codepoint: 120138,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK CAPITAL T',
        value: '𝕋',
        codepoint: 120139,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK CAPITAL U',
        value: '𝕌',
        codepoint: 120140,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK CAPITAL V',
        value: '𝕍',
        codepoint: 120141,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK CAPITAL W',
        value: '𝕎',
        codepoint: 120142,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK CAPITAL X',
        value: '𝕏',
        codepoint: 120143,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK CAPITAL Y',
        value: '𝕐',
        codepoint: 120144,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL A',
        value: '𝕒',
        codepoint: 120146,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL B',
        value: '𝕓',
        codepoint: 120147,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL C',
        value: '𝕔',
        codepoint: 120148,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL D',
        value: '𝕕',
        codepoint: 120149,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL E',
        value: '𝕖',
        codepoint: 120150,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL F',
        value: '𝕗',
        codepoint: 120151,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL G',
        value: '𝕘',
        codepoint: 120152,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL H',
        value: '𝕙',
        codepoint: 120153,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL I',
        value: '𝕚',
        codepoint: 120154,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL J',
        value: '𝕛',
        codepoint: 120155,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL K',
        value: '𝕜',
        codepoint: 120156,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL L',
        value: '𝕝',
        codepoint: 120157,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL M',
        value: '𝕞',
        codepoint: 120158,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL N',
        value: '𝕟',
        codepoint: 120159,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL O',
        value: '𝕠',
        codepoint: 120160,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL P',
        value: '𝕡',
        codepoint: 120161,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL Q',
        value: '𝕢',
        codepoint: 120162,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL R',
        value: '𝕣',
        codepoint: 120163,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL S',
        value: '𝕤',
        codepoint: 120164,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL T',
        value: '𝕥',
        codepoint: 120165,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL U',
        value: '𝕦',
        codepoint: 120166,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL V',
        value: '𝕧',
        codepoint: 120167,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL W',
        value: '𝕨',
        codepoint: 120168,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL X',
        value: '𝕩',
        codepoint: 120169,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL Y',
        value: '𝕪',
        codepoint: 120170,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK SMALL Z',
        value: '𝕫',
        codepoint: 120171,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL A',
        value: '𝕬',
        codepoint: 120172,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL B',
        value: '𝕭',
        codepoint: 120173,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL C',
        value: '𝕮',
        codepoint: 120174,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL D',
        value: '𝕯',
        codepoint: 120175,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL E',
        value: '𝕰',
        codepoint: 120176,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL F',
        value: '𝕱',
        codepoint: 120177,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL G',
        value: '𝕲',
        codepoint: 120178,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL H',
        value: '𝕳',
        codepoint: 120179,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL I',
        value: '𝕴',
        codepoint: 120180,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL J',
        value: '𝕵',
        codepoint: 120181,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL K',
        value: '𝕶',
        codepoint: 120182,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL L',
        value: '𝕷',
        codepoint: 120183,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL M',
        value: '𝕸',
        codepoint: 120184,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL N',
        value: '𝕹',
        codepoint: 120185,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL O',
        value: '𝕺',
        codepoint: 120186,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL P',
        value: '𝕻',
        codepoint: 120187,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL Q',
        value: '𝕼',
        codepoint: 120188,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL R',
        value: '𝕽',
        codepoint: 120189,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL S',
        value: '𝕾',
        codepoint: 120190,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL T',
        value: '𝕿',
        codepoint: 120191,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL U',
        value: '𝖀',
        codepoint: 120192,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL V',
        value: '𝖁',
        codepoint: 120193,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL W',
        value: '𝖂',
        codepoint: 120194,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL X',
        value: '𝖃',
        codepoint: 120195,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL Y',
        value: '𝖄',
        codepoint: 120196,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR CAPITAL Z',
        value: '𝖅',
        codepoint: 120197,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL A',
        value: '𝖆',
        codepoint: 120198,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL B',
        value: '𝖇',
        codepoint: 120199,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL C',
        value: '𝖈',
        codepoint: 120200,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL D',
        value: '𝖉',
        codepoint: 120201,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL E',
        value: '𝖊',
        codepoint: 120202,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL F',
        value: '𝖋',
        codepoint: 120203,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL G',
        value: '𝖌',
        codepoint: 120204,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL H',
        value: '𝖍',
        codepoint: 120205,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL I',
        value: '𝖎',
        codepoint: 120206,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL J',
        value: '𝖏',
        codepoint: 120207,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL K',
        value: '𝖐',
        codepoint: 120208,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL L',
        value: '𝖑',
        codepoint: 120209,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL M',
        value: '𝖒',
        codepoint: 120210,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL N',
        value: '𝖓',
        codepoint: 120211,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL O',
        value: '𝖔',
        codepoint: 120212,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL P',
        value: '𝖕',
        codepoint: 120213,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL Q',
        value: '𝖖',
        codepoint: 120214,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL R',
        value: '𝖗',
        codepoint: 120215,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL S',
        value: '𝖘',
        codepoint: 120216,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL T',
        value: '𝖙',
        codepoint: 120217,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL U',
        value: '𝖚',
        codepoint: 120218,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL V',
        value: '𝖛',
        codepoint: 120219,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL W',
        value: '𝖜',
        codepoint: 120220,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL X',
        value: '𝖝',
        codepoint: 120221,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL Y',
        value: '𝖞',
        codepoint: 120222,
      },
      {
        name: 'MATHEMATICAL BOLD FRAKTUR SMALL Z',
        value: '𝖟',
        codepoint: 120223,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL A',
        value: '𝖠',
        codepoint: 120224,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL B',
        value: '𝖡',
        codepoint: 120225,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL C',
        value: '𝖢',
        codepoint: 120226,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL D',
        value: '𝖣',
        codepoint: 120227,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL E',
        value: '𝖤',
        codepoint: 120228,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL F',
        value: '𝖥',
        codepoint: 120229,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL G',
        value: '𝖦',
        codepoint: 120230,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL H',
        value: '𝖧',
        codepoint: 120231,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL I',
        value: '𝖨',
        codepoint: 120232,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL J',
        value: '𝖩',
        codepoint: 120233,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL K',
        value: '𝖪',
        codepoint: 120234,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL L',
        value: '𝖫',
        codepoint: 120235,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL M',
        value: '𝖬',
        codepoint: 120236,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL N',
        value: '𝖭',
        codepoint: 120237,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL O',
        value: '𝖮',
        codepoint: 120238,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL P',
        value: '𝖯',
        codepoint: 120239,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL Q',
        value: '𝖰',
        codepoint: 120240,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL R',
        value: '𝖱',
        codepoint: 120241,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL S',
        value: '𝖲',
        codepoint: 120242,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL T',
        value: '𝖳',
        codepoint: 120243,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL U',
        value: '𝖴',
        codepoint: 120244,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL V',
        value: '𝖵',
        codepoint: 120245,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL W',
        value: '𝖶',
        codepoint: 120246,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL X',
        value: '𝖷',
        codepoint: 120247,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL Y',
        value: '𝖸',
        codepoint: 120248,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF CAPITAL Z',
        value: '𝖹',
        codepoint: 120249,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL A',
        value: '𝖺',
        codepoint: 120250,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL B',
        value: '𝖻',
        codepoint: 120251,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL C',
        value: '𝖼',
        codepoint: 120252,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL D',
        value: '𝖽',
        codepoint: 120253,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL E',
        value: '𝖾',
        codepoint: 120254,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL F',
        value: '𝖿',
        codepoint: 120255,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL G',
        value: '𝗀',
        codepoint: 120256,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL H',
        value: '𝗁',
        codepoint: 120257,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL I',
        value: '𝗂',
        codepoint: 120258,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL J',
        value: '𝗃',
        codepoint: 120259,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL K',
        value: '𝗄',
        codepoint: 120260,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL L',
        value: '𝗅',
        codepoint: 120261,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL M',
        value: '𝗆',
        codepoint: 120262,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL N',
        value: '𝗇',
        codepoint: 120263,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL O',
        value: '𝗈',
        codepoint: 120264,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL P',
        value: '𝗉',
        codepoint: 120265,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL Q',
        value: '𝗊',
        codepoint: 120266,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL R',
        value: '𝗋',
        codepoint: 120267,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL S',
        value: '𝗌',
        codepoint: 120268,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL T',
        value: '𝗍',
        codepoint: 120269,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL U',
        value: '𝗎',
        codepoint: 120270,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL V',
        value: '𝗏',
        codepoint: 120271,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL W',
        value: '𝗐',
        codepoint: 120272,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL X',
        value: '𝗑',
        codepoint: 120273,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL Y',
        value: '𝗒',
        codepoint: 120274,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF SMALL Z',
        value: '𝗓',
        codepoint: 120275,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL A',
        value: '𝗔',
        codepoint: 120276,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL B',
        value: '𝗕',
        codepoint: 120277,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL C',
        value: '𝗖',
        codepoint: 120278,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL D',
        value: '𝗗',
        codepoint: 120279,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL E',
        value: '𝗘',
        codepoint: 120280,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL F',
        value: '𝗙',
        codepoint: 120281,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL G',
        value: '𝗚',
        codepoint: 120282,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL H',
        value: '𝗛',
        codepoint: 120283,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL I',
        value: '𝗜',
        codepoint: 120284,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL J',
        value: '𝗝',
        codepoint: 120285,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL K',
        value: '𝗞',
        codepoint: 120286,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL L',
        value: '𝗟',
        codepoint: 120287,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL M',
        value: '𝗠',
        codepoint: 120288,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL N',
        value: '𝗡',
        codepoint: 120289,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL O',
        value: '𝗢',
        codepoint: 120290,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL P',
        value: '𝗣',
        codepoint: 120291,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL Q',
        value: '𝗤',
        codepoint: 120292,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL R',
        value: '𝗥',
        codepoint: 120293,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL S',
        value: '𝗦',
        codepoint: 120294,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL T',
        value: '𝗧',
        codepoint: 120295,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL U',
        value: '𝗨',
        codepoint: 120296,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL V',
        value: '𝗩',
        codepoint: 120297,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL W',
        value: '𝗪',
        codepoint: 120298,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL X',
        value: '𝗫',
        codepoint: 120299,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL Y',
        value: '𝗬',
        codepoint: 120300,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL Z',
        value: '𝗭',
        codepoint: 120301,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL A',
        value: '𝗮',
        codepoint: 120302,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL B',
        value: '𝗯',
        codepoint: 120303,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL C',
        value: '𝗰',
        codepoint: 120304,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL D',
        value: '𝗱',
        codepoint: 120305,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL E',
        value: '𝗲',
        codepoint: 120306,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL F',
        value: '𝗳',
        codepoint: 120307,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL G',
        value: '𝗴',
        codepoint: 120308,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL H',
        value: '𝗵',
        codepoint: 120309,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL I',
        value: '𝗶',
        codepoint: 120310,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL J',
        value: '𝗷',
        codepoint: 120311,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL K',
        value: '𝗸',
        codepoint: 120312,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL L',
        value: '𝗹',
        codepoint: 120313,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL M',
        value: '𝗺',
        codepoint: 120314,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL N',
        value: '𝗻',
        codepoint: 120315,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL O',
        value: '𝗼',
        codepoint: 120316,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL P',
        value: '𝗽',
        codepoint: 120317,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL Q',
        value: '𝗾',
        codepoint: 120318,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL R',
        value: '𝗿',
        codepoint: 120319,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL S',
        value: '𝘀',
        codepoint: 120320,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL T',
        value: '𝘁',
        codepoint: 120321,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL U',
        value: '𝘂',
        codepoint: 120322,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL V',
        value: '𝘃',
        codepoint: 120323,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL W',
        value: '𝘄',
        codepoint: 120324,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL X',
        value: '𝘅',
        codepoint: 120325,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL Y',
        value: '𝘆',
        codepoint: 120326,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL Z',
        value: '𝘇',
        codepoint: 120327,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL A',
        value: '𝘈',
        codepoint: 120328,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL B',
        value: '𝘉',
        codepoint: 120329,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL C',
        value: '𝘊',
        codepoint: 120330,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL D',
        value: '𝘋',
        codepoint: 120331,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL E',
        value: '𝘌',
        codepoint: 120332,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL F',
        value: '𝘍',
        codepoint: 120333,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL G',
        value: '𝘎',
        codepoint: 120334,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL H',
        value: '𝘏',
        codepoint: 120335,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL I',
        value: '𝘐',
        codepoint: 120336,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL J',
        value: '𝘑',
        codepoint: 120337,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL K',
        value: '𝘒',
        codepoint: 120338,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL L',
        value: '𝘓',
        codepoint: 120339,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL M',
        value: '𝘔',
        codepoint: 120340,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL N',
        value: '𝘕',
        codepoint: 120341,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL O',
        value: '𝘖',
        codepoint: 120342,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL P',
        value: '𝘗',
        codepoint: 120343,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL Q',
        value: '𝘘',
        codepoint: 120344,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL R',
        value: '𝘙',
        codepoint: 120345,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL S',
        value: '𝘚',
        codepoint: 120346,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL T',
        value: '𝘛',
        codepoint: 120347,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL U',
        value: '𝘜',
        codepoint: 120348,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL V',
        value: '𝘝',
        codepoint: 120349,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL W',
        value: '𝘞',
        codepoint: 120350,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL X',
        value: '𝘟',
        codepoint: 120351,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL Y',
        value: '𝘠',
        codepoint: 120352,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC CAPITAL Z',
        value: '𝘡',
        codepoint: 120353,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL A',
        value: '𝘢',
        codepoint: 120354,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL B',
        value: '𝘣',
        codepoint: 120355,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL C',
        value: '𝘤',
        codepoint: 120356,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL D',
        value: '𝘥',
        codepoint: 120357,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL E',
        value: '𝘦',
        codepoint: 120358,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL F',
        value: '𝘧',
        codepoint: 120359,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL G',
        value: '𝘨',
        codepoint: 120360,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL H',
        value: '𝘩',
        codepoint: 120361,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL I',
        value: '𝘪',
        codepoint: 120362,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL J',
        value: '𝘫',
        codepoint: 120363,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL K',
        value: '𝘬',
        codepoint: 120364,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL L',
        value: '𝘭',
        codepoint: 120365,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL M',
        value: '𝘮',
        codepoint: 120366,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL N',
        value: '𝘯',
        codepoint: 120367,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL O',
        value: '𝘰',
        codepoint: 120368,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL P',
        value: '𝘱',
        codepoint: 120369,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL Q',
        value: '𝘲',
        codepoint: 120370,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL R',
        value: '𝘳',
        codepoint: 120371,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL S',
        value: '𝘴',
        codepoint: 120372,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL T',
        value: '𝘵',
        codepoint: 120373,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL U',
        value: '𝘶',
        codepoint: 120374,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL V',
        value: '𝘷',
        codepoint: 120375,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL W',
        value: '𝘸',
        codepoint: 120376,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL X',
        value: '𝘹',
        codepoint: 120377,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL Y',
        value: '𝘺',
        codepoint: 120378,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF ITALIC SMALL Z',
        value: '𝘻',
        codepoint: 120379,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL A',
        value: '𝘼',
        codepoint: 120380,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL B',
        value: '𝘽',
        codepoint: 120381,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL C',
        value: '𝘾',
        codepoint: 120382,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL D',
        value: '𝘿',
        codepoint: 120383,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL E',
        value: '𝙀',
        codepoint: 120384,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL F',
        value: '𝙁',
        codepoint: 120385,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL G',
        value: '𝙂',
        codepoint: 120386,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL H',
        value: '𝙃',
        codepoint: 120387,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL I',
        value: '𝙄',
        codepoint: 120388,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL J',
        value: '𝙅',
        codepoint: 120389,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL K',
        value: '𝙆',
        codepoint: 120390,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL L',
        value: '𝙇',
        codepoint: 120391,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL M',
        value: '𝙈',
        codepoint: 120392,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL N',
        value: '𝙉',
        codepoint: 120393,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL O',
        value: '𝙊',
        codepoint: 120394,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL P',
        value: '𝙋',
        codepoint: 120395,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL Q',
        value: '𝙌',
        codepoint: 120396,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL R',
        value: '𝙍',
        codepoint: 120397,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL S',
        value: '𝙎',
        codepoint: 120398,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL T',
        value: '𝙏',
        codepoint: 120399,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL U',
        value: '𝙐',
        codepoint: 120400,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL V',
        value: '𝙑',
        codepoint: 120401,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL W',
        value: '𝙒',
        codepoint: 120402,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL X',
        value: '𝙓',
        codepoint: 120403,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL Y',
        value: '𝙔',
        codepoint: 120404,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL Z',
        value: '𝙕',
        codepoint: 120405,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL A',
        value: '𝙖',
        codepoint: 120406,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL B',
        value: '𝙗',
        codepoint: 120407,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL C',
        value: '𝙘',
        codepoint: 120408,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL D',
        value: '𝙙',
        codepoint: 120409,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL E',
        value: '𝙚',
        codepoint: 120410,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL F',
        value: '𝙛',
        codepoint: 120411,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL G',
        value: '𝙜',
        codepoint: 120412,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL H',
        value: '𝙝',
        codepoint: 120413,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL I',
        value: '𝙞',
        codepoint: 120414,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL J',
        value: '𝙟',
        codepoint: 120415,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL K',
        value: '𝙠',
        codepoint: 120416,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL L',
        value: '𝙡',
        codepoint: 120417,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL M',
        value: '𝙢',
        codepoint: 120418,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL N',
        value: '𝙣',
        codepoint: 120419,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL O',
        value: '𝙤',
        codepoint: 120420,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL P',
        value: '𝙥',
        codepoint: 120421,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL Q',
        value: '𝙦',
        codepoint: 120422,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL R',
        value: '𝙧',
        codepoint: 120423,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL S',
        value: '𝙨',
        codepoint: 120424,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL T',
        value: '𝙩',
        codepoint: 120425,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL U',
        value: '𝙪',
        codepoint: 120426,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL V',
        value: '𝙫',
        codepoint: 120427,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL W',
        value: '𝙬',
        codepoint: 120428,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL X',
        value: '𝙭',
        codepoint: 120429,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL Y',
        value: '𝙮',
        codepoint: 120430,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL Z',
        value: '𝙯',
        codepoint: 120431,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL A',
        value: '𝙰',
        codepoint: 120432,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL B',
        value: '𝙱',
        codepoint: 120433,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL C',
        value: '𝙲',
        codepoint: 120434,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL D',
        value: '𝙳',
        codepoint: 120435,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL E',
        value: '𝙴',
        codepoint: 120436,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL F',
        value: '𝙵',
        codepoint: 120437,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL G',
        value: '𝙶',
        codepoint: 120438,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL H',
        value: '𝙷',
        codepoint: 120439,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL I',
        value: '𝙸',
        codepoint: 120440,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL J',
        value: '𝙹',
        codepoint: 120441,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL K',
        value: '𝙺',
        codepoint: 120442,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL L',
        value: '𝙻',
        codepoint: 120443,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL M',
        value: '𝙼',
        codepoint: 120444,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL N',
        value: '𝙽',
        codepoint: 120445,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL O',
        value: '𝙾',
        codepoint: 120446,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL P',
        value: '𝙿',
        codepoint: 120447,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL Q',
        value: '𝚀',
        codepoint: 120448,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL R',
        value: '𝚁',
        codepoint: 120449,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL S',
        value: '𝚂',
        codepoint: 120450,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL T',
        value: '𝚃',
        codepoint: 120451,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL U',
        value: '𝚄',
        codepoint: 120452,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL V',
        value: '𝚅',
        codepoint: 120453,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL W',
        value: '𝚆',
        codepoint: 120454,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL X',
        value: '𝚇',
        codepoint: 120455,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL Y',
        value: '𝚈',
        codepoint: 120456,
      },
      {
        name: 'MATHEMATICAL MONOSPACE CAPITAL Z',
        value: '𝚉',
        codepoint: 120457,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL A',
        value: '𝚊',
        codepoint: 120458,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL B',
        value: '𝚋',
        codepoint: 120459,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL C',
        value: '𝚌',
        codepoint: 120460,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL D',
        value: '𝚍',
        codepoint: 120461,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL E',
        value: '𝚎',
        codepoint: 120462,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL F',
        value: '𝚏',
        codepoint: 120463,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL G',
        value: '𝚐',
        codepoint: 120464,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL H',
        value: '𝚑',
        codepoint: 120465,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL I',
        value: '𝚒',
        codepoint: 120466,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL J',
        value: '𝚓',
        codepoint: 120467,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL K',
        value: '𝚔',
        codepoint: 120468,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL L',
        value: '𝚕',
        codepoint: 120469,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL M',
        value: '𝚖',
        codepoint: 120470,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL N',
        value: '𝚗',
        codepoint: 120471,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL O',
        value: '𝚘',
        codepoint: 120472,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL P',
        value: '𝚙',
        codepoint: 120473,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL Q',
        value: '𝚚',
        codepoint: 120474,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL R',
        value: '𝚛',
        codepoint: 120475,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL S',
        value: '𝚜',
        codepoint: 120476,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL T',
        value: '𝚝',
        codepoint: 120477,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL U',
        value: '𝚞',
        codepoint: 120478,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL V',
        value: '𝚟',
        codepoint: 120479,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL W',
        value: '𝚠',
        codepoint: 120480,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL X',
        value: '𝚡',
        codepoint: 120481,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL Y',
        value: '𝚢',
        codepoint: 120482,
      },
      {
        name: 'MATHEMATICAL MONOSPACE SMALL Z',
        value: '𝚣',
        codepoint: 120483,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL DOTLESS I',
        value: '𝚤',
        codepoint: 120484,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL DOTLESS J',
        value: '𝚥',
        codepoint: 120485,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL ALPHA',
        value: '𝚨',
        codepoint: 120488,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL BETA',
        value: '𝚩',
        codepoint: 120489,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL GAMMA',
        value: '𝚪',
        codepoint: 120490,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL DELTA',
        value: '𝚫',
        codepoint: 120491,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL EPSILON',
        value: '𝚬',
        codepoint: 120492,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL ZETA',
        value: '𝚭',
        codepoint: 120493,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL ETA',
        value: '𝚮',
        codepoint: 120494,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL THETA',
        value: '𝚯',
        codepoint: 120495,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL IOTA',
        value: '𝚰',
        codepoint: 120496,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL KAPPA',
        value: '𝚱',
        codepoint: 120497,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL LAMDA',
        value: '𝚲',
        codepoint: 120498,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL MU',
        value: '𝚳',
        codepoint: 120499,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL NU',
        value: '𝚴',
        codepoint: 120500,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL XI',
        value: '𝚵',
        codepoint: 120501,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL OMICRON',
        value: '𝚶',
        codepoint: 120502,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL PI',
        value: '𝚷',
        codepoint: 120503,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL RHO',
        value: '𝚸',
        codepoint: 120504,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL THETA SYMBOL',
        value: '𝚹',
        codepoint: 120505,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL SIGMA',
        value: '𝚺',
        codepoint: 120506,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL TAU',
        value: '𝚻',
        codepoint: 120507,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL UPSILON',
        value: '𝚼',
        codepoint: 120508,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL PHI',
        value: '𝚽',
        codepoint: 120509,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL CHI',
        value: '𝚾',
        codepoint: 120510,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL PSI',
        value: '𝚿',
        codepoint: 120511,
      },
      {
        name: 'MATHEMATICAL BOLD CAPITAL OMEGA',
        value: '𝛀',
        codepoint: 120512,
      },
      {
        name: 'MATHEMATICAL BOLD NABLA',
        value: '𝛁',
        codepoint: 120513,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL ALPHA',
        value: '𝛂',
        codepoint: 120514,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL BETA',
        value: '𝛃',
        codepoint: 120515,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL GAMMA',
        value: '𝛄',
        codepoint: 120516,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL DELTA',
        value: '𝛅',
        codepoint: 120517,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL EPSILON',
        value: '𝛆',
        codepoint: 120518,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL ZETA',
        value: '𝛇',
        codepoint: 120519,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL ETA',
        value: '𝛈',
        codepoint: 120520,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL THETA',
        value: '𝛉',
        codepoint: 120521,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL IOTA',
        value: '𝛊',
        codepoint: 120522,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL KAPPA',
        value: '𝛋',
        codepoint: 120523,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL LAMDA',
        value: '𝛌',
        codepoint: 120524,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL MU',
        value: '𝛍',
        codepoint: 120525,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL NU',
        value: '𝛎',
        codepoint: 120526,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL XI',
        value: '𝛏',
        codepoint: 120527,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL OMICRON',
        value: '𝛐',
        codepoint: 120528,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL PI',
        value: '𝛑',
        codepoint: 120529,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL RHO',
        value: '𝛒',
        codepoint: 120530,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL FINAL SIGMA',
        value: '𝛓',
        codepoint: 120531,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL SIGMA',
        value: '𝛔',
        codepoint: 120532,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL TAU',
        value: '𝛕',
        codepoint: 120533,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL UPSILON',
        value: '𝛖',
        codepoint: 120534,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL PHI',
        value: '𝛗',
        codepoint: 120535,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL CHI',
        value: '𝛘',
        codepoint: 120536,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL PSI',
        value: '𝛙',
        codepoint: 120537,
      },
      {
        name: 'MATHEMATICAL BOLD SMALL OMEGA',
        value: '𝛚',
        codepoint: 120538,
      },
      {
        name: 'MATHEMATICAL BOLD PARTIAL DIFFERENTIAL',
        value: '𝛛',
        codepoint: 120539,
      },
      {
        name: 'MATHEMATICAL BOLD EPSILON SYMBOL',
        value: '𝛜',
        codepoint: 120540,
      },
      {
        name: 'MATHEMATICAL BOLD THETA SYMBOL',
        value: '𝛝',
        codepoint: 120541,
      },
      {
        name: 'MATHEMATICAL BOLD KAPPA SYMBOL',
        value: '𝛞',
        codepoint: 120542,
      },
      {
        name: 'MATHEMATICAL BOLD PHI SYMBOL',
        value: '𝛟',
        codepoint: 120543,
      },
      {
        name: 'MATHEMATICAL BOLD RHO SYMBOL',
        value: '𝛠',
        codepoint: 120544,
      },
      {
        name: 'MATHEMATICAL BOLD PI SYMBOL',
        value: '𝛡',
        codepoint: 120545,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL ALPHA',
        value: '𝛢',
        codepoint: 120546,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL BETA',
        value: '𝛣',
        codepoint: 120547,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL GAMMA',
        value: '𝛤',
        codepoint: 120548,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL DELTA',
        value: '𝛥',
        codepoint: 120549,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL EPSILON',
        value: '𝛦',
        codepoint: 120550,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL ZETA',
        value: '𝛧',
        codepoint: 120551,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL ETA',
        value: '𝛨',
        codepoint: 120552,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL THETA',
        value: '𝛩',
        codepoint: 120553,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL IOTA',
        value: '𝛪',
        codepoint: 120554,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL KAPPA',
        value: '𝛫',
        codepoint: 120555,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL LAMDA',
        value: '𝛬',
        codepoint: 120556,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL MU',
        value: '𝛭',
        codepoint: 120557,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL NU',
        value: '𝛮',
        codepoint: 120558,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL XI',
        value: '𝛯',
        codepoint: 120559,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL OMICRON',
        value: '𝛰',
        codepoint: 120560,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL PI',
        value: '𝛱',
        codepoint: 120561,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL RHO',
        value: '𝛲',
        codepoint: 120562,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL THETA SYMBOL',
        value: '𝛳',
        codepoint: 120563,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL SIGMA',
        value: '𝛴',
        codepoint: 120564,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL TAU',
        value: '𝛵',
        codepoint: 120565,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL UPSILON',
        value: '𝛶',
        codepoint: 120566,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL PHI',
        value: '𝛷',
        codepoint: 120567,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL CHI',
        value: '𝛸',
        codepoint: 120568,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL PSI',
        value: '𝛹',
        codepoint: 120569,
      },
      {
        name: 'MATHEMATICAL ITALIC CAPITAL OMEGA',
        value: '𝛺',
        codepoint: 120570,
      },
      {
        name: 'MATHEMATICAL ITALIC NABLA',
        value: '𝛻',
        codepoint: 120571,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL ALPHA',
        value: '𝛼',
        codepoint: 120572,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL BETA',
        value: '𝛽',
        codepoint: 120573,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL GAMMA',
        value: '𝛾',
        codepoint: 120574,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL DELTA',
        value: '𝛿',
        codepoint: 120575,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL EPSILON',
        value: '𝜀',
        codepoint: 120576,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL ZETA',
        value: '𝜁',
        codepoint: 120577,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL ETA',
        value: '𝜂',
        codepoint: 120578,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL THETA',
        value: '𝜃',
        codepoint: 120579,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL IOTA',
        value: '𝜄',
        codepoint: 120580,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL KAPPA',
        value: '𝜅',
        codepoint: 120581,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL LAMDA',
        value: '𝜆',
        codepoint: 120582,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL MU',
        value: '𝜇',
        codepoint: 120583,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL NU',
        value: '𝜈',
        codepoint: 120584,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL XI',
        value: '𝜉',
        codepoint: 120585,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL OMICRON',
        value: '𝜊',
        codepoint: 120586,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL PI',
        value: '𝜋',
        codepoint: 120587,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL RHO',
        value: '𝜌',
        codepoint: 120588,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL FINAL SIGMA',
        value: '𝜍',
        codepoint: 120589,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL SIGMA',
        value: '𝜎',
        codepoint: 120590,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL TAU',
        value: '𝜏',
        codepoint: 120591,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL UPSILON',
        value: '𝜐',
        codepoint: 120592,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL PHI',
        value: '𝜑',
        codepoint: 120593,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL CHI',
        value: '𝜒',
        codepoint: 120594,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL PSI',
        value: '𝜓',
        codepoint: 120595,
      },
      {
        name: 'MATHEMATICAL ITALIC SMALL OMEGA',
        value: '𝜔',
        codepoint: 120596,
      },
      {
        name: 'MATHEMATICAL ITALIC PARTIAL DIFFERENTIAL',
        value: '𝜕',
        codepoint: 120597,
      },
      {
        name: 'MATHEMATICAL ITALIC EPSILON SYMBOL',
        value: '𝜖',
        codepoint: 120598,
      },
      {
        name: 'MATHEMATICAL ITALIC THETA SYMBOL',
        value: '𝜗',
        codepoint: 120599,
      },
      {
        name: 'MATHEMATICAL ITALIC KAPPA SYMBOL',
        value: '𝜘',
        codepoint: 120600,
      },
      {
        name: 'MATHEMATICAL ITALIC PHI SYMBOL',
        value: '𝜙',
        codepoint: 120601,
      },
      {
        name: 'MATHEMATICAL ITALIC RHO SYMBOL',
        value: '𝜚',
        codepoint: 120602,
      },
      {
        name: 'MATHEMATICAL ITALIC PI SYMBOL',
        value: '𝜛',
        codepoint: 120603,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL ALPHA',
        value: '𝜜',
        codepoint: 120604,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL BETA',
        value: '𝜝',
        codepoint: 120605,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL GAMMA',
        value: '𝜞',
        codepoint: 120606,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL DELTA',
        value: '𝜟',
        codepoint: 120607,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL EPSILON',
        value: '𝜠',
        codepoint: 120608,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL ZETA',
        value: '𝜡',
        codepoint: 120609,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL ETA',
        value: '𝜢',
        codepoint: 120610,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL THETA',
        value: '𝜣',
        codepoint: 120611,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL IOTA',
        value: '𝜤',
        codepoint: 120612,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL KAPPA',
        value: '𝜥',
        codepoint: 120613,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL LAMDA',
        value: '𝜦',
        codepoint: 120614,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL MU',
        value: '𝜧',
        codepoint: 120615,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL NU',
        value: '𝜨',
        codepoint: 120616,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL XI',
        value: '𝜩',
        codepoint: 120617,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL OMICRON',
        value: '𝜪',
        codepoint: 120618,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL PI',
        value: '𝜫',
        codepoint: 120619,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL RHO',
        value: '𝜬',
        codepoint: 120620,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL THETA SYMBOL',
        value: '𝜭',
        codepoint: 120621,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL SIGMA',
        value: '𝜮',
        codepoint: 120622,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL TAU',
        value: '𝜯',
        codepoint: 120623,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL UPSILON',
        value: '𝜰',
        codepoint: 120624,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL PHI',
        value: '𝜱',
        codepoint: 120625,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL CHI',
        value: '𝜲',
        codepoint: 120626,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL PSI',
        value: '𝜳',
        codepoint: 120627,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC CAPITAL OMEGA',
        value: '𝜴',
        codepoint: 120628,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC NABLA',
        value: '𝜵',
        codepoint: 120629,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL ALPHA',
        value: '𝜶',
        codepoint: 120630,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL BETA',
        value: '𝜷',
        codepoint: 120631,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL GAMMA',
        value: '𝜸',
        codepoint: 120632,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL DELTA',
        value: '𝜹',
        codepoint: 120633,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL EPSILON',
        value: '𝜺',
        codepoint: 120634,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL ZETA',
        value: '𝜻',
        codepoint: 120635,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL ETA',
        value: '𝜼',
        codepoint: 120636,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL THETA',
        value: '𝜽',
        codepoint: 120637,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL IOTA',
        value: '𝜾',
        codepoint: 120638,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL KAPPA',
        value: '𝜿',
        codepoint: 120639,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL LAMDA',
        value: '𝝀',
        codepoint: 120640,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL MU',
        value: '𝝁',
        codepoint: 120641,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL NU',
        value: '𝝂',
        codepoint: 120642,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL XI',
        value: '𝝃',
        codepoint: 120643,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL OMICRON',
        value: '𝝄',
        codepoint: 120644,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL PI',
        value: '𝝅',
        codepoint: 120645,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL RHO',
        value: '𝝆',
        codepoint: 120646,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL FINAL SIGMA',
        value: '𝝇',
        codepoint: 120647,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL SIGMA',
        value: '𝝈',
        codepoint: 120648,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL TAU',
        value: '𝝉',
        codepoint: 120649,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL UPSILON',
        value: '𝝊',
        codepoint: 120650,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL PHI',
        value: '𝝋',
        codepoint: 120651,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL CHI',
        value: '𝝌',
        codepoint: 120652,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL PSI',
        value: '𝝍',
        codepoint: 120653,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC SMALL OMEGA',
        value: '𝝎',
        codepoint: 120654,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC PARTIAL DIFFERENTIAL',
        value: '𝝏',
        codepoint: 120655,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC EPSILON SYMBOL',
        value: '𝝐',
        codepoint: 120656,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC THETA SYMBOL',
        value: '𝝑',
        codepoint: 120657,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC KAPPA SYMBOL',
        value: '𝝒',
        codepoint: 120658,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC PHI SYMBOL',
        value: '𝝓',
        codepoint: 120659,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC RHO SYMBOL',
        value: '𝝔',
        codepoint: 120660,
      },
      {
        name: 'MATHEMATICAL BOLD ITALIC PI SYMBOL',
        value: '𝝕',
        codepoint: 120661,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL ALPHA',
        value: '𝝖',
        codepoint: 120662,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL BETA',
        value: '𝝗',
        codepoint: 120663,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL GAMMA',
        value: '𝝘',
        codepoint: 120664,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL DELTA',
        value: '𝝙',
        codepoint: 120665,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL EPSILON',
        value: '𝝚',
        codepoint: 120666,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL ZETA',
        value: '𝝛',
        codepoint: 120667,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL ETA',
        value: '𝝜',
        codepoint: 120668,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL THETA',
        value: '𝝝',
        codepoint: 120669,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL IOTA',
        value: '𝝞',
        codepoint: 120670,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL KAPPA',
        value: '𝝟',
        codepoint: 120671,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL LAMDA',
        value: '𝝠',
        codepoint: 120672,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL MU',
        value: '𝝡',
        codepoint: 120673,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL NU',
        value: '𝝢',
        codepoint: 120674,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL XI',
        value: '𝝣',
        codepoint: 120675,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL OMICRON',
        value: '𝝤',
        codepoint: 120676,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL PI',
        value: '𝝥',
        codepoint: 120677,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL RHO',
        value: '𝝦',
        codepoint: 120678,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL THETA SYMBOL',
        value: '𝝧',
        codepoint: 120679,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL SIGMA',
        value: '𝝨',
        codepoint: 120680,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL TAU',
        value: '𝝩',
        codepoint: 120681,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL UPSILON',
        value: '𝝪',
        codepoint: 120682,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL PHI',
        value: '𝝫',
        codepoint: 120683,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL CHI',
        value: '𝝬',
        codepoint: 120684,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL PSI',
        value: '𝝭',
        codepoint: 120685,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD CAPITAL OMEGA',
        value: '𝝮',
        codepoint: 120686,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD NABLA',
        value: '𝝯',
        codepoint: 120687,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL ALPHA',
        value: '𝝰',
        codepoint: 120688,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL BETA',
        value: '𝝱',
        codepoint: 120689,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL GAMMA',
        value: '𝝲',
        codepoint: 120690,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL DELTA',
        value: '𝝳',
        codepoint: 120691,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL EPSILON',
        value: '𝝴',
        codepoint: 120692,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL ZETA',
        value: '𝝵',
        codepoint: 120693,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL ETA',
        value: '𝝶',
        codepoint: 120694,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL THETA',
        value: '𝝷',
        codepoint: 120695,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL IOTA',
        value: '𝝸',
        codepoint: 120696,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL KAPPA',
        value: '𝝹',
        codepoint: 120697,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL LAMDA',
        value: '𝝺',
        codepoint: 120698,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL MU',
        value: '𝝻',
        codepoint: 120699,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL NU',
        value: '𝝼',
        codepoint: 120700,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL XI',
        value: '𝝽',
        codepoint: 120701,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL OMICRON',
        value: '𝝾',
        codepoint: 120702,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL PI',
        value: '𝝿',
        codepoint: 120703,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL RHO',
        value: '𝞀',
        codepoint: 120704,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL FINAL SIGMA',
        value: '𝞁',
        codepoint: 120705,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL SIGMA',
        value: '𝞂',
        codepoint: 120706,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL TAU',
        value: '𝞃',
        codepoint: 120707,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL UPSILON',
        value: '𝞄',
        codepoint: 120708,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL PHI',
        value: '𝞅',
        codepoint: 120709,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL CHI',
        value: '𝞆',
        codepoint: 120710,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL PSI',
        value: '𝞇',
        codepoint: 120711,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD SMALL OMEGA',
        value: '𝞈',
        codepoint: 120712,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD PARTIAL DIFFERENTIAL',
        value: '𝞉',
        codepoint: 120713,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD EPSILON SYMBOL',
        value: '𝞊',
        codepoint: 120714,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD THETA SYMBOL',
        value: '𝞋',
        codepoint: 120715,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD KAPPA SYMBOL',
        value: '𝞌',
        codepoint: 120716,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD PHI SYMBOL',
        value: '𝞍',
        codepoint: 120717,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD RHO SYMBOL',
        value: '𝞎',
        codepoint: 120718,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD PI SYMBOL',
        value: '𝞏',
        codepoint: 120719,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL ALPHA',
        value: '𝞐',
        codepoint: 120720,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL BETA',
        value: '𝞑',
        codepoint: 120721,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL GAMMA',
        value: '𝞒',
        codepoint: 120722,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL DELTA',
        value: '𝞓',
        codepoint: 120723,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL EPSILON',
        value: '𝞔',
        codepoint: 120724,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL ZETA',
        value: '𝞕',
        codepoint: 120725,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL ETA',
        value: '𝞖',
        codepoint: 120726,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL THETA',
        value: '𝞗',
        codepoint: 120727,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL IOTA',
        value: '𝞘',
        codepoint: 120728,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL KAPPA',
        value: '𝞙',
        codepoint: 120729,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL LAMDA',
        value: '𝞚',
        codepoint: 120730,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL MU',
        value: '𝞛',
        codepoint: 120731,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL NU',
        value: '𝞜',
        codepoint: 120732,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL XI',
        value: '𝞝',
        codepoint: 120733,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL OMICRON',
        value: '𝞞',
        codepoint: 120734,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL PI',
        value: '𝞟',
        codepoint: 120735,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL RHO',
        value: '𝞠',
        codepoint: 120736,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL THETA SYMBOL',
        value: '𝞡',
        codepoint: 120737,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL SIGMA',
        value: '𝞢',
        codepoint: 120738,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL TAU',
        value: '𝞣',
        codepoint: 120739,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL UPSILON',
        value: '𝞤',
        codepoint: 120740,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL PHI',
        value: '𝞥',
        codepoint: 120741,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL CHI',
        value: '𝞦',
        codepoint: 120742,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL PSI',
        value: '𝞧',
        codepoint: 120743,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC CAPITAL OMEGA',
        value: '𝞨',
        codepoint: 120744,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC NABLA',
        value: '𝞩',
        codepoint: 120745,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL ALPHA',
        value: '𝞪',
        codepoint: 120746,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL BETA',
        value: '𝞫',
        codepoint: 120747,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL GAMMA',
        value: '𝞬',
        codepoint: 120748,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL DELTA',
        value: '𝞭',
        codepoint: 120749,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL EPSILON',
        value: '𝞮',
        codepoint: 120750,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL ZETA',
        value: '𝞯',
        codepoint: 120751,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL ETA',
        value: '𝞰',
        codepoint: 120752,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL THETA',
        value: '𝞱',
        codepoint: 120753,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL IOTA',
        value: '𝞲',
        codepoint: 120754,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL KAPPA',
        value: '𝞳',
        codepoint: 120755,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL LAMDA',
        value: '𝞴',
        codepoint: 120756,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL MU',
        value: '𝞵',
        codepoint: 120757,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL NU',
        value: '𝞶',
        codepoint: 120758,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL XI',
        value: '𝞷',
        codepoint: 120759,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL OMICRON',
        value: '𝞸',
        codepoint: 120760,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL PI',
        value: '𝞹',
        codepoint: 120761,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL RHO',
        value: '𝞺',
        codepoint: 120762,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL FINAL SIGMA',
        value: '𝞻',
        codepoint: 120763,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL SIGMA',
        value: '𝞼',
        codepoint: 120764,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL TAU',
        value: '𝞽',
        codepoint: 120765,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL UPSILON',
        value: '𝞾',
        codepoint: 120766,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL PHI',
        value: '𝞿',
        codepoint: 120767,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL CHI',
        value: '𝟀',
        codepoint: 120768,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL PSI',
        value: '𝟁',
        codepoint: 120769,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC SMALL OMEGA',
        value: '𝟂',
        codepoint: 120770,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC PARTIAL DIFFERENTIAL',
        value: '𝟃',
        codepoint: 120771,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC EPSILON SYMBOL',
        value: '𝟄',
        codepoint: 120772,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC THETA SYMBOL',
        value: '𝟅',
        codepoint: 120773,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC KAPPA SYMBOL',
        value: '𝟆',
        codepoint: 120774,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC PHI SYMBOL',
        value: '𝟇',
        codepoint: 120775,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC RHO SYMBOL',
        value: '𝟈',
        codepoint: 120776,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD ITALIC PI SYMBOL',
        value: '𝟉',
        codepoint: 120777,
      },
      {
        name: 'MATHEMATICAL BOLD DIGIT ZERO',
        value: '𝟎',
        codepoint: 120782,
      },
      {
        name: 'MATHEMATICAL BOLD DIGIT ONE',
        value: '𝟏',
        codepoint: 120783,
      },
      {
        name: 'MATHEMATICAL BOLD DIGIT TWO',
        value: '𝟐',
        codepoint: 120784,
      },
      {
        name: 'MATHEMATICAL BOLD DIGIT THREE',
        value: '𝟑',
        codepoint: 120785,
      },
      {
        name: 'MATHEMATICAL BOLD DIGIT FOUR',
        value: '𝟒',
        codepoint: 120786,
      },
      {
        name: 'MATHEMATICAL BOLD DIGIT FIVE',
        value: '𝟓',
        codepoint: 120787,
      },
      {
        name: 'MATHEMATICAL BOLD DIGIT SIX',
        value: '𝟔',
        codepoint: 120788,
      },
      {
        name: 'MATHEMATICAL BOLD DIGIT SEVEN',
        value: '𝟕',
        codepoint: 120789,
      },
      {
        name: 'MATHEMATICAL BOLD DIGIT EIGHT',
        value: '𝟖',
        codepoint: 120790,
      },
      {
        name: 'MATHEMATICAL BOLD DIGIT NINE',
        value: '𝟗',
        codepoint: 120791,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK DIGIT ZERO',
        value: '𝟘',
        codepoint: 120792,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK DIGIT ONE',
        value: '𝟙',
        codepoint: 120793,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK DIGIT TWO',
        value: '𝟚',
        codepoint: 120794,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK DIGIT THREE',
        value: '𝟛',
        codepoint: 120795,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK DIGIT FOUR',
        value: '𝟜',
        codepoint: 120796,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK DIGIT FIVE',
        value: '𝟝',
        codepoint: 120797,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK DIGIT SIX',
        value: '𝟞',
        codepoint: 120798,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK DIGIT SEVEN',
        value: '𝟟',
        codepoint: 120799,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK DIGIT EIGHT',
        value: '𝟠',
        codepoint: 120800,
      },
      {
        name: 'MATHEMATICAL DOUBLE-STRUCK DIGIT NINE',
        value: '𝟡',
        codepoint: 120801,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF DIGIT ZERO',
        value: '𝟢',
        codepoint: 120802,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF DIGIT ONE',
        value: '𝟣',
        codepoint: 120803,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF DIGIT TWO',
        value: '𝟤',
        codepoint: 120804,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF DIGIT THREE',
        value: '𝟥',
        codepoint: 120805,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF DIGIT FOUR',
        value: '𝟦',
        codepoint: 120806,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF DIGIT FIVE',
        value: '𝟧',
        codepoint: 120807,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF DIGIT SIX',
        value: '𝟨',
        codepoint: 120808,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF DIGIT SEVEN',
        value: '𝟩',
        codepoint: 120809,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF DIGIT EIGHT',
        value: '𝟪',
        codepoint: 120810,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF DIGIT NINE',
        value: '𝟫',
        codepoint: 120811,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD DIGIT ZERO',
        value: '𝟬',
        codepoint: 120812,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD DIGIT ONE',
        value: '𝟭',
        codepoint: 120813,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD DIGIT TWO',
        value: '𝟮',
        codepoint: 120814,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD DIGIT THREE',
        value: '𝟯',
        codepoint: 120815,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD DIGIT FOUR',
        value: '𝟰',
        codepoint: 120816,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD DIGIT FIVE',
        value: '𝟱',
        codepoint: 120817,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD DIGIT SIX',
        value: '𝟲',
        codepoint: 120818,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD DIGIT SEVEN',
        value: '𝟳',
        codepoint: 120819,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD DIGIT EIGHT',
        value: '𝟴',
        codepoint: 120820,
      },
      {
        name: 'MATHEMATICAL SANS-SERIF BOLD DIGIT NINE',
        value: '𝟵',
        codepoint: 120821,
      },
      {
        name: 'MATHEMATICAL MONOSPACE DIGIT ZERO',
        value: '𝟶',
        codepoint: 120822,
      },
      {
        name: 'MATHEMATICAL MONOSPACE DIGIT ONE',
        value: '𝟷',
        codepoint: 120823,
      },
      {
        name: 'MATHEMATICAL MONOSPACE DIGIT TWO',
        value: '𝟸',
        codepoint: 120824,
      },
      {
        name: 'MATHEMATICAL MONOSPACE DIGIT THREE',
        value: '𝟹',
        codepoint: 120825,
      },
      {
        name: 'MATHEMATICAL MONOSPACE DIGIT FOUR',
        value: '𝟺',
        codepoint: 120826,
      },
      {
        name: 'MATHEMATICAL MONOSPACE DIGIT FIVE',
        value: '𝟻',
        codepoint: 120827,
      },
      {
        name: 'MATHEMATICAL MONOSPACE DIGIT SIX',
        value: '𝟼',
        codepoint: 120828,
      },
      {
        name: 'MATHEMATICAL MONOSPACE DIGIT SEVEN',
        value: '𝟽',
        codepoint: 120829,
      },
      {
        name: 'MATHEMATICAL MONOSPACE DIGIT EIGHT',
        value: '𝟾',
        codepoint: 120830,
      },
      {
        name: 'MATHEMATICAL MONOSPACE DIGIT NINE',
        value: '𝟿',
        codepoint: 120831,
      },
    ],
  },
  {
    name: 'Punctuation',
    symbols: [
      {
        name: 'HYPHEN',
        value: '‐',
        codepoint: 8208,
      },
      {
        name: 'NON-BREAKING HYPHEN',
        value: '‑',
        codepoint: 8209,
      },
      {
        name: 'FIGURE DASH',
        value: '‒',
        codepoint: 8210,
      },
      {
        name: 'EN DASH',
        value: '–',
        codepoint: 8211,
      },
      {
        name: 'EM DASH',
        value: '—',
        codepoint: 8212,
      },
      {
        name: 'HORIZONTAL BAR',
        value: '―',
        codepoint: 8213,
      },
      {
        name: 'DOUBLE VERTICAL LINE',
        value: '‖',
        codepoint: 8214,
      },
      {
        name: 'DOUBLE LOW LINE',
        value: '‗',
        codepoint: 8215,
      },
      {
        name: 'LEFT SINGLE QUOTATION MARK',
        value: '‘',
        codepoint: 8216,
      },
      {
        name: 'RIGHT SINGLE QUOTATION MARK',
        value: '’',
        codepoint: 8217,
      },
      {
        name: 'SINGLE LOW-9 QUOTATION MARK',
        value: '‚',
        codepoint: 8218,
      },
      {
        name: 'SINGLE HIGH-REVERSED-9 QUOTATION MARK',
        value: '‛',
        codepoint: 8219,
      },
      {
        name: 'LEFT DOUBLE QUOTATION MARK',
        value: '“',
        codepoint: 8220,
      },
      {
        name: 'RIGHT DOUBLE QUOTATION MARK',
        value: '”',
        codepoint: 8221,
      },
      {
        name: 'DOUBLE LOW-9 QUOTATION MARK',
        value: '„',
        codepoint: 8222,
      },
      {
        name: 'DOUBLE HIGH-REVERSED-9 QUOTATION MARK',
        value: '‟',
        codepoint: 8223,
      },
      {
        name: 'DAGGER',
        value: '†',
        codepoint: 8224,
      },
      {
        name: 'DOUBLE DAGGER',
        value: '‡',
        codepoint: 8225,
      },
      {
        name: 'BULLET',
        value: '•',
        codepoint: 8226,
      },
      {
        name: 'TRIANGULAR BULLET',
        value: '‣',
        codepoint: 8227,
      },
      {
        name: 'ONE DOT LEADER',
        value: '․',
        codepoint: 8228,
      },
      {
        name: 'TWO DOT LEADER',
        value: '‥',
        codepoint: 8229,
      },
      {
        name: 'HORIZONTAL ELLIPSIS',
        value: '…',
        codepoint: 8230,
      },
      {
        name: 'HYPHENATION POINT',
        value: '‧',
        codepoint: 8231,
      },
      {
        name: 'NARROW NO-BREAK SPACE',
        value: ' ',
        codepoint: 8239,
      },
      {
        name: 'PER MILLE SIGN',
        value: '‰',
        codepoint: 8240,
      },
      {
        name: 'PER TEN THOUSAND SIGN',
        value: '‱',
        codepoint: 8241,
      },
      {
        name: 'PRIME',
        value: '′',
        codepoint: 8242,
      },
      {
        name: 'DOUBLE PRIME',
        value: '″',
        codepoint: 8243,
      },
      {
        name: 'TRIPLE PRIME',
        value: '‴',
        codepoint: 8244,
      },
      {
        name: 'REVERSED PRIME',
        value: '‵',
        codepoint: 8245,
      },
      {
        name: 'REVERSED DOUBLE PRIME',
        value: '‶',
        codepoint: 8246,
      },
      {
        name: 'REVERSED TRIPLE PRIME',
        value: '‷',
        codepoint: 8247,
      },
      {
        name: 'CARET',
        value: '‸',
        codepoint: 8248,
      },
      {
        name: 'SINGLE LEFT-POINTING ANGLE QUOTATION MARK',
        value: '‹',
        codepoint: 8249,
      },
      {
        name: 'SINGLE RIGHT-POINTING ANGLE QUOTATION MARK',
        value: '›',
        codepoint: 8250,
      },
      {
        name: 'REFERENCE MARK',
        value: '※',
        codepoint: 8251,
      },
      {
        name: 'INTERROBANG',
        value: '‽',
        codepoint: 8253,
      },
      {
        name: 'OVERLINE',
        value: '‾',
        codepoint: 8254,
      },
      {
        name: 'UNDERTIE',
        value: '‿',
        codepoint: 8255,
      },
      {
        name: 'CHARACTER TIE',
        value: '⁀',
        codepoint: 8256,
      },
      {
        name: 'CARET INSERTION POINT',
        value: '⁁',
        codepoint: 8257,
      },
      {
        name: 'ASTERISM',
        value: '⁂',
        codepoint: 8258,
      },
      {
        name: 'HYPHEN BULLET',
        value: '⁃',
        codepoint: 8259,
      },
      {
        name: 'FRACTION SLASH',
        value: '⁄',
        codepoint: 8260,
      },
      {
        name: 'LEFT SQUARE BRACKET WITH QUILL',
        value: '⁅',
        codepoint: 8261,
      },
      {
        name: 'RIGHT SQUARE BRACKET WITH QUILL',
        value: '⁆',
        codepoint: 8262,
      },
      {
        name: 'DOUBLE QUESTION MARK',
        value: '⁇',
        codepoint: 8263,
      },
      {
        name: 'QUESTION EXCLAMATION MARK',
        value: '⁈',
        codepoint: 8264,
      },
      {
        name: 'TIRONIAN SIGN ET',
        value: '⁊',
        codepoint: 8266,
      },
      {
        name: 'REVERSED PILCROW SIGN',
        value: '⁋',
        codepoint: 8267,
      },
      {
        name: 'BLACK LEFTWARDS BULLET',
        value: '⁌',
        codepoint: 8268,
      },
      {
        name: 'BLACK RIGHTWARDS BULLET',
        value: '⁍',
        codepoint: 8269,
      },
      {
        name: 'LOW ASTERISK',
        value: '⁎',
        codepoint: 8270,
      },
      {
        name: 'REVERSED SEMICOLON',
        value: '⁏',
        codepoint: 8271,
      },
      {
        name: 'CLOSE UP',
        value: '⁐',
        codepoint: 8272,
      },
      {
        name: 'TWO ASTERISKS ALIGNED VERTICALLY',
        value: '⁑',
        codepoint: 8273,
      },
      {
        name: 'COMMERCIAL MINUS SIGN',
        value: '⁒',
        codepoint: 8274,
      },
      {
        name: 'SWUNG DASH',
        value: '⁓',
        codepoint: 8275,
      },
      {
        name: 'INVERTED UNDERTIE',
        value: '⁔',
        codepoint: 8276,
      },
      {
        name: 'FLOWER PUNCTUATION MARK',
        value: '⁕',
        codepoint: 8277,
      },
      {
        name: 'THREE DOT PUNCTUATION',
        value: '⁖',
        codepoint: 8278,
      },
      {
        name: 'QUADRUPLE PRIME',
        value: '⁗',
        codepoint: 8279,
      },
      {
        name: 'FOUR DOT PUNCTUATION',
        value: '⁘',
        codepoint: 8280,
      },
      {
        name: 'FIVE DOT PUNCTUATION',
        value: '⁙',
        codepoint: 8281,
      },
      {
        name: 'TWO DOT PUNCTUATION',
        value: '⁚',
        codepoint: 8282,
      },
      {
        name: 'FOUR DOT MARK',
        value: '⁛',
        codepoint: 8283,
      },
      {
        name: 'DOTTED CROSS',
        value: '⁜',
        codepoint: 8284,
      },
      {
        name: 'TRICOLON',
        value: '⁝',
        codepoint: 8285,
      },
      {
        name: 'VERTICAL FOUR DOTS',
        value: '⁞',
        codepoint: 8286,
      },
      {
        name: 'MEDIUM MATHEMATICAL SPACE',
        value: ' ',
        codepoint: 8287,
      },
      {
        name: 'RIGHT ANGLE SUBSTITUTION MARKER',
        value: '⸀',
        codepoint: 11776,
      },
      {
        name: 'RIGHT ANGLE DOTTED SUBSTITUTION MARKER',
        value: '⸁',
        codepoint: 11777,
      },
      {
        name: 'LEFT SUBSTITUTION BRACKET',
        value: '⸂',
        codepoint: 11778,
      },
      {
        name: 'RIGHT SUBSTITUTION BRACKET',
        value: '⸃',
        codepoint: 11779,
      },
      {
        name: 'LEFT DOTTED SUBSTITUTION BRACKET',
        value: '⸄',
        codepoint: 11780,
      },
      {
        name: 'RIGHT DOTTED SUBSTITUTION BRACKET',
        value: '⸅',
        codepoint: 11781,
      },
      {
        name: 'RAISED INTERPOLATION MARKER',
        value: '⸆',
        codepoint: 11782,
      },
      {
        name: 'RAISED DOTTED INTERPOLATION MARKER',
        value: '⸇',
        codepoint: 11783,
      },
      {
        name: 'DOTTED TRANSPOSITION MARKER',
        value: '⸈',
        codepoint: 11784,
      },
      {
        name: 'LEFT TRANSPOSITION BRACKET',
        value: '⸉',
        codepoint: 11785,
      },
      {
        name: 'RIGHT TRANSPOSITION BRACKET',
        value: '⸊',
        codepoint: 11786,
      },
      {
        name: 'RAISED SQUARE',
        value: '⸋',
        codepoint: 11787,
      },
      {
        name: 'LEFT RAISED OMISSION BRACKET',
        value: '⸌',
        codepoint: 11788,
      },
      {
        name: 'RIGHT RAISED OMISSION BRACKET',
        value: '⸍',
        codepoint: 11789,
      },
      {
        name: 'EDITORIAL CORONIS',
        value: '⸎',
        codepoint: 11790,
      },
      {
        name: 'PARAGRAPHOS',
        value: '⸏',
        codepoint: 11791,
      },
      {
        name: 'FORKED PARAGRAPHOS',
        value: '⸐',
        codepoint: 11792,
      },
      {
        name: 'REVERSED FORKED PARAGRAPHOS',
        value: '⸑',
        codepoint: 11793,
      },
      {
        name: 'HYPODIASTOLE',
        value: '⸒',
        codepoint: 11794,
      },
      {
        name: 'DOTTED OBELOS',
        value: '⸓',
        codepoint: 11795,
      },
      {
        name: 'DOWNWARDS ANCORA',
        value: '⸔',
        codepoint: 11796,
      },
      {
        name: 'UPWARDS ANCORA',
        value: '⸕',
        codepoint: 11797,
      },
      {
        name: 'DOTTED RIGHT-POINTING ANGLE',
        value: '⸖',
        codepoint: 11798,
      },
      {
        name: 'DOUBLE OBLIQUE HYPHEN',
        value: '⸗',
        codepoint: 11799,
      },
      {
        name: 'INVERTED INTERROBANG',
        value: '⸘',
        codepoint: 11800,
      },
      {
        name: 'HYPHEN WITH DIAERESIS',
        value: '⸚',
        codepoint: 11802,
      },
      {
        name: 'TILDE WITH RING ABOVE',
        value: '⸛',
        codepoint: 11803,
      },
      {
        name: 'LEFT LOW PARAPHRASE BRACKET',
        value: '⸜',
        codepoint: 11804,
      },
      {
        name: 'RIGHT LOW PARAPHRASE BRACKET',
        value: '⸝',
        codepoint: 11805,
      },
      {
        name: 'TILDE WITH DOT ABOVE',
        value: '⸞',
        codepoint: 11806,
      },
      {
        name: 'TILDE WITH DOT BELOW',
        value: '⸟',
        codepoint: 11807,
      },
      {
        name: 'LEFT VERTICAL BAR WITH QUILL',
        value: '⸠',
        codepoint: 11808,
      },
      {
        name: 'RIGHT VERTICAL BAR WITH QUILL',
        value: '⸡',
        codepoint: 11809,
      },
      {
        name: 'TOP LEFT HALF BRACKET',
        value: '⸢',
        codepoint: 11810,
      },
      {
        name: 'TOP RIGHT HALF BRACKET',
        value: '⸣',
        codepoint: 11811,
      },
      {
        name: 'BOTTOM LEFT HALF BRACKET',
        value: '⸤',
        codepoint: 11812,
      },
      {
        name: 'BOTTOM RIGHT HALF BRACKET',
        value: '⸥',
        codepoint: 11813,
      },
      {
        name: 'LEFT SIDEWAYS U BRACKET',
        value: '⸦',
        codepoint: 11814,
      },
      {
        name: 'RIGHT SIDEWAYS U BRACKET',
        value: '⸧',
        codepoint: 11815,
      },
      {
        name: 'LEFT DOUBLE PARENTHESIS',
        value: '⸨',
        codepoint: 11816,
      },
      {
        name: 'RIGHT DOUBLE PARENTHESIS',
        value: '⸩',
        codepoint: 11817,
      },
      {
        name: 'TWO DOTS OVER ONE DOT PUNCTUATION',
        value: '⸪',
        codepoint: 11818,
      },
      {
        name: 'ONE DOT OVER TWO DOTS PUNCTUATION',
        value: '⸫',
        codepoint: 11819,
      },
      {
        name: 'SQUARED FOUR DOT PUNCTUATION',
        value: '⸬',
        codepoint: 11820,
      },
      {
        name: 'FIVE DOT MARK',
        value: '⸭',
        codepoint: 11821,
      },
      {
        name: 'REVERSED QUESTION MARK',
        value: '⸮',
        codepoint: 11822,
      },
      {
        name: 'VERTICAL TILDE',
        value: 'ⸯ',
        codepoint: 11823,
      },
      {
        name: 'RING POINT',
        value: '⸰',
        codepoint: 11824,
      },
      {
        name: 'WORD SEPARATOR MIDDLE DOT',
        value: '⸱',
        codepoint: 11825,
      },
    ],
  },
  {
    name: 'Technical',
    symbols: [
      {
        name: 'DIAMETER SIGN',
        value: '⌀',
        codepoint: 8960,
      },
      {
        name: 'ELECTRIC ARROW',
        value: '⌁',
        codepoint: 8961,
      },
      {
        name: 'HOUSE',
        value: '⌂',
        codepoint: 8962,
      },
      {
        name: 'UP ARROWHEAD',
        value: '⌃',
        codepoint: 8963,
      },
      {
        name: 'DOWN ARROWHEAD',
        value: '⌄',
        codepoint: 8964,
      },
      {
        name: 'PROJECTIVE',
        value: '⌅',
        codepoint: 8965,
      },
      {
        name: 'PERSPECTIVE',
        value: '⌆',
        codepoint: 8966,
      },
      {
        name: 'WAVY LINE',
        value: '⌇',
        codepoint: 8967,
      },
      {
        name: 'LEFT CEILING',
        value: '⌈',
        codepoint: 8968,
      },
      {
        name: 'RIGHT CEILING',
        value: '⌉',
        codepoint: 8969,
      },
      {
        name: 'LEFT FLOOR',
        value: '⌊',
        codepoint: 8970,
      },
      {
        name: 'RIGHT FLOOR',
        value: '⌋',
        codepoint: 8971,
      },
      {
        name: 'BOTTOM RIGHT CROP',
        value: '⌌',
        codepoint: 8972,
      },
      {
        name: 'BOTTOM LEFT CROP',
        value: '⌍',
        codepoint: 8973,
      },
      {
        name: 'TOP RIGHT CROP',
        value: '⌎',
        codepoint: 8974,
      },
      {
        name: 'TOP LEFT CROP',
        value: '⌏',
        codepoint: 8975,
      },
      {
        name: 'REVERSED NOT SIGN',
        value: '⌐',
        codepoint: 8976,
      },
      {
        name: 'SQUARE LOZENGE',
        value: '⌑',
        codepoint: 8977,
      },
      {
        name: 'ARC',
        value: '⌒',
        codepoint: 8978,
      },
      {
        name: 'SEGMENT',
        value: '⌓',
        codepoint: 8979,
      },
      {
        name: 'SECTOR',
        value: '⌔',
        codepoint: 8980,
      },
      {
        name: 'TELEPHONE RECORDER',
        value: '⌕',
        codepoint: 8981,
      },
      {
        name: 'POSITION INDICATOR',
        value: '⌖',
        codepoint: 8982,
      },
      {
        name: 'VIEWDATA SQUARE',
        value: '⌗',
        codepoint: 8983,
      },
      {
        name: 'PLACE OF INTEREST SIGN',
        value: '⌘',
        codepoint: 8984,
      },
      {
        name: 'TURNED NOT SIGN',
        value: '⌙',
        codepoint: 8985,
      },
      {
        name: 'TOP LEFT CORNER',
        value: '⌜',
        codepoint: 8988,
      },
      {
        name: 'TOP RIGHT CORNER',
        value: '⌝',
        codepoint: 8989,
      },
      {
        name: 'BOTTOM LEFT CORNER',
        value: '⌞',
        codepoint: 8990,
      },
      {
        name: 'BOTTOM RIGHT CORNER',
        value: '⌟',
        codepoint: 8991,
      },
      {
        name: 'TOP HALF INTEGRAL',
        value: '⌠',
        codepoint: 8992,
      },
      {
        name: 'BOTTOM HALF INTEGRAL',
        value: '⌡',
        codepoint: 8993,
      },
      {
        name: 'FROWN',
        value: '⌢',
        codepoint: 8994,
      },
      {
        name: 'SMILE',
        value: '⌣',
        codepoint: 8995,
      },
      {
        name: 'UP ARROWHEAD BETWEEN TWO HORIZONTAL BARS',
        value: '⌤',
        codepoint: 8996,
      },
      {
        name: 'OPTION KEY',
        value: '⌥',
        codepoint: 8997,
      },
      {
        name: 'ERASE TO THE RIGHT',
        value: '⌦',
        codepoint: 8998,
      },
      {
        name: 'X IN A RECTANGLE BOX',
        value: '⌧',
        codepoint: 8999,
      },
      {
        name: 'LEFT-POINTING ANGLE BRACKET',
        value: '〈',
        codepoint: 9001,
      },
      {
        name: 'RIGHT-POINTING ANGLE BRACKET',
        value: '〉',
        codepoint: 9002,
      },
      {
        name: 'ERASE TO THE LEFT',
        value: '⌫',
        codepoint: 9003,
      },
      {
        name: 'BENZENE RING',
        value: '⌬',
        codepoint: 9004,
      },
      {
        name: 'CYLINDRICITY',
        value: '⌭',
        codepoint: 9005,
      },
      {
        name: 'ALL AROUND-PROFILE',
        value: '⌮',
        codepoint: 9006,
      },
      {
        name: 'SYMMETRY',
        value: '⌯',
        codepoint: 9007,
      },
      {
        name: 'TOTAL RUNOUT',
        value: '⌰',
        codepoint: 9008,
      },
      {
        name: 'DIMENSION ORIGIN',
        value: '⌱',
        codepoint: 9009,
      },
      {
        name: 'CONICAL TAPER',
        value: '⌲',
        codepoint: 9010,
      },
      {
        name: 'SLOPE',
        value: '⌳',
        codepoint: 9011,
      },
      {
        name: 'COUNTERBORE',
        value: '⌴',
        codepoint: 9012,
      },
      {
        name: 'COUNTERSINK',
        value: '⌵',
        codepoint: 9013,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL I-BEAM',
        value: '⌶',
        codepoint: 9014,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL SQUISH QUAD',
        value: '⌷',
        codepoint: 9015,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD EQUAL',
        value: '⌸',
        codepoint: 9016,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD DIVIDE',
        value: '⌹',
        codepoint: 9017,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD DIAMOND',
        value: '⌺',
        codepoint: 9018,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD JOT',
        value: '⌻',
        codepoint: 9019,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD CIRCLE',
        value: '⌼',
        codepoint: 9020,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL CIRCLE STILE',
        value: '⌽',
        codepoint: 9021,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL CIRCLE JOT',
        value: '⌾',
        codepoint: 9022,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL SLASH BAR',
        value: '⌿',
        codepoint: 9023,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL BACKSLASH BAR',
        value: '⍀',
        codepoint: 9024,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD SLASH',
        value: '⍁',
        codepoint: 9025,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD BACKSLASH',
        value: '⍂',
        codepoint: 9026,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD LESS-THAN',
        value: '⍃',
        codepoint: 9027,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD GREATER-THAN',
        value: '⍄',
        codepoint: 9028,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL LEFTWARDS VANE',
        value: '⍅',
        codepoint: 9029,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL RIGHTWARDS VANE',
        value: '⍆',
        codepoint: 9030,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD LEFTWARDS ARROW',
        value: '⍇',
        codepoint: 9031,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD RIGHTWARDS ARROW',
        value: '⍈',
        codepoint: 9032,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL CIRCLE BACKSLASH',
        value: '⍉',
        codepoint: 9033,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL DOWN TACK UNDERBAR',
        value: '⍊',
        codepoint: 9034,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL DELTA STILE',
        value: '⍋',
        codepoint: 9035,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD DOWN CARET',
        value: '⍌',
        codepoint: 9036,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD DELTA',
        value: '⍍',
        codepoint: 9037,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL DOWN TACK JOT',
        value: '⍎',
        codepoint: 9038,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL UPWARDS VANE',
        value: '⍏',
        codepoint: 9039,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD UPWARDS ARROW',
        value: '⍐',
        codepoint: 9040,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL UP TACK OVERBAR',
        value: '⍑',
        codepoint: 9041,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL DEL STILE',
        value: '⍒',
        codepoint: 9042,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD UP CARET',
        value: '⍓',
        codepoint: 9043,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD DEL',
        value: '⍔',
        codepoint: 9044,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL UP TACK JOT',
        value: '⍕',
        codepoint: 9045,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL DOWNWARDS VANE',
        value: '⍖',
        codepoint: 9046,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD DOWNWARDS ARROW',
        value: '⍗',
        codepoint: 9047,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUOTE UNDERBAR',
        value: '⍘',
        codepoint: 9048,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL DELTA UNDERBAR',
        value: '⍙',
        codepoint: 9049,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL DIAMOND UNDERBAR',
        value: '⍚',
        codepoint: 9050,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL JOT UNDERBAR',
        value: '⍛',
        codepoint: 9051,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL CIRCLE UNDERBAR',
        value: '⍜',
        codepoint: 9052,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL UP SHOE JOT',
        value: '⍝',
        codepoint: 9053,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUOTE QUAD',
        value: '⍞',
        codepoint: 9054,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL CIRCLE STAR',
        value: '⍟',
        codepoint: 9055,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD COLON',
        value: '⍠',
        codepoint: 9056,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL UP TACK DIAERESIS',
        value: '⍡',
        codepoint: 9057,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL DEL DIAERESIS',
        value: '⍢',
        codepoint: 9058,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL STAR DIAERESIS',
        value: '⍣',
        codepoint: 9059,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL JOT DIAERESIS',
        value: '⍤',
        codepoint: 9060,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL CIRCLE DIAERESIS',
        value: '⍥',
        codepoint: 9061,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL DOWN SHOE STILE',
        value: '⍦',
        codepoint: 9062,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL LEFT SHOE STILE',
        value: '⍧',
        codepoint: 9063,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL TILDE DIAERESIS',
        value: '⍨',
        codepoint: 9064,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL GREATER-THAN DIAERESIS',
        value: '⍩',
        codepoint: 9065,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL COMMA BAR',
        value: '⍪',
        codepoint: 9066,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL DEL TILDE',
        value: '⍫',
        codepoint: 9067,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL ZILDE',
        value: '⍬',
        codepoint: 9068,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL STILE TILDE',
        value: '⍭',
        codepoint: 9069,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL SEMICOLON UNDERBAR',
        value: '⍮',
        codepoint: 9070,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD NOT EQUAL',
        value: '⍯',
        codepoint: 9071,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD QUESTION',
        value: '⍰',
        codepoint: 9072,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL DOWN CARET TILDE',
        value: '⍱',
        codepoint: 9073,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL UP CARET TILDE',
        value: '⍲',
        codepoint: 9074,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL IOTA',
        value: '⍳',
        codepoint: 9075,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL RHO',
        value: '⍴',
        codepoint: 9076,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL OMEGA',
        value: '⍵',
        codepoint: 9077,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL ALPHA UNDERBAR',
        value: '⍶',
        codepoint: 9078,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL EPSILON UNDERBAR',
        value: '⍷',
        codepoint: 9079,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL IOTA UNDERBAR',
        value: '⍸',
        codepoint: 9080,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL OMEGA UNDERBAR',
        value: '⍹',
        codepoint: 9081,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL ALPHA',
        value: '⍺',
        codepoint: 9082,
      },
      {
        name: 'NOT CHECK MARK',
        value: '⍻',
        codepoint: 9083,
      },
      {
        name: 'RIGHT ANGLE WITH DOWNWARDS ZIGZAG ARROW',
        value: '⍼',
        codepoint: 9084,
      },
      {
        name: 'SHOULDERED OPEN BOX',
        value: '⍽',
        codepoint: 9085,
      },
      {
        name: 'BELL SYMBOL',
        value: '⍾',
        codepoint: 9086,
      },
      {
        name: 'VERTICAL LINE WITH MIDDLE DOT',
        value: '⍿',
        codepoint: 9087,
      },
      {
        name: 'INSERTION SYMBOL',
        value: '⎀',
        codepoint: 9088,
      },
      {
        name: 'CONTINUOUS UNDERLINE SYMBOL',
        value: '⎁',
        codepoint: 9089,
      },
      {
        name: 'DISCONTINUOUS UNDERLINE SYMBOL',
        value: '⎂',
        codepoint: 9090,
      },
      {
        name: 'EMPHASIS SYMBOL',
        value: '⎃',
        codepoint: 9091,
      },
      {
        name: 'COMPOSITION SYMBOL',
        value: '⎄',
        codepoint: 9092,
      },
      {
        name: 'WHITE SQUARE WITH CENTRE VERTICAL LINE',
        value: '⎅',
        codepoint: 9093,
      },
      {
        name: 'ENTER SYMBOL',
        value: '⎆',
        codepoint: 9094,
      },
      {
        name: 'ALTERNATIVE KEY SYMBOL',
        value: '⎇',
        codepoint: 9095,
      },
      {
        name: 'HELM SYMBOL',
        value: '⎈',
        codepoint: 9096,
      },
      {
        name: 'CIRCLED HORIZONTAL BAR WITH NOTCH',
        value: '⎉',
        codepoint: 9097,
      },
      {
        name: 'CIRCLED TRIANGLE DOWN',
        value: '⎊',
        codepoint: 9098,
      },
      {
        name: 'BROKEN CIRCLE WITH NORTHWEST ARROW',
        value: '⎋',
        codepoint: 9099,
      },
      {
        name: 'UNDO SYMBOL',
        value: '⎌',
        codepoint: 9100,
      },
      {
        name: 'MONOSTABLE SYMBOL',
        value: '⎍',
        codepoint: 9101,
      },
      {
        name: 'HYSTERESIS SYMBOL',
        value: '⎎',
        codepoint: 9102,
      },
      {
        name: 'OPEN-CIRCUIT-OUTPUT H-TYPE SYMBOL',
        value: '⎏',
        codepoint: 9103,
      },
      {
        name: 'OPEN-CIRCUIT-OUTPUT L-TYPE SYMBOL',
        value: '⎐',
        codepoint: 9104,
      },
      {
        name: 'PASSIVE-PULL-DOWN-OUTPUT SYMBOL',
        value: '⎑',
        codepoint: 9105,
      },
      {
        name: 'PASSIVE-PULL-UP-OUTPUT SYMBOL',
        value: '⎒',
        codepoint: 9106,
      },
      {
        name: 'DIRECT CURRENT SYMBOL FORM TWO',
        value: '⎓',
        codepoint: 9107,
      },
      {
        name: 'SOFTWARE-FUNCTION SYMBOL',
        value: '⎔',
        codepoint: 9108,
      },
      {
        name: 'APL FUNCTIONAL SYMBOL QUAD',
        value: '⎕',
        codepoint: 9109,
      },
      {
        name: 'DECIMAL SEPARATOR KEY SYMBOL',
        value: '⎖',
        codepoint: 9110,
      },
      {
        name: 'PREVIOUS PAGE',
        value: '⎗',
        codepoint: 9111,
      },
      {
        name: 'NEXT PAGE',
        value: '⎘',
        codepoint: 9112,
      },
      {
        name: 'PRINT SCREEN SYMBOL',
        value: '⎙',
        codepoint: 9113,
      },
      {
        name: 'CLEAR SCREEN SYMBOL',
        value: '⎚',
        codepoint: 9114,
      },
      {
        name: 'LEFT PARENTHESIS UPPER HOOK',
        value: '⎛',
        codepoint: 9115,
      },
      {
        name: 'LEFT PARENTHESIS EXTENSION',
        value: '⎜',
        codepoint: 9116,
      },
      {
        name: 'LEFT PARENTHESIS LOWER HOOK',
        value: '⎝',
        codepoint: 9117,
      },
      {
        name: 'RIGHT PARENTHESIS UPPER HOOK',
        value: '⎞',
        codepoint: 9118,
      },
      {
        name: 'RIGHT PARENTHESIS EXTENSION',
        value: '⎟',
        codepoint: 9119,
      },
      {
        name: 'RIGHT PARENTHESIS LOWER HOOK',
        value: '⎠',
        codepoint: 9120,
      },
      {
        name: 'LEFT SQUARE BRACKET UPPER CORNER',
        value: '⎡',
        codepoint: 9121,
      },
      {
        name: 'LEFT SQUARE BRACKET EXTENSION',
        value: '⎢',
        codepoint: 9122,
      },
      {
        name: 'LEFT SQUARE BRACKET LOWER CORNER',
        value: '⎣',
        codepoint: 9123,
      },
      {
        name: 'RIGHT SQUARE BRACKET UPPER CORNER',
        value: '⎤',
        codepoint: 9124,
      },
      {
        name: 'RIGHT SQUARE BRACKET EXTENSION',
        value: '⎥',
        codepoint: 9125,
      },
      {
        name: 'RIGHT SQUARE BRACKET LOWER CORNER',
        value: '⎦',
        codepoint: 9126,
      },
      {
        name: 'LEFT CURLY BRACKET UPPER HOOK',
        value: '⎧',
        codepoint: 9127,
      },
      {
        name: 'LEFT CURLY BRACKET MIDDLE PIECE',
        value: '⎨',
        codepoint: 9128,
      },
      {
        name: 'LEFT CURLY BRACKET LOWER HOOK',
        value: '⎩',
        codepoint: 9129,
      },
      {
        name: 'CURLY BRACKET EXTENSION',
        value: '⎪',
        codepoint: 9130,
      },
      {
        name: 'RIGHT CURLY BRACKET UPPER HOOK',
        value: '⎫',
        codepoint: 9131,
      },
      {
        name: 'RIGHT CURLY BRACKET MIDDLE PIECE',
        value: '⎬',
        codepoint: 9132,
      },
      {
        name: 'RIGHT CURLY BRACKET LOWER HOOK',
        value: '⎭',
        codepoint: 9133,
      },
      {
        name: 'INTEGRAL EXTENSION',
        value: '⎮',
        codepoint: 9134,
      },
      {
        name: 'HORIZONTAL LINE EXTENSION',
        value: '⎯',
        codepoint: 9135,
      },
      {
        name: 'UPPER LEFT OR LOWER RIGHT CURLY BRACKET SECTION',
        value: '⎰',
        codepoint: 9136,
      },
      {
        name: 'UPPER RIGHT OR LOWER LEFT CURLY BRACKET SECTION',
        value: '⎱',
        codepoint: 9137,
      },
      {
        name: 'SUMMATION TOP',
        value: '⎲',
        codepoint: 9138,
      },
      {
        name: 'SUMMATION BOTTOM',
        value: '⎳',
        codepoint: 9139,
      },
      {
        name: 'TOP SQUARE BRACKET',
        value: '⎴',
        codepoint: 9140,
      },
      {
        name: 'BOTTOM SQUARE BRACKET',
        value: '⎵',
        codepoint: 9141,
      },
      {
        name: 'BOTTOM SQUARE BRACKET OVER TOP SQUARE BRACKET',
        value: '⎶',
        codepoint: 9142,
      },
      {
        name: 'RADICAL SYMBOL BOTTOM',
        value: '⎷',
        codepoint: 9143,
      },
      {
        name: 'LEFT VERTICAL BOX LINE',
        value: '⎸',
        codepoint: 9144,
      },
      {
        name: 'RIGHT VERTICAL BOX LINE',
        value: '⎹',
        codepoint: 9145,
      },
      {
        name: 'HORIZONTAL SCAN LINE-1',
        value: '⎺',
        codepoint: 9146,
      },
      {
        name: 'HORIZONTAL SCAN LINE-3',
        value: '⎻',
        codepoint: 9147,
      },
      {
        name: 'HORIZONTAL SCAN LINE-7',
        value: '⎼',
        codepoint: 9148,
      },
      {
        name: 'HORIZONTAL SCAN LINE-9',
        value: '⎽',
        codepoint: 9149,
      },
      {
        name: 'DENTISTRY SYMBOL LIGHT VERTICAL AND TOP RIGHT',
        value: '⎾',
        codepoint: 9150,
      },
      {
        name: 'DENTISTRY SYMBOL LIGHT VERTICAL AND BOTTOM RIGHT',
        value: '⎿',
        codepoint: 9151,
      },
      {
        name: 'DENTISTRY SYMBOL LIGHT VERTICAL WITH CIRCLE',
        value: '⏀',
        codepoint: 9152,
      },
      {
        name: 'DENTISTRY SYMBOL LIGHT DOWN AND HORIZONTAL WITH CIRCLE',
        value: '⏁',
        codepoint: 9153,
      },
      {
        name: 'DENTISTRY SYMBOL LIGHT UP AND HORIZONTAL WITH CIRCLE',
        value: '⏂',
        codepoint: 9154,
      },
      {
        name: 'DENTISTRY SYMBOL LIGHT VERTICAL WITH TRIANGLE',
        value: '⏃',
        codepoint: 9155,
      },
      {
        name: 'DENTISTRY SYMBOL LIGHT DOWN AND HORIZONTAL WITH TRIANGLE',
        value: '⏄',
        codepoint: 9156,
      },
      {
        name: 'DENTISTRY SYMBOL LIGHT UP AND HORIZONTAL WITH TRIANGLE',
        value: '⏅',
        codepoint: 9157,
      },
      {
        name: 'DENTISTRY SYMBOL LIGHT VERTICAL AND WAVE',
        value: '⏆',
        codepoint: 9158,
      },
      {
        name: 'DENTISTRY SYMBOL LIGHT DOWN AND HORIZONTAL WITH WAVE',
        value: '⏇',
        codepoint: 9159,
      },
      {
        name: 'DENTISTRY SYMBOL LIGHT UP AND HORIZONTAL WITH WAVE',
        value: '⏈',
        codepoint: 9160,
      },
      {
        name: 'DENTISTRY SYMBOL LIGHT DOWN AND HORIZONTAL',
        value: '⏉',
        codepoint: 9161,
      },
      {
        name: 'DENTISTRY SYMBOL LIGHT UP AND HORIZONTAL',
        value: '⏊',
        codepoint: 9162,
      },
      {
        name: 'DENTISTRY SYMBOL LIGHT VERTICAL AND TOP LEFT',
        value: '⏋',
        codepoint: 9163,
      },
      {
        name: 'DENTISTRY SYMBOL LIGHT VERTICAL AND BOTTOM LEFT',
        value: '⏌',
        codepoint: 9164,
      },
      {
        name: 'SQUARE FOOT',
        value: '⏍',
        codepoint: 9165,
      },
      {
        name: 'RETURN SYMBOL',
        value: '⏎',
        codepoint: 9166,
      },
      {
        name: 'VERTICAL LINE EXTENSION',
        value: '⏐',
        codepoint: 9168,
      },
      {
        name: 'METRICAL BREVE',
        value: '⏑',
        codepoint: 9169,
      },
      {
        name: 'METRICAL LONG OVER SHORT',
        value: '⏒',
        codepoint: 9170,
      },
      {
        name: 'METRICAL SHORT OVER LONG',
        value: '⏓',
        codepoint: 9171,
      },
      {
        name: 'METRICAL LONG OVER TWO SHORTS',
        value: '⏔',
        codepoint: 9172,
      },
      {
        name: 'METRICAL TWO SHORTS OVER LONG',
        value: '⏕',
        codepoint: 9173,
      },
      {
        name: 'METRICAL TWO SHORTS JOINED',
        value: '⏖',
        codepoint: 9174,
      },
      {
        name: 'METRICAL TRISEME',
        value: '⏗',
        codepoint: 9175,
      },
      {
        name: 'METRICAL TETRASEME',
        value: '⏘',
        codepoint: 9176,
      },
      {
        name: 'METRICAL PENTASEME',
        value: '⏙',
        codepoint: 9177,
      },
      {
        name: 'EARTH GROUND',
        value: '⏚',
        codepoint: 9178,
      },
      {
        name: 'FUSE',
        value: '⏛',
        codepoint: 9179,
      },
      {
        name: 'TOP PARENTHESIS',
        value: '⏜',
        codepoint: 9180,
      },
      {
        name: 'BOTTOM PARENTHESIS',
        value: '⏝',
        codepoint: 9181,
      },
      {
        name: 'TOP CURLY BRACKET',
        value: '⏞',
        codepoint: 9182,
      },
      {
        name: 'BOTTOM CURLY BRACKET',
        value: '⏟',
        codepoint: 9183,
      },
      {
        name: 'TOP TORTOISE SHELL BRACKET',
        value: '⏠',
        codepoint: 9184,
      },
      {
        name: 'BOTTOM TORTOISE SHELL BRACKET',
        value: '⏡',
        codepoint: 9185,
      },
      {
        name: 'WHITE TRAPEZIUM',
        value: '⏢',
        codepoint: 9186,
      },
      {
        name: 'BENZENE RING WITH CIRCLE',
        value: '⏣',
        codepoint: 9187,
      },
      {
        name: 'STRAIGHTNESS',
        value: '⏤',
        codepoint: 9188,
      },
      {
        name: 'FLATNESS',
        value: '⏥',
        codepoint: 9189,
      },
      {
        name: 'AC CURRENT',
        value: '⏦',
        codepoint: 9190,
      },
      {
        name: 'ELECTRICAL INTERSECTION',
        value: '⏧',
        codepoint: 9191,
      },
    ],
  },
  {
    name: 'Arrows',
    symbols: [
      {
        name: 'UPWARDS QUADRUPLE ARROW',
        value: '⟰',
        codepoint: 10224,
      },
      {
        name: 'DOWNWARDS QUADRUPLE ARROW',
        value: '⟱',
        codepoint: 10225,
      },
      {
        name: 'ANTICLOCKWISE GAPPED CIRCLE ARROW',
        value: '⟲',
        codepoint: 10226,
      },
      {
        name: 'CLOCKWISE GAPPED CIRCLE ARROW',
        value: '⟳',
        codepoint: 10227,
      },
      {
        name: 'RIGHT ARROW WITH CIRCLED PLUS',
        value: '⟴',
        codepoint: 10228,
      },
      {
        name: 'LONG LEFTWARDS ARROW',
        value: '⟵',
        codepoint: 10229,
      },
      {
        name: 'LONG RIGHTWARDS ARROW',
        value: '⟶',
        codepoint: 10230,
      },
      {
        name: 'LONG LEFT RIGHT ARROW',
        value: '⟷',
        codepoint: 10231,
      },
      {
        name: 'LONG LEFTWARDS DOUBLE ARROW',
        value: '⟸',
        codepoint: 10232,
      },
      {
        name: 'LONG RIGHTWARDS DOUBLE ARROW',
        value: '⟹',
        codepoint: 10233,
      },
      {
        name: 'LONG LEFT RIGHT DOUBLE ARROW',
        value: '⟺',
        codepoint: 10234,
      },
      {
        name: 'LONG LEFTWARDS ARROW FROM BAR',
        value: '⟻',
        codepoint: 10235,
      },
      {
        name: 'LONG RIGHTWARDS ARROW FROM BAR',
        value: '⟼',
        codepoint: 10236,
      },
      {
        name: 'LONG LEFTWARDS DOUBLE ARROW FROM BAR',
        value: '⟽',
        codepoint: 10237,
      },
      {
        name: 'LONG RIGHTWARDS DOUBLE ARROW FROM BAR',
        value: '⟾',
        codepoint: 10238,
      },
      {
        name: 'LONG RIGHTWARDS SQUIGGLE ARROW',
        value: '⟿',
        codepoint: 10239,
      },
      {
        name: 'RIGHTWARDS TWO-HEADED ARROW WITH VERTICAL STROKE',
        value: '⤀',
        codepoint: 10496,
      },
      {
        name: 'RIGHTWARDS TWO-HEADED ARROW WITH DOUBLE VERTICAL STROKE',
        value: '⤁',
        codepoint: 10497,
      },
      {
        name: 'LEFTWARDS DOUBLE ARROW WITH VERTICAL STROKE',
        value: '⤂',
        codepoint: 10498,
      },
      {
        name: 'RIGHTWARDS DOUBLE ARROW WITH VERTICAL STROKE',
        value: '⤃',
        codepoint: 10499,
      },
      {
        name: 'LEFT RIGHT DOUBLE ARROW WITH VERTICAL STROKE',
        value: '⤄',
        codepoint: 10500,
      },
      {
        name: 'RIGHTWARDS TWO-HEADED ARROW FROM BAR',
        value: '⤅',
        codepoint: 10501,
      },
      {
        name: 'LEFTWARDS DOUBLE ARROW FROM BAR',
        value: '⤆',
        codepoint: 10502,
      },
      {
        name: 'RIGHTWARDS DOUBLE ARROW FROM BAR',
        value: '⤇',
        codepoint: 10503,
      },
      {
        name: 'DOWNWARDS ARROW WITH HORIZONTAL STROKE',
        value: '⤈',
        codepoint: 10504,
      },
      {
        name: 'UPWARDS ARROW WITH HORIZONTAL STROKE',
        value: '⤉',
        codepoint: 10505,
      },
      {
        name: 'UPWARDS TRIPLE ARROW',
        value: '⤊',
        codepoint: 10506,
      },
      {
        name: 'DOWNWARDS TRIPLE ARROW',
        value: '⤋',
        codepoint: 10507,
      },
      {
        name: 'LEFTWARDS DOUBLE DASH ARROW',
        value: '⤌',
        codepoint: 10508,
      },
      {
        name: 'RIGHTWARDS DOUBLE DASH ARROW',
        value: '⤍',
        codepoint: 10509,
      },
      {
        name: 'LEFTWARDS TRIPLE DASH ARROW',
        value: '⤎',
        codepoint: 10510,
      },
      {
        name: 'RIGHTWARDS TRIPLE DASH ARROW',
        value: '⤏',
        codepoint: 10511,
      },
      {
        name: 'RIGHTWARDS TWO-HEADED TRIPLE DASH ARROW',
        value: '⤐',
        codepoint: 10512,
      },
      {
        name: 'RIGHTWARDS ARROW WITH DOTTED STEM',
        value: '⤑',
        codepoint: 10513,
      },
      {
        name: 'UPWARDS ARROW TO BAR',
        value: '⤒',
        codepoint: 10514,
      },
      {
        name: 'DOWNWARDS ARROW TO BAR',
        value: '⤓',
        codepoint: 10515,
      },
      {
        name: 'RIGHTWARDS ARROW WITH TAIL WITH VERTICAL STROKE',
        value: '⤔',
        codepoint: 10516,
      },
      {
        name: 'RIGHTWARDS ARROW WITH TAIL WITH DOUBLE VERTICAL STROKE',
        value: '⤕',
        codepoint: 10517,
      },
      {
        name: 'RIGHTWARDS TWO-HEADED ARROW WITH TAIL',
        value: '⤖',
        codepoint: 10518,
      },
      {
        name: 'RIGHTWARDS TWO-HEADED ARROW WITH TAIL WITH VERTICAL STROKE',
        value: '⤗',
        codepoint: 10519,
      },
      {
        name: 'RIGHTWARDS TWO-HEADED ARROW WITH TAIL WITH DOUBLE VERTICAL STROKE',
        value: '⤘',
        codepoint: 10520,
      },
      {
        name: 'LEFTWARDS ARROW-TAIL',
        value: '⤙',
        codepoint: 10521,
      },
      {
        name: 'RIGHTWARDS ARROW-TAIL',
        value: '⤚',
        codepoint: 10522,
      },
      {
        name: 'LEFTWARDS DOUBLE ARROW-TAIL',
        value: '⤛',
        codepoint: 10523,
      },
      {
        name: 'RIGHTWARDS DOUBLE ARROW-TAIL',
        value: '⤜',
        codepoint: 10524,
      },
      {
        name: 'LEFTWARDS ARROW TO BLACK DIAMOND',
        value: '⤝',
        codepoint: 10525,
      },
      {
        name: 'RIGHTWARDS ARROW TO BLACK DIAMOND',
        value: '⤞',
        codepoint: 10526,
      },
      {
        name: 'LEFTWARDS ARROW FROM BAR TO BLACK DIAMOND',
        value: '⤟',
        codepoint: 10527,
      },
      {
        name: 'RIGHTWARDS ARROW FROM BAR TO BLACK DIAMOND',
        value: '⤠',
        codepoint: 10528,
      },
      {
        name: 'NORTH WEST AND SOUTH EAST ARROW',
        value: '⤡',
        codepoint: 10529,
      },
      {
        name: 'NORTH EAST AND SOUTH WEST ARROW',
        value: '⤢',
        codepoint: 10530,
      },
      {
        name: 'NORTH WEST ARROW WITH HOOK',
        value: '⤣',
        codepoint: 10531,
      },
      {
        name: 'NORTH EAST ARROW WITH HOOK',
        value: '⤤',
        codepoint: 10532,
      },
      {
        name: 'SOUTH EAST ARROW WITH HOOK',
        value: '⤥',
        codepoint: 10533,
      },
      {
        name: 'SOUTH WEST ARROW WITH HOOK',
        value: '⤦',
        codepoint: 10534,
      },
      {
        name: 'NORTH WEST ARROW AND NORTH EAST ARROW',
        value: '⤧',
        codepoint: 10535,
      },
      {
        name: 'NORTH EAST ARROW AND SOUTH EAST ARROW',
        value: '⤨',
        codepoint: 10536,
      },
      {
        name: 'SOUTH EAST ARROW AND SOUTH WEST ARROW',
        value: '⤩',
        codepoint: 10537,
      },
      {
        name: 'SOUTH WEST ARROW AND NORTH WEST ARROW',
        value: '⤪',
        codepoint: 10538,
      },
      {
        name: 'RISING DIAGONAL CROSSING FALLING DIAGONAL',
        value: '⤫',
        codepoint: 10539,
      },
      {
        name: 'FALLING DIAGONAL CROSSING RISING DIAGONAL',
        value: '⤬',
        codepoint: 10540,
      },
      {
        name: 'SOUTH EAST ARROW CROSSING NORTH EAST ARROW',
        value: '⤭',
        codepoint: 10541,
      },
      {
        name: 'NORTH EAST ARROW CROSSING SOUTH EAST ARROW',
        value: '⤮',
        codepoint: 10542,
      },
      {
        name: 'FALLING DIAGONAL CROSSING NORTH EAST ARROW',
        value: '⤯',
        codepoint: 10543,
      },
      {
        name: 'RISING DIAGONAL CROSSING SOUTH EAST ARROW',
        value: '⤰',
        codepoint: 10544,
      },
      {
        name: 'NORTH EAST ARROW CROSSING NORTH WEST ARROW',
        value: '⤱',
        codepoint: 10545,
      },
      {
        name: 'NORTH WEST ARROW CROSSING NORTH EAST ARROW',
        value: '⤲',
        codepoint: 10546,
      },
      {
        name: 'WAVE ARROW POINTING DIRECTLY RIGHT',
        value: '⤳',
        codepoint: 10547,
      },
      {
        name: 'ARROW POINTING DOWNWARDS THEN CURVING LEFTWARDS',
        value: '⤶',
        codepoint: 10550,
      },
      {
        name: 'ARROW POINTING DOWNWARDS THEN CURVING RIGHTWARDS',
        value: '⤷',
        codepoint: 10551,
      },
      {
        name: 'RIGHT-SIDE ARC CLOCKWISE ARROW',
        value: '⤸',
        codepoint: 10552,
      },
      {
        name: 'LEFT-SIDE ARC ANTICLOCKWISE ARROW',
        value: '⤹',
        codepoint: 10553,
      },
      {
        name: 'TOP ARC ANTICLOCKWISE ARROW',
        value: '⤺',
        codepoint: 10554,
      },
      {
        name: 'BOTTOM ARC ANTICLOCKWISE ARROW',
        value: '⤻',
        codepoint: 10555,
      },
      {
        name: 'TOP ARC CLOCKWISE ARROW WITH MINUS',
        value: '⤼',
        codepoint: 10556,
      },
      {
        name: 'TOP ARC ANTICLOCKWISE ARROW WITH PLUS',
        value: '⤽',
        codepoint: 10557,
      },
      {
        name: 'LOWER RIGHT SEMICIRCULAR CLOCKWISE ARROW',
        value: '⤾',
        codepoint: 10558,
      },
      {
        name: 'LOWER LEFT SEMICIRCULAR ANTICLOCKWISE ARROW',
        value: '⤿',
        codepoint: 10559,
      },
      {
        name: 'ANTICLOCKWISE CLOSED CIRCLE ARROW',
        value: '⥀',
        codepoint: 10560,
      },
      {
        name: 'CLOCKWISE CLOSED CIRCLE ARROW',
        value: '⥁',
        codepoint: 10561,
      },
      {
        name: 'RIGHTWARDS ARROW ABOVE SHORT LEFTWARDS ARROW',
        value: '⥂',
        codepoint: 10562,
      },
      {
        name: 'LEFTWARDS ARROW ABOVE SHORT RIGHTWARDS ARROW',
        value: '⥃',
        codepoint: 10563,
      },
      {
        name: 'SHORT RIGHTWARDS ARROW ABOVE LEFTWARDS ARROW',
        value: '⥄',
        codepoint: 10564,
      },
      {
        name: 'RIGHTWARDS ARROW WITH PLUS BELOW',
        value: '⥅',
        codepoint: 10565,
      },
      {
        name: 'LEFTWARDS ARROW WITH PLUS BELOW',
        value: '⥆',
        codepoint: 10566,
      },
      {
        name: 'RIGHTWARDS ARROW THROUGH X',
        value: '⥇',
        codepoint: 10567,
      },
      {
        name: 'LEFT RIGHT ARROW THROUGH SMALL CIRCLE',
        value: '⥈',
        codepoint: 10568,
      },
      {
        name: 'UPWARDS TWO-HEADED ARROW FROM SMALL CIRCLE',
        value: '⥉',
        codepoint: 10569,
      },
      {
        name: 'LEFT BARB UP RIGHT BARB DOWN HARPOON',
        value: '⥊',
        codepoint: 10570,
      },
      {
        name: 'LEFT BARB DOWN RIGHT BARB UP HARPOON',
        value: '⥋',
        codepoint: 10571,
      },
      {
        name: 'UP BARB RIGHT DOWN BARB LEFT HARPOON',
        value: '⥌',
        codepoint: 10572,
      },
      {
        name: 'UP BARB LEFT DOWN BARB RIGHT HARPOON',
        value: '⥍',
        codepoint: 10573,
      },
      {
        name: 'LEFT BARB UP RIGHT BARB UP HARPOON',
        value: '⥎',
        codepoint: 10574,
      },
      {
        name: 'UP BARB RIGHT DOWN BARB RIGHT HARPOON',
        value: '⥏',
        codepoint: 10575,
      },
      {
        name: 'LEFT BARB DOWN RIGHT BARB DOWN HARPOON',
        value: '⥐',
        codepoint: 10576,
      },
      {
        name: 'UP BARB LEFT DOWN BARB LEFT HARPOON',
        value: '⥑',
        codepoint: 10577,
      },
      {
        name: 'LEFTWARDS HARPOON WITH BARB UP TO BAR',
        value: '⥒',
        codepoint: 10578,
      },
      {
        name: 'RIGHTWARDS HARPOON WITH BARB UP TO BAR',
        value: '⥓',
        codepoint: 10579,
      },
      {
        name: 'UPWARDS HARPOON WITH BARB RIGHT TO BAR',
        value: '⥔',
        codepoint: 10580,
      },
      {
        name: 'DOWNWARDS HARPOON WITH BARB RIGHT TO BAR',
        value: '⥕',
        codepoint: 10581,
      },
      {
        name: 'LEFTWARDS HARPOON WITH BARB DOWN TO BAR',
        value: '⥖',
        codepoint: 10582,
      },
      {
        name: 'RIGHTWARDS HARPOON WITH BARB DOWN TO BAR',
        value: '⥗',
        codepoint: 10583,
      },
      {
        name: 'UPWARDS HARPOON WITH BARB LEFT TO BAR',
        value: '⥘',
        codepoint: 10584,
      },
      {
        name: 'DOWNWARDS HARPOON WITH BARB LEFT TO BAR',
        value: '⥙',
        codepoint: 10585,
      },
      {
        name: 'LEFTWARDS HARPOON WITH BARB UP FROM BAR',
        value: '⥚',
        codepoint: 10586,
      },
      {
        name: 'RIGHTWARDS HARPOON WITH BARB UP FROM BAR',
        value: '⥛',
        codepoint: 10587,
      },
      {
        name: 'UPWARDS HARPOON WITH BARB RIGHT FROM BAR',
        value: '⥜',
        codepoint: 10588,
      },
      {
        name: 'DOWNWARDS HARPOON WITH BARB RIGHT FROM BAR',
        value: '⥝',
        codepoint: 10589,
      },
      {
        name: 'LEFTWARDS HARPOON WITH BARB DOWN FROM BAR',
        value: '⥞',
        codepoint: 10590,
      },
      {
        name: 'RIGHTWARDS HARPOON WITH BARB DOWN FROM BAR',
        value: '⥟',
        codepoint: 10591,
      },
      {
        name: 'UPWARDS HARPOON WITH BARB LEFT FROM BAR',
        value: '⥠',
        codepoint: 10592,
      },
      {
        name: 'DOWNWARDS HARPOON WITH BARB LEFT FROM BAR',
        value: '⥡',
        codepoint: 10593,
      },
      {
        name: 'LEFTWARDS HARPOON WITH BARB UP ABOVE LEFTWARDS HARPOON WITH BARB DOWN',
        value: '⥢',
        codepoint: 10594,
      },
      {
        name: 'UPWARDS HARPOON WITH BARB LEFT BESIDE UPWARDS HARPOON WITH BARB RIGHT',
        value: '⥣',
        codepoint: 10595,
      },
      {
        name: 'RIGHTWARDS HARPOON WITH BARB UP ABOVE RIGHTWARDS HARPOON WITH BARB DOWN',
        value: '⥤',
        codepoint: 10596,
      },
      {
        name: 'DOWNWARDS HARPOON WITH BARB LEFT BESIDE DOWNWARDS HARPOON WITH BARB RIGHT',
        value: '⥥',
        codepoint: 10597,
      },
      {
        name: 'LEFTWARDS HARPOON WITH BARB UP ABOVE RIGHTWARDS HARPOON WITH BARB UP',
        value: '⥦',
        codepoint: 10598,
      },
      {
        name: 'LEFTWARDS HARPOON WITH BARB DOWN ABOVE RIGHTWARDS HARPOON WITH BARB DOWN',
        value: '⥧',
        codepoint: 10599,
      },
      {
        name: 'RIGHTWARDS HARPOON WITH BARB UP ABOVE LEFTWARDS HARPOON WITH BARB UP',
        value: '⥨',
        codepoint: 10600,
      },
      {
        name: 'RIGHTWARDS HARPOON WITH BARB DOWN ABOVE LEFTWARDS HARPOON WITH BARB DOWN',
        value: '⥩',
        codepoint: 10601,
      },
      {
        name: 'LEFTWARDS HARPOON WITH BARB UP ABOVE LONG DASH',
        value: '⥪',
        codepoint: 10602,
      },
      {
        name: 'LEFTWARDS HARPOON WITH BARB DOWN BELOW LONG DASH',
        value: '⥫',
        codepoint: 10603,
      },
      {
        name: 'RIGHTWARDS HARPOON WITH BARB UP ABOVE LONG DASH',
        value: '⥬',
        codepoint: 10604,
      },
      {
        name: 'RIGHTWARDS HARPOON WITH BARB DOWN BELOW LONG DASH',
        value: '⥭',
        codepoint: 10605,
      },
      {
        name: 'UPWARDS HARPOON WITH BARB LEFT BESIDE DOWNWARDS HARPOON WITH BARB RIGHT',
        value: '⥮',
        codepoint: 10606,
      },
      {
        name: 'DOWNWARDS HARPOON WITH BARB LEFT BESIDE UPWARDS HARPOON WITH BARB RIGHT',
        value: '⥯',
        codepoint: 10607,
      },
      {
        name: 'RIGHT DOUBLE ARROW WITH ROUNDED HEAD',
        value: '⥰',
        codepoint: 10608,
      },
      {
        name: 'EQUALS SIGN ABOVE RIGHTWARDS ARROW',
        value: '⥱',
        codepoint: 10609,
      },
      {
        name: 'TILDE OPERATOR ABOVE RIGHTWARDS ARROW',
        value: '⥲',
        codepoint: 10610,
      },
      {
        name: 'LEFTWARDS ARROW ABOVE TILDE OPERATOR',
        value: '⥳',
        codepoint: 10611,
      },
      {
        name: 'RIGHTWARDS ARROW ABOVE TILDE OPERATOR',
        value: '⥴',
        codepoint: 10612,
      },
      {
        name: 'RIGHTWARDS ARROW ABOVE ALMOST EQUAL TO',
        value: '⥵',
        codepoint: 10613,
      },
      {
        name: 'LESS-THAN ABOVE LEFTWARDS ARROW',
        value: '⥶',
        codepoint: 10614,
      },
      {
        name: 'LEFTWARDS ARROW THROUGH LESS-THAN',
        value: '⥷',
        codepoint: 10615,
      },
      {
        name: 'GREATER-THAN ABOVE RIGHTWARDS ARROW',
        value: '⥸',
        codepoint: 10616,
      },
      {
        name: 'SUBSET ABOVE RIGHTWARDS ARROW',
        value: '⥹',
        codepoint: 10617,
      },
      {
        name: 'LEFTWARDS ARROW THROUGH SUBSET',
        value: '⥺',
        codepoint: 10618,
      },
      {
        name: 'SUPERSET ABOVE LEFTWARDS ARROW',
        value: '⥻',
        codepoint: 10619,
      },
      {
        name: 'LEFT FISH TAIL',
        value: '⥼',
        codepoint: 10620,
      },
      {
        name: 'RIGHT FISH TAIL',
        value: '⥽',
        codepoint: 10621,
      },
      {
        name: 'UP FISH TAIL',
        value: '⥾',
        codepoint: 10622,
      },
      {
        name: 'DOWN FISH TAIL',
        value: '⥿',
        codepoint: 10623,
      },
      {
        name: 'NORTH EAST WHITE ARROW',
        value: '⬀',
        codepoint: 11008,
      },
      {
        name: 'NORTH WEST WHITE ARROW',
        value: '⬁',
        codepoint: 11009,
      },
      {
        name: 'SOUTH EAST WHITE ARROW',
        value: '⬂',
        codepoint: 11010,
      },
      {
        name: 'SOUTH WEST WHITE ARROW',
        value: '⬃',
        codepoint: 11011,
      },
      {
        name: 'LEFT RIGHT WHITE ARROW',
        value: '⬄',
        codepoint: 11012,
      },
      {
        name: 'NORTH EAST BLACK ARROW',
        value: '⬈',
        codepoint: 11016,
      },
      {
        name: 'NORTH WEST BLACK ARROW',
        value: '⬉',
        codepoint: 11017,
      },
      {
        name: 'SOUTH EAST BLACK ARROW',
        value: '⬊',
        codepoint: 11018,
      },
      {
        name: 'SOUTH WEST BLACK ARROW',
        value: '⬋',
        codepoint: 11019,
      },
      {
        name: 'LEFT RIGHT BLACK ARROW',
        value: '⬌',
        codepoint: 11020,
      },
      {
        name: 'UP DOWN BLACK ARROW',
        value: '⬍',
        codepoint: 11021,
      },
      {
        name: 'RIGHTWARDS ARROW WITH TIP DOWNWARDS',
        value: '⬎',
        codepoint: 11022,
      },
      {
        name: 'RIGHTWARDS ARROW WITH TIP UPWARDS',
        value: '⬏',
        codepoint: 11023,
      },
      {
        name: 'LEFTWARDS ARROW WITH TIP DOWNWARDS',
        value: '⬐',
        codepoint: 11024,
      },
      {
        name: 'LEFTWARDS ARROW WITH TIP UPWARDS',
        value: '⬑',
        codepoint: 11025,
      },
      {
        name: 'SQUARE WITH TOP HALF BLACK',
        value: '⬒',
        codepoint: 11026,
      },
      {
        name: 'SQUARE WITH BOTTOM HALF BLACK',
        value: '⬓',
        codepoint: 11027,
      },
      {
        name: 'SQUARE WITH UPPER RIGHT DIAGONAL HALF BLACK',
        value: '⬔',
        codepoint: 11028,
      },
      {
        name: 'SQUARE WITH LOWER LEFT DIAGONAL HALF BLACK',
        value: '⬕',
        codepoint: 11029,
      },
      {
        name: 'DIAMOND WITH LEFT HALF BLACK',
        value: '⬖',
        codepoint: 11030,
      },
      {
        name: 'DIAMOND WITH RIGHT HALF BLACK',
        value: '⬗',
        codepoint: 11031,
      },
      {
        name: 'DIAMOND WITH TOP HALF BLACK',
        value: '⬘',
        codepoint: 11032,
      },
      {
        name: 'DIAMOND WITH BOTTOM HALF BLACK',
        value: '⬙',
        codepoint: 11033,
      },
      {
        name: 'DOTTED SQUARE',
        value: '⬚',
        codepoint: 11034,
      },
      {
        name: 'BLACK VERY SMALL SQUARE',
        value: '⬝',
        codepoint: 11037,
      },
      {
        name: 'WHITE VERY SMALL SQUARE',
        value: '⬞',
        codepoint: 11038,
      },
      {
        name: 'BLACK PENTAGON',
        value: '⬟',
        codepoint: 11039,
      },
      {
        name: 'WHITE PENTAGON',
        value: '⬠',
        codepoint: 11040,
      },
      {
        name: 'WHITE HEXAGON',
        value: '⬡',
        codepoint: 11041,
      },
      {
        name: 'BLACK HEXAGON',
        value: '⬢',
        codepoint: 11042,
      },
      {
        name: 'HORIZONTAL BLACK HEXAGON',
        value: '⬣',
        codepoint: 11043,
      },
      {
        name: 'BLACK LARGE CIRCLE',
        value: '⬤',
        codepoint: 11044,
      },
      {
        name: 'BLACK MEDIUM DIAMOND',
        value: '⬥',
        codepoint: 11045,
      },
      {
        name: 'WHITE MEDIUM DIAMOND',
        value: '⬦',
        codepoint: 11046,
      },
      {
        name: 'BLACK MEDIUM LOZENGE',
        value: '⬧',
        codepoint: 11047,
      },
      {
        name: 'WHITE MEDIUM LOZENGE',
        value: '⬨',
        codepoint: 11048,
      },
      {
        name: 'BLACK SMALL DIAMOND',
        value: '⬩',
        codepoint: 11049,
      },
      {
        name: 'BLACK SMALL LOZENGE',
        value: '⬪',
        codepoint: 11050,
      },
      {
        name: 'WHITE SMALL LOZENGE',
        value: '⬫',
        codepoint: 11051,
      },
      {
        name: 'BLACK HORIZONTAL ELLIPSE',
        value: '⬬',
        codepoint: 11052,
      },
      {
        name: 'WHITE HORIZONTAL ELLIPSE',
        value: '⬭',
        codepoint: 11053,
      },
      {
        name: 'BLACK VERTICAL ELLIPSE',
        value: '⬮',
        codepoint: 11054,
      },
      {
        name: 'WHITE VERTICAL ELLIPSE',
        value: '⬯',
        codepoint: 11055,
      },
      {
        name: 'LEFT ARROW WITH SMALL CIRCLE',
        value: '⬰',
        codepoint: 11056,
      },
      {
        name: 'THREE LEFTWARDS ARROWS',
        value: '⬱',
        codepoint: 11057,
      },
      {
        name: 'LEFT ARROW WITH CIRCLED PLUS',
        value: '⬲',
        codepoint: 11058,
      },
      {
        name: 'LONG LEFTWARDS SQUIGGLE ARROW',
        value: '⬳',
        codepoint: 11059,
      },
      {
        name: 'LEFTWARDS TWO-HEADED ARROW WITH VERTICAL STROKE',
        value: '⬴',
        codepoint: 11060,
      },
      {
        name: 'LEFTWARDS TWO-HEADED ARROW WITH DOUBLE VERTICAL STROKE',
        value: '⬵',
        codepoint: 11061,
      },
      {
        name: 'LEFTWARDS TWO-HEADED ARROW FROM BAR',
        value: '⬶',
        codepoint: 11062,
      },
      {
        name: 'LEFTWARDS TWO-HEADED TRIPLE DASH ARROW',
        value: '⬷',
        codepoint: 11063,
      },
      {
        name: 'LEFTWARDS ARROW WITH DOTTED STEM',
        value: '⬸',
        codepoint: 11064,
      },
      {
        name: 'LEFTWARDS ARROW WITH TAIL WITH VERTICAL STROKE',
        value: '⬹',
        codepoint: 11065,
      },
      {
        name: 'LEFTWARDS ARROW WITH TAIL WITH DOUBLE VERTICAL STROKE',
        value: '⬺',
        codepoint: 11066,
      },
      {
        name: 'LEFTWARDS TWO-HEADED ARROW WITH TAIL',
        value: '⬻',
        codepoint: 11067,
      },
      {
        name: 'LEFTWARDS TWO-HEADED ARROW WITH TAIL WITH VERTICAL STROKE',
        value: '⬼',
        codepoint: 11068,
      },
      {
        name: 'LEFTWARDS TWO-HEADED ARROW WITH TAIL WITH DOUBLE VERTICAL STROKE',
        value: '⬽',
        codepoint: 11069,
      },
      {
        name: 'LEFTWARDS ARROW THROUGH X',
        value: '⬾',
        codepoint: 11070,
      },
      {
        name: 'WAVE ARROW POINTING DIRECTLY LEFT',
        value: '⬿',
        codepoint: 11071,
      },
      {
        name: 'EQUALS SIGN ABOVE LEFTWARDS ARROW',
        value: '⭀',
        codepoint: 11072,
      },
      {
        name: 'REVERSE TILDE OPERATOR ABOVE LEFTWARDS ARROW',
        value: '⭁',
        codepoint: 11073,
      },
      {
        name: 'LEFTWARDS ARROW ABOVE REVERSE ALMOST EQUAL TO',
        value: '⭂',
        codepoint: 11074,
      },
      {
        name: 'RIGHTWARDS ARROW THROUGH GREATER-THAN',
        value: '⭃',
        codepoint: 11075,
      },
      {
        name: 'RIGHTWARDS ARROW THROUGH SUPERSET',
        value: '⭄',
        codepoint: 11076,
      },
      {
        name: 'LEFTWARDS QUADRUPLE ARROW',
        value: '⭅',
        codepoint: 11077,
      },
      {
        name: 'RIGHTWARDS QUADRUPLE ARROW',
        value: '⭆',
        codepoint: 11078,
      },
      {
        name: 'REVERSE TILDE OPERATOR ABOVE RIGHTWARDS ARROW',
        value: '⭇',
        codepoint: 11079,
      },
      {
        name: 'RIGHTWARDS ARROW ABOVE REVERSE ALMOST EQUAL TO',
        value: '⭈',
        codepoint: 11080,
      },
      {
        name: 'TILDE OPERATOR ABOVE LEFTWARDS ARROW',
        value: '⭉',
        codepoint: 11081,
      },
      {
        name: 'LEFTWARDS ARROW ABOVE ALMOST EQUAL TO',
        value: '⭊',
        codepoint: 11082,
      },
      {
        name: 'LEFTWARDS ARROW ABOVE REVERSE TILDE OPERATOR',
        value: '⭋',
        codepoint: 11083,
      },
      {
        name: 'RIGHTWARDS ARROW ABOVE REVERSE TILDE OPERATOR',
        value: '⭌',
        codepoint: 11084,
      },
      {
        name: 'BLACK SMALL STAR',
        value: '⭑',
        codepoint: 11089,
      },
      {
        name: 'WHITE SMALL STAR',
        value: '⭒',
        codepoint: 11090,
      },
      {
        name: 'BLACK RIGHT-POINTING PENTAGON',
        value: '⭓',
        codepoint: 11091,
      },
      {
        name: 'WHITE RIGHT-POINTING PENTAGON',
        value: '⭔',
        codepoint: 11092,
      },
    ],
  },
  {
    name: 'Ancient',
    symbols: [
      {
        name: 'GREEK ACROPHONIC ATTIC ONE QUARTER',
        value: '𐅀',
        codepoint: 65856,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC ONE HALF',
        value: '𐅁',
        codepoint: 65857,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC ONE DRACHMA',
        value: '𐅂',
        codepoint: 65858,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC FIVE',
        value: '𐅃',
        codepoint: 65859,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC FIVE THOUSAND',
        value: '𐅆',
        codepoint: 65862,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC FIFTY THOUSAND',
        value: '𐅇',
        codepoint: 65863,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC FIVE TALENTS',
        value: '𐅈',
        codepoint: 65864,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC TEN TALENTS',
        value: '𐅉',
        codepoint: 65865,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC FIFTY TALENTS',
        value: '𐅊',
        codepoint: 65866,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC ONE HUNDRED TALENTS',
        value: '𐅋',
        codepoint: 65867,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC FIVE HUNDRED TALENTS',
        value: '𐅌',
        codepoint: 65868,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC ONE THOUSAND TALENTS',
        value: '𐅍',
        codepoint: 65869,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC FIVE THOUSAND TALENTS',
        value: '𐅎',
        codepoint: 65870,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC FIVE STATERS',
        value: '𐅏',
        codepoint: 65871,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC TEN STATERS',
        value: '𐅐',
        codepoint: 65872,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC FIFTY STATERS',
        value: '𐅑',
        codepoint: 65873,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC ONE HUNDRED STATERS',
        value: '𐅒',
        codepoint: 65874,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC FIVE HUNDRED STATERS',
        value: '𐅓',
        codepoint: 65875,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC ONE THOUSAND STATERS',
        value: '𐅔',
        codepoint: 65876,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC TEN THOUSAND STATERS',
        value: '𐅕',
        codepoint: 65877,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC FIFTY THOUSAND STATERS',
        value: '𐅖',
        codepoint: 65878,
      },
      {
        name: 'GREEK ACROPHONIC ATTIC TEN MNAS',
        value: '𐅗',
        codepoint: 65879,
      },
      {
        name: 'GREEK ACROPHONIC HERAEUM ONE PLETHRON',
        value: '𐅘',
        codepoint: 65880,
      },
      {
        name: 'GREEK ACROPHONIC THESPIAN ONE',
        value: '𐅙',
        codepoint: 65881,
      },
      {
        name: 'GREEK ACROPHONIC HERMIONIAN ONE',
        value: '𐅚',
        codepoint: 65882,
      },
      {
        name: 'GREEK ACROPHONIC EPIDAUREAN TWO',
        value: '𐅛',
        codepoint: 65883,
      },
      {
        name: 'GREEK ACROPHONIC THESPIAN TWO',
        value: '𐅜',
        codepoint: 65884,
      },
      {
        name: 'GREEK ACROPHONIC CYRENAIC TWO DRACHMAS',
        value: '𐅝',
        codepoint: 65885,
      },
      {
        name: 'GREEK ACROPHONIC EPIDAUREAN TWO DRACHMAS',
        value: '𐅞',
        codepoint: 65886,
      },
      {
        name: 'GREEK ACROPHONIC TROEZENIAN FIVE',
        value: '𐅟',
        codepoint: 65887,
      },
      {
        name: 'GREEK ACROPHONIC TROEZENIAN TEN',
        value: '𐅠',
        codepoint: 65888,
      },
      {
        name: 'GREEK ACROPHONIC TROEZENIAN TEN ALTERNATE FORM',
        value: '𐅡',
        codepoint: 65889,
      },
      {
        name: 'GREEK ACROPHONIC HERMIONIAN TEN',
        value: '𐅢',
        codepoint: 65890,
      },
      {
        name: 'GREEK ACROPHONIC MESSENIAN TEN',
        value: '𐅣',
        codepoint: 65891,
      },
      {
        name: 'GREEK ACROPHONIC THESPIAN TEN',
        value: '𐅤',
        codepoint: 65892,
      },
      {
        name: 'GREEK ACROPHONIC THESPIAN THIRTY',
        value: '𐅥',
        codepoint: 65893,
      },
      {
        name: 'GREEK ACROPHONIC TROEZENIAN FIFTY',
        value: '𐅦',
        codepoint: 65894,
      },
      {
        name: 'GREEK ACROPHONIC TROEZENIAN FIFTY ALTERNATE FORM',
        value: '𐅧',
        codepoint: 65895,
      },
      {
        name: 'GREEK ACROPHONIC HERMIONIAN FIFTY',
        value: '𐅨',
        codepoint: 65896,
      },
      {
        name: 'GREEK ACROPHONIC THESPIAN FIFTY',
        value: '𐅩',
        codepoint: 65897,
      },
      {
        name: 'GREEK ACROPHONIC THESPIAN ONE HUNDRED',
        value: '𐅪',
        codepoint: 65898,
      },
      {
        name: 'GREEK ACROPHONIC THESPIAN THREE HUNDRED',
        value: '𐅫',
        codepoint: 65899,
      },
      {
        name: 'GREEK ACROPHONIC EPIDAUREAN FIVE HUNDRED',
        value: '𐅬',
        codepoint: 65900,
      },
      {
        name: 'GREEK ACROPHONIC TROEZENIAN FIVE HUNDRED',
        value: '𐅭',
        codepoint: 65901,
      },
      {
        name: 'GREEK ACROPHONIC THESPIAN FIVE HUNDRED',
        value: '𐅮',
        codepoint: 65902,
      },
      {
        name: 'GREEK ACROPHONIC CARYSTIAN FIVE HUNDRED',
        value: '𐅯',
        codepoint: 65903,
      },
      {
        name: 'GREEK ACROPHONIC NAXIAN FIVE HUNDRED',
        value: '𐅰',
        codepoint: 65904,
      },
      {
        name: 'GREEK ACROPHONIC THESPIAN ONE THOUSAND',
        value: '𐅱',
        codepoint: 65905,
      },
      {
        name: 'GREEK ACROPHONIC THESPIAN FIVE THOUSAND',
        value: '𐅲',
        codepoint: 65906,
      },
      {
        name: 'GREEK ACROPHONIC DELPHIC FIVE MNAS',
        value: '𐅳',
        codepoint: 65907,
      },
      {
        name: 'GREEK ACROPHONIC STRATIAN FIFTY MNAS',
        value: '𐅴',
        codepoint: 65908,
      },
      {
        name: 'GREEK ONE HALF SIGN',
        value: '𐅵',
        codepoint: 65909,
      },
      {
        name: 'GREEK YEAR SIGN',
        value: '𐅹',
        codepoint: 65913,
      },
      {
        name: 'GREEK TALENT SIGN',
        value: '𐅺',
        codepoint: 65914,
      },
      {
        name: 'GREEK DRACHMA SIGN',
        value: '𐅻',
        codepoint: 65915,
      },
      {
        name: 'GREEK OBOL SIGN',
        value: '𐅼',
        codepoint: 65916,
      },
      {
        name: 'GREEK TWO OBOLS SIGN',
        value: '𐅽',
        codepoint: 65917,
      },
      {
        name: 'GREEK THREE OBOLS SIGN',
        value: '𐅾',
        codepoint: 65918,
      },
      {
        name: 'GREEK FOUR OBOLS SIGN',
        value: '𐅿',
        codepoint: 65919,
      },
      {
        name: 'GREEK FIVE OBOLS SIGN',
        value: '𐆀',
        codepoint: 65920,
      },
      {
        name: 'GREEK METRETES SIGN',
        value: '𐆁',
        codepoint: 65921,
      },
      {
        name: 'GREEK KYATHOS BASE SIGN',
        value: '𐆂',
        codepoint: 65922,
      },
      {
        name: 'GREEK OUNKIA SIGN',
        value: '𐆄',
        codepoint: 65924,
      },
      {
        name: 'GREEK XESTES SIGN',
        value: '𐆅',
        codepoint: 65925,
      },
      {
        name: 'GREEK ARTABE SIGN',
        value: '𐆆',
        codepoint: 65926,
      },
      {
        name: 'GREEK ZERO SIGN',
        value: '𐆊',
        codepoint: 65930,
      },
      {
        name: 'ROMAN SEXTANS SIGN',
        value: '𐆐',
        codepoint: 65936,
      },
      {
        name: 'ROMAN UNCIA SIGN',
        value: '𐆑',
        codepoint: 65937,
      },
      {
        name: 'ROMAN SEMUNCIA SIGN',
        value: '𐆒',
        codepoint: 65938,
      },
      {
        name: 'ROMAN SEXTULA SIGN',
        value: '𐆓',
        codepoint: 65939,
      },
      {
        name: 'ROMAN DIMIDIA SEXTULA SIGN',
        value: '𐆔',
        codepoint: 65940,
      },
      {
        name: 'ROMAN SILIQUA SIGN',
        value: '𐆕',
        codepoint: 65941,
      },
      {
        name: 'ROMAN DENARIUS SIGN',
        value: '𐆖',
        codepoint: 65942,
      },
      {
        name: 'ROMAN QUINARIUS SIGN',
        value: '𐆗',
        codepoint: 65943,
      },
      {
        name: 'ROMAN SESTERTIUS SIGN',
        value: '𐆘',
        codepoint: 65944,
      },
      {
        name: 'ROMAN DUPONDIUS SIGN',
        value: '𐆙',
        codepoint: 65945,
      },
      {
        name: 'ROMAN AS SIGN',
        value: '𐆚',
        codepoint: 65946,
      },
      {
        name: 'ROMAN CENTURIAL SIGN',
        value: '𐆛',
        codepoint: 65947,
      },
    ],
  },
  {
    name: 'Braille',
    symbols: [
      {
        name: 'BRAILLE PATTERN BLANK',
        value: '⠀',
        codepoint: 10240,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1',
        value: '⠁',
        codepoint: 10241,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2',
        value: '⠂',
        codepoint: 10242,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12',
        value: '⠃',
        codepoint: 10243,
      },
      {
        name: 'BRAILLE PATTERN DOTS-3',
        value: '⠄',
        codepoint: 10244,
      },
      {
        name: 'BRAILLE PATTERN DOTS-13',
        value: '⠅',
        codepoint: 10245,
      },
      {
        name: 'BRAILLE PATTERN DOTS-23',
        value: '⠆',
        codepoint: 10246,
      },
      {
        name: 'BRAILLE PATTERN DOTS-123',
        value: '⠇',
        codepoint: 10247,
      },
      {
        name: 'BRAILLE PATTERN DOTS-4',
        value: '⠈',
        codepoint: 10248,
      },
      {
        name: 'BRAILLE PATTERN DOTS-14',
        value: '⠉',
        codepoint: 10249,
      },
      {
        name: 'BRAILLE PATTERN DOTS-24',
        value: '⠊',
        codepoint: 10250,
      },
      {
        name: 'BRAILLE PATTERN DOTS-124',
        value: '⠋',
        codepoint: 10251,
      },
      {
        name: 'BRAILLE PATTERN DOTS-34',
        value: '⠌',
        codepoint: 10252,
      },
      {
        name: 'BRAILLE PATTERN DOTS-134',
        value: '⠍',
        codepoint: 10253,
      },
      {
        name: 'BRAILLE PATTERN DOTS-234',
        value: '⠎',
        codepoint: 10254,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1234',
        value: '⠏',
        codepoint: 10255,
      },
      {
        name: 'BRAILLE PATTERN DOTS-5',
        value: '⠐',
        codepoint: 10256,
      },
      {
        name: 'BRAILLE PATTERN DOTS-15',
        value: '⠑',
        codepoint: 10257,
      },
      {
        name: 'BRAILLE PATTERN DOTS-25',
        value: '⠒',
        codepoint: 10258,
      },
      {
        name: 'BRAILLE PATTERN DOTS-125',
        value: '⠓',
        codepoint: 10259,
      },
      {
        name: 'BRAILLE PATTERN DOTS-35',
        value: '⠔',
        codepoint: 10260,
      },
      {
        name: 'BRAILLE PATTERN DOTS-135',
        value: '⠕',
        codepoint: 10261,
      },
      {
        name: 'BRAILLE PATTERN DOTS-235',
        value: '⠖',
        codepoint: 10262,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1235',
        value: '⠗',
        codepoint: 10263,
      },
      {
        name: 'BRAILLE PATTERN DOTS-45',
        value: '⠘',
        codepoint: 10264,
      },
      {
        name: 'BRAILLE PATTERN DOTS-145',
        value: '⠙',
        codepoint: 10265,
      },
      {
        name: 'BRAILLE PATTERN DOTS-245',
        value: '⠚',
        codepoint: 10266,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1245',
        value: '⠛',
        codepoint: 10267,
      },
      {
        name: 'BRAILLE PATTERN DOTS-345',
        value: '⠜',
        codepoint: 10268,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1345',
        value: '⠝',
        codepoint: 10269,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2345',
        value: '⠞',
        codepoint: 10270,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12345',
        value: '⠟',
        codepoint: 10271,
      },
      {
        name: 'BRAILLE PATTERN DOTS-6',
        value: '⠠',
        codepoint: 10272,
      },
      {
        name: 'BRAILLE PATTERN DOTS-16',
        value: '⠡',
        codepoint: 10273,
      },
      {
        name: 'BRAILLE PATTERN DOTS-26',
        value: '⠢',
        codepoint: 10274,
      },
      {
        name: 'BRAILLE PATTERN DOTS-126',
        value: '⠣',
        codepoint: 10275,
      },
      {
        name: 'BRAILLE PATTERN DOTS-36',
        value: '⠤',
        codepoint: 10276,
      },
      {
        name: 'BRAILLE PATTERN DOTS-136',
        value: '⠥',
        codepoint: 10277,
      },
      {
        name: 'BRAILLE PATTERN DOTS-236',
        value: '⠦',
        codepoint: 10278,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1236',
        value: '⠧',
        codepoint: 10279,
      },
      {
        name: 'BRAILLE PATTERN DOTS-46',
        value: '⠨',
        codepoint: 10280,
      },
      {
        name: 'BRAILLE PATTERN DOTS-146',
        value: '⠩',
        codepoint: 10281,
      },
      {
        name: 'BRAILLE PATTERN DOTS-246',
        value: '⠪',
        codepoint: 10282,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1246',
        value: '⠫',
        codepoint: 10283,
      },
      {
        name: 'BRAILLE PATTERN DOTS-346',
        value: '⠬',
        codepoint: 10284,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1346',
        value: '⠭',
        codepoint: 10285,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2346',
        value: '⠮',
        codepoint: 10286,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12346',
        value: '⠯',
        codepoint: 10287,
      },
      {
        name: 'BRAILLE PATTERN DOTS-56',
        value: '⠰',
        codepoint: 10288,
      },
      {
        name: 'BRAILLE PATTERN DOTS-156',
        value: '⠱',
        codepoint: 10289,
      },
      {
        name: 'BRAILLE PATTERN DOTS-256',
        value: '⠲',
        codepoint: 10290,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1256',
        value: '⠳',
        codepoint: 10291,
      },
      {
        name: 'BRAILLE PATTERN DOTS-356',
        value: '⠴',
        codepoint: 10292,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1356',
        value: '⠵',
        codepoint: 10293,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2356',
        value: '⠶',
        codepoint: 10294,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12356',
        value: '⠷',
        codepoint: 10295,
      },
      {
        name: 'BRAILLE PATTERN DOTS-456',
        value: '⠸',
        codepoint: 10296,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1456',
        value: '⠹',
        codepoint: 10297,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2456',
        value: '⠺',
        codepoint: 10298,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12456',
        value: '⠻',
        codepoint: 10299,
      },
      {
        name: 'BRAILLE PATTERN DOTS-3456',
        value: '⠼',
        codepoint: 10300,
      },
      {
        name: 'BRAILLE PATTERN DOTS-13456',
        value: '⠽',
        codepoint: 10301,
      },
      {
        name: 'BRAILLE PATTERN DOTS-23456',
        value: '⠾',
        codepoint: 10302,
      },
      {
        name: 'BRAILLE PATTERN DOTS-123456',
        value: '⠿',
        codepoint: 10303,
      },
      {
        name: 'BRAILLE PATTERN DOTS-7',
        value: '⡀',
        codepoint: 10304,
      },
      {
        name: 'BRAILLE PATTERN DOTS-17',
        value: '⡁',
        codepoint: 10305,
      },
      {
        name: 'BRAILLE PATTERN DOTS-27',
        value: '⡂',
        codepoint: 10306,
      },
      {
        name: 'BRAILLE PATTERN DOTS-127',
        value: '⡃',
        codepoint: 10307,
      },
      {
        name: 'BRAILLE PATTERN DOTS-37',
        value: '⡄',
        codepoint: 10308,
      },
      {
        name: 'BRAILLE PATTERN DOTS-137',
        value: '⡅',
        codepoint: 10309,
      },
      {
        name: 'BRAILLE PATTERN DOTS-237',
        value: '⡆',
        codepoint: 10310,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1237',
        value: '⡇',
        codepoint: 10311,
      },
      {
        name: 'BRAILLE PATTERN DOTS-47',
        value: '⡈',
        codepoint: 10312,
      },
      {
        name: 'BRAILLE PATTERN DOTS-147',
        value: '⡉',
        codepoint: 10313,
      },
      {
        name: 'BRAILLE PATTERN DOTS-247',
        value: '⡊',
        codepoint: 10314,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1247',
        value: '⡋',
        codepoint: 10315,
      },
      {
        name: 'BRAILLE PATTERN DOTS-347',
        value: '⡌',
        codepoint: 10316,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1347',
        value: '⡍',
        codepoint: 10317,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2347',
        value: '⡎',
        codepoint: 10318,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12347',
        value: '⡏',
        codepoint: 10319,
      },
      {
        name: 'BRAILLE PATTERN DOTS-57',
        value: '⡐',
        codepoint: 10320,
      },
      {
        name: 'BRAILLE PATTERN DOTS-157',
        value: '⡑',
        codepoint: 10321,
      },
      {
        name: 'BRAILLE PATTERN DOTS-257',
        value: '⡒',
        codepoint: 10322,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1257',
        value: '⡓',
        codepoint: 10323,
      },
      {
        name: 'BRAILLE PATTERN DOTS-357',
        value: '⡔',
        codepoint: 10324,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1357',
        value: '⡕',
        codepoint: 10325,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2357',
        value: '⡖',
        codepoint: 10326,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12357',
        value: '⡗',
        codepoint: 10327,
      },
      {
        name: 'BRAILLE PATTERN DOTS-457',
        value: '⡘',
        codepoint: 10328,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1457',
        value: '⡙',
        codepoint: 10329,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2457',
        value: '⡚',
        codepoint: 10330,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12457',
        value: '⡛',
        codepoint: 10331,
      },
      {
        name: 'BRAILLE PATTERN DOTS-3457',
        value: '⡜',
        codepoint: 10332,
      },
      {
        name: 'BRAILLE PATTERN DOTS-13457',
        value: '⡝',
        codepoint: 10333,
      },
      {
        name: 'BRAILLE PATTERN DOTS-23457',
        value: '⡞',
        codepoint: 10334,
      },
      {
        name: 'BRAILLE PATTERN DOTS-123457',
        value: '⡟',
        codepoint: 10335,
      },
      {
        name: 'BRAILLE PATTERN DOTS-67',
        value: '⡠',
        codepoint: 10336,
      },
      {
        name: 'BRAILLE PATTERN DOTS-167',
        value: '⡡',
        codepoint: 10337,
      },
      {
        name: 'BRAILLE PATTERN DOTS-267',
        value: '⡢',
        codepoint: 10338,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1267',
        value: '⡣',
        codepoint: 10339,
      },
      {
        name: 'BRAILLE PATTERN DOTS-367',
        value: '⡤',
        codepoint: 10340,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1367',
        value: '⡥',
        codepoint: 10341,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2367',
        value: '⡦',
        codepoint: 10342,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12367',
        value: '⡧',
        codepoint: 10343,
      },
      {
        name: 'BRAILLE PATTERN DOTS-467',
        value: '⡨',
        codepoint: 10344,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1467',
        value: '⡩',
        codepoint: 10345,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2467',
        value: '⡪',
        codepoint: 10346,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12467',
        value: '⡫',
        codepoint: 10347,
      },
      {
        name: 'BRAILLE PATTERN DOTS-3467',
        value: '⡬',
        codepoint: 10348,
      },
      {
        name: 'BRAILLE PATTERN DOTS-13467',
        value: '⡭',
        codepoint: 10349,
      },
      {
        name: 'BRAILLE PATTERN DOTS-23467',
        value: '⡮',
        codepoint: 10350,
      },
      {
        name: 'BRAILLE PATTERN DOTS-123467',
        value: '⡯',
        codepoint: 10351,
      },
      {
        name: 'BRAILLE PATTERN DOTS-567',
        value: '⡰',
        codepoint: 10352,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1567',
        value: '⡱',
        codepoint: 10353,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2567',
        value: '⡲',
        codepoint: 10354,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12567',
        value: '⡳',
        codepoint: 10355,
      },
      {
        name: 'BRAILLE PATTERN DOTS-3567',
        value: '⡴',
        codepoint: 10356,
      },
      {
        name: 'BRAILLE PATTERN DOTS-13567',
        value: '⡵',
        codepoint: 10357,
      },
      {
        name: 'BRAILLE PATTERN DOTS-23567',
        value: '⡶',
        codepoint: 10358,
      },
      {
        name: 'BRAILLE PATTERN DOTS-123567',
        value: '⡷',
        codepoint: 10359,
      },
      {
        name: 'BRAILLE PATTERN DOTS-4567',
        value: '⡸',
        codepoint: 10360,
      },
      {
        name: 'BRAILLE PATTERN DOTS-14567',
        value: '⡹',
        codepoint: 10361,
      },
      {
        name: 'BRAILLE PATTERN DOTS-24567',
        value: '⡺',
        codepoint: 10362,
      },
      {
        name: 'BRAILLE PATTERN DOTS-124567',
        value: '⡻',
        codepoint: 10363,
      },
      {
        name: 'BRAILLE PATTERN DOTS-34567',
        value: '⡼',
        codepoint: 10364,
      },
      {
        name: 'BRAILLE PATTERN DOTS-134567',
        value: '⡽',
        codepoint: 10365,
      },
      {
        name: 'BRAILLE PATTERN DOTS-234567',
        value: '⡾',
        codepoint: 10366,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1234567',
        value: '⡿',
        codepoint: 10367,
      },
      {
        name: 'BRAILLE PATTERN DOTS-8',
        value: '⢀',
        codepoint: 10368,
      },
      {
        name: 'BRAILLE PATTERN DOTS-18',
        value: '⢁',
        codepoint: 10369,
      },
      {
        name: 'BRAILLE PATTERN DOTS-28',
        value: '⢂',
        codepoint: 10370,
      },
      {
        name: 'BRAILLE PATTERN DOTS-128',
        value: '⢃',
        codepoint: 10371,
      },
      {
        name: 'BRAILLE PATTERN DOTS-38',
        value: '⢄',
        codepoint: 10372,
      },
      {
        name: 'BRAILLE PATTERN DOTS-138',
        value: '⢅',
        codepoint: 10373,
      },
      {
        name: 'BRAILLE PATTERN DOTS-238',
        value: '⢆',
        codepoint: 10374,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1238',
        value: '⢇',
        codepoint: 10375,
      },
      {
        name: 'BRAILLE PATTERN DOTS-48',
        value: '⢈',
        codepoint: 10376,
      },
      {
        name: 'BRAILLE PATTERN DOTS-148',
        value: '⢉',
        codepoint: 10377,
      },
      {
        name: 'BRAILLE PATTERN DOTS-248',
        value: '⢊',
        codepoint: 10378,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1248',
        value: '⢋',
        codepoint: 10379,
      },
      {
        name: 'BRAILLE PATTERN DOTS-348',
        value: '⢌',
        codepoint: 10380,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1348',
        value: '⢍',
        codepoint: 10381,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2348',
        value: '⢎',
        codepoint: 10382,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12348',
        value: '⢏',
        codepoint: 10383,
      },
      {
        name: 'BRAILLE PATTERN DOTS-58',
        value: '⢐',
        codepoint: 10384,
      },
      {
        name: 'BRAILLE PATTERN DOTS-158',
        value: '⢑',
        codepoint: 10385,
      },
      {
        name: 'BRAILLE PATTERN DOTS-258',
        value: '⢒',
        codepoint: 10386,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1258',
        value: '⢓',
        codepoint: 10387,
      },
      {
        name: 'BRAILLE PATTERN DOTS-358',
        value: '⢔',
        codepoint: 10388,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1358',
        value: '⢕',
        codepoint: 10389,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2358',
        value: '⢖',
        codepoint: 10390,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12358',
        value: '⢗',
        codepoint: 10391,
      },
      {
        name: 'BRAILLE PATTERN DOTS-458',
        value: '⢘',
        codepoint: 10392,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1458',
        value: '⢙',
        codepoint: 10393,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2458',
        value: '⢚',
        codepoint: 10394,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12458',
        value: '⢛',
        codepoint: 10395,
      },
      {
        name: 'BRAILLE PATTERN DOTS-3458',
        value: '⢜',
        codepoint: 10396,
      },
      {
        name: 'BRAILLE PATTERN DOTS-13458',
        value: '⢝',
        codepoint: 10397,
      },
      {
        name: 'BRAILLE PATTERN DOTS-23458',
        value: '⢞',
        codepoint: 10398,
      },
      {
        name: 'BRAILLE PATTERN DOTS-123458',
        value: '⢟',
        codepoint: 10399,
      },
      {
        name: 'BRAILLE PATTERN DOTS-68',
        value: '⢠',
        codepoint: 10400,
      },
      {
        name: 'BRAILLE PATTERN DOTS-168',
        value: '⢡',
        codepoint: 10401,
      },
      {
        name: 'BRAILLE PATTERN DOTS-268',
        value: '⢢',
        codepoint: 10402,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1268',
        value: '⢣',
        codepoint: 10403,
      },
      {
        name: 'BRAILLE PATTERN DOTS-368',
        value: '⢤',
        codepoint: 10404,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1368',
        value: '⢥',
        codepoint: 10405,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2368',
        value: '⢦',
        codepoint: 10406,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12368',
        value: '⢧',
        codepoint: 10407,
      },
      {
        name: 'BRAILLE PATTERN DOTS-468',
        value: '⢨',
        codepoint: 10408,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1468',
        value: '⢩',
        codepoint: 10409,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2468',
        value: '⢪',
        codepoint: 10410,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12468',
        value: '⢫',
        codepoint: 10411,
      },
      {
        name: 'BRAILLE PATTERN DOTS-3468',
        value: '⢬',
        codepoint: 10412,
      },
      {
        name: 'BRAILLE PATTERN DOTS-13468',
        value: '⢭',
        codepoint: 10413,
      },
      {
        name: 'BRAILLE PATTERN DOTS-23468',
        value: '⢮',
        codepoint: 10414,
      },
      {
        name: 'BRAILLE PATTERN DOTS-123468',
        value: '⢯',
        codepoint: 10415,
      },
      {
        name: 'BRAILLE PATTERN DOTS-568',
        value: '⢰',
        codepoint: 10416,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1568',
        value: '⢱',
        codepoint: 10417,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2568',
        value: '⢲',
        codepoint: 10418,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12568',
        value: '⢳',
        codepoint: 10419,
      },
      {
        name: 'BRAILLE PATTERN DOTS-3568',
        value: '⢴',
        codepoint: 10420,
      },
      {
        name: 'BRAILLE PATTERN DOTS-13568',
        value: '⢵',
        codepoint: 10421,
      },
      {
        name: 'BRAILLE PATTERN DOTS-23568',
        value: '⢶',
        codepoint: 10422,
      },
      {
        name: 'BRAILLE PATTERN DOTS-123568',
        value: '⢷',
        codepoint: 10423,
      },
      {
        name: 'BRAILLE PATTERN DOTS-4568',
        value: '⢸',
        codepoint: 10424,
      },
      {
        name: 'BRAILLE PATTERN DOTS-14568',
        value: '⢹',
        codepoint: 10425,
      },
      {
        name: 'BRAILLE PATTERN DOTS-24568',
        value: '⢺',
        codepoint: 10426,
      },
      {
        name: 'BRAILLE PATTERN DOTS-124568',
        value: '⢻',
        codepoint: 10427,
      },
      {
        name: 'BRAILLE PATTERN DOTS-34568',
        value: '⢼',
        codepoint: 10428,
      },
      {
        name: 'BRAILLE PATTERN DOTS-134568',
        value: '⢽',
        codepoint: 10429,
      },
      {
        name: 'BRAILLE PATTERN DOTS-234568',
        value: '⢾',
        codepoint: 10430,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1234568',
        value: '⢿',
        codepoint: 10431,
      },
      {
        name: 'BRAILLE PATTERN DOTS-78',
        value: '⣀',
        codepoint: 10432,
      },
      {
        name: 'BRAILLE PATTERN DOTS-178',
        value: '⣁',
        codepoint: 10433,
      },
      {
        name: 'BRAILLE PATTERN DOTS-278',
        value: '⣂',
        codepoint: 10434,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1278',
        value: '⣃',
        codepoint: 10435,
      },
      {
        name: 'BRAILLE PATTERN DOTS-378',
        value: '⣄',
        codepoint: 10436,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1378',
        value: '⣅',
        codepoint: 10437,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2378',
        value: '⣆',
        codepoint: 10438,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12378',
        value: '⣇',
        codepoint: 10439,
      },
      {
        name: 'BRAILLE PATTERN DOTS-478',
        value: '⣈',
        codepoint: 10440,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1478',
        value: '⣉',
        codepoint: 10441,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2478',
        value: '⣊',
        codepoint: 10442,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12478',
        value: '⣋',
        codepoint: 10443,
      },
      {
        name: 'BRAILLE PATTERN DOTS-3478',
        value: '⣌',
        codepoint: 10444,
      },
      {
        name: 'BRAILLE PATTERN DOTS-13478',
        value: '⣍',
        codepoint: 10445,
      },
      {
        name: 'BRAILLE PATTERN DOTS-23478',
        value: '⣎',
        codepoint: 10446,
      },
      {
        name: 'BRAILLE PATTERN DOTS-123478',
        value: '⣏',
        codepoint: 10447,
      },
      {
        name: 'BRAILLE PATTERN DOTS-578',
        value: '⣐',
        codepoint: 10448,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1578',
        value: '⣑',
        codepoint: 10449,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2578',
        value: '⣒',
        codepoint: 10450,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12578',
        value: '⣓',
        codepoint: 10451,
      },
      {
        name: 'BRAILLE PATTERN DOTS-3578',
        value: '⣔',
        codepoint: 10452,
      },
      {
        name: 'BRAILLE PATTERN DOTS-13578',
        value: '⣕',
        codepoint: 10453,
      },
      {
        name: 'BRAILLE PATTERN DOTS-23578',
        value: '⣖',
        codepoint: 10454,
      },
      {
        name: 'BRAILLE PATTERN DOTS-123578',
        value: '⣗',
        codepoint: 10455,
      },
      {
        name: 'BRAILLE PATTERN DOTS-4578',
        value: '⣘',
        codepoint: 10456,
      },
      {
        name: 'BRAILLE PATTERN DOTS-14578',
        value: '⣙',
        codepoint: 10457,
      },
      {
        name: 'BRAILLE PATTERN DOTS-24578',
        value: '⣚',
        codepoint: 10458,
      },
      {
        name: 'BRAILLE PATTERN DOTS-124578',
        value: '⣛',
        codepoint: 10459,
      },
      {
        name: 'BRAILLE PATTERN DOTS-34578',
        value: '⣜',
        codepoint: 10460,
      },
      {
        name: 'BRAILLE PATTERN DOTS-134578',
        value: '⣝',
        codepoint: 10461,
      },
      {
        name: 'BRAILLE PATTERN DOTS-234578',
        value: '⣞',
        codepoint: 10462,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1234578',
        value: '⣟',
        codepoint: 10463,
      },
      {
        name: 'BRAILLE PATTERN DOTS-678',
        value: '⣠',
        codepoint: 10464,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1678',
        value: '⣡',
        codepoint: 10465,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2678',
        value: '⣢',
        codepoint: 10466,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12678',
        value: '⣣',
        codepoint: 10467,
      },
      {
        name: 'BRAILLE PATTERN DOTS-3678',
        value: '⣤',
        codepoint: 10468,
      },
      {
        name: 'BRAILLE PATTERN DOTS-13678',
        value: '⣥',
        codepoint: 10469,
      },
      {
        name: 'BRAILLE PATTERN DOTS-23678',
        value: '⣦',
        codepoint: 10470,
      },
      {
        name: 'BRAILLE PATTERN DOTS-123678',
        value: '⣧',
        codepoint: 10471,
      },
      {
        name: 'BRAILLE PATTERN DOTS-4678',
        value: '⣨',
        codepoint: 10472,
      },
      {
        name: 'BRAILLE PATTERN DOTS-14678',
        value: '⣩',
        codepoint: 10473,
      },
      {
        name: 'BRAILLE PATTERN DOTS-24678',
        value: '⣪',
        codepoint: 10474,
      },
      {
        name: 'BRAILLE PATTERN DOTS-124678',
        value: '⣫',
        codepoint: 10475,
      },
      {
        name: 'BRAILLE PATTERN DOTS-34678',
        value: '⣬',
        codepoint: 10476,
      },
      {
        name: 'BRAILLE PATTERN DOTS-134678',
        value: '⣭',
        codepoint: 10477,
      },
      {
        name: 'BRAILLE PATTERN DOTS-234678',
        value: '⣮',
        codepoint: 10478,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1234678',
        value: '⣯',
        codepoint: 10479,
      },
      {
        name: 'BRAILLE PATTERN DOTS-5678',
        value: '⣰',
        codepoint: 10480,
      },
      {
        name: 'BRAILLE PATTERN DOTS-15678',
        value: '⣱',
        codepoint: 10481,
      },
      {
        name: 'BRAILLE PATTERN DOTS-25678',
        value: '⣲',
        codepoint: 10482,
      },
      {
        name: 'BRAILLE PATTERN DOTS-125678',
        value: '⣳',
        codepoint: 10483,
      },
      {
        name: 'BRAILLE PATTERN DOTS-35678',
        value: '⣴',
        codepoint: 10484,
      },
      {
        name: 'BRAILLE PATTERN DOTS-135678',
        value: '⣵',
        codepoint: 10485,
      },
      {
        name: 'BRAILLE PATTERN DOTS-235678',
        value: '⣶',
        codepoint: 10486,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1235678',
        value: '⣷',
        codepoint: 10487,
      },
      {
        name: 'BRAILLE PATTERN DOTS-45678',
        value: '⣸',
        codepoint: 10488,
      },
      {
        name: 'BRAILLE PATTERN DOTS-145678',
        value: '⣹',
        codepoint: 10489,
      },
      {
        name: 'BRAILLE PATTERN DOTS-245678',
        value: '⣺',
        codepoint: 10490,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1245678',
        value: '⣻',
        codepoint: 10491,
      },
      {
        name: 'BRAILLE PATTERN DOTS-345678',
        value: '⣼',
        codepoint: 10492,
      },
      {
        name: 'BRAILLE PATTERN DOTS-1345678',
        value: '⣽',
        codepoint: 10493,
      },
      {
        name: 'BRAILLE PATTERN DOTS-2345678',
        value: '⣾',
        codepoint: 10494,
      },
      {
        name: 'BRAILLE PATTERN DOTS-12345678',
        value: '⣿',
        codepoint: 10495,
      },
    ],
  },
  {
    name: 'Currency',
    symbols: [
      {
        name: 'EURO-CURRENCY SIGN',
        value: '₠',
        codepoint: 8352,
      },
      {
        name: 'COLON SIGN',
        value: '₡',
        codepoint: 8353,
      },
      {
        name: 'CRUZEIRO SIGN',
        value: '₢',
        codepoint: 8354,
      },
      {
        name: 'FRENCH FRANC SIGN',
        value: '₣',
        codepoint: 8355,
      },
      {
        name: 'LIRA SIGN',
        value: '₤',
        codepoint: 8356,
      },
      {
        name: 'MILL SIGN',
        value: '₥',
        codepoint: 8357,
      },
      {
        name: 'NAIRA SIGN',
        value: '₦',
        codepoint: 8358,
      },
      {
        name: 'PESETA SIGN',
        value: '₧',
        codepoint: 8359,
      },
      {
        name: 'RUPEE SIGN',
        value: '₨',
        codepoint: 8360,
      },
      {
        name: 'WON SIGN',
        value: '₩',
        codepoint: 8361,
      },
      {
        name: 'NEW SHEQEL SIGN',
        value: '₪',
        codepoint: 8362,
      },
      {
        name: 'DONG SIGN',
        value: '₫',
        codepoint: 8363,
      },
      {
        name: 'EURO SIGN',
        value: '€',
        codepoint: 8364,
      },
      {
        name: 'KIP SIGN',
        value: '₭',
        codepoint: 8365,
      },
      {
        name: 'TUGRIK SIGN',
        value: '₮',
        codepoint: 8366,
      },
      {
        name: 'DRACHMA SIGN',
        value: '₯',
        codepoint: 8367,
      },
      {
        name: 'GERMAN PENNY SIGN',
        value: '₰',
        codepoint: 8368,
      },
      {
        name: 'PESO SIGN',
        value: '₱',
        codepoint: 8369,
      },
      {
        name: 'GUARANI SIGN',
        value: '₲',
        codepoint: 8370,
      },
      {
        name: 'AUSTRAL SIGN',
        value: '₳',
        codepoint: 8371,
      },
      {
        name: 'HRYVNIA SIGN',
        value: '₴',
        codepoint: 8372,
      },
      {
        name: 'CEDI SIGN',
        value: '₵',
        codepoint: 8373,
      },
      {
        name: 'LIVRE TOURNOIS SIGN',
        value: '₶',
        codepoint: 8374,
      },
      {
        name: 'SPESMILO SIGN',
        value: '₷',
        codepoint: 8375,
      },
      {
        name: 'TENGE SIGN',
        value: '₸',
        codepoint: 8376,
      },
      {
        name: 'INDIAN RUPEE SIGN',
        value: '₹',
        codepoint: 8377,
      },
    ],
  },
  {
    name: 'Game Symbols',
    symbols: [
      {
        name: 'MAHJONG TILE EAST WIND',
        value: '🀀',
        codepoint: 126976,
      },
      {
        name: 'MAHJONG TILE SOUTH WIND',
        value: '🀁',
        codepoint: 126977,
      },
      {
        name: 'MAHJONG TILE WEST WIND',
        value: '🀂',
        codepoint: 126978,
      },
      {
        name: 'MAHJONG TILE NORTH WIND',
        value: '🀃',
        codepoint: 126979,
      },
      {
        name: 'MAHJONG TILE GREEN DRAGON',
        value: '🀅',
        codepoint: 126981,
      },
      {
        name: 'MAHJONG TILE WHITE DRAGON',
        value: '🀆',
        codepoint: 126982,
      },
      {
        name: 'MAHJONG TILE ONE OF CHARACTERS',
        value: '🀇',
        codepoint: 126983,
      },
      {
        name: 'MAHJONG TILE TWO OF CHARACTERS',
        value: '🀈',
        codepoint: 126984,
      },
      {
        name: 'MAHJONG TILE THREE OF CHARACTERS',
        value: '🀉',
        codepoint: 126985,
      },
      {
        name: 'MAHJONG TILE FOUR OF CHARACTERS',
        value: '🀊',
        codepoint: 126986,
      },
      {
        name: 'MAHJONG TILE FIVE OF CHARACTERS',
        value: '🀋',
        codepoint: 126987,
      },
      {
        name: 'MAHJONG TILE SIX OF CHARACTERS',
        value: '🀌',
        codepoint: 126988,
      },
      {
        name: 'MAHJONG TILE SEVEN OF CHARACTERS',
        value: '🀍',
        codepoint: 126989,
      },
      {
        name: 'MAHJONG TILE EIGHT OF CHARACTERS',
        value: '🀎',
        codepoint: 126990,
      },
      {
        name: 'MAHJONG TILE NINE OF CHARACTERS',
        value: '🀏',
        codepoint: 126991,
      },
      {
        name: 'MAHJONG TILE ONE OF BAMBOOS',
        value: '🀐',
        codepoint: 126992,
      },
      {
        name: 'MAHJONG TILE TWO OF BAMBOOS',
        value: '🀑',
        codepoint: 126993,
      },
      {
        name: 'MAHJONG TILE THREE OF BAMBOOS',
        value: '🀒',
        codepoint: 126994,
      },
      {
        name: 'MAHJONG TILE FOUR OF BAMBOOS',
        value: '🀓',
        codepoint: 126995,
      },
      {
        name: 'MAHJONG TILE FIVE OF BAMBOOS',
        value: '🀔',
        codepoint: 126996,
      },
      {
        name: 'MAHJONG TILE SIX OF BAMBOOS',
        value: '🀕',
        codepoint: 126997,
      },
      {
        name: 'MAHJONG TILE SEVEN OF BAMBOOS',
        value: '🀖',
        codepoint: 126998,
      },
      {
        name: 'MAHJONG TILE EIGHT OF BAMBOOS',
        value: '🀗',
        codepoint: 126999,
      },
      {
        name: 'MAHJONG TILE NINE OF BAMBOOS',
        value: '🀘',
        codepoint: 127000,
      },
      {
        name: 'MAHJONG TILE ONE OF CIRCLES',
        value: '🀙',
        codepoint: 127001,
      },
      {
        name: 'MAHJONG TILE TWO OF CIRCLES',
        value: '🀚',
        codepoint: 127002,
      },
      {
        name: 'MAHJONG TILE THREE OF CIRCLES',
        value: '🀛',
        codepoint: 127003,
      },
      {
        name: 'MAHJONG TILE FOUR OF CIRCLES',
        value: '🀜',
        codepoint: 127004,
      },
      {
        name: 'MAHJONG TILE FIVE OF CIRCLES',
        value: '🀝',
        codepoint: 127005,
      },
      {
        name: 'MAHJONG TILE SIX OF CIRCLES',
        value: '🀞',
        codepoint: 127006,
      },
      {
        name: 'MAHJONG TILE SEVEN OF CIRCLES',
        value: '🀟',
        codepoint: 127007,
      },
      {
        name: 'MAHJONG TILE EIGHT OF CIRCLES',
        value: '🀠',
        codepoint: 127008,
      },
      {
        name: 'MAHJONG TILE NINE OF CIRCLES',
        value: '🀡',
        codepoint: 127009,
      },
      {
        name: 'MAHJONG TILE PLUM',
        value: '🀢',
        codepoint: 127010,
      },
      {
        name: 'MAHJONG TILE ORCHID',
        value: '🀣',
        codepoint: 127011,
      },
      {
        name: 'MAHJONG TILE BAMBOO',
        value: '🀤',
        codepoint: 127012,
      },
      {
        name: 'MAHJONG TILE CHRYSANTHEMUM',
        value: '🀥',
        codepoint: 127013,
      },
      {
        name: 'MAHJONG TILE SPRING',
        value: '🀦',
        codepoint: 127014,
      },
      {
        name: 'MAHJONG TILE SUMMER',
        value: '🀧',
        codepoint: 127015,
      },
      {
        name: 'MAHJONG TILE AUTUMN',
        value: '🀨',
        codepoint: 127016,
      },
      {
        name: 'MAHJONG TILE WINTER',
        value: '🀩',
        codepoint: 127017,
      },
      {
        name: 'MAHJONG TILE JOKER',
        value: '🀪',
        codepoint: 127018,
      },
      {
        name: 'MAHJONG TILE BACK',
        value: '🀫',
        codepoint: 127019,
      },
      {
        name: 'DOMINO TILE HORIZONTAL BACK',
        value: '🀰',
        codepoint: 127024,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-00-00',
        value: '🀱',
        codepoint: 127025,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-00-01',
        value: '🀲',
        codepoint: 127026,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-00-02',
        value: '🀳',
        codepoint: 127027,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-00-03',
        value: '🀴',
        codepoint: 127028,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-00-04',
        value: '🀵',
        codepoint: 127029,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-00-05',
        value: '🀶',
        codepoint: 127030,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-00-06',
        value: '🀷',
        codepoint: 127031,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-01-00',
        value: '🀸',
        codepoint: 127032,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-01-01',
        value: '🀹',
        codepoint: 127033,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-01-02',
        value: '🀺',
        codepoint: 127034,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-01-03',
        value: '🀻',
        codepoint: 127035,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-01-04',
        value: '🀼',
        codepoint: 127036,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-01-05',
        value: '🀽',
        codepoint: 127037,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-01-06',
        value: '🀾',
        codepoint: 127038,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-02-00',
        value: '🀿',
        codepoint: 127039,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-02-01',
        value: '🁀',
        codepoint: 127040,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-02-02',
        value: '🁁',
        codepoint: 127041,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-02-03',
        value: '🁂',
        codepoint: 127042,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-02-04',
        value: '🁃',
        codepoint: 127043,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-02-05',
        value: '🁄',
        codepoint: 127044,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-02-06',
        value: '🁅',
        codepoint: 127045,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-03-00',
        value: '🁆',
        codepoint: 127046,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-03-01',
        value: '🁇',
        codepoint: 127047,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-03-02',
        value: '🁈',
        codepoint: 127048,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-03-03',
        value: '🁉',
        codepoint: 127049,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-03-04',
        value: '🁊',
        codepoint: 127050,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-03-05',
        value: '🁋',
        codepoint: 127051,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-03-06',
        value: '🁌',
        codepoint: 127052,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-04-00',
        value: '🁍',
        codepoint: 127053,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-04-01',
        value: '🁎',
        codepoint: 127054,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-04-02',
        value: '🁏',
        codepoint: 127055,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-04-03',
        value: '🁐',
        codepoint: 127056,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-04-04',
        value: '🁑',
        codepoint: 127057,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-04-05',
        value: '🁒',
        codepoint: 127058,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-04-06',
        value: '🁓',
        codepoint: 127059,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-05-00',
        value: '🁔',
        codepoint: 127060,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-05-01',
        value: '🁕',
        codepoint: 127061,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-05-02',
        value: '🁖',
        codepoint: 127062,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-05-03',
        value: '🁗',
        codepoint: 127063,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-05-04',
        value: '🁘',
        codepoint: 127064,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-05-05',
        value: '🁙',
        codepoint: 127065,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-05-06',
        value: '🁚',
        codepoint: 127066,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-06-00',
        value: '🁛',
        codepoint: 127067,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-06-01',
        value: '🁜',
        codepoint: 127068,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-06-02',
        value: '🁝',
        codepoint: 127069,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-06-03',
        value: '🁞',
        codepoint: 127070,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-06-04',
        value: '🁟',
        codepoint: 127071,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-06-05',
        value: '🁠',
        codepoint: 127072,
      },
      {
        name: 'DOMINO TILE HORIZONTAL-06-06',
        value: '🁡',
        codepoint: 127073,
      },
      {
        name: 'DOMINO TILE VERTICAL BACK',
        value: '🁢',
        codepoint: 127074,
      },
      {
        name: 'DOMINO TILE VERTICAL-00-00',
        value: '🁣',
        codepoint: 127075,
      },
      {
        name: 'DOMINO TILE VERTICAL-00-01',
        value: '🁤',
        codepoint: 127076,
      },
      {
        name: 'DOMINO TILE VERTICAL-00-02',
        value: '🁥',
        codepoint: 127077,
      },
      {
        name: 'DOMINO TILE VERTICAL-00-03',
        value: '🁦',
        codepoint: 127078,
      },
      {
        name: 'DOMINO TILE VERTICAL-00-04',
        value: '🁧',
        codepoint: 127079,
      },
      {
        name: 'DOMINO TILE VERTICAL-00-05',
        value: '🁨',
        codepoint: 127080,
      },
      {
        name: 'DOMINO TILE VERTICAL-00-06',
        value: '🁩',
        codepoint: 127081,
      },
      {
        name: 'DOMINO TILE VERTICAL-01-00',
        value: '🁪',
        codepoint: 127082,
      },
      {
        name: 'DOMINO TILE VERTICAL-01-01',
        value: '🁫',
        codepoint: 127083,
      },
      {
        name: 'DOMINO TILE VERTICAL-01-02',
        value: '🁬',
        codepoint: 127084,
      },
      {
        name: 'DOMINO TILE VERTICAL-01-03',
        value: '🁭',
        codepoint: 127085,
      },
      {
        name: 'DOMINO TILE VERTICAL-01-04',
        value: '🁮',
        codepoint: 127086,
      },
      {
        name: 'DOMINO TILE VERTICAL-01-05',
        value: '🁯',
        codepoint: 127087,
      },
      {
        name: 'DOMINO TILE VERTICAL-01-06',
        value: '🁰',
        codepoint: 127088,
      },
      {
        name: 'DOMINO TILE VERTICAL-02-00',
        value: '🁱',
        codepoint: 127089,
      },
      {
        name: 'DOMINO TILE VERTICAL-02-01',
        value: '🁲',
        codepoint: 127090,
      },
      {
        name: 'DOMINO TILE VERTICAL-02-02',
        value: '🁳',
        codepoint: 127091,
      },
      {
        name: 'DOMINO TILE VERTICAL-02-03',
        value: '🁴',
        codepoint: 127092,
      },
      {
        name: 'DOMINO TILE VERTICAL-02-04',
        value: '🁵',
        codepoint: 127093,
      },
      {
        name: 'DOMINO TILE VERTICAL-02-05',
        value: '🁶',
        codepoint: 127094,
      },
      {
        name: 'DOMINO TILE VERTICAL-02-06',
        value: '🁷',
        codepoint: 127095,
      },
      {
        name: 'DOMINO TILE VERTICAL-03-00',
        value: '🁸',
        codepoint: 127096,
      },
      {
        name: 'DOMINO TILE VERTICAL-03-01',
        value: '🁹',
        codepoint: 127097,
      },
      {
        name: 'DOMINO TILE VERTICAL-03-02',
        value: '🁺',
        codepoint: 127098,
      },
      {
        name: 'DOMINO TILE VERTICAL-03-03',
        value: '🁻',
        codepoint: 127099,
      },
      {
        name: 'DOMINO TILE VERTICAL-03-04',
        value: '🁼',
        codepoint: 127100,
      },
      {
        name: 'DOMINO TILE VERTICAL-03-05',
        value: '🁽',
        codepoint: 127101,
      },
      {
        name: 'DOMINO TILE VERTICAL-03-06',
        value: '🁾',
        codepoint: 127102,
      },
      {
        name: 'DOMINO TILE VERTICAL-04-00',
        value: '🁿',
        codepoint: 127103,
      },
      {
        name: 'DOMINO TILE VERTICAL-04-01',
        value: '🂀',
        codepoint: 127104,
      },
      {
        name: 'DOMINO TILE VERTICAL-04-02',
        value: '🂁',
        codepoint: 127105,
      },
      {
        name: 'DOMINO TILE VERTICAL-04-03',
        value: '🂂',
        codepoint: 127106,
      },
      {
        name: 'DOMINO TILE VERTICAL-04-04',
        value: '🂃',
        codepoint: 127107,
      },
      {
        name: 'DOMINO TILE VERTICAL-04-05',
        value: '🂄',
        codepoint: 127108,
      },
      {
        name: 'DOMINO TILE VERTICAL-04-06',
        value: '🂅',
        codepoint: 127109,
      },
      {
        name: 'DOMINO TILE VERTICAL-05-00',
        value: '🂆',
        codepoint: 127110,
      },
      {
        name: 'DOMINO TILE VERTICAL-05-01',
        value: '🂇',
        codepoint: 127111,
      },
      {
        name: 'DOMINO TILE VERTICAL-05-02',
        value: '🂈',
        codepoint: 127112,
      },
      {
        name: 'DOMINO TILE VERTICAL-05-03',
        value: '🂉',
        codepoint: 127113,
      },
      {
        name: 'DOMINO TILE VERTICAL-05-04',
        value: '🂊',
        codepoint: 127114,
      },
      {
        name: 'DOMINO TILE VERTICAL-05-05',
        value: '🂋',
        codepoint: 127115,
      },
      {
        name: 'DOMINO TILE VERTICAL-05-06',
        value: '🂌',
        codepoint: 127116,
      },
      {
        name: 'DOMINO TILE VERTICAL-06-00',
        value: '🂍',
        codepoint: 127117,
      },
      {
        name: 'DOMINO TILE VERTICAL-06-01',
        value: '🂎',
        codepoint: 127118,
      },
      {
        name: 'DOMINO TILE VERTICAL-06-02',
        value: '🂏',
        codepoint: 127119,
      },
      {
        name: 'DOMINO TILE VERTICAL-06-03',
        value: '🂐',
        codepoint: 127120,
      },
      {
        name: 'DOMINO TILE VERTICAL-06-04',
        value: '🂑',
        codepoint: 127121,
      },
      {
        name: 'DOMINO TILE VERTICAL-06-05',
        value: '🂒',
        codepoint: 127122,
      },
      {
        name: 'DOMINO TILE VERTICAL-06-06',
        value: '🂓',
        codepoint: 127123,
      },
      {
        name: 'PLAYING CARD BACK',
        value: '🂠',
        codepoint: 127136,
      },
      {
        name: 'PLAYING CARD ACE OF SPADES',
        value: '🂡',
        codepoint: 127137,
      },
      {
        name: 'PLAYING CARD TWO OF SPADES',
        value: '🂢',
        codepoint: 127138,
      },
      {
        name: 'PLAYING CARD THREE OF SPADES',
        value: '🂣',
        codepoint: 127139,
      },
      {
        name: 'PLAYING CARD FOUR OF SPADES',
        value: '🂤',
        codepoint: 127140,
      },
      {
        name: 'PLAYING CARD FIVE OF SPADES',
        value: '🂥',
        codepoint: 127141,
      },
      {
        name: 'PLAYING CARD SIX OF SPADES',
        value: '🂦',
        codepoint: 127142,
      },
      {
        name: 'PLAYING CARD SEVEN OF SPADES',
        value: '🂧',
        codepoint: 127143,
      },
      {
        name: 'PLAYING CARD EIGHT OF SPADES',
        value: '🂨',
        codepoint: 127144,
      },
      {
        name: 'PLAYING CARD NINE OF SPADES',
        value: '🂩',
        codepoint: 127145,
      },
      {
        name: 'PLAYING CARD TEN OF SPADES',
        value: '🂪',
        codepoint: 127146,
      },
      {
        name: 'PLAYING CARD JACK OF SPADES',
        value: '🂫',
        codepoint: 127147,
      },
      {
        name: 'PLAYING CARD KNIGHT OF SPADES',
        value: '🂬',
        codepoint: 127148,
      },
      {
        name: 'PLAYING CARD QUEEN OF SPADES',
        value: '🂭',
        codepoint: 127149,
      },
      {
        name: 'PLAYING CARD KING OF SPADES',
        value: '🂮',
        codepoint: 127150,
      },
      {
        name: 'PLAYING CARD ACE OF HEARTS',
        value: '🂱',
        codepoint: 127153,
      },
      {
        name: 'PLAYING CARD TWO OF HEARTS',
        value: '🂲',
        codepoint: 127154,
      },
      {
        name: 'PLAYING CARD THREE OF HEARTS',
        value: '🂳',
        codepoint: 127155,
      },
      {
        name: 'PLAYING CARD FOUR OF HEARTS',
        value: '🂴',
        codepoint: 127156,
      },
      {
        name: 'PLAYING CARD FIVE OF HEARTS',
        value: '🂵',
        codepoint: 127157,
      },
      {
        name: 'PLAYING CARD SIX OF HEARTS',
        value: '🂶',
        codepoint: 127158,
      },
      {
        name: 'PLAYING CARD SEVEN OF HEARTS',
        value: '🂷',
        codepoint: 127159,
      },
      {
        name: 'PLAYING CARD EIGHT OF HEARTS',
        value: '🂸',
        codepoint: 127160,
      },
      {
        name: 'PLAYING CARD NINE OF HEARTS',
        value: '🂹',
        codepoint: 127161,
      },
      {
        name: 'PLAYING CARD TEN OF HEARTS',
        value: '🂺',
        codepoint: 127162,
      },
      {
        name: 'PLAYING CARD JACK OF HEARTS',
        value: '🂻',
        codepoint: 127163,
      },
      {
        name: 'PLAYING CARD KNIGHT OF HEARTS',
        value: '🂼',
        codepoint: 127164,
      },
      {
        name: 'PLAYING CARD QUEEN OF HEARTS',
        value: '🂽',
        codepoint: 127165,
      },
      {
        name: 'PLAYING CARD KING OF HEARTS',
        value: '🂾',
        codepoint: 127166,
      },
      {
        name: 'PLAYING CARD ACE OF DIAMONDS',
        value: '🃁',
        codepoint: 127169,
      },
      {
        name: 'PLAYING CARD TWO OF DIAMONDS',
        value: '🃂',
        codepoint: 127170,
      },
      {
        name: 'PLAYING CARD THREE OF DIAMONDS',
        value: '🃃',
        codepoint: 127171,
      },
      {
        name: 'PLAYING CARD FOUR OF DIAMONDS',
        value: '🃄',
        codepoint: 127172,
      },
      {
        name: 'PLAYING CARD FIVE OF DIAMONDS',
        value: '🃅',
        codepoint: 127173,
      },
      {
        name: 'PLAYING CARD SIX OF DIAMONDS',
        value: '🃆',
        codepoint: 127174,
      },
      {
        name: 'PLAYING CARD SEVEN OF DIAMONDS',
        value: '🃇',
        codepoint: 127175,
      },
      {
        name: 'PLAYING CARD EIGHT OF DIAMONDS',
        value: '🃈',
        codepoint: 127176,
      },
      {
        name: 'PLAYING CARD NINE OF DIAMONDS',
        value: '🃉',
        codepoint: 127177,
      },
      {
        name: 'PLAYING CARD TEN OF DIAMONDS',
        value: '🃊',
        codepoint: 127178,
      },
      {
        name: 'PLAYING CARD JACK OF DIAMONDS',
        value: '🃋',
        codepoint: 127179,
      },
      {
        name: 'PLAYING CARD KNIGHT OF DIAMONDS',
        value: '🃌',
        codepoint: 127180,
      },
      {
        name: 'PLAYING CARD QUEEN OF DIAMONDS',
        value: '🃍',
        codepoint: 127181,
      },
      {
        name: 'PLAYING CARD KING OF DIAMONDS',
        value: '🃎',
        codepoint: 127182,
      },
      {
        name: 'PLAYING CARD ACE OF CLUBS',
        value: '🃑',
        codepoint: 127185,
      },
      {
        name: 'PLAYING CARD TWO OF CLUBS',
        value: '🃒',
        codepoint: 127186,
      },
      {
        name: 'PLAYING CARD THREE OF CLUBS',
        value: '🃓',
        codepoint: 127187,
      },
      {
        name: 'PLAYING CARD FOUR OF CLUBS',
        value: '🃔',
        codepoint: 127188,
      },
      {
        name: 'PLAYING CARD FIVE OF CLUBS',
        value: '🃕',
        codepoint: 127189,
      },
      {
        name: 'PLAYING CARD SIX OF CLUBS',
        value: '🃖',
        codepoint: 127190,
      },
      {
        name: 'PLAYING CARD SEVEN OF CLUBS',
        value: '🃗',
        codepoint: 127191,
      },
      {
        name: 'PLAYING CARD EIGHT OF CLUBS',
        value: '🃘',
        codepoint: 127192,
      },
      {
        name: 'PLAYING CARD NINE OF CLUBS',
        value: '🃙',
        codepoint: 127193,
      },
      {
        name: 'PLAYING CARD TEN OF CLUBS',
        value: '🃚',
        codepoint: 127194,
      },
      {
        name: 'PLAYING CARD JACK OF CLUBS',
        value: '🃛',
        codepoint: 127195,
      },
      {
        name: 'PLAYING CARD KNIGHT OF CLUBS',
        value: '🃜',
        codepoint: 127196,
      },
      {
        name: 'PLAYING CARD QUEEN OF CLUBS',
        value: '🃝',
        codepoint: 127197,
      },
      {
        name: 'PLAYING CARD KING OF CLUBS',
        value: '🃞',
        codepoint: 127198,
      },
      {
        name: 'PLAYING CARD WHITE JOKER',
        value: '🃟',
        codepoint: 127199,
      },
    ],
  },
  {
    name: 'Music',
    symbols: [
      {
        name: 'MUSICAL SYMBOL SINGLE BARLINE',
        value: '𝄀',
        codepoint: 119040,
      },
      {
        name: 'MUSICAL SYMBOL DOUBLE BARLINE',
        value: '𝄁',
        codepoint: 119041,
      },
      {
        name: 'MUSICAL SYMBOL FINAL BARLINE',
        value: '𝄂',
        codepoint: 119042,
      },
      {
        name: 'MUSICAL SYMBOL REVERSE FINAL BARLINE',
        value: '𝄃',
        codepoint: 119043,
      },
      {
        name: 'MUSICAL SYMBOL DASHED BARLINE',
        value: '𝄄',
        codepoint: 119044,
      },
      {
        name: 'MUSICAL SYMBOL SHORT BARLINE',
        value: '𝄅',
        codepoint: 119045,
      },
      {
        name: 'MUSICAL SYMBOL LEFT REPEAT SIGN',
        value: '𝄆',
        codepoint: 119046,
      },
      {
        name: 'MUSICAL SYMBOL RIGHT REPEAT SIGN',
        value: '𝄇',
        codepoint: 119047,
      },
      {
        name: 'MUSICAL SYMBOL REPEAT DOTS',
        value: '𝄈',
        codepoint: 119048,
      },
      {
        name: 'MUSICAL SYMBOL FERMATA',
        value: '𝄐',
        codepoint: 119056,
      },
      {
        name: 'MUSICAL SYMBOL FERMATA BELOW',
        value: '𝄑',
        codepoint: 119057,
      },
      {
        name: 'MUSICAL SYMBOL BREATH MARK',
        value: '𝄒',
        codepoint: 119058,
      },
      {
        name: 'MUSICAL SYMBOL G CLEF',
        value: '𝄞',
        codepoint: 119070,
      },
      {
        name: 'MUSICAL SYMBOL C CLEF',
        value: '𝄡',
        codepoint: 119073,
      },
      {
        name: 'MUSICAL SYMBOL F CLEF',
        value: '𝄢',
        codepoint: 119074,
      },
      {
        name: 'MUSICAL SYMBOL DOUBLE SHARP',
        value: '𝄪',
        codepoint: 119082,
      },
      {
        name: 'MUSICAL SYMBOL DOUBLE FLAT',
        value: '𝄫',
        codepoint: 119083,
      },
      {
        name: 'MUSICAL SYMBOL CRESCENDO',
        value: '𝆒',
        codepoint: 119186,
      },
      {
        name: 'MUSICAL SYMBOL DECRESCENDO',
        value: '𝆓',
        codepoint: 119187,
      },
      {
        name: 'MUSICAL SYMBOL HAUPTSTIMME',
        value: '𝆦',
        codepoint: 119206,
      },
      {
        name: 'MUSICAL SYMBOL NEBENSTIMME',
        value: '𝆧',
        codepoint: 119207,
      },
      {
        name: 'MUSICAL SYMBOL END OF STIMME',
        value: '𝆨',
        codepoint: 119208,
      },
      {
        name: 'MUSICAL SYMBOL TEMPUS PERFECTUM CUM PROLATIONE PERFECTA',
        value: '𝇇',
        codepoint: 119239,
      },
      {
        name: 'MUSICAL SYMBOL TEMPUS PERFECTUM CUM PROLATIONE IMPERFECTA',
        value: '𝇈',
        codepoint: 119240,
      },
      {
        name: 'MUSICAL SYMBOL TEMPUS PERFECTUM CUM PROLATIONE PERFECTA DIMINUTION-1',
        value: '𝇉',
        codepoint: 119241,
      },
      {
        name: 'MUSICAL SYMBOL TEMPUS IMPERFECTUM CUM PROLATIONE PERFECTA',
        value: '𝇊',
        codepoint: 119242,
      },
      {
        name: 'MUSICAL SYMBOL TEMPUS IMPERFECTUM CUM PROLATIONE IMPERFECTA',
        value: '𝇋',
        codepoint: 119243,
      },
      {
        name: 'MUSICAL SYMBOL TEMPUS IMPERFECTUM CUM PROLATIONE IMPERFECTA DIMINUTION-1',
        value: '𝇌',
        codepoint: 119244,
      },
      {
        name: 'MUSICAL SYMBOL TEMPUS IMPERFECTUM CUM PROLATIONE IMPERFECTA DIMINUTION-2',
        value: '𝇍',
        codepoint: 119245,
      },
      {
        name: 'MUSICAL SYMBOL TEMPUS IMPERFECTUM CUM PROLATIONE IMPERFECTA DIMINUTION-3',
        value: '𝇎',
        codepoint: 119246,
      },
    ],
  },
  {
    name: 'Geometric Shapes',
    symbols: [
      {
        name: 'BLACK SQUARE',
        value: '■',
        codepoint: 9632,
      },
      {
        name: 'WHITE SQUARE',
        value: '□',
        codepoint: 9633,
      },
      {
        name: 'WHITE SQUARE WITH ROUNDED CORNERS',
        value: '▢',
        codepoint: 9634,
      },
      {
        name: 'WHITE SQUARE CONTAINING BLACK SMALL SQUARE',
        value: '▣',
        codepoint: 9635,
      },
      {
        name: 'SQUARE WITH HORIZONTAL FILL',
        value: '▤',
        codepoint: 9636,
      },
      {
        name: 'SQUARE WITH VERTICAL FILL',
        value: '▥',
        codepoint: 9637,
      },
      {
        name: 'SQUARE WITH ORTHOGONAL CROSSHATCH FILL',
        value: '▦',
        codepoint: 9638,
      },
      {
        name: 'SQUARE WITH UPPER LEFT TO LOWER RIGHT FILL',
        value: '▧',
        codepoint: 9639,
      },
      {
        name: 'SQUARE WITH UPPER RIGHT TO LOWER LEFT FILL',
        value: '▨',
        codepoint: 9640,
      },
      {
        name: 'SQUARE WITH DIAGONAL CROSSHATCH FILL',
        value: '▩',
        codepoint: 9641,
      },
      {
        name: 'BLACK RECTANGLE',
        value: '▬',
        codepoint: 9644,
      },
      {
        name: 'WHITE RECTANGLE',
        value: '▭',
        codepoint: 9645,
      },
      {
        name: 'BLACK VERTICAL RECTANGLE',
        value: '▮',
        codepoint: 9646,
      },
      {
        name: 'WHITE VERTICAL RECTANGLE',
        value: '▯',
        codepoint: 9647,
      },
      {
        name: 'BLACK PARALLELOGRAM',
        value: '▰',
        codepoint: 9648,
      },
      {
        name: 'WHITE PARALLELOGRAM',
        value: '▱',
        codepoint: 9649,
      },
      {
        name: 'BLACK UP-POINTING TRIANGLE',
        value: '▲',
        codepoint: 9650,
      },
      {
        name: 'WHITE UP-POINTING TRIANGLE',
        value: '△',
        codepoint: 9651,
      },
      {
        name: 'BLACK UP-POINTING SMALL TRIANGLE',
        value: '▴',
        codepoint: 9652,
      },
      {
        name: 'WHITE UP-POINTING SMALL TRIANGLE',
        value: '▵',
        codepoint: 9653,
      },
      {
        name: 'WHITE RIGHT-POINTING TRIANGLE',
        value: '▷',
        codepoint: 9655,
      },
      {
        name: 'BLACK RIGHT-POINTING SMALL TRIANGLE',
        value: '▸',
        codepoint: 9656,
      },
      {
        name: 'WHITE RIGHT-POINTING SMALL TRIANGLE',
        value: '▹',
        codepoint: 9657,
      },
      {
        name: 'BLACK RIGHT-POINTING POINTER',
        value: '►',
        codepoint: 9658,
      },
      {
        name: 'WHITE RIGHT-POINTING POINTER',
        value: '▻',
        codepoint: 9659,
      },
      {
        name: 'BLACK DOWN-POINTING TRIANGLE',
        value: '▼',
        codepoint: 9660,
      },
      {
        name: 'WHITE DOWN-POINTING TRIANGLE',
        value: '▽',
        codepoint: 9661,
      },
      {
        name: 'BLACK DOWN-POINTING SMALL TRIANGLE',
        value: '▾',
        codepoint: 9662,
      },
      {
        name: 'WHITE DOWN-POINTING SMALL TRIANGLE',
        value: '▿',
        codepoint: 9663,
      },
      {
        name: 'WHITE LEFT-POINTING TRIANGLE',
        value: '◁',
        codepoint: 9665,
      },
      {
        name: 'BLACK LEFT-POINTING SMALL TRIANGLE',
        value: '◂',
        codepoint: 9666,
      },
      {
        name: 'WHITE LEFT-POINTING SMALL TRIANGLE',
        value: '◃',
        codepoint: 9667,
      },
      {
        name: 'BLACK LEFT-POINTING POINTER',
        value: '◄',
        codepoint: 9668,
      },
      {
        name: 'WHITE LEFT-POINTING POINTER',
        value: '◅',
        codepoint: 9669,
      },
      {
        name: 'BLACK DIAMOND',
        value: '◆',
        codepoint: 9670,
      },
      {
        name: 'WHITE DIAMOND',
        value: '◇',
        codepoint: 9671,
      },
      {
        name: 'WHITE DIAMOND CONTAINING BLACK SMALL DIAMOND',
        value: '◈',
        codepoint: 9672,
      },
      {
        name: 'FISHEYE',
        value: '◉',
        codepoint: 9673,
      },
      {
        name: 'LOZENGE',
        value: '◊',
        codepoint: 9674,
      },
      {
        name: 'WHITE CIRCLE',
        value: '○',
        codepoint: 9675,
      },
      {
        name: 'DOTTED CIRCLE',
        value: '◌',
        codepoint: 9676,
      },
      {
        name: 'CIRCLE WITH VERTICAL FILL',
        value: '◍',
        codepoint: 9677,
      },
      {
        name: 'BULLSEYE',
        value: '◎',
        codepoint: 9678,
      },
      {
        name: 'BLACK CIRCLE',
        value: '●',
        codepoint: 9679,
      },
      {
        name: 'CIRCLE WITH LEFT HALF BLACK',
        value: '◐',
        codepoint: 9680,
      },
      {
        name: 'CIRCLE WITH RIGHT HALF BLACK',
        value: '◑',
        codepoint: 9681,
      },
      {
        name: 'CIRCLE WITH LOWER HALF BLACK',
        value: '◒',
        codepoint: 9682,
      },
      {
        name: 'CIRCLE WITH UPPER HALF BLACK',
        value: '◓',
        codepoint: 9683,
      },
      {
        name: 'CIRCLE WITH UPPER RIGHT QUADRANT BLACK',
        value: '◔',
        codepoint: 9684,
      },
      {
        name: 'CIRCLE WITH ALL BUT UPPER LEFT QUADRANT BLACK',
        value: '◕',
        codepoint: 9685,
      },
      {
        name: 'LEFT HALF BLACK CIRCLE',
        value: '◖',
        codepoint: 9686,
      },
      {
        name: 'RIGHT HALF BLACK CIRCLE',
        value: '◗',
        codepoint: 9687,
      },
      {
        name: 'INVERSE BULLET',
        value: '◘',
        codepoint: 9688,
      },
      {
        name: 'INVERSE WHITE CIRCLE',
        value: '◙',
        codepoint: 9689,
      },
      {
        name: 'UPPER HALF INVERSE WHITE CIRCLE',
        value: '◚',
        codepoint: 9690,
      },
      {
        name: 'LOWER HALF INVERSE WHITE CIRCLE',
        value: '◛',
        codepoint: 9691,
      },
      {
        name: 'UPPER LEFT QUADRANT CIRCULAR ARC',
        value: '◜',
        codepoint: 9692,
      },
      {
        name: 'UPPER RIGHT QUADRANT CIRCULAR ARC',
        value: '◝',
        codepoint: 9693,
      },
      {
        name: 'LOWER RIGHT QUADRANT CIRCULAR ARC',
        value: '◞',
        codepoint: 9694,
      },
      {
        name: 'LOWER LEFT QUADRANT CIRCULAR ARC',
        value: '◟',
        codepoint: 9695,
      },
      {
        name: 'UPPER HALF CIRCLE',
        value: '◠',
        codepoint: 9696,
      },
      {
        name: 'LOWER HALF CIRCLE',
        value: '◡',
        codepoint: 9697,
      },
      {
        name: 'BLACK LOWER RIGHT TRIANGLE',
        value: '◢',
        codepoint: 9698,
      },
      {
        name: 'BLACK LOWER LEFT TRIANGLE',
        value: '◣',
        codepoint: 9699,
      },
      {
        name: 'BLACK UPPER LEFT TRIANGLE',
        value: '◤',
        codepoint: 9700,
      },
      {
        name: 'BLACK UPPER RIGHT TRIANGLE',
        value: '◥',
        codepoint: 9701,
      },
      {
        name: 'WHITE BULLET',
        value: '◦',
        codepoint: 9702,
      },
      {
        name: 'SQUARE WITH LEFT HALF BLACK',
        value: '◧',
        codepoint: 9703,
      },
      {
        name: 'SQUARE WITH RIGHT HALF BLACK',
        value: '◨',
        codepoint: 9704,
      },
      {
        name: 'SQUARE WITH UPPER LEFT DIAGONAL HALF BLACK',
        value: '◩',
        codepoint: 9705,
      },
      {
        name: 'SQUARE WITH LOWER RIGHT DIAGONAL HALF BLACK',
        value: '◪',
        codepoint: 9706,
      },
      {
        name: 'WHITE SQUARE WITH VERTICAL BISECTING LINE',
        value: '◫',
        codepoint: 9707,
      },
      {
        name: 'WHITE UP-POINTING TRIANGLE WITH DOT',
        value: '◬',
        codepoint: 9708,
      },
      {
        name: 'UP-POINTING TRIANGLE WITH LEFT HALF BLACK',
        value: '◭',
        codepoint: 9709,
      },
      {
        name: 'UP-POINTING TRIANGLE WITH RIGHT HALF BLACK',
        value: '◮',
        codepoint: 9710,
      },
      {
        name: 'LARGE CIRCLE',
        value: '◯',
        codepoint: 9711,
      },
      {
        name: 'WHITE SQUARE WITH UPPER LEFT QUADRANT',
        value: '◰',
        codepoint: 9712,
      },
      {
        name: 'WHITE SQUARE WITH LOWER LEFT QUADRANT',
        value: '◱',
        codepoint: 9713,
      },
      {
        name: 'WHITE SQUARE WITH LOWER RIGHT QUADRANT',
        value: '◲',
        codepoint: 9714,
      },
      {
        name: 'WHITE SQUARE WITH UPPER RIGHT QUADRANT',
        value: '◳',
        codepoint: 9715,
      },
      {
        name: 'WHITE CIRCLE WITH UPPER LEFT QUADRANT',
        value: '◴',
        codepoint: 9716,
      },
      {
        name: 'WHITE CIRCLE WITH LOWER LEFT QUADRANT',
        value: '◵',
        codepoint: 9717,
      },
      {
        name: 'WHITE CIRCLE WITH LOWER RIGHT QUADRANT',
        value: '◶',
        codepoint: 9718,
      },
      {
        name: 'WHITE CIRCLE WITH UPPER RIGHT QUADRANT',
        value: '◷',
        codepoint: 9719,
      },
      {
        name: 'UPPER LEFT TRIANGLE',
        value: '◸',
        codepoint: 9720,
      },
      {
        name: 'UPPER RIGHT TRIANGLE',
        value: '◹',
        codepoint: 9721,
      },
      {
        name: 'LOWER LEFT TRIANGLE',
        value: '◺',
        codepoint: 9722,
      },
      {
        name: 'LOWER RIGHT TRIANGLE',
        value: '◿',
        codepoint: 9727,
      },
    ],
  },
  {
    name: 'Ideographic',
    symbols: [
      {
        name: 'IDEOGRAPHIC DESCRIPTION CHARACTER LEFT TO RIGHT',
        value: '⿰',
        codepoint: 12272,
      },
      {
        name: 'IDEOGRAPHIC DESCRIPTION CHARACTER ABOVE TO BELOW',
        value: '⿱',
        codepoint: 12273,
      },
      {
        name: 'IDEOGRAPHIC DESCRIPTION CHARACTER LEFT TO MIDDLE AND RIGHT',
        value: '⿲',
        codepoint: 12274,
      },
      {
        name: 'IDEOGRAPHIC DESCRIPTION CHARACTER ABOVE TO MIDDLE AND BELOW',
        value: '⿳',
        codepoint: 12275,
      },
      {
        name: 'IDEOGRAPHIC DESCRIPTION CHARACTER FULL SURROUND',
        value: '⿴',
        codepoint: 12276,
      },
      {
        name: 'IDEOGRAPHIC DESCRIPTION CHARACTER SURROUND FROM ABOVE',
        value: '⿵',
        codepoint: 12277,
      },
      {
        name: 'IDEOGRAPHIC DESCRIPTION CHARACTER SURROUND FROM BELOW',
        value: '⿶',
        codepoint: 12278,
      },
      {
        name: 'IDEOGRAPHIC DESCRIPTION CHARACTER SURROUND FROM LEFT',
        value: '⿷',
        codepoint: 12279,
      },
      {
        name: 'IDEOGRAPHIC DESCRIPTION CHARACTER SURROUND FROM UPPER LEFT',
        value: '⿸',
        codepoint: 12280,
      },
      {
        name: 'IDEOGRAPHIC DESCRIPTION CHARACTER SURROUND FROM UPPER RIGHT',
        value: '⿹',
        codepoint: 12281,
      },
      {
        name: 'IDEOGRAPHIC DESCRIPTION CHARACTER SURROUND FROM LOWER LEFT',
        value: '⿺',
        codepoint: 12282,
      },
      {
        name: 'IDEOGRAPHIC DESCRIPTION CHARACTER OVERLAID',
        value: '⿻',
        codepoint: 12283,
      },
    ],
  },
];

export default symbols;
