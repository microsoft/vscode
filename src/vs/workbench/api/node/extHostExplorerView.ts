/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { View, TreeDataProvider } from 'vscode';
import { defaultGenerator } from 'vs/base/common/idGenerator';
import { TPromise } from 'vs/base/common/winjs.base';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { MainContext, ExtHostExplorerViewShape, MainThreadExplorerViewShape, ITreeNode } from './extHost.protocol';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { asWinJsPromise } from 'vs/base/common/async';
import * as modes from 'vs/editor/common/modes';

class TreeNodeImpl implements ITreeNode {

	readonly id: string;
	label: string;
	hasChildren: boolean;
	clickCommand: string = null;
	contextKey: string;

	constructor(readonly providerId: string, node: any, provider: TreeDataProvider<any>) {
		this.id = defaultGenerator.nextId();
		this.label = provider.getLabel ? provider.getLabel(node) : node.toString();
		this.hasChildren = provider.getHasChildren ? provider.getHasChildren(node) : true;
		this.contextKey = provider.getContextKey ? provider.getContextKey(node) : null;
		if (provider.getClickCommand) {
			const command = provider.getClickCommand(node);
			if (command) {
				this.clickCommand = command.command;
			}
		}
	}
}

export class ExtHostExplorerView extends ExtHostExplorerViewShape {
	private _proxy: MainThreadExplorerViewShape;

	private _extNodeProviders: { [providerId: string]: TreeDataProvider<any> };
	private _extViews: Map<string, View<any>> = new Map<string, View<any>>();
	private _extNodeMaps: { [providerId: string]: { [id: string]: ITreeNode } };
	private _mainNodesMap: Map<string, Map<any, ITreeNode>>;
	private _childrenNodesMap: Map<string, Map<any, any[]>>;

	constructor(
		threadService: IThreadService,
		private commands: ExtHostCommands
	) {
		super();

		this._proxy = threadService.get(MainContext.MainThreadExplorerViews);

		this._extNodeProviders = Object.create(null);
		this._extNodeMaps = Object.create(null);
		this._mainNodesMap = new Map<string, Map<any, ITreeNode>>();
		this._childrenNodesMap = new Map<string, Map<any, any[]>>();

		commands.registerArgumentProcessor({
			processArgument: arg => {
				if (arg && arg.providerId && arg.id) {
					const extNodeMap = this._extNodeMaps[arg.providerId];
					return extNodeMap[arg.id];
				}
				return arg;
			}
		});
	}

	createExplorerView<T>(viewId: string, viewName: string, provider: TreeDataProvider<T>): View<T> {
		this._proxy.$registerView(viewId, viewName);
		this._extNodeProviders[viewId] = provider;
		this._mainNodesMap.set(viewId, new Map<any, ITreeNode>());
		this._childrenNodesMap.set(viewId, new Map<any, any>());

		const treeView: View<T> = {
			refresh: (node: T) => {
				const mainThreadNode = this._mainNodesMap.get(viewId).get(node);
				this._proxy.$refresh(viewId, mainThreadNode);
			},
			dispose: () => {
				delete this._extNodeProviders[viewId];
				delete this._extNodeProviders[viewId];
				this._mainNodesMap.delete(viewId);
				this._childrenNodesMap.delete(viewId);
				this._extViews.delete(viewId);
			}
		};
		this._extViews.set(viewId, treeView);
		return treeView;
	}

	$provideRootNode(providerId: string): TPromise<ITreeNode> {
		const provider = this._extNodeProviders[providerId];
		if (!provider) {
			const errMessage = localize('treeExplorer.notRegistered', 'No TreeExplorerNodeProvider with id \'{0}\' registered.', providerId);
			return TPromise.wrapError<ITreeNode>(errMessage);
		}

		return asWinJsPromise(() => provider.provideRootNode()).then(extRootNode => {
			const extNodeMap: { [id: string]: ITreeNode } = Object.create(null);
			const internalRootNode = new TreeNodeImpl(providerId, extRootNode, provider);

			extNodeMap[internalRootNode.id] = extRootNode;
			this._extNodeMaps[providerId] = extNodeMap;

			this._mainNodesMap.get(providerId).set(extRootNode, internalRootNode);

			return internalRootNode;
		}, err => {
			const errMessage = localize('treeExplorer.failedToProvideRootNode', 'TreeExplorerNodeProvider \'{0}\' failed to provide root node.', providerId);
			return TPromise.wrapError<ITreeNode>(errMessage);
		});
	}

	$resolveChildren(providerId: string, mainThreadNode: ITreeNode): TPromise<ITreeNode[]> {
		const provider = this._extNodeProviders[providerId];
		if (!provider) {
			const errMessage = localize('treeExplorer.notRegistered', 'No TreeExplorerNodeProvider with id \'{0}\' registered.', providerId);
			return TPromise.wrapError<ITreeNode[]>(errMessage);
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
				const internalChild = new TreeNodeImpl(providerId, extChild, provider);
				extNodeMap[internalChild.id] = extChild;
				this._mainNodesMap.get(providerId).set(extChild, internalChild);
				return internalChild;
			});
		});
	}

	// Convert the command on the ExtHost side so we can pass the original externalNode to the registered handler
	$getInternalCommand(providerId: string, mainThreadNode: ITreeNode): TPromise<modes.Command> {
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