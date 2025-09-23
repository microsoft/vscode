/*
 * wordbreak.ts
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


// This string is a compact representation of the set of Unicode characters
// that we consider to be letters. Each pair of characters represents the
// lower and upper bound (both inclusive) of a range of letters.
//
// For example, "azAZ09" would mean a-z, A-Z, and 0-9 are all considered letters.
//
// The ranges are sorted, so they may be binary searched.
const DATA = "\u0041\u005A\u0061\u007A\u00AA\u00AA\u00B5\u00B5\u00BA\u00BA\u00C0\u00D6\u00D8\u00F6\u00F8\u0241\u0250\u02C1\u02C6\u02D1\u02E0\u02E4\u02EE\u02EE\u0300\u036F\u037A\u037A\u0386\u0386\u0388\u038A\u038C\u038C\u038E\u03A1\u03A3\u03CE\u03D0\u03F5\u03F7\u0481\u0483\u0486\u048A\u04CE\u04D0\u04F9\u0500\u050F\u0531\u0556\u0559\u0559\u0561\u0587\u0591\u05B9\u05BB\u05BD\u05BF\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05C7\u05D0\u05EA\u05F0\u05F2\u0610\u0615\u0621\u063A\u0640\u065E\u066E\u06D3\u06D5\u06DC\u06DF\u06E8\u06EA\u06EF\u06FA\u06FC\u06FF\u06FF\u0710\u074A\u074D\u076D\u0780\u07B1\u0901\u0902\u0904\u0939\u093C\u093D\u0941\u0948\u094D\u094D\u0950\u0954\u0958\u0963\u097D\u097D\u0981\u0981\u0985\u098C\u098F\u0990\u0993\u09A8\u09AA\u09B0\u09B2\u09B2\u09B6\u09B9\u09BC\u09BD\u09C1\u09C4\u09CD\u09CE\u09DC\u09DD\u09DF\u09E3\u09F0\u09F1\u0A01\u0A02\u0A05\u0A0A\u0A0F\u0A10\u0A13\u0A28\u0A2A\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3C\u0A3C\u0A41\u0A42\u0A47\u0A48\u0A4B\u0A4D\u0A59\u0A5C\u0A5E\u0A5E\u0A70\u0A74\u0A81\u0A82\u0A85\u0A8D\u0A8F\u0A91\u0A93\u0AA8\u0AAA\u0AB0\u0AB2\u0AB3\u0AB5\u0AB9\u0ABC\u0ABD\u0AC1\u0AC5\u0AC7\u0AC8\u0ACD\u0ACD\u0AD0\u0AD0\u0AE0\u0AE3\u0B01\u0B01\u0B05\u0B0C\u0B0F\u0B10\u0B13\u0B28\u0B2A\u0B30\u0B32\u0B33\u0B35\u0B39\u0B3C\u0B3D\u0B3F\u0B3F\u0B41\u0B43\u0B4D\u0B4D\u0B56\u0B56\u0B5C\u0B5D\u0B5F\u0B61\u0B71\u0B71\u0B82\u0B83\u0B85\u0B8A\u0B8E\u0B90\u0B92\u0B95\u0B99\u0B9A\u0B9C\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8\u0BAA\u0BAE\u0BB9\u0BC0\u0BC0\u0BCD\u0BCD\u0C05\u0C0C\u0C0E\u0C10\u0C12\u0C28\u0C2A\u0C33\u0C35\u0C39\u0C3E\u0C40\u0C46\u0C48\u0C4A\u0C4D\u0C55\u0C56\u0C60\u0C61\u0C85\u0C8C\u0C8E\u0C90\u0C92\u0CA8\u0CAA\u0CB3\u0CB5\u0CB9\u0CBC\u0CBD\u0CBF\u0CBF\u0CC6\u0CC6\u0CCC\u0CCD\u0CDE\u0CDE\u0CE0\u0CE1\u0D05\u0D0C\u0D0E\u0D10\u0D12\u0D28\u0D2A\u0D39\u0D41\u0D43\u0D4D\u0D4D\u0D60\u0D61\u0D85\u0D96\u0D9A\u0DB1\u0DB3\u0DBB\u0DBD\u0DBD\u0DC0\u0DC6\u0DCA\u0DCA\u0DD2\u0DD4\u0DD6\u0DD6\u0E01\u0E3A\u0E40\u0E4E\u0E81\u0E82\u0E84\u0E84\u0E87\u0E88\u0E8A\u0E8A\u0E8D\u0E8D\u0E94\u0E97\u0E99\u0E9F\u0EA1\u0EA3\u0EA5\u0EA5\u0EA7\u0EA7\u0EAA\u0EAB\u0EAD\u0EB9\u0EBB\u0EBD\u0EC0\u0EC4\u0EC6\u0EC6\u0EC8\u0ECD\u0EDC\u0EDD\u0F00\u0F00\u0F18\u0F19\u0F35\u0F35\u0F37\u0F37\u0F39\u0F39\u0F40\u0F47\u0F49\u0F6A\u0F71\u0F7E\u0F80\u0F84\u0F86\u0F8B\u0F90\u0F97\u0F99\u0FBC\u0FC6\u0FC6\u1000\u1021\u1023\u1027\u1029\u102A\u102D\u1030\u1032\u1032\u1036\u1037\u1039\u1039\u1050\u1055\u1058\u1059\u10A0\u10C5\u10D0\u10FA\u10FC\u10FC\u1100\u1159\u115F\u11A2\u11A8\u11F9\u1200\u1248\u124A\u124D\u1250\u1256\u1258\u1258\u125A\u125D\u1260\u1288\u128A\u128D\u1290\u12B0\u12B2\u12B5\u12B8\u12BE\u12C0\u12C0\u12C2\u12C5\u12C8\u12D6\u12D8\u1310\u1312\u1315\u1318\u135A\u135F\u135F\u1380\u138F\u13A0\u13F4\u1401\u166C\u166F\u1676\u1681\u169A\u16A0\u16EA\u1700\u170C\u170E\u1714\u1720\u1734\u1740\u1753\u1760\u176C\u176E\u1770\u1772\u1773\u1780\u17B3\u17B7\u17BD\u17C6\u17C6\u17C9\u17D3\u17D7\u17D7\u17DC\u17DD\u180B\u180D\u1820\u1877\u1880\u18A9\u1900\u191C\u1920\u1922\u1927\u1928\u1932\u1932\u1939\u193B\u1950\u196D\u1970\u1974\u1980\u19A9\u19C1\u19C7\u1A00\u1A18\u1D00\u1DC3\u1E00\u1E9B\u1EA0\u1EF9\u1F00\u1F15\u1F18\u1F1D\u1F20\u1F45\u1F48\u1F4D\u1F50\u1F57\u1F59\u1F59\u1F5B\u1F5B\u1F5D\u1F5D\u1F5F\u1F7D\u1F80\u1FB4\u1FB6\u1FBC\u1FBE\u1FBE\u1FC2\u1FC4\u1FC6\u1FCC\u1FD0\u1FD3\u1FD6\u1FDB\u1FE0\u1FEC\u1FF2\u1FF4\u1FF6\u1FFC\u2071\u2071\u207F\u207F\u2090\u2094\u20D0\u20DC\u20E1\u20E1\u20E5\u20EB\u2102\u2102\u2107\u2107\u210A\u2113\u2115\u2115\u2119\u211D\u2124\u2124\u2126\u2126\u2128\u2128\u212A\u212D\u212F\u2131\u2133\u2139\u213C\u213F\u2145\u2149\u2C00\u2C2E\u2C30\u2C5E\u2C80\u2CE4\u2D00\u2D25\u2D30\u2D65\u2D6F\u2D6F\u2D80\u2D96\u2DA0\u2DA6\u2DA8\u2DAE\u2DB0\u2DB6\u2DB8\u2DBE\u2DC0\u2DC6\u2DC8\u2DCE\u2DD0\u2DD6\u2DD8\u2DDE\u3005\u3006\u302A\u302F\u3031\u3035\u303B\u303C\u3041\u3096\u3099\u309A\u309D\u309F\u30A1\u30FA\u30FC\u30FF\u3105\u312C\u3131\u318E\u31A0\u31B7\u31F0\u31FF\u3400\u3400\u4DB5\u4DB5\u4E00\u4E00\u9FBB\u9FBB\uA000\uA48C\uA800\uA801\uA803\uA822\uA825\uA826\uAC00\uD7A3\uF900\uFA2D\uFA30\uFA6A\uFA70\uFAD9\uFB00\uFB06\uFB13\uFB17\uFB1D\uFB28\uFB2A\uFB36\uFB38\uFB3C\uFB3E\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46\uFBB1\uFBD3\uFD3D\uFD50\uFD8F\uFD92\uFDC7\uFDF0\uFDFB\uFE00\uFE0F\uFE20\uFE23\uFE70\uFE74\uFE76\uFEFC\uFF21\uFF3A\uFF41\uFF5A\uFF66\uFFBE\uFFC2\uFFC7\uFFCA\uFFCF\uFFD2\uFFD7\uFFDA\uFFDC";

// Constants for boundary character comparisons
const kSingleQuote = 39;
const kFancySingleQuote = 8217;

export const kCharClassWord = 0;
export const kCharClassBoundary = 1;
export const kCharClassNonWord = 2;

export interface WordBreaker {
  breakWords: (text: string) => Array<{ start: number, end: number }>;
  classifyCharacter: (ch: number) => number;
}

export function wordBreaker() : WordBreaker {

  const CACHE = new Map<number,boolean>();
  
  const compareToRange = (c: number, rangeIndex: number) => {
    if (c < DATA.charCodeAt(rangeIndex*2)) {
      return -1;
    }
    if (c > DATA.charCodeAt(rangeIndex*2 + 1)) {
      return 1;
    }
    return 0;
  }

  const binarySearchLetters = (c: number) => {
    let fromIndex = 0;              // index of starting range, INCLUSIVE
    let toIndex = DATA.length / 2;  // index of ending range, EXCLUSIVE
    while (fromIndex < toIndex)
    {
      // round down from e.g. 180.5 (that's not the JS default behavior)
      const testIndex =  -Math.round(-((fromIndex + toIndex) / 2));
      const testResult = compareToRange(c, testIndex);

        if (testResult < 0)
          toIndex = testIndex;
        else if (testResult > 0)
          fromIndex = testIndex + 1;
        else
          return true;
    }

    // No ranges left to test
    return false;
  }

  const isLetter = (c: number) => {
    const cached = CACHE.get(c);
    if (cached !== undefined) {
      return cached;
    }
    const result = binarySearchLetters(c);
    CACHE.set(c,result);
    return result;
  }

  return {

    classifyCharacter(ch: number) : number {
      if (isLetter(ch)) {
        return kCharClassWord;
      } else if (ch === kSingleQuote || ch === kFancySingleQuote) {
        return kCharClassBoundary;
      } else {
        return kCharClassNonWord;
      }
    },
    

    breakWords(text: string) : Array<{ start: number, end: number }> {
      
      const words = new Array<{ start: number, end: number }>();
         
      let pos = 0;
      while (pos < text.length) 
      {
        // advance pos until we get past non-word characters
        while (pos < text.length && this.classifyCharacter(text.charCodeAt(pos)) !== kCharClassWord)
        {
            pos++;
        }
        
        // break out of the loop if we got to the end
        if (pos == text.length)
        {
            break;
        }
        
        // set start of word
        const wordStart = pos++;
        
        // consume until a non-word is encountered
        while (pos < text.length && this.classifyCharacter(text.charCodeAt(pos)) !== kCharClassNonWord)
        {
            pos++;
        }
        
        // back over boundary (e.g. apostrophe) characters
        while (this.classifyCharacter(text.charCodeAt(pos - 1)) === kCharClassBoundary)
        {
            pos--;
        }
        
        // add word
        words.push({
          start: wordStart,
          end: pos
        });
        
      }
              
      return words;
    },

  }
}


