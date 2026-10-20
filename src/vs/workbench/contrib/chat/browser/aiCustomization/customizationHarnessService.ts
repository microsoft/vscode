/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import {
	CustomizationHarnessServiceBase,
	ICustomizationHarnessService,
	createVSCodeHarnessDescriptor,

} from '../../common/customizationHarnessService.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { SessionType } from '../../common/chatSessionsService.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatWidgetService } from '../chat.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';

/**
 * Core implementation of the customization harness service.
 *
 * Only the Local harness is registered statically. All other harnesses
 * (e.g. Copilot CLI) are contributed by extensions via the provider API.
 */
export class CustomizationHarnessService extends CustomizationHarnessServiceBase {
	private readonly activeChatSessionListener: IDisposable;

	constructor(
		@IPromptsService promptsService: IPromptsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super(
			[createVSCodeHarnessDescriptor()],
			SessionType.Local,
			promptsService,
		);
		const updateActiveSession = () => {
			const sessionResource = this.chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource;
			if (sessionResource) {
				this.setActiveSession(sessionResource);
			}
		};
		this.activeChatSessionListener = this.chatWidgetService.onDidChangeFocusedSession(updateActiveSession);
		updateActiveSession();
	}

	override dispose(): void {
		this.activeChatSessionListener.dispose();
		super.dispose();
	}

	override getSessionResourceForHarness(sessionType: string): URI {
		// const lastUsedSession = this.agentSessionsService.model.sessions
		// 	.filter(session => session.providerType === sessionType)
		// 	.sort((a, b) => (b.timing.lastRequestEnded ?? b.timing.created) - (a.timing.lastRequestEnded ?? a.timing.created))
		// 	.at(0);

		// if (lastUsedSession) {
		// 	return lastUsedSession.resource;
		// }

		return super.getSessionResourceForHarness(sessionType);
	}
}

registerSingleton(ICustomizationHarnessService, CustomizationHarnessService, InstantiationType.Delayed);
