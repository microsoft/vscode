/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { TreeView, TreeDataProvider } from 'vscode';
import { defaultGenerator } from 'vs/base/common/idGenerator';
import { TPromise } from 'vs/base/common/winjs.base';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { MainContext, ExtHostTreeViewShape, MainThreadTreeViewShape } from './extHost.protocol';
import { InternalTreeNode } from 'vs/workbench/parts/explorers/common/treeExplorerViewModel';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { asWinJsPromise } from 'vs/base/common/async';
import * as modes from 'vs/editor/common/modes';

class InternalTreeNodeImpl implements InternalTreeNode {

	readonly id: string;
	label: string;
	hasChildren: boolean;
	clickCommand: string = null;

	constructor(node: any, provider: TreeDataProvider<any>) {
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

export class ExtHostTreeView extends ExtHostTreeViewShape {
	private _proxy: MainThreadTreeViewShape;

	private _extNodeProviders: { [providerId: string]: TreeDataProvider<any> };
	private _extViews: Map<string, TreeView<any>> = new Map<string, TreeView<any>>();
	private _extNodeMaps: { [providerId: string]: { [id: string]: InternalTreeNode } };
	private _mainNodesMap: Map<string, Map<any, InternalTreeNode>>;
	private _childrenNodesMap: Map<string, Map<any, any[]>>;

	constructor(
		threadService: IThreadService,
		private commands: ExtHostCommands
	) {
		super();

		this._proxy = threadService.get(MainContext.MainThreadExplorers);

		this._extNodeProviders = Object.create(null);
		this._extNodeMaps = Object.create(null);
		this._mainNodesMap = new Map<string, Map<any, InternalTreeNode>>();
		this._childrenNodesMap = new Map<string, Map<any, any[]>>();
	}

	createTreeView<T>(providerId: string, provider: TreeDataProvider<T>): TreeView<T> {
		this._proxy.$registerTreeDataProvider(providerId);
		this._extNodeProviders[providerId] = provider;
		this._mainNodesMap.set(providerId, new Map<any, InternalTreeNode>());
		this._childrenNodesMap.set(providerId, new Map<any, any>());

		const treeView: TreeView<T> = {
			refresh: (node: T) => {
				const mainThreadNode = this._mainNodesMap.get(providerId).get(node);
				this._proxy.$refresh(providerId, mainThreadNode);
			},
			dispose: () => {
				delete this._extNodeProviders[providerId];
				delete this._extNodeProviders[providerId];
				this._mainNodesMap.delete(providerId);
				this._childrenNodesMap.delete(providerId);
				this._extViews.delete(providerId);
			}
		};
		this._extViews.set(providerId, treeView);
		return treeView;
	}

	$provideRootNode(providerId: string): TPromise<InternalTreeNode> {
		const provider = this._extNodeProviders[providerId];
		if (!provider) {
			const errMessage = localize('treeExplorer.notRegistered', 'No TreeExplorerNodeProvider with id \'{0}\' registered.', providerId);
			return TPromise.wrapError(errMessage);
		}

		return asWinJsPromise(() => provider.provideRootNode()).then(extRootNode => {
			const extNodeMap: { [id: string]: InternalTreeNode } = Object.create(null);
			const internalRootNode = new InternalTreeNodeImpl(extRootNode, provider);

			extNodeMap[internalRootNode.id] = extRootNode;
			this._extNodeMaps[providerId] = extNodeMap;

			this._mainNodesMap.get(providerId).set(extRootNode, internalRootNode);

			return internalRootNode;
		}, err => {
			const errMessage = localize('treeExplorer.failedToProvideRootNode', 'TreeExplorerNodeProvider \'{0}\' failed to provide root node.', providerId);
			return TPromise.wrapError(errMessage);
		});
	}

	$resolveChildren(providerId: string, mainThreadNode: InternalTreeNode): TPromise<InternalTreeNode[]> {
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
				const internalChild = new InternalTreeNodeImpl(extChild, provider);
				extNodeMap[internalChild.id] = extChild;
				this._mainNodesMap.get(providerId).set(extChild, internalChild);
				return internalChild;
			});
		});
	}

	// Convert the command on the ExtHost side so we can pass the original externalNode to the registered handler
	$getInternalCommand(providerId: string, mainThreadNode: InternalTreeNode): TPromise<modes.Command> {
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