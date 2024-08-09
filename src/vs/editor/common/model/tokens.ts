/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from 'vs/base/common/arrays';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { IPosition } from 'vs/editor/common/core/position';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { ILanguageIdCodec } from 'vs/editor/common/languages';
import { IAttachedView } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';
import { IModelContentChangedEvent, IModelTokensChangedEvent } from 'vs/editor/common/textModelEvents';
import { BackgroundTokenizationState } from 'vs/editor/common/tokenizationTextModelPart';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';

/**
 * @internal
 */
export class AttachedViews {
	private readonly _onDidChangeVisibleRanges = new Emitter<{ view: IAttachedView; state: IAttachedViewState | undefined }>();
	public readonly onDidChangeVisibleRanges = this._onDidChangeVisibleRanges.event;

	private readonly _views = new Set<AttachedViewImpl>();

	public attachView(): IAttachedView {
		const view = new AttachedViewImpl((state) => {
			this._onDidChangeVisibleRanges.fire({ view, state });
		});
		this._views.add(view);
		return view;
	}

	public detachView(view: IAttachedView): void {
		this._views.delete(view as AttachedViewImpl);
		this._onDidChangeVisibleRanges.fire({ view, state: undefined });
	}
}

/**
 * @internal
 */
export interface IAttachedViewState {
	readonly visibleLineRanges: readonly LineRange[];
	readonly stabilized: boolean;
}

class AttachedViewImpl implements IAttachedView {
	constructor(private readonly handleStateChange: (state: IAttachedViewState) => void) { }

	setVisibleLines(visibleLines: { startLineNumber: number; endLineNumber: number }[], stabilized: boolean): void {
		const visibleLineRanges = visibleLines.map((line) => new LineRange(line.startLineNumber, line.endLineNumber + 1));
		this.handleStateChange({ visibleLineRanges, stabilized });
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

	public handleStateChange(state: IAttachedViewState): void {
		this._lineRanges = state.visibleLineRanges;
		if (state.stabilized) {
			this.runner.cancel();
			this.update();
		} else {
			this.runner.schedule();
		}
	}
}

export abstract class AbstractTokens extends Disposable {
	protected _backgroundTokenizationState = BackgroundTokenizationState.InProgress;
	public get backgroundTokenizationState(): BackgroundTokenizationState {
		return this._backgroundTokenizationState;
	}

	protected readonly _onDidChangeBackgroundTokenizationState = this._register(new Emitter<void>());
	/** @internal, should not be exposed by the text model! */
	public readonly onDidChangeBackgroundTokenizationState: Event<void> = this._onDidChangeBackgroundTokenizationState.event;

	protected readonly _onDidChangeTokens = this._register(new Emitter<IModelTokensChangedEvent>());
	/** @internal, should not be exposed by the text model! */
	public readonly onDidChangeTokens: Event<IModelTokensChangedEvent> = this._onDidChangeTokens.event;

	constructor(
		protected readonly _languageIdCodec: ILanguageIdCodec,
		protected readonly _textModel: TextModel,
		protected getLanguageId: () => string,
	) {
		super();
	}

	public abstract resetTokenization(fireTokenChangeEvent?: boolean): void;

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

	public abstract tokenizeLineWithEdit(position: IPosition, length: number, newText: string): LineTokens | null;

	public abstract get hasTokens(): boolean;
}
