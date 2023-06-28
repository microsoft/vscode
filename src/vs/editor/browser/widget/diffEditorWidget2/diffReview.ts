/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Action } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { Constants } from 'vs/base/common/uint';
import { applyFontInfo } from 'vs/editor/browser/config/domFontInfo';
import { DiffEditorWidget2 } from 'vs/editor/browser/widget/diffEditorWidget2/diffEditorWidget2';
import { DiffReview } from 'vs/editor/browser/widget/diffReview';
import { EditorFontLigatures, EditorOption, IComputedEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { ILineChange } from 'vs/editor/common/diff/smartLinesDiffComputer';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { ILanguageIdCodec } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ITextModel, TextModelResolvedOptions } from 'vs/editor/common/model';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';
import { RenderLineInput, renderViewLine2 as renderViewLine } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { ViewLineRenderingData } from 'vs/editor/common/viewModel';
import * as nls from 'vs/nls';
import { AudioCue, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';

const DIFF_LINES_PADDING = 3;

const enum DiffEntryType {
	Equal = 0,
	Insert = 1,
	Delete = 2
}

class DiffEntry {
	readonly originalLineStart: number;
	readonly originalLineEnd: number;
	readonly modifiedLineStart: number;
	readonly modifiedLineEnd: number;

	constructor(originalLineStart: number, originalLineEnd: number, modifiedLineStart: number, modifiedLineEnd: number) {
		this.originalLineStart = originalLineStart;
		this.originalLineEnd = originalLineEnd;
		this.modifiedLineStart = modifiedLineStart;
		this.modifiedLineEnd = modifiedLineEnd;
	}

	public getType(): DiffEntryType {
		if (this.originalLineStart === 0) {
			return DiffEntryType.Insert;
		}
		if (this.modifiedLineStart === 0) {
			return DiffEntryType.Delete;
		}
		return DiffEntryType.Equal;
	}
}

const enum DiffEditorLineClasses {
	Insert = 'line-insert',
	Delete = 'line-delete'
}

class Diff {
	readonly entries: DiffEntry[];

	constructor(entries: DiffEntry[]) {
		this.entries = entries;
	}
}

const diffReviewInsertIcon = registerIcon('diff-review-insert', Codicon.add, nls.localize('diffReviewInsertIcon', 'Icon for \'Insert\' in diff review.'));
const diffReviewRemoveIcon = registerIcon('diff-review-remove', Codicon.remove, nls.localize('diffReviewRemoveIcon', 'Icon for \'Remove\' in diff review.'));
const diffReviewCloseIcon = registerIcon('diff-review-close', Codicon.close, nls.localize('diffReviewCloseIcon', 'Icon for \'Close\' in diff review.'));

export class DiffReview2 extends Disposable {

	private static _ttPolicy = DiffReview._ttPolicy; // TODO inline once DiffReview is deprecated.

	private readonly _diffEditor: DiffEditorWidget2;
	private _isVisible: boolean;
	public readonly shadow: FastDomNode<HTMLElement>;
	private readonly _actionBar: ActionBar;
	public readonly actionBarContainer: FastDomNode<HTMLElement>;
	public readonly domNode: FastDomNode<HTMLElement>;
	private readonly _content: FastDomNode<HTMLElement>;
	private readonly scrollbar: DomScrollableElement;
	private _diffs: Diff[];
	private _currentDiff: Diff | null;

	constructor(
		diffEditor: DiffEditorWidget2,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IAudioCueService private readonly _audioCueService: IAudioCueService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();
		this._diffEditor = diffEditor;
		this._isVisible = false;

		this.shadow = createFastDomNode(document.createElement('div'));
		this.shadow.setClassName('diff-review-shadow');

		this.actionBarContainer = createFastDomNode(document.createElement('div'));
		this.actionBarContainer.setClassName('diff-review-actions');
		this._actionBar = this._register(new ActionBar(
			this.actionBarContainer.domNode
		));

		this._actionBar.push(new Action('diffreview.close', nls.localize('label.close', "Close"), 'close-diff-review ' + ThemeIcon.asClassName(diffReviewCloseIcon), true, async () => this.hide()), { label: false, icon: true });

		this.domNode = createFastDomNode(document.createElement('div'));
		this.domNode.setClassName('diff-review monaco-editor-background');

		this._content = createFastDomNode(document.createElement('div'));
		this._content.setClassName('diff-review-content');
		this._content.setAttribute('role', 'code');
		this.scrollbar = this._register(new DomScrollableElement(this._content.domNode, {}));
		this.domNode.domNode.appendChild(this.scrollbar.getDomNode());

		this._register(diffEditor.onDidUpdateDiff(() => {
			if (!this._isVisible) {
				return;
			}
			this._diffs = this._compute();
			this._render();
		}));
		this._register(diffEditor.getModifiedEditor().onDidChangeCursorPosition(() => {
			if (!this._isVisible) {
				return;
			}
			this._render();
		}));
		this._register(dom.addStandardDisposableListener(this.domNode.domNode, 'click', (e) => {
			e.preventDefault();

			const row = dom.findParentWithClass(e.target, 'diff-review-row');
			if (row) {
				this._goToRow(row);
			}
		}));
		this._register(dom.addStandardDisposableListener(this.domNode.domNode, 'keydown', (e) => {
			if (
				e.equals(KeyCode.DownArrow)
				|| e.equals(KeyMod.CtrlCmd | KeyCode.DownArrow)
				|| e.equals(KeyMod.Alt | KeyCode.DownArrow)
			) {
				e.preventDefault();
				this._goToRow(this._getNextRow(), 'next');
			}

			if (
				e.equals(KeyCode.UpArrow)
				|| e.equals(KeyMod.CtrlCmd | KeyCode.UpArrow)
				|| e.equals(KeyMod.Alt | KeyCode.UpArrow)
			) {
				e.preventDefault();
				this._goToRow(this._getPrevRow(), 'previous');
			}

			if (
				e.equals(KeyCode.Escape)
				|| e.equals(KeyMod.CtrlCmd | KeyCode.Escape)
				|| e.equals(KeyMod.Alt | KeyCode.Escape)
				|| e.equals(KeyMod.Shift | KeyCode.Escape)
				|| e.equals(KeyCode.Space)
				|| e.equals(KeyCode.Enter)
			) {
				e.preventDefault();
				this.accept();
			}
		}));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('accessibility.verbosity.diffEditor')) {
				this._diffEditor.updateOptions({ accessibilityVerbose: this._configurationService.getValue('accessibility.verbosity.diffEditor') });
			}
		}));
		this._diffs = [];
		this._currentDiff = null;
	}

	public prev(): void {
		let index = 0;

		if (!this._isVisible) {
			this._diffs = this._compute();
		}

		if (this._isVisible) {
			let currentIndex = -1;
			for (let i = 0, len = this._diffs.length; i < len; i++) {
				if (this._diffs[i] === this._currentDiff) {
					currentIndex = i;
					break;
				}
			}
			index = (this._diffs.length + currentIndex - 1);
		} else {
			index = this._findDiffIndex(this._diffEditor.getPosition()!);
		}

		if (this._diffs.length === 0) {
			// Nothing to do
			return;
		}

		index = index % this._diffs.length;
		const entries = this._diffs[index].entries;
		this._diffEditor.setPosition(new Position(entries[0].modifiedLineStart, 1));
		this._diffEditor.setSelection({ startColumn: 1, startLineNumber: entries[0].modifiedLineStart, endColumn: Constants.MAX_SAFE_SMALL_INTEGER, endLineNumber: entries[entries.length - 1].modifiedLineEnd });
		this._isVisible = true;
		this.layout();
		this._render();
		this._goToRow(this._getPrevRow(), 'previous');
	}

	public next(): void {
		let index = 0;

		if (!this._isVisible) {
			this._diffs = this._compute();
		}

		if (this._isVisible) {
			let currentIndex = -1;
			for (let i = 0, len = this._diffs.length; i < len; i++) {
				if (this._diffs[i] === this._currentDiff) {
					currentIndex = i;
					break;
				}
			}
			index = (currentIndex + 1);
		} else {
			index = this._findDiffIndex(this._diffEditor.getPosition()!);
		}

		if (this._diffs.length === 0) {
			// Nothing to do
			return;
		}

		index = index % this._diffs.length;
		const entries = this._diffs[index].entries;
		this._diffEditor.setPosition(new Position(entries[0].modifiedLineStart, 1));
		this._diffEditor.setSelection({ startColumn: 1, startLineNumber: entries[0].modifiedLineStart, endColumn: Constants.MAX_SAFE_SMALL_INTEGER, endLineNumber: entries[entries.length - 1].modifiedLineEnd });
		this._isVisible = true;
		this.layout();
		this._render();
		this._goToRow(this._getNextRow(), 'next');
	}

	private accept(): void {
		let jumpToLineNumber = -1;
		const current = this._getCurrentFocusedRow();
		if (current) {
			const lineNumber = parseInt(current.getAttribute('data-line')!, 10);
			if (!isNaN(lineNumber)) {
				jumpToLineNumber = lineNumber;
			}
		}
		this.hide();

		if (jumpToLineNumber !== -1) {
			this._diffEditor.setPosition(new Position(jumpToLineNumber, 1));
			this._diffEditor.revealPosition(new Position(jumpToLineNumber, 1), ScrollType.Immediate);
		}
	}

	private hide(): void {
		this._isVisible = false;
		this._diffEditor.updateOptions({ readOnly: false });
		this._diffEditor.focus();
		this.layout();
		this._render();
	}

	private _getPrevRow(): HTMLElement {
		const current = this._getCurrentFocusedRow();
		if (!current) {
			return this._getFirstRow();
		}
		if (current.previousElementSibling) {
			return <HTMLElement>current.previousElementSibling;
		}
		return current;
	}

	private _getNextRow(): HTMLElement {
		const current = this._getCurrentFocusedRow();
		if (!current) {
			return this._getFirstRow();
		}
		if (current.nextElementSibling) {
			return <HTMLElement>current.nextElementSibling;
		}
		return current;
	}

	private _getFirstRow(): HTMLElement {
		return <HTMLElement>this.domNode.domNode.querySelector('.diff-review-row');
	}

	private _getCurrentFocusedRow(): HTMLElement | null {
		const result = <HTMLElement>document.activeElement;
		if (result && /diff-review-row/.test(result.className)) {
			return result;
		}
		return null;
	}

	private _goToRow(row: HTMLElement, type?: 'next' | 'previous'): void {
		const current = this._getCurrentFocusedRow();
		row.tabIndex = 0;
		row.focus();
		if (current && current !== row) {
			current.tabIndex = -1;
		}
		const element = !type ? current : type === 'next' ? current?.nextElementSibling : current?.previousElementSibling;
		if (element?.classList.contains(DiffEditorLineClasses.Insert)) {
			this._audioCueService.playAudioCue(AudioCue.diffLineInserted, true);
		} else if (element?.classList.contains(DiffEditorLineClasses.Delete)) {
			this._audioCueService.playAudioCue(AudioCue.diffLineDeleted, true);
		}
		this.scrollbar.scanDomNode();
	}

	public isVisible(): boolean {
		return this._isVisible;
	}

	private _width: number = 0;
	private _top: number = 0;
	private _height: number = 0;

	public layout(top: number = this._top, width: number = this._width, height: number = this._height): void {
		this._width = width;
		this._top = top;
		this._height = height;

		this.shadow.setTop(top - 6);
		this.shadow.setWidth(width);
		this.shadow.setHeight(this._isVisible ? 6 : 0);
		this.domNode.setTop(top);
		this.domNode.setWidth(width);
		this.domNode.setHeight(height);
		this._content.setHeight(height);
		this._content.setWidth(width);

		if (this._isVisible) {
			this.domNode.setDisplay('block');
			this.actionBarContainer.setAttribute('aria-hidden', 'false');
			this.actionBarContainer.setDisplay('block');
		} else {
			this.domNode.setDisplay('none');
			this.actionBarContainer.setAttribute('aria-hidden', 'true');
			this.actionBarContainer.setDisplay('none');
		}
	}

	private _compute(): Diff[] {
		const lineChanges = this._diffEditor.getLineChanges();
		if (!lineChanges || lineChanges.length === 0) {
			return [];
		}
		const originalModel = this._diffEditor.getOriginalEditor().getModel();
		const modifiedModel = this._diffEditor.getModifiedEditor().getModel();

		if (!originalModel || !modifiedModel) {
			return [];
		}

		return DiffReview2._mergeAdjacent(lineChanges, originalModel.getLineCount(), modifiedModel.getLineCount());
	}

	private static _mergeAdjacent(lineChanges: ILineChange[], originalLineCount: number, modifiedLineCount: number): Diff[] {
		if (!lineChanges || lineChanges.length === 0) {
			return [];
		}

		const diffs: Diff[] = [];
		let diffsLength = 0;

		for (let i = 0, len = lineChanges.length; i < len; i++) {
			const lineChange = lineChanges[i];

			const originalStart = lineChange.originalStartLineNumber;
			const originalEnd = lineChange.originalEndLineNumber;
			const modifiedStart = lineChange.modifiedStartLineNumber;
			const modifiedEnd = lineChange.modifiedEndLineNumber;

			const r: DiffEntry[] = [];
			let rLength = 0;

			// Emit before anchors
			{
				const originalEqualAbove = (originalEnd === 0 ? originalStart : originalStart - 1);
				const modifiedEqualAbove = (modifiedEnd === 0 ? modifiedStart : modifiedStart - 1);

				// Make sure we don't step into the previous diff
				let minOriginal = 1;
				let minModified = 1;
				if (i > 0) {
					const prevLineChange = lineChanges[i - 1];

					if (prevLineChange.originalEndLineNumber === 0) {
						minOriginal = prevLineChange.originalStartLineNumber + 1;
					} else {
						minOriginal = prevLineChange.originalEndLineNumber + 1;
					}

					if (prevLineChange.modifiedEndLineNumber === 0) {
						minModified = prevLineChange.modifiedStartLineNumber + 1;
					} else {
						minModified = prevLineChange.modifiedEndLineNumber + 1;
					}
				}

				let fromOriginal = originalEqualAbove - DIFF_LINES_PADDING + 1;
				let fromModified = modifiedEqualAbove - DIFF_LINES_PADDING + 1;
				if (fromOriginal < minOriginal) {
					const delta = minOriginal - fromOriginal;
					fromOriginal = fromOriginal + delta;
					fromModified = fromModified + delta;
				}
				if (fromModified < minModified) {
					const delta = minModified - fromModified;
					fromOriginal = fromOriginal + delta;
					fromModified = fromModified + delta;
				}

				r[rLength++] = new DiffEntry(
					fromOriginal, originalEqualAbove,
					fromModified, modifiedEqualAbove
				);
			}

			// Emit deleted lines
			{
				if (originalEnd !== 0) {
					r[rLength++] = new DiffEntry(originalStart, originalEnd, 0, 0);
				}
			}

			// Emit inserted lines
			{
				if (modifiedEnd !== 0) {
					r[rLength++] = new DiffEntry(0, 0, modifiedStart, modifiedEnd);
				}
			}

			// Emit after anchors
			{
				const originalEqualBelow = (originalEnd === 0 ? originalStart + 1 : originalEnd + 1);
				const modifiedEqualBelow = (modifiedEnd === 0 ? modifiedStart + 1 : modifiedEnd + 1);

				// Make sure we don't step into the next diff
				let maxOriginal = originalLineCount;
				let maxModified = modifiedLineCount;
				if (i + 1 < len) {
					const nextLineChange = lineChanges[i + 1];

					if (nextLineChange.originalEndLineNumber === 0) {
						maxOriginal = nextLineChange.originalStartLineNumber;
					} else {
						maxOriginal = nextLineChange.originalStartLineNumber - 1;
					}

					if (nextLineChange.modifiedEndLineNumber === 0) {
						maxModified = nextLineChange.modifiedStartLineNumber;
					} else {
						maxModified = nextLineChange.modifiedStartLineNumber - 1;
					}
				}

				let toOriginal = originalEqualBelow + DIFF_LINES_PADDING - 1;
				let toModified = modifiedEqualBelow + DIFF_LINES_PADDING - 1;

				if (toOriginal > maxOriginal) {
					const delta = maxOriginal - toOriginal;
					toOriginal = toOriginal + delta;
					toModified = toModified + delta;
				}
				if (toModified > maxModified) {
					const delta = maxModified - toModified;
					toOriginal = toOriginal + delta;
					toModified = toModified + delta;
				}

				r[rLength++] = new DiffEntry(
					originalEqualBelow, toOriginal,
					modifiedEqualBelow, toModified,
				);
			}

			diffs[diffsLength++] = new Diff(r);
		}

		// Merge adjacent diffs
		let curr: DiffEntry[] = diffs[0].entries;
		const r: Diff[] = [];
		let rLength = 0;
		for (let i = 1, len = diffs.length; i < len; i++) {
			const thisDiff = diffs[i].entries;

			const currLast = curr[curr.length - 1];
			const thisFirst = thisDiff[0];

			if (
				currLast.getType() === DiffEntryType.Equal
				&& thisFirst.getType() === DiffEntryType.Equal
				&& thisFirst.originalLineStart <= currLast.originalLineEnd
			) {
				// We are dealing with equal lines that overlap

				curr[curr.length - 1] = new DiffEntry(
					currLast.originalLineStart, thisFirst.originalLineEnd,
					currLast.modifiedLineStart, thisFirst.modifiedLineEnd
				);
				curr = curr.concat(thisDiff.slice(1));
				continue;
			}

			r[rLength++] = new Diff(curr);
			curr = thisDiff;
		}
		r[rLength++] = new Diff(curr);
		return r;
	}

	private _findDiffIndex(pos: Position): number {
		const lineNumber = pos.lineNumber;
		for (let i = 0, len = this._diffs.length; i < len; i++) {
			const diff = this._diffs[i].entries;
			const lastModifiedLine = diff[diff.length - 1].modifiedLineEnd;
			if (lineNumber <= lastModifiedLine) {
				return i;
			}
		}
		return 0;
	}

	private _render(): void {

		const originalOptions = this._diffEditor.getOriginalEditor().getOptions();
		const modifiedOptions = this._diffEditor.getModifiedEditor().getOptions();

		const originalModel = this._diffEditor.getOriginalEditor().getModel();
		const modifiedModel = this._diffEditor.getModifiedEditor().getModel();

		const originalModelOpts = originalModel!.getOptions();
		const modifiedModelOpts = modifiedModel!.getOptions();

		if (!this._isVisible || !originalModel || !modifiedModel) {
			dom.clearNode(this._content.domNode);
			this._currentDiff = null;
			this.scrollbar.scanDomNode();
			return;
		}

		this._diffEditor.updateOptions({ readOnly: true });
		const diffIndex = this._findDiffIndex(this._diffEditor.getPosition()!);

		if (this._diffs[diffIndex] === this._currentDiff) {
			return;
		}
		this._currentDiff = this._diffs[diffIndex];

		const diffs = this._diffs[diffIndex].entries;
		const container = document.createElement('div');
		container.className = 'diff-review-table';
		container.setAttribute('role', 'list');
		container.setAttribute('aria-label', 'Difference review. Use "Stage | Unstage | Revert Selected Ranges" commands');
		applyFontInfo(container, modifiedOptions.get(EditorOption.fontInfo));

		let minOriginalLine = 0;
		let maxOriginalLine = 0;
		let minModifiedLine = 0;
		let maxModifiedLine = 0;
		for (let i = 0, len = diffs.length; i < len; i++) {
			const diffEntry = diffs[i];
			const originalLineStart = diffEntry.originalLineStart;
			const originalLineEnd = diffEntry.originalLineEnd;
			const modifiedLineStart = diffEntry.modifiedLineStart;
			const modifiedLineEnd = diffEntry.modifiedLineEnd;

			if (originalLineStart !== 0 && ((minOriginalLine === 0 || originalLineStart < minOriginalLine))) {
				minOriginalLine = originalLineStart;
			}
			if (originalLineEnd !== 0 && ((maxOriginalLine === 0 || originalLineEnd > maxOriginalLine))) {
				maxOriginalLine = originalLineEnd;
			}
			if (modifiedLineStart !== 0 && ((minModifiedLine === 0 || modifiedLineStart < minModifiedLine))) {
				minModifiedLine = modifiedLineStart;
			}
			if (modifiedLineEnd !== 0 && ((maxModifiedLine === 0 || modifiedLineEnd > maxModifiedLine))) {
				maxModifiedLine = modifiedLineEnd;
			}
		}

		const header = document.createElement('div');
		header.className = 'diff-review-row';

		const cell = document.createElement('div');
		cell.className = 'diff-review-cell diff-review-summary';
		const originalChangedLinesCnt = maxOriginalLine - minOriginalLine + 1;
		const modifiedChangedLinesCnt = maxModifiedLine - minModifiedLine + 1;
		cell.appendChild(document.createTextNode(`${diffIndex + 1}/${this._diffs.length}: @@ -${minOriginalLine},${originalChangedLinesCnt} +${minModifiedLine},${modifiedChangedLinesCnt} @@`));
		header.setAttribute('data-line', String(minModifiedLine));

		const getAriaLines = (lines: number) => {
			if (lines === 0) {
				return nls.localize('no_lines_changed', "no lines changed");
			} else if (lines === 1) {
				return nls.localize('one_line_changed', "1 line changed");
			} else {
				return nls.localize('more_lines_changed', "{0} lines changed", lines);
			}
		};

		const originalChangedLinesCntAria = getAriaLines(originalChangedLinesCnt);
		const modifiedChangedLinesCntAria = getAriaLines(modifiedChangedLinesCnt);
		header.setAttribute('aria-label', nls.localize({
			key: 'header',
			comment: [
				'This is the ARIA label for a git diff header.',
				'A git diff header looks like this: @@ -154,12 +159,39 @@.',
				'That encodes that at original line 154 (which is now line 159), 12 lines were removed/changed with 39 lines.',
				'Variables 0 and 1 refer to the diff index out of total number of diffs.',
				'Variables 2 and 4 will be numbers (a line number).',
				'Variables 3 and 5 will be "no lines changed", "1 line changed" or "X lines changed", localized separately.'
			]
		}, "Difference {0} of {1}: original line {2}, {3}, modified line {4}, {5}", (diffIndex + 1), this._diffs.length, minOriginalLine, originalChangedLinesCntAria, minModifiedLine, modifiedChangedLinesCntAria));
		header.appendChild(cell);

		// @@ -504,7 +517,7 @@
		header.setAttribute('role', 'listitem');
		container.appendChild(header);

		const lineHeight = modifiedOptions.get(EditorOption.lineHeight);
		let modLine = minModifiedLine;
		for (let i = 0, len = diffs.length; i < len; i++) {
			const diffEntry = diffs[i];
			DiffReview2._renderSection(container, diffEntry, modLine, lineHeight, this._width, originalOptions, originalModel, originalModelOpts, modifiedOptions, modifiedModel, modifiedModelOpts, this._languageService.languageIdCodec);
			if (diffEntry.modifiedLineStart !== 0) {
				modLine = diffEntry.modifiedLineEnd;
			}
		}

		dom.clearNode(this._content.domNode);
		this._content.domNode.appendChild(container);
		this.scrollbar.scanDomNode();
	}

	private static _renderSection(
		dest: HTMLElement, diffEntry: DiffEntry, modLine: number, lineHeight: number, width: number,
		originalOptions: IComputedEditorOptions, originalModel: ITextModel, originalModelOpts: TextModelResolvedOptions,
		modifiedOptions: IComputedEditorOptions, modifiedModel: ITextModel, modifiedModelOpts: TextModelResolvedOptions,
		languageIdCodec: ILanguageIdCodec
	): void {

		const type = diffEntry.getType();

		let rowClassName: string = 'diff-review-row';
		let lineNumbersExtraClassName: string = '';
		const spacerClassName: string = 'diff-review-spacer';
		let spacerIcon: ThemeIcon | null = null;
		switch (type) {
			case DiffEntryType.Insert:
				rowClassName = 'diff-review-row line-insert';
				lineNumbersExtraClassName = ' char-insert';
				spacerIcon = diffReviewInsertIcon;
				break;
			case DiffEntryType.Delete:
				rowClassName = 'diff-review-row line-delete';
				lineNumbersExtraClassName = ' char-delete';
				spacerIcon = diffReviewRemoveIcon;
				break;
		}

		const originalLineStart = diffEntry.originalLineStart;
		const originalLineEnd = diffEntry.originalLineEnd;
		const modifiedLineStart = diffEntry.modifiedLineStart;
		const modifiedLineEnd = diffEntry.modifiedLineEnd;

		const cnt = Math.max(
			modifiedLineEnd - modifiedLineStart,
			originalLineEnd - originalLineStart
		);

		const originalLayoutInfo = originalOptions.get(EditorOption.layoutInfo);
		const originalLineNumbersWidth = originalLayoutInfo.glyphMarginWidth + originalLayoutInfo.lineNumbersWidth;

		const modifiedLayoutInfo = modifiedOptions.get(EditorOption.layoutInfo);
		const modifiedLineNumbersWidth = 10 + modifiedLayoutInfo.glyphMarginWidth + modifiedLayoutInfo.lineNumbersWidth;

		for (let i = 0; i <= cnt; i++) {
			const originalLine = (originalLineStart === 0 ? 0 : originalLineStart + i);
			const modifiedLine = (modifiedLineStart === 0 ? 0 : modifiedLineStart + i);

			const row = document.createElement('div');
			row.style.minWidth = width + 'px';
			row.className = rowClassName;
			row.setAttribute('role', 'listitem');
			if (modifiedLine !== 0) {
				modLine = modifiedLine;
			}
			row.setAttribute('data-line', String(modLine));

			const cell = document.createElement('div');
			cell.className = 'diff-review-cell';
			cell.style.height = `${lineHeight}px`;
			row.appendChild(cell);

			const originalLineNumber = document.createElement('span');
			originalLineNumber.style.width = (originalLineNumbersWidth + 'px');
			originalLineNumber.style.minWidth = (originalLineNumbersWidth + 'px');
			originalLineNumber.className = 'diff-review-line-number' + lineNumbersExtraClassName;
			if (originalLine !== 0) {
				originalLineNumber.appendChild(document.createTextNode(String(originalLine)));
			} else {
				originalLineNumber.innerText = '\u00a0';
			}
			cell.appendChild(originalLineNumber);

			const modifiedLineNumber = document.createElement('span');
			modifiedLineNumber.style.width = (modifiedLineNumbersWidth + 'px');
			modifiedLineNumber.style.minWidth = (modifiedLineNumbersWidth + 'px');
			modifiedLineNumber.style.paddingRight = '10px';
			modifiedLineNumber.className = 'diff-review-line-number' + lineNumbersExtraClassName;
			if (modifiedLine !== 0) {
				modifiedLineNumber.appendChild(document.createTextNode(String(modifiedLine)));
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
			if (modifiedLine !== 0) {
				let html: string | TrustedHTML = this._renderLine(modifiedModel, modifiedOptions, modifiedModelOpts.tabSize, modifiedLine, languageIdCodec);
				if (DiffReview2._ttPolicy) {
					html = DiffReview2._ttPolicy.createHTML(html as string);
				}
				cell.insertAdjacentHTML('beforeend', html as string);
				lineContent = modifiedModel.getLineContent(modifiedLine);
			} else {
				let html: string | TrustedHTML = this._renderLine(originalModel, originalOptions, originalModelOpts.tabSize, originalLine, languageIdCodec);
				if (DiffReview2._ttPolicy) {
					html = DiffReview2._ttPolicy.createHTML(html as string);
				}
				cell.insertAdjacentHTML('beforeend', html as string);
				lineContent = originalModel.getLineContent(originalLine);
			}

			if (lineContent.length === 0) {
				lineContent = nls.localize('blankLine', "blank");
			}

			let ariaLabel: string = '';
			switch (type) {
				case DiffEntryType.Equal:
					if (originalLine === modifiedLine) {
						ariaLabel = nls.localize({ key: 'unchangedLine', comment: ['The placeholders are contents of the line and should not be translated.'] }, "{0} unchanged line {1}", lineContent, originalLine);
					} else {
						ariaLabel = nls.localize('equalLine', "{0} original line {1} modified line {2}", lineContent, originalLine, modifiedLine);
					}
					break;
				case DiffEntryType.Insert:
					ariaLabel = nls.localize('insertLine', "+ {0} modified line {1}", lineContent, modifiedLine);
					break;
				case DiffEntryType.Delete:
					ariaLabel = nls.localize('deleteLine', "- {0} original line {1}", lineContent, originalLine);
					break;
			}
			row.setAttribute('aria-label', ariaLabel);

			dest.appendChild(row);
		}
	}

	private static _renderLine(model: ITextModel, options: IComputedEditorOptions, tabSize: number, lineNumber: number, languageIdCodec: ILanguageIdCodec): string {
		const lineContent = model.getLineContent(lineNumber);
		const fontInfo = options.get(EditorOption.fontInfo);
		const lineTokens = LineTokens.createEmpty(lineContent, languageIdCodec);
		const isBasicASCII = ViewLineRenderingData.isBasicASCII(lineContent, model.mightContainNonBasicASCII());
		const containsRTL = ViewLineRenderingData.containsRTL(lineContent, isBasicASCII, model.mightContainRTL());
		const r = renderViewLine(new RenderLineInput(
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
