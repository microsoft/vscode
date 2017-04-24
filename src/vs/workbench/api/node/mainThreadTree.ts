/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ExtHostContext, MainThreadTreeShape, ExtHostTreeShape } from './extHost.protocol';
import { ITreeExplorerService } from 'vs/workbench/parts/explorers/common/treeExplorerService';
import { InternalTreeExplorerNodeContent, InternalTreeExplorerNodeProvider } from 'vs/workbench/parts/explorers/common/treeExplorerViewModel';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { ICommandService } from 'vs/platform/commands/common/commands';

export class MainThreadTree extends MainThreadTreeShape {
	private _proxy: ExtHostTreeShape;

	constructor(
		@IThreadService threadService: IThreadService,
		@ITreeExplorerService private treeExplorerService: ITreeExplorerService,
		@IMessageService private messageService: IMessageService,
		@ICommandService private commandService: ICommandService
	) {
		super();

		this._proxy = threadService.get(ExtHostContext.ExtHostTree);
	}

	$registerTreeExplorerNodeProvider(providerId: string, rootNode: InternalTreeExplorerNodeContent): void {
		const provider = new TreeExplorerNodeProvider(providerId, rootNode, this._proxy, this.messageService, this.commandService);
		this.treeExplorerService.registerTreeExplorerNodeProvider(providerId, provider);
	}

	$refresh(providerId: string, node: InternalTreeExplorerNodeContent): void {
		(<TreeExplorerNodeProvider>this.treeExplorerService.getProvider(providerId))._onRefresh.fire(node);
	}
}

class TreeExplorerNodeProvider implements InternalTreeExplorerNodeProvider {

	readonly _onRefresh: Emitter<InternalTreeExplorerNodeContent> = new Emitter<InternalTreeExplorerNodeContent>();
	readonly onRefresh: Event<InternalTreeExplorerNodeContent> = this._onRefresh.event;

	constructor(private providerId: string, private rootNode: InternalTreeExplorerNodeContent, private _proxy: ExtHostTreeShape,
		private messageService: IMessageService,
		private commandService: ICommandService
	) {
	}

	provideRootNode(): TPromise<InternalTreeExplorerNodeContent> {
		return TPromise.as(this.rootNode);
	}

	resolveChildren(node: InternalTreeExplorerNodeContent): TPromise<InternalTreeExplorerNodeContent[]> {
		return this._proxy.$resolveChildren(this.providerId, node).then(children => children, err => this.messageService.show(Severity.Error, err));
	}

	executeCommand(node: InternalTreeExplorerNodeContent): TPromise<any> {
		return this._proxy.$getInternalCommand(this.providerId, node).then(command => {
			return this.commandService.executeCommand(command.id, ...command.arguments);
		});
	}
}
