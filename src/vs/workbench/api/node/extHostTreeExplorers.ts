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
import { InternalTreeExplorerNode } from 'vs/workbench/parts/explorers/common/treeExplorerViewModel';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { asWinJsPromise } from 'vs/base/common/async';
import * as modes from 'vs/editor/common/modes';

export class ExtHostTreeExplorers extends ExtHostTreeExplorersShape {
	private _proxy: MainThreadTreeExplorersShape;

	private _treeExplorerNodeProviders: { [providerId: string]: TreeExplorerNodeProvider<any> };
	private _treeExplorerNodeMaps: { [providerId: string]: { [id: number]: any } };

	constructor(
		threadService: IThreadService,
		private commands: ExtHostCommands
	) {
		super();

		this._proxy = threadService.get(MainContext.MainThreadExplorers);

		this._treeExplorerNodeProviders = Object.create(null);
		this._treeExplorerNodeMaps = Object.create(null);
	}

	registerTreeExplorerNodeProvider(providerId: string, provider: TreeExplorerNodeProvider<any>): Disposable {
		this._proxy.$registerTreeExplorerNodeProvider(providerId);
		this._treeExplorerNodeProviders[providerId] = provider;

		return new Disposable(() => {
			delete this._treeExplorerNodeProviders[providerId];
			delete this._treeExplorerNodeProviders[providerId];
		});
	}

	$provideRootNode(providerId: string): TPromise<InternalTreeExplorerNode> {
		const provider = this._treeExplorerNodeProviders[providerId];
		if (!provider) {
			return TPromise.wrapError(`No TreeExplorerNodeProvider with id '${providerId}' registered.`);
		}

		return asWinJsPromise(() => provider.provideRootNode()).then(externalRootNode => {
			const treeNodeMap = Object.create(null);
			this._treeExplorerNodeMaps[providerId] = treeNodeMap;

			const internalRootNode = new InternalTreeExplorerNode(externalRootNode, provider);
			this._treeExplorerNodeMaps[providerId][internalRootNode.id] = externalRootNode;
			return internalRootNode;
		}, err => {
			return TPromise.wrapError(`TreeExplorerNodeProvider '${providerId}' failed to provide root node.`);
		});
	}

	$resolveChildren(providerId: string, mainThreadNode: InternalTreeExplorerNode): TPromise<InternalTreeExplorerNode[]> {
		const provider = this._treeExplorerNodeProviders[providerId];
		if (!provider) {
			return TPromise.wrapError(`No TreeExplorerNodeProvider with id '${providerId}' registered.`);
		}

		const externalNodeMap = this._treeExplorerNodeMaps[providerId];
		const externalNode = externalNodeMap[mainThreadNode.id];

		return asWinJsPromise(() => provider.resolveChildren(externalNode)).then(children => {
			return children.map(externalChild => {
				const internalChild = new InternalTreeExplorerNode(externalChild, provider);
				externalNodeMap[internalChild.id] = externalChild;
				return internalChild;
			});
		}, err => {
			return TPromise.wrapError(`TreeExplorerNodeProvider '${providerId}' failed to resolve children.`);
		});
	}

	// Convert the command on the ExtHost side so we can pass the original externalNode to the registered handler
	$getInternalCommand(providerId: string, mainThreadNode: InternalTreeExplorerNode): TPromise<modes.Command> {
		const commandConverter = this.commands.converter;

		if (mainThreadNode.clickCommand) {
			const externalNode = this._treeExplorerNodeMaps[providerId][mainThreadNode.id];

			const internalCommand = commandConverter.toInternal({
				title: '',
				command: mainThreadNode.clickCommand,
				arguments: [externalNode]
			});

			return TPromise.wrap(internalCommand);
		}

		return TPromise.as(null);
	}
}
