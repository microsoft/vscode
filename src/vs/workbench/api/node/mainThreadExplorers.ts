/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ITreeNode} from 'vscode';
import {TPromise} from 'vs/base/common/winjs.base';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import {ExtHostContext, MainThreadExplorersShape, ExtHostExplorersShape} from './extHost.protocol';
import {ITreeExplorerViewletService} from 'vs/workbench/parts/explorers/browser/treeExplorerViewletService';
import {TreeViewNode} from 'vs/workbench/parts/explorers/common/treeViewModel';

import { ExtHostTreeNode } from 'vs/workbench/api/node/extHostExplorers';

export class MainThreadExplorers extends MainThreadExplorersShape {
	private _proxy: ExtHostExplorersShape;

	private _treeContents: { [treeContentProviderId: string]: ExtHostTreeNode };

	constructor(
		@IThreadService threadService: IThreadService,
		@ITreeExplorerViewletService private treeExplorerViewletService: ITreeExplorerViewletService
	) {
		super();

		this._proxy = threadService.get(ExtHostContext.ExtHostExplorers);
		this._treeContents = Object.create(null);
	}

	$registerTreeContentProvider(providerId: string): void {
		this.treeExplorerViewletService.registerTreeContentProvider(providerId, {
			provideTreeContent: (): TPromise<ExtHostTreeNode> => {
				return this._proxy.$provideTreeContent(providerId).then(treeContent => {
					this._treeContents[providerId] = treeContent;
					return treeContent;
				})
			},
			resolveChildren: (node: ExtHostTreeNode): TPromise<ExtHostTreeNode[]> => {
				return this._proxy.$resolveChildren(providerId, node);
			}
		});
	}

	$unregisterTreeContentProvider(treeContentProviderId: string): void {

	}
}