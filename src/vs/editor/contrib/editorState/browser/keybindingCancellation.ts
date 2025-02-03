/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode } from '../../../../base/common/keyCodes.js';
import { EditorCommand, registerEditorCommand } from '../../../browser/editorExtensions.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { IContextKeyService, RawContextKey, IContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { CancellationTokenSource, CancellationToken } from '../../../../base/common/cancellation.js';
import { LinkedList } from '../../../../base/common/linkedList.js';
import { createDecorator, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { localize } from '../../../../nls.js';


const IEditorCancellationTokens = createDecorator<IEditorCancellationTokens>('IEditorCancelService');

interface IEditorCancellationTokens {
	readonly _serviceBrand: undefined;
	add(editor: ICodeEditor, cts: CancellationTokenSource): () => void;
	cancel(editor: ICodeEditor): void;
}

const ctxCancellableOperation = new RawContextKey('cancellableOperation', false, localize('cancellableOperation', 'Whether the editor runs a cancellable operation, e.g. like \'Peek References\''));

registerSingleton(IEditorCancellationTokens, class implements IEditorCancellationTokens {

	declare readonly _serviceBrand: undefined;

	private readonly _tokens = new WeakMap<ICodeEditor, { key: IContextKey<boolean>; tokens: LinkedList<CancellationTokenSource> }>();

	add(editor: ICodeEditor, cts: CancellationTokenSource): () => void {
		let data = this._tokens.get(editor);
		if (!data) {
			data = editor.invokeWithinContext(accessor => {
				const key = ctxCancellableOperation.bindTo(accessor.get(IContextKeyService));
				const tokens = new LinkedList<CancellationTokenSource>();
				return { key, tokens };
			});
			this._tokens.set(editor, data);
		}

		let removeFn: Function | undefined;

		data.key.set(true);
		removeFn = data.tokens.push(cts);

		return () => {
			// remove w/o cancellation
			if (removeFn) {
				removeFn();
				data.key.set(!data.tokens.isEmpty());
				removeFn = undefined;
			}
		};
	}

	cancel(editor: ICodeEditor): void {
		const data = this._tokens.get(editor);
		if (!data) {
			return;
		}
		// remove with cancellation
		const cts = data.tokens.pop();
		if (cts) {
			cts.cancel();
			data.key.set(!data.tokens.isEmpty());
		}
	}

}, InstantiationType.Delayed);

export class EditorKeybindingCancellationTokenSource extends CancellationTokenSource {

	private readonly _unregister: Function;

	constructor(readonly editor: ICodeEditor, parent?: CancellationToken) {
		super(parent);
		this._unregister = editor.invokeWithinContext(accessor => accessor.get(IEditorCancellationTokens).add(editor, this));
	}

	override dispose(): void {
		this._unregister();
		super.dispose();
	}
}

registerEditorCommand(new class extends EditorCommand {

	constructor() {
		super({
			id: 'editor.cancelOperation',
			kbOpts: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.Escape
			},
			precondition: ctxCancellableOperation
		});
	}

	runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): void {
		accessor.get(IEditorCancellationTokens).cancel(editor);
	}
});
