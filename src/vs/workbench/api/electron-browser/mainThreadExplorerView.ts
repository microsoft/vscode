/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ExtHostContext, MainThreadExplorerViewShape, ExtHostExplorerViewShape, ITreeNode } from '../node/extHost.protocol';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IExplorerViewsService, IExplorerViewDataProvider, IExplorerView } from 'vs/workbench/parts/explorers/common/explorer';

export class MainThreadExplorerView extends MainThreadExplorerViewShape {

	private _proxy: ExtHostExplorerViewShape;
	private _views: Map<string, IExplorerView<ITreeNode>> = new Map<string, IExplorerView<ITreeNode>>();

	constructor(
		@IThreadService threadService: IThreadService,
		@IExplorerViewsService private explorerViewsService: IExplorerViewsService,
		@IMessageService private messageService: IMessageService,
		@ICommandService private commandService: ICommandService
	) {
		super();
		this._proxy = threadService.get(ExtHostContext.ExtHostExplorerView);
	}

	$registerView(providerId: string, name: string): void {
		const provider = new TreeExplorerNodeProvider(providerId, this._proxy, this.messageService, this.commandService);
		const view = this.explorerViewsService.createView(providerId, name, provider);
		this._views.set(providerId, view);
	}

	$refresh(providerId: string, node: ITreeNode): void {
		this._views.get(providerId).refresh(node);
	}
}

class TreeExplorerNodeProvider implements IExplorerViewDataProvider<ITreeNode> {

	readonly _onRefresh: Emitter<ITreeNode> = new Emitter<ITreeNode>();
	readonly onRefresh: Event<ITreeNode> = this._onRefresh.event;

	constructor(public readonly id: string, private _proxy: ExtHostExplorerViewShape,
		private messageService: IMessageService,
		private commandService: ICommandService
	) {
	}

	provideRoot(): TPromise<ITreeNode> {
		return this._proxy.$provideRootNode(this.id).then(rootNode => rootNode, err => this.messageService.show(Severity.Error, err));
	}

	resolveChildren(node: ITreeNode): TPromise<ITreeNode[]> {
		return this._proxy.$resolveChildren(this.id, node).then(children => children, err => this.messageService.show(Severity.Error, err));
	}

	hasChildren(node: ITreeNode): boolean {
		return node.hasChildren;
	}

	getLabel(node: ITreeNode): string {
		return node.label;
	}

	getId(node: ITreeNode): string {
		return node.id;
	}

	getContextKey(node: ITreeNode): string {
		return node.contextKey;
	}

	select(node: ITreeNode): void {
		this._proxy.$getInternalCommand(this.id, node).then(command => {
			if (command) {
				this.commandService.executeCommand(command.id, ...command.arguments);
			}
		});
	}
}
