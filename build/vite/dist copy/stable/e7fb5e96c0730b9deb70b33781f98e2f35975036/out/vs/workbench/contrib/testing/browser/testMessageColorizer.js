/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { GraphemeIterator, forAnsiStringParts, removeAnsiEscapeCodes } from '../../../../base/common/strings.js';
import './media/testMessageColorizer.css';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
const colorAttrRe = /^\x1b\[([0-9]+)m$/;
var Classes;
(function (Classes) {
    Classes["Prefix"] = "tstm-ansidec-";
    Classes["ForegroundPrefix"] = "tstm-ansidec-fg";
    Classes["BackgroundPrefix"] = "tstm-ansidec-bg";
    Classes["Bold"] = "tstm-ansidec-1";
    Classes["Faint"] = "tstm-ansidec-2";
    Classes["Italic"] = "tstm-ansidec-3";
    Classes["Underline"] = "tstm-ansidec-4";
})(Classes || (Classes = {}));
export const renderTestMessageAsText = (tm) => typeof tm === 'string' ? removeAnsiEscapeCodes(tm) : renderAsPlaintext(tm);
/**
 * Applies decorations based on ANSI styles from the test message in the editor.
 * ANSI sequences are stripped from the text displayed in editor, and this
 * re-applies their colorization.
 *
 * This uses decorations rather than language features because the string
 * rendered in the editor lacks the ANSI codes needed to actually apply the
 * colorization.
 *
 * Note: does not support TrueColor.
 */
export const colorizeTestMessageInEditor = (message, editor) => {
    const decos = [];
    editor.changeDecorations(changeAccessor => {
        let start = new Position(1, 1);
        let cls = [];
        for (const part of forAnsiStringParts(message)) {
            if (part.isCode) {
                const colorAttr = colorAttrRe.exec(part.str)?.[1];
                if (!colorAttr) {
                    continue;
                }
                const n = Number(colorAttr);
                if (n === 0) {
                    cls.length = 0;
                }
                else if (n === 22) {
                    cls = cls.filter(c => c !== "tstm-ansidec-1" /* Classes.Bold */ && c !== "tstm-ansidec-3" /* Classes.Italic */);
                }
                else if (n === 23) {
                    cls = cls.filter(c => c !== "tstm-ansidec-3" /* Classes.Italic */);
                }
                else if (n === 24) {
                    cls = cls.filter(c => c !== "tstm-ansidec-4" /* Classes.Underline */);
                }
                else if ((n >= 30 && n <= 39) || (n >= 90 && n <= 99)) {
                    cls = cls.filter(c => !c.startsWith("tstm-ansidec-fg" /* Classes.ForegroundPrefix */));
                    cls.push("tstm-ansidec-fg" /* Classes.ForegroundPrefix */ + colorAttr);
                }
                else if ((n >= 40 && n <= 49) || (n >= 100 && n <= 109)) {
                    cls = cls.filter(c => !c.startsWith("tstm-ansidec-bg" /* Classes.BackgroundPrefix */));
                    cls.push("tstm-ansidec-bg" /* Classes.BackgroundPrefix */ + colorAttr);
                }
                else {
                    cls.push("tstm-ansidec-" /* Classes.Prefix */ + colorAttr);
                }
            }
            else {
                let line = start.lineNumber;
                let col = start.column;
                const graphemes = new GraphemeIterator(part.str);
                for (let i = 0; !graphemes.eol(); i += graphemes.nextGraphemeLength()) {
                    if (part.str[i] === '\n') {
                        line++;
                        col = 1;
                    }
                    else {
                        col++;
                    }
                }
                const end = new Position(line, col);
                if (cls.length) {
                    decos.push(changeAccessor.addDecoration(Range.fromPositions(start, end), {
                        inlineClassName: cls.join(' '),
                        description: 'test-message-colorized',
                    }));
                }
                start = end;
            }
        }
    });
    return toDisposable(() => editor.removeDecorations(decos));
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdE1lc3NhZ2VDb2xvcml6ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXN0aW5nL2Jyb3dzZXIvdGVzdE1lc3NhZ2VDb2xvcml6ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFakYsT0FBTyxFQUFlLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxrQkFBa0IsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2pILE9BQU8sa0NBQWtDLENBQUM7QUFFMUMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVoRSxNQUFNLFdBQVcsR0FBRyxtQkFBbUIsQ0FBQztBQUV4QyxJQUFXLE9BUVY7QUFSRCxXQUFXLE9BQU87SUFDakIsbUNBQXdCLENBQUE7SUFDeEIsK0NBQXdDLENBQUE7SUFDeEMsK0NBQXdDLENBQUE7SUFDeEMsa0NBQTJCLENBQUE7SUFDM0IsbUNBQTRCLENBQUE7SUFDNUIsb0NBQTZCLENBQUE7SUFDN0IsdUNBQWdDLENBQUE7QUFDakMsQ0FBQyxFQVJVLE9BQU8sS0FBUCxPQUFPLFFBUWpCO0FBRUQsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQUcsQ0FBQyxFQUE0QixFQUFFLEVBQUUsQ0FDdkUsT0FBTyxFQUFFLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsRUFBRSxDQUFDLENBQUM7QUFHNUU7Ozs7Ozs7Ozs7R0FVRztBQUNILE1BQU0sQ0FBQyxN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