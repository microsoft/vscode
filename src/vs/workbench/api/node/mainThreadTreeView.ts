/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ExtHostContext, MainThreadTreeViewShape, ExtHostTreeViewShape } from './extHost.protocol';
import { ITreeExplorerService } from 'vs/workbench/parts/explorers/common/treeExplorerService';
import { InternalTreeNodeContent, InternalTreeNodeProvider } from 'vs/workbench/parts/explorers/common/treeExplorerViewModel';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { ICommandService } from 'vs/platform/commands/common/commands';

export class MainThreadTreeView extends MainThreadTreeViewShape {
	private _proxy: ExtHostTreeViewShape;

	constructor(
		@IThreadService threadService: IThreadService,
		@ITreeExplorerService private treeExplorerService: ITreeExplorerService,
		@IMessageService private messageService: IMessageService,
		@ICommandService private commandService: ICommandService
	) {
		super();

		this._proxy = threadService.get(ExtHostContext.ExtHostTreeView);
	}

	$registerTreeDataProvider(providerId: string): void {
		const provider = new TreeExplorerNodeProvider(providerId, this._proxy, this.messageService, this.commandService);
		this.treeExplorerService.registerTreeExplorerNodeProvider(providerId, provider);
	}

	$refresh(providerId: string, node: InternalTreeNodeContent): void {
		(<TreeExplorerNodeProvider>this.treeExplorerService.getProvider(providerId))._onRefresh.fire(node);
	}
}

class TreeExplorerNodeProvider implements InternalTreeNodeProvider {

	readonly _onRefresh: Emitter<InternalTreeNodeContent> = new Emitter<InternalTreeNodeContent>();
	readonly onRefresh: Event<InternalTreeNodeContent> = this._onRefresh.event;

	constructor(public readonly id: string, private _proxy: ExtHostTreeViewShape,
		private messageService: IMessageService,
		private commandService: ICommandService
	) {
	}

	provideRootNode(): TPromise<InternalTreeNodeContent> {
		return this._proxy.$provideRootNode(this.id).then(rootNode => rootNode, err => this.messageService.show(Severity.Error, err));
	}

	resolveChildren(node: InternalTreeNodeContent): TPromise<InternalTreeNodeContent[]> {
		return this._proxy.$resolveChildren(this.id, node).then(children => children, err => this.messageService.show(Severity.Error, err));
	}

	executeCommand(node: InternalTreeNodeContent): TPromise<any> {
		return this._proxy.$getInternalCommand(this.id, node).then(command => {
			return this.commandService.executeCommand(command.id, ...command.arguments);
		});
	}
}
