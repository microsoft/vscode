/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';

import { sequence, asWinJsPromise } from 'vs/base/common/async';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { registerEditorContribution, EditorAction, IActionOptions, registerEditorAction, registerDefaultLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { DocumentHighlight, DocumentHighlightKind, DocumentHighlightProviderRegistry } from 'vs/editor/common/modes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Position } from 'vs/editor/common/core/position';
import { registerColor, editorSelectionHighlight, overviewRulerSelectionHighlightForeground, activeContrastBorder, editorSelectionHighlightBorder } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant, themeColorFromId } from 'vs/platform/theme/common/themeService';
import { CursorChangeReason, ICursorPositionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { firstIndex } from 'vs/base/common/arrays';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ITextModel, TrackedRangeStickiness, OverviewRulerLane, IModelDeltaDecoration } from 'vs/editor/common/model';

export const editorWordHighlight = registerColor('editor.wordHighlightBackground', { dark: '#575757B8', light: '#57575740', hc: null }, nls.localize('wordHighlight', 'Background color of a symbol during read-access, like reading a variable. The color must not be opaque to not hide underlying decorations.'), true);
export const editorWordHighlightStrong = registerColor('editor.wordHighlightStrongBackground', { dark: '#004972B8', light: '#0e639c40', hc: null }, nls.localize('wordHighlightStrong', 'Background color of a symbol during write-access, like writing to a variable. The color must not be opaque to not hide underlying decorations.'), true);
export const editorWordHighlightBorder = registerColor('editor.wordHighlightBorder', { light: null, dark: null, hc: activeContrastBorder }, nls.localize('wordHighlightBorder', 'Border color of a symbol during read-access, like reading a variable.'));
export const editorWordHighlightStrongBorder = registerColor('editor.wordHighlightStrongBorder', { light: null, dark: null, hc: activeContrastBorder }, nls.localize('wordHighlightStrongBorder', 'Border color of a symbol during write-access, like writing to a variable.'));

export const overviewRulerWordHighlightForeground = registerColor('editorOverviewRuler.wordHighlightForeground', { dark: '#A0A0A0CC', light: '#A0A0A0CC', hc: '#A0A0A0CC' }, nls.localize('overviewRulerWordHighlightForeground', 'Overview ruler marker color for symbol highlights. The color must not be opaque to not hide underlying decorations.'), true);
export const overviewRulerWordHighlightStrongForeground = registerColor('editorOverviewRuler.wordHighlightStrongForeground', { dark: '#C0A0C0CC', light: '#C0A0C0CC', hc: '#C0A0C0CC' }, nls.localize('overviewRulerWordHighlightStrongForeground', 'Overview ruler marker color for write-access symbol highlights. The color must not be opaque to not hide underlying decorations.'), true);

export const ctxHasWordHighlights = new RawContextKey<boolean>('hasWordHighlights', false);

export function getOccurrencesAtPosition(model: ITextModel, position: Position): TPromise<DocumentHighlight[]> {

	const orderedByScore = DocumentHighlightProviderRegistry.ordered(model);
	let foundResult = false;

	// in order of score ask the occurrences provider
	// until someone response with a good result
	// (good = none empty array)
	return sequence(orderedByScore.map(provider => {
		return (): TPromise<DocumentHighlight[]> => {
			if (!foundResult) {
				return asWinJsPromise((token) => {
					return provider.provideDocumentHighlights(model, position, token);
				}).then(data => {
					if (Array.isArray(data) && data.length > 0) {
						foundResult = true;
						return data;
					}
					return undefined;
				}, err => {
					onUnexpectedExternalError(err);
					return undefined;
				});
			}
			return undefined;
		};
	})).then(values => {
		return values[0];
	});
}

registerDefaultLanguageCommand('_executeDocumentHighlights', getOccurrencesAtPosition);

class WordHighlighter {

	private editor: ICodeEditor;
	private occurrencesHighlight: boolean;
	private model: ITextModel;
	private _lastWordRange: Range;
	private _decorationIds: string[];
	private toUnhook: IDisposable[];

	private workerRequestTokenId: number = 0;
	private workerRequest: TPromise<DocumentHighlight[]> = null;
	private workerRequestCompleted: boolean = false;
	private workerRequestValue: DocumentHighlight[] = [];

	private lastCursorPositionChangeTime: number = 0;
	private renderDecorationsTimer: number = -1;

	private _hasWordHighlights: IContextKey<boolean>;
	private _ignorePositionChangeEvent: boolean;

	constructor(editor: ICodeEditor, contextKeyService: IContextKeyService) {
		this.editor = editor;
		this._hasWordHighlights = ctxHasWordHighlights.bindTo(contextKeyService);
		this._ignorePositionChangeEvent = false;
		this.occurrencesHighlight = this.editor.getConfiguration().contribInfo.occurrencesHighlight;
		this.model = this.editor.getModel();
		this.toUnhook = [];
		this.toUnhook.push(editor.onDidChangeCursorPosition((e: ICursorPositionChangedEvent) => {

			if (this._ignorePositionChangeEvent) {
				// We are changing the position => ignore this event
				return;
			}

			if (!this.occurrencesHighlight) {
				// Early exit if nothing needs to be done!
				// Leave some form of early exit check here if you wish to continue being a cursor position change listener ;)
				return;
			}

			this._onPositionChanged(e);
		}));
		this.toUnhook.push(editor.onDidChangeModel((e) => {
			this._stopAll();
			this.model = this.editor.getModel();
		}));
		this.toUnhook.push(editor.onDidChangeModelContent((e) => {
			this._stopAll();
		}));
		this.toUnhook.push(editor.onDidChangeConfiguration((e) => {
			let newValue = this.editor.getConfiguration().contribInfo.occurrencesHighlight;
			if (this.occurrencesHighlight !== newValue) {
				this.occurrencesHighlight = newValue;
				this._stopAll();
			}
		}));

		this._lastWordRange = null;
		this._decorationIds = [];
		this.workerRequestTokenId = 0;
		this.workerRequest = null;
		this.workerRequestCompleted = false;

		this.lastCursorPositionChangeTime = 0;
		this.renderDecorationsTimer = -1;
	}

	public hasDecorations(): boolean {
		return (this._decorationIds.length > 0);
	}

	public restore(): void {
		if (!this.occurrencesHighlight) {
			return;
		}
		this._run();
	}

	private _getSortedHighlights(): Range[] {
		return this._decorationIds
			.map((id) => this.model.getDecorationRange(id))
			.sort(Range.compareRangesUsingStarts);
	}

	public moveNext() {
		let highlights = this._getSortedHighlights();
		let index = firstIndex(highlights, (range) => range.containsPosition(this.editor.getPosition()));
		let newIndex = ((index + 1) % highlights.length);
		let dest = highlights[newIndex];
		try {
			this._ignorePositionChangeEvent = true;
			this.editor.setPosition(dest.getStartPosition());
			this.editor.revealRangeInCenterIfOutsideViewport(dest);
		} finally {
			this._ignorePositionChangeEvent = false;
		}
	}

	public moveBack() {
		let highlights = this._getSortedHighlights();
		let index = firstIndex(highlights, (range) => range.containsPosition(this.editor.getPosition()));
		let newIndex = ((index - 1 + highlights.length) % highlights.length);
		let dest = highlights[newIndex];
		try {
			this._ignorePositionChangeEvent = true;
			this.editor.setPosition(dest.getStartPosition());
			this.editor.revealRangeInCenterIfOutsideViewport(dest);
		} finally {
			this._ignorePositionChangeEvent = false;
		}
	}

	private _removeDecorations(): void {
		if (this._decorationIds.length > 0) {
			// remove decorations
			this._decorationIds = this.editor.deltaDecorations(this._decorationIds, []);
			this._hasWordHighlights.set(false);
		}
	}

	private _stopAll(): void {
		this._lastWordRange = null;

		// Remove any existing decorations
		this._removeDecorations();

		// Cancel any renderDecorationsTimer
		if (this.renderDecorationsTimer !== -1) {
			clearTimeout(this.renderDecorationsTimer);
			this.renderDecorationsTimer = -1;
		}

		// Cancel any worker request
		if (this.workerRequest !== null) {
			this.workerRequest.cancel();
			this.workerRequest = null;
		}

		// Invalidate any worker request callback
		if (!this.workerRequestCompleted) {
			this.workerRequestTokenId++;
			this.workerRequestCompleted = true;
		}
	}

	private _onPositionChanged(e: ICursorPositionChangedEvent): void {

		// disabled
		if (!this.occurrencesHighlight) {
			this._stopAll();
			return;
		}

		// ignore typing & other
		if (e.reason !== CursorChangeReason.Explicit) {
			this._stopAll();
			return;
		}

		this._run();
	}

	private _run(): void {
		// no providers for this model
		if (!DocumentHighlightProviderRegistry.has(this.model)) {
			this._stopAll();
			return;
		}

		var editorSelection = this.editor.getSelection();

		// ignore multiline selection
		if (editorSelection.startLineNumber !== editorSelection.endLineNumber) {
			this._stopAll();
			return;
		}

		var lineNumber = editorSelection.startLineNumber;
		var startColumn = editorSelection.startColumn;
		var endColumn = editorSelection.endColumn;

		var word = this.model.getWordAtPosition({
			lineNumber: lineNumber,
			column: startColumn
		});

		// The selection must be inside a word or surround one word at most
		if (!word || word.startColumn > startColumn || word.endColumn < endColumn) {
			this._stopAll();
			return;
		}

		// All the effort below is trying to achieve this:
		// - when cursor is moved to a word, trigger immediately a findOccurrences request
		// - 250ms later after the last cursor move event, render the occurrences
		// - no flickering!

		var currentWordRange = new Range(lineNumber, word.startColumn, lineNumber, word.endColumn);

		var workerRequestIsValid = this._lastWordRange && this._lastWordRange.equalsRange(currentWordRange);

		// Even if we are on a different word, if that word is in the decorations ranges, the request is still valid
		// (Same symbol)
		for (var i = 0, len = this._decorationIds.length; !workerRequestIsValid && i < len; i++) {
			var range = this.model.getDecorationRange(this._decorationIds[i]);
			if (range && range.startLineNumber === lineNumber) {
				if (range.startColumn <= startColumn && range.endColumn >= endColumn) {
					workerRequestIsValid = true;
				}
			}
		}


		// There are 4 cases:
		// a) old workerRequest is valid & completed, renderDecorationsTimer fired
		// b) old workerRequest is valid & completed, renderDecorationsTimer not fired
		// c) old workerRequest is valid, but not completed
		// d) old workerRequest is not valid

		// For a) no action is needed
		// For c), member 'lastCursorPositionChangeTime' will be used when installing the timer so no action is needed

		this.lastCursorPositionChangeTime = (new Date()).getTime();

		if (workerRequestIsValid) {
			if (this.workerRequestCompleted && this.renderDecorationsTimer !== -1) {
				// case b)
				// Delay the firing of renderDecorationsTimer by an extra 250 ms
				clearTimeout(this.renderDecorationsTimer);
				this.renderDecorationsTimer = -1;
				this._beginRenderDecorations();
			}
		} else {
			// case d)
			// Stop all previous actions and start fresh
			this._stopAll();

			var myRequestId = ++this.workerRequestTokenId;
			this.workerRequestCompleted = false;

			this.workerRequest = getOccurrencesAtPosition(this.model, this.editor.getPosition());

			this.workerRequest.then(data => {
				if (myRequestId === this.workerRequestTokenId) {
					this.workerRequestCompleted = true;
					this.workerRequestValue = data || [];
					this._beginRenderDecorations();
				}
			}).done();
		}

		this._lastWordRange = currentWordRange;
	}

	private _beginRenderDecorations(): void {
		var currentTime = (new Date()).getTime();
		var minimumRenderTime = this.lastCursorPositionChangeTime + 250;

		if (currentTime >= minimumRenderTime) {
			// Synchronous
			this.renderDecorationsTimer = -1;
			this.renderDecorations();
		} else {
			// Asynchronous
			this.renderDecorationsTimer = setTimeout(() => {
				this.renderDecorations();
			}, (minimumRenderTime - currentTime));
		}
	}

	private renderDecorations(): void {
		this.renderDecorationsTimer = -1;
		var decorations: IModelDeltaDecoration[] = [];
		for (var i = 0, len = this.workerRequestValue.length; i < len; i++) {
			var info = this.workerRequestValue[i];
			decorations.push({
				range: info.range,
				options: WordHighlighter._getDecorationOptions(info.kind)
			});
		}

		this._decorationIds = this.editor.deltaDecorations(this._decorationIds, decorations);
		this._hasWordHighlights.set(this.hasDecorations());
	}

	private static _getDecorationOptions(kind: DocumentHighlightKind): ModelDecorationOptions {
		if (kind === DocumentHighlightKind.Write) {
			return this._WRITE_OPTIONS;
		} else if (kind === DocumentHighlightKind.Text) {
			return this._TEXT_OPTIONS;
		} else {
			return this._REGULAR_OPTIONS;
		}
	}

	private static readonly _WRITE_OPTIONS = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'wordHighlightStrong',
		overviewRuler: {
			color: themeColorFromId(overviewRulerWordHighlightStrongForeground),
			darkColor: themeColorFromId(overviewRulerWordHighlightStrongForeground),
			position: OverviewRulerLane.Center
		}
	});

	private static readonly _TEXT_OPTIONS = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'selectionHighlight',
		overviewRuler: {
			color: themeColorFromId(overviewRulerSelectionHighlightForeground),
			darkColor: themeColorFromId(overviewRulerSelectionHighlightForeground),
			position: OverviewRulerLane.Center
		}
	});

	private static readonly _REGULAR_OPTIONS = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'wordHighlight',
		overviewRuler: {
			color: themeColorFromId(overviewRulerWordHighlightForeground),
			darkColor: themeColorFromId(overviewRulerWordHighlightForeground),
			position: OverviewRulerLane.Center
		}
	});

	public dispose(): void {
		this._stopAll();
		this.toUnhook = dispose(this.toUnhook);
	}
}

class WordHighlighterContribution implements editorCommon.IEditorContribution {

	private static readonly ID = 'editor.contrib.wordHighlighter';

	public static get(editor: ICodeEditor): WordHighlighterContribution {
		return editor.getContribution<WordHighlighterContribution>(WordHighlighterContribution.ID);
	}

	private wordHighligher: WordHighlighter;

	constructor(editor: ICodeEditor, @IContextKeyService contextKeyService: IContextKeyService) {
		this.wordHighligher = new WordHighlighter(editor, contextKeyService);
	}

	public getId(): string {
		return WordHighlighterContribution.ID;
	}

	public saveViewState(): boolean {
		if (this.wordHighligher.hasDecorations()) {
			return true;
		}
		return false;
	}

	public moveNext() {
		this.wordHighligher.moveNext();
	}

	public moveBack() {
		this.wordHighligher.moveBack();
	}

	public restoreViewState(state: boolean | undefined): void {
		if (state) {
			this.wordHighligher.restore();
		}
	}

	public dispose(): void {
		this.wordHighligher.dispose();
	}
}


class WordHighlightNavigationAction extends EditorAction {

	private _isNext: boolean;

	constructor(next: boolean, opts: IActionOptions) {
		super(opts);
		this._isNext = next;
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = WordHighlighterContribution.get(editor);
		if (!controller) {
			return;
		}

		if (this._isNext) {
			controller.moveNext();
		} else {
			controller.moveBack();
		}
	}
}

class NextWordHighlightAction extends WordHighlightNavigationAction {
	constructor() {
		super(true, {
			id: 'editor.action.wordHighlight.next',
			label: nls.localize('wordHighlight.next.label', "Go to Next Symbol Highlight"),
			alias: 'Go to Next Symbol Highlight',
			precondition: ctxHasWordHighlights,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyCode.F7
			}
		});
	}
}

class PrevWordHighlightAction extends WordHighlightNavigationAction {
	constructor() {
		super(false, {
			id: 'editor.action.wordHighlight.prev',
			label: nls.localize('wordHighlight.previous.label', "Go to Previous Symbol Highlight"),
			alias: 'Go to Previous Symbol Highlight',
			precondition: ctxHasWordHighlights,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.Shift | KeyCode.F7
			}
		});
	}
}

registerEditorContribution(WordHighlighterContribution);
registerEditorAction(NextWordHighlightAction);
registerEditorAction(PrevWordHighlightAction);

registerThemingParticipant((theme, collector) => {
	let selectionHighlight = theme.getColor(editorSelectionHighlight);
	if (selectionHighlight) {
		collector.addRule(`.monaco-editor .focused .selectionHighlight { background-color: ${selectionHighlight}; }`);
		collector.addRule(`.monaco-editor .selectionHighlight { background-color: ${selectionHighlight.transparent(0.5)}; }`);
	}
	let wordHighlight = theme.getColor(editorWordHighlight);
	if (wordHighlight) {
		collector.addRule(`.monaco-editor .wordHighlight { background-color: ${wordHighlight}; }`);
	}
	let wordHighlightStrong = theme.getColor(editorWordHighlightStrong);
	if (wordHighlightStrong) {
		collector.addRule(`.monaco-editor .wordHighlightStrong { background-color: ${wordHighlightStrong}; }`);
	}
	let selectionHighlightBorder = theme.getColor(editorSelectionHighlightBorder);
	if (selectionHighlightBorder) {
		collector.addRule(`.monaco-editor .selectionHighlight { border: 1px dotted ${selectionHighlightBorder}; box-sizing: border-box; }`);
	}
	let wordHighlightBorder = theme.getColor(editorWordHighlightBorder);
	if (wordHighlightBorder) {
		collector.addRule(`.monaco-editor .wordHighlight { border: 1px dashed ${wordHighlightBorder}; box-sizing: border-box; }`);
	}
	let wordHighlightStrongBorder = theme.getColor(editorWordHighlightStrongBorder);
	if (wordHighlightStrongBorder) {
		collector.addRule(`.monaco-editor .wordHighlightStrong { border: 1px dashed ${wordHighlightStrongBorder}; box-sizing: border-box; }`);
	}

});
