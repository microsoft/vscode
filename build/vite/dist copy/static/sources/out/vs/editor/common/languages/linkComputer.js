/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CharacterClassifier } from '../core/characterClassifier.js';
export var State;
(function (State) {
    State[State["Invalid"] = 0] = "Invalid";
    State[State["Start"] = 1] = "Start";
    State[State["H"] = 2] = "H";
    State[State["HT"] = 3] = "HT";
    State[State["HTT"] = 4] = "HTT";
    State[State["HTTP"] = 5] = "HTTP";
    State[State["F"] = 6] = "F";
    State[State["FI"] = 7] = "FI";
    State[State["FIL"] = 8] = "FIL";
    State[State["BeforeColon"] = 9] = "BeforeColon";
    State[State["AfterColon"] = 10] = "AfterColon";
    State[State["AlmostThere"] = 11] = "AlmostThere";
    State[State["End"] = 12] = "End";
    State[State["Accept"] = 13] = "Accept";
    State[State["LastKnownState"] = 14] = "LastKnownState"; // marker, custom states may follow
})(State || (State = {}));
class Uint8Matrix {
    constructor(rows, cols, defaultValue) {
        const data = new Uint8Array(rows * cols);
        for (let i = 0, len = rows * cols; i < len; i++) {
            data[i] = defaultValue;
        }
        this._data = data;
        this.rows = rows;
        this.cols = cols;
    }
    get(row, col) {
        return this._data[row * this.cols + col];
    }
    set(row, col, value) {
        this._data[row * this.cols + col] = value;
    }
}
export class StateMachine {
    constructor(edges) {
        let maxCharCode = 0;
        let maxState = 0 /* State.Invalid */;
        for (let i = 0, len = edges.length; i < len; i++) {
            const [from, chCode, to] = edges[i];
            if (chCode > maxCharCode) {
                maxCharCode = chCode;
            }
            if (from > maxState) {
                maxState = from;
            }
            if (to > maxState) {
                maxState = to;
            }
        }
        maxCharCode++;
        maxState++;
        const states = new Uint8Matrix(maxState, maxCharCode, 0 /* State.Invalid */);
        for (let i = 0, len = edges.length; i < len; i++) {
            const [from, chCode, to] = edges[i];
            states.set(from, chCode, to);
        }
        this._states = states;
        this._maxCharCode = maxCharCode;
    }
    nextState(currentState, chCode) {
        if (chCode < 0 || chCode >= this._maxCharCode) {
            return 0 /* State.Invalid */;
        }
        return this._states.get(currentState, chCode);
    }
}
// State machine for http:// or https:// or file://
let _stateMachine = null;
function getStateMachine() {
    if (_stateMachine === null) {
        _stateMachine = new StateMachine([
            [1 /* State.Start */, 104 /* CharCode.h */, 2 /* State.H */],
            [1 /* State.Start */, 72 /* CharCode.H */, 2 /* State.H */],
            [1 /* State.Start */, 102 /* CharCode.f */, 6 /* State.F */],
            [1 /* State.Start */, 70 /* CharCode.F */, 6 /* State.F */],
            [2 /* State.H */, 116 /* CharCode.t */, 3 /* State.HT */],
            [2 /* State.H */, 84 /* CharCode.T */, 3 /* State.HT */],
            [3 /* State.HT */, 116 /* CharCode.t */, 4 /* State.HTT */],
            [3 /* State.HT */, 84 /* CharCode.T */, 4 /* State.HTT */],
            [4 /* State.HTT */, 112 /* CharCode.p */, 5 /* State.HTTP */],
            [4 /* State.HTT */, 80 /* CharCode.P */, 5 /* State.HTTP */],
            [5 /* State.HTTP */, 115 /* CharCode.s */, 9 /* State.BeforeColon */],
            [5 /* State.HTTP */, 83 /* CharCode.S */, 9 /* State.BeforeColon */],
            [5 /* State.HTTP */, 58 /* CharCode.Colon */, 10 /* State.AfterColon */],
            [6 /* State.F */, 105 /* CharCode.i */, 7 /* State.FI */],
            [6 /* State.F */, 73 /* CharCode.I */, 7 /* State.FI */],
            [7 /* State.FI */, 108 /* CharCode.l */, 8 /* State.FIL */],
            [7 /* State.FI */, 76 /* CharCode.L */, 8 /* State.FIL */],
            [8 /* State.FIL */, 101 /* CharCode.e */, 9 /* State.BeforeColon */],
            [8 /* State.FIL */, 69 /* CharCode.E */, 9 /* State.BeforeColon */],
            [9 /* State.BeforeColon */, 58 /* CharCode.Colon */, 10 /* State.AfterColon */],
            [10 /* State.AfterColon */, 47 /* CharCode.Slash */, 11 /* State.AlmostThere */],
            [11 /* State.AlmostThere */, 47 /* CharCode.Slash */, 12 /* State.End */],
        ]);
    }
    return _stateMachine;
}
var CharacterClass;
(function (CharacterClass) {
    CharacterClass[CharacterClass["None"] = 0] = "None";
    CharacterClass[CharacterClass["ForceTermination"] = 1] = "ForceTermination";
    CharacterClass[CharacterClass["CannotEndIn"] = 2] = "CannotEndIn";
})(CharacterClass || (CharacterClass = {}));
let _classifier = null;
function getClassifier() {
    if (_classifier === null) {
        _classifier = new CharacterClassifier(0 /* CharacterClass.None */);
        // allow-any-unicode-next-line
        const FORCE_TERMINATION_CHARACTERS = ' \t<>\'\"、。｡､，．：；‘〈「『〔（［｛｢｣｝］）〕』」〉’｀～…|';
        for (let i = 0; i < FORCE_TERMINATION_CHARACTERS.length; i++) {
            _classifier.set(FORCE_TERMINATION_CHARACTERS.charCodeAt(i), 1 /* CharacterClass.ForceTermination */);
        }
        const CANNOT_END_WITH_CHARACTERS = '.,;:';
        for (let i = 0; i < CANNOT_END_WITH_CHARACTERS.length; i++) {
            _classifier.set(CANNOT_END_WITH_CHARACTERS.charCodeAt(i), 2 /* CharacterClass.CannotEndIn */);
        }
    }
    return _classifier;
}
export class LinkComputer {
    static _createLink(classifier, line, lineNumber, linkBeginIndex, linkEndIndex) {
        // Do not allow to end link in certain characters...
        let lastIncludedCharIndex = linkEndIndex - 1;
        do {
            const chCode = line.charCodeAt(lastIncludedCharIndex);
            const chClass = classifier.get(chCode);
            if (chClass !== 2 /* CharacterClass.CannotEndIn */) {
                break;
            }
            lastIncludedCharIndex--;
        } while (lastIncludedCharIndex > linkBeginIndex);
        // Handle links enclosed in parens, square brackets and curlys.
        if (linkBeginIndex > 0) {
            const charCodeBeforeLink = line.charCodeAt(linkBeginIndex - 1);
            const lastCharCodeInLink = line.charCodeAt(lastIncludedCharIndex);
            if ((charCodeBeforeLink === 40 /* CharCode.OpenParen */ && lastCharCodeInLink === 41 /* CharCode.CloseParen */)
                || (charCodeBeforeLink === 91 /* CharCode.OpenSquareBracket */ && lastCharCodeInLink === 93 /* CharCode.CloseSquareBracket */)
                || (charCodeBeforeLink === 123 /* CharCode.OpenCurlyBrace */ && lastCharCodeInLink === 125 /* CharCode.CloseCurlyBrace */)) {
                // Do not end in ) if ( is before the link start
                // Do not end in ] if [ is before the link start
                // Do not end in } if { is before the link start
                lastIncludedCharIndex--;
            }
        }
        return {
            range: {
                startLineNumber: lineNumber,
                startColumn: linkBeginIndex + 1,
                endLineNumber: lineNumber,
                endColumn: lastIncludedCharIndex + 2
            },
            url: line.substring(linkBeginIndex, lastIncludedCharIndex + 1)
        };
    }
    static computeLinks(model, stateMachine = getStateMachine()) {
        const classifier = getClassifier();
        const result = [];
        for (let i = 1, lineCount = model.getLineCount(); i <= lineCount; i++) {
            const line = model.getLineContent(i);
            const len = line.length;
            let j = 0;
            let linkBeginIndex = 0;
            let linkBeginChCode = 0;
            let state = 1 /* State.Start */;
            let hasOpenParens = false;
            let hasOpenSquareBracket = false;
            let inSquareBrackets = false;
            let hasOpenCurlyBracket = false;
            while (j < len) {
                let resetStateMachine = false;
                const chCode = line.charCodeAt(j);
                if (state === 13 /* State.Accept */) {
                    let chClass;
                    switch (chCode) {
                        case 40 /* CharCode.OpenParen */:
                            hasOpenParens = true;
                            chClass = 0 /* CharacterClass.None */;
                            break;
                        case 41 /* CharCode.CloseParen */:
                            chClass = (hasOpenParens ? 0 /* CharacterClass.None */ : 1 /* CharacterClass.ForceTermination */);
                            break;
                        case 91 /* CharCode.OpenSquareBracket */:
                            inSquareBrackets = true;
                            hasOpenSquareBracket = true;
                            chClass = 0 /* CharacterClass.None */;
                            break;
                        case 93 /* CharCode.CloseSquareBracket */:
                            inSquareBrackets = false;
                            chClass = (hasOpenSquareBracket ? 0 /* CharacterClass.None */ : 1 /* CharacterClass.ForceTermination */);
                            break;
                        case 123 /* CharCode.OpenCurlyBrace */:
                            hasOpenCurlyBracket = true;
                            chClass = 0 /* CharacterClass.None */;
                            break;
                        case 125 /* CharCode.CloseCurlyBrace */:
                            chClass = (hasOpenCurlyBracket ? 0 /* CharacterClass.None */ : 1 /* CharacterClass.ForceTermination */);
                            break;
                        // The following three rules make it that ' or " or ` are allowed inside links
                        // only if the link is wrapped by some other quote character
                        case 39 /* CharCode.SingleQuote */:
                        case 34 /* CharCode.DoubleQuote */:
                        case 96 /* CharCode.BackTick */:
                            if (linkBeginChCode === chCode) {
                                chClass = 1 /* CharacterClass.ForceTermination */;
                            }
                            else if (linkBeginChCode === 39 /* CharCode.SingleQuote */ || linkBeginChCode === 34 /* CharCode.DoubleQuote */ || linkBeginChCode === 96 /* CharCode.BackTick */) {
                                chClass = 0 /* CharacterClass.None */;
                            }
                            else {
                                chClass = 1 /* CharacterClass.ForceTermination */;
                            }
                            break;
                        case 42 /* CharCode.Asterisk */:
                            // `*` terminates a link if the link began with `*`
                            chClass = (linkBeginChCode === 42 /* CharCode.Asterisk */) ? 1 /* CharacterClass.ForceTermination */ : 0 /* CharacterClass.None */;
                            break;
                        case 32 /* CharCode.Space */:
                            // ` ` allow space in between [ and ]
                            chClass = (inSquareBrackets ? 0 /* CharacterClass.None */ : 1 /* CharacterClass.ForceTermination */);
                            break;
                        default:
                            chClass = classifier.get(chCode);
                    }
                    // Check if character terminates link
                    if (chClass === 1 /* CharacterClass.ForceTermination */) {
                        result.push(LinkComputer._createLink(classifier, line, i, linkBeginIndex, j));
                        resetStateMachine = true;
                    }
                }
                else if (state === 12 /* State.End */) {
                    let chClass;
                    if (chCode === 91 /* CharCode.OpenSquareBracket */) {
                        // Allow for the authority part to contain ipv6 addresses which contain [ and ]
                        hasOpenSquareBracket = true;
                        chClass = 0 /* CharacterClass.None */;
                    }
                    else {
                        chClass = classifier.get(chCode);
                    }
                    // Check if character terminates link
                    if (chClass === 1 /* CharacterClass.ForceTermination */) {
                        resetStateMachine = true;
                    }
                    else {
                        state = 13 /* State.Accept */;
                    }
                }
                else {
                    state = stateMachine.nextState(state, chCode);
                    if (state === 0 /* State.Invalid */) {
                        resetStateMachine = true;
                    }
                }
                if (resetStateMachine) {
                    state = 1 /* State.Start */;
                    hasOpenParens = false;
                    hasOpenSquareBracket = false;
                    hasOpenCurlyBracket = false;
                    // Record where the link started
                    linkBeginIndex = j + 1;
                    linkBeginChCode = chCode;
                }
                j++;
            }
            if (state === 13 /* State.Accept */) {
                result.push(LinkComputer._createLink(classifier, line, i, linkBeginIndex, len));
            }
        }
        return result;
    }
}
/**
 * Returns an array of all links contains in the provided
 * document. *Note* that this operation is computational
 * expensive and should not run in the UI thread.
 */
export function computeLinks(model) {
    if (!model || typeof model.getLineCount !== 'function' || typeof model.getLineContent !== 'function') {
        // Unknown caller!
        return [];
    }
    return LinkComputer.computeLinks(model);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlua0NvbXB1dGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGlua0NvbXB1dGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBUXJFLE1BQU0sQ0FBTixJQUFrQixLQWdCakI7QUFoQkQsV0FBa0IsS0FBSztJQUN0Qix1Q0FBVyxDQUFBO0lBQ1gsbUNBQVMsQ0FBQTtJQUNULDJCQUFLLENBQUE7SUFDTCw2QkFBTSxDQUFBO0lBQ04sK0JBQU8sQ0FBQTtJQUNQLGlDQUFRLENBQUE7SUFDUiwyQkFBSyxDQUFBO0lBQ0wsNkJBQU0sQ0FBQTtJQUNOLCtCQUFPLENBQUE7SUFDUCwrQ0FBZSxDQUFBO0lBQ2YsOENBQWUsQ0FBQTtJQUNmLGdEQUFnQixDQUFBO0lBQ2hCLGdDQUFRLENBQUE7SUFDUixzQ0FBVyxDQUFBO0lBQ1gsc0RBQW1CLENBQUEsQ0FBQyxtQ0FBbUM7QUFDeEQsQ0FBQyxFQWhCaUIsS0FBSyxLQUFMLEtBQUssUUFnQnRCO0FBSUQsTUFBTSxXQUFXO0lBTWhCLFlBQVksSUFBWSxFQUFFLElBQVksRUFBRSxZQUFvQjtRQUMzRCxNQUFNLElBQUksR0FBRyxJQUFJLFVBQVUsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLENBQUM7UUFDekMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLElBQUksR0FBRyxJQUFJLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2pELElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxZQUFZLENBQUM7UUFDeEIsQ0FBQztRQUVELElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1FBQ2xCLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0lBQ2xCLENBQUM7SUFFTSxHQUFHLENBQUMsR0FBVyxFQUFFLEdBQVc7UUFDbEMsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFTSxHQUFHLENBQUMsR0FBVyxFQUFFLEdBQVcsRUFBRSxLQUFhO1FBQ2pELElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDO0lBQzNDLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxZQUFZO0lBS3hCLFlBQVksS0FBYTtRQUN4QixJQUFJLFdBQVcsR0FBRyxDQUFDLENBQUM7UUFDcEIsSUFBSSxRQUFRLHdCQUFnQixDQUFDO1FBQzdCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNsRCxNQUFNLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEMsSUFBSSxNQUFNLEdBQUcsV0FBVyxFQUFFLENBQUM7Z0JBQzFCLFdBQVcsR0FBRyxNQUFNLENBQUM7WUFDdEIsQ0FBQztZQUNELElBQUksSUFBSSxHQUFHLFFBQVEsRUFBRSxDQUFDO2dCQUNyQixRQUFRLEdBQUcsSUFBSSxDQUFDO1lBQ2pCLENBQUM7WUFDRCxJQUFJLEVBQUUsR0FBRyxRQUFRLEVBQUUsQ0FBQztnQkFDbkIsUUFBUSxHQUFHLEVBQUUsQ0FBQztZQUNmLENBQUM7UUFDRixDQUFDO1FBRUQsV0FBVyxFQUFFLENBQUM7UUFDZCxRQUFRLEVBQUUsQ0FBQztRQUVYLE1BQU0sTUFBTSxHQUFHLElBQUksV0FBVyxDQUFDLFFBQVEsRUFBRSxXQUFXLHdCQUFnQixDQUFDO1FBQ3JFLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNsRCxNQUFNLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzlCLENBQUM7UUFFRCxJQUFJLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQztRQUN0QixJQUFJLENBQUMsWUFBWSxHQUFHLFdBQVcsQ0FBQztJQUNqQyxDQUFDO0lBRU0sU0FBUyxDQUFDLFlBQW1CLEVBQUUsTUFBYztRQUNuRCxJQUFJLE1BQU0sR0FBRyxDQUFDLElBQUksTUFBTSxJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUMvQyw2QkFBcUI7UUFDdEIsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQy9DLENBQUM7Q0FDRDtBQUVELG1EQUFtRDtBQUNuRCxJQUFJLGFBQWEsR0FBd0IsSUFBSSxDQUFDO0FBQzlDLFNBQVMsZUFBZTtJQUN2QixJQUFJLGFBQWEsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUM1QixhQUFhLEdBQUcsSUFBSSxZQUFZLENBQUM7WUFDaEMsNERBQWtDO1lBQ2xDLDJEQUFrQztZQUNsQyw0REFBa0M7WUFDbEMsMkRBQWtDO1lBRWxDLHlEQUErQjtZQUMvQix3REFBK0I7WUFFL0IsMkRBQWlDO1lBQ2pDLDBEQUFpQztZQUVqQyw2REFBbUM7WUFDbkMsNERBQW1DO1lBRW5DLHFFQUEyQztZQUMzQyxvRUFBMkM7WUFDM0Msd0VBQThDO1lBRTlDLHlEQUErQjtZQUMvQix3REFBK0I7WUFFL0IsMkRBQWlDO1lBQ2pDLDBEQUFpQztZQUVqQyxvRUFBMEM7WUFDMUMsbUVBQTBDO1lBRTFDLCtFQUFxRDtZQUVyRCxnRkFBcUQ7WUFFckQseUVBQThDO1NBQzlDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFDRCxPQUFPLGFBQWEsQ0FBQztBQUN0QixDQUFDO0FBR0QsSUFBVyxjQUlWO0FBSkQsV0FBVyxjQUFjO0lBQ3hCLG1EQUFRLENBQUE7SUFDUiwyRUFBb0IsQ0FBQTtJQUNwQixpRUFBZSxDQUFBO0FBQ2hCLENBQUMsRUFKVSxjQUFjLEtBQWQsY0FBYyxRQUl4QjtBQUVELElBQUksV0FBVyxHQUErQyxJQUFJLENBQUM7QUFDbkUsU0FBUyxhQUFhO0lBQ3JCLElBQUksV0FBVyxLQUFLLElBQUksRUFBRSxDQUFDO1FBQzFCLFdBQVcsR0FBRyxJQUFJLG1CQUFtQiw2QkFBcUMsQ0FBQztRQUUzRSw4QkFBOEI7UUFDOUIsTUFBTSw0QkFBNEIsR0FBRyx5Q0FBeUMsQ0FBQztRQUMvRSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsNEJBQTRCLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDOUQsV0FBVyxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLDBDQUFrQyxDQUFDO1FBQzlGLENBQUM7UUFFRCxNQUFNLDBCQUEwQixHQUFHLE1BQU0sQ0FBQztRQUMxQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsMEJBQTBCLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDNUQsV0FBVyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLHFDQUE2QixDQUFDO1FBQ3ZGLENBQUM7SUFDRixDQUFDO0lBQ0QsT0FBTyxXQUFXLENBQUM7QUFDcEIsQ0FBQztBQUVELE1BQU0sT0FBTyxZQUFZO0lBRWhCLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBK0MsRUFBRSxJQUFZLEVBQUUsVUFBa0IsRUFBRSxjQUFzQixFQUFFLFlBQW9CO1FBQ3pKLG9EQUFvRDtRQUNwRCxJQUFJLHFCQUFxQixHQUFHLFlBQVksR0FBRyxDQUFDLENBQUM7UUFDN0MsR0FBRyxDQUFDO1lBQ0gsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1lBQ3RELE1BQU0sT0FBTyxHQUFHLFVBQVUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDdkMsSUFBSSxPQUFPLHVDQUErQixFQUFFLENBQUM7Z0JBQzVDLE1BQU07WUFDUCxDQUFDO1lBQ0QscUJBQXFCLEVBQUUsQ0FBQztRQUN6QixDQUFDLFFBQVEscUJBQXFCLEdBQUcsY0FBYyxFQUFFO1FBRWpELCtEQUErRDtRQUMvRCxJQUFJLGNBQWMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN4QixNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQy9ELE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1lBRWxFLElBQ0MsQ0FBQyxrQkFBa0IsZ0NBQXVCLElBQUksa0JBQWtCLGlDQUF3QixDQUFDO21CQUN0RixDQUFDLGtCQUFrQix3Q0FBK0IsSUFBSSxrQkFBa0IseUNBQWdDLENBQUM7bUJBQ3pHLENBQUMsa0JBQWtCLHNDQUE0QixJQUFJLGtCQUFrQix1Q0FBNkIsQ0FBQyxFQUNyRyxDQUFDO2dCQUNGLGdEQUFnRDtnQkFDaEQsZ0RBQWdEO2dCQUNoRCxnREFBZ0Q7Z0JBQ2hELHFCQUFxQixFQUFFLENBQUM7WUFDekIsQ0FBQztRQUNGLENBQUM7UUFFRCxPQUFPO1lBQ04sS0FBSyxFQUFFO2dCQUNOLGVBQWUsRUFBRSxVQUFVO2dCQUMzQixXQUFXLEVBQUUsY0FBYyxHQUFHLENBQUM7Z0JBQy9CLGFBQWEsRUFBRSxVQUFVO2dCQUN6QixTQUFTLEVBQUUscUJBQXFCLEdBQUcsQ0FBQzthQUNwQztZQUNELEdBQUcsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLGNBQWMsRUFBRSxxQkFBcUIsR0FBRyxDQUFDLENBQUM7U0FDOUQsQ0FBQztJQUNILENBQUM7SUFFTSxNQUFNLENBQUMsWUFBWSxDQUFDLEtBQTBCLEVBQUUsZUFBNkIsZUFBZSxFQUFFO1FBQ3BHLE1BQU0sVUFBVSxHQUFHLGFBQWEsRUFBRSxDQUFDO1FBRW5DLE1BQU0sTUFBTSxHQUFZLEVBQUUsQ0FBQztRQUMzQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxTQUFTLEdBQUcsS0FBSyxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsSUFBSSxTQUFTLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN2RSxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7WUFFeEIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ1YsSUFBSSxjQUFjLEdBQUcsQ0FBQyxDQUFDO1lBQ3ZCLElBQUksZUFBZSxHQUFHLENBQUMsQ0FBQztZQUN4QixJQUFJLEtBQUssc0JBQWMsQ0FBQztZQUN4QixJQUFJLGFBQWEsR0FBRyxLQUFLLENBQUM7WUFDMUIsSUFBSSxvQkFBb0IsR0FBRyxLQUFLLENBQUM7WUFDakMsSUFBSSxnQkFBZ0IsR0FBRyxLQUFLLENBQUM7WUFDN0IsSUFBSSxtQkFBbUIsR0FBRyxLQUFLLENBQUM7WUFFaEMsT0FBTyxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUM7Z0JBRWhCLElBQUksaUJBQWlCLEdBQUcsS0FBSyxDQUFDO2dCQUM5QixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUVsQyxJQUFJLEtBQUssMEJBQWlCLEVBQUUsQ0FBQztvQkFDNUIsSUFBSSxPQUF1QixDQUFDO29CQUM1QixRQUFRLE1BQU0sRUFBRSxDQUFDO3dCQUNoQjs0QkFDQyxhQUFhLEdBQUcsSUFBSSxDQUFDOzRCQUNyQixPQUFPLDhCQUFzQixDQUFDOzRCQUM5QixNQUFNO3dCQUNQOzRCQUNDLE9BQU8sR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDLDZCQUFxQixDQUFDLHdDQUFnQyxDQUFDLENBQUM7NEJBQ2xGLE1BQU07d0JBQ1A7NEJBQ0MsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDOzRCQUN4QixvQkFBb0IsR0FBRyxJQUFJLENBQUM7NEJBQzVCLE9BQU8sOEJBQXNCLENBQUM7NEJBQzlCLE1BQU07d0JBQ1A7NEJBQ0MsZ0JBQWdCLEdBQUcsS0FBSyxDQUFDOzRCQUN6QixPQUFPLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLDZCQUFxQixDQUFDLHdDQUFnQyxDQUFDLENBQUM7NEJBQ3pGLE1BQU07d0JBQ1A7NEJBQ0MsbUJBQW1CLEdBQUcsSUFBSSxDQUFDOzRCQUMzQixPQUFPLDhCQUFzQixDQUFDOzRCQUM5QixNQUFNO3dCQUNQOzRCQUNDLE9BQU8sR0FBRyxDQUFDLG1CQUFtQixDQUFDLENBQUMsNkJBQXFCLENBQUMsd0NBQWdDLENBQUMsQ0FBQzs0QkFDeEYsTUFBTTt3QkFFUCw4RUFBOEU7d0JBQzlFLDREQUE0RDt3QkFDNUQsbUNBQTBCO3dCQUMxQixtQ0FBMEI7d0JBQzFCOzRCQUNDLElBQUksZUFBZSxLQUFLLE1BQU0sRUFBRSxDQUFDO2dDQUNoQyxPQUFPLDBDQUFrQyxDQUFDOzRCQUMzQyxDQUFDO2lDQUFNLElBQUksZUFBZSxrQ0FBeUIsSUFBSSxlQUFlLGtDQUF5QixJQUFJLGVBQWUsK0JBQXNCLEVBQUUsQ0FBQztnQ0FDMUksT0FBTyw4QkFBc0IsQ0FBQzs0QkFDL0IsQ0FBQztpQ0FBTSxDQUFDO2dDQUNQLE9BQU8sMENBQWtDLENBQUM7NEJBQzNDLENBQUM7NEJBQ0QsTUFBTTt3QkFDUDs0QkFDQyxtREFBbUQ7NEJBQ25ELE9BQU8sR0FBRyxDQUFDLGVBQWUsK0JBQXNCLENBQUMsQ0FBQyxDQUFDLHlDQUFpQyxDQUFDLDRCQUFvQixDQUFDOzRCQUMxRyxNQUFNO3dCQUNQOzRCQUNDLHFDQUFxQzs0QkFDckMsT0FBTyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyw2QkFBcUIsQ0FBQyx3Q0FBZ0MsQ0FBQyxDQUFDOzRCQUNyRixNQUFNO3dCQUNQOzRCQUNDLE9BQU8sR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUNuQyxDQUFDO29CQUVELHFDQUFxQztvQkFDckMsSUFBSSxPQUFPLDRDQUFvQyxFQUFFLENBQUM7d0JBQ2pELE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxjQUFjLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDOUUsaUJBQWlCLEdBQUcsSUFBSSxDQUFDO29CQUMxQixDQUFDO2dCQUNGLENBQUM7cUJBQU0sSUFBSSxLQUFLLHVCQUFjLEVBQUUsQ0FBQztvQkFFaEMsSUFBSSxPQUF1QixDQUFDO29CQUM1QixJQUFJLE1BQU0sd0NBQStCLEVBQUUsQ0FBQzt3QkFDM0MsK0VBQStFO3dCQUMvRSxvQkFBb0IsR0FBRyxJQUFJLENBQUM7d0JBQzVCLE9BQU8sOEJBQXNCLENBQUM7b0JBQy9CLENBQUM7eUJBQU0sQ0FBQzt3QkFDUCxPQUFPLEdBQUcsVUFBVSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFDbEMsQ0FBQztvQkFFRCxxQ0FBcUM7b0JBQ3JDLElBQUksT0FBTyw0Q0FBb0MsRUFBRSxDQUFDO3dCQUNqRCxpQkFBaUIsR0FBRyxJQUFJLENBQUM7b0JBQzFCLENBQUM7eUJBQU0sQ0FBQzt3QkFDUCxLQUFLLHdCQUFlLENBQUM7b0JBQ3RCLENBQUM7Z0JBQ0YsQ0FBQztxQkFBTSxDQUFDO29CQUNQLEtBQUssR0FBRyxZQUFZLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztvQkFDOUMsSUFBSSxLQUFLLDBCQUFrQixFQUFFLENBQUM7d0JBQzdCLGlCQUFpQixHQUFHLElBQUksQ0FBQztvQkFDMUIsQ0FBQztnQkFDRixDQUFDO2dCQUVELElBQUksaUJBQWlCLEVBQUUsQ0FBQztvQkFDdkIsS0FBSyxzQkFBYyxDQUFDO29CQUNwQixhQUFhLEdBQUcsS0FBSyxDQUFDO29CQUN0QixvQkFBb0IsR0FBRyxLQUFLLENBQUM7b0JBQzdCLG1CQUFtQixHQUFHLEtBQUssQ0FBQztvQkFFNUIsZ0NBQWdDO29CQUNoQyxjQUFjLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDdkIsZUFBZSxHQUFHLE1BQU0sQ0FBQztnQkFDMUIsQ0FBQztnQkFFRCxDQUFDLEVBQUUsQ0FBQztZQUNMLENBQUM7WUFFRCxJQUFJLEtBQUssMEJBQWlCLEVBQUUsQ0FBQztnQkFDNUIsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLFVBQVUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLGNBQWMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ2pGLENBQUM7UUFFRixDQUFDO1FBRUQsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0NBQ0Q7QUFFRDs7OztHQUlHO0FBQ0gsTUFBTSxVQUFVLFlBQVksQ0FBQyxLQUFpQztJQUM3RCxJQUFJLENBQUMsS0FBSyxJQUFJLE9BQU8sS0FBSyxDQUFDLFlBQVksS0FBSyxVQUFVLElBQUksT0FBTyxLQUFLLENBQUMsY0FBYyxLQUFLLFVBQVUsRUFBRSxDQUFDO1FBQ3RHLGtCQUFrQjtRQUNsQixPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFDRCxPQUFPLFlBQVksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDekMsQ0FBQyJ9