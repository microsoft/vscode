/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as strings from '../../../../base/common/strings.js';
import { buildReplaceStringWithCasePreserved } from '../../../../base/common/search.js';
export class ReplacePattern {
    constructor(replaceString, arg2, arg3) {
        this._hasParameters = false;
        this._replacePattern = replaceString;
        let searchPatternInfo;
        let parseParameters;
        if (typeof arg2 === 'boolean') {
            parseParameters = arg2;
            this._regExp = arg3;
        }
        else {
            searchPatternInfo = arg2;
            parseParameters = !!searchPatternInfo.isRegExp;
            this._regExp = strings.createRegExp(searchPatternInfo.pattern, !!searchPatternInfo.isRegExp, { matchCase: searchPatternInfo.isCaseSensitive, wholeWord: searchPatternInfo.isWordMatch, multiline: searchPatternInfo.isMultiline, global: false, unicode: true });
        }
        if (parseParameters) {
            this.parseReplaceString(replaceString);
        }
        if (this._regExp.global) {
            this._regExp = strings.createRegExp(this._regExp.source, true, { matchCase: !this._regExp.ignoreCase, wholeWord: false, multiline: this._regExp.multiline, global: false });
        }
        this._caseOpsRegExp = new RegExp(/([\s\S]*?)((?:\\[uUlL])+?|)(\$[0-9]+)([\s\S]*?)/g);
    }
    get hasParameters() {
        return this._hasParameters;
    }
    get pattern() {
        return this._replacePattern;
    }
    get regExp() {
        return this._regExp;
    }
    /**
    * Returns the replace string for the first match in the given text.
    * If text has no matches then returns null.
    */
    getReplaceString(text, preserveCase) {
        this._regExp.lastIndex = 0;
        const match = this._regExp.exec(text);
        if (match) {
            if (this.hasParameters) {
                const replaceString = this.replaceWithCaseOperations(text, this._regExp, this.buildReplaceString(match, preserveCase));
                if (match[0] === text) {
                    return replaceString;
                }
                return replaceString.substr(match.index, match[0].length - (text.length - replaceString.length));
            }
            return this.buildReplaceString(match, preserveCase);
        }
        return null;
    }
    /**
     * replaceWithCaseOperations applies case operations to relevant replacement strings and applies
     * the affected $N arguments. It then passes unaffected $N arguments through to string.replace().
     *
     * \u			=> upper-cases one character in a match.
     * \U			=> upper-cases ALL remaining characters in a match.
     * \l			=> lower-cases one character in a match.
     * \L			=> lower-cases ALL remaining characters in a match.
     */
    replaceWithCaseOperations(text, regex, replaceString) {
        // Short-circuit the common path.
        if (!/\\[uUlL]/.test(replaceString)) {
            return text.replace(regex, replaceString);
        }
        // Store the values of the search parameters.
        const firstMatch = regex.exec(text);
        if (firstMatch === null) {
            return text.replace(regex, replaceString);
        }
        let patMatch;
        let newReplaceString = '';
        let lastIndex = 0;
        let lastMatch = '';
        // For each annotated $N, perform text processing on the parameters and perform the substitution.
        while ((patMatch = this._caseOpsRegExp.exec(replaceString)) !== null) {
            lastIndex = patMatch.index;
            const fullMatch = patMatch[0];
            lastMatch = fullMatch;
            let caseOps = patMatch[2]; // \u, \l\u, etc.
            const money = patMatch[3]; // $1, $2, etc.
            if (!caseOps) {
                newReplaceString += fullMatch;
                continue;
            }
            const replacement = firstMatch[parseInt(money.slice(1))];
            if (!replacement) {
                newReplaceString += fullMatch;
                continue;
            }
            const replacementLen = replacement.length;
            newReplaceString += patMatch[1]; // prefix
            caseOps = caseOps.replace(/\\/g, '');
            let i = 0;
            for (; i < caseOps.length; i++) {
                switch (caseOps[i]) {
                    case 'U':
                        newReplaceString += replacement.slice(i).toUpperCase();
                        i = replacementLen;
                        break;
                    case 'u':
                        newReplaceString += replacement[i].toUpperCase();
                        break;
                    case 'L':
                        newReplaceString += replacement.slice(i).toLowerCase();
                        i = replacementLen;
                        break;
                    case 'l':
                        newReplaceString += replacement[i].toLowerCase();
                        break;
                }
            }
            // Append any remaining replacement string content not covered by case operations.
            if (i < replacementLen) {
                newReplaceString += replacement.slice(i);
            }
            newReplaceString += patMatch[4]; // suffix
        }
        // Append any remaining trailing content after the final regex match.
        newReplaceString += replaceString.slice(lastIndex + lastMatch.length);
        return text.replace(regex, newReplaceString);
    }
    buildReplaceString(matches, preserveCase) {
        if (preserveCase) {
            return buildReplaceStringWithCasePreserved(matches, this._replacePattern);
        }
        else {
            return this._replacePattern;
        }
    }
    /**
     * \n => LF
     * \t => TAB
     * \\ => \
     * $0 => $& (see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#Specifying_a_string_as_a_parameter)
     * everything else stays untouched
     */
    parseReplaceString(replaceString) {
        if (!replaceString || replaceString.length === 0) {
            return;
        }
        let substrFrom = 0, result = '';
        for (let i = 0, len = replaceString.length; i < len; i++) {
            const chCode = replaceString.charCodeAt(i);
            if (chCode === 92 /* CharCode.Backslash */) {
                // move to next char
                i++;
                if (i >= len) {
                    // string ends with a \
                    break;
                }
                const nextChCode = replaceString.charCodeAt(i);
                let replaceWithCharacter = null;
                switch (nextChCode) {
                    case 92 /* CharCode.Backslash */:
                        // \\ => \
                        replaceWithCharacter = '\\';
                        break;
                    case 110 /* CharCode.n */:
                        // \n => LF
                        replaceWithCharacter = '\n';
                        break;
                    case 116 /* CharCode.t */:
                        // \t => TAB
                        replaceWithCharacter = '\t';
                        break;
                }
                if (replaceWithCharacter) {
                    result += replaceString.substring(substrFrom, i - 1) + replaceWithCharacter;
                    substrFrom = i + 1;
                }
            }
            if (chCode === 36 /* CharCode.DollarSign */) {
                // move to next char
                i++;
                if (i >= len) {
                    // string ends with a $
                    break;
                }
                const nextChCode = replaceString.charCodeAt(i);
                let replaceWithCharacter = null;
                switch (nextChCode) {
                    case 48 /* CharCode.Digit0 */:
                        // $0 => $&
                        replaceWithCharacter = '$&';
                        this._hasParameters = true;
                        break;
                    case 96 /* CharCode.BackTick */:
                    case 39 /* CharCode.SingleQuote */:
                        this._hasParameters = true;
                        break;
                    default: {
                        // check if it is a valid string parameter $n (0 <= n <= 99). $0 is already handled by now.
                        if (!this.between(nextChCode, 49 /* CharCode.Digit1 */, 57 /* CharCode.Digit9 */)) {
                            break;
                        }
                        if (i === replaceString.length - 1) {
                            this._hasParameters = true;
                            break;
                        }
                        let charCode = replaceString.charCodeAt(++i);
                        if (!this.between(charCode, 48 /* CharCode.Digit0 */, 57 /* CharCode.Digit9 */)) {
                            this._hasParameters = true;
                            --i;
                            break;
                        }
                        if (i === replaceString.length - 1) {
                            this._hasParameters = true;
                            break;
                        }
                        charCode = replaceString.charCodeAt(++i);
                        if (!this.between(charCode, 48 /* CharCode.Digit0 */, 57 /* CharCode.Digit9 */)) {
                            this._hasParameters = true;
                            --i;
                            break;
                        }
                        break;
                    }
                }
                if (replaceWithCharacter) {
                    result += replaceString.substring(substrFrom, i - 1) + replaceWithCharacter;
                    substrFrom = i + 1;
                }
            }
        }
        if (substrFrom === 0) {
            // no replacement occurred
            return;
        }
        this._replacePattern = result + replaceString.substring(substrFrom);
    }
    between(value, from, to) {
        return from <= value && value <= to;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwbGFjZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3JlcGxhY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLE9BQU8sTUFBTSxvQ0FBb0MsQ0FBQztBQUc5RCxPQUFPLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUV4RixNQUFNLE9BQU8sY0FBYztJQVMxQixZQUFZLGFBQXFCLEVBQUUsSUFBUyxFQUFFLElBQVU7UUFOaEQsbUJBQWMsR0FBWSxLQUFLLENBQUM7UUFPdkMsSUFBSSxDQUFDLGVBQWUsR0FBRyxhQUFhLENBQUM7UUFDckMsSUFBSSxpQkFBK0IsQ0FBQztRQUNwQyxJQUFJLGVBQXdCLENBQUM7UUFDN0IsSUFBSSxPQUFPLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUMvQixlQUFlLEdBQUcsSUFBSSxDQUFDO1lBQ3ZCLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDO1FBRXJCLENBQUM7YUFBTSxDQUFDO1lBQ1AsaUJBQWlCLEdBQUcsSUFBSSxDQUFDO1lBQ3pCLGVBQWUsR0FBRyxDQUFDLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDO1lBQy9DLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDLFlBQVksQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLFFBQVEsRUFBRSxFQUFFLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxlQUFlLEVBQUUsU0FBUyxFQUFFLGlCQUFpQixDQUFDLFdBQVcsRUFBRSxTQUFTLEVBQUUsaUJBQWlCLENBQUMsV0FBVyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDbFEsQ0FBQztRQUVELElBQUksZUFBZSxFQUFFLENBQUM7WUFDckIsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3hDLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDekIsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxFQUFFLFNBQVMsRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQzdLLENBQUM7UUFFRCxJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksTUFBTSxDQUFDLGtEQUFrRCxDQUFDLENBQUM7SUFDdEYsQ0FBQztJQUVELElBQUksYUFBYTtRQUNoQixPQUFPLElBQUksQ0FBQyxjQUFjLENBQUM7SUFDNUIsQ0FBQztJQUVELElBQUksT0FBTztRQUNWLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQztJQUM3QixDQUFDO0lBRUQsSUFBSSxNQUFNO1FBQ1QsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDO0lBQ3JCLENBQUM7SUFFRDs7O01BR0U7SUFDRixnQkFBZ0IsQ0FBQyxJQUFZLEVBQUUsWUFBc0I7UUFDcEQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDO1FBQzNCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RDLElBQUksS0FBSyxFQUFFLENBQUM7WUFDWCxJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDeEIsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLHlCQUF5QixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQztnQkFDdkgsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUM7b0JBQ3ZCLE9BQU8sYUFBYSxDQUFDO2dCQUN0QixDQUFDO2dCQUNELE9BQU8sYUFBYSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ2xHLENBQUM7WUFDRCxPQUFPLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDckQsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVEOzs7Ozs7OztPQVFHO0lBQ0sseUJBQXlCLENBQUMsSUFBWSxFQUFFLEtBQWEsRUFBRSxhQUFxQjtRQUNuRixpQ0FBaUM7UUFDakMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztZQUNyQyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBQzNDLENBQUM7UUFDRCw2Q0FBNkM7UUFDN0MsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxJQUFJLFVBQVUsS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUN6QixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBQzNDLENBQUM7UUFFRCxJQUFJLFFBQWdDLENBQUM7UUFDckMsSUFBSSxnQkFBZ0IsR0FBRyxFQUFFLENBQUM7UUFDMUIsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO1FBQ2xCLElBQUksU0FBUyxHQUFHLEVBQUUsQ0FBQztRQUNuQixpR0FBaUc7UUFDakcsT0FBTyxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ3RFLFNBQVMsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDO1lBQzNCLE1BQU0sU0FBUyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM5QixTQUFTLEdBQUcsU0FBUyxDQUFDO1lBQ3RCLElBQUksT0FBTyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGlCQUFpQjtZQUM1QyxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxlQUFlO1lBRTFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDZCxnQkFBZ0IsSUFBSSxTQUFTLENBQUM7Z0JBQzlCLFNBQVM7WUFDVixDQUFDO1lBQ0QsTUFBTSxXQUFXLEdBQUcsVUFBVSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6RCxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ2xCLGdCQUFnQixJQUFJLFNBQVMsQ0FBQztnQkFDOUIsU0FBUztZQUNWLENBQUM7WUFDRCxNQUFNLGNBQWMsR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDO1lBRTFDLGdCQUFnQixJQUFJLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7WUFDMUMsT0FBTyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3JDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNWLE9BQU8sQ0FBQyxHQUFHLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDaEMsUUFBUSxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDcEIsS0FBSyxHQUFHO3dCQUNQLGdCQUFnQixJQUFJLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7d0JBQ3ZELENBQUMsR0FBRyxjQUFjLENBQUM7d0JBQ25CLE1BQU07b0JBQ1AsS0FBSyxHQUFHO3dCQUNQLGdCQUFnQixJQUFJLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQzt3QkFDakQsTUFBTTtvQkFDUCxLQUFLLEdBQUc7d0JBQ1AsZ0JBQWdCLElBQUksV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQzt3QkFDdkQsQ0FBQyxHQUFHLGNBQWMsQ0FBQzt3QkFDbkIsTUFBTTtvQkFDUCxLQUFLLEdBQUc7d0JBQ1AsZ0JBQWdCLElBQUksV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO3dCQUNqRCxNQUFNO2dCQUNSLENBQUM7WUFDRixDQUFDO1lBQ0Qsa0ZBQWtGO1lBQ2xGLElBQUksQ0FBQyxHQUFHLGNBQWMsRUFBRSxDQUFDO2dCQUN4QixnQkFBZ0IsSUFBSSxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFDLENBQUM7WUFFRCxnQkFBZ0IsSUFBSSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1FBQzNDLENBQUM7UUFFRCxxRUFBcUU7UUFDckUsZ0JBQWdCLElBQUksYUFBYSxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXRFLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRU0sa0JBQWtCLENBQUMsT0FBd0IsRUFBRSxZQUFzQjtRQUN6RSxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2xCLE9BQU8sbUNBQW1DLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUMzRSxDQUFDO2FBQU0sQ0FBQztZQUNQLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQztRQUM3QixDQUFDO0lBQ0YsQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNLLGtCQUFrQixDQUFDLGFBQXFCO1FBQy9DLElBQUksQ0FBQyxhQUFhLElBQUksYUFBYSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNsRCxPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksVUFBVSxHQUFHLENBQUMsRUFBRSxNQUFNLEdBQUcsRUFBRSxDQUFDO1FBQ2hDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxhQUFhLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUMxRCxNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRTNDLElBQUksTUFBTSxnQ0FBdUIsRUFBRSxDQUFDO2dCQUVuQyxvQkFBb0I7Z0JBQ3BCLENBQUMsRUFBRSxDQUFDO2dCQUVKLElBQUksQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO29CQUNkLHVCQUF1QjtvQkFDdkIsTUFBTTtnQkFDUCxDQUFDO2dCQUVELE1BQU0sVUFBVSxHQUFHLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQy9DLElBQUksb0JBQW9CLEdBQWtCLElBQUksQ0FBQztnQkFFL0MsUUFBUSxVQUFVLEVBQUUsQ0FBQztvQkFDcEI7d0JBQ0MsVUFBVTt3QkFDVixvQkFBb0IsR0FBRyxJQUFJLENBQUM7d0JBQzVCLE1BQU07b0JBQ1A7d0JBQ0MsV0FBVzt3QkFDWCxvQkFBb0IsR0FBRyxJQUFJLENBQUM7d0JBQzVCLE1BQU07b0JBQ1A7d0JBQ0MsWUFBWTt3QkFDWixvQkFBb0IsR0FBRyxJQUFJLENBQUM7d0JBQzVCLE1BQU07Z0JBQ1IsQ0FBQztnQkFFRCxJQUFJLG9CQUFvQixFQUFFLENBQUM7b0JBQzFCLE1BQU0sSUFBSSxhQUFhLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsb0JBQW9CLENBQUM7b0JBQzVFLFVBQVUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNwQixDQUFDO1lBQ0YsQ0FBQztZQUVELElBQUksTUFBTSxpQ0FBd0IsRUFBRSxDQUFDO2dCQUVwQyxvQkFBb0I7Z0JBQ3BCLENBQUMsRUFBRSxDQUFDO2dCQUVKLElBQUksQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO29CQUNkLHVCQUF1QjtvQkFDdkIsTUFBTTtnQkFDUCxDQUFDO2dCQUVELE1BQU0sVUFBVSxHQUFHLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQy9DLElBQUksb0JBQW9CLEdBQWtCLElBQUksQ0FBQztnQkFFL0MsUUFBUSxVQUFVLEVBQUUsQ0FBQztvQkFDcEI7d0JBQ0MsV0FBVzt3QkFDWCxvQkFBb0IsR0FBRyxJQUFJLENBQUM7d0JBQzVCLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDO3dCQUMzQixNQUFNO29CQUNQLGdDQUF1QjtvQkFDdkI7d0JBQ0MsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUM7d0JBQzNCLE1BQU07b0JBQ1AsT0FBTyxDQUFDLENBQUMsQ0FBQzt3QkFDVCwyRkFBMkY7d0JBQzNGLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUscURBQW1DLEVBQUUsQ0FBQzs0QkFDakUsTUFBTTt3QkFDUCxDQUFDO3dCQUNELElBQUksQ0FBQyxLQUFLLGFBQWEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7NEJBQ3BDLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDOzRCQUMzQixNQUFNO3dCQUNQLENBQUM7d0JBQ0QsSUFBSSxRQUFRLEdBQUcsYUFBYSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO3dCQUM3QyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLHFEQUFtQyxFQUFFLENBQUM7NEJBQy9ELElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDOzRCQUMzQixFQUFFLENBQUMsQ0FBQzs0QkFDSixNQUFNO3dCQUNQLENBQUM7d0JBQ0QsSUFBSSxDQUFDLEtBQUssYUFBYSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQzs0QkFDcEMsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUM7NEJBQzNCLE1BQU07d0JBQ1AsQ0FBQzt3QkFDRCxRQUFRLEdBQUcsYUFBYSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO3dCQUN6QyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLHFEQUFtQyxFQUFFLENBQUM7NEJBQy9ELElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDOzRCQUMzQixFQUFFLENBQUMsQ0FBQzs0QkFDSixNQUFNO3dCQUNQLENBQUM7d0JBQ0QsTUFBTTtvQkFDUCxDQUFDO2dCQUNGLENBQUM7Z0JBRUQsSUFBSSxvQkFBb0IsRUFBRSxDQUFDO29CQUMxQixNQUFNLElBQUksYUFBYSxDQUFDLFNBQVMsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLG9CQUFvQixDQUFDO29CQUM1RSxVQUFVLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDcEIsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxVQUFVLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDdEIsMEJBQTBCO1lBQzFCLE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDLGVBQWUsR0FBRyxNQUFNLEdBQUcsYUFBYSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUNyRSxDQUFDO0lBRU8sT0FBTyxDQUFDLEtBQWEsRUFBRSxJQUFZLEVBQUUsRUFBVTtRQUN0RCxPQUFPLElBQUksSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLEVBQUUsQ0FBQztJQUNyQyxDQUFDO0NBQ0QifQ==