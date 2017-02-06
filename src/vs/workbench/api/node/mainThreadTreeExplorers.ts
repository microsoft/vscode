/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ExtHostContext, MainThreadTreeExplorersShape, ExtHostTreeExplorersShape } from './extHost.protocol';
import { ITreeExplorerService } from 'vs/workbench/parts/explorers/common/treeExplorerService';
import { InternalTreeExplorerNodeContent } from 'vs/workbench/parts/explorers/common/treeExplorerViewModel';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { ICommandService } from 'vs/platform/commands/common/commands';

export class MainThreadTreeExplorers extends MainThreadTreeExplorersShape {
	private _proxy: ExtHostTreeExplorersShape;

	constructor(
		@IThreadService threadService: IThreadService,
		@ITreeExplorerService private treeExplorerService: ITreeExplorerService,
		@IMessageService private messageService: IMessageService,
		@ICommandService private commandService: ICommandService
	) {
		super();

		this._proxy = threadService.get(ExtHostContext.ExtHostExplorers);
	}

	$registerTreeExplorerNodeProvider(providerId: string): void {
		const onError = err => { this.messageService.show(Severity.Error, err); };

		this.treeExplorerService.registerTreeExplorerNodeProvider(providerId, {
			provideRootNode: (): TPromise<InternalTreeExplorerNodeContent> => {
				return this._proxy.$provideRootNode(providerId).then(rootNode => rootNode, onError);
			},
			resolveChildren: (node: InternalTreeExplorerNodeContent): TPromise<InternalTreeExplorerNodeContent[]> => {
				return this._proxy.$resolveChildren(providerId, node).then(children => children, onError);
			},
			executeCommand: (node: InternalTreeExplorerNodeContent): TPromise<any> => {
				return this._proxy.$getInternalCommand(providerId, node).then(command => {
					return this.commandService.executeCommand(command.id, ...command.arguments);
				});
			}
		});
	}
}
