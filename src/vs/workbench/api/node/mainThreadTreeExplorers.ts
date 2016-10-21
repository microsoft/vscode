/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ExtHostContext, MainThreadTreeExplorersShape, ExtHostTreeExplorersShape } from './extHost.protocol';
import { ITreeExplorerViewletService } from 'vs/workbench/parts/explorers/browser/treeExplorerViewletService';
import { InternalTreeExplorerNode } from 'vs/workbench/parts/explorers/common/treeExplorerViewModel';
import { IMessageService, Severity } from 'vs/platform/message/common/message';

export class MainThreadTreeExplorers extends MainThreadTreeExplorersShape {
	private _proxy: ExtHostTreeExplorersShape;

	constructor(
		@IThreadService threadService: IThreadService,
		@ITreeExplorerViewletService private treeExplorerService: ITreeExplorerViewletService,
		@IMessageService private messageService: IMessageService
	) {
		super();

		this._proxy = threadService.get(ExtHostContext.ExtHostExplorers);
	}

	$registerTreeExplorerNodeProvider(providerId: string): void {
		this.treeExplorerService.registerTreeExplorerNodeProvider(providerId, {
			provideRootNode: (): TPromise<InternalTreeExplorerNode> => {
				return this._proxy.$provideRootNode(providerId);
			},
			resolveChildren: (node: InternalTreeExplorerNode): TPromise<InternalTreeExplorerNode[]> => {
				return this._proxy.$resolveChildren(providerId, node);
			},
			executeCommand: (node: InternalTreeExplorerNode): TPromise<void> => {
				return this._proxy.$executeCommand(providerId, node);
			}
		});
	}

	$showMessage(severity: Severity, message: string): void {
		this.messageService.show(severity, message);
	}
}
