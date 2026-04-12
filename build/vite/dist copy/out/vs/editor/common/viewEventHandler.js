/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../base/common/lifecycle.js';
export class ViewEventHandler extends Disposable {
    constructor() {
        super();
        this._shouldRender = true;
    }
    shouldRender() {
        return this._shouldRender;
    }
    forceShouldRender() {
        this._shouldRender = true;
    }
    setShouldRender() {
        this._shouldRender = true;
    }
    onDidRender() {
        this._shouldRender = false;
    }
    // --- begin event handlers
    onCompositionStart(e) {
        return false;
    }
    onCompositionEnd(e) {
        return false;
    }
    onConfigurationChanged(e) {
        return false;
    }
    onCursorStateChanged(e) {
        return false;
    }
    onDecorationsChanged(e) {
        return false;
    }
    onFlushed(e) {
        return false;
    }
    onFocusChanged(e) {
        return false;
    }
    onLanguageConfigurationChanged(e) {
        return false;
    }
    onLineMappingChanged(e) {
        return false;
    }
    onLinesChanged(e) {
        return false;
    }
    onLinesDeleted(e) {
        return false;
    }
    onLinesInserted(e) {
        return false;
    }
    onRevealRangeRequest(e) {
        return false;
    }
    onScrollChanged(e) {
        return false;
    }
    onThemeChanged(e) {
        return false;
    }
    onTokensChanged(e) {
        return false;
    }
    onTokensColorsChanged(e) {
        return false;
    }
    onZonesChanged(e) {
        return false;
    }
    // --- end event handlers
    handleEvents(events) {
        let shouldRender = false;
        for (let i = 0, len = events.length; i < len; i++) {
            const e = events[i];
            switch (e.type) {
                case 0 /* viewEvents.ViewEventType.ViewCompositionStart */:
                    if (this.onCompositionStart(e)) {
                        shouldRender = true;
                    }
                    break;
                case 1 /* viewEvents.ViewEventType.ViewCompositionEnd */:
                    if (this.onCompositionEnd(e)) {
                        shouldRender = true;
                    }
                    break;
                case 2 /* viewEvents.ViewEventType.ViewConfigurationChanged */:
                    if (this.onConfigurationChanged(e)) {
                        shouldRender = true;
                    }
                    break;
                case 3 /* viewEvents.ViewEventType.ViewCursorStateChanged */:
                    if (this.onCursorStateChanged(e)) {
                        shouldRender = true;
                    }
                    break;
                case 4 /* viewEvents.ViewEventType.ViewDecorationsChanged */:
                    if (this.onDecorationsChanged(e)) {
                        shouldRender = true;
                    }
                    break;
                case 5 /* viewEvents.ViewEventType.ViewFlushed */:
                    if (this.onFlushed(e)) {
                        shouldRender = true;
                    }
                    break;
                case 6 /* viewEvents.ViewEventType.ViewFocusChanged */:
                    if (this.onFocusChanged(e)) {
                        shouldRender = true;
                    }
                    break;
                case 7 /* viewEvents.ViewEventType.ViewLanguageConfigurationChanged */:
                    if (this.onLanguageConfigurationChanged(e)) {
                        shouldRender = true;
                    }
                    break;
                case 8 /* viewEvents.ViewEventType.ViewLineMappingChanged */:
                    if (this.onLineMappingChanged(e)) {
                        shouldRender = true;
                    }
                    break;
                case 9 /* viewEvents.ViewEventType.ViewLinesChanged */:
                    if (this.onLinesChanged(e)) {
                        shouldRender = true;
                    }
                    break;
                case 10 /* viewEvents.ViewEventType.ViewLinesDeleted */:
                    if (this.onLinesDeleted(e)) {
                        shouldRender = true;
                    }
                    break;
                case 11 /* viewEvents.ViewEventType.ViewLinesInserted */:
                    if (this.onLinesInserted(e)) {
                        shouldRender = true;
                    }
                    break;
                case 12 /* viewEvents.ViewEventType.ViewRevealRangeRequest */:
                    if (this.onRevealRangeRequest(e)) {
                        shouldRender = true;
                    }
                    break;
                case 13 /* viewEvents.ViewEventType.ViewScrollChanged */:
                    if (this.onScrollChanged(e)) {
                        shouldRender = true;
                    }
                    break;
                case 15 /* viewEvents.ViewEventType.ViewTokensChanged */:
                    if (this.onTokensChanged(e)) {
                        shouldRender = true;
                    }
                    break;
                case 14 /* viewEvents.ViewEventType.ViewThemeChanged */:
                    if (this.onThemeChanged(e)) {
                        shouldRender = true;
                    }
                    break;
                case 16 /* viewEvents.ViewEventType.ViewTokensColorsChanged */:
                    if (this.onTokensColorsChanged(e)) {
                        shouldRender = true;
                    }
                    break;
                case 17 /* viewEvents.ViewEventType.ViewZonesChanged */:
                    if (this.onZonesChanged(e)) {
                        shouldRender = true;
                    }
                    break;
                default:
                    console.info('View received unknown event: ');
                    console.info(e);
            }
        }
        if (shouldRender) {
            this._shouldRender = true;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld0V2ZW50SGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vdmlld0V2ZW50SGFuZGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFHNUQsTUFBTSxPQUFPLGdCQUFpQixTQUFRLFVBQVU7SUFJL0M7UUFDQyxLQUFLLEVBQUUsQ0FBQztRQUNSLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDO0lBQzNCLENBQUM7SUFFTSxZQUFZO1FBQ2xCLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQztJQUMzQixDQUFDO0lBRU0saUJBQWlCO1FBQ3ZCLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDO0lBQzNCLENBQUM7SUFFUyxlQUFlO1FBQ3hCLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDO0lBQzNCLENBQUM7SUFFTSxXQUFXO1FBQ2pCLElBQUksQ0FBQyxhQUFhLEdBQUcsS0FBSyxDQUFDO0lBQzVCLENBQUM7SUFFRCwyQkFBMkI7SUFFcEIsa0JBQWtCLENBQUMsQ0FBdUM7UUFDaEUsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ00sZ0JBQWdCLENBQUMsQ0FBcUM7UUFDNUQsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ00sc0JBQXNCLENBQUMsQ0FBMkM7UUFDeEUsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ00sb0JBQW9CLENBQUMsQ0FBeUM7UUFDcEUsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ00sb0JBQW9CLENBQUMsQ0FBeUM7UUFDcEUsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ00sU0FBUyxDQUFDLENBQThCO1FBQzlDLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUNNLGNB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