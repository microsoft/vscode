/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PeekViewWidget } from 'vs/editor/contrib/referenceSearch/peekViewWidget';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CallHierarchyItem, CallHierarchyProvider, CallHierarchyDirection } from 'vs/workbench/contrib/callHierarchy/common/callHierarchy';
import { WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { FuzzyScore } from 'vs/base/common/filters';
import * as callHierarchyTree from 'vs/workbench/contrib/callHierarchy/browser/callHierarchyTree';
import { IAsyncDataTreeOptions } from 'vs/base/browser/ui/tree/asyncDataTree';
import { localize } from 'vs/nls';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { IRange } from 'vs/editor/common/core/range';


export class CallHierarchyPeekWidget extends PeekViewWidget {

	private _tree: WorkbenchAsyncDataTree<CallHierarchyItem, callHierarchyTree.Call, FuzzyScore>;

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

		const options: IAsyncDataTreeOptions<callHierarchyTree.Call, FuzzyScore> = {
			identityProvider: new callHierarchyTree.IdentityProvider(),
			ariaLabel: localize('tree.aria', "Call Hierarchy"),
			expandOnlyOnTwistieClick: true,
		};

		this._tree = <any>this._instantiationService.createInstance(
			WorkbenchAsyncDataTree,
			container,
			new callHierarchyTree.VirtualDelegate(),
			[new callHierarchyTree.CallRenderer()],
			new callHierarchyTree.SingleDirectionDataSource(this._provider, this._direction),
			options
		);
	}

	get tree(): WorkbenchAsyncDataTree<CallHierarchyItem, callHierarchyTree.Call, FuzzyScore> {
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
