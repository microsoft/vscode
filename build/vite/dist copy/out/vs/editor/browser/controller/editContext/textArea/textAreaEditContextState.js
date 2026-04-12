/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { commonPrefixLength, commonSuffixLength } from '../../../../../base/common/strings.js';
export const _debugComposition = false;
export class TextAreaState {
    static { this.EMPTY = new TextAreaState('', 0, 0, null, undefined); }
    constructor(value, 
    /** the offset where selection starts inside `value` */
    selectionStart, 
    /** the offset where selection ends inside `value` */
    selectionEnd, 
    /** the editor range in the view coordinate system that matches the selection inside `value` */
    selection, 
    /** the visible line count (wrapped, not necessarily matching \n characters) for the text in `value` before `selectionStart` */
    newlineCountBeforeSelection) {
        this.value = value;
        this.selectionStart = selectionStart;
        this.selectionEnd = selectionEnd;
        this.selection = selection;
        this.newlineCountBeforeSelection = newlineCountBeforeSelection;
    }
    toString() {
        return `[ <${this.value}>, selectionStart: ${this.selectionStart}, selectionEnd: ${this.selectionEnd}]`;
    }
    static readFromTextArea(textArea, previousState) {
        const value = textArea.getValue();
        const selectionStart = textArea.getSelectionStart();
        const selectionEnd = textArea.getSelectionEnd();
        let newlineCountBeforeSelection = undefined;
        if (previousState) {
            const valueBeforeSelectionStart = value.substring(0, selectionStart);
            const previousValueBeforeSelectionStart = previousState.value.substring(0, previousState.selectionStart);
            if (valueBeforeSelectionStart === previousValueBeforeSelectionStart) {
                newlineCountBeforeSelection = previousState.newlineCountBeforeSelection;
            }
        }
        return new TextAreaState(value, selectionStart, selectionEnd, null, newlineCountBeforeSelection);
    }
    collapseSelection() {
        if (this.selectionStart === this.value.length) {
            return this;
        }
        return new TextAreaState(this.value, this.value.length, this.value.length, null, undefined);
    }
    isWrittenToTextArea(textArea, select) {
        const valuesEqual = this.value === textArea.getValue();
        if (!select) {
            return valuesEqual;
        }
        const selectionsEqual = this.selectionStart === textArea.getSelectionStart() && this.selectionEnd === textArea.getSelectionEnd();
        return selectionsEqual && valuesEqual;
    }
    writeToTextArea(reason, textArea, select) {
        if (_debugComposition) {
            console.log(`writeToTextArea ${reason}: ${this.toString()}`);
        }
        textArea.setValue(reason, this.value);
        if (select) {
            textArea.setSelectionRange(reason, this.selectionStart, this.selectionEnd);
        }
    }
    deduceEditorPosition(offset) {
        if (offset <= this.selectionStart) {
            const str = this.value.substring(offset, this.selectionStart);
            return this._finishDeduceEditorPosition(this.selection?.getStartPosition() ?? null, str, -1);
        }
        if (offset >= this.selectionEnd) {
            const str = this.value.substring(this.selectionEnd, offset);
            return this._finishDeduceEditorPosition(this.selection?.getEndPosition() ?? null, str, 1);
        }
        const str1 = this.value.substring(this.selectionStart, offset);
        if (str1.indexOf(String.fromCharCode(8230)) === -1) {
            return this._finishDeduceEditorPosition(this.selection?.getStartPosition() ?? null, str1, 1);
        }
        const str2 = this.value.substring(offset, this.selectionEnd);
        return this._finishDeduceEditorPosition(this.selection?.getEndPosition() ?? null, str2, -1);
    }
    _finishDeduceEditorPosition(anchor, deltaText, signum) {
        let lineFeedCnt = 0;
        let lastLineFeedIndex = -1;
        while ((lastLineFeedIndex = deltaText.indexOf('\n', lastLineFeedIndex + 1)) !== -1) {
            lineFeedCnt++;
        }
        return [anchor, signum * deltaText.length, lineFeedCnt];
    }
    static deduceInput(previousState, currentState, couldBeEmojiInput) {
        if (!previousState) {
            // This is the EMPTY state
            return {
                text: '',
                replacePrevCharCnt: 0,
                replaceNextCharCnt: 0,
                positionDelta: 0
            };
        }
        if (_debugComposition) {
            console.log('------------------------deduceInput');
            console.log(`PREVIOUS STATE: ${previousState.toString()}`);
            console.log(`CURRENT STATE: ${currentState.toString()}`);
        }
        const prefixLength = Math.min(commonPrefixLength(previousState.value, currentState.value), previousState.selectionStart, currentState.selectionStart);
        const suffixLength = Math.min(commonSuffixLength(previousState.value, currentState.value), previousState.value.length - previousState.selectionEnd, currentState.value.length - currentState.selectionEnd);
        const previousValue = previousState.value.substring(prefixLength, previousState.value.length - suffixLength);
        const currentValue = currentState.value.substring(prefixLength, currentState.value.length - suffixLength);
        const previousSelectionStart = previousState.selectionStart - prefixLength;
        const previousSelectionEnd = previousState.selectionEnd - prefixLength;
        const currentSelectionStart = currentState.selectionStart - prefixLength;
        const currentSelectionEnd = currentState.selectionEnd - prefixLength;
        if (_debugComposition) {
            console.log(`AFTER DIFFING PREVIOUS STATE: <${previousValue}>, selectionStart: ${previousSelectionStart}, selectionEnd: ${previousSelectionEnd}`);
            console.log(`AFTER DIFFING CURRENT STATE: <${currentValue}>, selectionStart: ${currentSelectionStart}, selectionEnd: ${currentSelectionEnd}`);
        }
        if (currentSelectionStart === currentSelectionEnd) {
            // no current selection
            const replacePreviousCharacters = (previousState.selectionStart - prefixLength);
            if (_debugComposition) {
                console.log(`REMOVE PREVIOUS: ${replacePreviousCharacters} chars`);
            }
            return {
                text: currentValue,
                replacePrevCharCnt: replacePreviousCharacters,
                replaceNextCharCnt: 0,
                positionDelta: 0
            };
        }
        // there is a current selection => composition case
        const replacePreviousCharacters = previousSelectionEnd - previousSelectionStart;
        return {
            text: currentValue,
            replacePrevCharCnt: replacePreviousCharacters,
            replaceNextCharCnt: 0,
            positionDelta: 0
        };
    }
    static deduceAndroidCompositionInput(previousState, currentState) {
        if (!previousState) {
            // This is the EMPTY state
            return {
                text: '',
                replacePrevCharCnt: 0,
                replaceNextCharCnt: 0,
                positionDelta: 0
            };
        }
        if (_debugComposition) {
            console.log('------------------------deduceAndroidCompositionInput');
            console.log(`PREVIOUS STATE: ${previousState.toString()}`);
            console.log(`CURRENT STATE: ${currentState.toString()}`);
        }
        if (previousState.value === currentState.value) {
            return {
                text: '',
                replacePrevCharCnt: 0,
                replaceNextCharCnt: 0,
                positionDelta: currentState.selectionEnd - previousState.selectionEnd
            };
        }
        const prefixLength = Math.min(commonPrefixLength(previousState.value, currentState.value), previousState.selectionEnd);
        const suffixLength = Math.min(commonSuffixLength(previousState.value, currentState.value), previousState.value.length - previousState.selectionEnd);
        const previousValue = previousState.value.substring(prefixLength, previousState.value.length - suffixLength);
        const currentValue = currentState.value.substring(prefixLength, currentState.value.length - suffixLength);
        const previousSelectionStart = previousState.selectionStart - prefixLength;
        const previousSelectionEnd = previousState.selectionEnd - prefixLength;
        const currentSelectionStart = currentState.selectionStart - prefixLength;
        const currentSelectionEnd = currentState.selectionEnd - prefixLength;
        if (_debugComposition) {
            console.log(`AFTER DIFFING PREVIOUS STATE: <${previousValue}>, selectionStart: ${previousSelectionStart}, selectionEnd: ${previousSelectionEnd}`);
            console.log(`AFTER DIFFING CURRENT STATE: <${currentValue}>, selectionStart: ${currentSelectionStart}, selectionEnd: ${currentSelectionEnd}`);
        }
        return {
            text: currentValue,
            replacePrevCharCnt: previousSelectionEnd,
            replaceNextCharCnt: previousValue.length - previousSelectionEnd,
            positionDelta: currentSelectionEnd - currentValue.length
        };
    }
    static fromScreenReaderContentState(screenReaderContentState) {
        let selectionStart;
        let selectionEnd;
        const direction = screenReaderContentState.selection.getDirection();
        switch (direction) {
            case 0 /* SelectionDirection.LTR */:
                selectionStart = screenReaderContentState.selectionStart;
                selectionEnd = screenReaderContentState.selectionEnd;
                break;
            case 1 /* SelectionDirection.RTL */:
                selectionStart = screenReaderContentState.selectionEnd;
                selectionEnd = screenReaderContentState.selectionStart;
                break;
        }
        return new TextAreaState(screenReaderContentState.value, selectionStart, selectionEnd, screenReaderContentState.selection, screenReaderContentState.newlineCountBeforeSelection);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dEFyZWFFZGl0Q29udGV4dFN0YXRlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvY29udHJvbGxlci9lZGl0Q29udGV4dC90ZXh0QXJlYS90ZXh0QXJlYUVkaXRDb250ZXh0U3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGtCQUFrQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFNL0YsTUFBTSxDQUFDLE1BQU0saUJBQWlCLEdBQUcsS0FBSyxDQUFDO0FBa0J2QyxNQUFNLE9BQU8sYUFBYTthQUVGLFVBQUssR0FBRyxJQUFJLGFBQWEsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFFNUUsWUFDaUIsS0FBYTtJQUM3Qix1REFBdUQ7SUFDdkMsY0FBc0I7SUFDdEMscURBQXFEO0lBQ3JDLFlBQW9CO0lBQ3BDLCtGQUErRjtJQUMvRSxTQUF1QjtJQUN2QywrSEFBK0g7SUFDL0csMkJBQStDO1FBUi9DLFVBQUssR0FBTCxLQUFLLENBQVE7UUFFYixtQkFBYyxHQUFkLGNBQWMsQ0FBUTtRQUV0QixpQkFBWSxHQUFaLFlBQVksQ0FBUTtRQUVwQixjQUFTLEdBQVQsU0FBUyxDQUFjO1FBRXZCLGdDQUEyQixHQUEzQiwyQkFBMkIsQ0FBb0I7SUFDNUQsQ0FBQztJQUVFLFFBQVE7UUFDZCxPQUFPLE1BQU0sSUFBSSxDQUFDLEtBQUssc0JBQXNCLElBQUksQ0FBQyxjQUFjLG1CQUFtQixJQUFJLENBQUMsWUFBWSxHQUFHLENBQUM7SUFDekcsQ0FBQztJQUVNLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxRQUEwQixFQUFFLGFBQW1DO1FBQzdGLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FB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