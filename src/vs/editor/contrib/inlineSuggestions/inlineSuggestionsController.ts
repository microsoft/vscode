/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorCommand, registerEditorAction, registerEditorCommand, registerEditorContribution, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ITextModel } from 'vs/editor/common/model';
import { CompletionItemInsertTextRule, InlineSuggestion, InlineSuggestions, InlineSuggestionsProviderRegistry } from 'vs/editor/common/modes';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { CancelablePromise, createCancelablePromise, RunOnceScheduler } from 'vs/base/common/async';
import * as errors from 'vs/base/common/errors';
import { GhostText, GhostTextWidget, ObservableValue } from 'vs/editor/contrib/inlineSuggestions/ghostTextWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { Emitter, Event } from 'vs/base/common/event';
import * as strings from 'vs/base/common/strings';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { KeyCode } from 'vs/base/common/keyCodes';
import { SuggestController } from 'vs/editor/contrib/suggest/suggestController';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { ISelectedSuggestion } from 'vs/editor/contrib/suggest/suggestWidget';
import { SnippetParser } from 'vs/editor/contrib/snippet/snippetParser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';

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

		this._register(this.editor.onDidChangeModel(() => {
			this.updateModelController();
		}));
		this._register(this.editor.onDidChangeConfiguration((e) => {
			if (e.hasChanged(EditorOption.suggest)) {
				this.updateModelController();
			}
		}));
		this.updateModelController();
	}

	private updateModelController(): void {
		const suggestOptions = this.editor.getOption(EditorOption.suggest);
		this.modelController.value = this.editor.hasModel() && suggestOptions.showSuggestionPreview
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

	public hide(): void {
		if (this.modelController.value) {
			this.modelController.value.hide();
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
	private readonly textModel = this.editor.getModel();
	private readonly suggestWidgetModel = this._register(new SuggestWidgetInlineSuggestionsModel(this.editor));
	private readonly completionSession = this._register(new MutableDisposable<InlineSuggestionsSession>());
	private readonly checkAndStartSessionSoon = this._register(new RunOnceScheduler(() => this.checkAndStartSession(), 50));

	constructor(
		private readonly editor: IActiveCodeEditor,
		private readonly widget: GhostTextWidget,
		private readonly contextKeys: InlineSuggestionsContextKeys,
	) {
		super();

		this._register(this.editor.onDidChangeModelContent((e) => {
			if (this.completionSession.value && !this.completionSession.value.isValid()) {
				this.completionSession.clear();
			}
			this.checkAndStartSessionSoon.schedule();
		}));
		const suggestController = SuggestController.get(this.editor);
		if (suggestController) {
			let isBoundToSuggestWidget = false;
			const bindToSuggestWidget = () => {
				if (isBoundToSuggestWidget) {
					return;
				}
				isBoundToSuggestWidget = true;

				this._register(suggestController.widget.value.onDidShow(() => {
					this.checkAndStartSession();
				}));
			};
			this._register(Event.once(suggestController.model.onDidTrigger)(e => {
				bindToSuggestWidget();
			}));
		}
		this._register(this.editor.onDidChangeCursorPosition((e) => {
			if (this.completionSession.value && !this.completionSession.value.isValid()) {
				this.completionSession.clear();
			}
		}));
	}

	private checkAndStartSession(): void {
		if (this.completionSession.value && this.completionSession.value.isValid()) {
			return;
		}

		const pos = this.editor.getPosition();
		if (pos.column === this.textModel.getLineMaxColumn(pos.lineNumber)) {
			this.triggerAt(pos);
		}
	}

	private triggerAt(position: Position): void {
		this.completionSession.clear();
		this.completionSession.value = new InlineSuggestionsSession(this.editor, this.widget, this.contextKeys, this.suggestWidgetModel, position);
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

	public hide(): void {
		this.completionSession.clear();
	}
}

class InlineSuggestionsSession extends Disposable {
	private readonly textModel = this.editor.getModel();
	private readonly ghostTextModel = new ObservableValue<GhostText | undefined>(undefined);
	private readonly model = this._register(new DelegatingInlineSuggestionsModel(this.editor, this.suggestWidgetModel));

	private maxLineCount: number = 0;
	private multiline: boolean = false;

	constructor(
		private readonly editor: IActiveCodeEditor,
		private readonly widget: GhostTextWidget,
		private readonly contextKeys: InlineSuggestionsContextKeys,
		private readonly suggestWidgetModel: SuggestWidgetInlineSuggestionsModel,
		private readonly triggerPosition: Position,
	) {
		super();

		this._register(this.editor.onDidChangeModelContent((e) => {
			this.update();
		}));
		this._register(this.editor.onDidChangeCursorPosition((e) => {
			this.update();
		}));
		this._register(this.model.onDidChange(() => {
			this.update();
		}));
		// console.log(`CREATING SESSION`);
		this._register(toDisposable(() => {
			// console.log(`DISPOSING SESSION`);
			if (this.widget.model === this.ghostTextModel) {
				this.widget.setModel(undefined);
			}
		}));
		this._register(toDisposable(() => {
			const suggestController = SuggestController.get(this.editor);
			if (suggestController) {
				suggestController.stopForceRenderingAbove();
			}
		}));

		this.update();
		this.widget.setModel(this.ghostTextModel);
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

	isValid(): boolean {
		const pos = this.editor.getPosition();
		if (this.currentSuggestion) {
			return this.currentSuggestion.suggestion.replaceRange.containsPosition(pos);
		}
		return this.triggerPosition.lineNumber === pos.lineNumber; // the cursor is still on this line
	}

	private update() {
		const suggestion = this.currentSuggestion;
		// const cursorPos = this.editor.getPosition();

		this.contextKeys.inlineSuggestionVisible.set(!!suggestion);

		if (suggestion) {
			const text = suggestion.suggestion.text.substr(suggestion.committedSuggestionLength);
			const lines = strings.splitLines(text);
			this.maxLineCount = Math.max(this.maxLineCount, lines.length);
			this.ghostTextModel.setValue({
				position: suggestion.suggestion.replaceRange.getStartPosition().delta(0, suggestion.committedSuggestionLength),
				lines,
				minAdditionalLineCount: this.maxLineCount - 1,
				multiline: this.multiline,
				expandCallback: () => this._onDidExpand()
			});

			if (this.maxLineCount > 1 && this.multiline) {
				const suggestController = SuggestController.get(this.editor);
				if (suggestController) {
					suggestController.forceRenderingAbove();
				}
			}
		} else {
			if (this.maxLineCount > 1) {
				const maxColumn = this.textModel.getLineMaxColumn(this.triggerPosition.lineNumber);
				this.ghostTextModel.setValue({
					position: new Position(this.triggerPosition.lineNumber, maxColumn),
					lines: [],
					minAdditionalLineCount: this.maxLineCount - 1,
					multiline: this.multiline,
					expandCallback: () => this._onDidExpand()
				});
			} else {
				this.ghostTextModel.setValue(undefined);
			}
		}

	}

	private _onDidExpand(): void {
		this.multiline = true;
		this.update();
	}

	public commitCurrentSuggestion(): void {
		const s = this.currentSuggestion;
		if (s) {
			this.commit(s);
		}
	}

	public commit(suggestion: ValidatedInlineSuggestion): void {
		this.editor.executeEdits(
			'inlineSuggestions.accept',
			[
				EditOperation.replaceMove(suggestion.suggestion.replaceRange, suggestion.suggestion.text)
			]
		);
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

class DelegatingInlineSuggestionsModel extends Disposable {

	private readonly onDidChangeEventEmitter = this._register(new Emitter<void>());
	public readonly onDidChange = this.onDidChangeEventEmitter.event;

	private readonly directModel = this._register(new InlineSuggestionsModel(this.editor));

	private currentModel: SuggestWidgetInlineSuggestionsModel | InlineSuggestionsModel;

	constructor(
		private readonly editor: IActiveCodeEditor,
		private readonly suggestWidgetModel: SuggestWidgetInlineSuggestionsModel
	) {
		super();

		this.directModel.activate();
		this.currentModel = this.directModel;

		this._register(this.suggestWidgetModel.onDidChange(() => {
			if (this.suggestWidgetModel.hasFocusedItem) {
				if (this.currentModel !== this.suggestWidgetModel) {
					this.directModel.deactivate();
					this.currentModel = this.suggestWidgetModel;
				}
			} else {
				if (this.currentModel !== this.directModel) {
					this.directModel.activate();
					this.currentModel = this.directModel;
				}
			}
			this.onDidChangeEventEmitter.fire();
		}));
		this._register(this.directModel.onDidChange(() => {
			this.onDidChangeEventEmitter.fire();
		}));
	}

	getInlineSuggestions(position: Position): NormalizedInlineSuggestions {
		return this.currentModel.getInlineSuggestions(position);
	}
}

class SuggestWidgetInlineSuggestion {
	constructor(
		public lineNumber: number,
		public overwriteBefore: number,
		public overwriteAfter: number,
		public text: string
	) { }
}

class SuggestWidgetInlineSuggestionsModel extends Disposable {

	private readonly onDidChangeEventEmitter = this._register(new Emitter<void>());
	public readonly onDidChange = this.onDidChangeEventEmitter.event;

	private isSuggestWidgetVisible: boolean = false;
	private _hasFocusedItem: boolean = false;
	private currentSuggestion: SuggestWidgetInlineSuggestion | null = null;

	get hasFocusedItem() { return this._hasFocusedItem; }

	constructor(
		private readonly editor: IActiveCodeEditor
	) {
		super();

		const suggestController = SuggestController.get(this.editor);
		if (suggestController) {
			let isBoundToSuggestWidget = false;
			const bindToSuggestWidget = () => {
				if (isBoundToSuggestWidget) {
					return;
				}
				isBoundToSuggestWidget = true;

				this._register(suggestController.widget.value.onDidShow(() => {
					this.isSuggestWidgetVisible = true;
					this.updateFromSuggestion();
				}));
				this._register(suggestController.widget.value.onDidHide(() => {
					this.isSuggestWidgetVisible = false;
					this.updateFromSuggestion();
				}));
				this._register(suggestController.widget.value.onDidFocus(() => {
					this.updateFromSuggestion();
				}));
			};

			this._register(Event.once(suggestController.model.onDidTrigger)(e => {
				bindToSuggestWidget();
			}));
		}
		this.updateFromSuggestion();
	}

	private getSuggestText(suggestController: SuggestController, lineNumber: number, suggestion: ISelectedSuggestion): SuggestWidgetInlineSuggestion | null {
		const item = suggestion.item;

		if (Array.isArray(item.completion.additionalTextEdits)) {
			// cannot represent additional text edits
			return null;
		}

		let { insertText } = item.completion;
		if (item.completion.insertTextRules! & CompletionItemInsertTextRule.InsertAsSnippet) {
			insertText = new SnippetParser().text(insertText);
		}

		const info = suggestController.getOverwriteInfo(item, false);
		return new SuggestWidgetInlineSuggestion(lineNumber, info.overwriteBefore, info.overwriteAfter, insertText);
	}

	private updateFromSuggestion(): void {
		const suggestController = SuggestController.get(this.editor);
		if (!suggestController) {
			this.setNoFocusedItem();
			return;
		}
		if (!this.isSuggestWidgetVisible) {
			this.setNoFocusedItem();
			return;
		}
		const focusedItem = suggestController.widget.value.getFocusedItem();
		if (!focusedItem) {
			this.setNoFocusedItem();
			return;
		}

		// TODO: item.isResolved
		this.setFocusedItem(this.getSuggestText(suggestController, this.editor.getPosition().lineNumber, focusedItem));
	}

	private setNoFocusedItem(): void {
		if (!this._hasFocusedItem) {
			// no change
			return;
		}
		this._hasFocusedItem = false;
		this.currentSuggestion = null;
		this.onDidChangeEventEmitter.fire();
	}

	private setFocusedItem(currentSuggestion: SuggestWidgetInlineSuggestion | null): void {
		this._hasFocusedItem = true;
		this.currentSuggestion = currentSuggestion;
		this.onDidChangeEventEmitter.fire();
	}

	getInlineSuggestions(position: Position): NormalizedInlineSuggestions {
		if (this.currentSuggestion && this.currentSuggestion.lineNumber !== position.lineNumber) {
			this.currentSuggestion = null;
		}
		if (this.currentSuggestion) {
			return {
				items: [{
					replaceRange: Range.fromPositions(position.delta(0, -this.currentSuggestion.overwriteBefore), position.delta(0, this.currentSuggestion.overwriteAfter)),
					text: this.currentSuggestion.text
				}]
			};
		}
		return { items: [] };
	}
}

class InlineSuggestionsModel extends Disposable {

	private readonly onDidChangeEventEmitter = this._register(new Emitter<void>());
	public readonly onDidChange = this.onDidChangeEventEmitter.event;

	private readonly textModel: ITextModel = this.editor.getModel();
	private isActive: boolean = false;
	private updatePromise: CancelablePromise<NormalizedInlineSuggestions | undefined> | undefined = undefined;
	private cachedList: NormalizedInlineSuggestions | undefined = undefined;
	private cachedPosition: Position | undefined = undefined;
	private updateSoon = this._register(new RunOnceScheduler(() => this._update(), 50));

	constructor(
		private readonly editor: IActiveCodeEditor
	) {
		super();

		this._register(toDisposable(() => {
			this.clearGhostTextPromise();
		}));
		this._register(this.editor.onDidChangeModelContent(() => {
			if (this.isActive) {
				this.updateSoon.schedule();
			}
		}));
	}

	activate() {
		this.isActive = true;
	}

	deactivate() {
		this.isActive = false;
		this.updateSoon.cancel();
	}

	public getInlineSuggestions(position: Position): NormalizedInlineSuggestions {
		if (this.cachedList && this.cachedPosition && position.lineNumber === this.cachedPosition.lineNumber) {
			return this.cachedList;
		}
		return {
			items: []
		};
	}

	private _update(): void {
		const position = this.editor.getPosition();
		this.clearGhostTextPromise();
		this.updatePromise = createCancelablePromise(token => provideInlineSuggestions(position, this.textModel, token));
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

	const suggestedLines = strings.splitLines(suggestion.text);
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

	console.log(`provideInlineSuggestions at ${position}`);

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

const InlineSuggestionCommand = EditorCommand.bindToContribution<InlineSuggestionsController>(InlineSuggestionsController.get);

registerEditorCommand(new InlineSuggestionCommand({
	id: 'commitInlineSuggestion',
	precondition: InlineSuggestionsController.inlineSuggestionVisible,
	kbOpts: {
		weight: 100,
		primary: KeyCode.Tab,
	},
	handler(x) {
		x.commit();
	}
}));
registerEditorCommand(new InlineSuggestionCommand({
	id: 'hideInlineSuggestion',
	precondition: InlineSuggestionsController.inlineSuggestionVisible,
	kbOpts: {
		weight: 100,
		primary: KeyCode.Escape,
	},
	handler(x) {
		x.hide();
	}
}));

registerEditorContribution(InlineSuggestionsController.ID, InlineSuggestionsController);
registerEditorAction(TriggerGhostTextAction);
