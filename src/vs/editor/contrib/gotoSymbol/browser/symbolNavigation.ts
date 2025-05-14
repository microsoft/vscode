/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { combinedDisposable, DisposableStore, dispose, IDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorCommand, registerEditorCommand } from '../../../browser/editorExtensions.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { Range } from '../../../common/core/range.js';
import { OneReference, ReferencesModel } from './referencesModel.js';
import { localize } from '../../../../nls.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { TextEditorSelectionRevealType } from '../../../../platform/editor/common/editor.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INotificationService, IStatusHandle } from '../../../../platform/notification/common/notification.js';

export const ctxHasSymbols = new RawContextKey('hasSymbols', false, localize('hasSymbols', "Whether there are symbol locations that can be navigated via keyboard-only."));

export const ISymbolNavigationService = createDecorator<ISymbolNavigationService>('ISymbolNavigationService');

export interface ISymbolNavigationService {
	readonly _serviceBrand: undefined;
	reset(): void;
	put(anchor: OneReference): void;
	revealNext(source: ICodeEditor): Promise<any>;
}

class SymbolNavigationService implements ISymbolNavigationService {

	declare readonly _serviceBrand: undefined;

	private readonly _ctxHasSymbols: IContextKey<boolean>;

	private _currentModel?: ReferencesModel = undefined;
	private _currentIdx: number = -1;
	private _currentState?: IDisposable;
	private _currentMessage?: IStatusHandle;
	private _ignoreEditorChange: boolean = false;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICodeEditorService private readonly _editorService: ICodeEditorService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		this._ctxHasSymbols = ctxHasSymbols.bindTo(contextKeyService);
	}

	reset(): void {
		this._ctxHasSymbols.reset();
		this._currentState?.dispose();
		this._currentMessage?.close();
		this._currentModel = undefined;
		this._currentIdx = -1;
	}

	put(anchor: OneReference): void {
		const refModel = anchor.parent.parent;

		if (refModel.references.length <= 1) {
			this.reset();
			return;
		}

		this._currentModel = refModel;
		this._currentIdx = refModel.references.indexOf(anchor);
		this._ctxHasSymbols.set(true);
		this._showMessage();

		const editorState = new EditorState(this._editorService);
		const listener = editorState.onDidChange(_ => {

			if (this._ignoreEditorChange) {
				return;
			}

			const editor = this._editorService.getActiveCodeEditor();
			if (!editor) {
				return;
			}
			const model = editor.getModel();
			const position = editor.getPosition();
			if (!model || !position) {
				return;
			}

			let seenUri: boolean = false;
			let seenPosition: boolean = false;
			for (const reference of refModel.references) {
				if (isEqual(reference.uri, model.uri)) {
					seenUri = true;
					seenPosition = seenPosition || Range.containsPosition(reference.range, position);
				} else if (seenUri) {
					break;
				}
			}
			if (!seenUri || !seenPosition) {
				this.reset();
			}
		});

		this._currentState = combinedDisposable(editorState, listener);
	}

	revealNext(source: ICodeEditor): Promise<any> {
		if (!this._currentModel) {
			return Promise.resolve();
		}

		// get next result and advance
		this._currentIdx += 1;
		this._currentIdx %= this._currentModel.references.length;
		const reference = this._currentModel.references[this._currentIdx];

		// status
		this._showMessage();

		// open editor, ignore events while that happens
		this._ignoreEditorChange = true;
		return this._editorService.openCodeEditor({
			resource: reference.uri,
			options: {
				selection: Range.collapseToStart(reference.range),
				selectionRevealType: TextEditorSelectionRevealType.NearTopIfOutsideViewport
			}
		}, source).finally(() => {
			this._ignoreEditorChange = false;
		});

	}

	private _showMessage(): void {

		this._currentMessage?.close();

		const kb = this._keybindingService.lookupKeybinding('editor.gotoNextSymbolFromResult');
		const message = kb
			? localize('location.kb', "Symbol {0} of {1}, {2} for next", this._currentIdx + 1, this._currentModel!.references.length, kb.getLabel())
			: localize('location', "Symbol {0} of {1}", this._currentIdx + 1, this._currentModel!.references.length);

		this._currentMessage = this._notificationService.status(message);
	}
}

registerSingleton(ISymbolNavigationService, SymbolNavigationService, InstantiationType.Delayed);

registerEditorCommand(new class extends EditorCommand {

	constructor() {
		super({
			id: 'editor.gotoNextSymbolFromResult',
			precondition: ctxHasSymbols,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.F12
			}
		});
	}

	runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
		return accessor.get(ISymbolNavigationService).revealNext(editor);
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'editor.gotoNextSymbolFromResult.cancel',
	weight: KeybindingWeight.EditorContrib,
	when: ctxHasSymbols,
	primary: KeyCode.Escape,
	handler(accessor) {
		accessor.get(ISymbolNavigationService).reset();
	}
});

//

class EditorState {

	private readonly _listener = new Map<ICodeEditor, IDisposable>();
	private readonly _disposables = new DisposableStore();

	private readonly _onDidChange = new Emitter<{ editor: ICodeEditor }>();
	readonly onDidChange: Event<{ editor: ICodeEditor }> = this._onDidChange.event;

	constructor(@ICodeEditorService editorService: ICodeEditorService) {
		this._disposables.add(editorService.onCodeEditorRemove(this._onDidRemoveEditor, this));
		this._disposables.add(editorService.onCodeEditorAdd(this._onDidAddEditor, this));
		editorService.listCodeEditors().forEach(this._onDidAddEditor, this);
	}

	dispose(): void {
		this._disposables.dispose();
		this._onDidChange.dispose();
		dispose(this._listener.values());
	}

	private _onDidAddEditor(editor: ICodeEditor): void {
		this._listener.set(editor, combinedDisposable(
			editor.onDidChangeCursorPosition(_ => this._onDidChange.fire({ editor })),
			editor.onDidChangeModelContent(_ => this._onDidChange.fire({ editor })),
		));
	}

	private _onDidRemoveEditor(editor: ICodeEditor): void {
		this._listener.get(editor)?.dispose();
		this._listener.delete(editor);
	}
}
