/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./callHierarchy';
import { PeekViewWidget } from 'vs/editor/contrib/referenceSearch/peekViewWidget';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CallHierarchyItem, CallHierarchyProvider, CallHierarchyDirection } from 'vs/workbench/contrib/callHierarchy/common/callHierarchy';
import { WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { FuzzyScore } from 'vs/base/common/filters';
import * as callHTree from 'vs/workbench/contrib/callHierarchy/browser/callHierarchyTree';
import { IAsyncDataTreeOptions } from 'vs/base/browser/ui/tree/asyncDataTree';
import { localize } from 'vs/nls';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { IRange } from 'vs/editor/common/core/range';
import { SplitView, Orientation, Sizing } from 'vs/base/browser/ui/splitview/splitview';
import { Dimension, addClass } from 'vs/base/browser/dom';
import { CallColumn, ListElement, LocationColumn } from 'vs/workbench/contrib/callHierarchy/browser/callHierarchyList';
import { Emitter } from 'vs/base/common/event';

export class CallHierarchyTreePeekWidget extends PeekViewWidget {

	private _tree: WorkbenchAsyncDataTree<CallHierarchyItem, callHTree.Call, FuzzyScore>;

	constructor(
		editor: ICodeEditor,
		private readonly _provider: CallHierarchyProvider,
		private readonly _direction: CallHierarchyDirection,
		private readonly _item: CallHierarchyItem,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super(editor, { showFrame: true, showArrow: true, isResizeable: true, isAccessible: true });
		this.create();
	}

	protected _fillBody(container: HTMLElement): void {


		const options: IAsyncDataTreeOptions<callHTree.Call, FuzzyScore> = {
			identityProvider: new callHTree.IdentityProvider(),
			ariaLabel: localize('tree.aria', "Call Hierarchy"),
			expandOnlyOnTwistieClick: true,
		};

		this._tree = <any>this._instantiationService.createInstance(
			WorkbenchAsyncDataTree,
			container,
			new callHTree.VirtualDelegate(),
			[new callHTree.CallRenderer()],
			new callHTree.SingleDirectionDataSource(this._provider, this._direction),
			options
		);
	}

	get tree(): WorkbenchAsyncDataTree<CallHierarchyItem, callHTree.Call, FuzzyScore> {
		return this._tree;
	}

	show(where: IRange) {
		this.editor.revealRangeInCenterIfOutsideViewport(where, ScrollType.Smooth);
		super.show(where, 12);
		this.setTitle(localize('title', "Call Hierarchy for '{0}'", this._item.name));
		this._tree.setInput(this._item);
		this._tree.domFocus();
		this._tree.focusFirst();
	}

	protected _doLayoutBody(height: number, width: number): void {
		super._doLayoutBody(height, width);
		this._tree.layout(height, width);
	}
}


export class CallHierarchyColumnPeekWidget extends PeekViewWidget {

	private readonly _emitter = new Emitter<{ column: CallColumn, element: ListElement }>();
	private _splitView: SplitView;
	private _dim: Dimension;


	constructor(
		editor: ICodeEditor,
		private readonly _provider: CallHierarchyProvider,
		private readonly _direction: CallHierarchyDirection,
		private readonly _root: CallHierarchyItem,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super(editor, { showFrame: true, showArrow: true, isResizeable: true, isAccessible: true });
		this.create();
	}

	protected _fillBody(container: HTMLElement): void {
		addClass(container, 'call-hierarchy-columns');

		this._splitView = new SplitView(container, { orientation: Orientation.HORIZONTAL });
		this._emitter.event(e => {
			const { element, column } = e;

			// remove old
			while (column.index + 1 < this._splitView.length) {
				this._splitView.removeView(this._splitView.length - 1);
			}
			const getDim = () => this._dim || { height: undefined, width: undefined };

			// add new
			let newColumn: CallColumn | LocationColumn;
			if (element instanceof callHTree.Call) {
				newColumn = this._instantiationService.createInstance(
					CallColumn,
					column.index + 1,
					element,
					this._provider,
					this._direction,
					this._emitter,
					getDim
				);
			} else {
				newColumn = this._instantiationService.createInstance(
					LocationColumn,
					element,
					getDim,
					this.editor
				);
			}

			this._disposables.push(newColumn);
			this._splitView.addView(newColumn, Sizing.Distribute);

			setTimeout(() => newColumn.focus());

			let parts = this._splitView.items.map(column => column instanceof CallColumn ? column.root.item.name : undefined).filter(e => Boolean(e));
			this.setTitle(localize('title', "Call Hierarchy for '{0}'", parts.join(' > ')));

		});
	}

	show(where: IRange) {
		this.editor.revealRangeInCenterIfOutsideViewport(where, ScrollType.Smooth);
		super.show(where, 16);
		this.setTitle(localize('title', "Call Hierarchy for '{0}'", this._root.name));

		// add root items...
		const item = this._instantiationService.createInstance(
			CallColumn,
			0,
			new callHTree.Call(this._direction, this._root, []),
			this._provider,
			this._direction,
			this._emitter,
			() => this._dim || { height: undefined, width: undefined }
		);
		this._disposables.push(item);
		this._splitView.addView(item, item.minimumSize);
		item.focus();
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
