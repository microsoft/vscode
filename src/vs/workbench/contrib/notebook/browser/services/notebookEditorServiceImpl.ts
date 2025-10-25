/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeWindow } from '../../../../../base/browser/window.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { getDefaultNotebookCreationOptions, NotebookEditorWidget } from '../notebookEditorWidget.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IEditorGroupsService, IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { isCompositeNotebookEditorInput, isNotebookEditorInput, NotebookEditorInput } from '../../common/notebookEditorInput.js';
import { IBorrowValue, INotebookEditorService } from './notebookEditorService.js';
import { INotebookEditor, INotebookEditorCreationOptions } from '../notebookBrowser.js';
import { Emitter } from '../../../../../base/common/event.js';
import { GroupIdentifier, GroupModelChangeKind } from '../../../../common/editor.js';
import { Dimension } from '../../../../../base/browser/dom.js';
import { URI } from '../../../../../base/common/uri.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { InteractiveWindowOpen, MOST_RECENT_REPL_EDITOR } from '../../common/notebookContextKeys.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import { NotebookDiffEditorInput } from '../../common/notebookDiffEditorInput.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';

export class NotebookEditorWidgetService implements INotebookEditorService {

	readonly _serviceBrand: undefined;

	private _tokenPool = 1;

	private readonly _disposables = new DisposableStore();
	private readonly _notebookEditors = new Map<string, INotebookEditor>();

	private readonly groupListener = new Map<number, IDisposable[]>();

	private readonly _onNotebookEditorAdd = new Emitter<INotebookEditor>();
	private readonly _onNotebookEditorsRemove = new Emitter<INotebookEditor>();
	readonly onDidAddNotebookEditor = this._onNotebookEditorAdd.event;
	readonly onDidRemoveNotebookEditor = this._onNotebookEditorsRemove.event;

	private readonly _mostRecentRepl: IContextKey<string | undefined>;

	private readonly _borrowableEditors = new Map<number, ResourceMap<{ widget: NotebookEditorWidget; editorType: string; token: number | undefined; disposableStore: DisposableStore }[]>>();

	constructor(
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		const onNewGroup = (group: IEditorGroup) => {
			const { id } = group;
			const listeners: IDisposable[] = [];
			listeners.push(group.onDidCloseEditor(e => {
				const widgetMap = this._borrowableEditors.get(group.id);
				if (!widgetMap) {
					return;
				}

				const inputs = e.editor instanceof NotebookEditorInput || e.editor instanceof NotebookDiffEditorInput
					? [e.editor]
					: (isCompositeNotebookEditorInput(e.editor) ? e.editor.editorInputs : []);
				inputs.forEach(input => {
					const widgets = widgetMap.get(input.resource);
					const index = widgets?.findIndex(widget => widget.editorType === input.typeId);
					if (!widgets || index === undefined || index === -1) {
						return;
					}
					const value = widgets.splice(index, 1)[0];
					value.token = undefined;
					this._disposeWidget(value.widget);
					value.disposableStore.dispose();
					// eslint-disable-next-line local/code-no-any-casts
					value.widget = (<any>undefined); // unset the widget so that others that still hold a reference don't harm us
				});
			}));
			listeners.push(group.onWillMoveEditor(e => {
				if (isNotebookEditorInput(e.editor)) {
					this._allowWidgetMove(e.editor, e.groupId, e.target);
				}

				if (isCompositeNotebookEditorInput(e.editor)) {
					e.editor.editorInputs.forEach(input => {
						this._allowWidgetMove(input, e.groupId, e.target);
					});
				}
			}));
			this.groupListener.set(id, listeners);
		};
		this._disposables.add(editorGroupService.onDidAddGroup(onNewGroup));
		editorGroupService.whenReady.then(() => editorGroupService.groups.forEach(onNewGroup));

		// group removed -> clean up listeners, clean up widgets
		this._disposables.add(editorGroupService.onDidRemoveGroup(group => {
			const listeners = this.groupListener.get(group.id);
			if (listeners) {
				listeners.forEach(listener => listener.dispose());
				this.groupListener.delete(group.id);
			}
			const widgets = this._borrowableEditors.get(group.id);
			this._borrowableEditors.delete(group.id);
			if (widgets) {
				for (const values of widgets.values()) {
					for (const value of values) {
						value.token = undefined;
						this._disposeWidget(value.widget);
						value.disposableStore.dispose();
					}
				}
			}
		}));

		this._mostRecentRepl = MOST_RECENT_REPL_EDITOR.bindTo(contextKeyService);
		const interactiveWindowOpen = InteractiveWindowOpen.bindTo(contextKeyService);
		this._disposables.add(editorService.onDidEditorsChange(e => {
			if (e.event.kind === GroupModelChangeKind.EDITOR_OPEN && !interactiveWindowOpen.get()) {
				if (editorService.editors.find(editor => isCompositeNotebookEditorInput(editor))) {
					interactiveWindowOpen.set(true);
				}
			} else if (e.event.kind === GroupModelChangeKind.EDITOR_CLOSE && interactiveWindowOpen.get()) {
				if (!editorService.editors.find(editor => isCompositeNotebookEditorInput(editor))) {
					interactiveWindowOpen.set(false);
				}
			}
		}));
	}

	dispose() {
		this._disposables.dispose();
		this._onNotebookEditorAdd.dispose();
		this._onNotebookEditorsRemove.dispose();
		this.groupListener.forEach((listeners) => {
			listeners.forEach(listener => listener.dispose());
		});
		this.groupListener.clear();
		this._borrowableEditors.forEach(widgetMap => {
			widgetMap.forEach(widgets => {
				widgets.forEach(widget => widget.disposableStore.dispose());
			});
		});
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

		const target = this._borrowableEditors.get(targetID)?.get(input.resource)?.findIndex(widget => widget.editorType === input.typeId);
		if (target !== undefined && target !== -1) {
			// not needed, a separate widget is already there
			return;
		}

		const widget = this._borrowableEditors.get(sourceID)?.get(input.resource)?.find(widget => widget.editorType === input.typeId);
		if (!widget) {
			throw new Error('no widget at source group');
		}

		// don't allow the widget to be retrieved at its previous location any more
		const sourceWidgets = this._borrowableEditors.get(sourceID)?.get(input.resource);
		if (sourceWidgets) {
			const indexToRemove = sourceWidgets.findIndex(widget => widget.editorType === input.typeId);
			if (indexToRemove !== -1) {
				sourceWidgets.splice(indexToRemove, 1);
			}
		}

		// allow the widget to be retrieved at its new location
		let targetMap = this._borrowableEditors.get(targetID);
		if (!targetMap) {
			targetMap = new ResourceMap();
			this._borrowableEditors.set(targetID, targetMap);
		}
		const widgetsAtTarget = targetMap.get(input.resource) ?? [];
		widgetsAtTarget?.push(widget);
		targetMap.set(input.resource, widgetsAtTarget);
	}

	retrieveExistingWidgetFromURI(resource: URI): IBorrowValue<NotebookEditorWidget> | undefined {
		for (const widgetInfo of this._borrowableEditors.values()) {
			const widgets = widgetInfo.get(resource);
			if (widgets && widgets.length > 0) {
				return this._createBorrowValue(widgets[0].token!, widgets[0]);
			}
		}
		return undefined;
	}

	retrieveAllExistingWidgets(): IBorrowValue<NotebookEditorWidget>[] {
		const ret: IBorrowValue<NotebookEditorWidget>[] = [];
		for (const widgetInfo of this._borrowableEditors.values()) {
			for (const widgets of widgetInfo.values()) {
				for (const widget of widgets) {
					ret.push(this._createBorrowValue(widget.token!, widget));
				}
			}
		}
		return ret;
	}

	retrieveWidget(accessor: ServicesAccessor, groupId: number, input: { resource: URI; typeId: string }, creationOptions?: INotebookEditorCreationOptions, initialDimension?: Dimension, codeWindow?: CodeWindow): IBorrowValue<NotebookEditorWidget> {

		let value = this._borrowableEditors.get(groupId)?.get(input.resource)?.find(widget => widget.editorType === input.typeId);

		if (!value) {
			// NEW widget
			const editorGroupContextKeyService = accessor.get(IContextKeyService);
			const editorGroupEditorProgressService = accessor.get(IEditorProgressService);
			const widgetDisposeStore = new DisposableStore();
			const widget = this.createWidget(editorGroupContextKeyService, widgetDisposeStore, editorGroupEditorProgressService, creationOptions, codeWindow, initialDimension);
			const token = this._tokenPool++;
			value = { widget, editorType: input.typeId, token, disposableStore: widgetDisposeStore };

			let map = this._borrowableEditors.get(groupId);
			if (!map) {
				map = new ResourceMap();
				this._borrowableEditors.set(groupId, map);
			}
			const values = map.get(input.resource) ?? [];
			values.push(value);
			map.set(input.resource, values);
		} else {
			// reuse a widget which was either free'ed before or which
			// is simply being reused...
			value.token = this._tokenPool++;
		}

		return this._createBorrowValue(value.token!, value);
	}

	// protected for unit testing overrides
	protected createWidget(editorGroupContextKeyService: IContextKeyService, widgetDisposeStore: DisposableStore, editorGroupEditorProgressService: IEditorProgressService, creationOptions?: INotebookEditorCreationOptions, codeWindow?: CodeWindow, initialDimension?: Dimension) {
		const notebookInstantiationService = widgetDisposeStore.add(this.instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, editorGroupContextKeyService],
			[IEditorProgressService, editorGroupEditorProgressService])));
		const ctorOptions = creationOptions ?? getDefaultNotebookCreationOptions();
		const widget = notebookInstantiationService.createInstance(NotebookEditorWidget, {
			...ctorOptions,
			codeWindow: codeWindow ?? ctorOptions.codeWindow,
		}, initialDimension);
		return widget;
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
		const notebookUri = editor.getViewModel()?.notebookDocument.uri;
		if (this._notebookEditors.has(editor.getId())) {
			this._notebookEditors.delete(editor.getId());
			this._onNotebookEditorsRemove.fire(editor);
		}
		if (this._mostRecentRepl.get() === notebookUri?.toString()) {
			this._mostRecentRepl.reset();
		}
	}

	getNotebookEditor(editorId: string): INotebookEditor | undefined {
		return this._notebookEditors.get(editorId);
	}

	listNotebookEditors(): readonly INotebookEditor[] {
		return [...this._notebookEditors].map(e => e[1]);
	}

	getNotebookForPossibleCell(candidate: ICodeEditor): INotebookEditor | undefined {
		for (const editor of this._notebookEditors.values()) {
			for (const [, codeEditor] of editor.codeEditors) {
				if (codeEditor === candidate) {
					return editor;
				}
			}
		}
		return undefined;
	}

	updateReplContextKey(uri: string): void {
		this._mostRecentRepl.set(uri);
	}
}
