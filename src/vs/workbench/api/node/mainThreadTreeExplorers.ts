/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TreeExplorerNode } from 'vscode';
import { TPromise } from 'vs/base/common/winjs.base';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ExtHostContext, MainThreadTreeExplorersShape, ExtHostTreeExplorersShape } from './extHost.protocol';
import { ITreeExplorerService } from 'vs/workbench/parts/explorers/browser/treeExplorerService';
import { InternalTreeExplorerNode } from 'vs/workbench/parts/explorers/common/treeExplorerViewModel';

export class MainThreadTreeExplorers extends MainThreadTreeExplorersShape {
	private _proxy: ExtHostTreeExplorersShape;

	private _treeContents: { [treeContentProviderId: string]: InternalTreeExplorerNode };

	constructor(
		@IThreadService threadService: IThreadService,
		@ITreeExplorerService private treeExplorerViewletService: ITreeExplorerService
	) {
		super();

		this._proxy = threadService.get(ExtHostContext.ExtHostExplorers);
		this._treeContents = Object.create(null);
	}

	$registerTreeContentProvider(providerId: string): void {
		this.treeExplorerViewletService.registerTreeContentProvider(providerId, {
			provideRootNode: (): TPromise<InternalTreeExplorerNode> => {
				return this._proxy.$provideRootNode(providerId).then(treeContent => {
					this._treeContents[providerId] = treeContent;
					return treeContent;
				})
			},
			resolveChildren: (node: InternalTreeExplorerNode): TPromise<InternalTreeExplorerNode[]> => {
				return this._proxy.$resolveChildren(providerId, node);
			},
			resolveCommand: (node: InternalTreeExplorerNode): TPromise<void> => {
				return this._proxy.$resolveCommand(providerId, node);
			}
		});
	}

	$unregisterTreeContentProvider(treeContentProviderId: string): void {

	}
}