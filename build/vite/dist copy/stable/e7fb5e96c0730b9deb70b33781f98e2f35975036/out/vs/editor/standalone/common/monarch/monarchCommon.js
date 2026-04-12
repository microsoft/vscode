/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { escapeRegExpCharacters } from '../../../../base/common/strings.js';
/*
 * This module exports common types and functionality shared between
 * the Monarch compiler that compiles JSON to ILexer, and the Monarch
 * Tokenizer (that highlights at runtime)
 */
/*
 * Type definitions to be used internally to Monarch.
 * Inside monarch we use fully typed definitions and compiled versions of the more abstract JSON descriptions.
 */
export var MonarchBracket;
(function (MonarchBracket) {
    MonarchBracket[MonarchBracket["None"] = 0] = "None";
    MonarchBracket[MonarchBracket["Open"] = 1] = "Open";
    MonarchBracket[MonarchBracket["Close"] = -1] = "Close";
})(MonarchBracket || (MonarchBracket = {}));
export function isFuzzyActionArr(what) {
    return (Array.isArray(what));
}
export function isFuzzyAction(what) {
    return !isFuzzyActionArr(what);
}
export function isString(what) {
    return (typeof what === 'string');
}
export function isIAction(what) {
    return !isString(what);
}
// Small helper functions
/**
 * Is a string null, undefined, or empty?
 */
export function empty(s) {
    return (s ? false : true);
}
/**
 * Puts a string to lower case if 'ignoreCase' is set.
 */
export function fixCase(lexer, str) {
    return (lexer.ignoreCase && str ? str.toLowerCase() : str);
}
/**
 * Ensures there are no bad characters in a CSS token class.
 */
export function sanitize(s) {
    return s.replace(/[&<>'"_]/g, '-'); // used on all output token CSS classes
}
// Logging
/**
 * Logs a message.
 */
export function log(lexer, msg) {
    console.log(`${lexer.languageId}: ${msg}`);
}
// Throwing errors
export function createError(lexer, msg) {
    return new Error(`${lexer.languageId}: ${msg}`);
}
// Helper functions for rule finding and substitution
/**
 * substituteMatches is used on lexer strings and can substitutes predefined patterns:
 * 		$$  => $
 * 		$#  => id
 * 		$n  => matched entry n
 * 		@attr => contents of lexer[attr]
 *
 * See documentation for more info
 */
export function substituteMatches(lexer, str, id, matches, state) {
    const re = /\$((\$)|(#)|(\d\d?)|[sS](\d\d?)|@(\w+))/g;
    let stateMatches = null;
    return str.replace(re, function (full, sub, dollar, hash, n, s, attr, ofs, total) {
        if (!empty(dollar)) {
            return '$'; // $$
        }
        if (!empty(hash)) {
            return fixCase(lexer, id); // default $#
        }
        if (!empty(n) && n < matches.length) {
            return fixCase(lexer, matches[n]); // $n
        }
        if (!empty(attr) && lexer && typeof (lexer[attr]) === 'string') {
            return lexer[attr]; //@attribute
        }
        if (stateMatches === null) { // split state on demand
            stateMatches = state.split('.');
            stateMatches.unshift(state);
        }
        if (!empty(s) && s < stateMatches.length) {
            return fixCase(lexer, stateMatches[s]); //$Sn
        }
        return '';
    });
}
/**
 * substituteMatchesRe is used on lexer regex rules and can substitutes predefined patterns:
 * 		$Sn => n'th part of state
 *
 */
export function substituteMatchesRe(lexer, str, state) {
    const re = /\$[sS](\d\d?)/g;
    let stateMatches = null;
    return str.replace(re, function (full, s) {
        if (stateMatches === null) { // split state on demand
            stateMatches = state.split('.');
            stateMatches.unshift(state);
        }
        if (!empty(s) && s < stateMatches.length) {
            return escapeRegExpCharacters(fixCase(lexer, stateMatches[s])); //$Sn
        }
        return '';
    });
}
/**
 * Find the tokenizer rules for a specific state (i.e. next action)
 */
export function findRules(lexer, inState) {
    let state = inState;
    while (state && state.length > 0) {
        const rules = lexer.tokenizer[state];
        if (rules) {
            return rules;
        }
        const idx = state.lastIndexOf('.');
        if (idx < 0) {
            state = null; // no further parent
        }
        else {
            state = state.substr(0, idx);
        }
    }
    return null;
}
/**
 * Is a certain state defined? In contrast to 'findRules' this works on a ILexerMin.
 * This is used during compilation where we may know the defined states
 * but not yet whether the corresponding rules are correct.
 */
export function stateExists(lexer, inState) {
    let state = inState;
    while (state && state.length > 0) {
        const exist = lexer.stateNames[state];
        if (exist) {
            return true;
        }
        const idx = state.lastIndexOf('.');
        if (idx < 0) {
            state = null; // no further parent
        }
        else {
            state = state.substr(0, idx);
        }
    }
    return false;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uYXJjaENvbW1vbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9zdGFuZGFsb25lL2NvbW1vbi9tb25hcmNoL21vbmFyY2hDb21tb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFNUU7Ozs7R0FJRztBQUVIOzs7R0FHRztBQUVILE1BQU0sQ0FBTixJQUFrQixjQUlqQjtBQUpELFdBQWtCLGNBQWM7SUFDL0IsbURBQVEsQ0FBQTtJQUNSLG1EQUFRLENBQUE7SUFDUixzREFBVSxDQUFBO0FBQ1gsQ0FBQyxFQUppQixjQUFjLEtBQWQsY0FBYyxRQUkvQjtBQWlDRCxNQUFNLFVBQVUsZ0JBQWdCLENBQUMsSUFBaUM7SUFDakUsT0FBTyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUM5QixDQUFDO0FBRUQsTUFBTSxVQUFVLGFBQWEsQ0FBQyxJQUFpQztJQUM5RCxPQUFPLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDaEMsQ0FBQztBQUVELE1BQU0sVUFBVSxRQUFRLENBQUMsSUFBaUI7SUFDekMsT0FBTyxDQUFDLE9BQU8sSUFBSSxLQUFLLFFBQVEsQ0FBQyxDQUFDO0FBQ25DLENBQUM7QUFFRCxNQUFNLFVBQVUsU0FBUyxDQUFDLElBQWlCO0lBQzFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDeEIsQ0FBQztBQW1DRCx5QkFBeUI7QUFFekI7O0dBRUc7QUFDSCxNQUFNLFVBQVUsS0FBSyxDQUFDLENBQVM7SUFDOUIsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUMzQixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLFVBQVUsT0FBTyxDQUFDLEtBQWdCLEVBQUUsR0FBVztJQUNwRCxPQUFPLENBQUMsS0FBSyxDQUFDLFVBQVUsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDNUQsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLFFBQVEsQ0FBQyxDQUFTO0lBQ2pDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyx1Q0FBdUM7QUFDNUUsQ0FBQztBQUVELFVBQVU7QUFFVjs7R0FFRztBQUNILE1BQU0sVUFBVSxHQUFHLENBQUMsS0FBZ0IsRUFBRSxHQUFXO0lBQ2hELE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUMsVUFBVSxLQUFLLEdBQUcsRUFBRSxDQUFDLENBQUM7QUFDNUMsQ0FBQztBQUVELGtCQUFrQjtBQUVsQixNQUFNLFVBQVUsV0FBVyxDQUFDLEtBQWdCLEVBQUUsR0FBVztJQUN4RCxPQUFPLElBQUksS0FBSyxDQUFDLEdBQUcsS0FBSyxDQUFDLFVBQVUsS0FBSyxHQUFHLEVBQUUsQ0FBQyxDQUFDO0FBQ2pELENBQUM7QUFFRCxxREFBcUQ7QUFFckQ7Ozs7Ozs7O0dBUUc7QUFDSCxNQUFNLFVBQVUsaUJBQWlCLENBQUMsS0FBZ0IsRUFBRSxHQUFXLEVBQUUsRUFBVSxFQUFFLE9BQWlCLEVBQUUsS0FBYTtJQUM1RyxNQUFNLEVBQUUsR0FBRywwQ0FBMEMsQ0FBQztJQUN0RCxJQUFJLFlBQVksR0FBb0IsSUFBSSxDQUFDO0lBQ3pDLE9BQU8sR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLEVBQUUsVUFBVSxJQUFJLEVBQUUsR0FBSSxFQUFFLE1BQU8sRUFBRSxJQUFLLEVBQUUsQ0FBRSxFQUFFLENBQUUsRUFBRSxJQUFLLEVBQUUsR0FBSSxFQUFFLEtBQU07UUFDdkYsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQ3BCLE9BQU8sR0FBRyxDQUFDLENBQUMsS0FBSztRQUNsQixDQUFDO1FBQ0QsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sT0FBTyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFHLGFBQWE7UUFDM0MsQ0FBQztRQUNELElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNyQyxPQUFPLE9BQU8sQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLO1FBQ3pDLENBQUM7UUFDRCxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssSUFBSSxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDaEUsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxZQUFZO1FBQ2pDLENBQUM7UUFDRCxJQUFJLFlBQVksS0FBSyxJQUFJLEVBQUUsQ0FBQyxDQUFDLHdCQUF3QjtZQUNwRCxZQUFZLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNoQyxZQUFZLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzdCLENBQUM7UUFDRCxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDMUMsT0FBTyxPQUFPLENBQUMsS0FBSyxFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSztRQUM5QyxDQUFDO1FBQ0QsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRDs7OztHQUlHO0FBQ0gsTUFBTSxVQUFVLG1CQUFtQixDQUFDLEtBQWdCLEVBQUUsR0FBVyxFQUFFLEtBQWE7SUFDL0UsTUFBTSxFQUFFLEdBQUcsZ0JBQWdCLENBQUM7SUFDNUIsSUFBSSxZQUFZLEdBQW9CLElBQUksQ0FBQztJQUN6QyxPQUFPLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxFQUFFLFVBQVUsSUFBSSxFQUFFLENBQUM7UUFDdkMsSUFBSSxZQUFZLEtBQUssSUFBSSxFQUFFLENBQUMsQ0FBQyx3QkFBd0I7WUFDcEQsWUFBWSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDaEMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM3QixDQUFDO1FBQ0QsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQzFDLE9BQU8sc0JBQXNCLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSztRQUN0RSxDQUFDO1FBQ0QsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRDs7R0FFRztBQUNILE1BQU0sVUFBVSxTQUFTLENBQUMsS0FBYSxFQUFFLE9BQWU7SUFDdkQsSUFBSSxLQUFLLEdBQWtCLE9BQU8sQ0FBQztJQUNuQyxPQUFPLEtBQUssSUFBSSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ2xDLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDckMsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNYLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUVELE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbkMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDYixLQUFLLEdBQUcsSUFBSSxDQUFDLENBQUMsb0JBQW9CO1FBQ25DLENBQUM7YUFBTSxDQUFDO1lBQ1AsS0FBSyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQzlCLENBQUM7SUFDRixDQUFDO0lBQ0QsT0FBTyxJQUFJLENBQUM7QUFDYixDQUFDO0FBRUQ7Ozs7R0FJRztBQUNILE1BQU0sVUFBVSxXQUFXLENBQUMsS0FBZ0IsRUFBRSxPQUFlO0lBQzVELElBQUksS0FBSyxHQUFrQixPQUFPLENBQUM7SUFDbkMsT0FBTyxLQUFLLElBQUksS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNsQyxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3RDLElBQUksS0FBSyxFQUFFLENBQUM7WUFDWCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCxNQUFNLEdBQUcsR0FBRyxLQUFLLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ25DLElBQUksR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ2IsS0FBSyxHQUFHLElBQUksQ0FBQyxDQUFDLG9CQUFvQjtRQUNuQyxDQUFDO2FBQU0sQ0FBQztZQUNQLEtBQUssR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUM5QixDQUFDO0lBQ0YsQ0FBQztJQUNELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQyJ9