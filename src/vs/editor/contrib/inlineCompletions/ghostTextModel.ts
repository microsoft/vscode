/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IReference, MutableDisposable } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor } from 'vs/editor/browser/editorBrowser';
import { InlineCompletionsModel } from 'vs/editor/contrib/inlineCompletions/inlineCompletionsModel';
import { SuggestWidgetAdapterModel } from 'vs/editor/contrib/inlineCompletions/suggestWidgetAdapterModel';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { Emitter } from 'vs/base/common/event';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { createDisposableRef } from 'vs/editor/contrib/inlineCompletions/utils';
import { GhostTextWidgetModel, GhostText } from 'vs/editor/contrib/inlineCompletions/ghostText';

export abstract class DelegatingModel extends Disposable implements GhostTextWidgetModel {
	private readonly onDidChangeEmitter = new Emitter<void>();
	public readonly onDidChange = this.onDidChangeEmitter.event;

	private hasCachedGhostText = false;
	private cachedGhostText: GhostText | undefined;

	private readonly currentModelRef = this._register(new MutableDisposable<IReference<GhostTextWidgetModel>>());
	protected get targetModel(): GhostTextWidgetModel | undefined {
		return this.currentModelRef.value?.object;
	}

	protected setTargetModel(model: GhostTextWidgetModel | undefined): void {
		if (this.currentModelRef.value?.object === model) {
			return;
		}
		this.currentModelRef.clear();
		this.currentModelRef.value = model ? createDisposableRef(model, model.onDidChange(() => {
			this.hasCachedGhostText = false;
			this.onDidChangeEmitter.fire();
		})) : undefined;

		this.hasCachedGhostText = false;
		this.onDidChangeEmitter.fire();
	}

	public get ghostText(): GhostText | undefined {
		if (!this.hasCachedGhostText) {
			this.cachedGhostText = this.currentModelRef.value?.object?.ghostText;
			this.hasCachedGhostText = true;
		}
		return this.cachedGhostText;
	}

	public setExpanded(expanded: boolean): void {
		this.targetModel?.setExpanded(expanded);
	}

	public get expanded(): boolean {
		return this.targetModel ? this.targetModel.expanded : false;
	}

	public get minReservedLineCount(): number {
		return this.targetModel ? this.targetModel.minReservedLineCount : 0;
	}
}

/**
 * A ghost text model that is both driven by inline completions and the suggest widget.
*/
export class GhostTextModel extends DelegatingModel implements GhostTextWidgetModel {
	public readonly suggestWidgetAdapterModel = this._register(new SuggestWidgetAdapterModel(this.editor));
	public readonly inlineCompletionsModel = this._register(new InlineCompletionsModel(this.editor, this.commandService));

	public get activeInlineCompletionsModel(): InlineCompletionsModel | undefined {
		if (this.targetModel === this.inlineCompletionsModel) {
			return this.inlineCompletionsModel;
		}
		return undefined;
	}

	constructor(
		private readonly editor: IActiveCodeEditor,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();

		this._register(this.suggestWidgetAdapterModel.onDidChange(() => {
			this.updateModel();
		}));
		this.updateModel();
	}

	private updateModel(): void {
		this.setTargetModel(
			this.suggestWidgetAdapterModel.isActive
				? this.suggestWidgetAdapterModel
				: this.inlineCompletionsModel
		);
		this.inlineCompletionsModel.setActive(this.targetModel === this.inlineCompletionsModel);
	}

	public shouldShowHoverAt(hoverRange: Range): boolean {
		const ghostText = this.activeInlineCompletionsModel?.ghostText;
		if (ghostText) {
			return ghostText.parts.some(p => hoverRange.containsPosition(new Position(ghostText.lineNumber, p.column)));
		}
		return false;
	}

	public triggerInlineCompletion(): void {
		this.activeInlineCompletionsModel?.trigger();
	}

	public commitInlineCompletion(): void {
		this.activeInlineCompletionsModel?.commitCurrentSuggestion();
	}

	public hideInlineCompletion(): void {
		this.activeInlineCompletionsModel?.hide();
	}

	public showNextInlineCompletion(): void {
		this.activeInlineCompletionsModel?.showNext();
	}

	public showPreviousInlineCompletion(): void {
		this.activeInlineCompletionsModel?.showPrevious();
	}

	public async hasMultipleInlineCompletions(): Promise<boolean> {
		const result = await this.activeInlineCompletionsModel?.hasMultipleInlineCompletions();
		return result !== undefined ? result : false;
	}
}
