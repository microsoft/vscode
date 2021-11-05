/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./unicodeHighlighter';

import { RunOnceScheduler } from 'vs/base/common/async';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IModelDecoration, IModelDeltaDecoration, ITextModel, MinimapPosition, OverviewRulerLane, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { minimapFindMatch, overviewRulerFindMatchForeground } from 'vs/platform/theme/common/colorRegistry';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { HoverAnchor, HoverAnchorType, IEditorHover, IEditorHoverParticipant, IEditorHoverStatusBar, IHoverPart } from 'vs/editor/contrib/hover/hoverTypes';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { MarkdownHover, renderMarkdownHovers } from 'vs/editor/contrib/hover/markdownHoverParticipant';
import * as strings from 'vs/base/common/strings';
import { Constants } from 'vs/base/common/uint';
import { UnicodeCharacterSearcher, UnicodeCharacterSearchType } from 'vs/editor/common/modes/unicodeCharactersSearcher';

export class UnicodeHighlighter extends Disposable implements IEditorContribution {
	public static readonly ID = 'editor.contrib.unicodeHighlighter';

	private _highlighter: DocumentUnicodeHighlighter | ViewportUnicodeHighlighter | null = null;

	constructor(
		private readonly _editor: ICodeEditor,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
	) {
		super();

		this._register(this._editor.onDidChangeModel(() => {
			this._ensureHighlighter();
		}));

		this._ensureHighlighter();
	}

	public override dispose(): void {
		if (this._highlighter) {
			this._highlighter.dispose();
			this._highlighter = null;
		}
		super.dispose();
	}

	private _ensureHighlighter(): void {
		if (this._highlighter) {
			this._highlighter.dispose();
			this._highlighter = null;
		}
		if (!this._editor.hasModel()) {
			return;
		}

		if (this._editorWorkerService.canFindUnicodeCharacters(this._editor.getModel().uri)) {
			this._highlighter = new DocumentUnicodeHighlighter(this._editor, this._editorWorkerService);
		} else {
			this._highlighter = new ViewportUnicodeHighlighter(this._editor);
		}
	}
}

class DocumentUnicodeHighlighter extends Disposable {

	private readonly _model: ITextModel = this._editor.getModel();
	private readonly _updateSoon: RunOnceScheduler;
	private _decorationIds: string[];

	constructor(
		private readonly _editor: IActiveCodeEditor,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
	) {
		super();
		this._updateSoon = this._register(new RunOnceScheduler(() => this._update(), 250));
		this._decorationIds = [];

		this._register(this._editor.onDidChangeModelContent(() => {
			this._updateSoon.schedule();
		}));

		this._updateSoon.schedule();
	}

	public override dispose() {
		this._decorationIds = this._model.deltaDecorations(this._decorationIds, []);
		super.dispose();
	}

	private _update(): void {
		const modelVersionId = this._model.getVersionId();
		this._editorWorkerService.findUnicodeCharacters(this._model.uri, UnicodeCharacterSearchType.NonASCII).then((ranges) => {
			if (this._model.getVersionId() !== modelVersionId) {
				// model changed in the meantime
				return;
			}
			const decorations: IModelDeltaDecoration[] = [];
			for (const range of ranges) {
				decorations.push({ range: range, options: DECORATION });
			}
			this._decorationIds = this._editor.deltaDecorations(this._decorationIds, decorations);
		});
	}
}

class ViewportUnicodeHighlighter extends Disposable {

	private readonly _model: ITextModel = this._editor.getModel();
	private readonly _updateSoon: RunOnceScheduler;
	private _decorationIds: string[];

	constructor(
		private readonly _editor: IActiveCodeEditor,
	) {
		super();

		this._updateSoon = this._register(new RunOnceScheduler(() => this._update(), 250));
		this._decorationIds = [];

		this._register(this._editor.onDidLayoutChange(() => {
			this._updateSoon.schedule();
		}));
		this._register(this._editor.onDidScrollChange(() => {
			this._updateSoon.schedule();
		}));
		this._register(this._editor.onDidChangeHiddenAreas(() => {
			this._updateSoon.schedule();
		}));
		this._register(this._editor.onDidChangeModelContent(() => {
			this._updateSoon.schedule();
		}));

		this._updateSoon.schedule();
	}

	public override dispose() {
		this._decorationIds = this._model.deltaDecorations(this._decorationIds, []);
		super.dispose();
	}

	private _update(): void {
		const ranges = this._editor.getVisibleRanges();
		const decorations: IModelDeltaDecoration[] = [];
		for (const range of ranges) {
			const matches = this._model.findMatches(UnicodeCharacterSearcher.ASCII_REGEX, range, true, false, null, false);
			for (const match of matches) {
				decorations.push({ range: match.range, options: DECORATION });
			}
		}
		this._decorationIds = this._editor.deltaDecorations(this._decorationIds, decorations);
	}
}

export class UnicodeHighlighterHover implements IHoverPart {
	constructor(
		public readonly owner: IEditorHoverParticipant<UnicodeHighlighterHover>,
		public readonly range: Range,
		public readonly decoration: IModelDecoration
	) { }

	public isValidForHoverAnchor(anchor: HoverAnchor): boolean {
		return (
			anchor.type === HoverAnchorType.Range
			&& this.range.startColumn <= anchor.range.startColumn
			&& this.range.endColumn >= anchor.range.endColumn
		);
	}
}

export class UnicodeHighlighterHoverParticipant implements IEditorHoverParticipant<MarkdownHover> {

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _hover: IEditorHover,
		@IModeService private readonly _modeService: IModeService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
	}

	computeSync(anchor: HoverAnchor, lineDecorations: IModelDecoration[]): MarkdownHover[] {
		if (!this._editor.hasModel() || anchor.type !== HoverAnchorType.Range) {
			return [];
		}

		const model = this._editor.getModel();
		const lineNumber = anchor.range.startLineNumber;
		const maxColumn = model.getLineMaxColumn(lineNumber);

		const result: MarkdownHover[] = [];
		for (const d of lineDecorations) {
			if (d.options.className !== 'unicode-highlight') {
				continue;
			}
			const startColumn = (d.range.startLineNumber === lineNumber) ? d.range.startColumn : 1;
			const endColumn = (d.range.endLineNumber === lineNumber) ? d.range.endColumn : maxColumn;
			const range = new Range(anchor.range.startLineNumber, startColumn, anchor.range.startLineNumber, endColumn);
			const text = model.getValueInRange(d.range);

			let codepoints: string[] = [];
			for (let i = 0, len = text.length; i < len;) {
				const nextCodePoint = strings.getNextCodePoint(text, len, i);
				codepoints.push(`U+${nextCodePoint.toString(16)}`);
				i += (nextCodePoint >= Constants.UNICODE_SUPPLEMENTARY_PLANE_BEGIN ? 2 : 1);
			}

			const contents = [{
				value: `This string is special: \`${codepoints.join(', ')}\``
			}];
			result.push(new MarkdownHover(this, range, contents));
		}
		return result;
	}

	public renderHoverParts(hoverParts: MarkdownHover[], fragment: DocumentFragment, statusBar: IEditorHoverStatusBar): IDisposable {
		return renderMarkdownHovers(hoverParts, fragment, this._editor, this._hover, this._modeService, this._openerService);
	}
}

const DECORATION = ModelDecorationOptions.register({
	description: 'unicode-highlight',
	stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
	className: 'unicode-highlight',
	showIfCollapsed: true,
	overviewRuler: {
		color: themeColorFromId(overviewRulerFindMatchForeground),
		position: OverviewRulerLane.Center
	},
	minimap: {
		color: themeColorFromId(minimapFindMatch),
		position: MinimapPosition.Inline
	}
});

registerEditorContribution(UnicodeHighlighter.ID, UnicodeHighlighter);
