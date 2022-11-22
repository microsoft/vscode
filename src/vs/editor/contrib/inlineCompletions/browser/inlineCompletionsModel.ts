/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise, RunOnceScheduler } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedError, onUnexpectedExternalError } from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { CoreEditingCommands } from 'vs/editor/browser/coreCommands';
import { IActiveCodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { Command, InlineCompletion, InlineCompletionContext, InlineCompletions, InlineCompletionsProvider, InlineCompletionTriggerKind } from 'vs/editor/common/languages';
import { BaseGhostTextWidgetModel, GhostText, GhostTextReplacement, GhostTextWidgetModel } from 'vs/editor/contrib/inlineCompletions/browser/ghostText';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { inlineSuggestCommitId } from 'vs/editor/contrib/inlineCompletions/browser/consts';
import { SharedInlineCompletionCache } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextModel';
import { inlineCompletionToGhostText, NormalizedInlineCompletion } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionToGhostText';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { fixBracketsInLine } from 'vs/editor/common/model/bracketPairsTextModelPart/fixBrackets';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IFeatureDebounceInformation, ILanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { SnippetParser } from 'vs/editor/contrib/snippet/browser/snippetParser';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { assertNever } from 'vs/base/common/assert';
import { matchesSubString } from 'vs/base/common/filters';
import { getReadonlyEmptyArray } from 'vs/editor/contrib/inlineCompletions/browser/utils';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';

export class InlineCompletionsModel extends Disposable implements GhostTextWidgetModel {
	protected readonly onDidChangeEmitter = new Emitter<void>();
	public readonly onDidChange = this.onDidChangeEmitter.event;

	public readonly completionSession = this._register(
		new MutableDisposable<InlineCompletionsSession>()
	);

	private active: boolean = false;
	private disposed = false;
	private readonly debounceValue = this.debounceService.for(
		this.languageFeaturesService.inlineCompletionsProvider,
		'InlineCompletionsDebounce',
		{ min: 50, max: 50 }
	);

	constructor(
		private readonly editor: IActiveCodeEditor,
		private readonly cache: SharedInlineCompletionCache,
		@ICommandService private readonly commandService: ICommandService,
		@ILanguageConfigurationService private readonly languageConfigurationService: ILanguageConfigurationService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ILanguageFeatureDebounceService private readonly debounceService: ILanguageFeatureDebounceService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		this._register(
			commandService.onDidExecuteCommand((e) => {
				// These commands don't trigger onDidType.
				const commands = new Set([
					CoreEditingCommands.Tab.id,
					CoreEditingCommands.DeleteLeft.id,
					CoreEditingCommands.DeleteRight.id,
					inlineSuggestCommitId,
					'acceptSelectedSuggestion',
				]);
				if (commands.has(e.commandId) && editor.hasTextFocus()) {
					this.handleUserInput();
				}
			})
		);

		this._register(
			this.editor.onDidType((e) => {
				this.handleUserInput();
			})
		);

		this._register(
			this.editor.onDidChangeCursorPosition((e) => {
				if (e.reason === CursorChangeReason.Explicit ||
					this.session && !this.session.isValid) {
					this.hide();
				}
			})
		);

		this._register(
			toDisposable(() => {
				this.disposed = true;
			})
		);

		this._register(
			this.editor.onDidBlurEditorWidget(() => {
				// This is a hidden setting very useful for debugging
				if (configurationService.getValue('editor.inlineSuggest.hideOnBlur')) {
					return;
				}
				this.hide();
			})
		);
	}

	private handleUserInput() {
		if (this.session && !this.session.isValid) {
			this.hide();
		}
		setTimeout(() => {
			if (this.disposed) {
				return;
			}
			// Wait for the cursor update that happens in the same iteration loop iteration
			this.startSessionIfTriggered();
		}, 0);
	}

	private get session(): InlineCompletionsSession | undefined {
		return this.completionSession.value;
	}

	public get ghostText(): GhostText | GhostTextReplacement | undefined {
		return this.session?.ghostText;
	}

	public get minReservedLineCount(): number {
		return this.session ? this.session.minReservedLineCount : 0;
	}

	public get expanded(): boolean {
		return this.session ? this.session.expanded : false;
	}

	public setExpanded(expanded: boolean): void {
		this.session?.setExpanded(expanded);
	}

	public setActive(active: boolean) {
		this.active = active;
		if (active) {
			this.session?.scheduleAutomaticUpdate();
		}
	}

	private startSessionIfTriggered(): void {
		const suggestOptions = this.editor.getOption(EditorOption.inlineSuggest);
		if (!suggestOptions.enabled) {
			return;
		}

		if (this.session && this.session.isValid) {
			return;
		}

		this.trigger(InlineCompletionTriggerKind.Automatic);
	}

	public trigger(triggerKind: InlineCompletionTriggerKind): void {
		if (this.completionSession.value) {
			if (triggerKind === InlineCompletionTriggerKind.Explicit) {
				void this.completionSession.value.ensureUpdateWithExplicitContext();
			}
			return;
		}
		this.completionSession.value = new InlineCompletionsSession(
			this.editor,
			this.editor.getPosition(),
			() => this.active,
			this.commandService,
			this.cache,
			triggerKind,
			this.languageConfigurationService,
			this.languageFeaturesService.inlineCompletionsProvider,
			this.debounceValue
		);
		this.completionSession.value.takeOwnership(
			this.completionSession.value.onDidChange(() => {
				this.onDidChangeEmitter.fire();
			})
		);
	}

	public hide(): void {
		this.completionSession.clear();
		this.onDidChangeEmitter.fire();
	}

	public commitCurrentSuggestion(): void {
		// Don't dispose the session, so that after committing, more suggestions are shown.
		this.session?.commitCurrentCompletion();
	}

	public showNext(): void {
		this.session?.showNextInlineCompletion();
	}

	public showPrevious(): void {
		this.session?.showPreviousInlineCompletion();
	}

	public async hasMultipleInlineCompletions(): Promise<boolean> {
		const result = await this.session?.hasMultipleInlineCompletions();
		return result !== undefined ? result : false;
	}
}

export class InlineCompletionsSession extends BaseGhostTextWidgetModel {
	public readonly minReservedLineCount = 0;

	private readonly updateOperation = this._register(new MutableDisposable<UpdateOperation>());

	private readonly updateSoon = this._register(new RunOnceScheduler(() => {
		const triggerKind = this.initialTriggerKind;
		// All subsequent triggers are automatic.
		this.initialTriggerKind = InlineCompletionTriggerKind.Automatic;
		return this.update(triggerKind);
	}, 50));

	constructor(
		editor: IActiveCodeEditor,
		private readonly triggerPosition: Position,
		private readonly shouldUpdate: () => boolean,
		private readonly commandService: ICommandService,
		private readonly cache: SharedInlineCompletionCache,
		private initialTriggerKind: InlineCompletionTriggerKind,
		private readonly languageConfigurationService: ILanguageConfigurationService,
		private readonly registry: LanguageFeatureRegistry<InlineCompletionsProvider>,
		private readonly debounce: IFeatureDebounceInformation,
	) {
		super(editor);

		let lastCompletionItem: InlineCompletion | undefined = undefined;
		this._register(this.onDidChange(() => {
			const currentCompletion = this.currentCompletion;
			if (currentCompletion && currentCompletion.sourceInlineCompletion !== lastCompletionItem) {
				lastCompletionItem = currentCompletion.sourceInlineCompletion;

				const provider = currentCompletion.sourceProvider;
				provider.handleItemDidShow?.(currentCompletion.sourceInlineCompletions, lastCompletionItem);
			}
		}));

		this._register(toDisposable(() => {
			this.cache.clear();
		}));

		this._register(this.editor.onDidChangeCursorPosition((e) => {
			if (e.reason === CursorChangeReason.Explicit) {
				return;
			}
			// Ghost text depends on the cursor position
			this.cache.value?.updateRanges();
			if (this.cache.value) {
				this.updateFilteredInlineCompletions();
				this.onDidChangeEmitter.fire();
			}
		}));

		this._register(this.editor.onDidChangeModelContent((e) => {
			// Call this in case `onDidChangeModelContent` calls us first.
			this.cache.value?.updateRanges();
			this.updateFilteredInlineCompletions();
			this.scheduleAutomaticUpdate();
		}));

		this._register(this.registry.onDidChange(() => {
			this.updateSoon.schedule(this.debounce.get(this.editor.getModel()));
		}));

		this.scheduleAutomaticUpdate();
	}

	private filteredCompletions: readonly CachedInlineCompletion[] = [];

	private updateFilteredInlineCompletions() {
		if (!this.cache.value) {
			this.filteredCompletions = [];
			return;
		}

		const model = this.editor.getModel();
		const cursorPosition = model.validatePosition(this.editor.getPosition());
		this.filteredCompletions = this.cache.value.completions.filter(c => {
			const originalValue = model.getValueInRange(c.synchronizedRange).toLowerCase();
			const filterText = c.inlineCompletion.filterText.toLowerCase();

			const indent = model.getLineIndentColumn(c.synchronizedRange.startLineNumber);


			const cursorPosIndex = Math.max(0, cursorPosition.column - c.synchronizedRange.startColumn);

			let filterTextBefore = filterText.substring(0, cursorPosIndex);
			let filterTextAfter = filterText.substring(cursorPosIndex);

			let originalValueBefore = originalValue.substring(0, cursorPosIndex);
			let originalValueAfter = originalValue.substring(cursorPosIndex);

			if (c.synchronizedRange.startColumn <= indent) {
				// Remove indentation
				originalValueBefore = originalValueBefore.trimStart();
				if (originalValueBefore.length === 0) {
					originalValueAfter = originalValueAfter.trimStart();
				}
				filterTextBefore = filterTextBefore.trimStart();
				if (filterTextBefore.length === 0) {
					filterTextAfter = filterTextAfter.trimStart();
				}
			}

			return filterTextBefore.startsWith(originalValueBefore)
				&& matchesSubString(originalValueAfter, filterTextAfter);
		});
	}

	//#region Selection

	// We use a semantic id to track the selection even if the cache changes.
	private currentlySelectedCompletionId: string | undefined = undefined;

	private fixAndGetIndexOfCurrentSelection(): number {
		if (!this.currentlySelectedCompletionId || !this.cache.value) {
			return 0;
		}
		if (this.cache.value.completions.length === 0) {
			// don't reset the selection in this case
			return 0;
		}

		const idx = this.filteredCompletions.findIndex(v => v.semanticId === this.currentlySelectedCompletionId);
		if (idx === -1) {
			// Reset the selection so that the selection does not jump back when it appears again
			this.currentlySelectedCompletionId = undefined;
			return 0;
		}
		return idx;
	}

	private get currentCachedCompletion(): CachedInlineCompletion | undefined {
		if (!this.cache.value) {
			return undefined;
		}
		return this.filteredCompletions[this.fixAndGetIndexOfCurrentSelection()];
	}

	public async showNextInlineCompletion(): Promise<void> {
		await this.ensureUpdateWithExplicitContext();

		const completions = this.filteredCompletions || [];
		if (completions.length > 0) {
			const newIdx = (this.fixAndGetIndexOfCurrentSelection() + 1) % completions.length;
			this.currentlySelectedCompletionId = completions[newIdx].semanticId;
		} else {
			this.currentlySelectedCompletionId = undefined;
		}
		this.onDidChangeEmitter.fire();
	}

	public async showPreviousInlineCompletion(): Promise<void> {
		await this.ensureUpdateWithExplicitContext();

		const completions = this.filteredCompletions || [];
		if (completions.length > 0) {
			const newIdx = (this.fixAndGetIndexOfCurrentSelection() + completions.length - 1) % completions.length;
			this.currentlySelectedCompletionId = completions[newIdx].semanticId;
		} else {
			this.currentlySelectedCompletionId = undefined;
		}
		this.onDidChangeEmitter.fire();
	}

	public async ensureUpdateWithExplicitContext(): Promise<void> {
		if (this.updateOperation.value) {
			// Restart or wait for current update operation
			if (this.updateOperation.value.triggerKind === InlineCompletionTriggerKind.Explicit) {
				await this.updateOperation.value.promise;
			} else {
				await this.update(InlineCompletionTriggerKind.Explicit);
			}
		} else if (this.cache.value?.triggerKind !== InlineCompletionTriggerKind.Explicit) {
			// Refresh cache
			await this.update(InlineCompletionTriggerKind.Explicit);
		}
	}

	public async hasMultipleInlineCompletions(): Promise<boolean> {
		await this.ensureUpdateWithExplicitContext();
		return (this.cache.value?.completions.length || 0) > 1;
	}

	//#endregion

	public get ghostText(): GhostText | GhostTextReplacement | undefined {
		const currentCompletion = this.currentCompletion;
		if (!currentCompletion) {
			return undefined;
		}
		const cursorPosition = this.editor.getPosition();
		if (currentCompletion.range.getEndPosition().isBefore(cursorPosition)) {
			return undefined;
		}

		const mode = this.editor.getOptions().get(EditorOption.inlineSuggest).mode;

		const ghostText = inlineCompletionToGhostText(currentCompletion, this.editor.getModel(), mode, cursorPosition);
		if (ghostText) {
			if (ghostText.isEmpty()) {
				return undefined;
			}
			return ghostText;
		}
		return new GhostTextReplacement(
			currentCompletion.range.startLineNumber,
			currentCompletion.range.startColumn,
			currentCompletion.range.endColumn - currentCompletion.range.startColumn,
			currentCompletion.insertText.split('\n'),
			0
		);
	}

	get currentCompletion(): TrackedInlineCompletion | undefined {
		const completion = this.currentCachedCompletion;
		if (!completion) {
			return undefined;
		}
		return completion.toLiveInlineCompletion();
	}

	get isValid(): boolean {
		return this.editor.getPosition().lineNumber === this.triggerPosition.lineNumber;
	}

	public scheduleAutomaticUpdate(): void {
		// Since updateSoon debounces, starvation can happen.
		// To prevent stale cache, we clear the current update operation.
		this.updateOperation.clear();
		this.updateSoon.schedule(this.debounce.get(this.editor.getModel()));
	}

	private async update(triggerKind: InlineCompletionTriggerKind): Promise<void> {
		if (!this.shouldUpdate()) {
			return;
		}

		const position = this.editor.getPosition();

		const startTime = new Date();

		const promise = createCancelablePromise(async token => {
			let result;
			try {
				result = await provideInlineCompletions(this.registry, position,
					this.editor.getModel(),
					{ triggerKind, selectedSuggestionInfo: undefined },
					token,
					this.languageConfigurationService
				);

				const endTime = new Date();
				this.debounce.update(this.editor.getModel(), endTime.getTime() - startTime.getTime());

			} catch (e) {
				onUnexpectedError(e);
				return;
			}

			if (token.isCancellationRequested) {
				return;
			}

			this.cache.setValue(
				this.editor,
				result,
				triggerKind
			);
			this.updateFilteredInlineCompletions();
			this.onDidChangeEmitter.fire();
		});
		const operation = new UpdateOperation(promise, triggerKind);
		this.updateOperation.value = operation;
		await promise;
		if (this.updateOperation.value === operation) {
			this.updateOperation.clear();
		}
	}

	public takeOwnership(disposable: IDisposable): void {
		this._register(disposable);
	}

	public commitCurrentCompletion(): void {
		const ghostText = this.ghostText;
		if (!ghostText) {
			// No ghost text was shown for this completion.
			// Thus, we don't want to commit anything.
			return;
		}
		const completion = this.currentCompletion;
		if (completion) {
			this.commit(completion);
		}
	}

	public commit(completion: TrackedInlineCompletion): void {
		// Mark the cache as stale, but don't dispose it yet,
		// otherwise command args might get disposed.
		const cache = this.cache.clearAndLeak();

		this.editor.pushUndoStop();
		if (completion.snippetInfo) {
			this.editor.executeEdits(
				'inlineSuggestion.accept',
				[
					EditOperation.replaceMove(completion.range, ''),
					...completion.additionalTextEdits
				]
			);
			this.editor.setPosition(completion.snippetInfo.range.getStartPosition());
			SnippetController2.get(this.editor)?.insert(completion.snippetInfo.snippet, { undoStopBefore: false });
		} else {
			this.editor.executeEdits(
				'inlineSuggestion.accept',
				[
					EditOperation.replaceMove(completion.range, completion.insertText),
					...completion.additionalTextEdits
				]
			);
		}

		if (completion.command) {
			this.commandService
				.executeCommand(completion.command.id, ...(completion.command.arguments || []))
				.finally(() => {
					cache?.dispose();
				})
				.then(undefined, onUnexpectedExternalError);
		} else {
			cache?.dispose();
		}

		this.onDidChangeEmitter.fire();
	}

	public get commands(): Command[] {
		const lists = new Set(this.cache.value?.completions.map(c => c.inlineCompletion.sourceInlineCompletions) || []);
		return [...lists].flatMap(l => l.commands || []);
	}
}

export class UpdateOperation implements IDisposable {
	constructor(public readonly promise: CancelablePromise<void>, public readonly triggerKind: InlineCompletionTriggerKind) {
	}

	dispose() {
		this.promise.cancel();
	}
}

/**
 * The cache keeps itself in sync with the editor.
 * It also owns the completions result and disposes it when the cache is diposed.
*/
export class SynchronizedInlineCompletionsCache extends Disposable {
	public readonly completions: readonly CachedInlineCompletion[];
	private isDisposing = false;

	constructor(
		completionsSource: TrackedInlineCompletions,
		private readonly editor: IActiveCodeEditor,
		private readonly onChange: () => void,
		public readonly triggerKind: InlineCompletionTriggerKind,
	) {
		super();

		const decorationIds = editor.changeDecorations((changeAccessor) => {
			return changeAccessor.deltaDecorations(
				[],
				completionsSource.items.map(i => ({
					range: i.range,
					options: {
						description: 'inline-completion-tracking-range'
					},
				}))
			);
		});

		this._register(toDisposable(() => {
			this.isDisposing = true;
			editor.removeDecorations(decorationIds);
		}));

		this.completions = completionsSource.items.map((c, idx) => new CachedInlineCompletion(c, decorationIds[idx]));

		this._register(editor.onDidChangeModelContent(() => {
			this.updateRanges();
		}));

		this._register(completionsSource);
	}

	public updateRanges(): void {
		if (this.isDisposing) {
			return;
		}

		let hasChanged = false;
		const model = this.editor.getModel();
		for (const c of this.completions) {
			const newRange = model.getDecorationRange(c.decorationId);
			if (!newRange) {
				onUnexpectedError(new Error('Decoration has no range'));
				continue;
			}
			if (!c.synchronizedRange.equalsRange(newRange)) {
				hasChanged = true;
				c.synchronizedRange = newRange;
			}
		}
		if (hasChanged) {
			this.onChange();
		}
	}
}

class CachedInlineCompletion {
	public readonly semanticId: string = JSON.stringify({
		text: this.inlineCompletion.insertText,
		abbreviation: this.inlineCompletion.filterText,
		startLine: this.inlineCompletion.range.startLineNumber,
		startColumn: this.inlineCompletion.range.startColumn,
		command: this.inlineCompletion.command
	});

	/**
	 * The range, synchronized with text model changes.
	*/
	public synchronizedRange: Range;

	constructor(
		public readonly inlineCompletion: TrackedInlineCompletion,
		public readonly decorationId: string,
	) {
		this.synchronizedRange = inlineCompletion.range;
	}

	public toLiveInlineCompletion(): TrackedInlineCompletion | undefined {
		return {
			insertText: this.inlineCompletion.insertText,
			range: this.synchronizedRange,
			command: this.inlineCompletion.command,
			sourceProvider: this.inlineCompletion.sourceProvider,
			sourceInlineCompletions: this.inlineCompletion.sourceInlineCompletions,
			sourceInlineCompletion: this.inlineCompletion.sourceInlineCompletion,
			snippetInfo: this.inlineCompletion.snippetInfo,
			filterText: this.inlineCompletion.filterText,
			additionalTextEdits: this.inlineCompletion.additionalTextEdits,
		};
	}
}

export async function provideInlineCompletions(
	registry: LanguageFeatureRegistry<InlineCompletionsProvider>,
	position: Position,
	model: ITextModel,
	context: InlineCompletionContext,
	token: CancellationToken = CancellationToken.None,
	languageConfigurationService?: ILanguageConfigurationService
): Promise<TrackedInlineCompletions> {
	const defaultReplaceRange = getDefaultRange(position, model);

	const providers = registry.all(model);
	const results = await Promise.all(
		providers.map(
			async provider => {
				const completions = await Promise.resolve(provider.provideInlineCompletions(model, position, context, token)).catch(onUnexpectedExternalError);
				return ({
					completions,
					provider,
					dispose: () => {
						if (completions) {
							provider.freeInlineCompletions(completions);
						}
					}
				});
			}
		)
	);

	const itemsByHash = new Map<string, TrackedInlineCompletion>();
	for (const result of results) {
		const completions = result.completions;
		if (!completions) {
			continue;
		}

		for (const item of completions.items) {
			let range = item.range ? Range.lift(item.range) : defaultReplaceRange;

			if (range.startLineNumber !== range.endLineNumber) {
				// Ignore invalid ranges.
				continue;
			}

			let insertText: string;
			let snippetInfo: {
				snippet: string;
				/* Could be different than the main range */
				range: Range;
			}
				| undefined;

			if (typeof item.insertText === 'string') {
				insertText = item.insertText;

				if (languageConfigurationService && item.completeBracketPairs) {
					insertText = closeBrackets(
						insertText,
						range.getStartPosition(),
						model,
						languageConfigurationService
					);

					// Modify range depending on if brackets are added or removed
					const diff = insertText.length - item.insertText.length;
					if (diff !== 0) {
						range = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn + diff);
					}
				}

				snippetInfo = undefined;
			} else if ('snippet' in item.insertText) {
				const preBracketCompletionLength = item.insertText.snippet.length;

				if (languageConfigurationService && item.completeBracketPairs) {
					item.insertText.snippet = closeBrackets(
						item.insertText.snippet,
						range.getStartPosition(),
						model,
						languageConfigurationService
					);

					// Modify range depending on if brackets are added or removed
					const diff = item.insertText.snippet.length - preBracketCompletionLength;
					if (diff !== 0) {
						range = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn + diff);
					}
				}

				const snippet = new SnippetParser().parse(item.insertText.snippet);
				insertText = snippet.toString();

				snippetInfo = {
					snippet: item.insertText.snippet,
					range: range
				};
			} else {
				assertNever(item.insertText);
			}

			const trackedItem: TrackedInlineCompletion = ({
				insertText,
				snippetInfo,
				range,
				command: item.command,
				sourceProvider: result.provider,
				sourceInlineCompletions: completions,
				sourceInlineCompletion: item,
				filterText: item.filterText || insertText,
				additionalTextEdits: item.additionalTextEdits || getReadonlyEmptyArray()
			});

			itemsByHash.set(JSON.stringify({ insertText, range: item.range }), trackedItem);
		}
	}

	return {
		items: [...itemsByHash.values()],
		dispose: () => {
			for (const result of results) {
				result.dispose();
			}
		},
	};
}

/**
 * Contains no duplicated items and can be disposed.
*/
export interface TrackedInlineCompletions {
	readonly items: readonly TrackedInlineCompletion[];
	dispose(): void;
}

/**
 * A normalized inline completion that tracks which inline completion it has been constructed from.
*/
export interface TrackedInlineCompletion extends NormalizedInlineCompletion {
	sourceProvider: InlineCompletionsProvider;

	/**
	 * A reference to the original inline completion this inline completion has been constructed from.
	 * Used for event data to ensure referential equality.
	*/
	sourceInlineCompletion: InlineCompletion;

	/**
	 * A reference to the original inline completion list this inline completion has been constructed from.
	 * Used for event data to ensure referential equality.
	*/
	sourceInlineCompletions: InlineCompletions;
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

function closeBrackets(text: string, position: Position, model: ITextModel, languageConfigurationService: ILanguageConfigurationService): string {
	const lineStart = model.getLineContent(position.lineNumber).substring(0, position.column - 1);
	const newLine = lineStart + text;

	const newTokens = model.tokenization.tokenizeLineWithEdit(position, newLine.length - (position.column - 1), text);
	const slicedTokens = newTokens?.sliceAndInflate(position.column - 1, newLine.length, 0);
	if (!slicedTokens) {
		return text;
	}

	const newText = fixBracketsInLine(slicedTokens, languageConfigurationService);

	return newText;
}
