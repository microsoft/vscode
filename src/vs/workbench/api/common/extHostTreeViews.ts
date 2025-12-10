/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import type * as vscode from 'vscode';
import { basename } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, dispose, IDisposable } from '../../../base/common/lifecycle.js';
import { CheckboxUpdate, DataTransferDTO, ExtHostTreeViewsShape, MainThreadTreeViewsShape } from './extHost.protocol.js';
import { ITreeItem, TreeViewItemHandleArg, ITreeItemLabel, IRevealOptions, TreeCommand, TreeViewPaneHandleArg, ITreeItemCheckboxState, NoTreeViewError } from '../../common/views.js';
import { ExtHostCommands, CommandsConverter } from './extHostCommands.js';
import { asPromise } from '../../../base/common/async.js';
import * as extHostTypes from './extHostTypes.js';
import { isUndefinedOrNull, isString } from '../../../base/common/types.js';
import { equals, coalesce, distinct } from '../../../base/common/arrays.js';
import { ILogService, LogLevel } from '../../../platform/log/common/log.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { MarkdownString, ViewBadge, DataTransfer } from './extHostTypeConverters.js';
import { IMarkdownString, isMarkdownString } from '../../../base/common/htmlContent.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { ITreeViewsDnDService, TreeViewsDnDService } from '../../../editor/common/services/treeViewsDnd.js';
import { IAccessibilityInformation } from '../../../platform/accessibility/common/accessibility.js';
import { checkProposedApiEnabled } from '../../services/extensions/common/extensions.js';

type TreeItemHandle = string;

function toTreeItemLabel(label: any, extension: IExtensionDescription): ITreeItemLabel | undefined {
	if (isString(label)) {
		return { label };
	}

	if (label && typeof label === 'object' && label.label) {
		let highlights: [number, number][] | undefined = undefined;
		if (Array.isArray(label.highlights)) {
			highlights = (<[number, number][]>label.highlights).filter((highlight => highlight.length === 2 && typeof highlight[0] === 'number' && typeof highlight[1] === 'number'));
			highlights = highlights.length ? highlights : undefined;
		}
		if (isString(label.label)) {
			return { label: label.label, highlights };
		} else if (extHostTypes.MarkdownString.isMarkdownString(label.label)) {
			checkProposedApiEnabled(extension, 'treeItemMarkdownLabel');
			return { label: MarkdownString.from(label.label), highlights };
		}
	}

	return undefined;
}


export class ExtHostTreeViews extends Disposable implements ExtHostTreeViewsShape {

	private _treeViews: Map<string, ExtHostTreeView<any>> = new Map<string, ExtHostTreeView<any>>();
	private _treeDragAndDropService: ITreeViewsDnDService<vscode.DataTransfer> = new TreeViewsDnDService<vscode.DataTransfer>();

	constructor(
		private _proxy: MainThreadTreeViewsShape,
		private _commands: ExtHostCommands,
		private _logService: ILogService
	) {
		super();
		function isTreeViewConvertableItem(arg: any): boolean {
			return arg && arg.$treeViewId && (arg.$treeItemHandle || arg.$selectedTreeItems || arg.$focusedTreeItem);
		}
		_commands.registerArgumentProcessor({
			processArgument: arg => {
				if (isTreeViewConvertableItem(arg)) {
					return this._convertArgument(arg);
				} else if (Array.isArray(arg) && (arg.length > 0)) {
					return arg.map(item => {
						if (isTreeViewConvertableItem(item)) {
							return this._convertArgument(item);
						}
						return item;
					});
				}
				return arg;
			}
		});
	}

	registerTreeDataProvider<T>(id: string, treeDataProvider: vscode.TreeDataProvider<T>, extension: IExtensionDescription): vscode.Disposable {
		const treeView = this.createTreeView(id, { treeDataProvider }, extension);
		return { dispose: () => treeView.dispose() };
	}

	createTreeView<T>(viewId: string, options: vscode.TreeViewOptions<T>, extension: IExtensionDescription): vscode.TreeView<T> {
		if (!options || !options.treeDataProvider) {
			throw new Error('Options with treeDataProvider is mandatory');
		}
		const dropMimeTypes = options.dragAndDropController?.dropMimeTypes ?? [];
		const dragMimeTypes = options.dragAndDropController?.dragMimeTypes ?? [];
		const hasHandleDrag = !!options.dragAndDropController?.handleDrag;
		const hasHandleDrop = !!options.dragAndDropController?.handleDrop;
		const treeView = this._createExtHostTreeView(viewId, options, extension);
		const proxyOptions = { showCollapseAll: !!options.showCollapseAll, canSelectMany: !!options.canSelectMany, dropMimeTypes, dragMimeTypes, hasHandleDrag, hasHandleDrop, manuallyManageCheckboxes: !!options.manageCheckboxStateManually };
		const registerPromise = this._proxy.$registerTreeViewDataProvider(viewId, proxyOptions);
		const view = {
			get onDidCollapseElement() { return treeView.onDidCollapseElement; },
			get onDidExpandElement() { return treeView.onDidExpandElement; },
			get selection() { return treeView.selectedElements; },
			get onDidChangeSelection() { return treeView.onDidChangeSelection; },
			get activeItem() {
				checkProposedApiEnabled(extension, 'treeViewActiveItem');
				return treeView.focusedElement;
			},
			get onDidChangeActiveItem() {
				checkProposedApiEnabled(extension, 'treeViewActiveItem');
				return treeView.onDidChangeActiveItem;
			},
			get visible() { return treeView.visible; },
			get onDidChangeVisibility() { return treeView.onDidChangeVisibility; },
			get onDidChangeCheckboxState() {
				return treeView.onDidChangeCheckboxState;
			},
			get message() { return treeView.message; },
			set message(message: string | vscode.MarkdownString) {
				if (isMarkdownString(message)) {
					checkProposedApiEnabled(extension, 'treeViewMarkdownMessage');
				}
				treeView.message = message;
			},
			get title() { return treeView.title; },
			set title(title: string) {
				treeView.title = title;
			},
			get description() {
				return treeView.description;
			},
			set description(description: string | undefined) {
				treeView.description = description;
			},
			get badge() {
				return treeView.badge;
			},
			set badge(badge: vscode.ViewBadge | undefined) {
				if ((badge !== undefined) && extHostTypes.ViewBadge.isViewBadge(badge)) {
					treeView.badge = {
						value: Math.floor(Math.abs(badge.value)),
						tooltip: badge.tooltip
					};
				} else if (badge === undefined) {
					treeView.badge = undefined;
				}
			},
			reveal: (element: T, options?: IRevealOptions): Promise<void> => {
				return treeView.reveal(element, options);
			},
			dispose: async () => {
				// Wait for the registration promise to finish before doing the dispose.
				await registerPromise;
				this._treeViews.delete(viewId);
				treeView.dispose();
			}
		};
		this._register(view);
		return view as vscode.TreeView<T>;
	}

	async $getChildren(treeViewId: string, treeItemHandles?: string[]): Promise<(number | ITreeItem)[][] | undefined> {
		const treeView = this._treeViews.get(treeViewId);
		if (!treeView) {
			return Promise.reject(new NoTreeViewError(treeViewId));
		}
		if (!treeItemHandles) {
			const children = await treeView.getChildren();
			return children ? [[0, ...children]] : undefined;
		}
		// Keep order of treeItemHandles in case extension trees already depend on this
		const result = [];
		for (let i = 0; i < treeItemHandles.length; i++) {
			const treeItemHandle = treeItemHandles[i];
			const children = await treeView.getChildren(treeItemHandle);
			if (children) {
				result.push([i, ...children]);
			}

		}
		return result;
	}

	async $handleDrop(destinationViewId: string, requestId: number, treeDataTransferDTO: DataTransferDTO, targetItemHandle: string | undefined, token: CancellationToken,
		operationUuid?: string, sourceViewId?: string, sourceTreeItemHandles?: string[]): Promise<void> {
		const treeView = this._treeViews.get(destinationViewId);
		if (!treeView) {
			return Promise.reject(new NoTreeViewError(destinationViewId));
		}

		const treeDataTransfer = DataTransfer.toDataTransfer(treeDataTransferDTO, async dataItemIndex => {
			return (await this._proxy.$resolveDropFileData(destinationViewId, requestId, dataItemIndex)).buffer;
		});
		if ((sourceViewId === destinationViewId) && sourceTreeItemHandles) {
			await this._addAdditionalTransferItems(treeDataTransfer, treeView, sourceTreeItemHandles, token, operationUuid);
		}
		return treeView.onDrop(treeDataTransfer, targetItemHandle, token);
	}

	private async _addAdditionalTransferItems(treeDataTransfer: vscode.DataTransfer, treeView: ExtHostTreeView<any>,
		sourceTreeItemHandles: string[], token: CancellationToken, operationUuid?: string): Promise<vscode.DataTransfer | undefined> {
		const existingTransferOperation = this._treeDragAndDropService.removeDragOperationTransfer(operationUuid);
		if (existingTransferOperation) {
			(await existingTransferOperation)?.forEach((value, key) => {
				if (value) {
					treeDataTransfer.set(key, value);
				}
			});
		} else if (operationUuid && treeView.handleDrag) {
			const willDropPromise = treeView.handleDrag(sourceTreeItemHandles, treeDataTransfer, token);
			this._treeDragAndDropService.addDragOperationTransfer(operationUuid, willDropPromise);
			await willDropPromise;
		}
		return treeDataTransfer;
	}

	async $handleDrag(sourceViewId: string, sourceTreeItemHandles: string[], operationUuid: string, token: CancellationToken): Promise<DataTransferDTO | undefined> {
		const treeView = this._treeViews.get(sourceViewId);
		if (!treeView) {
			return Promise.reject(new NoTreeViewError(sourceViewId));
		}

		const treeDataTransfer = await this._addAdditionalTransferItems(new extHostTypes.DataTransfer(), treeView, sourceTreeItemHandles, token, operationUuid);
		if (!treeDataTransfer || token.isCancellationRequested) {
			return;
		}

		return DataTransfer.from(treeDataTransfer);
	}

	async $hasResolve(treeViewId: string): Promise<boolean> {
		const treeView = this._treeViews.get(treeViewId);
		if (!treeView) {
			throw new NoTreeViewError(treeViewId);
		}
		return treeView.hasResolve;
	}

	$resolve(treeViewId: string, treeItemHandle: string, token: vscode.CancellationToken): Promise<ITreeItem | undefined> {
		const treeView = this._treeViews.get(treeViewId);
		if (!treeView) {
			throw new NoTreeViewError(treeViewId);
		}
		return treeView.resolveTreeItem(treeItemHandle, token);
	}

	$setExpanded(treeViewId: string, treeItemHandle: string, expanded: boolean): void {
		const treeView = this._treeViews.get(treeViewId);
		if (!treeView) {
			throw new NoTreeViewError(treeViewId);
		}
		treeView.setExpanded(treeItemHandle, expanded);
	}

	$setSelectionAndFocus(treeViewId: string, selectedHandles: string[], focusedHandle: string) {
		const treeView = this._treeViews.get(treeViewId);
		if (!treeView) {
			throw new NoTreeViewError(treeViewId);
		}
		treeView.setSelectionAndFocus(selectedHandles, focusedHandle);
	}

	$setVisible(treeViewId: string, isVisible: boolean): void {
		const treeView = this._treeViews.get(treeViewId);
		if (!treeView) {
			if (!isVisible) {
				return;
			}
			throw new NoTreeViewError(treeViewId);
		}
		treeView.setVisible(isVisible);
	}

	$changeCheckboxState(treeViewId: string, checkboxUpdate: CheckboxUpdate[]): void {
		const treeView = this._treeViews.get(treeViewId);
		if (!treeView) {
			throw new NoTreeViewError(treeViewId);
		}
		treeView.setCheckboxState(checkboxUpdate);
	}

	private _createExtHostTreeView<T>(id: string, options: vscode.TreeViewOptions<T>, extension: IExtensionDescription): ExtHostTreeView<T> {
		const treeView = this._register(new ExtHostTreeView<T>(id, options, this._proxy, this._commands.converter, this._logService, extension));
		this._treeViews.set(id, treeView);
		return treeView;
	}

	private _convertArgument(arg: TreeViewItemHandleArg | TreeViewPaneHandleArg): any {
		const treeView = this._treeViews.get(arg.$treeViewId);
		const asItemHandle = arg as Partial<TreeViewItemHandleArg>;
		if (treeView && asItemHandle.$treeItemHandle) {
			return treeView.getExtensionElement(asItemHandle.$treeItemHandle);
		}
		const asPaneHandle = arg as Partial<TreeViewPaneHandleArg>;
		if (treeView && asPaneHandle.$focusedTreeItem) {
			return treeView.focusedElement;
		}
		return null;
	}
}

type Root = null | undefined | void;
type TreeData<T> = { message: boolean; element: T | T[] | Root | false };

interface TreeNode extends IDisposable {
	item: ITreeItem;
	extensionItem: vscode.TreeItem;
	parent: TreeNode | Root;
	children?: TreeNode[];
	disposableStore: DisposableStore;
}

class ExtHostTreeView<T> extends Disposable {

	private static readonly LABEL_HANDLE_PREFIX = '0';
	private static readonly ID_HANDLE_PREFIX = '1';
	private static readonly ROOT_FETCH_KEY = Symbol('extHostTreeViewRoot');

	private readonly _dataProvider: vscode.TreeDataProvider<T>;
	private readonly _dndController: vscode.TreeDragAndDropController<T> | undefined;

	private _roots: TreeNode[] | undefined = undefined;
	private _elements: Map<TreeItemHandle, T> = new Map<TreeItemHandle, T>();
	private _nodes: Map<T, TreeNode> = new Map<T, TreeNode>();
	// Track the latest child-fetch per element so that refresh-triggered cache clears ignore stale results.
	// Without these tokens, an earlier getChildren promise resolving after refresh would re-register handles and hit the duplicate-id guard.
	private readonly _childrenFetchTokens = new Map<T | typeof ExtHostTreeView.ROOT_FETCH_KEY, number>();

	private _visible: boolean = false;
	get visible(): boolean { return this._visible; }

	private _selectedHandles: TreeItemHandle[] = [];
	get selectedElements(): T[] { return <T[]>this._selectedHandles.map(handle => this.getExtensionElement(handle)).filter(element => !isUndefinedOrNull(element)); }

	private _focusedHandle: TreeItemHandle | undefined = undefined;
	get focusedElement(): T | undefined { return <T | undefined>(this._focusedHandle ? this.getExtensionElement(this._focusedHandle) : undefined); }

	private _onDidExpandElement: Emitter<vscode.TreeViewExpansionEvent<T>> = this._register(new Emitter<vscode.TreeViewExpansionEvent<T>>());
	readonly onDidExpandElement: Event<vscode.TreeViewExpansionEvent<T>> = this._onDidExpandElement.event;

	private _onDidCollapseElement: Emitter<vscode.TreeViewExpansionEvent<T>> = this._register(new Emitter<vscode.TreeViewExpansionEvent<T>>());
	readonly onDidCollapseElement: Event<vscode.TreeViewExpansionEvent<T>> = this._onDidCollapseElement.event;

	private _onDidChangeSelection: Emitter<vscode.TreeViewSelectionChangeEvent<T>> = this._register(new Emitter<vscode.TreeViewSelectionChangeEvent<T>>());
	readonly onDidChangeSelection: Event<vscode.TreeViewSelectionChangeEvent<T>> = this._onDidChangeSelection.event;

	private _onDidChangeActiveItem: Emitter<vscode.TreeViewActiveItemChangeEvent<T>> = this._register(new Emitter<vscode.TreeViewActiveItemChangeEvent<T>>());
	readonly onDidChangeActiveItem: Event<vscode.TreeViewActiveItemChangeEvent<T>> = this._onDidChangeActiveItem.event;

	private _onDidChangeVisibility: Emitter<vscode.TreeViewVisibilityChangeEvent> = this._register(new Emitter<vscode.TreeViewVisibilityChangeEvent>());
	readonly onDidChangeVisibility: Event<vscode.TreeViewVisibilityChangeEvent> = this._onDidChangeVisibility.event;

	private _onDidChangeCheckboxState = this._register(new Emitter<vscode.TreeCheckboxChangeEvent<T>>());
	readonly onDidChangeCheckboxState: Event<vscode.TreeCheckboxChangeEvent<T>> = this._onDidChangeCheckboxState.event;

	private _onDidChangeData: Emitter<TreeData<T>> = this._register(new Emitter<TreeData<T>>());

	private _refreshPromise: Promise<void> = Promise.resolve();
	private _refreshQueue: Promise<void> = Promise.resolve();

	private _nodesToClear: Set<TreeNode> = new Set<TreeNode>();

	constructor(
		private _viewId: string, options: vscode.TreeViewOptions<T>,
		private _proxy: MainThreadTreeViewsShape,
		private _commands: CommandsConverter,
		private _logService: ILogService,
		private _extension: IExtensionDescription
	) {
		super();
		if (_extension.contributes && _extension.contributes.views) {
			for (const location in _extension.contributes.views) {
				for (const view of _extension.contributes.views[location]) {
					if (view.id === _viewId) {
						this._title = view.name;
					}
				}
			}
		}
		this._dataProvider = options.treeDataProvider;
		this._dndController = options.dragAndDropController;
		if (this._dataProvider.onDidChangeTreeData) {
			this._register(this._dataProvider.onDidChangeTreeData(elementOrElements => {
				if (Array.isArray(elementOrElements) && elementOrElements.length === 0) {
					return;
				}
				this._onDidChangeData.fire({ message: false, element: elementOrElements });
			}));
		}

		let refreshingPromise: Promise<void> | null;
		let promiseCallback: () => void;
		const onDidChangeData = Event.debounce<TreeData<T>, { message: boolean; elements: (T | Root)[] }>(this._onDidChangeData.event, (result, current) => {
			if (!result) {
				result = { message: false, elements: [] };
			}
			if (current.element !== false) {
				if (!refreshingPromise) {
					// New refresh has started
					refreshingPromise = new Promise(c => promiseCallback = c);
					this._refreshPromise = this._refreshPromise.then(() => refreshingPromise!);
				}
				if (Array.isArray(current.element)) {
					result.elements.push(...current.element);
				} else {
					result.elements.push(current.element);
				}
			}
			if (current.message) {
				result.message = true;
			}
			return result;
		}, 200, true);
		this._register(onDidChangeData(({ message, elements }) => {
			if (elements.length) {
				elements = distinct(elements);
				this._refreshQueue = this._refreshQueue.then(() => {
					const _promiseCallback = promiseCallback;
					refreshingPromise = null;
					const childrenToClear = Array.from(this._nodesToClear);
					this._nodesToClear.clear();
					this._debugLogRefresh('start', elements, childrenToClear);
					return this._refresh(elements).then(() => {
						this._debugLogRefresh('done', elements, childrenToClear);
						this._clearNodes(childrenToClear);
						return _promiseCallback();
					}).catch(e => {
						const message = e instanceof Error ? e.message : JSON.stringify(e);
						this._debugLogRefresh('error', elements, childrenToClear);
						this._clearNodes(childrenToClear);
						this._logService.error(`Unable to refresh tree view ${this._viewId}: ${message}`);
						return _promiseCallback();
					});
				});
			}
			if (message) {
				this._proxy.$setMessage(this._viewId, MarkdownString.fromStrict(this._message) ?? '');
			}
		}));
	}

	private _debugCollectHandles(elements: (T | Root)[]): { changed: string[]; roots: string[]; clearing?: string[] } {
		const changed: string[] = [];
		for (const el of elements) {
			if (!el) {
				changed.push('<root>');
				continue;
			}
			const node = this._nodes.get(el as T);
			if (node) {
				changed.push(node.item.handle);
			}
		}
		const roots = this._roots?.map(r => r.item.handle) ?? [];
		return { changed, roots };
	}

	private _debugLogRefresh(phase: 'start' | 'done' | 'error', elements: (T | Root)[], childrenToClear: TreeNode[]): void {
		if (!this._isDebugLogging()) {
			return;
		}
		try {
			const snapshot = this._debugCollectHandles(elements);
			snapshot.clearing = childrenToClear.map(n => n.item.handle);
			const changedCount = snapshot.changed.length;
			const nodesToClearLen = childrenToClear.length;
			this._logService.debug(`[TreeView:${this._viewId}] refresh ${phase} changed=${changedCount} nodesToClear=${nodesToClearLen} elements.size=${this._elements.size} nodes.size=${this._nodes.size} handles=${JSON.stringify(snapshot)}`);
		} catch {
			this._logService.debug(`[TreeView:${this._viewId}] refresh ${phase} (snapshot failed)`);
		}
	}

	private _isDebugLogging(): boolean {
		try {
			const level = this._logService.getLevel();
			return (level === LogLevel.Debug) || (level === LogLevel.Trace);
		} catch {
			return false;
		}
	}

	async getChildren(parentHandle: TreeItemHandle | Root): Promise<ITreeItem[] | undefined> {
		const parentElement = parentHandle ? this.getExtensionElement(parentHandle) : undefined;
		if (parentHandle && !parentElement) {
			this._logService.error(`No tree item with id \'${parentHandle}\' found.`);
			return Promise.resolve([]);
		}

		let childrenNodes: TreeNode[] | undefined = this._getChildrenNodes(parentHandle); // Get it from cache

		if (!childrenNodes) {
			childrenNodes = await this._fetchChildrenNodes(parentElement);
		}

		return childrenNodes ? childrenNodes.map(n => n.item) : undefined;
	}

	getExtensionElement(treeItemHandle: TreeItemHandle): T | undefined {
		return this._elements.get(treeItemHandle);
	}

	reveal(element: T | undefined, options?: IRevealOptions): Promise<void> {
		options = options ? options : { select: true, focus: false };
		const select = isUndefinedOrNull(options.select) ? true : options.select;
		const focus = isUndefinedOrNull(options.focus) ? false : options.focus;
		const expand = isUndefinedOrNull(options.expand) ? false : options.expand;

		if (typeof this._dataProvider.getParent !== 'function') {
			return Promise.reject(new Error(`Required registered TreeDataProvider to implement 'getParent' method to access 'reveal' method`));
		}

		if (element) {
			return this._refreshPromise
				.then(() => this._resolveUnknownParentChain(element))
				.then(parentChain => this._resolveTreeNode(element, parentChain[parentChain.length - 1])
					.then(treeNode => this._proxy.$reveal(this._viewId, { item: treeNode.item, parentChain: parentChain.map(p => p.item) }, { select, focus, expand })), error => this._logService.error(error));
		} else {
			return this._proxy.$reveal(this._viewId, undefined, { select, focus, expand });
		}
	}

	private _message: string | vscode.MarkdownString = '';
	get message(): string | vscode.MarkdownString {
		return this._message;
	}

	set message(message: string | vscode.MarkdownString) {
		this._message = message;
		this._onDidChangeData.fire({ message: true, element: false });
	}

	private _title: string = '';
	get title(): string {
		return this._title;
	}

	set title(title: string) {
		this._title = title;
		this._proxy.$setTitle(this._viewId, title, this._description);
	}

	private _description: string | undefined;
	get description(): string | undefined {
		return this._description;
	}

	set description(description: string | undefined) {
		this._description = description;
		this._proxy.$setTitle(this._viewId, this._title, description);
	}

	private _badge: vscode.ViewBadge | undefined;
	get badge(): vscode.ViewBadge | undefined {
		return this._badge;
	}

	set badge(badge: vscode.ViewBadge | undefined) {
		if (this._badge?.value === badge?.value &&
			this._badge?.tooltip === badge?.tooltip) {
			return;
		}

		this._badge = ViewBadge.from(badge);
		this._proxy.$setBadge(this._viewId, badge);
	}

	setExpanded(treeItemHandle: TreeItemHandle, expanded: boolean): void {
		const element = this.getExtensionElement(treeItemHandle);
		if (element) {
			if (expanded) {
				this._onDidExpandElement.fire(Object.freeze({ element }));
			} else {
				this._onDidCollapseElement.fire(Object.freeze({ element }));
			}
		}
	}

	setSelectionAndFocus(selectedHandles: TreeItemHandle[], focusedHandle: string): void {
		const changedSelection = !equals(this._selectedHandles, selectedHandles);
		this._selectedHandles = selectedHandles;

		const changedFocus = this._focusedHandle !== focusedHandle;
		this._focusedHandle = focusedHandle;

		if (changedSelection) {
			this._onDidChangeSelection.fire(Object.freeze({ selection: this.selectedElements }));
		}

		if (changedFocus) {
			this._onDidChangeActiveItem.fire(Object.freeze({ activeItem: this.focusedElement }));
		}
	}

	setVisible(visible: boolean): void {
		if (visible !== this._visible) {
			this._visible = visible;
			this._onDidChangeVisibility.fire(Object.freeze({ visible: this._visible }));
		}
	}

	async setCheckboxState(checkboxUpdates: CheckboxUpdate[]) {
		type CheckboxUpdateWithItem = { extensionItem: NonNullable<T>; treeItem: vscode.TreeItem; newState: extHostTypes.TreeItemCheckboxState };
		const items = (await Promise.all(checkboxUpdates.map(async checkboxUpdate => {
			const extensionItem = this.getExtensionElement(checkboxUpdate.treeItemHandle);
			if (extensionItem) {
				return {
					extensionItem: extensionItem,
					treeItem: await this._dataProvider.getTreeItem(extensionItem),
					newState: checkboxUpdate.newState ? extHostTypes.TreeItemCheckboxState.Checked : extHostTypes.TreeItemCheckboxState.Unchecked
				};
			}
			return Promise.resolve(undefined);
		}))).filter<CheckboxUpdateWithItem>((item): item is CheckboxUpdateWithItem => item !== undefined);

		items.forEach(item => {
			item.treeItem.checkboxState = item.newState ? extHostTypes.TreeItemCheckboxState.Checked : extHostTypes.TreeItemCheckboxState.Unchecked;
		});

		this._onDidChangeCheckboxState.fire({ items: items.map(item => [item.extensionItem, item.newState]) });
	}

	async handleDrag(sourceTreeItemHandles: TreeItemHandle[], treeDataTransfer: vscode.DataTransfer, token: CancellationToken): Promise<vscode.DataTransfer | undefined> {
		const extensionTreeItems: T[] = [];
		for (const sourceHandle of sourceTreeItemHandles) {
			const extensionItem = this.getExtensionElement(sourceHandle);
			if (extensionItem) {
				extensionTreeItems.push(extensionItem);
			}
		}

		if (!this._dndController?.handleDrag || (extensionTreeItems.length === 0)) {
			return;
		}
		await this._dndController.handleDrag(extensionTreeItems, treeDataTransfer, token);
		return treeDataTransfer;
	}

	get hasHandleDrag(): boolean {
		return !!this._dndController?.handleDrag;
	}

	async onDrop(treeDataTransfer: vscode.DataTransfer, targetHandleOrNode: TreeItemHandle | undefined, token: CancellationToken): Promise<void> {
		const target = targetHandleOrNode ? this.getExtensionElement(targetHandleOrNode) : undefined;
		if ((!target && targetHandleOrNode) || !this._dndController?.handleDrop) {
			return;
		}
		return asPromise(() => this._dndController?.handleDrop
			? this._dndController.handleDrop(target, treeDataTransfer, token)
			: undefined);
	}

	get hasResolve(): boolean {
		return !!this._dataProvider.resolveTreeItem;
	}

	async resolveTreeItem(treeItemHandle: string, token: vscode.CancellationToken): Promise<ITreeItem | undefined> {
		if (!this._dataProvider.resolveTreeItem) {
			return;
		}
		const element = this._elements.get(treeItemHandle);
		if (element) {
			const node = this._nodes.get(element);
			if (node) {
				const resolve = await this._dataProvider.resolveTreeItem(node.extensionItem, element, token) ?? node.extensionItem;
				this._validateTreeItem(resolve);
				// Resolvable elements. Currently only tooltip and command.
				node.item.tooltip = this._getTooltip(resolve.tooltip);
				node.item.command = this._getCommand(node.disposableStore, resolve.command);
				return node.item;
			}
		}
		return;
	}

	private _resolveUnknownParentChain(element: T): Promise<TreeNode[]> {
		return this._resolveParent(element)
			.then((parent) => {
				if (!parent) {
					return Promise.resolve([]);
				}
				return this._resolveUnknownParentChain(parent)
					.then(result => this._resolveTreeNode(parent, result[result.length - 1])
						.then(parentNode => {
							result.push(parentNode);
							return result;
						}));
			});
	}

	private _resolveParent(element: T): Promise<T | Root> {
		const node = this._nodes.get(element);
		if (node) {
			return Promise.resolve(node.parent ? this._elements.get(node.parent.item.handle) : undefined);
		}
		return asPromise(() => this._dataProvider.getParent!(element));
	}

	private _resolveTreeNode(element: T, parent?: TreeNode): Promise<TreeNode> {
		const node = this._nodes.get(element);
		if (node) {
			return Promise.resolve(node);
		}
		return asPromise(() => this._dataProvider.getTreeItem(element))
			.then(extTreeItem => this._createHandle(element, extTreeItem, parent, true))
			.then(handle => this.getChildren(parent ? parent.item.handle : undefined)
				.then(() => {
					const cachedElement = this.getExtensionElement(handle);
					if (cachedElement) {
						const node = this._nodes.get(cachedElement);
						if (node) {
							return Promise.resolve(node);
						}
					}
					throw new Error(`Cannot resolve tree item for element ${handle} from extension ${this._extension.identifier.value}`);
				}));
	}

	private _getChildrenNodes(parentNodeOrHandle: TreeNode | TreeItemHandle | Root): TreeNode[] | undefined {
		if (parentNodeOrHandle) {
			let parentNode: TreeNode | undefined;
			if (typeof parentNodeOrHandle === 'string') {
				const parentElement = this.getExtensionElement(parentNodeOrHandle);
				parentNode = parentElement ? this._nodes.get(parentElement) : undefined;
			} else {
				parentNode = parentNodeOrHandle;
			}
			return parentNode ? parentNode.children || undefined : undefined;
		}
		return this._roots;
	}

	private _getFetchKey(parentElement?: T): T | typeof ExtHostTreeView.ROOT_FETCH_KEY {
		return parentElement ?? ExtHostTreeView.ROOT_FETCH_KEY;
	}

	private async _fetchChildrenNodes(parentElement?: T): Promise<TreeNode[] | undefined> {
		// clear children cache
		this._addChildrenToClear(parentElement);
		const fetchKey = this._getFetchKey(parentElement);
		let requestId = this._childrenFetchTokens.get(fetchKey) ?? 0;
		requestId++;
		this._childrenFetchTokens.set(fetchKey, requestId);

		const cts = new CancellationTokenSource(this._refreshCancellationSource.token);

		try {
			const elements = await this._dataProvider.getChildren(parentElement);
			if (this._childrenFetchTokens.get(fetchKey) !== requestId) {
				return undefined;
			}
			const parentNode = parentElement ? this._nodes.get(parentElement) : undefined;

			if (cts.token.isCancellationRequested) {
				return undefined;
			}

			const coalescedElements = coalesce(elements || []);
			const treeItems = await Promise.all(coalesce(coalescedElements).map(element => {
				return this._dataProvider.getTreeItem(element);
			}));
			if (this._childrenFetchTokens.get(fetchKey) !== requestId) {
				return undefined;
			}
			if (cts.token.isCancellationRequested) {
				return undefined;
			}

			// createAndRegisterTreeNodes adds the nodes to a cache. This must be done sync so that they get added in the correct order.
			const items = treeItems.map((item, index) => item ? this._createAndRegisterTreeNode(coalescedElements[index], item, parentNode) : null);
			if (this._childrenFetchTokens.get(fetchKey) !== requestId) {
				return undefined;
			}

			return coalesce(items);
		} finally {
			cts.dispose();
		}
	}

	private _refreshCancellationSource = new CancellationTokenSource();

	private _refresh(elements: (T | Root)[]): Promise<void> {
		const hasRoot = elements.some(element => !element);
		if (hasRoot) {
			// Cancel any pending children fetches
			this._refreshCancellationSource.dispose(true);
			this._refreshCancellationSource = new CancellationTokenSource();

			this._addChildrenToClear();
			return this._proxy.$refresh(this._viewId);
		} else {
			const handlesToRefresh = this._getHandlesToRefresh(<T[]>elements);
			if (handlesToRefresh.length) {
				return this._refreshHandles(handlesToRefresh);
			}
		}
		return Promise.resolve(undefined);
	}

	private _getHandlesToRefresh(elements: T[]): TreeItemHandle[] {
		const elementsToUpdate = new Set<TreeItemHandle>();
		const elementNodes = elements.map(element => this._nodes.get(element));
		for (const elementNode of elementNodes) {
			if (elementNode && !elementsToUpdate.has(elementNode.item.handle)) {
				// check if an ancestor of extElement is already in the elements list
				let currentNode: TreeNode | undefined = elementNode;
				while (currentNode && currentNode.parent && elementNodes.findIndex(node => currentNode && currentNode.parent && node && node.item.handle === currentNode.parent.item.handle) === -1) {
					const parentElement: T | undefined = this._elements.get(currentNode.parent.item.handle);
					currentNode = parentElement ? this._nodes.get(parentElement) : undefined;
				}
				if (currentNode && !currentNode.parent) {
					elementsToUpdate.add(elementNode.item.handle);
				}
			}
		}

		const handlesToUpdate: TreeItemHandle[] = [];
		// Take only top level elements
		elementsToUpdate.forEach((handle) => {
			const element = this._elements.get(handle);
			if (element) {
				const node = this._nodes.get(element);
				if (node && (!node.parent || !elementsToUpdate.has(node.parent.item.handle))) {
					handlesToUpdate.push(handle);
				}
			}
		});

		return handlesToUpdate;
	}

	private _refreshHandles(itemHandles: TreeItemHandle[]): Promise<void> {
		const itemsToRefresh: { [treeItemHandle: string]: ITreeItem } = {};
		return Promise.all(itemHandles.map(treeItemHandle =>
			this._refreshNode(treeItemHandle)
				.then(node => {
					if (node) {
						itemsToRefresh[treeItemHandle] = node.item;
					}
				})))
			.then(() => Object.keys(itemsToRefresh).length ? this._proxy.$refresh(this._viewId, itemsToRefresh) : undefined);
	}

	private _refreshNode(treeItemHandle: TreeItemHandle): Promise<TreeNode | null> {
		const extElement = this.getExtensionElement(treeItemHandle);
		if (extElement) {
			const existing = this._nodes.get(extElement);
			if (existing) {
				this._addChildrenToClear(extElement); // clear children cache
				return asPromise(() => this._dataProvider.getTreeItem(extElement))
					.then(extTreeItem => {
						if (extTreeItem) {
							const newNode = this._createTreeNode(extElement, extTreeItem, existing.parent);
							this._updateNodeCache(extElement, newNode, existing, existing.parent);
							existing.dispose();
							return newNode;
						}
						return null;
					});
			}
		}
		return Promise.resolve(null);
	}

	private _createAndRegisterTreeNode(element: T, extTreeItem: vscode.TreeItem, parentNode: TreeNode | Root): TreeNode {
		const node = this._createTreeNode(element, extTreeItem, parentNode);
		if (extTreeItem.id && this._elements.has(node.item.handle)) {
			throw new Error(localize('treeView.duplicateElement', 'Element with id {0} is already registered', extTreeItem.id));
		}
		this._addNodeToCache(element, node);
		this._addNodeToParentCache(node, parentNode);
		return node;
	}

	private _getTooltip(tooltip?: string | vscode.MarkdownString): string | IMarkdownString | undefined {
		if (extHostTypes.MarkdownString.isMarkdownString(tooltip)) {
			return MarkdownString.from(tooltip);
		}
		return tooltip;
	}

	private _getCommand(disposable: DisposableStore, command?: vscode.Command): TreeCommand | undefined {
		return command ? { ...this._commands.toInternal(command, disposable), originalId: command.command } : undefined;
	}

	private _getCheckbox(extensionTreeItem: vscode.TreeItem): ITreeItemCheckboxState | undefined {
		if (extensionTreeItem.checkboxState === undefined) {
			return undefined;
		}
		let checkboxState: extHostTypes.TreeItemCheckboxState;
		let tooltip: string | undefined = undefined;
		let accessibilityInformation: IAccessibilityInformation | undefined = undefined;
		if (typeof extensionTreeItem.checkboxState === 'number') {
			checkboxState = extensionTreeItem.checkboxState;
		} else {
			checkboxState = extensionTreeItem.checkboxState.state;
			tooltip = extensionTreeItem.checkboxState.tooltip;
			accessibilityInformation = extensionTreeItem.checkboxState.accessibilityInformation;
		}
		return { isChecked: checkboxState === extHostTypes.TreeItemCheckboxState.Checked, tooltip, accessibilityInformation };
	}

	private _validateTreeItem(extensionTreeItem: vscode.TreeItem) {
		if (!extHostTypes.TreeItem.isTreeItem(extensionTreeItem, this._extension)) {
			throw new Error(`Extension ${this._extension.identifier.value} has provided an invalid tree item.`);
		}
	}

	private _createTreeNode(element: T, extensionTreeItem: vscode.TreeItem, parent: TreeNode | Root): TreeNode {
		this._validateTreeItem(extensionTreeItem);
		const disposableStore = this._register(new DisposableStore());
		const handle = this._createHandle(element, extensionTreeItem, parent);
		const icon = this._getLightIconPath(extensionTreeItem);
		const item: ITreeItem = {
			handle,
			parentHandle: parent ? parent.item.handle : undefined,
			label: toTreeItemLabel(extensionTreeItem.label, this._extension),
			description: extensionTreeItem.description,
			resourceUri: extensionTreeItem.resourceUri,
			tooltip: this._getTooltip(extensionTreeItem.tooltip),
			command: this._getCommand(disposableStore, extensionTreeItem.command),
			contextValue: extensionTreeItem.contextValue,
			icon,
			iconDark: this._getDarkIconPath(extensionTreeItem) || icon,
			themeIcon: this._getThemeIcon(extensionTreeItem),
			collapsibleState: isUndefinedOrNull(extensionTreeItem.collapsibleState) ? extHostTypes.TreeItemCollapsibleState.None : extensionTreeItem.collapsibleState,
			accessibilityInformation: extensionTreeItem.accessibilityInformation,
			checkbox: this._getCheckbox(extensionTreeItem),
		};

		return {
			item,
			extensionItem: extensionTreeItem,
			parent,
			children: undefined,
			disposableStore,
			dispose(): void { disposableStore.dispose(); }
		};
	}

	private _getThemeIcon(extensionTreeItem: vscode.TreeItem): extHostTypes.ThemeIcon | undefined {
		return extensionTreeItem.iconPath instanceof extHostTypes.ThemeIcon ? extensionTreeItem.iconPath : undefined;
	}

	private _createHandle(element: T, { id, label, resourceUri }: vscode.TreeItem, parent: TreeNode | Root, returnFirst?: boolean): TreeItemHandle {
		if (id) {
			return `${ExtHostTreeView.ID_HANDLE_PREFIX}/${id}`;
		}

		const treeItemLabel = toTreeItemLabel(label, this._extension);
		const prefix: string = parent ? parent.item.handle : ExtHostTreeView.LABEL_HANDLE_PREFIX;
		let labelValue = '';
		if (treeItemLabel) {
			if (isMarkdownString(treeItemLabel.label)) {
				labelValue = treeItemLabel.label.value;
			} else {
				labelValue = treeItemLabel.label;
			}
		}
		let elementId = labelValue || (resourceUri ? basename(resourceUri) : '');
		elementId = elementId.indexOf('/') !== -1 ? elementId.replace('/', '//') : elementId;
		const existingHandle = this._nodes.has(element) ? this._nodes.get(element)!.item.handle : undefined;
		const childrenNodes = (this._getChildrenNodes(parent) || []);

		let handle: TreeItemHandle;
		let counter = 0;
		do {
			handle = `${prefix}/${counter}:${elementId}`;
			if (returnFirst || !this._elements.has(handle) || existingHandle === handle) {
				// Return first if asked for or
				// Return if handle does not exist or
				// Return if handle is being reused
				break;
			}
			counter++;
		} while (counter <= childrenNodes.length);

		return handle;
	}

	private _getLightIconPath(extensionTreeItem: vscode.TreeItem): URI | undefined {
		if (extensionTreeItem.iconPath && !(extensionTreeItem.iconPath instanceof extHostTypes.ThemeIcon)) {
			if (typeof extensionTreeItem.iconPath === 'string'
				|| URI.isUri(extensionTreeItem.iconPath)) {
				return this._getIconPath(extensionTreeItem.iconPath);
			}
			return this._getIconPath((<{ light: string | URI; dark: string | URI }>extensionTreeItem.iconPath).light);
		}
		return undefined;
	}

	private _getDarkIconPath(extensionTreeItem: vscode.TreeItem): URI | undefined {
		if (extensionTreeItem.iconPath && !(extensionTreeItem.iconPath instanceof extHostTypes.ThemeIcon) && (<{ light: string | URI; dark: string | URI }>extensionTreeItem.iconPath).dark) {
			return this._getIconPath((<{ light: string | URI; dark: string | URI }>extensionTreeItem.iconPath).dark);
		}
		return undefined;
	}

	private _getIconPath(iconPath: string | URI): URI {
		if (URI.isUri(iconPath)) {
			return iconPath;
		}
		return URI.file(iconPath);
	}

	private _addNodeToCache(element: T, node: TreeNode): void {
		this._elements.set(node.item.handle, element);
		this._nodes.set(element, node);
	}

	private _updateNodeCache(element: T, newNode: TreeNode, existing: TreeNode, parentNode: TreeNode | Root): void {
		// Remove from the cache
		this._elements.delete(newNode.item.handle);
		this._nodes.delete(element);
		if (newNode.item.handle !== existing.item.handle) {
			this._elements.delete(existing.item.handle);
		}

		// Add the new node to the cache
		this._addNodeToCache(element, newNode);

		// Replace the node in parent's children nodes
		const childrenNodes = (this._getChildrenNodes(parentNode) || []);
		const childNode = childrenNodes.filter(c => c.item.handle === existing.item.handle)[0];
		if (childNode) {
			childrenNodes.splice(childrenNodes.indexOf(childNode), 1, newNode);
		}
	}

	private _addNodeToParentCache(node: TreeNode, parentNode: TreeNode | Root): void {
		if (parentNode) {
			if (!parentNode.children) {
				parentNode.children = [];
			}
			parentNode.children.push(node);
		} else {
			if (!this._roots) {
				this._roots = [];
			}
			this._roots.push(node);
		}
	}

	private _addChildrenToClear(parentElement?: T): void {
		if (parentElement) {
			const node = this._nodes.get(parentElement);
			if (node) {
				if (node.children) {
					for (const child of node.children) {
						this._nodesToClear.add(child);
						const childElement = this._elements.get(child.item.handle);
						if (childElement) {
							this._addChildrenToClear(childElement);
							this._nodes.delete(childElement);
							this._elements.delete(child.item.handle);
						}
					}
				}
				node.children = undefined;
			}
		} else {
			this._addAllToClear();
		}
	}

	private _addAllToClear(): void {
		this._roots = undefined;
		this._nodes.forEach(node => {
			this._nodesToClear.add(node);
		});
		this._nodes.clear();
		this._elements.clear();
		this._childrenFetchTokens.clear();
	}

	private _clearNodes(nodes: TreeNode[]): void {
		dispose(nodes);
	}

	private _clearAll(): void {
		this._roots = undefined;
		this._elements.clear();
		dispose(this._nodes.values());
		this._nodes.clear();
		dispose(this._nodesToClear);
		this._nodesToClear.clear();
		this._childrenFetchTokens.clear();
	}

	override dispose() {
		super.dispose();
		this._refreshCancellationSource.dispose();

		this._clearAll();
		this._proxy.$disposeTree(this._viewId);
	}
}
