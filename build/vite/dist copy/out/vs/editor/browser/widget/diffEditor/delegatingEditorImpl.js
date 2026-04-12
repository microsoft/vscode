/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
export class DelegatingEditor extends Disposable {
    constructor() {
        super(...arguments);
        this._id = ++DelegatingEditor.idCounter;
        this._onDidDispose = this._register(new Emitter());
        this.onDidDispose = this._onDidDispose.event;
        // #endregion
    }
    static { this.idCounter = 0; }
    getId() { return this.getEditorType() + ':v2:' + this._id; }
    // #region editorBrowser.IDiffEditor: Delegating to modified Editor
    getVisibleColumnFromPosition(position) {
        return this._targetEditor.getVisibleColumnFromPosition(position);
    }
    getStatusbarColumn(position) {
        return this._targetEditor.getStatusbarColumn(position);
    }
    getPosition() {
        return this._targetEditor.getPosition();
    }
    setPosition(position, source = 'api') {
        this._targetEditor.setPosition(position, source);
    }
    revealLine(lineNumber, scrollType = 0 /* ScrollType.Smooth */) {
        this._targetEditor.revealLine(lineNumber, scrollType);
    }
    revealLineInCenter(lineNumber, scrollType = 0 /* ScrollType.Smooth */) {
        this._targetEditor.revealLineInCenter(lineNumber, scrollType);
    }
    revealLineInCenterIfOutsideViewport(lineNumber, scrollType = 0 /* ScrollType.Smooth */) {
        this._targetEditor.revealLineInCenterIfOutsideViewport(lineNumber, scrollType);
    }
    revealLineNearTop(lineNumber, scrollType = 0 /* ScrollType.Smooth */) {
        this._targetEditor.revealLineNearTop(lineNumber, scrollType);
    }
    revealPosition(position, scrollType = 0 /* ScrollType.Smooth */) {
        this._targetEditor.revealPosition(position, scrollType);
    }
    revealPositionInCenter(position, scrollType = 0 /* ScrollType.Smooth */) {
        this._targetEditor.revealPositionInCenter(position, scrollType);
    }
    revealPositionInCenterIfOutsideViewport(position, scrollType = 0 /* ScrollType.Smooth */) {
        this._targetEditor.revealPositionInCenterIfOutsideViewport(position, scrollType);
    }
    revealPositionNearTop(position, scrollType = 0 /* ScrollType.Smooth */) {
        this._targetEditor.revealPositionNearTop(position, scrollType);
    }
    getSelection() {
        return this._targetEditor.getSelection();
    }
    getSelections() {
        return this._targetEditor.getSelections();
    }
    setSelection(something, source = 'api') {
        this._targetEditor.setSelection(something, source);
    }
    setSelections(ranges, source = 'api') {
        this._targetEditor.setSelections(ranges, source);
    }
    revealLines(startLineNumber, endLineNumber, scrollType = 0 /* ScrollType.Smooth */) {
        this._targetEditor.revealLines(startLineNumber, endLineNumber, scrollType);
    }
    revealLinesInCenter(startLineNumber, endLineNumber, scrollType = 0 /* ScrollType.Smooth */) {
        this._targetEditor.revealLinesInCenter(startLineNumber, endLineNumber, scrollType);
    }
    revealLinesInCenterIfOutsideViewport(startLineNumber, endLineNumber, scrollType = 0 /* ScrollType.Smooth */) {
        this._targetEditor.revealLinesInCenterIfOutsideViewport(startLineNumber, endLineNumber, scrollType);
    }
    revealLinesNearTop(startLineNumber, endLineNumber, scrollType = 0 /* ScrollType.Smooth */) {
        this._targetEditor.revealLinesNearTop(startLineNumber, endLineNumber, scrollType);
    }
    revealRange(range, scrollType = 0 /* ScrollType.Smooth */, revealVerticalInCenter = false, revealHorizontal = true) {
        this._targetEditor.revealRange(range, scrollType, revealVerticalInCenter, revealHorizontal);
    }
    revealRangeInCenter(range, scrollType = 0 /* ScrollType.Smooth */) {
        this._targetEditor.revealRangeInCenter(range, scrollType);
    }
    revealRangeInCenterIfOutsideViewport(range, scrollType = 0 /* ScrollType.Smooth */) {
        this._targetEditor.revealRangeInCenterIfOutsideViewport(range, scrollType);
    }
    revealRangeNearTop(range, scrollType = 0 /* ScrollType.Smooth */) {
        this._targetEditor.revealRangeNearTop(range, scrollType);
    }
    revealRangeNearTopIfOutsideViewport(range, scrollType = 0 /* ScrollType.Smooth */) {
        this._targetEditor.revealRangeNearTopIfOutsideViewport(range, scrollType);
    }
    revealRangeAtTop(range, scrollType = 0 /* ScrollType.Smooth */) {
        this._targetEditor.revealRangeAtTop(range, scrollType);
    }
    getSupportedActions() {
        return this._targetEditor.getSupportedActions();
    }
    focus() {
        this._targetEditor.focus();
    }
    trigger(source, handlerId, payload) {
        this._targetEditor.trigger(source, handlerId, payload);
    }
    createDecorationsCollection(decorations) {
        return this._targetEditor.createDecorationsCollection(decorations);
    }
    changeDecorations(callback) {
        return this._targetEditor.changeDecorations(callback);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVsZWdhdGluZ0VkaXRvckltcGwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9kZWxlZ2F0aW5nRWRpdG9ySW1wbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBVWxFLE1BQU0sT0FBZ0IsZ0JBQWlCLFNBQVEsVUFBVTtJQUF6RDs7UUFFa0IsUUFBRyxHQUFHLEVBQUUsZ0JBQWdCLENBQUMsU0FBUyxDQUFDO1FBRW5DLGtCQUFhLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBUSxDQUFDLENBQUM7UUFDckQsaUJBQVksR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQztRQW1KeEQsYUFBYTtJQUNkLENBQUM7YUF4SmUsY0FBUyxHQUFHLENBQUMsQUFBSixDQUFLO0lBUTdCLEtBQUssS0FBYSxPQUFPLElBQUksQ0FBQyxhQUFhLEVBQUUsR0FBRyxNQUFNLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFhcEUsbUVBQW1FO0lBRTVELDRCQUE0QixDQUFDLFFBQW1CO1FBQ3RELE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyw0QkFBNEIsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNsRSxDQUFDO0lBRU0sa0JBQWtCLENBQUMsUUFBbUI7UUFDNUMsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3hELENBQUM7SUFFTSxXQUFXO1FBQ2pCLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUN6QyxDQUFDO0lBRU0s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