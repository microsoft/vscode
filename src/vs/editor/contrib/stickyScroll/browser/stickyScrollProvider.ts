/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { OutlineModel, OutlineElement } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { CancellationToken, CancellationTokenSource, } from 'vs/base/common/cancellation';
import { EditorOption, RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';
import { SymbolKind } from 'vs/editor/common/languages';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IModelTokensChangedEvent } from 'vs/editor/common/textModelEvents';
import { Range } from 'vs/editor/common/core/range';
import { Emitter } from 'vs/base/common/event';
import { binarySearch } from 'vs/base/common/arrays';
import { StickyScrollWidget } from 'vs/editor/contrib/stickyScroll/browser/stickyScrollWidget';

export class StickyLineCandidate {
	constructor(
		public readonly startLineNumber: number,
		public readonly endLineNumber: number,
		public readonly nestingDepth: number,
		public parentIndex: number,
	) { }
}

export class StickyLineCandidateProvider extends Disposable {
	private readonly _onStickyScrollChange = this._register(new Emitter<void>());
	public readonly onStickyScrollChange = this._onStickyScrollChange.event;

	static readonly ID = 'store.contrib.stickyScrollController';
	private readonly _editor: ICodeEditor;
	private readonly _stickyScrollWidget: StickyScrollWidget;
	private readonly _languageFeaturesService: ILanguageFeaturesService;
	private readonly _updateSoon: RunOnceScheduler;
	private _cts: CancellationTokenSource | undefined;

	private readonly _sessionStore: DisposableStore = new DisposableStore();
	private _ranges: StickyLineCandidate[] = [];
	private _rangesVersionId: number = 0;

	constructor(
		editor: ICodeEditor,
		stickyScrollWidget: StickyScrollWidget,
		@ILanguageFeaturesService _languageFeaturesService: ILanguageFeaturesService,
	) {
		super();
		this._editor = editor;
		this._stickyScrollWidget = stickyScrollWidget;
		this._languageFeaturesService = _languageFeaturesService;
		this._updateSoon = this._register(new RunOnceScheduler(() => this._update(true), 50));
		this._register(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.experimental)) {
				this.onConfigurationChange();
			}
		}));
		this.onConfigurationChange();
	}

	private onConfigurationChange() {
		const options = this._editor.getOption(EditorOption.experimental);
		if (options.stickyScroll.enabled === false) {
			this._sessionStore.clear();
			return;
		} else {
			this._sessionStore.add(this._editor.onDidChangeModel(() => this._update(true)));
			this._sessionStore.add(this._editor.onDidScrollChange(() => this._update(false)));
			this._sessionStore.add(this._editor.onDidChangeHiddenAreas(() => this._update(true)));
			this._sessionStore.add(this._editor.onDidChangeModelTokens((e) => this._onTokensChange(e)));
			this._sessionStore.add(this._editor.onDidChangeModelContent(() => this._updateSoon.schedule()));
			this._sessionStore.add(this._languageFeaturesService.documentSymbolProvider.onDidChange(() => this._update(true)));
			const lineNumberOption = this._editor.getOption(EditorOption.lineNumbers);
			if (lineNumberOption.renderType === RenderLineNumbersType.Relative) {
				this._sessionStore.add(this._editor.onDidChangeCursorPosition(() => this._update(false)));
			}
			this._update(true);
		}
	}

	public getRangesVersionId() {
		return this._rangesVersionId;
	}

	private _needsUpdate(event: IModelTokensChangedEvent) {
		const stickyLineNumbers = this._stickyScrollWidget.getCurrentLines();
		for (const stickyLineNumber of stickyLineNumbers) {
			for (const range of event.ranges) {
				if (stickyLineNumber >= range.fromLineNumber && stickyLineNumber <= range.toLineNumber) {
					return true;
				}
			}
		}
		return false;
	}

	private _onTokensChange(event: IModelTokensChangedEvent) {
		if (this._needsUpdate(event)) {
			this._update(false);
		}
	}

	private async _update(updateOutline: boolean = false): Promise<void> {
		if (updateOutline) {
			this._cts?.dispose(true);
			this._cts = new CancellationTokenSource();
			await this._updateOutlineModel(this._cts.token);
		}
		const hiddenRanges: Range[] | undefined = this._editor._getViewModel()?.getHiddenAreas();
		if (hiddenRanges) {
			for (const hiddenRange of hiddenRanges) {
				this._ranges = this._ranges.filter(range => { return !(range.startLineNumber >= hiddenRange.startLineNumber && range.endLineNumber <= hiddenRange.endLineNumber + 1); });
			}
		}
		this._onStickyScrollChange.fire();
	}

	private _findLineRanges(outlineElement: OutlineElement, depth: number) {
		if (outlineElement?.children.size) {
			let didRecursion: boolean = false;
			for (const outline of outlineElement?.children.values()) {
				const kind: SymbolKind = outline.symbol.kind;
				if (kind === SymbolKind.Class || kind === SymbolKind.Constructor || kind === SymbolKind.Function || kind === SymbolKind.Interface || kind === SymbolKind.Method || kind === SymbolKind.Module) {
					didRecursion = true;
					this._findLineRanges(outline, depth + 1);
				}
			}
			if (!didRecursion) {
				this._addOutlineRanges(outlineElement, depth);
			}
		} else {
			this._addOutlineRanges(outlineElement, depth);
		}
	}

	private _addOutlineRanges(outlineElement: OutlineElement, depth: number) {
		let currentStartLine: number | undefined = 0;
		let currentEndLine: number | undefined = 0;

		while (outlineElement) {
			const kind: SymbolKind = outlineElement.symbol.kind;
			if (kind === SymbolKind.Class || kind === SymbolKind.Constructor || kind === SymbolKind.Function || kind === SymbolKind.Interface || kind === SymbolKind.Method || kind === SymbolKind.Module) {
				currentStartLine = outlineElement?.symbol.range.startLineNumber as number;
				currentEndLine = outlineElement?.symbol.range.endLineNumber as number;
				if (currentEndLine > currentStartLine) {
					this._ranges.push(new StickyLineCandidate(currentStartLine, currentEndLine - 1, depth, 0));
				} else {
					this._ranges.push(new StickyLineCandidate(currentStartLine, currentEndLine, depth, 0));
				}
				depth--;
			}
			if (outlineElement.parent instanceof OutlineElement) {
				outlineElement = outlineElement.parent;
			} else {
				break;
			}
		}
	}

	private async _updateOutlineModel(token: CancellationToken) {
		if (this._editor.hasModel()) {
			const model = this._editor.getModel();
			const modelVersionId = model.getVersionId();
			const outlineModel = await OutlineModel.create(this._languageFeaturesService.documentSymbolProvider, model, token);
			if (token.isCancellationRequested) {
				return;
			}
			this._ranges = [];
			this._rangesVersionId = modelVersionId;
			for (const outline of outlineModel.children.values()) {
				if (outline instanceof OutlineElement) {
					const kind: SymbolKind = outline.symbol.kind;
					if (kind === SymbolKind.Class || kind === SymbolKind.Constructor || kind === SymbolKind.Function || kind === SymbolKind.Interface || kind === SymbolKind.Method || kind === SymbolKind.Module) {
						this._findLineRanges(outline, 1);
					} else {
						this._findLineRanges(outline, 0);
					}
				}
			}

			this._ranges.sort(function (a, b) {
				if (a.startLineNumber !== b.startLineNumber) {
					return a.startLineNumber - b.startLineNumber;
				} else if (a.endLineNumber !== b.endLineNumber) {
					return b.endLineNumber - a.endLineNumber;
				} else {
					return a.nestingDepth - b.nestingDepth;
				}
			});

			const startLinesConsidered: Set<number> = new Set();
			this._ranges = this._ranges.filter(range => {
				if (!startLinesConsidered.has(range.startLineNumber)) {
					startLinesConsidered.add(range.startLineNumber);
					return true;
				} else {
					return false;
				}
			});

			const stackOfParents = [0];
			for (const [index, range] of this._ranges.entries()) {
				let currentParentIndex = stackOfParents[stackOfParents.length - 1];
				let currentParent = this._ranges[currentParentIndex];
				if (index === currentParentIndex) {
					this._ranges[index].parentIndex = index;
				} else if (range.startLineNumber >= currentParent.startLineNumber && range.endLineNumber <= currentParent.endLineNumber) {
					this._ranges[index].parentIndex = currentParentIndex;
					stackOfParents.push(index);
				} else {
					while (stackOfParents.length !== 0) {
						stackOfParents.pop();
						if (stackOfParents.length > 0) {
							currentParentIndex = stackOfParents[stackOfParents.length - 1];
							currentParent = this._ranges[currentParentIndex];
							if (range.startLineNumber >= currentParent.startLineNumber && range.endLineNumber <= currentParent.endLineNumber) {
								this._ranges[index].parentIndex = currentParentIndex;
								break;
							}
						}
					}
					if (stackOfParents.length === 0) {
						this._ranges[index].parentIndex = index;
					}
					stackOfParents.push(index);
				}
			}
		}
	}

	private _containsLine(set: Set<StickyLineCandidate>, line: StickyLineCandidate) {
		for (const element of set) {
			if (JSON.stringify(element) === JSON.stringify(line)) {
				return true;
			}
		}
		return false;
	}

	public getPotentialStickyRanges(line: number) {
		const index = binarySearch(this._ranges.map(function (range) {
			return range.startLineNumber;
		}), line, (a, b) => { return a - b; });
		let finalIndex;
		if (index < 0) {
			finalIndex = -(index + 1);
		} else {
			finalIndex = index;
		}
		const nRanges = this._ranges.length;
		const rangesConsidered: Set<StickyLineCandidate> = new Set();
		const sortedRanges = [];
		for (let i = Math.max(0, finalIndex - 1); i <= Math.min(nRanges - 1, finalIndex + 1); i++) {
			let rangeIndex = i;
			while (true) {
				const range = this._ranges[rangeIndex];
				if (!this._containsLine(rangesConsidered, range)) {
					sortedRanges.push(range);
					rangesConsidered.add(range);
					if (rangeIndex === range.parentIndex) {
						break;
					}
					rangeIndex = range.parentIndex;
				} else {
					break;
				}
			}
		}
		sortedRanges.sort(function (a, b) {
			return a.startLineNumber - b.startLineNumber;
		});
		return sortedRanges;
	}
}
