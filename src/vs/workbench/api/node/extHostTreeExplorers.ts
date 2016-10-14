/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TreeExplorerNodeProvider } from 'vscode';
import { TPromise } from 'vs/base/common/winjs.base';
import { Disposable } from 'vs/workbench/api/node/extHostTypes';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { MainContext, ExtHostTreeExplorersShape, MainThreadTreeExplorersShape } from './extHost.protocol';
import { InternalTreeExplorerNode, TreeExplorerNodeContent } from 'vs/workbench/parts/explorers/common/treeExplorerViewModel';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { asWinJsPromise } from 'vs/base/common/async';

export class ExtHostTreeExplorers extends ExtHostTreeExplorersShape {
	private _proxy: MainThreadTreeExplorersShape;

	private _treeExplorerNodeProviders: { [providerId: string]: TreeExplorerNodeProvider<any> };
	private _externalNodeMaps: { [providerId: string]: { [id: number]: any }};

	constructor(
		threadService: IThreadService,
		private commands: ExtHostCommands
	) {
		super();

		this._proxy = threadService.get(MainContext.MainThreadExplorers);

		this._treeExplorerNodeProviders = Object.create(null);
		this._externalNodeMaps = Object.create(null);
	}

	registerTreeContentProvider(providerId: string, provider: TreeExplorerNodeProvider<any>): Disposable {
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

		return asWinJsPromise(() => provider.provideRootNode()).then(externalRootNode => {
			const treeNodeMap = Object.create(null);
			this._externalNodeMaps[providerId] = treeNodeMap;

			const internalRootNode = new InternalTreeExplorerNode(externalRootNode, provider);
			this._externalNodeMaps[providerId][internalRootNode.id] = externalRootNode;
			return internalRootNode;
		});
	}

	$resolveChildren(providerId: string, mainThreadNode: InternalTreeExplorerNode): TPromise<InternalTreeExplorerNode[]> {
		const provider = this._treeExplorerNodeProviders[providerId];
		if (!provider) {
			throw new Error(`no TreeContentProvider registered with id '${providerId}'`);
		}

		const externalNodeMap = this._externalNodeMaps[providerId];
		const externalNode = externalNodeMap[mainThreadNode.id];

		return asWinJsPromise(() => provider.resolveChildren(externalNode)).then(children => {
			return children.map(externalChild => {
				const internalChild = new InternalTreeExplorerNode(externalChild, provider);
				externalNodeMap[internalChild.id] = externalChild;
				return internalChild;
			});
		});
	}

	$resolveCommand(providerId: string, mainThreadNode: InternalTreeExplorerNode): TPromise<void> {
		const provider = this._treeExplorerNodeProviders[providerId];
		if (!provider) {
			throw new Error(`no TreeContentProvider registered with id '${providerId}'`);
		}

		if (mainThreadNode.clickCommand) {
			const externalNode = this._externalNodeMaps[providerId][mainThreadNode.id];
			return TPromise.wrap(this.commands.executeCommand(mainThreadNode.clickCommand, externalNode).then(() => {
				return null;
			}));
		}

		return TPromise.as(null);
	}
}