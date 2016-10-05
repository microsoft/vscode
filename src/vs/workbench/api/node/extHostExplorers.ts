/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ITreeNode, TreeContentProvider } from 'vscode';
import {TPromise} from 'vs/base/common/winjs.base';
import {Disposable} from 'vs/workbench/api/node/extHostTypes';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import {MainContext, ExtHostExplorersShape, MainThreadExplorersShape} from './extHost.protocol';

export class ExtHostExplorers extends ExtHostExplorersShape {
	private _proxy: MainThreadExplorersShape;

	private _treeContentProviders: { [treeContentProviderId: string]: TreeContentProvider };
	private _treeContents: { [treeContentProviderId: string]: ExtHostTreeNode };
	private _treeNodeMaps: { [treeContentProviderId: string]: { [id: number]: ExtHostTreeNode }};

	constructor(
		threadService: IThreadService
	) {
		super();

		this._proxy = threadService.get(MainContext.MainThreadExplorers);

		this._treeContentProviders = Object.create(null);
		this._treeContents = Object.create(null);
		this._treeNodeMaps = Object.create(null);
	}

	registerTreeContentProvider(providerId: string, provider: TreeContentProvider): Disposable {
		this._proxy.$registerTreeContentProvider(providerId);
		this._treeContentProviders[providerId] = provider;

		return new Disposable(() => {
			if (delete this._treeContentProviders[providerId]) {
				this._proxy.$unregisterTreeContentProvider(providerId);
			}
		});
	}

	$provideTreeContent(treeContentProviderId: string): TPromise<ExtHostTreeNode> {
		const provider = this._treeContentProviders[treeContentProviderId];
		if (!provider) {
			throw new Error(`no TreeContentProvider registered with id '${treeContentProviderId}'`);
		}

		return TPromise.wrap(provider.provideTreeContent().then(treeContent => {
			const treeNodeMap = Object.create(null);
			this._treeNodeMaps[treeContentProviderId] = treeNodeMap;
			this._treeContents[treeContentProviderId] = new ExtHostTreeNode(treeContent, null, treeNodeMap);
			return this._treeContents[treeContentProviderId];
		}));
	}

	$resolveChildren(treeContentProviderId: string, mainThreadNode: ExtHostTreeNode): TPromise<ExtHostTreeNode[]> {
		const provider = this._treeContentProviders[treeContentProviderId];
		if (!provider) {
			throw new Error(`no TreeContentProvider registered with id '${treeContentProviderId}'`);
		}

		const treeNodeMap = this._treeNodeMaps[treeContentProviderId];
		const extHostNode = treeNodeMap[mainThreadNode.id];

		return TPromise.wrap(provider.resolveChildren(extHostNode).then(children => {
			extHostNode.children = children.map(child => {
				return new ExtHostTreeNode(child, extHostNode, treeNodeMap);
			});
			return extHostNode.children;
		}));
	}
}

export class ExtHostTreeNode implements ITreeNode {
	static idCounter = 1;

	id: number;

	label: string;
	isExpanded: boolean;
	children: ExtHostTreeNode[];

	constructor(node: ITreeNode, parent: ExtHostTreeNode, treeNodeMap: { [id: number]: ExtHostTreeNode}) {
		this.id = ExtHostTreeNode.idCounter++;

		this.label = node.label;
		this.isExpanded = node.isExpanded;
		this.children = node.children.map(child => {
			return new ExtHostTreeNode(child, this, treeNodeMap);
		})

		treeNodeMap[this.id] = this;
	}
}