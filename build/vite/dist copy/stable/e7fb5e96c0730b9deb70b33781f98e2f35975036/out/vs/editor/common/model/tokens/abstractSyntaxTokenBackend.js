/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { equals } from '../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { LineRange } from '../../core/ranges/lineRange.js';
import { derivedOpts, observableSignal, observableValueOpts } from '../../../../base/common/observable.js';
import { equalsIfDefinedC, thisEqualsC, arrayEqualsC } from '../../../../base/common/equals.js';
/**
 * @internal
 */
export class AttachedViews {
    constructor() {
        this._onDidChangeVisibleRanges = new Emitter();
        this.onDidChangeVisibleRanges = this._onDidChangeVisibleRanges.event;
        this._views = new Set();
        this._viewsChanged = observableSignal(this);
        this.visibleLineRanges = derivedOpts({
            owner: this,
            equalsFn: arrayEqualsC(thisEqualsC())
        }, reader => {
            this._viewsChanged.read(reader);
            const ranges = LineRange.joinMany([...this._views].map(view => view.state.read(reader)?.visibleLineRanges ?? []));
            return ranges;
        });
    }
    attachView() {
        const view = new AttachedViewImpl((state) => {
            this._onDidChangeVisibleRanges.fire({ view, state });
        });
        this._views.add(view);
        this._viewsChanged.trigger(undefined);
        return view;
    }
    detachView(view) {
        this._views.delete(view);
        this._onDidChangeVisibleRanges.fire({ view, state: undefined });
        this._viewsChanged.trigger(undefined);
    }
    dispose() {
        this._onDidChangeVisibleRanges.dispose();
    }
}
/**
 * @internal
 */
export class AttachedViewState {
    constructor(visibleLineRanges, stabilized) {
        this.visibleLineRanges = visibleLineRanges;
        this.stabilized = stabilized;
    }
    equals(other) {
        if (this === other) {
            return true;
        }
        if (!equals(this.visibleLineRanges, other.visibleLineRanges, (a, b) => a.equals(b))) {
            return false;
        }
        if (this.stabilized !== other.stabilized) {
            return false;
        }
        return true;
    }
}
class AttachedViewImpl {
    get state() { return this._state; }
    constructor(handleStateChange) {
        this.handleStateChange = handleStateChange;
        this._state = observableValueOpts({ owner: this, equalsFn: equalsIfDefinedC((a, b) => a.equals(b)) }, undefined);
    }
    setVisibleLines(visibleLines, stabilized) {
        const visibleLineRanges = visibleLines.map((line) => new LineRange(line.startLineNumber, line.endLineNumber + 1));
        const state = new AttachedViewState(visibleLineRanges, stabilized);
        this._state.set(state, undefined, undefined);
        this.handleStateChange(state);
    }
}
export class AttachedViewHandler extends Disposable {
    get lineRanges() { return this._lineRanges; }
    constructor(_refreshTokens) {
        super();
        this._refreshTokens = _refreshTokens;
        this.runner = this._register(new RunOnceScheduler(() => this.update(), 50));
        this._computedLineRanges = [];
        this._lineRanges = [];
    }
    update() {
        if (equals(this._computedLineRanges, this._lineRanges, (a, b) => a.equals(b))) {
            return;
        }
        this._computedLineRanges = this._lineRanges;
        this._refreshTokens();
    }
    handleStateChange(state) {
        this._lineRanges = state.visibleLineRanges;
        if (state.stabilized) {
            this.runner.cancel();
            this.update();
        }
        else {
            this.runner.schedule();
        }
    }
}
export class AbstractSyntaxTokenBackend extends Disposable {
    get backgroundTokenizationState() {
        return this._backgroundTokenizationState;
    }
    constructor(_languageIdCodec, _textModel) {
        super();
        this._languageIdCodec = _languageIdCodec;
        this._textModel = _textModel;
        this._onDidChangeTokens = this._register(new Emitter());
        /** @internal, should not be exposed by the text model! */
        this.onDidChangeTokens = this._onDidChangeTokens.event;
        this._onDidChangeFontTokens = this._register(new Emitter());
        /** @internal, should not be exposed by the text model! */
        this.onDidChangeFontTokens = this._onDidChangeFontTokens.event;
    }
    tokenizeIfCheap(lineNumber) {
        if (this.isCheapToTokenize(lineNumber)) {
            this.forceTokenization(lineNumber);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWJzdHJhY3RTeW50YXhUb2tlbkJhY2tlbmQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL21vZGVsL3Rva2Vucy9hYnN0cmFjdFN5bnRheFRva2VuQmFja2VuZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDM0QsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDcEUsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFRM0QsT0FBTyxFQUFFLFdBQVcsRUFBb0MsZ0JBQWdCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3SSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsV0FBVyxFQUFFLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRWhHOztHQUVHO0FBQ0gsTUFBTSxPQUFPLGFBQWE7SUFTekI7UUFSaUIsOEJBQXlCLEdBQUcsSUFBSSxPQUFPLEVBQWlFLENBQUM7UUFDMUcsNkJBQXdCLEdBQUcsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEtBQUssQ0FBQztRQUUvRCxXQUFNLEdBQUcsSUFBSSxHQUFHLEVBQW9CLENBQUM7UUFDckMsa0JBQWEsR0FBRyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUt2RCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsV0FBVyxDQUFDO1lBQ3BDLEtBQUssRUFBRSxJQUFJO1lBQ1gsUUFBUSxFQUFFLFlBQVksQ0FBQyxXQUFXLEVBQUUsQ0FBQztTQUNyQyxFQUFFLE1BQU0sQ0FBQyxFQUFF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