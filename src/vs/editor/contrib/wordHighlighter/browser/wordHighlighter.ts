/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as arrays from 'vs/base/common/arrays';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { CancelablePromise, createCancelablePromise, first, timeout } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedError, onUnexpectedExternalError } from 'vs/base/common/errors';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorContributionInstantiation, IActionOptions, registerEditorAction, registerEditorContribution, registerModelAndPositionCommand } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { IWordAtPosition } from 'vs/editor/common/core/wordHelper';
import { CursorChangeReason, ICursorPositionChangedEvent } from 'vs/editor/common/cursorEvents';
import { IEditorContribution, IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { DocumentHighlight, DocumentHighlightKind, DocumentHighlightProvider, MultiDocumentHighlightProvider } from 'vs/editor/common/languages';
import { IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { getHighlightDecorationOptions } from 'vs/editor/contrib/wordHighlighter/browser/highlightDecorations';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

const ctxHasWordHighlights = new RawContextKey<boolean>('hasWordHighlights', false);

export function getOccurrencesAtPosition(registry: LanguageFeatureRegistry<DocumentHighlightProvider>, model: ITextModel, position: Position, token: CancellationToken): Promise<Map<URI, DocumentHighlight[]> | null | undefined> {
	const orderedByScore = registry.ordered(model);

	// in order of score ask the occurrences provider
	// until someone response with a good result
	// (good = none empty array)
	return first<DocumentHighlight[] | null | undefined>(orderedByScore.map(provider => () => {
		return Promise.resolve(provider.provideDocumentHighlights(model, position, token))
			.then(undefined, onUnexpectedExternalError);
	}), arrays.isNonEmptyArray).then(result => {
		if (result) {
			const map = new Map<URI, DocumentHighlight[]>();
			map.set(model.uri, result);
			return map;
		}
		return new Map<URI, DocumentHighlight[]>();
	});
}

export function getOccurrencesAcrossMultipleModels(registry: LanguageFeatureRegistry<MultiDocumentHighlightProvider>, model: ITextModel, position: Position, wordSeparators: string, token: CancellationToken, otherModels: ITextModel[]): Promise<Map<URI, DocumentHighlight[]> | null | undefined> {
	const orderedByScore = registry.ordered(model);

	// in order of score ask the occurrences provider
	// until someone response with a good result
	// (good = none empty array)
	return first<Map<URI, DocumentHighlight[]> | null | undefined>(orderedByScore.map(provider => () => {
		return Promise.resolve(provider.provideMultiDocumentHighlights(model, position, wordSeparators, token, otherModels))
			.then(undefined, onUnexpectedExternalError);
	}), (t: Map<URI, DocumentHighlight[]> | null | undefined): t is Map<URI, DocumentHighlight[]> => t instanceof Map && t.size > 0);
}

interface IOccurenceAtPositionRequest {
	readonly result: Promise<Map<URI, DocumentHighlight[]>>;
	isValid(model: ITextModel, selection: Selection, decorations: IEditorDecorationsCollection): boolean;
	cancel(): void;
}

abstract class OccurenceAtPositionRequest implements IOccurenceAtPositionRequest {

	private readonly _wordRange: Range | null;
	private _result: CancelablePromise<Map<URI, DocumentHighlight[]>> | null;

	constructor(private readonly _model: ITextModel, private readonly _selection: Selection, private readonly _wordSeparators: string) {
		this._wordRange = this._getCurrentWordRange(_model, _selection);
		this._result = null;
	}

	get result() {
		if (!this._result) {
			this._result = createCancelablePromise(token => this._compute(this._model, this._selection, this._wordSeparators, token));
		}
		return this._result;

	}

	protected abstract _compute(model: ITextModel, selection: Selection, wordSeparators: string, token: CancellationToken): Promise<Map<URI, DocumentHighlight[]>>;

	private _getCurrentWordRange(model: ITextModel, selection: Selection): Range | null {
		const word = model.getWordAtPosition(selection.getPosition());
		if (word) {
			return new Range(selection.startLineNumber, word.startColumn, selection.startLineNumber, word.endColumn);
		}
		return null;
	}

	public isValid(model: ITextModel, selection: Selection, decorations: IEditorDecorationsCollection): boolean {

		const lineNumber = selection.startLineNumber;
		const startColumn = selection.startColumn;
		const endColumn = selection.endColumn;
		const currentWordRange = this._getCurrentWordRange(model, selection);

		let requestIsValid = Boolean(this._wordRange && this._wordRange.equalsRange(currentWordRange));

		// Even if we are on a different word, if that word is in the decorations ranges, the request is still valid
		// (Same symbol)
		for (let i = 0, len = decorations.length; !requestIsValid && i < len; i++) {
			const range = decorations.getRange(i);
			if (range && range.startLineNumber === lineNumber) {
				if (range.startColumn <= startColumn && range.endColumn >= endColumn) {
					requestIsValid = true;
				}
			}
		}

		return requestIsValid;
	}

	public cancel(): void {
		this.result.cancel();
	}
}

class SemanticOccurenceAtPositionRequest extends OccurenceAtPositionRequest {

	private readonly _providers: LanguageFeatureRegistry<DocumentHighlightProvider>;

	constructor(model: ITextModel, selection: Selection, wordSeparators: string, providers: LanguageFeatureRegistry<DocumentHighlightProvider>) {
		super(model, selection, wordSeparators);
		this._providers = providers;
	}

	protected _compute(model: ITextModel, selection: Selection, wordSeparators: string, token: CancellationToken): Promise<Map<URI, DocumentHighlight[]>> {
		return getOccurrencesAtPosition(this._providers, model, selection.getPosition(), token).then(value => {
			if (!value) {
				return new Map<URI, DocumentHighlight[]>();
			}
			return value;
		});
	}
}

class TextualOccurenceAtPositionRequest extends OccurenceAtPositionRequest {

	private readonly _selectionIsEmpty: boolean;

	constructor(model: ITextModel, selection: Selection, wordSeparators: string) {
		super(model, selection, wordSeparators);
		this._selectionIsEmpty = selection.isEmpty();
	}

	protected _compute(model: ITextModel, selection: Selection, wordSeparators: string, token: CancellationToken): Promise<Map<URI, DocumentHighlight[]>> {
		return timeout(250, token).then(() => {
			if (!selection.isEmpty()) {
				return new Map<URI, DocumentHighlight[]>();
			}

			const word = model.getWordAtPosition(selection.getPosition());

			if (!word || word.word.length > 1000) {
				return new Map<URI, DocumentHighlight[]>();
			}
			const matches = model.findMatches(word.word, true, false, true, wordSeparators, false);
			const highlight: DocumentHighlight[] = matches.map(m => ({
				range: m.range,
				kind: DocumentHighlightKind.Text
			}));
			const res = new Map<URI, DocumentHighlight[]>();
			res.set(model.uri, highlight);
			return res;
		});
	}

	public override isValid(model: ITextModel, selection: Selection, decorations: IEditorDecorationsCollection): boolean {
		const currentSelectionIsEmpty = selection.isEmpty();
		if (this._selectionIsEmpty !== currentSelectionIsEmpty) {
			return false;
		}
		return super.isValid(model, selection, decorations);
	}
}
class MultiModelOccurenceRequest extends OccurenceAtPositionRequest {
	private readonly _providers: LanguageFeatureRegistry<MultiDocumentHighlightProvider>;
	private readonly _otherModels: ITextModel[];

	constructor(model: ITextModel, selection: Selection, wordSeparators: string, providers: LanguageFeatureRegistry<MultiDocumentHighlightProvider>, otherModels: ITextModel[]) {
		super(model, selection, wordSeparators);
		this._providers = providers;
		this._otherModels = otherModels;
	}

	protected override _compute(model: ITextModel, selection: Selection, wordSeparators: string, token: CancellationToken): Promise<Map<URI, DocumentHighlight[]>> {
		return getOccurrencesAcrossMultipleModels(this._providers, model, selection.getPosition(), wordSeparators, token, this._otherModels).then(value => {
			if (!value) {
				return new Map<URI, DocumentHighlight[]>();
			}
			return value;
		});
	}
}

class TextualMultiModelOccurenceRequest extends OccurenceAtPositionRequest {

	private readonly _otherModels: ITextModel[];

	constructor(model: ITextModel, selection: Selection, wordSeparators: string, otherModels: ITextModel[]) {
		super(model, selection, wordSeparators);
		this._otherModels = otherModels;
	}

	protected _compute(model: ITextModel, selection: Selection, wordSeparators: string, token: CancellationToken): Promise<Map<URI, DocumentHighlight[]>> {
		return timeout(250, token).then(() => {
			const result = new Map<URI, DocumentHighlight[]>();
			const word = model.getWordAtPosition(selection.getPosition());

			for (const otherModel of this._otherModels) {
				if (!word) {
					return new Map<URI, DocumentHighlight[]>();
				}

				const matches = otherModel.findMatches(word.word, true, false, true, wordSeparators, false);
				const highlights = matches.map(m => ({
					range: m.range,
					kind: DocumentHighlightKind.Text
				}));

				if (highlights) {
					result.set(otherModel.uri, highlights);
				}
			}
			return result;
		});
	}
}

function computeOccurencesAtPosition(registry: LanguageFeatureRegistry<DocumentHighlightProvider>, model: ITextModel, selection: Selection, wordSeparators: string): IOccurenceAtPositionRequest {
	if (registry.has(model)) {
		return new SemanticOccurenceAtPositionRequest(model, selection, wordSeparators, registry);
	}
	return new TextualOccurenceAtPositionRequest(model, selection, wordSeparators);
}

function computeOccurencesMultiModel(registry: LanguageFeatureRegistry<MultiDocumentHighlightProvider>, model: ITextModel, selection: Selection, wordSeparators: string, otherModels: ITextModel[]): IOccurenceAtPositionRequest {
	if (registry.has(model)) {
		return new MultiModelOccurenceRequest(model, selection, wordSeparators, registry, otherModels);
	}
	return new TextualMultiModelOccurenceRequest(model, selection, wordSeparators, otherModels);
}

registerModelAndPositionCommand('_executeDocumentHighlights', (accessor, model, position) => {
	const languageFeaturesService = accessor.get(ILanguageFeaturesService);
	return getOccurrencesAtPosition(languageFeaturesService.documentHighlightProvider, model, position, CancellationToken.None);
});

class WordHighlighter {

	private readonly editor: IActiveCodeEditor;
	private readonly providers: LanguageFeatureRegistry<DocumentHighlightProvider>;
	private readonly multiDocumentProviders: LanguageFeatureRegistry<MultiDocumentHighlightProvider>;
	private occurrencesHighlight: boolean;
	private multiDocumentOccurrencesHighlight: boolean;
	private readonly model: ITextModel;
	private readonly decorations: IEditorDecorationsCollection;
	private readonly toUnhook = new DisposableStore();
	private readonly codeEditorService: ICodeEditorService;

	private workerRequestTokenId: number = 0;
	private workerRequest: IOccurenceAtPositionRequest | null;
	private workerRequestCompleted: boolean = false;
	private workerRequestValue: Map<URI, DocumentHighlight[]> = new Map();
	private storedDecorations: Map<URI, string[]> = new Map();

	private lastCursorPositionChangeTime: number = 0;
	private renderDecorationsTimer: any = -1;

	private readonly _hasWordHighlights: IContextKey<boolean>;
	private _ignorePositionChangeEvent: boolean;


	constructor(editor: IActiveCodeEditor, providers: LanguageFeatureRegistry<DocumentHighlightProvider>, multiProviders: LanguageFeatureRegistry<MultiDocumentHighlightProvider>, contextKeyService: IContextKeyService, @ICodeEditorService codeEditorService: ICodeEditorService) {
		this.editor = editor;
		this.providers = providers;
		this.multiDocumentProviders = multiProviders;
		this.codeEditorService = codeEditorService;
		this._hasWordHighlights = ctxHasWordHighlights.bindTo(contextKeyService);
		this._ignorePositionChangeEvent = false;
		this.occurrencesHighlight = this.editor.getOption(EditorOption.occurrencesHighlight);
		this.multiDocumentOccurrencesHighlight = this.editor.getOption(EditorOption.multiDocumentOccurrencesHighlight);
		this.model = this.editor.getModel();
		this.toUnhook.add(editor.onDidChangeCursorPosition((e: ICursorPositionChangedEvent) => {
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
		this.toUnhook.add(editor.onDidChangeModelContent((e) => {
			this._stopAll();
		}));
		this.toUnhook.add(editor.onDidChangeConfiguration((e) => {
			const newValue = this.editor.getOption(EditorOption.occurrencesHighlight);
			if (this.occurrencesHighlight !== newValue) {
				this.occurrencesHighlight = newValue;
				this._stopAll();
			}

			const newMultiDocumentValue = this.editor.getOption(EditorOption.multiDocumentOccurrencesHighlight);
			if (this.multiDocumentOccurrencesHighlight !== newMultiDocumentValue) {
				this.multiDocumentOccurrencesHighlight = newMultiDocumentValue;
				this._stopAll();
			}
		}));

		this.decorations = this.editor.createDecorationsCollection();
		this.workerRequestTokenId = 0;
		this.workerRequest = null;
		this.workerRequestCompleted = false;

		this.lastCursorPositionChangeTime = 0;
		this.renderDecorationsTimer = -1;
	}

	public hasDecorations(): boolean {
		return (this.decorations.length > 0);
	}

	public restore(): void {
		if (!this.occurrencesHighlight) {
			return;
		}
		this._run();
	}

	public stop(): void {
		if (!this.occurrencesHighlight) {
			return;
		}

		this._stopAll();
	}

	private _getSortedHighlights(): Range[] {
		return (
			this.decorations.getRanges()
				.sort(Range.compareRangesUsingStarts)
		);
	}

	public moveNext() {
		const highlights = this._getSortedHighlights();
		const index = highlights.findIndex((range) => range.containsPosition(this.editor.getPosition()));
		const newIndex = ((index + 1) % highlights.length);
		const dest = highlights[newIndex];
		try {
			this._ignorePositionChangeEvent = true;
			this.editor.setPosition(dest.getStartPosition());
			this.editor.revealRangeInCenterIfOutsideViewport(dest);
			const word = this._getWord();
			if (word) {
				const lineContent = this.editor.getModel().getLineContent(dest.startLineNumber);
				alert(`${lineContent}, ${newIndex + 1} of ${highlights.length} for '${word.word}'`);
			}
		} finally {
			this._ignorePositionChangeEvent = false;
		}
	}

	public moveBack() {
		const highlights = this._getSortedHighlights();
		const index = highlights.findIndex((range) => range.containsPosition(this.editor.getPosition()));
		const newIndex = ((index - 1 + highlights.length) % highlights.length);
		const dest = highlights[newIndex];
		try {
			this._ignorePositionChangeEvent = true;
			this.editor.setPosition(dest.getStartPosition());
			this.editor.revealRangeInCenterIfOutsideViewport(dest);
			const word = this._getWord();
			if (word) {
				const lineContent = this.editor.getModel().getLineContent(dest.startLineNumber);
				alert(`${lineContent}, ${newIndex + 1} of ${highlights.length} for '${word.word}'`);
			}
		} finally {
			this._ignorePositionChangeEvent = false;
		}
	}

	private _removeDecorations(): void {
		const currentEditors = this.codeEditorService.listCodeEditors();
		// iterate over editors and store models in currentModels
		for (const editor of currentEditors) {
			const model = editor.getModel();
			if (model) {
				model.changeDecorations((changeAccessor) => {
					changeAccessor.deltaDecorations(this.storedDecorations.get(model.uri) ?? [], []);
					this.storedDecorations.delete(model.uri);
				});
			}
		}

		if (this.decorations.length > 0) {
			// remove decorations
			this.decorations.clear();
			this._hasWordHighlights.set(false);
		}
	}

	private _stopAll(): void {
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

	private _getWord(): IWordAtPosition | null {
		const editorSelection = this.editor.getSelection();
		const lineNumber = editorSelection.startLineNumber;
		const startColumn = editorSelection.startColumn;

		return this.model.getWordAtPosition({
			lineNumber: lineNumber,
			column: startColumn
		});
	}

	private _run(): void {
		const editorSelection = this.editor.getSelection();

		// ignore multiline selection
		if (editorSelection.startLineNumber !== editorSelection.endLineNumber) {
			this._stopAll();
			return;
		}

		const startColumn = editorSelection.startColumn;
		const endColumn = editorSelection.endColumn;

		const word = this._getWord();

		// The selection must be inside a word or surround one word at most
		if (!word || word.startColumn > startColumn || word.endColumn < endColumn) {
			this._stopAll();
			return;
		}

		// All the effort below is trying to achieve this:
		// - when cursor is moved to a word, trigger immediately a findOccurrences request
		// - 250ms later after the last cursor move event, render the occurrences
		// - no flickering!

		const workerRequestIsValid = (this.workerRequest && this.workerRequest.isValid(this.model, editorSelection, this.decorations));

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

			const myRequestId = ++this.workerRequestTokenId;
			this.workerRequestCompleted = false;

			const currentEditors = this.codeEditorService.listCodeEditors();
			const currentModels: ITextModel[] = [];
			for (const editor of currentEditors) {
				const model = editor.getModel();
				if (model) {
					currentModels.push(model);
				}
			}

			const isNotebookEditor = this.editor.getModel()?.uri.scheme === 'vscode-notebook-cell';
			const notebookCellModels = currentModels.filter(model => model.uri.scheme === 'vscode-notebook-cell');

			if (currentModels && currentModels.length > 1 && this.multiDocumentOccurrencesHighlight) {
				this.workerRequest = computeOccurencesMultiModel(this.multiDocumentProviders, this.model, this.editor.getSelection(), this.editor.getOption(EditorOption.wordSeparators), currentModels);
			} else {
				if (isNotebookEditor) { // notebooks should highlight accross cells even with multi-doc highlight turned off.
					this.workerRequest = computeOccurencesMultiModel(this.multiDocumentProviders, this.model, this.editor.getSelection(), this.editor.getOption(EditorOption.wordSeparators), notebookCellModels);
				} else {
					this.workerRequest = computeOccurencesAtPosition(this.providers, this.model, this.editor.getSelection(), this.editor.getOption(EditorOption.wordSeparators));
				}
			}
			this.workerRequest.result.then(data => {
				if (myRequestId === this.workerRequestTokenId) {
					this.workerRequestCompleted = true;
					this.workerRequestValue = data || [];
					this._beginRenderDecorations();
				}
			}, onUnexpectedError);
		}
	}

	private _beginRenderDecorations(): void {
		const currentTime = (new Date()).getTime();
		const minimumRenderTime = this.lastCursorPositionChangeTime + 250;

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
		// create new loop, iterate over current editors using this.codeEditorService.listCodeEditors(),
		// if the URI of that codeEditor is in the map, then add the decorations to the decorations array
		// then set the decorations for the editor
		const currentEditors = this.codeEditorService.listCodeEditors();
		for (const editor of currentEditors) {
			const editorHighlighterContrib = WordHighlighterContribution.get(editor);
			if (!editorHighlighterContrib) {
				continue;
			}

			const newDecorations: IModelDeltaDecoration[] = [];
			const uri = editor.getModel()?.uri;
			if (uri && this.workerRequestValue.has(uri)) {
				const oldDecorations: string[] | undefined = this.storedDecorations.get(uri);
				const highlights = this.workerRequestValue.get(uri);
				if (highlights) {
					for (const highlight of highlights) {
						newDecorations.push({
							range: highlight.range,
							options: getHighlightDecorationOptions(highlight.kind)
						});
					}
				}

				let newDecorationIDs: string[] = [];
				editor.changeDecorations((changeAccessor) => {
					newDecorationIDs = changeAccessor.deltaDecorations(oldDecorations ?? [], newDecorations);
				});
				this.storedDecorations = this.storedDecorations.set(uri, newDecorationIDs);

				if (newDecorations.length > 0) {
					editorHighlighterContrib.wordHighlighter?._hasWordHighlights.set(true);
				}
			}
		}
	}

	public dispose(): void {
		this._stopAll();
		this.toUnhook.dispose();
	}
}

export class WordHighlighterContribution extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.wordHighlighter';

	public static get(editor: ICodeEditor): WordHighlighterContribution | null {
		return editor.getContribution<WordHighlighterContribution>(WordHighlighterContribution.ID);
	}

	private _wordHighlighter: WordHighlighter | null;

	constructor(editor: ICodeEditor, @IContextKeyService contextKeyService: IContextKeyService, @ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService, @ICodeEditorService codeEditorService: ICodeEditorService) {
		super();
		this._wordHighlighter = null;
		const createWordHighlighterIfPossible = () => {
			if (editor.hasModel() && !editor.getModel().isTooLargeForTokenization()) {
				this._wordHighlighter = new WordHighlighter(editor, languageFeaturesService.documentHighlightProvider, languageFeaturesService.multiDocumentHighlightProvider, contextKeyService, codeEditorService);
			}
		};
		this._register(editor.onDidChangeModel((e) => {
			if (this._wordHighlighter) {
				this._wordHighlighter.dispose();
				this._wordHighlighter = null;
			}
			createWordHighlighterIfPossible();
		}));
		createWordHighlighterIfPossible();
	}

	public get wordHighlighter(): WordHighlighter | null {
		return this._wordHighlighter;
	}

	public saveViewState(): boolean {
		if (this._wordHighlighter && this._wordHighlighter.hasDecorations()) {
			return true;
		}
		return false;
	}

	public moveNext() {
		this._wordHighlighter?.moveNext();
	}

	public moveBack() {
		this._wordHighlighter?.moveBack();
	}

	public restoreViewState(state: boolean | undefined): void {
		if (this._wordHighlighter && state) {
			this._wordHighlighter.restore();
		}
	}

	public stopHighlighting() {
		this._wordHighlighter?.stop();
	}

	public override dispose(): void {
		if (this._wordHighlighter) {
			this._wordHighlighter.dispose();
			this._wordHighlighter = null;
		}
		super.dispose();
	}
}


class WordHighlightNavigationAction extends EditorAction {

	private readonly _isNext: boolean;

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
				primary: KeyCode.F7,
				weight: KeybindingWeight.EditorContrib
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
				primary: KeyMod.Shift | KeyCode.F7,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}
}

class TriggerWordHighlightAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.wordHighlight.trigger',
			label: nls.localize('wordHighlight.trigger.label', "Trigger Symbol Highlight"),
			alias: 'Trigger Symbol Highlight',
			precondition: ctxHasWordHighlights.toNegated(),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: 0,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {
		const controller = WordHighlighterContribution.get(editor);
		if (!controller) {
			return;
		}

		controller.restoreViewState(true);
	}
}

registerEditorContribution(WordHighlighterContribution.ID, WordHighlighterContribution, EditorContributionInstantiation.Eager); // eager because it uses `saveViewState`/`restoreViewState`
registerEditorAction(NextWordHighlightAction);
registerEditorAction(PrevWordHighlightAction);
registerEditorAction(TriggerWordHighlightAction);
