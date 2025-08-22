/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { LineRange } from '../../core/ranges/lineRange.js';
import { StandardTokenType } from '../../encodedTokenAttributes.js';
import { ILanguageIdCodec } from '../../languages.js';
import { IAttachedView } from '../../model.js';
import { TextModel } from '../textModel.js';
import { IModelContentChangedEvent, IModelTokensChangedEvent } from '../../textModelEvents.js';
import { BackgroundTokenizationState } from '../../tokenizationTextModelPart.js';
import { LineTokens } from '../../tokens/lineTokens.js';
import { derivedOpts, IObservable, ISettableObservable, observableSignal, observableValueOpts } from '../../../../base/common/observable.js';
import { equalsIfDefined, itemEquals, itemsEquals } from '../../../../base/common/equals.js';

/**
 * @internal
 */
export class AttachedViews {
	private readonly _onDidChangeVisibleRanges = new Emitter<{ view: IAttachedView; state: AttachedViewState | undefined }>();
	public readonly onDidChangeVisibleRanges = this._onDidChangeVisibleRanges.event;

	private readonly _views = new Set<AttachedViewImpl>();
	private readonly _viewsChanged = observableSignal(this);

	public readonly visibleLineRanges: IObservable<readonly LineRange[]>;

	constructor() {
		this.visibleLineRanges = derivedOpts({
			owner: this,
			equalsFn: itemsEquals(itemEquals())
		}, reader => {
			this._viewsChanged.read(reader);
			const ranges = LineRange.joinMany(
				[...this._views].map(view => view.state.read(reader)?.visibleLineRanges ?? [])
			);
			return ranges;
		});
	}

	public attachView(): IAttachedView {
		const view = new AttachedViewImpl((state) => {
			this._onDidChangeVisibleRanges.fire({ view, state });
		});
		this._views.add(view);
		this._viewsChanged.trigger(undefined);
		return view;
	}

	public detachView(view: IAttachedView): void {
		this._views.delete(view as AttachedViewImpl);
		this._onDidChangeVisibleRanges.fire({ view, state: undefined });
		this._viewsChanged.trigger(undefined);
	}
}

/**
 * @internal
 */
export class AttachedViewState {
	constructor(
		readonly visibleLineRanges: readonly LineRange[],
		readonly stabilized: boolean,
	) { }

	public equals(other: AttachedViewState): boolean {
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

class AttachedViewImpl implements IAttachedView {
	private readonly _state: ISettableObservable<AttachedViewState | undefined>;
	public get state(): IObservable<AttachedViewState | undefined> { return this._state; }

	constructor(
		private readonly handleStateChange: (state: AttachedViewState) => void
	) {
		this._state = observableValueOpts<AttachedViewState | undefined>({ owner: this, equalsFn: equalsIfDefined((a, b) => a.equals(b)) }, undefined);
	}

	setVisibleLines(visibleLines: { startLineNumber: number; endLineNumber: number }[], stabilized: boolean): void {
		const visibleLineRanges = visibleLines.map((line) => new LineRange(line.startLineNumber, line.endLineNumber + 1));
		const state = new AttachedViewState(visibleLineRanges, stabilized);
		this._state.set(state, undefined, undefined);
		this.handleStateChange(state);
	}
}


export class AttachedViewHandler extends Disposable {
	private readonly runner = this._register(new RunOnceScheduler(() => this.update(), 50));

	private _computedLineRanges: readonly LineRange[] = [];
	private _lineRanges: readonly LineRange[] = [];
	public get lineRanges(): readonly LineRange[] { return this._lineRanges; }

	constructor(private readonly _refreshTokens: () => void) {
		super();
	}

	private update(): void {
		if (equals(this._computedLineRanges, this._lineRanges, (a, b) => a.equals(b))) {
			return;
		}
		this._computedLineRanges = this._lineRanges;
		this._refreshTokens();
	}

	public handleStateChange(state: AttachedViewState): void {
		this._lineRanges = state.visibleLineRanges;
		if (state.stabilized) {
			this.runner.cancel();
			this.update();
		} else {
			this.runner.schedule();
		}
	}
}

export abstract class AbstractSyntaxTokenBackend extends Disposable {
	protected abstract _backgroundTokenizationState: BackgroundTokenizationState;
	public get backgroundTokenizationState(): BackgroundTokenizationState {
		return this._backgroundTokenizationState;
	}

	protected abstract readonly _onDidChangeBackgroundTokenizationState: Emitter<void>;
	/** @internal, should not be exposed by the text model! */
	public abstract readonly onDidChangeBackgroundTokenizationState: Event<void>;

	protected readonly _onDidChangeTokens = this._register(new Emitter<IModelTokensChangedEvent>());
	/** @internal, should not be exposed by the text model! */
	public readonly onDidChangeTokens: Event<IModelTokensChangedEvent> = this._onDidChangeTokens.event;

	constructor(
		protected readonly _languageIdCodec: ILanguageIdCodec,
		protected readonly _textModel: TextModel,
	) {
		super();
	}

	public abstract todo_resetTokenization(fireTokenChangeEvent?: boolean): void;

	public abstract handleDidChangeAttached(): void;

	public abstract handleDidChangeContent(e: IModelContentChangedEvent): void;

	public abstract forceTokenization(lineNumber: number): void;

	public abstract hasAccurateTokensForLine(lineNumber: number): boolean;

	public abstract isCheapToTokenize(lineNumber: number): boolean;

	public tokenizeIfCheap(lineNumber: number): void {
		if (this.isCheapToTokenize(lineNumber)) {
			this.forceTokenization(lineNumber);
		}
	}

	public abstract getLineTokens(lineNumber: number): LineTokens;

	public abstract getTokenTypeIfInsertingCharacter(lineNumber: number, column: number, character: string): StandardTokenType;

	public abstract tokenizeLinesAt(lineNumber: number, lines: string[]): LineTokens[] | null;

	public abstract get hasTokens(): boolean;
}
