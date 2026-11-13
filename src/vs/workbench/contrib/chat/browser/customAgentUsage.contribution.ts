/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatRequestAcceptedEvent, IChatService } from '../common/chatService/chatService.js';
import { CustomAgentUsage } from '../common/customAgentUsage.js';
import { ICustomizationHarnessService } from '../common/customizationHarnessService.js';
import { IChatRequestModeInfo } from '../common/model/chatModel.js';
import { PromptsStorage } from '../common/promptSyntax/service/promptsService.js';
import { isBuiltinAgent } from '../common/promptSyntax/utils/promptsServiceUtils.js';

/**
 * Whether a request ran a custom agent rather than an agent built into the product, such as Agent, Ask, or an
 * agent of the built-in chat extension. Matches the custom agents the agent picker spotlight points to.
 */
async function isCustomAgentRequest(modeInfo: IChatRequestModeInfo | undefined, sessionResource: URI, customizationHarnessService: ICustomizationHarnessService, productService: IProductService): Promise<boolean> {
	if (!modeInfo || modeInfo.isBuiltin) {
		return false;
	}
	const uri = modeInfo.modeInstructions?.uri;
	if (!uri) {
		return true;
	}
	const agents = await customizationHarnessService.getCustomAgents(sessionResource, CancellationToken.None);
	const agent = agents.find(agent => agent.id === uri.toString() || isEqual(agent.uri, uri));
	return !agent || (agent.source.storage !== PromptsStorage.builtIn && !isBuiltinAgent(agent.source, agent.uri, productService));
}

/** Records each request the user submits with a custom agent in any window. */
export class CustomAgentUsageContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.customAgentUsage';

	private readonly usage: CustomAgentUsage;

	constructor(
		@IChatService chatService: IChatService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@IProductService private readonly productService: IProductService,
		@IStorageService storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.usage = new CustomAgentUsage(storageService);
		this._register(chatService.onDidAcceptRequest(event => void this.recordRequest(event, Date.now())));
	}

	private async recordRequest({ chatSessionResource, modeInfo }: IChatRequestAcceptedEvent, timestamp: number): Promise<void> {
		try {
			if (await isCustomAgentRequest(modeInfo, chatSessionResource, this.customizationHarnessService, this.productService)) {
				this.usage.recordUse(timestamp);
			}
		} catch (error) {
			this.logService.error('[CustomAgentUsage] Failed to record custom agent usage', error);
		}
	}
}
