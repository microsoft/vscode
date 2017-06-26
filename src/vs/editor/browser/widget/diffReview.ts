/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/diffReview';
import { Disposable } from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { renderViewLine, RenderLineInput } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { ViewLineToken } from 'vs/editor/common/core/viewLineToken';
import { Configuration } from 'vs/editor/browser/config/configuration';
import { Position } from 'vs/editor/common/core/position';
import { ColorId, MetadataConsts, FontStyle } from 'vs/editor/common/modes';
import * as editorOptions from 'vs/editor/common/config/editorOptions';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { scrollbarShadow } from 'vs/platform/theme/common/colorRegistry';
import { DiffEditorWidget } from "vs/editor/browser/widget/diffEditorWidget";
import { DomScrollableElement } from "vs/base/browser/ui/scrollbar/scrollableElement";
import { editorLineNumbers } from "vs/editor/common/view/editorColorRegistry";

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

class Diff {
	readonly entries: DiffEntry[];

	constructor(entries: DiffEntry[]) {
		this.entries = entries;
	}
}

export class DiffReview extends Disposable {

	private readonly _diffEditor: DiffEditorWidget;
	private readonly _isVisible: boolean;
	public readonly shadow: FastDomNode<HTMLElement>;
	public readonly domNode: FastDomNode<HTMLElement>;
	private readonly _content: FastDomNode<HTMLElement>;
	private readonly scrollbar: DomScrollableElement;
	private _diffs: Diff[];

	constructor(diffEditor: DiffEditorWidget) {
		super();
		this._diffEditor = diffEditor;
		this._isVisible = false;

		this.shadow = createFastDomNode(document.createElement('div'));
		this.shadow.setClassName('diff-review-shadow');

		this.domNode = createFastDomNode(document.createElement('div'));
		this.domNode.setClassName('diff-review monaco-editor-background');

		this._content = createFastDomNode(document.createElement('div'));
		this.scrollbar = this._register(new DomScrollableElement(this._content.domNode, {}));
		this.domNode.domNode.appendChild(this.scrollbar.getDomNode());

		diffEditor.onDidUpdateDiff(() => {
			if (!this._isVisible) {
				return;
			}
			this._diffs = this._compute();
			this._render();
		});
		this._diffs = [];
	}

	public isVisible(): boolean {
		return this._isVisible;
	}

	public layout(top: number, width: number, height: number): void {
		this.shadow.setTop(top - 6);
		this.shadow.setWidth(width);
		this.shadow.setHeight(this._isVisible ? 6 : 0);
		this.domNode.setTop(top);
		this.domNode.setWidth(width);
		this.domNode.setHeight(height);
		this._content.setHeight(height);
		this._content.setWidth(width);
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

		return DiffReview._mergeAdjacent(lineChanges, originalModel.getLineCount(), modifiedModel.getLineCount());
	}

	private static _mergeAdjacent(lineChanges: editorCommon.ILineChange[], originalLineCount: number, modifiedLineCount: number): Diff[] {
		if (!lineChanges || lineChanges.length === 0) {
			return [];
		}

		let diffs: Diff[] = [], diffsLength = 0;

		for (let i = 0, len = lineChanges.length; i < len; i++) {
			const lineChange = lineChanges[i];

			const originalStart = lineChange.originalStartLineNumber;
			const originalEnd = lineChange.originalEndLineNumber;
			const modifiedStart = lineChange.modifiedStartLineNumber;
			const modifiedEnd = lineChange.modifiedEndLineNumber;

			let r: DiffEntry[] = [], rLength = 0;

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
		let r: Diff[] = [], rLength = 0;
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

	private _render(): void {
		const pos = this._diffEditor.getPosition();
		if (!pos) {
			return;
		}

		this._doRender2(this._findDiffIndex(pos));
		return;
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

	private _doRender2(index: number): void {
		const lines = this._diffs[index].entries;
		const originalModel = this._diffEditor.getOriginalEditor().getModel();
		const modifiedModel = this._diffEditor.getModifiedEditor().getModel();

		this._doRender3(lines, originalModel, modifiedModel);
	}

	private _doRender3(diffs: DiffEntry[], originalModel: editorCommon.IModel, modifiedModel: editorCommon.IModel): void {
		const originalOpts = this._diffEditor.getOriginalEditor().getConfiguration();
		const modifiedOpts = this._diffEditor.getModifiedEditor().getConfiguration();

		const originalModelOpts = originalModel.getOptions();
		const modifiedModelOpts = modifiedModel.getOptions();

		let table = document.createElement('table');
		Configuration.applyFontInfoSlow(table, modifiedOpts.fontInfo);

		let tbody = document.createElement('tbody');
		table.appendChild(tbody);

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

		let headRow = document.createElement('tr');
		let header = document.createElement('th');
		header.colSpan = 3;
		// @@ -504,7 +517,7 @@
		header.appendChild(document.createTextNode(`@@ -${minOriginalLine},${maxOriginalLine - minOriginalLine + 1}, +${minModifiedLine},${maxModifiedLine - minModifiedLine + 1} @@`));
		headRow.appendChild(header);

		tbody.appendChild(headRow);

		for (let i = 0, len = diffs.length; i < len; i++) {
			const diffEntry = diffs[i];
			DiffReview._renderSection(tbody, diffEntry, originalOpts, originalModel, originalModelOpts, modifiedOpts, modifiedModel, modifiedModelOpts);
		}

		dom.clearNode(this._content.domNode);
		this._content.domNode.appendChild(table);
		this.scrollbar.scanDomNode();
	}

	private static _renderSection(
		dest: HTMLElement, diffEntry: DiffEntry,
		originalOpts: editorOptions.InternalEditorOptions, originalModel: editorCommon.IModel, originalModelOpts: editorCommon.TextModelResolvedOptions,
		modifiedOpts: editorOptions.InternalEditorOptions, modifiedModel: editorCommon.IModel, modifiedModelOpts: editorCommon.TextModelResolvedOptions
	): void {

		let rowClassName: string = '';
		let lineNumbersExtraClassName: string = '';
		let spacerClassName: string = 'diff-review-spacer';
		switch (diffEntry.getType()) {
			case DiffEntryType.Insert:
				rowClassName = 'line-insert';
				lineNumbersExtraClassName = ' char-insert';
				spacerClassName = 'diff-review-spacer insert-sign';
				break;
			case DiffEntryType.Delete:
				rowClassName = 'line-delete';
				lineNumbersExtraClassName = ' char-delete';
				spacerClassName = 'diff-review-spacer delete-sign';
		}

		const originalLineStart = diffEntry.originalLineStart;
		const originalLineEnd = diffEntry.originalLineEnd;
		const modifiedLineStart = diffEntry.modifiedLineStart;
		const modifiedLineEnd = diffEntry.modifiedLineEnd;

		const cnt = Math.max(
			modifiedLineEnd - modifiedLineStart,
			originalLineEnd - originalLineStart
		);

		for (let i = 0; i <= cnt; i++) {
			const originalLine = (originalLineStart === 0 ? 0 : originalLineStart + i);
			const modifiedLine = (modifiedLineStart === 0 ? 0 : modifiedLineStart + i);

			const tr = document.createElement('tr');
			tr.className = rowClassName;

			const tdOriginalLineNumber = document.createElement('td');
			tdOriginalLineNumber.style.width = (originalOpts.layoutInfo.lineNumbersWidth + 'px');
			tdOriginalLineNumber.style.minWidth = (originalOpts.layoutInfo.lineNumbersWidth + 'px');
			tdOriginalLineNumber.className = 'diff-review-line-number' + lineNumbersExtraClassName;
			if (originalLine !== 0) {
				tdOriginalLineNumber.appendChild(document.createTextNode(String(originalLine)));
			}
			tr.appendChild(tdOriginalLineNumber);

			const tdModifiedLineNumber = document.createElement('td');
			tdModifiedLineNumber.style.width = (10 + modifiedOpts.layoutInfo.lineNumbersWidth + 'px');
			tdModifiedLineNumber.style.minWidth = (modifiedOpts.layoutInfo.lineNumbersWidth + 'px');
			tdModifiedLineNumber.style.paddingRight = '10px';
			tdModifiedLineNumber.className = 'diff-review-line-number' + lineNumbersExtraClassName;
			if (modifiedLine !== 0) {
				tdModifiedLineNumber.appendChild(document.createTextNode(String(modifiedLine)));
			}
			tr.appendChild(tdModifiedLineNumber);

			const tdContent = document.createElement('td');
			tdContent.className = 'diff-review-content';

			const spacer = document.createElement('span');
			spacer.className = spacerClassName;
			spacer.innerHTML = '&nbsp;&nbsp;';
			tdContent.appendChild(spacer);

			if (modifiedLine !== 0) {
				tdContent.insertAdjacentHTML('beforeend',
					this._renderLine(modifiedModel, modifiedOpts, modifiedModelOpts.tabSize, modifiedLine)
				);
			} else {
				tdContent.insertAdjacentHTML('beforeend',
					this._renderLine(originalModel, originalOpts, originalModelOpts.tabSize, originalLine)
				);
			}
			tr.appendChild(tdContent);
			dest.appendChild(tr);
		}
	}

	private static _renderLine(model: editorCommon.IModel, config: editorOptions.InternalEditorOptions, tabSize: number, lineNumber: number): string {
		const lineContent = model.getLineContent(lineNumber);

		const defaultMetadata = (
			(FontStyle.None << MetadataConsts.FONT_STYLE_OFFSET)
			| (ColorId.DefaultForeground << MetadataConsts.FOREGROUND_OFFSET)
			| (ColorId.DefaultBackground << MetadataConsts.BACKGROUND_OFFSET)
		) >>> 0;

		const r = renderViewLine(new RenderLineInput(
			(config.fontInfo.isMonospace && !config.viewInfo.disableMonospaceOptimizations),
			lineContent,
			model.mightContainRTL(),
			0,
			[new ViewLineToken(lineContent.length, defaultMetadata)],
			[],
			tabSize,
			config.fontInfo.spaceWidth,
			config.viewInfo.stopRenderingLineAfter,
			config.viewInfo.renderWhitespace,
			config.viewInfo.renderControlCharacters,
			config.viewInfo.fontLigatures
		));

		return r.html;
	}
}

// theming

registerThemingParticipant((theme, collector) => {
	let lineNumbers = theme.getColor(editorLineNumbers);
	if (lineNumbers) {
		collector.addRule(`.monaco-diff-editor .diff-review-line-number { color: ${lineNumbers}; }`);
	}

	const shadow = theme.getColor(scrollbarShadow);
	if (shadow) {
		collector.addRule(`.monaco-diff-editor .diff-review-shadow { box-shadow: ${shadow} 0 -6px 6px -6px inset; }`);
	}
});
