/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, registerEditorAction, registerEditorContribution, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ITextModel } from 'vs/editor/common/model';
import { InlineSuggestion, InlineSuggestions, InlineSuggestionsProviderRegistry } from 'vs/editor/common/modes';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import * as errors from 'vs/base/common/errors';
import { GhostTextWidget } from 'vs/editor/contrib/inlineSuggestions/ghostTextWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { Emitter } from 'vs/base/common/event';
import { splitLines } from 'vs/base/common/strings';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { KeyCode } from 'vs/base/common/keyCodes';

/*
TODO

GhostTextProviderRegistry.onDidChange(() => {
	this.trigger();
});
*/

class InlineSuggestionsController extends Disposable {
	public static readonly inlineSuggestionVisible = new RawContextKey<boolean>('inlineSuggestionVisible ', false, nls.localize('inlineSuggestionVisible ', "TODO"));
	static ID = 'editor.contrib.inlineSuggestionsController';

	public static get(editor: ICodeEditor): InlineSuggestionsController {
		return editor.getContribution<InlineSuggestionsController>(InlineSuggestionsController.ID);
	}

	private readonly widget: GhostTextWidget;
	private readonly modelController = this._register(new MutableDisposable<InlineSuggestionsModelController>());

	private readonly contextKeys: InlineSuggestionsContextKeys;

	constructor(
		private readonly editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this.contextKeys = new InlineSuggestionsContextKeys(contextKeyService);

		this.widget = this._register(instantiationService.createInstance(GhostTextWidget, this.editor));

		this.editor.onDidChangeModel(() => {
			this.updateModelController();
		});
		this.updateModelController();
	}

	private updateModelController(): void {
		this.modelController.value = this.editor.hasModel()
			? new InlineSuggestionsModelController(this.editor, this.widget, this.contextKeys)
			: undefined;
	}

	public trigger(): void {
		if (this.modelController.value) {
			this.modelController.value.trigger();
		}
	}

	public commit(): void {
		if (this.modelController.value) {
			this.modelController.value.commit();
		}
	}
}

class InlineSuggestionsContextKeys {
	public readonly inlineSuggestionVisible = InlineSuggestionsController.inlineSuggestionVisible.bindTo(this.contextKeyService);

	constructor(private readonly contextKeyService: IContextKeyService) {
	}
}

/**
 * The model controller for a text editor with a specific text model.
*/
export class InlineSuggestionsModelController extends Disposable {
	private readonly model = this.editor.getModel();
	private readonly source = this._register(new InlineSuggestionsModel(this.model));
	private readonly completionSession = this._register(new MutableDisposable<InlineSuggestionsSession>());

	constructor(
		private readonly editor: IActiveCodeEditor,
		private readonly widget: GhostTextWidget,
		private readonly contextKeys: InlineSuggestionsContextKeys,
	) {
		super();

		this._register(this.model.onDidChangeContent((e) => {
			if (!InlineSuggestionsProviderRegistry.has(this.model)) {
				return;
			}
			this.updateSession();
		}));
		this._register(this.editor.onDidChangeCursorPosition((e) => {
			if (!InlineSuggestionsProviderRegistry.has(this.model)) {
				return;
			}
			this.updateSession();
		}));

		this._register(toDisposable(() => {
			this.hide();
		}));
	}

	private updateSession(): void {
		const pos = this.editor.getPosition();

		if (this.completionSession.value && this.completionSession.value.activeRange.containsPosition(pos)) {
			return;
		}

		// only trigger when cursor is at the end of a line
		if (pos.column === this.model.getLineMaxColumn(pos.lineNumber)) {
			this.triggerAt(pos);
		} else {
			this.hide();
		}
	}

	private triggerAt(position: Position): void {
		this.completionSession.value = new InlineSuggestionsSession(this.editor, this.widget, this.source, this.contextKeys, position);
	}

	public hide(): void {
		this.completionSession.clear();
	}

	public trigger(): void {
		if (!this.completionSession.value) {
			this.triggerAt(this.editor.getPosition());
		}
	}

	public commit(): void {
		if (this.completionSession.value) {
			this.completionSession.value.commitCurrentSuggestion();
		}
	}
}

class InlineSuggestionsSession extends Disposable {
	private readonly textModel = this.editor.getModel();

	/*
	private get position(): Position {
		return this.editor.getPosition();
		//return new Position(this.lineNumber, this.model.getLineMaxColumn(this.lineNumber));
	}*/

	constructor(
		private readonly editor: IActiveCodeEditor,
		private readonly widget: GhostTextWidget,
		private readonly model: InlineSuggestionsModel,
		private readonly contextKeys: InlineSuggestionsContextKeys,
		private readonly triggerPosition: Position,
	) {
		super();

		this._register(this.textModel.onDidChangeContent((e) => {
			this.model.update(this.editor.getPosition());
			this.update();
		}));
		this._register(this.editor.onDidChangeCursorPosition((e) => {
			this.model.update(this.editor.getPosition());
			this.update();
		}));

		this.model.onDidChange(() => {
			this.update();
		});

		this.model.update(this.editor.getPosition());
		this.update();
	}

	get currentSuggestion(): ValidatedInlineSuggestion | undefined {
		const cursorPos = this.editor.getPosition();
		const suggestions = this.model.getInlineSuggestions(cursorPos);
		const validatedSuggestions = suggestions.items
			.map(s => validateSuggestion(s, this.textModel))
			.filter(s => s !== undefined);
		const first = validatedSuggestions[0];

		return first;
	}

	get activeRange(): Range {
		if (this.currentSuggestion) {
			return this.currentSuggestion.suggestion.replaceRange;
		}
		return getDefaultRange(this.triggerPosition, this.textModel);
	}

	private update() {
		const suggestion = this.currentSuggestion;
		const cursorPos = this.editor.getPosition();

		this.contextKeys.inlineSuggestionVisible.set(!!suggestion);

		if (suggestion) {
			this.widget.show({
				position: suggestion.suggestion.replaceRange.getStartPosition().delta(0, suggestion.committedSuggestionLength),
				text: suggestion.suggestion.text.substr(suggestion.committedSuggestionLength),
			});
		} else {
			this.widget.hide();
		}
	}

	public commitCurrentSuggestion(): void {
		const s = this.currentSuggestion;
		if (s) {
			this.commit(s);
		}
	}

	public commit(suggestion: ValidatedInlineSuggestion): void {
		this.textModel.applyEdits([{
			range: suggestion.suggestion.replaceRange,
			text: suggestion.suggestion.text,
			forceMoveMarkers: true,
		}]);
	}
}

interface ValidatedInlineSuggestion {
	suggestion: NormalizedInlineSuggestion;
	lineNumber: number;
	/**
	 * Indicates the length of the prefix of the suggestion that agrees with the text buffer.
	*/
	committedSuggestionLength: number;
}

class InlineSuggestionsModel {
	private updatePromise: CancelablePromise<NormalizedInlineSuggestions | undefined> | undefined = undefined;
	private readonly onDidChangeEventEmitter = new Emitter();
	private cachedList: NormalizedInlineSuggestions | undefined = undefined;
	private cachedPosition: Position | undefined = undefined;

	public readonly onDidChange = this.onDidChangeEventEmitter.event;

	constructor(private readonly model: ITextModel) {
		console.log(this.cachedPosition);
	}

	public dispose(): void {
		this.clearGhostTextPromise();
	}

	public getInlineSuggestions(position: Position): NormalizedInlineSuggestions {
		if (this.cachedList && this.cachedPosition && position.lineNumber === this.cachedPosition.lineNumber) {
			return this.cachedList;
		}
		return {
			items: []
		};
	}

	public update(position: Position): void {
		//this.cachedList = undefined;
		//this.cachedPosition = undefined;
		this._update(position);
	}

	private _update(position: Position): void {
		this.clearGhostTextPromise();
		this.updatePromise = createCancelablePromise(token => provideInlineSuggestions(position, this.model, token));
		this.updatePromise.then((result) => {
			this.cachedList = result;
			this.cachedPosition = position;
			this.onDidChangeEventEmitter.fire(undefined);
		}, errors.onUnexpectedError);
	}

	private clearGhostTextPromise(): void {
		if (this.updatePromise) {
			this.updatePromise.cancel();
			this.updatePromise = undefined;
		}
	}
}

function validateSuggestion(suggestion: NormalizedInlineSuggestion, model: ITextModel): ValidatedInlineSuggestion | undefined {
	// Multiline replacements are not supported
	if (suggestion.replaceRange.startLineNumber !== suggestion.replaceRange.endLineNumber) {
		return undefined;
	}
	const lineNumber = suggestion.replaceRange.startLineNumber;

	const suggestedLines = splitLines(suggestion.text);
	const firstSuggestedLine = suggestedLines[0];

	const modelLine = model.getLineContent(lineNumber);

	const suggestionStartIdx = suggestion.replaceRange.startColumn - 1;
	let committedSuggestionLength = 0;
	while (
		committedSuggestionLength < firstSuggestedLine.length
		&& suggestionStartIdx + committedSuggestionLength < modelLine.length
		&& firstSuggestedLine[committedSuggestionLength] === modelLine[suggestionStartIdx + committedSuggestionLength]) {
		committedSuggestionLength++;
	}

	// If a suggestion wants to replace text, the suggestion may not replace that text with different text
	//if (committedSuggestionLength !== suggestion.replaceRange.endColumn - suggestion.replaceRange.startColumn) {
	//	return undefined;
	//}

	// For now, we don't support any left over text. An entire line suffix must be replaced.
	//if (suggestion.replaceRange.endColumn !== model.getLineMaxColumn(lineNumber)) {
	//		return undefined;
	//}

	return {
		lineNumber,
		committedSuggestionLength,
		suggestion
	};
}

export class TriggerGhostTextAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.triggerInlineSuggestions',
			label: nls.localize('triggerInlineSuggestionsAction', "Trigger Inline Suggestions"),
			alias: 'Trigger Inline Suggestions',
			precondition: EditorContextKeys.writable
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineSuggestionsController.get(editor);
		if (controller) {
			controller.trigger();
		}
	}
}

export class CommitInlineSuggestionAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.commitInlineSuggestion',
			label: nls.localize('commitInlineSuggestion', "Commit Inline Suggestion"),
			alias: 'Commit Inline Suggestion',
			precondition: InlineSuggestionsController.inlineSuggestionVisible,
			kbOpts: {
				weight: 100,
				primary: KeyCode.Tab,
				secondary: [KeyCode.RightArrow],
			}
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineSuggestionsController.get(editor);
		if (controller) {
			controller.commit();
		}
	}
}

export interface NormalizedInlineSuggestion extends InlineSuggestion {
	replaceRange: Range;
}

export interface NormalizedInlineSuggestions extends InlineSuggestions<NormalizedInlineSuggestion> {
}

function getDefaultRange(position: Position, model: ITextModel): Range {
	const word = model.getWordAtPosition(position);
	const maxColumn = model.getLineMaxColumn(position.lineNumber);
	// By default, always replace up until the end of the current line.
	// This default might be subject to change!
	return word
		? new Range(position.lineNumber, word.startColumn, position.lineNumber, maxColumn)
		: Range.fromPositions(position, position.with(undefined, maxColumn));
}

async function provideInlineSuggestions(
	position: Position,
	model: ITextModel,
	token: CancellationToken = CancellationToken.None
): Promise<NormalizedInlineSuggestions | undefined> {

	const defaultReplaceRange = getDefaultRange(position, model);

	const providers = InlineSuggestionsProviderRegistry.all(model);
	const results = await Promise.all(
		providers.map(provider => provider.provideInlineSuggestions(model, position, token))
	);

	const items = new Array<NormalizedInlineSuggestion>();
	for (const result of results) {
		if (result) {
			items.push(...result.items.map<NormalizedInlineSuggestion>(item => ({
				text: item.text,
				replaceRange: item.replaceRange ? Range.lift(item.replaceRange) : defaultReplaceRange
			})));
		}
	}

	return { items };
}

registerEditorContribution(InlineSuggestionsController.ID, InlineSuggestionsController);
registerEditorAction(TriggerGhostTextAction);
registerEditorAction(CommitInlineSuggestionAction);
