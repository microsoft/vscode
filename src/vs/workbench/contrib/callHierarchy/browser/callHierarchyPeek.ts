/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/callHierarchy';
import { PeekViewWidget } from 'vs/editor/contrib/referenceSearch/peekViewWidget';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CallHierarchyItem, CallHierarchyProvider, CallHierarchyDirection } from 'vs/workbench/contrib/callHierarchy/common/callHierarchy';
import { WorkbenchAsyncDataTree, WorkbenchList } from 'vs/platform/list/browser/listService';
import { FuzzyScore } from 'vs/base/common/filters';
import * as callHTree from 'vs/workbench/contrib/callHierarchy/browser/callHierarchyTree';
import * as callHList from 'vs/workbench/contrib/callHierarchy/browser/callHierarchyList';
import { IAsyncDataTreeOptions } from 'vs/base/browser/ui/tree/asyncDataTree';
import { localize } from 'vs/nls';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { Location } from 'vs/editor/common/modes';
import { IRange } from 'vs/editor/common/core/range';
import { SplitView, Orientation, Sizing } from 'vs/base/browser/ui/splitview/splitview';
import { Dimension, addClass } from 'vs/base/browser/dom';
import { Emitter, Event } from 'vs/base/common/event';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class CallHierarchyTreePeekWidget extends PeekViewWidget {

	private _splitView: SplitView;
	private _tree: WorkbenchAsyncDataTree<CallHierarchyItem, callHTree.Call, FuzzyScore>;
	private _list: WorkbenchList<Location>;
	private _dim: Dimension = { height: undefined, width: undefined };

	constructor(
		editor: ICodeEditor,
		private readonly _provider: CallHierarchyProvider,
		private readonly _direction: CallHierarchyDirection,
		private readonly _item: CallHierarchyItem,
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super(editor, { showFrame: true, showArrow: true, isResizeable: true, isAccessible: true });
		this.create();
	}

	protected _fillBody(container: HTMLElement): void {

		this._splitView = new SplitView(container, { orientation: Orientation.HORIZONTAL });

		// tree stuff
		const treeContainer = document.createElement('div');
		container.appendChild(treeContainer);
		const options: IAsyncDataTreeOptions<callHTree.Call, FuzzyScore> = {
			identityProvider: new callHTree.IdentityProvider(),
			ariaLabel: localize('tree.aria', "Call Hierarchy"),
			expandOnlyOnTwistieClick: true,
		};
		this._tree = <any>this._instantiationService.createInstance(
			WorkbenchAsyncDataTree,
			treeContainer,
			new callHTree.VirtualDelegate(),
			[new callHTree.CallRenderer()],
			new callHTree.SingleDirectionDataSource(this._provider, this._direction),
			options
		);

		// list stuff
		const listContainer = document.createElement('div');
		container.appendChild(listContainer);
		this._list = <any>this._instantiationService.createInstance(
			WorkbenchList,
			listContainer,
			new callHList.Delegate(),
			[this._instantiationService.createInstance(callHList.LocationRenderer)],
			{}
		);

		// split stuff

		this._splitView.addView({
			onDidChange: Event.None,
			element: treeContainer,
			minimumSize: 100,
			maximumSize: Number.MAX_VALUE,
			layout: (width) => {
				this._tree.layout(this._dim.height, width);
			}
		}, Sizing.Distribute);

		this._splitView.addView({
			onDidChange: Event.None,
			element: listContainer,
			minimumSize: 100,
			maximumSize: Number.MAX_VALUE,
			layout: (width) => {
				this._list.layout(this._dim.height, width);
			}
		}, Sizing.Distribute);

		// update list
		this._tree.onDidChangeFocus(e => {
			const [element] = e.elements;
			if (element && element.locations) {
				this._list.splice(0, this._list.length, element.locations);
			}
		}, undefined, this._disposables);

		// this._tree.onDidOpen(e => {
		// 	this._list.focusFirst();
		// 	this._list.domFocus();
		// }, undefined, this._disposables);

		// goto location
		this._list.onDidOpen(e => {
			const [element] = e.elements;
			this.dispose();
			this._editorService.openEditor({
				resource: element.uri,
				options: { selection: element.range }
			});

		}, undefined, this._disposables);
	}

	dispose(): void {
		super.dispose();
		this._splitView.dispose();
		this._tree.dispose();
		this._list.dispose();
	}

	show(where: IRange) {
		this.editor.revealRangeInCenterIfOutsideViewport(where, ScrollType.Smooth);
		super.show(where, 12);
		this.setTitle(localize('title', "Call Hierarchy for '{0}'", this._item.name));
		this._tree.setInput(this._item);
		this._tree.domFocus();
		this._tree.focusFirst();
	}

	protected _onWidth(width: number) {
		if (this._dim) {
			this._doLayoutBody(this._dim.height, width);
		}
	}

	protected _doLayoutBody(height: number, width: number): void {
		super._doLayoutBody(height, width);
		this._dim = { height, width };
		this._splitView.layout(width);
	}
}

export class CallHierarchyColumnPeekWidget extends PeekViewWidget {

	private readonly _emitter = new Emitter<{ column: callHList.CallColumn, element: callHList.ListElement, focus: boolean }>();
	private _splitView: SplitView;
	private _dim: Dimension;

	constructor(
		editor: ICodeEditor,
		private readonly _provider: CallHierarchyProvider,
		private readonly _direction: CallHierarchyDirection,
		private readonly _root: CallHierarchyItem,
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super(editor, { showFrame: true, showArrow: true, isResizeable: true, isAccessible: true });
		this.create();
	}

	dispose(): void {
		super.dispose();
		this._splitView.dispose();
		this._emitter.dispose();
	}

	protected _fillBody(container: HTMLElement): void {
		addClass(container, 'call-hierarchy-columns');

		this._splitView = new SplitView(container, { orientation: Orientation.HORIZONTAL });
		this._emitter.event(e => {
			const { element, column, focus } = e;

			// remove old
			while (column.index + 1 < this._splitView.length) {
				this._splitView.removeView(this._splitView.length - 1);
			}
			const getDim = () => this._dim || { height: undefined, width: undefined };

			// add new
			if (element instanceof callHTree.Call) {
				let newColumn = this._instantiationService.createInstance(
					callHList.CallColumn,
					column.index + 1,
					element,
					this._provider,
					this._direction,
					this._emitter,
					getDim
				);
				this._disposables.push(newColumn);
				this._splitView.addView(newColumn, Sizing.Distribute);

				if (!focus) {
					setTimeout(() => newColumn.focus());
				}

				let parts = this._splitView.items.map(column => column instanceof callHList.CallColumn ? column.root.item.name : undefined).filter(e => Boolean(e));
				this.setTitle(localize('title', "Call Hierarchy for '{0}'", parts.join(' > ')));

			} else {

				if (!focus) {
					this.dispose();
					this._editorService.openEditor({
						resource: element.uri,
						options: { selection: element.range }
					});
				} else {
					let newColumn = this._instantiationService.createInstance(
						callHList.LocationColumn,
						element,
						getDim,
						this.editor
					);
					this._disposables.push(newColumn);
					this._splitView.addView(newColumn, Sizing.Distribute);
				}
			}
		});
	}

	show(where: IRange) {
		this.editor.revealRangeInCenterIfOutsideViewport(where, ScrollType.Smooth);
		super.show(where, 16);
		this.setTitle(localize('title', "Call Hierarchy for '{0}'", this._root.name));

		// add root items...
		const item = this._instantiationService.createInstance(
			callHList.CallColumn,
			0,
			new callHTree.Call(this._direction, this._root, []),
			this._provider,
			this._direction,
			this._emitter,
			() => this._dim || { height: undefined, width: undefined }
		);
		this._disposables.push(item);
		this._splitView.addView(item, item.minimumSize);
		setTimeout(() => item.focus());
	}

	protected _onWidth(width: number) {
		if (this._dim) {
			this._doLayoutBody(this._dim.height, width);
		}
	}

	protected _doLayoutBody(height: number, width: number): void {
		super._doLayoutBody(height, width);
		this._dim = { height, width };
		this._splitView.layout(width);
	}
}
