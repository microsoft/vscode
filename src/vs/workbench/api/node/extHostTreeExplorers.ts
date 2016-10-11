/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TreeExplorerNode, TreeExplorerNodeProvider } from 'vscode';
import { TPromise } from 'vs/base/common/winjs.base';
import { Disposable } from 'vs/workbench/api/node/extHostTypes';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { MainContext, ExtHostTreeExplorersShape, MainThreadTreeExplorersShape } from './extHost.protocol';
import { InternalTreeExplorerNode } from 'vs/workbench/parts/explorers/common/treeExplorerViewModel';

export class ExtHostTreeExplorers extends ExtHostTreeExplorersShape {
	private _proxy: MainThreadTreeExplorersShape;

	private _treeExplorerNodeProviders: { [providerId: string]: TreeExplorerNodeProvider };

	private _trees: { [providerId: string]: InternalTreeExplorerNode };
	private _treeNodeMaps: { [providerId: string]: { [id: number]: InternalTreeExplorerNode }};

	constructor(
		threadService: IThreadService
	) {
		super();

		this._proxy = threadService.get(MainContext.MainThreadExplorers);

		this._treeExplorerNodeProviders = Object.create(null);
		this._trees = Object.create(null);
		this._treeNodeMaps = Object.create(null);
	}

	registerTreeContentProvider(providerId: string, provider: TreeExplorerNodeProvider): Disposable {
		this._proxy.$registerTreeContentProvider(providerId);
		this._treeExplorerNodeProviders[providerId] = provider;

		return new Disposable(() => {
			if (delete this._treeExplorerNodeProviders[providerId]) {
				this._proxy.$unregisterTreeContentProvider(providerId);
			}
		});
	}

	$provideRootNode(providerId: string): TPromise<InternalTreeExplorerNode> {
		const provider = this._treeExplorerNodeProviders[providerId];
		if (!provider) {
			throw new Error(`no TreeContentProvider registered with id '${providerId}'`);
		}

		return TPromise.wrap(provider.provideRootNode().then(rootNode => {
			const treeNodeMap = Object.create(null);
			this._treeNodeMaps[providerId] = treeNodeMap;

			const internalRootNode = new InternalTreeExplorerNode(rootNode);
			this._trees[providerId] = internalRootNode;
			this._treeNodeMaps[providerId][internalRootNode.id] = internalRootNode;
			return this._trees[providerId];
		}));
	}

	$resolveChildren(providerId: string, mainThreadNode: InternalTreeExplorerNode): TPromise<InternalTreeExplorerNode[]> {
		const provider = this._treeExplorerNodeProviders[providerId];
		if (!provider) {
			throw new Error(`no TreeContentProvider registered with id '${providerId}'`);
		}

		const treeNodeMap = this._treeNodeMaps[providerId];
		const extHostTreeContentNode = treeNodeMap[mainThreadNode.id];

		return TPromise.wrap(provider.resolveChildren(extHostTreeContentNode).then(children => {
			return children.map(child => {
				const internalChild = new InternalTreeExplorerNode(child);
				treeNodeMap[internalChild.id] = internalChild;
				return internalChild;
			});
		}));
	}
}