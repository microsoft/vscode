/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { AgentsWindowUsage } from '../../../../workbench/contrib/chat/common/agentsWindowUsage.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';

/** Counts the requests the user submits from the Agents Window. */
export class AgentsWindowRequestUsageContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.agentsWindowRequestUsage';

	constructor(
		@IChatService chatService: IChatService,
		@IStorageService storageService: IStorageService,
	) {
		super();
		const usage = new AgentsWindowUsage(storageService);
		this._register(chatService.onDidAcceptRequest(() => usage.recordRequest()));
	}
}
