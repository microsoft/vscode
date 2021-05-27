/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise, RunOnceScheduler } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedError, onUnexpectedExternalError } from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import { IActiveCodeEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { InlineCompletion, InlineCompletionContext, InlineCompletions, InlineCompletionsProvider, InlineCompletionsProviderRegistry, InlineCompletionTriggerKind } from 'vs/editor/common/modes';
import { BaseGhostTextWidgetModel, GhostText, GhostTextWidgetModel } from 'vs/editor/contrib/inlineCompletions/ghostTextWidget';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { ICommandService } from 'vs/platform/commands/common/commands';

export class InlineCompletionsModel extends Disposable implements GhostTextWidgetModel {
	protected readonly onDidChangeEmitter = new Emitter<void>();
	public readonly onDidChange = this.onDidChangeEmitter.event;

	private readonly completionSession = this._register(new MutableDisposable<InlineCompletionsSession>());

	private active: boolean = false;

	constructor(
		private readonly editor: IActiveCodeEditor,
		private readonly commandService: ICommandService
	) {
		super();

		this._register(this.editor.onDidChangeModelContent((e) => {
			if (this.session && !this.session.isValid) {
				this.hide();
			}
			setTimeout(() => {
				this.startSessionIfTriggered();
			}, 0);
		}));

		this._register(this.editor.onDidChangeCursorPosition((e) => {
			if (this.session && !this.session.isValid) {
				this.hide();
			}
		}));
	}

	private get session(): InlineCompletionsSession | undefined {
		return this.completionSession.value;
	}

	public get ghostText(): GhostText | undefined {
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
			this.session?.scheduleUpdate();
		}
	}

	private startSessionIfTriggered(): void {
		if (this.session && this.session.isValid) {
			return;
		}

		this.startSession();
	}

	public startSession(): void {
		if (this.completionSession.value) {
			return;
		}
		this.completionSession.value = new InlineCompletionsSession(this.editor, this.editor.getPosition(), () => this.active, this.commandService);
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
		if (this.session) {
			this.session.commitCurrentCompletion();
		}
	}

	public showNextInlineCompletion(): void {
		if (this.session) {
			this.session.showNextInlineCompletion();
		}
	}

	public showPreviousInlineCompletion(): void {
		if (this.session) {
			this.session.showPreviousInlineCompletion();
		}
	}
}

class CachedInlineCompletion {
	public readonly semanticId: string = JSON.stringify(this.inlineCompletion);
	public lastRange: Range;

	constructor(
		public readonly inlineCompletion: LiveInlineCompletion,
		public readonly decorationId: string,
	) {
		this.lastRange = inlineCompletion.range;
	}
}

class InlineCompletionsSession extends BaseGhostTextWidgetModel {
	public readonly minReservedLineCount = 0;

	private updatePromise: CancelablePromise<LiveInlineCompletions> | undefined = undefined;
	private cachedCompletions: CachedInlineCompletion[] | undefined = undefined;
	private cachedCompletionsSource: LiveInlineCompletions | undefined = undefined;

	private updateSoon = this._register(new RunOnceScheduler(() => this.update(), 50));
	private readonly textModel = this.editor.getModel();

	constructor(
		editor: IActiveCodeEditor,
		private readonly triggerPosition: Position,
		private readonly shouldUpdate: () => boolean,
		private readonly commandService: ICommandService,
	) {
		super(editor);
		this._register(toDisposable(() => {
			this.clearGhostTextPromise();
			this.clearCache();
		}));

		let lastCompletionItem: InlineCompletion | undefined = undefined;
		this._register(this.onDidChange(() => {
			const currentCompletion = this.currentCompletion;
			if (currentCompletion && currentCompletion.sourceInlineCompletion !== lastCompletionItem) {
				lastCompletionItem = currentCompletion.sourceInlineCompletion;

				const provider = currentCompletion.sourceProvider;
				if (provider.handleItemDidShow) {
					provider.handleItemDidShow(currentCompletion.sourceInlineCompletions, lastCompletionItem);
				}
			}
		}));

		this._register(this.editor.onDidChangeModelDecorations(e => {
			if (!this.cachedCompletions) {
				return;
			}

			let hasChanged = false;
			for (const c of this.cachedCompletions) {
				const newRange = this.textModel.getDecorationRange(c.decorationId);
				if (!newRange) {
					onUnexpectedError(new Error('Decoration has no range'));
					continue;
				}
				if (!c.lastRange.equalsRange(newRange)) {
					hasChanged = true;
					c.lastRange = newRange;
				}
			}
			if (hasChanged) {
				this.onDidChangeEmitter.fire();
			}
		}));

		this._register(this.editor.onDidChangeModelContent((e) => {
			this.updateSoon.schedule();
		}));

		this.updateSoon.schedule();
	}

	//#region Selection

	// We use a semantic id to track the selection even if the cache changes.
	private currentlySelectedCompletionId: string | undefined = undefined;

	private getIndexOfCurrentSelection(): number {
		if (!this.currentlySelectedCompletionId || !this.cachedCompletions) {
			return 0;
		}

		return this.cachedCompletions.findIndex(v => v.semanticId === this.currentlySelectedCompletionId);
	}

	private get currentCachedCompletion(): CachedInlineCompletion | undefined {
		if (!this.cachedCompletions) {
			return undefined;
		}
		return this.cachedCompletions[this.getIndexOfCurrentSelection()];
	}

	public showNextInlineCompletion(): void {
		if (this.cachedCompletions && this.cachedCompletions.length > 0) {
			const newIdx = (this.getIndexOfCurrentSelection() + 1) % this.cachedCompletions.length;
			this.currentlySelectedCompletionId = this.cachedCompletions[newIdx].semanticId;
		} else {
			this.currentlySelectedCompletionId = undefined;
		}
		this.onDidChangeEmitter.fire();
	}

	public showPreviousInlineCompletion(): void {
		if (this.cachedCompletions && this.cachedCompletions.length > 0) {
			const newIdx = (this.getIndexOfCurrentSelection() + this.cachedCompletions.length - 1) % this.cachedCompletions.length;
			this.currentlySelectedCompletionId = this.cachedCompletions[newIdx].semanticId;
		} else {
			this.currentlySelectedCompletionId = undefined;
		}
		this.onDidChangeEmitter.fire();
	}

	//#endregion

	public get ghostText(): GhostText | undefined {
		const currentCompletion = this.currentCompletion;
		return currentCompletion ? inlineCompletionToGhostText(currentCompletion, this.editor.getModel()) : undefined;
	}

	get currentCompletion(): LiveInlineCompletion | undefined {
		const completion = this.currentCachedCompletion;
		if (!completion) {
			return undefined;
		}
		return {
			text: completion.inlineCompletion.text,
			range: completion.lastRange,
			command: completion.inlineCompletion.command,
			sourceProvider: completion.inlineCompletion.sourceProvider,
			sourceInlineCompletions: completion.inlineCompletion.sourceInlineCompletions,
			sourceInlineCompletion: completion.inlineCompletion.sourceInlineCompletion,
		};
	}

	get isValid(): boolean {
		return this.editor.getPosition().lineNumber === this.triggerPosition.lineNumber;
	}

	public scheduleUpdate(): void {
		this.updateSoon.schedule();
	}

	private update(): void {
		if (!this.shouldUpdate()) {
			return;
		}

		const position = this.editor.getPosition();
		this.clearGhostTextPromise();
		this.updatePromise = createCancelablePromise(token =>
			provideInlineCompletions(position,
				this.editor.getModel(),
				{ triggerKind: InlineCompletionTriggerKind.Automatic },
				token
			)
		);
		this.updatePromise.then((result) => {
			this.cachedCompletions = [];
			const decorationIds = this.editor.deltaDecorations(
				(this.cachedCompletions || []).map(c => c.decorationId),
				(result.items).map(i => ({
					range: i.range,
					options: {
						description: 'inline-completion-tracking-range'
					},
				}))
			);

			this.cachedCompletionsSource?.dispose();
			this.cachedCompletionsSource = result;
			this.cachedCompletions = result.items.map((item, idx) => new CachedInlineCompletion(item, decorationIds[idx]));
			this.onDidChangeEmitter.fire();
		}, onUnexpectedError);
	}

	private clearCache(): void {
		const completions = this.cachedCompletions;
		if (completions) {
			this.cachedCompletions = undefined;
			this.editor.deltaDecorations(completions.map(c => c.decorationId), []);

			if (!this.cachedCompletionsSource) {
				throw new Error('Unexpected state');
			}
			this.cachedCompletionsSource.dispose();
			this.cachedCompletionsSource = undefined;
		}
	}

	private clearGhostTextPromise(): void {
		if (this.updatePromise) {
			this.updatePromise.cancel();
			this.updatePromise = undefined;
		}
	}

	public takeOwnership(disposable: IDisposable): void {
		this._register(disposable);
	}

	public commitCurrentCompletion(): void {
		const completion = this.currentCompletion;
		if (completion) {
			this.commit(completion);
		}
	}

	public commit(completion: LiveInlineCompletion): void {
		this.clearCache();
		this.editor.executeEdits(
			'inlineCompletions.accept',
			[
				EditOperation.replaceMove(completion.range, completion.text)
			]
		);
		if (completion.command) {
			this.commandService.executeCommand(completion.command.id, ...(completion.command.arguments || [])).then(undefined, onUnexpectedExternalError);
		}

		this.onDidChangeEmitter.fire();
	}
}

export interface NormalizedInlineCompletion extends InlineCompletion {
	range: Range;
}

export function inlineCompletionToGhostText(inlineCompletion: NormalizedInlineCompletion, textModel: ITextModel): GhostText | undefined {
	const valueToBeReplaced = textModel.getValueInRange(inlineCompletion.range);
	if (!inlineCompletion.text.startsWith(valueToBeReplaced)) {
		return undefined;
	}

	const lines = strings.splitLines(inlineCompletion.text.substr(valueToBeReplaced.length));

	return {
		lines,
		position: inlineCompletion.range.getEndPosition()
	};
}

export interface LiveInlineCompletion extends InlineCompletion {
	range: Range;
	sourceProvider: InlineCompletionsProvider;
	sourceInlineCompletion: InlineCompletion;
	sourceInlineCompletions: InlineCompletions;
}

/**
 * Contains no duplicated items.
*/
export interface LiveInlineCompletions extends InlineCompletions<LiveInlineCompletion> {
	dispose(): void;
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

async function provideInlineCompletions(
	position: Position,
	model: ITextModel,
	context: InlineCompletionContext,
	token: CancellationToken = CancellationToken.None
): Promise<LiveInlineCompletions> {
	const defaultReplaceRange = getDefaultRange(position, model);

	const providers = InlineCompletionsProviderRegistry.all(model);
	const results = await Promise.all(
		providers.map(
			async provider => {
				const completions = await provider.provideInlineCompletions(model, position, context, token);
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

	const itemsByHash = new Map<string, LiveInlineCompletion>();
	for (const result of results) {
		const completions = result.completions;
		if (completions) {
			for (const item of completions.items.map<LiveInlineCompletion>(item => ({
				text: item.text,
				range: item.range ? Range.lift(item.range) : defaultReplaceRange,
				command: item.command,
				sourceProvider: result.provider,
				sourceInlineCompletions: completions,
				sourceInlineCompletion: item
			}))) {
				itemsByHash.set(JSON.stringify({ text: item.text, range: item.range }), item);
			}
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
