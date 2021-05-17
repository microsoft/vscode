/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, registerEditorAction, registerEditorContribution, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ITextModel } from 'vs/editor/common/model';
import { GhostTextProviderRegistry } from 'vs/editor/common/modes';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import * as errors from 'vs/base/common/errors';
import { GhostTextWidget, ValidGhostText } from 'vs/editor/contrib/ghostText/ghostTextWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';

class GhostTextController extends Disposable {
	static ID = 'editor.contrib.ghostTextController';

	public static get(editor: ICodeEditor): GhostTextController {
		return editor.getContribution<GhostTextController>(GhostTextController.ID);
	}

	private readonly _editor: ICodeEditor;
	private readonly _widget: GhostTextWidget;
	private _modelDisposable: DisposableStore;
	private _ghostTextPromise: CancelablePromise<ValidGhostText | undefined> | null;

	constructor(
		editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._editor = editor;
		this._widget = this._register(instantiationService.createInstance(GhostTextWidget, this._editor));
		this._modelDisposable = this._register(new DisposableStore());
		this._ghostTextPromise = null;
		this._register(toDisposable(() => {
			if (this._ghostTextPromise) {
				this._ghostTextPromise.cancel();
				this._ghostTextPromise = null;
			}
		}));

		this._editor.onDidChangeModel(() => {
			this._reinit();
		});
		GhostTextProviderRegistry.onDidChange(() => {
			this._reinit();
		});
		this._reinit();

	}

	private _reinit(): void {
		this._modelDisposable.clear();
		if (!this._editor.hasModel()) {
			return;
		}
		const model = this._editor.getModel();

		this._modelDisposable.add(model.onDidChangeContent((e) => {
			if (!GhostTextProviderRegistry.has(model)) {
				return;
			}

			this._trigger();
		}));
		this._modelDisposable.add(toDisposable(() => {
			this._widget.hide();
		}));
	}

	private _trigger(): void {
		if (!this._editor.hasModel()) {
			return;
		}

		const model = this._editor.getModel();
		const position = this._editor.getPosition();

		if (this._ghostTextPromise) {
			this._ghostTextPromise.cancel();
			this._ghostTextPromise = null;
		}

		this._ghostTextPromise = createCancelablePromise(token => provideGhostText(model, position, token));

		this._ghostTextPromise.then((result) => this._renderResult(result), errors.onUnexpectedError);
	}

	private _renderResult(result: ValidGhostText | undefined): void {
		if (!result) {
			this._widget.hide();
			return;
		}
		this._widget.show(result);
	}

	public trigger(): void {
		this._trigger();
	}
}

export class TriggerGhostTextAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.triggerGhostText',
			label: nls.localize('triggerGhostTextAction', "Trigger Ghost Text"),
			alias: 'Trigger Ghost Text',
			precondition: EditorContextKeys.writable
		});
	}

	public async run(accessor: ServicesAccessor | null, editor: ICodeEditor): Promise<void> {
		const controller = GhostTextController.get(editor);
		if (controller) {
			controller.trigger();
		}
	}
}

async function provideGhostText(
	model: ITextModel,
	position: Position,
	token: CancellationToken = CancellationToken.None
): Promise<ValidGhostText | undefined> {

	const word = model.getWordAtPosition(position);
	const defaultReplaceRange = word ? new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn) : Range.fromPositions(position);

	const providers = GhostTextProviderRegistry.all(model);
	const results = await Promise.all(
		providers.map(provider => provider.provideGhostText(model, position, token))
	);

	for (const result of results) {
		if (result) {
			return {
				text: result.text,
				replaceRange: result.replaceRange || defaultReplaceRange
			};
		}
	}

	return undefined;
}

registerEditorContribution(GhostTextController.ID, GhostTextController);
registerEditorAction(TriggerGhostTextAction);
