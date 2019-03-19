/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { CallHierarchyProviderRegistry, CallHierarchyDirection } from 'vs/workbench/contrib/callHierarchy/common/callHierarchy';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { CallHierarchyTreePeekWidget } from 'vs/workbench/contrib/callHierarchy/browser/callHierarchyPeek';
import { Event } from 'vs/base/common/event';
import { registerEditorContribution, registerEditorAction, EditorAction, registerEditorCommand, EditorCommand } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IContextKeyService, RawContextKey, IContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';


const _ctxHasCompletionItemProvider = new RawContextKey<boolean>('editorHasCallHierarchyProvider', false);
const _ctxCallHierarchyVisible = new RawContextKey<boolean>('callHierarchyVisible', false);

class CallHierarchyController extends Disposable implements IEditorContribution {

	static Id = 'callHierarchy';

	static get(editor: ICodeEditor): CallHierarchyController {
		return editor.getContribution<CallHierarchyController>(CallHierarchyController.Id);
	}

	private readonly _ctxHasProvider: IContextKey<boolean>;
	private readonly _ctxIsVisible: IContextKey<boolean>;

	private _sessionDispose: IDisposable[] = [];

	constructor(
		private readonly _editor: ICodeEditor,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._ctxIsVisible = _ctxCallHierarchyVisible.bindTo(this._contextKeyService);
		this._ctxHasProvider = _ctxHasCompletionItemProvider.bindTo(this._contextKeyService);
		this._register(Event.any<any>(_editor.onDidChangeModel, _editor.onDidChangeModelLanguage, CallHierarchyProviderRegistry.onDidChange)(() => {
			this._ctxHasProvider.set(_editor.hasModel() && CallHierarchyProviderRegistry.has(_editor.getModel()));
		}));

		this._register({ dispose: () => dispose(this._sessionDispose) });
	}

	dispose(): void {
		this._ctxHasProvider.reset();
		this._ctxIsVisible.reset();
		super.dispose();
	}

	getId(): string {
		return CallHierarchyController.Id;
	}

	async startCallHierarchy(): Promise<void> {
		this._sessionDispose = dispose(this._sessionDispose);

		if (!this._editor.hasModel()) {
			return;
		}

		const model = this._editor.getModel();
		const position = this._editor.getPosition();
		const [provider] = CallHierarchyProviderRegistry.ordered(model);
		if (!provider) {
			return;
		}

		Event.any<any>(this._editor.onDidChangeModel, this._editor.onDidChangeModelLanguage)(this.endCallHierarchy, this, this._sessionDispose);
		const widget = this._instantiationService.createInstance(
			CallHierarchyTreePeekWidget,
			this._editor,
			position,
			provider,
			CallHierarchyDirection.CallsTo
		);

		widget.showLoading();
		this._ctxIsVisible.set(true);

		const cancel = new CancellationTokenSource();

		this._sessionDispose.push(widget.onDidClose(() => this.endCallHierarchy()));
		this._sessionDispose.push({ dispose() { cancel.cancel(); } });
		this._sessionDispose.push(widget);

		Promise.resolve(provider.provideCallHierarchyItem(model, position, cancel.token)).then(item => {
			if (cancel.token.isCancellationRequested) {
				return;
			}
			if (!item) {
				widget.showMessage(localize('no.item', "No results"));
				return;
			}

			widget.showItem(item);
		});
	}

	endCallHierarchy(): void {
		this._sessionDispose = dispose(this._sessionDispose);
		this._ctxIsVisible.set(false);
		this._editor.focus();
	}
}

registerEditorContribution(CallHierarchyController);

registerEditorAction(class extends EditorAction {

	constructor() {
		super({
			id: 'editor.showCallHierarchy',
			label: localize('title', "Call Hierarchy"),
			alias: 'Call Hierarchy',
			menuOpts: {
				group: 'navigation',
				order: 111
			},
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Shift + KeyMod.Alt + KeyCode.KEY_H
			},
			precondition: _ctxHasCompletionItemProvider
		});
	}

	async run(_accessor: ServicesAccessor, editor: ICodeEditor, args: any): Promise<void> {
		return CallHierarchyController.get(editor).startCallHierarchy();
	}
});


registerEditorCommand(new class extends EditorCommand {

	constructor() {
		super({
			id: 'editor.closeCallHierarchy',
			kbOpts: {
				weight: KeybindingWeight.WorkbenchContrib + 10,
				primary: KeyCode.Escape
			},
			precondition: ContextKeyExpr.and(_ctxCallHierarchyVisible, ContextKeyExpr.not('config.editor.stablePeek'))
		});
	}

	runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		return CallHierarchyController.get(editor).endCallHierarchy();
	}
});
