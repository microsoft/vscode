/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createScanner as createJSONScanner } from '../../../../base/common/json.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
export class SmartSnippetInserter {
    static hasOpenBrace(scanner) {
        while (scanner.scan() !== 17 /* JSONSyntaxKind.EOF */) {
            const kind = scanner.getToken();
            if (kind === 1 /* JSONSyntaxKind.OpenBraceToken */) {
                return true;
            }
        }
        return false;
    }
    static offsetToPosition(model, offset) {
        let offsetBeforeLine = 0;
        const eolLength = model.getEOL().length;
        const lineCount = model.getLineCount();
        for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
            const lineTotalLength = model.getLineLength(lineNumber) + eolLength;
            const offsetAfterLine = offsetBeforeLine + lineTotalLength;
            if (offsetAfterLine > offset) {
                return new Position(lineNumber, offset - offsetBeforeLine + 1);
            }
            offsetBeforeLine = offsetAfterLine;
        }
        return new Position(lineCount, model.getLineMaxColumn(lineCount));
    }
    static insertSnippet(model, _position) {
        const desiredPosition = model.getValueLengthInRange(new Range(1, 1, _position.lineNumber, _position.column));
        // <INVALID> [ <BEFORE_OBJECT> { <INVALID> } <AFTER_OBJECT>, <BEFORE_OBJECT> { <INVALID> } <AFTER_OBJECT> ] <INVALID>
        let State;
        (function (State) {
            State[State["INVALID"] = 0] = "INVALID";
            State[State["AFTER_OBJECT"] = 1] = "AFTER_OBJECT";
            State[State["BEFORE_OBJECT"] = 2] = "BEFORE_OBJECT";
        })(State || (State = {}));
        let currentState = State.INVALID;
        let lastValidPos = -1;
        let lastValidState = State.INVALID;
        const scanner = createJSONScanner(model.getValue());
        let arrayLevel = 0;
        let objLevel = 0;
        const checkRangeStatus = (pos, state) => {
            if (state !== State.INVALID && arrayLevel === 1 && objLevel === 0) {
                currentState = state;
                lastValidPos = pos;
                lastValidState = state;
            }
            else {
                if (currentState !== State.INVALID) {
                    currentState = State.INVALID;
                    lastValidPos = scanner.getTokenOffset();
                }
            }
        };
        while (scanner.scan() !== 17 /* JSONSyntaxKind.EOF */) {
            const currentPos = scanner.getPosition();
            const kind = scanner.getToken();
            let goodKind = false;
            switch (kind) {
                case 3 /* JSONSyntaxKind.OpenBracketToken */:
                    goodKind = true;
                    arrayLevel++;
                    checkRangeStatus(currentPos, State.BEFORE_OBJECT);
                    break;
                case 4 /* JSONSyntaxKind.CloseBracketToken */:
                    goodKind = true;
                    arrayLevel--;
                    checkRangeStatus(currentPos, State.INVALID);
                    break;
                case 5 /* JSONSyntaxKind.CommaToken */:
                    goodKind = true;
                    checkRangeStatus(currentPos, State.BEFORE_OBJECT);
                    break;
                case 1 /* JSONSyntaxKind.OpenBraceToken */:
                    goodKind = true;
                    objLevel++;
                    checkRangeStatus(currentPos, State.INVALID);
                    break;
                case 2 /* JSONSyntaxKind.CloseBraceToken */:
                    goodKind = true;
                    objLevel--;
                    checkRangeStatus(currentPos, State.AFTER_OBJECT);
                    break;
                case 15 /* JSONSyntaxKind.Trivia */:
                case 14 /* JSONSyntaxKind.LineBreakTrivia */:
                    goodKind = true;
            }
            if (currentPos >= desiredPosition && (currentState !== State.INVALID || lastValidPos !== -1)) {
                let acceptPosition;
                let acceptState;
                if (currentState !== State.INVALID) {
                    acceptPosition = (goodKind ? currentPos : scanner.getTokenOffset());
                    acceptState = currentState;
                }
                else {
                    acceptPosition = lastValidPos;
                    acceptState = lastValidState;
                }
                if (acceptState === State.AFTER_OBJECT) {
                    return {
                        position: this.offsetToPosition(model, acceptPosition),
                        prepend: ',',
                        append: ''
                    };
                }
                else {
                    scanner.setPosition(acceptPosition);
                    return {
                        position: this.offsetToPosition(model, acceptPosition),
                        prepend: '',
                        append: this.hasOpenBrace(scanner) ? ',' : ''
                    };
                }
            }
        }
        // no valid position found!
        const modelLineCount = model.getLineCount();
        return {
            position: new Position(modelLineCount, model.getLineMaxColumn(modelLineCount)),
            prepend: '\n[',
            append: ']'
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic21hcnRTbmlwcGV0SW5zZXJ0ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9wcmVmZXJlbmNlcy9jb21tb24vc21hcnRTbmlwcGV0SW5zZXJ0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFlLGFBQWEsSUFBSSxpQkFBaUIsRUFBZ0MsTUFBTSxpQ0FBaUMsQ0FBQztBQUNoSSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBU2hFLE1BQU0sT0FBTyxvQkFBb0I7SUFFeEIsTUFBTSxDQUFDLFlBQVksQ0FBQyxPQUFvQjtRQUUvQyxPQUFPLE9BQU8sQ0FBQyxJQUFJLEVBQUUsZ0NBQXVCLEVBQUUsQ0FBQztZQUM5QyxNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUM7WUFFaEMsSUFBSSxJQUFJLDBDQUFrQyxFQUFFLENBQUM7Z0JBQzVDLE9BQU8sSUFBSSxDQUFDO1lBQ2IsQ0FBQztRQUNGLENBQUM7UUFFRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFTyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsS0FBaUIsRUFBRSxNQUFjO1FBQ2hFLElBQUksZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDO1FBQ3pCLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxNQUFNLENBQUM7UUFDeEMsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ3ZDLEtBQUssSUFBSSxVQUFVLEdBQUcsQ0FBQyxFQUFFLFVBQVUsSUFBSSxTQUFTLEVBQUUsVUFBVSxFQUFFLEVBQUUsQ0FBQztZQUNoRSxNQUFNLGVBQWUsR0FBRyxLQUFLLENBQUMsYUFB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