/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { constObservable, observableValue } from 'vs/base/common/observable';
import { ITransaction, disposableObservableValue, transaction } from 'vs/base/common/observableImpl/base';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';
import { GhostTextWidget } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextWidget';
import { InlineCompletionsModel } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsModel';
import { SuggestWidgetAdaptor } from 'vs/editor/contrib/inlineCompletions/browser/suggestWidgetInlineCompletionProvider';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class InlineCompletionsController extends Disposable {
	static ID = 'editor.contrib.inlineCompletionsController';

	public static get(editor: ICodeEditor): InlineCompletionsController | null {
		return editor.getContribution<InlineCompletionsController>(InlineCompletionsController.ID);
	}

	private readonly suggestWidgetAdaptor = new SuggestWidgetAdaptor(
		this.editor,
		() => this.model.get()?.currentInlineCompletion.get()?.toInlineCompletion(),
		(tx) => this.updateObservables(tx)
	);

	private readonly textModelVersionId = observableValue<number>('textModelVersionId', -1);
	private readonly cursorPosition = observableValue<Position>('cursorPosition', new Position(1, 1));
	public readonly model = disposableObservableValue<InlineCompletionsModel | undefined>('textModelVersionId', undefined);

	private ghostTextWidget = this.instantiationService.createInstance(GhostTextWidget, this.editor, {
		ghostText: this.model.map((v, reader) => v?.ghostText.read(reader)),
		minReservedLineCount: constObservable(0),
		targetTextModel: this.model.map(v => v?.textModel),
	});

	constructor(
		public readonly editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		this._register(Event.runAndSubscribe(editor.onDidChangeModel, () => transaction(tx => {
			this.model.set(undefined, tx); // This disposes the model
			this.updateObservables(tx);
			const textModel = editor.getModel();
			if (textModel) {
				const model = new InlineCompletionsModel(textModel, this.suggestWidgetAdaptor.selectedItem, this.cursorPosition, this.textModelVersionId, instantiationService);
				this.model.set(model, tx);
			}
		})));

		this._register(editor.onDidChangeModelContent(e => transaction(tx =>
			this.updateObservables(tx)
		)));

		editor.onDidChangeCursorPosition(e => transaction(tx => {
			this.updateObservables(tx);
			if (e.reason === CursorChangeReason.Explicit) {
				this.model.get()?.clear(tx);
			}
		}));

		editor.onDidType(() => transaction(tx => {
			this.updateObservables(tx);
			this.model.get()?.trigger(tx);
		}));
	}

	private updateObservables(tx: ITransaction): void {
		const newModel = this.editor.getModel();
		this.textModelVersionId.set(newModel?.getVersionId() ?? -1, tx);
		this.cursorPosition.set(this.editor.getPosition() ?? new Position(1, 1), tx);
	}

	shouldShowHoverAt(range: Range) {
		const ghostText = this.model.get()?.ghostText.get();
		if (ghostText) {
			return ghostText.parts.some(p => range.containsPosition(new Position(ghostText.lineNumber, p.column)));
		}
		return false;
	}

	public shouldShowHoverAtViewZone(viewZoneId: string): boolean {
		return this.ghostTextWidget.ownsViewZone(viewZoneId);
	}
}
