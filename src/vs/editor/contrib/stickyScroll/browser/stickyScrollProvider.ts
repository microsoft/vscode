/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { CancellationToken, CancellationTokenSource, } from '../../../../base/common/cancellation.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { binarySearch } from '../../../../base/common/arrays.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import { StickyModelProvider, IStickyModelProvider } from './stickyScrollModelProvider.js';
import { StickyElement, StickyModel, StickyRange } from './stickyScrollElement.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';

export class StickyLineCandidate {
	constructor(
		public readonly startLineNumber: number,
		public readonly endLineNumber: number,
		public readonly top: number,
		public readonly height: number,
	) { }
}

export interface IStickyLineCandidateProvider {
	/**
	 * Dispose resources used by the provider.
	 */
	dispose(): void;

	/**
	 * Get the version ID of the sticky model.
	 */
	getVersionId(): number | undefined;

	/**
	 * Update the sticky line candidates.
	 */
	update(): Promise<void>;

	/**
	 * Get sticky line candidates intersecting a given range.
	 */
	getCandidateStickyLinesIntersecting(range: StickyRange): StickyLineCandidate[];

	/**
	 * Event triggered when sticky scroll changes.
	 */
	readonly onDidChangeStickyScroll: Event<void>;
}

export class StickyLineCandidateProvider extends Disposable implements IStickyLineCandidateProvider {
	static readonly ID = 'store.contrib.stickyScrollController';

	private readonly _onDidChangeStickyScroll = this._register(new Emitter<void>());
	public readonly onDidChangeStickyScroll = this._onDidChangeStickyScroll.event;

	private readonly _editor: ICodeEditor;
	private readonly _updateSoon: RunOnceScheduler;
	private readonly _sessionStore: DisposableStore;

	private _model: StickyModel | null = null;
	private _cts: CancellationTokenSource | null = null;
	private _stickyModelProvider: IStickyModelProvider | null = null;

	constructor(
		editor: ICodeEditor,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
	) {
		super();
		this._editor = editor;
		this._sessionStore = this._register(new DisposableStore());
		this._updateSoon = this._register(new RunOnceScheduler(() => this.update(), 50));

		this._register(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.stickyScroll)) {
				this.readConfiguration();
			}
		}));
		this.readConfiguration();
	}

	/**
	 * Read and apply the sticky scroll configuration.
	 */
	private readConfiguration() {
		this._sessionStore.clear();
		const options = this._editor.getOption(EditorOption.stickyScroll);
		if (!options.enabled) {
			return;
		}
		this._sessionStore.add(this._editor.onDidChangeModel(() => {
			this._model = null;
			this.updateStickyModelProvider();
			this._onDidChangeStickyScroll.fire();
			this.update();
		}));
		this._sessionStore.add(this._editor.onDidChangeHiddenAreas(() => this.update()));
		this._sessionStore.add(this._editor.onDidChangeModelContent(() => this._updateSoon.schedule()));
		this._sessionStore.add(this._languageFeaturesService.documentSymbolProvider.onDidChange(() => this.update()));
		this._sessionStore.add(toDisposable(() => {
			this._stickyModelProvider?.dispose();
			this._stickyModelProvider = null;
		}));
		this.updateStickyModelProvider();
		this.update();
	}

	/**
	 * Get the version ID of the sticky model.
	 */
	public getVersionId(): number | undefined {
		return this._model?.version;
	}

	/**
	 * Update the sticky model provider.
	 */
	private updateStickyModelProvider() {
		this._stickyModelProvider?.dispose();
		this._stickyModelProvider = null;
		if (this._editor.hasModel()) {
			this._stickyModelProvider = new StickyModelProvider(
				this._editor,
				() => this._updateSoon.schedule(),
				this._languageConfigurationService,
				this._languageFeaturesService
			);
		}
	}

	/**
	 * Update the sticky line candidates.
	 */
	public async update(): Promise<void> {
		this._cts?.dispose(true);
		this._cts = new CancellationTokenSource();
		await this.updateStickyModel(this._cts.token);
		this._onDidChangeStickyScroll.fire();
	}

	/**
	 * Update the sticky model based on the current editor state.
	 */
	private async updateStickyModel(token: CancellationToken): Promise<void> {
		if (!this._editor.hasModel() || !this._stickyModelProvider || this._editor.getModel().isTooLargeForTokenization()) {
			this._model = null;
			return;
		}
		const model = await this._stickyModelProvider.update(token);
		if (!token.isCancellationRequested) {
			this._model = model;
		}
	}

	/**
	 * Get sticky line candidates intersecting a given range.
	 */
	public getCandidateStickyLinesIntersecting(range: StickyRange): StickyLineCandidate[] {
		if (!this._model?.element) {
			return [];
		}
		const stickyLineCandidates: StickyLineCandidate[] = [];
		this.getCandidateStickyLinesIntersectingFromStickyModel(range, this._model.element, stickyLineCandidates, 0, 0, -1);
		return this.filterHiddenRanges(stickyLineCandidates);
	}

	/**
	 * Get sticky line candidates intersecting a given range from the sticky model.
	 */
	private getCandidateStickyLinesIntersectingFromStickyModel(
		range: StickyRange,
		outlineModel: StickyElement,
		result: StickyLineCandidate[],
		depth: number,
		top: number,
		lastStartLineNumber: number
	): void {
		const textModel = this._editor.getModel();
		if (!textModel) {
			return;
		}
		if (outlineModel.children.length === 0) {
			return;
		}
		let lastLine = lastStartLineNumber;
		const childrenStartLines: number[] = [];

		for (let i = 0; i < outlineModel.children.length; i++) {
			const child = outlineModel.children[i];
			if (child.range) {
				childrenStartLines.push(child.range.startLineNumber);
			}
		}
		const lowerBound = this.updateIndex(binarySearch(childrenStartLines, range.startLineNumber, (a: number, b: number) => { return a - b; }));
		const upperBound = this.updateIndex(binarySearch(childrenStartLines, range.endLineNumber, (a: number, b: number) => { return a - b; }));

		for (let i = lowerBound; i <= upperBound; i++) {
			const child = outlineModel.children[i];
			if (!child || !child.range) {
				continue;
			}
			const { startLineNumber, endLineNumber } = child.range;
			if (
				endLineNumber > startLineNumber + 1
				&& range.startLineNumber <= endLineNumber + 1
				&& startLineNumber - 1 <= range.endLineNumber
				&& startLineNumber !== lastLine
				&& textModel.isValidRange(new Range(startLineNumber, 1, endLineNumber, 1))
			) {
				lastLine = startLineNumber;
				const lineHeight = this._editor.getLineHeightForPosition(new Position(startLineNumber, 1));
				result.push(new StickyLineCandidate(startLineNumber, endLineNumber - 1, top, lineHeight));
				this.getCandidateStickyLinesIntersectingFromStickyModel(range, child, result, depth + 1, top + lineHeight, startLineNumber);
			}
		}
	}

	/**
	 * Filter out sticky line candidates that are within hidden ranges.
	 */
	private filterHiddenRanges(stickyLineCandidates: StickyLineCandidate[]): StickyLineCandidate[] {
		const hiddenRanges = this._editor._getViewModel()?.getHiddenAreas();
		if (!hiddenRanges) {
			return stickyLineCandidates;
		}
		return stickyLineCandidates.filter(candidate => {
			return !hiddenRanges.some(hiddenRange =>
				candidate.startLineNumber >= hiddenRange.startLineNumber &&
				candidate.endLineNumber <= hiddenRange.endLineNumber + 1
			);
		});
	}

	/**
	 * Update the binary search index.
	 */
	private updateIndex(index: number): number {
		if (index === -1) {
			return 0;
		} else if (index < 0) {
			return -index - 2;
		}
		return index;
	}
}
