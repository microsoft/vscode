/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { assertType } from 'vs/base/common/types';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorCommand, EditorContributionInstantiation, registerEditorCommand, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { CompletionItem, CompletionItemKind, CompletionItemProvider } from 'vs/editor/common/languages';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { Choice } from 'vs/editor/contrib/snippet/browser/snippetParser';
import { showSimpleSuggestions } from 'vs/editor/contrib/suggest/browser/suggest';
import { OvertypingCapturer } from 'vs/editor/contrib/suggest/browser/suggestOvertypingCapturer';
import { localize } from 'vs/nls';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ILogService } from 'vs/platform/log/common/log';
import { ISnippetEdit, SnippetSession } from './snippetSession';

export interface ISnippetInsertOptions {
	overwriteBefore: number;
	overwriteAfter: number;
	adjustWhitespace: boolean;
	undoStopBefore: boolean;
	undoStopAfter: boolean;
	clipboardText: string | undefined;
	overtypingCapturer: OvertypingCapturer | undefined;
}

const _defaultOptions: ISnippetInsertOptions = {
	overwriteBefore: 0,
	overwriteAfter: 0,
	undoStopBefore: true,
	undoStopAfter: true,
	adjustWhitespace: true,
	clipboardText: undefined,
	overtypingCapturer: undefined
};

export class SnippetController2 implements IEditorContribution {

	public static readonly ID = 'snippetController2';

	static get(editor: ICodeEditor): SnippetController2 | null {
		return editor.getContribution<SnippetController2>(SnippetController2.ID);
	}

	static readonly InSnippetMode = new RawContextKey('inSnippetMode', false, localize('inSnippetMode', "Whether the editor in current in snippet mode"));
	static readonly HasNextTabstop = new RawContextKey('hasNextTabstop', false, localize('hasNextTabstop', "Whether there is a next tab stop when in snippet mode"));
	static readonly HasPrevTabstop = new RawContextKey('hasPrevTabstop', false, localize('hasPrevTabstop', "Whether there is a previous tab stop when in snippet mode"));

	private readonly _inSnippet: IContextKey<boolean>;
	private readonly _hasNextTabstop: IContextKey<boolean>;
	private readonly _hasPrevTabstop: IContextKey<boolean>;

	private _session?: SnippetSession;
	private readonly _snippetListener = new DisposableStore();
	private _modelVersionId: number = -1;
	private _currentChoice?: Choice;

	private _choiceCompletions?: { provider: CompletionItemProvider; enable(): void; disable(): void };

	constructor(
		private readonly _editor: ICodeEditor,
		@ILogService private readonly _logService: ILogService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
	) {
		this._inSnippet = SnippetController2.InSnippetMode.bindTo(contextKeyService);
		this._hasNextTabstop = SnippetController2.HasNextTabstop.bindTo(contextKeyService);
		this._hasPrevTabstop = SnippetController2.HasPrevTabstop.bindTo(contextKeyService);
	}

	dispose(): void {
		this._inSnippet.reset();
		this._hasPrevTabstop.reset();
		this._hasNextTabstop.reset();
		this._session?.dispose();
		this._snippetListener.dispose();
	}

	apply(edits: ISnippetEdit[], opts?: Partial<ISnippetInsertOptions>) {
		try {
			this._doInsert(edits, typeof opts === 'undefined' ? _defaultOptions : { ..._defaultOptions, ...opts });

		} catch (e) {
			this.cancel();
			this._logService.error(e);
			this._logService.error('snippet_error');
			this._logService.error('insert_edits=', edits);
			this._logService.error('existing_template=', this._session ? this._session._logInfo() : '<no_session>');
		}
	}

	insert(
		template: string,
		opts?: Partial<ISnippetInsertOptions>
	): void {
		// this is here to find out more about the yet-not-understood
		// error that sometimes happens when we fail to inserted a nested
		// snippet
		try {
			this._doInsert(template, typeof opts === 'undefined' ? _defaultOptions : { ..._defaultOptions, ...opts });

		} catch (e) {
			this.cancel();
			this._logService.error(e);
			this._logService.error('snippet_error');
			this._logService.error('insert_template=', template);
			this._logService.error('existing_template=', this._session ? this._session._logInfo() : '<no_session>');
		}
	}

	private _doInsert(
		template: string | ISnippetEdit[],
		opts: ISnippetInsertOptions
	): void {
		if (!this._editor.hasModel()) {
			return;
		}

		// don't listen while inserting the snippet
		// as that is the inflight state causing cancelation
		this._snippetListener.clear();

		if (opts.undoStopBefore) {
			this._editor.getModel().pushStackElement();
		}

		// don't merge
		if (this._session && typeof template !== 'string') {
			this.cancel();
		}

		if (!this._session) {
			this._modelVersionId = this._editor.getModel().getAlternativeVersionId();
			this._session = new SnippetSession(this._editor, template, opts, this._languageConfigurationService);
			this._session.insert();
		} else {
			assertType(typeof template === 'string');
			this._session.merge(template, opts);
		}

		if (opts.undoStopAfter) {
			this._editor.getModel().pushStackElement();
		}

		// regster completion item provider when there is any choice element
		if (this._session?.hasChoice) {
			const provider: CompletionItemProvider = {
				_debugDisplayName: 'snippetChoiceCompletions',
				provideCompletionItems: (model: ITextModel, position: Position) => {
					if (!this._session || model !== this._editor.getModel() || !Position.equals(this._editor.getPosition(), position)) {
						return undefined;
					}
					const { activeChoice } = this._session;
					if (!activeChoice || activeChoice.choice.options.length === 0) {
						return undefined;
					}

					const word = model.getValueInRange(activeChoice.range);
					const isAnyOfOptions = Boolean(activeChoice.choice.options.find(o => o.value === word));
					const suggestions: CompletionItem[] = [];
					for (let i = 0; i < activeChoice.choice.options.length; i++) {
						const option = activeChoice.choice.options[i];
						suggestions.push({
							kind: CompletionItemKind.Value,
							label: option.value,
							insertText: option.value,
							sortText: 'a'.repeat(i + 1),
							range: activeChoice.range,
							filterText: isAnyOfOptions ? `${word}_${option.value}` : undefined,
							command: { id: 'jumpToNextSnippetPlaceholder', title: localize('next', 'Go to next placeholder...') }
						});
					}
					return { suggestions };
				}
			};

			const model = this._editor.getModel();

			let registration: IDisposable | undefined;
			let isRegistered = false;
			const disable = () => {
				registration?.dispose();
				isRegistered = false;
			};

			const enable = () => {
				if (!isRegistered) {
					registration = this._languageFeaturesService.completionProvider.register({
						language: model.getLanguageId(),
						pattern: model.uri.fsPath,
						scheme: model.uri.scheme,
						exclusive: true
					}, provider);
					this._snippetListener.add(registration);
					isRegistered = true;
				}
			};

			this._choiceCompletions = { provider, enable, disable };
		}

		this._updateState();

		this._snippetListener.add(this._editor.onDidChangeModelContent(e => e.isFlush && this.cancel()));
		this._snippetListener.add(this._editor.onDidChangeModel(() => this.cancel()));
		this._snippetListener.add(this._editor.onDidChangeCursorSelection(() => this._updateState()));
	}

	private _updateState(): void {
		if (!this._session || !this._editor.hasModel()) {
			// canceled in the meanwhile
			return;
		}

		if (this._modelVersionId === this._editor.getModel().getAlternativeVersionId()) {
			// undo until the 'before' state happened
			// and makes use cancel snippet mode
			return this.cancel();
		}

		if (!this._session.hasPlaceholder) {
			// don't listen for selection changes and don't
			// update context keys when the snippet is plain text
			return this.cancel();
		}

		if (this._session.isAtLastPlaceholder || !this._session.isSelectionWithinPlaceholders()) {
			this._editor.getModel().pushStackElement();
			return this.cancel();
		}

		this._inSnippet.set(true);
		this._hasPrevTabstop.set(!this._session.isAtFirstPlaceholder);
		this._hasNextTabstop.set(!this._session.isAtLastPlaceholder);

		this._handleChoice();
	}

	private _handleChoice(): void {
		if (!this._session || !this._editor.hasModel()) {
			this._currentChoice = undefined;
			return;
		}

		const { activeChoice } = this._session;
		if (!activeChoice || !this._choiceCompletions) {
			this._choiceCompletions?.disable();
			this._currentChoice = undefined;
			return;
		}

		if (this._currentChoice !== activeChoice.choice) {
			this._currentChoice = activeChoice.choice;

			this._choiceCompletions.enable();

			// trigger suggest with the special choice completion provider
			queueMicrotask(() => {
				showSimpleSuggestions(this._editor, this._choiceCompletions!.provider);
			});
		}
	}

	finish(): void {
		while (this._inSnippet.get()) {
			this.next();
		}
	}

	cancel(resetSelection: boolean = false): void {
		this._inSnippet.reset();
		this._hasPrevTabstop.reset();
		this._hasNextTabstop.reset();
		this._snippetListener.clear();

		this._currentChoice = undefined;

		this._session?.dispose();
		this._session = undefined;
		this._modelVersionId = -1;
		if (resetSelection) {
			// reset selection to the primary cursor when being asked
			// for. this happens when explicitly cancelling snippet mode,
			// e.g. when pressing ESC
			this._editor.setSelections([this._editor.getSelection()!]);
		}
	}

	prev(): void {
		this._session?.prev();
		this._updateState();
	}

	next(): void {
		this._session?.next();
		this._updateState();
	}

	isInSnippet(): boolean {
		return Boolean(this._inSnippet.get());
	}

	getSessionEnclosingRange(): Range | undefined {
		if (this._session) {
			return this._session.getEnclosingRange();
		}
		return undefined;
	}
}


registerEditorContribution(SnippetController2.ID, SnippetController2, EditorContributionInstantiation.Lazy);

const CommandCtor = EditorCommand.bindToContribution<SnippetController2>(SnippetController2.get);

registerEditorCommand(new CommandCtor({
	id: 'jumpToNextSnippetPlaceholder',
	precondition: ContextKeyExpr.and(SnippetController2.InSnippetMode, SnippetController2.HasNextTabstop),
	handler: ctrl => ctrl.next(),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib + 30,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyCode.Tab
	}
}));
registerEditorCommand(new CommandCtor({
	id: 'jumpToPrevSnippetPlaceholder',
	precondition: ContextKeyExpr.and(SnippetController2.InSnippetMode, SnippetController2.HasPrevTabstop),
	handler: ctrl => ctrl.prev(),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib + 30,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyMod.Shift | KeyCode.Tab
	}
}));
registerEditorCommand(new CommandCtor({
	id: 'leaveSnippet',
	precondition: SnippetController2.InSnippetMode,
	handler: ctrl => ctrl.cancel(true),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib + 30,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape]
	}
}));

registerEditorCommand(new CommandCtor({
	id: 'acceptSnippet',
	precondition: SnippetController2.InSnippetMode,
	handler: ctrl => ctrl.finish(),
	// kbOpts: {
	// 	weight: KeybindingWeight.EditorContrib + 30,
	// 	kbExpr: EditorContextKeys.textFocus,
	// 	primary: KeyCode.Enter,
	// }
}));
