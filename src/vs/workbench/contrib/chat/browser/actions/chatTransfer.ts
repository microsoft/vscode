/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IChatTransferService } from '../../common/chatTransferService.js';

export class ChatTransferContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatTransfer';

	constructor(
		@IChatTransferService chatTransferService: IChatTransferService,
	) {
		super();
		chatTransferService.checkAndSetWorkspaceTrust();
	}
}
