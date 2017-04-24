/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { TreeExplorerNodeProvider } from 'vscode';
import { defaultGenerator } from 'vs/base/common/idGenerator';
import { TPromise } from 'vs/base/common/winjs.base';
import { Disposable } from 'vs/workbench/api/node/extHostTypes';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { MainContext, ExtHostTreeExplorersShape, MainThreadTreeExplorersShape } from './extHost.protocol';
import { InternalTreeExplorerNode } from 'vs/workbench/parts/explorers/common/treeExplorerViewModel';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { asWinJsPromise } from 'vs/base/common/async';
import * as modes from 'vs/editor/common/modes';

class InternalTreeExplorerNodeImpl implements InternalTreeExplorerNode {

	readonly id: string;
	label: string;
	hasChildren: boolean;
	clickCommand: string = null;

	constructor(node: any, provider: TreeExplorerNodeProvider<any>) {
		this.id = defaultGenerator.nextId();
		this.label = provider.getLabel ? provider.getLabel(node) : node.toString();
		this.hasChildren = provider.getHasChildren ? provider.getHasChildren(node) : true;
		if (provider.getClickCommand) {
			const command = provider.getClickCommand(node);
			if (command) {
				this.clickCommand = command.command;
			}
		}
	}
}

export class ExtHostTreeExplorers extends ExtHostTreeExplorersShape {
	private _proxy: MainThreadTreeExplorersShape;

	private _extNodeProviders: { [providerId: string]: TreeExplorerNodeProvider<any> };
	private _extNodeMaps: { [providerId: string]: { [id: string]: InternalTreeExplorerNode } };
	private _mainNodesMap: Map<string, Map<any, InternalTreeExplorerNode>>;
	private _childrenNodesMap: Map<string, Map<any, any[]>>;

	constructor(
		threadService: IThreadService,
		private commands: ExtHostCommands
	) {
		super();

		this._proxy = threadService.get(MainContext.MainThreadExplorers);

		this._extNodeProviders = Object.create(null);
		this._extNodeMaps = Object.create(null);
		this._mainNodesMap = new Map<string, Map<any, InternalTreeExplorerNode>>();
		this._childrenNodesMap = new Map<string, Map<any, any[]>>();
	}

	registerTreeExplorerNodeProvider(providerId: string, provider: TreeExplorerNodeProvider<any>): Disposable {
		this._proxy.$registerTreeExplorerNodeProvider(providerId);
		this._extNodeProviders[providerId] = provider;
		this._mainNodesMap.set(providerId, new Map<any, InternalTreeExplorerNode>());
		this._childrenNodesMap.set(providerId, new Map<any, any>());

		let disposable = null;
		if (provider.onChange) {
			disposable = provider.onChange(node => {
				const mainThreadNode = this._mainNodesMap.get(providerId).get(node);
				this._proxy.$refresh(providerId, mainThreadNode);
			});
		}

		return new Disposable(() => {
			delete this._extNodeProviders[providerId];
			delete this._extNodeProviders[providerId];
			this._mainNodesMap.delete(providerId);
			this._childrenNodesMap.delete(providerId);
			if (disposable) {
				disposable.dispose();
			}
		});
	}

	$provideRootNode(providerId: string): TPromise<InternalTreeExplorerNode> {
		const provider = this._extNodeProviders[providerId];
		if (!provider) {
			const errMessage = localize('treeExplorer.notRegistered', 'No TreeExplorerNodeProvider with id \'{0}\' registered.', providerId);
			return TPromise.wrapError(errMessage);
		}

		return asWinJsPromise(() => provider.provideRootNode()).then(extRootNode => {
			const extNodeMap: { [id: string]: InternalTreeExplorerNode } = Object.create(null);
			const internalRootNode = new InternalTreeExplorerNodeImpl(extRootNode, provider);

			extNodeMap[internalRootNode.id] = extRootNode;
			this._extNodeMaps[providerId] = extNodeMap;

			this._mainNodesMap.get(providerId).set(extRootNode, internalRootNode);

			return internalRootNode;
		}, err => {
			const errMessage = localize('treeExplorer.failedToProvideRootNode', 'TreeExplorerNodeProvider \'{0}\' failed to provide root node.', providerId);
			return TPromise.wrapError(errMessage);
		});
	}

	$resolveChildren(providerId: string, mainThreadNode: InternalTreeExplorerNode): TPromise<InternalTreeExplorerNode[]> {
		const provider = this._extNodeProviders[providerId];
		if (!provider) {
			const errMessage = localize('treeExplorer.notRegistered', 'No TreeExplorerNodeProvider with id \'{0}\' registered.', providerId);
			return TPromise.wrapError(errMessage);
		}

		const extNodeMap = this._extNodeMaps[providerId];
		const extNode = extNodeMap[mainThreadNode.id];

		const currentChildren = this._childrenNodesMap.get(providerId).get(extNode);
		if (currentChildren) {
			for (const child of currentChildren) {
				this._mainNodesMap.get(providerId).delete(child);
			}
		}

		return asWinJsPromise(() => provider.resolveChildren(extNode)).then(children => {
			return children.map(extChild => {
				const internalChild = new InternalTreeExplorerNodeImpl(extChild, provider);
				extNodeMap[internalChild.id] = extChild;
				this._mainNodesMap.get(providerId).set(extChild, internalChild);
				return internalChild;
			});
		});
	}

	// Convert the command on the ExtHost side so we can pass the original externalNode to the registered handler
	$getInternalCommand(providerId: string, mainThreadNode: InternalTreeExplorerNode): TPromise<modes.Command> {
		const commandConverter = this.commands.converter;

		if (mainThreadNode.clickCommand) {
			const extNode = this._extNodeMaps[providerId][mainThreadNode.id];

			const internalCommand = commandConverter.toInternal({
				title: '',
				command: mainThreadNode.clickCommand,
				arguments: [extNode]
			});

			return TPromise.wrap(internalCommand);
		}

		return TPromise.as(null);
	}
}
