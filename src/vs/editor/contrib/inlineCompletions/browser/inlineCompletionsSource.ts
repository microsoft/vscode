/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { BugIndicatingError } from 'vs/base/common/errors';
import { matchesSubString } from 'vs/base/common/filters';
import { Disposable, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ITransaction } from 'vs/base/common/observable';
import { disposableObservableValue, transaction } from 'vs/base/common/observableImpl/base';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { InlineCompletionContext, InlineCompletionTriggerKind } from 'vs/editor/common/languages';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { EndOfLinePreference, ITextModel } from 'vs/editor/common/model';
import { IFeatureDebounceInformation } from 'vs/editor/common/services/languageFeatureDebounce';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { SingleTextEdit } from 'vs/editor/contrib/inlineCompletions/browser/singleTextEdit';
import { InlineCompletionItem, InlineCompletionProviderResult, provideInlineCompletions } from 'vs/editor/contrib/inlineCompletions/browser/provideInlineCompletions';

export class InlineCompletionsSource extends Disposable {
	private readonly updateOperation = this._register(new MutableDisposable<UpdateOperation>());

	public readonly inlineCompletions = disposableObservableValue<UpToDateInlineCompletions | undefined>('inlineCompletions', undefined);
	public readonly suggestWidgetInlineCompletions = disposableObservableValue<UpToDateInlineCompletions | undefined>('suggestWidgetInlineCompletions', undefined);


	constructor(
		private readonly textModel: ITextModel,
		private readonly _debounceValue: IFeatureDebounceInformation,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ILanguageConfigurationService private readonly languageConfigurationService: ILanguageConfigurationService,
	) {
		super();

		this._register(this.textModel.onDidChangeContent(() => {
			this.updateOperation.clear();
		}));
	}

	public clear(tx: ITransaction): void {
		this.updateOperation.clear();
		this.inlineCompletions.set(undefined, tx);
		this.suggestWidgetInlineCompletions.set(undefined, tx);
	}

	public clearSuggestWidgetInlineCompletions(): void {
		if (this.updateOperation.value?.request.context.selectedSuggestionInfo) {
			this.updateOperation.clear();
		}
		this.suggestWidgetInlineCompletions.set(undefined, undefined);
	}

	public update(position: Position, context: InlineCompletionContext, activeInlineCompletion: InlineCompletionWithUpdatedRange | undefined): Promise<boolean> {
		const request = new UpdateRequest(position, context, this.textModel.getVersionId());

		const target = context.selectedSuggestionInfo ? this.suggestWidgetInlineCompletions : this.inlineCompletions;

		if (this.updateOperation.value?.request.satisfies(request)) {
			return this.updateOperation.value.promise;
		} else if (target.get()?.request.satisfies(request)) {
			return Promise.resolve(true);
		}

		const updateOngoing = !!this.updateOperation.value;
		this.updateOperation.clear();

		const source = new CancellationTokenSource();

		const promise = (async () => {
			const shouldDebounce = updateOngoing || context.triggerKind === InlineCompletionTriggerKind.Automatic;
			if (shouldDebounce) {
				// This debounces the operation
				await wait(this._debounceValue.get(this.textModel));
			}

			if (source.token.isCancellationRequested || this.textModel.getVersionId() !== request.versionId) {
				return false;
			}

			const startTime = new Date();
			const updatedCompletions = await provideInlineCompletions(
				this.languageFeaturesService.inlineCompletionsProvider,
				position,
				this.textModel,
				context,
				source.token,
				this.languageConfigurationService
			);

			if (source.token.isCancellationRequested || this.textModel.getVersionId() !== request.versionId) {
				return false;
			}

			const endTime = new Date();
			this._debounceValue.update(this.textModel, endTime.getTime() - startTime.getTime());

			const completions = new UpToDateInlineCompletions(updatedCompletions, request, this.textModel);
			if (
				activeInlineCompletion && activeInlineCompletion.updatedRange.containsPosition(position)
				&& activeInlineCompletion.isVisible(this.textModel, position)
				&& !activeInlineCompletion.isSmallerThanOriginal()
				&& !updatedCompletions.has(activeInlineCompletion.toInlineCompletion())
			) {
				completions.prepend(activeInlineCompletion.inlineCompletion, activeInlineCompletion.updatedRange, true);
			}

			transaction(tx => {
				target.set(completions, tx);
			});
			this.updateOperation.clear();

			return true;
		})();

		const updateOperation = new UpdateOperation(request, source, promise);
		this.updateOperation.value = updateOperation;

		return promise;
	}
}

function wait(ms: number, cancellationToken?: CancellationToken): Promise<void> {
	return new Promise(resolve => {
		let d: IDisposable | undefined = undefined;
		const handle = setTimeout(() => {
			if (d) { d.dispose(); }
			resolve();
		}, ms);
		if (cancellationToken) {
			d = cancellationToken.onCancellationRequested(() => {
				clearTimeout(handle);
				if (d) { d.dispose(); }
				resolve();
			});
		}
	});
}

class UpdateRequest {
	constructor(
		public readonly position: Position,
		public readonly context: InlineCompletionContext,
		public readonly versionId: number,
	) {
	}

	public satisfies(other: UpdateRequest): boolean {
		return this.position.equals(other.position)
			&& equals(this.context.selectedSuggestionInfo, other.context.selectedSuggestionInfo, (v1, v2) => v1.equals(v2))
			&& (other.context.triggerKind === InlineCompletionTriggerKind.Automatic
				|| this.context.triggerKind === InlineCompletionTriggerKind.Explicit)
			&& this.versionId === other.versionId;
	}
}

function equals<T>(v1: T | undefined, v2: T | undefined, equals: (v1: T, v2: T) => boolean): boolean {
	if (!v1 || !v2) {
		return v1 === v2;
	}
	return equals(v1, v2);
}

class UpdateOperation implements IDisposable {
	constructor(
		public readonly request: UpdateRequest,
		public readonly cancellationTokenSource: CancellationTokenSource,
		public readonly promise: Promise<boolean>,
	) {
	}

	dispose() {
		this.cancellationTokenSource.cancel();
	}
}

export class UpToDateInlineCompletions implements IDisposable {
	private lastVersionId: number = -1;
	private readonly inlineCompletions: InlineCompletionWithUpdatedRange[];
	private refCount = 1;
	private readonly prependedInlineCompletionItems: InlineCompletionItem[] = [];

	constructor(
		private readonly inlineCompletionProviderResult: InlineCompletionProviderResult,
		public readonly request: UpdateRequest,
		private readonly textModel: ITextModel
	) {
		const ids = textModel.deltaDecorations([], inlineCompletionProviderResult.completions.map(i => ({
			range: i.range,
			options: {
				description: 'inline-completion-tracking-range'
			},
		})));

		this.inlineCompletions = inlineCompletionProviderResult.completions.map(
			(i, index) => new InlineCompletionWithUpdatedRange(i, ids[index])
		);
	}

	public prepend(inlineCompletion: InlineCompletionItem, range: Range, addRefToSource: boolean): void {
		if (addRefToSource) {
			inlineCompletion.source.addRef();
		}

		const id = this.textModel.deltaDecorations([], [{
			range,
			options: {
				description: 'inline-completion-tracking-range'
			},
		}])[0];
		this.inlineCompletions.unshift(new InlineCompletionWithUpdatedRange(inlineCompletion, id, range));
		this.prependedInlineCompletionItems.push(inlineCompletion);
	}

	public clone(): this {
		this.refCount++;
		return this;
	}

	public dispose(): void {
		this.refCount--;
		if (this.refCount === 0) {
			this.textModel.deltaDecorations(this.inlineCompletions.map(i => i.decorationId), []);
			this.inlineCompletionProviderResult.dispose();
			for (const i of this.prependedInlineCompletionItems) {
				i.source.removeRef();
			}
		}
	}

	/**
	 * The ranges of the inline completions are extended as the user typed.
	 */
	public getInlineCompletions(versionId: number): readonly InlineCompletionWithUpdatedRange[] {
		if (versionId !== this.textModel.getVersionId()) {
			throw new BugIndicatingError();
		}
		if (this.textModel.getVersionId() !== this.lastVersionId) {
			this.inlineCompletions.forEach(i => i.updateRange(this.textModel));
			this.lastVersionId = this.textModel.getVersionId();
		}
		return this.inlineCompletions;
	}
}

export class InlineCompletionWithUpdatedRange {
	public readonly semanticId = JSON.stringify([this.inlineCompletion.filterText, this.inlineCompletion.insertText, this.inlineCompletion.range.getStartPosition().toString()]);
	private _updatedRange: Range;
	public get updatedRange(): Range { return this._updatedRange; }

	constructor(
		public readonly inlineCompletion: InlineCompletionItem,
		public readonly decorationId: string,
		initialRange?: Range,
	) {
		this._updatedRange = initialRange ?? inlineCompletion.range;
	}

	public updateRange(textModel: ITextModel): void {
		const range = textModel.getDecorationRange(this.decorationId);
		if (!range) {
			throw new BugIndicatingError();
		}
		this._updatedRange = range;
	}

	public toInlineCompletion(): InlineCompletionItem {
		return this.inlineCompletion.withRange(this.updatedRange);
	}

	public toSingleTextEdit(): SingleTextEdit {
		return new SingleTextEdit(this.updatedRange, this.inlineCompletion.insertText);
	}

	public toFilterTextReplacement(): SingleTextEdit {
		return new SingleTextEdit(this.updatedRange, this.inlineCompletion.filterText);
	}

	public isVisible(model: ITextModel, cursorPosition: Position): boolean {
		const minimizedReplacement = this.toFilterTextReplacement().removeCommonPrefix(model);

		if (!this.inlineCompletion.range.getStartPosition().equals(this.updatedRange.getStartPosition())) {
			return false;
		}

		if (cursorPosition.lineNumber !== minimizedReplacement.range.startLineNumber) {
			return false;
		}

		const originalValue = model.getValueInRange(minimizedReplacement.range, EndOfLinePreference.LF).toLowerCase();
		const filterText = this.inlineCompletion.filterText.toLowerCase();

		const cursorPosIndex = Math.max(0, cursorPosition.column - minimizedReplacement.range.startColumn);

		let filterTextBefore = filterText.substring(0, cursorPosIndex);
		let filterTextAfter = filterText.substring(cursorPosIndex);

		let originalValueBefore = originalValue.substring(0, cursorPosIndex);
		let originalValueAfter = originalValue.substring(cursorPosIndex);

		const originalValueIndent = model.getLineIndentColumn(minimizedReplacement.range.startLineNumber);
		if (this.updatedRange.startColumn <= originalValueIndent) {
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
			&& !!matchesSubString(originalValueAfter, filterTextAfter);
	}

	public isSmallerThanOriginal(): boolean {
		return length(this.updatedRange).isBefore(length(this.inlineCompletion.range));
	}
}

function length(range: Range): Position {
	if (range.startLineNumber === range.endLineNumber) {
		return new Position(1, 1 + range.endColumn - range.startColumn);
	} else {
		return new Position(1 + range.endLineNumber - range.startLineNumber, range.endColumn);
	}
}
