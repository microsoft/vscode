/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorAction2, EditorContributionInstantiation, registerEditorContribution, ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { PeekContext } from '../../../../editor/contrib/peekView/browser/peekView.js';
import { localize, localize2 } from '../../../../nls.js';
import { MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { TypeHierarchyTreePeekWidget } from './typeHierarchyPeek.js';
import { TypeHierarchyDirection, TypeHierarchyModel, TypeHierarchyProviderRegistry } from '../common/typeHierarchy.js';


const _ctxHasTypeHierarchyProvider = new RawContextKey<boolean>('editorHasTypeHierarchyProvider', false, localize('editorHasTypeHierarchyProvider', 'Whether a type hierarchy provider is available'));
const _ctxTypeHierarchyVisible = new RawContextKey<boolean>('typeHierarchyVisible', false, localize('typeHierarchyVisible', 'Whether type hierarchy peek is currently showing'));
const _ctxTypeHierarchyDirection = new RawContextKey<string>('typeHierarchyDirection', undefined, { type: 'string', description: localize('typeHierarchyDirection', 'whether type hierarchy shows super types or subtypes') });

function sanitizedDirection(candidate: string): TypeHierarchyDirection {
	return candidate === TypeHierarchyDirection.Subtypes || candidate === TypeHierarchyDirection.Supertypes
		? candidate
		: TypeHierarchyDirection.Subtypes;
}

class TypeHierarchyController implements IEditorContribution {
	static readonly Id = 'typeHierarchy';

	static get(editor: ICodeEditor): TypeHierarchyController | null {
		return editor.getContribution<TypeHierarchyController>(TypeHierarchyController.Id);
	}

	private static readonly _storageDirectionKey = 'typeHierarchy/defaultDirection';

	private readonly _ctxHasProvider: IContextKey<boolean>;
	private readonly _ctxIsVisible: IContextKey<boolean>;
	private readonly _ctxDirection: IContextKey<string>;
	private readonly _disposables = new DisposableStore();
	private readonly _sessionDisposables = new DisposableStore();

	private _widget?: TypeHierarchyTreePeekWidget;

	constructor(
		readonly _editor: ICodeEditor,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IStorageService private readonly _storageService: IStorageService,
		@ICodeEditorService private readonly _editorService: ICodeEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		this._ctxHasProvider = _ctxHasTypeHierarchyProvider.bindTo(this._contextKeyService);
		this._ctxIsVisible = _ctxTypeHierarchyVisible.bindTo(this._contextKeyService);
		this._ctxDirection = _ctxTypeHierarchyDirection.bindTo(this._contextKeyService);
		this._disposables.add(Event.any<any>(_editor.onDidChangeModel, _editor.onDidChangeModelLanguage, TypeHierarchyProviderRegistry.onDidChange)(() => {
			this._ctxHasProvider.set(_editor.hasModel() && TypeHierarchyProviderRegistry.has(_editor.getModel()));
		}));
		this._disposables.add(this._sessionDisposables);
	}

	dispose(): void {
		this._disposables.dispose();
	}

	// Peek
	async startTypeHierarchyFromEditor(): Promise<void> {
		this._sessionDisposables.clear();

		if (!this._editor.hasModel()) {
			return;
		}

		const document = this._editor.getModel();
		const position = this._editor.getPosition();
		if (!TypeHierarchyProviderRegistry.has(document)) {
			return;
		}

		const cts = new CancellationTokenSource();
		const model = TypeHierarchyModel.create(document, position, cts.token);
		const direction = sanitizedDirection(this._storageService.get(TypeHierarchyController._storageDirectionKey, StorageScope.PROFILE, TypeHierarchyDirection.Subtypes));

		this._showTypeHierarchyWidget(position, direction, model, cts);
	}

	private _showTypeHierarchyWidget(position: Position, direction: TypeHierarchyDirection, model: Promise<TypeHierarchyModel | undefined>, cts: CancellationTokenSource) {

		this._ctxIsVisible.set(true);
		this._ctxDirection.set(direction);
		Event.any<any>(this._editor.onDidChangeModel, this._editor.onDidChangeModelLanguage)(this.endTypeHierarchy, this, this._sessionDisposables);
		this._widget = this._instantiationService.createInstance(TypeHierarchyTreePeekWidget, this._editor, position, direction);
		this._widget.showLoading();
		this._sessionDisposables.add(this._widget.onDidClose(() => {
			this.endTypeHierarchy();
			this._storageService.store(TypeHierarchyController._storageDirectionKey, this._widget!.direction, StorageScope.PROFILE, StorageTarget.USER);
		}));
		this._sessionDisposables.add({ dispose() { cts.dispose(true); } });
		this._sessionDisposables.add(this._widget);

		model.then(model => {
			if (cts.token.isCancellationRequested) {
				return; // nothing
			}
			if (model) {
				this._sessionDisposables.add(model);
				this._widget!.showModel(model);
			}
			else {
				this._widget!.showMessage(localize('no.item', "No results"));
			}
		}).catch(err => {
			if (isCancellationError(err)) {
				this.endTypeHierarchy();
				return;
			}
			this._widget!.showMessage(localize('error', "Failed to show type hierarchy"));
		});
	}

	async startTypeHierarchyFromTypeHierarchy(): Promise<void> {
		if (!this._widget) {
			return;
		}
		const model = this._widget.getModel();
		const typeItem = this._widget.getFocused();
		if (!typeItem || !model) {
			return;
		}
		const newEditor = await this._editorService.openCodeEditor({ resource: typeItem.item.uri }, this._editor);
		if (!newEditor) {
			return;
		}
		const newModel = model.fork(typeItem.item);
		this._sessionDisposables.clear();

		TypeHierarchyController.get(newEditor)?._showTypeHierarchyWidget(
			Range.lift(newModel.root.selectionRange).getStartPosition(),
			this._widget.direction,
			Promise.resolve(newModel),
			new CancellationTokenSource()
		);
	}

	showSupertypes(): void {
		this._widget?.updateDirection(TypeHierarchyDirection.Supertypes);
		this._ctxDirection.set(TypeHierarchyDirection.Supertypes);
	}

	showSubtypes(): void {
		this._widget?.updateDirection(TypeHierarchyDirection.Subtypes);
		this._ctxDirection.set(TypeHierarchyDirection.Subtypes);
	}

	endTypeHierarchy(): void {
		this._sessionDisposables.clear();
		this._ctxIsVisible.set(false);
		this._editor.focus();
	}
}

registerEditorContribution(TypeHierarchyController.Id, TypeHierarchyController, EditorContributionInstantiation.Eager); // eager because it needs to define a context key

// Peek
registerAction2(class PeekTypeHierarchyAction extends EditorAction2 {

	constructor() {
		super({
			id: 'editor.showTypeHierarchy',
			title: localize2('title', 'Peek Type Hierarchy'),
			menu: {
				id: MenuId.EditorContextPeek,
				group: 'navigation',
				order: 1000,
				when: ContextKeyExpr.and(
					_ctxHasTypeHierarchyProvider,
					PeekContext.notInPeekEditor
				),
			},
			precondition: ContextKeyExpr.and(
				_ctxHasTypeHierarchyProvider,
				PeekContext.notInPeekEditor
			),
			f1: true
		});
	}

	async runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		return TypeHierarchyController.get(editor)?.startTypeHierarchyFromEditor();
	}
});

// actions for peek widget
registerAction2(class extends EditorAction2 {

	constructor() {
		super({
			id: 'editor.showSupertypes',
			title: localize2('title.supertypes', 'Show Supertypes'),
			icon: Codicon.typeHierarchySuper,
			precondition: ContextKeyExpr.and(_ctxTypeHierarchyVisible, _ctxTypeHierarchyDirection.isEqualTo(TypeHierarchyDirection.Subtypes)),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Shift + KeyMod.Alt + KeyCode.KeyH,
			},
			menu: {
				id: TypeHierarchyTreePeekWidget.TitleMenu,
				when: _ctxTypeHierarchyDirection.isEqualTo(TypeHierarchyDirection.Subtypes),
				order: 1,
			}
		});
	}

	runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor) {
		return TypeHierarchyController.get(editor)?.showSupertypes();
	}
});

registerAction2(class extends EditorAction2 {

	constructor() {
		super({
			id: 'editor.showSubtypes',
			title: localize2('title.subtypes', 'Show Subtypes'),
			icon: Codicon.typeHierarchySub,
			precondition: ContextKeyExpr.and(_ctxTypeHierarchyVisible, _ctxTypeHierarchyDirection.isEqualTo(TypeHierarchyDirection.Supertypes)),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Shift + KeyMod.Alt + KeyCode.KeyH,
			},
			menu: {
				id: TypeHierarchyTreePeekWidget.TitleMenu,
				when: _ctxTypeHierarchyDirection.isEqualTo(TypeHierarchyDirection.Supertypes),
				order: 1,
			}
		});
	}

	runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor) {
		return TypeHierarchyController.get(editor)?.showSubtypes();
	}
});

registerAction2(class extends EditorAction2 {

	constructor() {
		super({
			id: 'editor.refocusTypeHierarchy',
			title: localize2('title.refocusTypeHierarchy', 'Refocus Type Hierarchy'),
			precondition: _ctxTypeHierarchyVisible,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Shift + KeyCode.Enter
			}
		});
	}

	async runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		return TypeHierarchyController.get(editor)?.startTypeHierarchyFromTypeHierarchy();
	}
});

registerAction2(class extends EditorAction2 {

	constructor() {
		super({
			id: 'editor.closeTypeHierarchy',
			title: localize('close', 'Close'),
			icon: Codicon.close,
			precondition: _ctxTypeHierarchyVisible,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 10,
				primary: KeyCode.Escape,
				when: ContextKeyExpr.not('config.editor.stablePeek')
			},
			menu: {
				id: TypeHierarchyTreePeekWidget.TitleMenu,
				order: 1000
			}
		});
	}

	runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		return TypeHierarchyController.get(editor)?.endTypeHierarchy();
	}
});
