/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*'use strict';

import { TreeNode } from 'vscode';
import { TPromise } from 'vs/base/common/winjs.base';
import { Disposable } from 'vs/workbench/api/node/extHostTypes';
import { defaultGenerator } from 'vs/base/common/idGenerator';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { MainContext, ExtHostTreeShape, MainThreadTreeShape } from './extHost.protocol';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { asWinJsPromise } from 'vs/base/common/async';
import { localize } from 'vs/nls';
import { InternalTreeExplorerNode } from 'vs/workbench/parts/explorers/common/treeExplorerViewModel';
import * as modes from 'vs/editor/common/modes';

class InternalTreeExplorerNodeImpl implements InternalTreeExplorerNode {

	readonly id: string;
	label: string;
	hasChildren: boolean;
	clickCommand: string;

	constructor(node: TreeNode) {
		this.id = defaultGenerator.nextId();
		this.label = node.label;
		this.hasChildren = !!node.getChildren;
		this.clickCommand = node.command ? node.command.command : null;
	}
}

export class ExtHostTree extends ExtHostTreeShape {

	private _proxy: MainThreadTreeShape;

	private _providers: Map<string, Map<string, TreeNode>> = new Map<string, Map<string, TreeNode>>();
	private _disposables: Map<string, Disposable[]> = new Map<string, Disposable[]>();
	private _nodeDisposables: Map<string, Disposable[]> = new Map<string, Disposable[]>();

	constructor(
		threadService: IThreadService,
		private commands: ExtHostCommands
	) {
		super();
		this._proxy = threadService.get(MainContext.MainThreadTree);
	}

	registerTree(providerId: string, root: TreeNode): Disposable {
		this._providers.set(providerId, new Map<string, TreeNode>());
		this._disposables.set(providerId, []);

		const internalNode = new InternalTreeExplorerNodeImpl(root);
		this._providers.get(providerId).set(internalNode.id, root);

		const disposable = root.onChange(() => {
			this._proxy.$refresh(providerId, internalNode);
		});
		this._disposables.get(providerId).push(new Disposable(() => disposable.dispose()));

		this._proxy.$registerTreeExplorerNodeProvider(providerId, internalNode);

		return new Disposable(() => {
			this._providers.delete(providerId);
			const disposables = this._disposables.get(providerId);
			if (disposables) {
				for (const disposable of disposables) {
					disposable.dispose();
				}
			}
			this._disposables.delete(providerId);
		});
	}

	$resolveChildren(providerId: string, mainThreadNode: InternalTreeExplorerNode): TPromise<InternalTreeExplorerNode[]> {
		const provider = this._providers.get(providerId);
		if (!provider) {
			const errMessage = localize('treeExplorer.notRegistered', 'No TreeExplorerNodeProvider with id \'{0}\' registered.', providerId);
			return TPromise.wrapError(errMessage);
		}

		const extNode = provider.get(mainThreadNode.id);
		const disposables = this._nodeDisposables.get(mainThreadNode.id);
		if (disposables) {
			for (const disposable of disposables) {
				disposable.dispose();
			}
		}
		this._nodeDisposables.set(mainThreadNode.id, []);
		return asWinJsPromise(() => extNode.getChildren()).then(children => {
			return children.map(extChild => {
				const internalChild = new InternalTreeExplorerNodeImpl(extChild);
				provider.set(internalChild.id, extChild);
				if (extChild.onChange) {
					const disposable = extChild.onChange(() => this._proxy.$refresh(providerId, internalChild));
					this._disposables.get(providerId).push(new Disposable(() => disposable.dispose()));
					this._nodeDisposables.get(mainThreadNode.id).push(new Disposable(() => disposable.dispose()));
				}
				return internalChild;
			});
		}, err => {
			const errMessage = localize('treeExplorer.failedToResolveChildren', 'TreeExplorerNodeProvider \'{0}\' failed to resolveChildren.', providerId);
			return TPromise.wrapError(errMessage);
		});
	}

	// Convert the command on the ExtHost side so we can pass the original externalNode to the registered handler
	$getInternalCommand(providerId: string, mainThreadNode: InternalTreeExplorerNode): TPromise<modes.Command> {
		const commandConverter = this.commands.converter;

		if (mainThreadNode.clickCommand) {
			const extNode = this._providers.get(providerId).get(mainThreadNode.id);

			const internalCommand = commandConverter.toInternal({
				title: '',
				command: mainThreadNode.clickCommand,
				arguments: [extNode]
			});

			return TPromise.wrap(internalCommand);
		}

		return TPromise.as(null);
	}

}*/