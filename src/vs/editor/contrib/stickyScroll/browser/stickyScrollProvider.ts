/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { CancellationToken, CancellationTokenSource, } from 'vs/base/common/cancellation';
import { EditorOption, IEditorStickyScrollOptions } from 'vs/editor/common/config/editorOptions';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Range } from 'vs/editor/common/core/range';
import { binarySearch } from 'vs/base/common/arrays';
import { isEqual } from 'vs/base/common/resources';
import { Event, Emitter } from 'vs/base/common/event';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { StickyModelProvider, IStickyModelProvider } from 'vs/editor/contrib/stickyScroll/browser/stickyScrollModelProvider';
import { StickyElement, StickyModel, StickyRange } from 'vs/editor/contrib/stickyScroll/browser/stickyScrollElement';

export class StickyLineCandidate {
	constructor(
		public readonly startLineNumber: number,
		public readonly endLineNumber: number,
		public readonly nestingDepth: number,
	) { }
}

export interface IStickyLineCandidateProvider {

	dispose(): void;
	getVersionId(): number | undefined;
	update(): Promise<void>;
	getCandidateStickyLinesIntersecting(range: StickyRange): StickyLineCandidate[];
	onDidChangeStickyScroll: Event<void>;

}

export class StickyLineCandidateProvider extends Disposable implements IStickyLineCandidateProvider {

	static readonly ID = 'store.contrib.stickyScrollController';

	private readonly _onDidChangeStickyScroll = this._store.add(new Emitter<void>());
	public readonly onDidChangeStickyScroll = this._onDidChangeStickyScroll.event;

	private readonly _editor: ICodeEditor;
	private readonly _updateSoon: RunOnceScheduler;
	private readonly _sessionStore: DisposableStore;

	private _options: Readonly<Required<IEditorStickyScrollOptions>> | null = null;
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
		this._sessionStore = new DisposableStore();
		this._updateSoon = this._register(new RunOnceScheduler(() => this.update(), 50));

		this._register(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.stickyScroll)) {
				this.readConfiguration();
			}
		}));
		this.readConfiguration();
	}

	override dispose(): void {
		super.dispose();
		this._sessionStore.dispose();
	}

	private readConfiguration() {

		this._options = this._editor.getOption(EditorOption.stickyScroll);
		if (!this._options.enabled) {
			this._sessionStore.clear();
			return;
		}

		this._stickyModelProvider = new StickyModelProvider(
			this._editor,
			this._languageConfigurationService,
			this._languageFeaturesService,
			this._options.defaultModel
		);

		this._sessionStore.add(this._editor.onDidChangeModel(() => this.update()));
		this._sessionStore.add(this._editor.onDidChangeHiddenAreas(() => this.update()));
		this._sessionStore.add(this._editor.onDidChangeModelContent(() => this._updateSoon.schedule()));
		this._sessionStore.add(this._languageFeaturesService.documentSymbolProvider.onDidChange(() => this.update()));
		this.update();
	}

	public getVersionId(): number | undefined {
		return this._model?.version;
	}

	public async update(): Promise<void> {
		this._cts?.dispose(true);
		this._cts = new CancellationTokenSource();
		await this.updateStickyModel(this._cts.token);
		this._onDidChangeStickyScroll.fire();
	}

	private async updateStickyModel(token: CancellationToken): Promise<void> {

		if (!this._editor.hasModel() || !this._stickyModelProvider) {
			return;
		}

		const textModel = this._editor.getModel();
		const modelVersionId = textModel.getVersionId();
		const isDifferentModel = this._model ? !isEqual(this._model.uri, textModel.uri) : false;

		// Clear sticky scroll to not show stale data for too long
		const resetHandle = isDifferentModel ? setTimeout(() => {
			if (!token.isCancellationRequested) {
				this._model = new StickyModel(textModel.uri, textModel.getVersionId(), undefined, undefined);
				this._onDidChangeStickyScroll.fire();
			}
		}, 75) : undefined;

		this._model = await this._stickyModelProvider.update(textModel, modelVersionId, token);

		clearTimeout(resetHandle);
	}

	private updateIndex(index: number) {
		if (index === -1) {
			index = 0;
		} else if (index < 0) {
			index = -index - 2;
		}
		return index;
	}

	public getCandidateStickyLinesIntersectingFromStickyModel(
		range: StickyRange,
		outlineModel: StickyElement,
		result: StickyLineCandidate[],
		depth: number,
		lastStartLineNumber: number
	): void {
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
		const upperBound = this.updateIndex(binarySearch(childrenStartLines, range.startLineNumber + depth, (a: number, b: number) => { return a - b; }));

		for (let i = lowerBound; i <= upperBound; i++) {
			const child = outlineModel.children[i];
			if (!child) {
				return;
			}
			if (child.range) {
				const childStartLine = child.range.startLineNumber;
				const childEndLine = child.range.endLineNumber;
				if (range.startLineNumber <= childEndLine + 1 && childStartLine - 1 <= range.endLineNumber && childStartLine !== lastLine) {
					lastLine = childStartLine;
					result.push(new StickyLineCandidate(childStartLine, childEndLine - 1, depth + 1));
					this.getCandidateStickyLinesIntersectingFromStickyModel(range, child, result, depth + 1, childStartLine);
				}
			} else {
				this.getCandidateStickyLinesIntersectingFromStickyModel(range, child, result, depth, lastStartLineNumber);
			}
		}
	}

	public getCandidateStickyLinesIntersecting(range: StickyRange): StickyLineCandidate[] {
		if (!this._model?.element) {
			return [];
		}
		let stickyLineCandidates: StickyLineCandidate[] = [];
		this.getCandidateStickyLinesIntersectingFromStickyModel(range, this._model.element, stickyLineCandidates, 0, -1);
		const hiddenRanges: Range[] | undefined = this._editor._getViewModel()?.getHiddenAreas();

		if (hiddenRanges) {
			for (const hiddenRange of hiddenRanges) {
				stickyLineCandidates = stickyLineCandidates.filter(stickyLine => !(stickyLine.startLineNumber >= hiddenRange.startLineNumber && stickyLine.endLineNumber <= hiddenRange.endLineNumber + 1));
			}
		}
		return stickyLineCandidates;
	}
}
