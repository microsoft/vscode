/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, addStandardDisposableListener, reset } from 'vs/base/browser/dom';
import { createTrustedTypesPolicy } from 'vs/base/browser/trustedTypes';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Action } from 'vs/base/common/actions';
import { forEachAdjacent, groupAdjacentBy } from 'vs/base/common/arrays';
import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, ITransaction, autorun, autorunWithStore, derived, derivedWithStore, recomputeInitiallyAndOnChange, observableValue, subtransaction, transaction } from 'vs/base/common/observable';
import { ThemeIcon } from 'vs/base/common/themables';
import { applyFontInfo } from 'vs/editor/browser/config/domFontInfo';
import { DiffEditorEditors } from 'vs/editor/browser/widget/diffEditor/diffEditorEditors';
import { applyStyle } from 'vs/editor/browser/widget/diffEditor/utils';
import { EditorFontLigatures, EditorOption, IComputedEditorOptions } from 'vs/editor/common/config/editorOptions';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { DetailedLineRangeMapping, LineRangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { ILanguageIdCodec } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ITextModel, TextModelResolvedOptions } from 'vs/editor/common/model';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';
import { RenderLineInput, renderViewLine2 } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { ViewLineRenderingData } from 'vs/editor/common/viewModel';
import { localize } from 'vs/nls';
import { AudioCue, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import 'vs/css!./accessibleDiffViewer';

const accessibleDiffViewerInsertIcon = registerIcon('diff-review-insert', Codicon.add, localize('accessibleDiffViewerInsertIcon', 'Icon for \'Insert\' in accessible diff viewer.'));
const accessibleDiffViewerRemoveIcon = registerIcon('diff-review-remove', Codicon.remove, localize('accessibleDiffViewerRemoveIcon', 'Icon for \'Remove\' in accessible diff viewer.'));
const accessibleDiffViewerCloseIcon = registerIcon('diff-review-close', Codicon.close, localize('accessibleDiffViewerCloseIcon', 'Icon for \'Close\' in accessible diff viewer.'));

export class AccessibleDiffViewer extends Disposable {
	public static _ttPolicy = createTrustedTypesPolicy('diffReview', { createHTML: value => value });

	constructor(
		private readonly _parentNode: HTMLElement,
		private readonly _visible: IObservable<boolean>,
		private readonly _setVisible: (visible: boolean, tx: ITransaction | undefined) => void,
		private readonly _canClose: IObservable<boolean>,
		private readonly _width: IObservable<number>,
		private readonly _height: IObservable<number>,
		private readonly _diffs: IObservable<DetailedLineRangeMapping[] | undefined>,
		private readonly _editors: DiffEditorEditors,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._register(recomputeInitiallyAndOnChange(this.model));
	}

	private readonly model = derivedWithStore(this, (reader, store) => {
		const visible = this._visible.read(reader);
		this._parentNode.style.visibility = visible ? 'visible' : 'hidden';
		if (!visible) {
			return null;
		}
		const model = store.add(this._instantiationService.createInstance(ViewModel, this._diffs, this._editors, this._setVisible, this._canClose));
		const view = store.add(this._instantiationService.createInstance(View, this._parentNode, model, this._width, this._height, this._editors));
		return {
			model,
			view
		};
	});

	next(): void {
		transaction(tx => {
			const isVisible = this._visible.get();
			this._setVisible(true, tx);
			if (isVisible) {
				this.model.get()!.model.nextGroup(tx);
			}
		});
	}

	prev(): void {
		transaction(tx => {
			this._setVisible(true, tx);
			this.model.get()!.model.previousGroup(tx);
		});
	}

	close(): void {
		transaction(tx => {
			this._setVisible(false, tx);
		});
	}
}

class ViewModel extends Disposable {
	private readonly _groups = observableValue<ViewElementGroup[]>(this, []);
	private readonly _currentGroupIdx = observableValue(this, 0);
	private readonly _currentElementIdx = observableValue(this, 0);

	public readonly groups: IObservable<ViewElementGroup[]> = this._groups;
	public readonly currentGroup: IObservable<ViewElementGroup | undefined>
		= this._currentGroupIdx.map((idx, r) => this._groups.read(r)[idx]);
	public readonly currentGroupIndex: IObservable<number> = this._currentGroupIdx;

	public readonly currentElement: IObservable<ViewElement | undefined>
		= this._currentElementIdx.map((idx, r) => this.currentGroup.read(r)?.lines[idx]);

	constructor(
		private readonly _diffs: IObservable<DetailedLineRangeMapping[] | undefined>,
		private readonly _editors: DiffEditorEditors,
		private readonly _setVisible: (visible: boolean, tx: ITransaction | undefined) => void,
		public readonly canClose: IObservable<boolean>,
		@IAudioCueService private readonly _audioCueService: IAudioCueService,
	) {
		super();

		this._register(autorun(reader => {
			/** @description update groups */
			const diffs = this._diffs.read(reader);
			if (!diffs) {
				this._groups.set([], undefined);
				return;
			}

			const groups = computeViewElementGroups(
				diffs,
				this._editors.original.getModel()!.getLineCount(),
				this._editors.modified.getModel()!.getLineCount()
			);

			transaction(tx => {
				const p = this._editors.modified.getPosition();
				if (p) {
					const nextGroup = groups.findIndex(g => p?.lineNumber < g.range.modified.endLineNumberExclusive);
					if (nextGroup !== -1) {
						this._currentGroupIdx.set(nextGroup, tx);
					}
				}
				this._groups.set(groups, tx);
			});
		}));

		this._register(autorun(reader => {
			/** @description play audio-cue for diff */
			const currentViewItem = this.currentElement.read(reader);
			if (currentViewItem?.type === LineType.Deleted) {
				this._audioCueService.playAudioCue(AudioCue.diffLineDeleted, { source: 'accessibleDiffViewer.currentElementChanged' });
			} else if (currentViewItem?.type === LineType.Added) {
				this._audioCueService.playAudioCue(AudioCue.diffLineInserted, { source: 'accessibleDiffViewer.currentElementChanged' });
			}
		}));

		this._register(autorun(reader => {
			/** @description select lines in editor */
			// This ensures editor commands (like revert/stage) work
			const currentViewItem = this.currentElement.read(reader);
			if (currentViewItem && currentViewItem.type !== LineType.Header) {
				const lineNumber = currentViewItem.modifiedLineNumber ?? currentViewItem.diff.modified.startLineNumber;
				this._editors.modified.setSelection(Range.fromPositions(new Position(lineNumber, 1)));
			}
		}));
	}

	private _goToGroupDelta(delta: number, tx?: ITransaction): void {
		const groups = this.groups.get();
		if (!groups || groups.length <= 1) { return; }
		subtransaction(tx, tx => {
			this._currentGroupIdx.set(OffsetRange.ofLength(groups.length).clipCyclic(this._currentGroupIdx.get() + delta), tx);
			this._currentElementIdx.set(0, tx);
		});
	}

	nextGroup(tx?: ITransaction): void { this._goToGroupDelta(1, tx); }
	previousGroup(tx?: ITransaction): void { this._goToGroupDelta(-1, tx); }

	private _goToLineDelta(delta: number): void {
		const group = this.currentGroup.get();
		if (!group || group.lines.length <= 1) { return; }
		transaction(tx => {
			this._currentElementIdx.set(OffsetRange.ofLength(group.lines.length).clip(this._currentElementIdx.get() + delta), tx);
		});
	}

	goToNextLine(): void { this._goToLineDelta(1); }
	goToPreviousLine(): void { this._goToLineDelta(-1); }

	goToLine(line: ViewElement): void {
		const group = this.currentGroup.get();
		if (!group) { return; }
		const idx = group.lines.indexOf(line);
		if (idx === -1) { return; }
		transaction(tx => {
			this._currentElementIdx.set(idx, tx);
		});
	}

	revealCurrentElementInEditor(): void {
		this._setVisible(false, undefined);

		const curElem = this.currentElement.get();
		if (curElem) {
			if (curElem.type === LineType.Deleted) {
				this._editors.original.setSelection(Range.fromPositions(new Position(curElem.originalLineNumber, 1)));
				this._editors.original.revealLine(curElem.originalLineNumber);
				this._editors.original.focus();
			} else {
				if (curElem.type !== LineType.Header) {
					this._editors.modified.setSelection(Range.fromPositions(new Position(curElem.modifiedLineNumber, 1)));
					this._editors.modified.revealLine(curElem.modifiedLineNumber);
				}
				this._editors.modified.focus();
			}
		}
	}

	close(): void {
		this._setVisible(false, undefined);
		this._editors.modified.focus();
	}
}


const viewElementGroupLineMargin = 3;

function computeViewElementGroups(diffs: DetailedLineRangeMapping[], originalLineCount: number, modifiedLineCount: number): ViewElementGroup[] {
	const result: ViewElementGroup[] = [];

	for (const g of groupAdjacentBy(diffs, (a, b) => (b.modified.startLineNumber - a.modified.endLineNumberExclusive < 2 * viewElementGroupLineMargin))) {
		const viewElements: ViewElement[] = [];
		viewElements.push(new HeaderViewElement());

		const origFullRange = new LineRange(
			Math.max(1, g[0].original.startLineNumber - viewElementGroupLineMargin),
			Math.min(g[g.length - 1].original.endLineNumberExclusive + viewElementGroupLineMargin, originalLineCount + 1)
		);
		const modifiedFullRange = new LineRange(
			Math.max(1, g[0].modified.startLineNumber - viewElementGroupLineMargin),
			Math.min(g[g.length - 1].modified.endLineNumberExclusive + viewElementGroupLineMargin, modifiedLineCount + 1)
		);

		forEachAdjacent(g, (a, b) => {
			const origRange = new LineRange(a ? a.original.endLineNumberExclusive : origFullRange.startLineNumber, b ? b.original.startLineNumber : origFullRange.endLineNumberExclusive);
			const modifiedRange = new LineRange(a ? a.modified.endLineNumberExclusive : modifiedFullRange.startLineNumber, b ? b.modified.startLineNumber : modifiedFullRange.endLineNumberExclusive);

			origRange.forEach(origLineNumber => {
				viewElements.push(new UnchangedLineViewElement(origLineNumber, modifiedRange.startLineNumber + (origLineNumber - origRange.startLineNumber)));
			});

			if (b) {
				b.original.forEach(origLineNumber => {
					viewElements.push(new DeletedLineViewElement(b, origLineNumber));
				});
				b.modified.forEach(modifiedLineNumber => {
					viewElements.push(new AddedLineViewElement(b, modifiedLineNumber));
				});
			}
		});

		const modifiedRange = g[0].modified.join(g[g.length - 1].modified);
		const originalRange = g[0].original.join(g[g.length - 1].original);

		result.push(new ViewElementGroup(new LineRangeMapping(modifiedRange, originalRange), viewElements));
	}
	return result;
}

enum LineType {
	Header,
	Unchanged,
	Deleted,
	Added,
}

class ViewElementGroup {
	constructor(
		public readonly range: LineRangeMapping,
		public readonly lines: readonly ViewElement[],
	) { }
}

type ViewElement = HeaderViewElement | UnchangedLineViewElement | DeletedLineViewElement | AddedLineViewElement;

class HeaderViewElement {
	public readonly type = LineType.Header;
}

class DeletedLineViewElement {
	public readonly type = LineType.Deleted;

	public readonly modifiedLineNumber = undefined;

	constructor(
		public readonly diff: DetailedLineRangeMapping,
		public readonly originalLineNumber: number,
	) {
	}
}

class AddedLineViewElement {
	public readonly type = LineType.Added;

	public readonly originalLineNumber = undefined;

	constructor(
		public readonly diff: DetailedLineRangeMapping,
		public readonly modifiedLineNumber: number,
	) {
	}
}

class UnchangedLineViewElement {
	public readonly type = LineType.Unchanged;
	constructor(
		public readonly originalLineNumber: number,
		public readonly modifiedLineNumber: number,
	) {
	}
}

class View extends Disposable {
	public readonly domNode: HTMLElement;
	private readonly _content: HTMLElement;
	private readonly _scrollbar: DomScrollableElement;
	private readonly _actionBar: ActionBar;

	constructor(
		private readonly _element: HTMLElement,
		private readonly _model: ViewModel,
		private readonly _width: IObservable<number>,
		private readonly _height: IObservable<number>,
		private readonly _editors: DiffEditorEditors,
		@ILanguageService private readonly _languageService: ILanguageService,
	) {
		super();

		this.domNode = this._element;
		this.domNode.className = 'diff-review monaco-editor-background';

		const actionBarContainer = document.createElement('div');
		actionBarContainer.className = 'diff-review-actions';
		this._actionBar = this._register(new ActionBar(
			actionBarContainer
		));
		this._register(autorun(reader => {
			/** @description update actions */
			this._actionBar.clear();
			if (this._model.canClose.read(reader)) {
				this._actionBar.push(new Action(
					'diffreview.close',
					localize('label.close', "Close"),
					'close-diff-review ' + ThemeIcon.asClassName(accessibleDiffViewerCloseIcon),
					true,
					async () => _model.close()
				), { label: false, icon: true });
			}
		}));

		this._content = document.createElement('div');
		this._content.className = 'diff-review-content';
		this._content.setAttribute('role', 'code');
		this._scrollbar = this._register(new DomScrollableElement(this._content, {}));
		reset(this.domNode, this._scrollbar.getDomNode(), actionBarContainer);

		this._register(toDisposable(() => { reset(this.domNode); }));

		this._register(applyStyle(this.domNode, { width: this._width, height: this._height }));
		this._register(applyStyle(this._content, { width: this._width, height: this._height }));

		this._register(autorunWithStore((reader, store) => {
			/** @description render */
			this._model.currentGroup.read(reader);
			this._render(store);
		}));

		// TODO@hediet use commands
		this._register(addStandardDisposableListener(this.domNode, 'keydown', (e) => {
			if (
				e.equals(KeyCode.DownArrow)
				|| e.equals(KeyMod.CtrlCmd | KeyCode.DownArrow)
				|| e.equals(KeyMod.Alt | KeyCode.DownArrow)
			) {
				e.preventDefault();
				this._model.goToNextLine();
			}

			if (
				e.equals(KeyCode.UpArrow)
				|| e.equals(KeyMod.CtrlCmd | KeyCode.UpArrow)
				|| e.equals(KeyMod.Alt | KeyCode.UpArrow)
			) {
				e.preventDefault();
				this._model.goToPreviousLine();
			}

			if (
				e.equals(KeyCode.Escape)
				|| e.equals(KeyMod.CtrlCmd | KeyCode.Escape)
				|| e.equals(KeyMod.Alt | KeyCode.Escape)
				|| e.equals(KeyMod.Shift | KeyCode.Escape)
			) {
				e.preventDefault();
				this._model.close();
			}

			if (
				e.equals(KeyCode.Space)
				|| e.equals(KeyCode.Enter)
			) {
				e.preventDefault();
				this._model.revealCurrentElementInEditor();
			}
		}));
	}

	private _render(store: DisposableStore): void {
		const originalOptions = this._editors.original.getOptions();
		const modifiedOptions = this._editors.modified.getOptions();

		const container = document.createElement('div');
		container.className = 'diff-review-table';
		container.setAttribute('role', 'list');
		container.setAttribute('aria-label', localize('ariaLabel', 'Accessible Diff Viewer. Use arrow up and down to navigate.'));
		applyFontInfo(container, modifiedOptions.get(EditorOption.fontInfo));

		reset(this._content, container);

		const originalModel = this._editors.original.getModel();
		const modifiedModel = this._editors.modified.getModel();
		if (!originalModel || !modifiedModel) {
			return;
		}

		const originalModelOpts = originalModel.getOptions();
		const modifiedModelOpts = modifiedModel.getOptions();

		const lineHeight = modifiedOptions.get(EditorOption.lineHeight);
		const group = this._model.currentGroup.get();
		for (const viewItem of group?.lines || []) {
			if (!group) {
				break;
			}
			let row: HTMLDivElement;

			if (viewItem.type === LineType.Header) {

				const header = document.createElement('div');
				header.className = 'diff-review-row';
				header.setAttribute('role', 'listitem');

				const r = group.range;
				const diffIndex = this._model.currentGroupIndex.get();
				const diffsLength = this._model.groups.get().length;
				const getAriaLines = (lines: number) =>
					lines === 0 ? localize('no_lines_changed', "no lines changed")
						: lines === 1 ? localize('one_line_changed', "1 line changed")
							: localize('more_lines_changed', "{0} lines changed", lines);

				const originalChangedLinesCntAria = getAriaLines(r.original.length);
				const modifiedChangedLinesCntAria = getAriaLines(r.modified.length);
				header.setAttribute('aria-label', localize({
					key: 'header',
					comment: [
						'This is the ARIA label for a git diff header.',
						'A git diff header looks like this: @@ -154,12 +159,39 @@.',
						'That encodes that at original line 154 (which is now line 159), 12 lines were removed/changed with 39 lines.',
						'Variables 0 and 1 refer to the diff index out of total number of diffs.',
						'Variables 2 and 4 will be numbers (a line number).',
						'Variables 3 and 5 will be "no lines changed", "1 line changed" or "X lines changed", localized separately.'
					]
				}, "Difference {0} of {1}: original line {2}, {3}, modified line {4}, {5}",
					(diffIndex + 1),
					diffsLength,
					r.original.startLineNumber,
					originalChangedLinesCntAria,
					r.modified.startLineNumber,
					modifiedChangedLinesCntAria
				));

				const cell = document.createElement('div');
				cell.className = 'diff-review-cell diff-review-summary';
				// e.g.: `1/10: @@ -504,7 +517,7 @@`
				cell.appendChild(document.createTextNode(`${diffIndex + 1}/${diffsLength}: @@ -${r.original.startLineNumber},${r.original.length} +${r.modified.startLineNumber},${r.modified.length} @@`));
				header.appendChild(cell);

				row = header;
			} else {
				row = this._createRow(viewItem, lineHeight,
					this._width.get(), originalOptions, originalModel, originalModelOpts, modifiedOptions, modifiedModel, modifiedModelOpts,
				);
			}

			container.appendChild(row);

			const isSelectedObs = derived(reader => /** @description isSelected */ this._model.currentElement.read(reader) === viewItem);

			store.add(autorun(reader => {
				/** @description update tab index */
				const isSelected = isSelectedObs.read(reader);
				row.tabIndex = isSelected ? 0 : -1;
				if (isSelected) {
					row.focus();
				}
			}));

			store.add(addDisposableListener(row, 'focus', () => {
				this._model.goToLine(viewItem);
			}));
		}

		this._scrollbar.scanDomNode();
	}

	private _createRow(
		item: DeletedLineViewElement | AddedLineViewElement | UnchangedLineViewElement,
		lineHeight: number,
		width: number,
		originalOptions: IComputedEditorOptions, originalModel: ITextModel, originalModelOpts: TextModelResolvedOptions,
		modifiedOptions: IComputedEditorOptions, modifiedModel: ITextModel, modifiedModelOpts: TextModelResolvedOptions,
	): HTMLDivElement {
		const originalLayoutInfo = originalOptions.get(EditorOption.layoutInfo);
		const originalLineNumbersWidth = originalLayoutInfo.glyphMarginWidth + originalLayoutInfo.lineNumbersWidth;

		const modifiedLayoutInfo = modifiedOptions.get(EditorOption.layoutInfo);
		const modifiedLineNumbersWidth = 10 + modifiedLayoutInfo.glyphMarginWidth + modifiedLayoutInfo.lineNumbersWidth;

		let rowClassName: string = 'diff-review-row';
		let lineNumbersExtraClassName: string = '';
		const spacerClassName: string = 'diff-review-spacer';
		let spacerIcon: ThemeIcon | null = null;
		switch (item.type) {
			case LineType.Added:
				rowClassName = 'diff-review-row line-insert';
				lineNumbersExtraClassName = ' char-insert';
				spacerIcon = accessibleDiffViewerInsertIcon;
				break;
			case LineType.Deleted:
				rowClassName = 'diff-review-row line-delete';
				lineNumbersExtraClassName = ' char-delete';
				spacerIcon = accessibleDiffViewerRemoveIcon;
				break;
		}

		const row = document.createElement('div');
		row.style.minWidth = width + 'px';
		row.className = rowClassName;
		row.setAttribute('role', 'listitem');
		row.ariaLevel = '';

		const cell = document.createElement('div');
		cell.className = 'diff-review-cell';
		cell.style.height = `${lineHeight}px`;
		row.appendChild(cell);

		const originalLineNumber = document.createElement('span');
		originalLineNumber.style.width = (originalLineNumbersWidth + 'px');
		originalLineNumber.style.minWidth = (originalLineNumbersWidth + 'px');
		originalLineNumber.className = 'diff-review-line-number' + lineNumbersExtraClassName;
		if (item.originalLineNumber !== undefined) {
			originalLineNumber.appendChild(document.createTextNode(String(item.originalLineNumber)));
		} else {
			originalLineNumber.innerText = '\u00a0';
		}
		cell.appendChild(originalLineNumber);

		const modifiedLineNumber = document.createElement('span');
		modifiedLineNumber.style.width = (modifiedLineNumbersWidth + 'px');
		modifiedLineNumber.style.minWidth = (modifiedLineNumbersWidth + 'px');
		modifiedLineNumber.style.paddingRight = '10px';
		modifiedLineNumber.className = 'diff-review-line-number' + lineNumbersExtraClassName;
		if (item.modifiedLineNumber !== undefined) {
			modifiedLineNumber.appendChild(document.createTextNode(String(item.modifiedLineNumber)));
		} else {
			modifiedLineNumber.innerText = '\u00a0';
		}
		cell.appendChild(modifiedLineNumber);

		const spacer = document.createElement('span');
		spacer.className = spacerClassName;

		if (spacerIcon) {
			const spacerCodicon = document.createElement('span');
			spacerCodicon.className = ThemeIcon.asClassName(spacerIcon);
			spacerCodicon.innerText = '\u00a0\u00a0';
			spacer.appendChild(spacerCodicon);
		} else {
			spacer.innerText = '\u00a0\u00a0';
		}
		cell.appendChild(spacer);

		let lineContent: string;
		if (item.modifiedLineNumber !== undefined) {
			let html: string | TrustedHTML = this._getLineHtml(modifiedModel, modifiedOptions, modifiedModelOpts.tabSize, item.modifiedLineNumber, this._languageService.languageIdCodec);
			if (AccessibleDiffViewer._ttPolicy) {
				html = AccessibleDiffViewer._ttPolicy.createHTML(html as string);
			}
			cell.insertAdjacentHTML('beforeend', html as string);
			lineContent = modifiedModel.getLineContent(item.modifiedLineNumber);
		} else {
			let html: string | TrustedHTML = this._getLineHtml(originalModel, originalOptions, originalModelOpts.tabSize, item.originalLineNumber, this._languageService.languageIdCodec);
			if (AccessibleDiffViewer._ttPolicy) {
				html = AccessibleDiffViewer._ttPolicy.createHTML(html as string);
			}
			cell.insertAdjacentHTML('beforeend', html as string);
			lineContent = originalModel.getLineContent(item.originalLineNumber);
		}

		if (lineContent.length === 0) {
			lineContent = localize('blankLine', "blank");
		}

		let ariaLabel: string = '';
		switch (item.type) {
			case LineType.Unchanged:
				if (item.originalLineNumber === item.modifiedLineNumber) {
					ariaLabel = localize({ key: 'unchangedLine', comment: ['The placeholders are contents of the line and should not be translated.'] }, "{0} unchanged line {1}", lineContent, item.originalLineNumber);
				} else {
					ariaLabel = localize('equalLine', "{0} original line {1} modified line {2}", lineContent, item.originalLineNumber, item.modifiedLineNumber);
				}
				break;
			case LineType.Added:
				ariaLabel = localize('insertLine', "+ {0} modified line {1}", lineContent, item.modifiedLineNumber);
				break;
			case LineType.Deleted:
				ariaLabel = localize('deleteLine', "- {0} original line {1}", lineContent, item.originalLineNumber);
				break;
		}
		row.setAttribute('aria-label', ariaLabel);

		return row;
	}

	private _getLineHtml(model: ITextModel, options: IComputedEditorOptions, tabSize: number, lineNumber: number, languageIdCodec: ILanguageIdCodec): string {
		const lineContent = model.getLineContent(lineNumber);
		const fontInfo = options.get(EditorOption.fontInfo);
		const lineTokens = LineTokens.createEmpty(lineContent, languageIdCodec);
		const isBasicASCII = ViewLineRenderingData.isBasicASCII(lineContent, model.mightContainNonBasicASCII());
		const containsRTL = ViewLineRenderingData.containsRTL(lineContent, isBasicASCII, model.mightContainRTL());
		const r = renderViewLine2(new RenderLineInput(
			(fontInfo.isMonospace && !options.get(EditorOption.disableMonospaceOptimizations)),
			fontInfo.canUseHalfwidthRightwardsArrow,
			lineContent,
			false,
			isBasicASCII,
			containsRTL,
			0,
			lineTokens,
			[],
			tabSize,
			0,
			fontInfo.spaceWidth,
			fontInfo.middotWidth,
			fontInfo.wsmiddotWidth,
			options.get(EditorOption.stopRenderingLineAfter),
			options.get(EditorOption.renderWhitespace),
			options.get(EditorOption.renderControlCharacters),
			options.get(EditorOption.fontLigatures) !== EditorFontLigatures.OFF,
			null
		));

		return r.html;
	}
}
