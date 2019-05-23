/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ReferencesModel } from 'vs/editor/contrib/referenceSearch/referencesModel';
import { RawContextKey, IContextKeyService, IContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode } from 'vs/base/common/keyCodes';
import { registerEditorCommand, EditorCommand } from 'vs/editor/browser/editorExtensions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Range } from 'vs/editor/common/core/range';
import { Disposable, dispose, combinedDisposable, IDisposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';

export const ctxHasSymbols = new RawContextKey('hasSymbols', false);

export const ISymbolNavigationService = createDecorator<ISymbolNavigationService>('ISymbolNavigationService');

export interface ISymbolNavigationService {
	_serviceBrand: any;
	put(model: ReferencesModel): void;
	revealNext(source: ICodeEditor): boolean;
}

class SymbolNavigationService implements ISymbolNavigationService {

	_serviceBrand: any;

	private readonly _ctxHasSymbols: IContextKey<boolean>;

	private _currentModel?: ReferencesModel = undefined;
	private _currentIdx: number = -1;
	private _currentDisposables: IDisposable[] = [];

	constructor(
		@ICodeEditorService private readonly _editorService: ICodeEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		this._ctxHasSymbols = ctxHasSymbols.bindTo(contextKeyService);
	}

	private _reset(): void {
		this._ctxHasSymbols.reset();
		dispose(this._currentDisposables);
		this._currentModel = undefined;
		this._currentIdx = -1;
	}

	put(refModel: ReferencesModel): void {

		if (refModel.references.length <= 1) {
			this._reset();
			return;
		}

		this._currentModel = refModel;
		this._currentIdx = 1;
		this._ctxHasSymbols.set(true);

		const editorStatus = new EditorStatus(this._editorService);
		const listener = editorStatus.onDidChange(e => {

			if (this._editorService.listCodeEditors().length === 0) {
				this._reset();
				return;
			}

			const model = e.editor.getModel();
			const position = e.editor.getPosition();
			if (!model || !position) {
				return;
			}

			let seenUri: boolean = false;
			let seenPosition: boolean = false;
			for (const reference of refModel.references) {
				if (reference.uri.toString() === model.uri.toString()) {
					seenUri = true;
					seenPosition = seenPosition || Range.containsPosition(reference.range, position);
				} else if (seenUri) {
					break;
				}
			}
			if (seenUri && !seenPosition) {
				this._reset();
			}
		});

		this._currentDisposables = [editorStatus, listener];
	}

	revealNext(source: ICodeEditor): boolean {
		if (!this._currentModel) {
			return false;
		}

		// get next result and advance
		const reference = this._currentModel.references[this._currentIdx];
		this._editorService.openCodeEditor({
			resource: reference.uri,
			options: {
				selection: Range.collapseToStart(reference.range),
				revealInCenterIfOutsideViewport: true,
				revealIfOpened: true
			}
		}, source);

		this._currentIdx += 1;
		this._currentIdx %= this._currentModel.references.length;
		return true;
	}
}

registerSingleton(ISymbolNavigationService, SymbolNavigationService, true);

registerEditorCommand(new class extends EditorCommand {

	constructor() {
		super({
			id: 'editor.gotoNextSymbolFromResult',
			precondition: ContextKeyExpr.and(
				ctxHasSymbols,
				ContextKeyExpr.equals('config.editor.gotoLocation.multiple', 'goto')
			),
			kbOpts: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.F12
			}
		});
	}

	runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
		accessor.get(ISymbolNavigationService).revealNext(editor);
	}
});

//

class EditorStatus extends Disposable {

	private readonly _listener = new Map<ICodeEditor, IDisposable>();

	private readonly _onDidChange = new Emitter<{ editor: ICodeEditor }>();
	readonly onDidChange: Event<{ editor: ICodeEditor }> = this._onDidChange.event;

	constructor(@ICodeEditorService editorService: ICodeEditorService) {
		super();
		this._register(this._onDidChange);
		this._register(editorService.onCodeEditorRemove(this._onDidRemoveEditor, this));
		this._register(editorService.onCodeEditorAdd(this._onDidAddEditor, this));
		editorService.listCodeEditors().forEach(this._onDidAddEditor, this);
	}

	private _onDidAddEditor(editor: ICodeEditor): void {
		this._listener.set(editor, combinedDisposable([
			editor.onDidChangeCursorPosition(_ => this._onDidChange.fire({ editor })),
			editor.onDidChangeModelContent(_ => this._onDidChange.fire({ editor })),
		]));
	}

	private _onDidRemoveEditor(editor: ICodeEditor): void {
		dispose(this._listener.get(editor));
		this._listener.delete(editor);
	}
}
