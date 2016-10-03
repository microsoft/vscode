/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ITreeNode } from 'vscode';
import {TPromise} from 'vs/base/common/winjs.base';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import {ExtHostContext, MainThreadExplorersShape, ExtHostExplorersShape} from './extHost.protocol';
import {ITreeExplorerViewletService} from 'vs/workbench/parts/explorers/browser/treeExplorerViewletService';

export class MainThreadExplorers extends MainThreadExplorersShape {
	private _proxy: ExtHostExplorersShape;

	constructor(
		@IThreadService threadService: IThreadService,
		@ITreeExplorerViewletService private treeExplorerViewletService: ITreeExplorerViewletService
	) {
		super();

		this._proxy = threadService.get(ExtHostContext.ExtHostExplorers);
	}

	$registerTreeContentProvider(providerId: string): void {
		this.treeExplorerViewletService.registerTreeContentProvider(providerId, {
			provideTreeContent: (): TPromise<ITreeNode> => {
				return this._proxy.$provideTreeContent(providerId).then(jsonTree => {
					return <ITreeNode>JSON.parse(jsonTree);
				})
			},
			resolveChildren: (node: ITreeNode): TPromise<ITreeNode[]> => {
				return this._proxy.$resolveChildren(providerId, node).then(jsonChildren => {
					return <ITreeNode[]>JSON.parse(jsonChildren);
				})
			}
		});
	}

	$unregisterTreeContentProvider(treeContentProviderId: string): void {

	}
}