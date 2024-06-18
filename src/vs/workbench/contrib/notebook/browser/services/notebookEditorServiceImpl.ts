/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeWindow } from 'vs/base/browser/window';
import { ResourceMap } from 'vs/base/common/map';
import { getDefaultNotebookCreationOptions, NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { IEditorGroupsService, IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { isCompositeNotebookEditorInput, NotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { IBorrowValue, INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { INotebookEditor, INotebookEditorCreationOptions } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { Emitter } from 'vs/base/common/event';
import { GroupIdentifier, GroupModelChangeKind } from 'vs/workbench/common/editor';
import { Dimension } from 'vs/base/browser/dom';
import { URI } from 'vs/base/common/uri';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { InteractiveWindowOpen } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IEditorProgressService } from 'vs/platform/progress/common/progress';

export class NotebookEditorWidgetService implements INotebookEditorService {

	readonly _serviceBrand: undefined;

	private _tokenPool = 1;

	private readonly _disposables = new DisposableStore();
	private readonly _notebookEditors = new Map<string, INotebookEditor>();

	private readonly _onNotebookEditorAdd = new Emitter<INotebookEditor>();
	private readonly _onNotebookEditorsRemove = new Emitter<INotebookEditor>();
	readonly onDidAddNotebookEditor = this._onNotebookEditorAdd.event;
	readonly onDidRemoveNotebookEditor = this._onNotebookEditorsRemove.event;

	private readonly _borrowableEditors = new Map<number, ResourceMap<{ widget: NotebookEditorWidget; token: number | undefined }>>();

	constructor(
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {

		const groupListener = new Map<number, IDisposable[]>();
		const onNewGroup = (group: IEditorGroup) => {
			const { id } = group;
			const listeners: IDisposable[] = [];
			listeners.push(group.onDidCloseEditor(e => {
				const widgets = this._borrowableEditors.get(group.id);
				if (!widgets) {
					return;
				}

				const inputs = e.editor instanceof NotebookEditorInput ? [e.editor] : (isCompositeNotebookEditorInput(e.editor) ? e.editor.editorInputs : []);
				inputs.forEach(input => {
					const value = widgets.get(input.resource);
					if (!value) {
						return;
					}
					value.token = undefined;
					this._disposeWidget(value.widget);
					widgets.delete(input.resource);
					value.widget = (<any>undefined); // unset the widget so that others that still hold a reference don't harm us
				});
			}));
			listeners.push(group.onWillMoveEditor(e => {
				if (e.editor instanceof NotebookEditorInput) {
					this._allowWidgetMove(e.editor, e.groupId, e.target);
				}

				if (isCompositeNotebookEditorInput(e.editor)) {
					e.editor.editorInputs.forEach(input => {
						this._allowWidgetMove(input, e.groupId, e.target);
					});
				}
			}));
			groupListener.set(id, listeners);
		};
		this._disposables.add(editorGroupService.onDidAddGroup(onNewGroup));
		editorGroupService.whenReady.then(() => editorGroupService.groups.forEach(onNewGroup));

		// group removed -> clean up listeners, clean up widgets
		this._disposables.add(editorGroupService.onDidRemoveGroup(group => {
			const listeners = groupListener.get(group.id);
			if (listeners) {
				listeners.forEach(listener => listener.dispose());
				groupListener.delete(group.id);
			}
			const widgets = this._borrowableEditors.get(group.id);
			this._borrowableEditors.delete(group.id);
			if (widgets) {
				for (const value of widgets.values()) {
					value.token = undefined;
					this._disposeWidget(value.widget);
				}
			}
		}));

		const interactiveWindowOpen = InteractiveWindowOpen.bindTo(contextKeyService);
		this._disposables.add(editorService.onDidEditorsChange(e => {
			if (e.event.kind === GroupModelChangeKind.EDITOR_OPEN && !interactiveWindowOpen.get()) {
				if (editorService.editors.find(editor => editor.editorId === 'interactive')) {
					interactiveWindowOpen.set(true);
				}
			} else if (e.event.kind === GroupModelChangeKind.EDITOR_CLOSE && interactiveWindowOpen.get()) {
				if (!editorService.editors.find(editor => editor.editorId === 'interactive')) {
					interactiveWindowOpen.set(false);
				}
			}
		}));
	}

	dispose() {
		this._disposables.dispose();
		this._onNotebookEditorAdd.dispose();
		this._onNotebookEditorsRemove.dispose();
	}

	// --- group-based editor borrowing...

	private _disposeWidget(widget: NotebookEditorWidget): void {
		widget.onWillHide();
		const domNode = widget.getDomNode();
		widget.dispose();
		domNode.remove();
	}

	private _allowWidgetMove(input: NotebookEditorInput, sourceID: GroupIdentifier, targetID: GroupIdentifier): void {
		const sourcePart = this.editorGroupService.getPart(sourceID);
		const targetPart = this.editorGroupService.getPart(targetID);

		if (sourcePart.windowId !== targetPart.windowId) {
			return;
		}

		const targetWidget = this._borrowableEditors.get(targetID)?.get(input.resource);
		if (targetWidget) {
			// not needed
			return;
		}

		const widget = this._borrowableEditors.get(sourceID)?.get(input.resource);
		if (!widget) {
			throw new Error('no widget at source group');
		}
		// don't allow the widget to be retrieved at its previous location any more
		this._borrowableEditors.get(sourceID)?.delete(input.resource);

		// allow the widget to be retrieved at its new location
		let targetMap = this._borrowableEditors.get(targetID);
		if (!targetMap) {
			targetMap = new ResourceMap();
			this._borrowableEditors.set(targetID, targetMap);
		}
		targetMap.set(input.resource, widget);
	}

	retrieveExistingWidgetFromURI(resource: URI): IBorrowValue<NotebookEditorWidget> | undefined {
		for (const widgetInfo of this._borrowableEditors.values()) {
			const widget = widgetInfo.get(resource);
			if (widget) {
				return this._createBorrowValue(widget.token!, widget);
			}
		}
		return undefined;
	}

	retrieveAllExistingWidgets(): IBorrowValue<NotebookEditorWidget>[] {
		const ret: IBorrowValue<NotebookEditorWidget>[] = [];
		for (const widgetInfo of this._borrowableEditors.values()) {
			for (const widget of widgetInfo.values()) {
				ret.push(this._createBorrowValue(widget.token!, widget));
			}
		}
		return ret;
	}

	retrieveWidget(accessor: ServicesAccessor, group: IEditorGroup, input: NotebookEditorInput, creationOptions?: INotebookEditorCreationOptions, initialDimension?: Dimension, codeWindow?: CodeWindow): IBorrowValue<NotebookEditorWidget> {

		let value = this._borrowableEditors.get(group.id)?.get(input.resource);

		if (!value) {
			// NEW widget
			const editorGroupContextKeyService = accessor.get(IContextKeyService);
			const editorGroupEditorProgressService = accessor.get(IEditorProgressService);
			const notebookInstantiationService = this.instantiationService.createChild(new ServiceCollection(
				[IContextKeyService, editorGroupContextKeyService],
				[IEditorProgressService, editorGroupEditorProgressService]));
			const ctorOptions = creationOptions ?? getDefaultNotebookCreationOptions();
			const widget = notebookInstantiationService.createInstance(NotebookEditorWidget, {
				...ctorOptions,
				codeWindow: codeWindow ?? ctorOptions.codeWindow,
			}, initialDimension);
			const token = this._tokenPool++;
			value = { widget, token };

			let map = this._borrowableEditors.get(group.id);
			if (!map) {
				map = new ResourceMap();
				this._borrowableEditors.set(group.id, map);
			}
			map.set(input.resource, value);

		} else {
			// reuse a widget which was either free'ed before or which
			// is simply being reused...
			value.token = this._tokenPool++;
		}

		return this._createBorrowValue(value.token!, value);
	}

	private _createBorrowValue(myToken: number, widget: { widget: NotebookEditorWidget; token: number | undefined }): IBorrowValue<NotebookEditorWidget> {
		return {
			get value() {
				return widget.token === myToken ? widget.widget : undefined;
			}
		};
	}

	// --- editor management

	addNotebookEditor(editor: INotebookEditor): void {
		this._notebookEditors.set(editor.getId(), editor);
		this._onNotebookEditorAdd.fire(editor);
	}

	removeNotebookEditor(editor: INotebookEditor): void {
		if (this._notebookEditors.has(editor.getId())) {
			this._notebookEditors.delete(editor.getId());
			this._onNotebookEditorsRemove.fire(editor);
		}
	}

	getNotebookEditor(editorId: string): INotebookEditor | undefined {
		return this._notebookEditors.get(editorId);
	}

	listNotebookEditors(): readonly INotebookEditor[] {
		return [...this._notebookEditors].map(e => e[1]);
	}
}
