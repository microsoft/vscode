/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getErrorMessage } from '../../../../../base/common/errors.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { assertImageGenerationEnabled, IImageGenerationCredentialsService, parseImageGenerationConfiguration, RemoveImageGenerationCredentialsActionId, SetUpImageGenerationActionId } from '../../common/imageGeneration.js';

export class SetUpImageGenerationAction extends Action2 {
	constructor() {
		super({
			id: SetUpImageGenerationActionId,
			title: localize2('imageGeneration.setup', "Set Up Image Generation"),
			category: localize2('chat.category', "Chat"),
			f1: true,
			precondition: ChatContextKeys.enabled,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const credentialsService = accessor.get(IImageGenerationCredentialsService);
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);
		const chatEntitlementService = accessor.get(IChatEntitlementService);
		assertImageGenerationEnabled(chatEntitlementService.sentiment.hidden);
		await credentialsService.whenReady;
		const current = credentialsService.configuration;
		const endpoint = await quickInputService.input({
			title: localize('imageGeneration.setup.endpoint.title', "Set Up Image Generation (1 of 3)"),
			prompt: localize('imageGeneration.setup.endpoint.prompt', "Microsoft Foundry resource endpoint. Image prompts are sent to this service and usage is billed to its Azure subscription."),
			placeHolder: 'https://<resource>.services.ai.azure.com',
			value: current?.endpoint,
			ignoreFocusLost: true,
			validateInput: async value => {
				try {
					parseImageGenerationConfiguration({ endpoint: value, deployment: 'validation' });
					return undefined;
				} catch (error) {
					return getErrorMessage(error);
				}
			},
		});
		if (endpoint === undefined) {
			return;
		}
		const deployment = await quickInputService.input({
			title: localize('imageGeneration.setup.deployment.title', "Set Up Image Generation (2 of 3)"),
			prompt: localize('imageGeneration.setup.deployment.prompt', "Name of the MAI image deployment in this resource, not just the model's catalog name."),
			value: current?.deployment,
			ignoreFocusLost: true,
			validateInput: async value => {
				try {
					parseImageGenerationConfiguration({ endpoint, deployment: value });
					return undefined;
				} catch (error) {
					return getErrorMessage(error);
				}
			},
		});
		if (deployment === undefined) {
			return;
		}
		const key = await quickInputService.input({
			title: localize('imageGeneration.setup.key.title', "Set Up Image Generation (3 of 3)"),
			prompt: localize('imageGeneration.setup.key.prompt', "API key for this resource. It is kept in secret storage, never in workspace settings or tool arguments."),
			password: true,
			ignoreFocusLost: true,
			validateInput: async value => value.trim() ? undefined : localize('imageGeneration.key.empty', "Enter an API key for the image generation resource."),
		});
		if (key === undefined) {
			return;
		}
		assertImageGenerationEnabled(chatEntitlementService.sentiment.hidden);
		await credentialsService.configure({ endpoint, deployment }, key);
		notificationService.info(localize('imageGeneration.setup.done', "Image generation is configured. Generations use the deployment's Azure subscription and are not included automatically in Copilot usage."));
	}
}

export class RemoveImageGenerationCredentialsAction extends Action2 {
	constructor() {
		super({
			id: RemoveImageGenerationCredentialsActionId,
			title: localize2('imageGeneration.remove', "Remove Image Generation Credentials"),
			category: localize2('chat.category', "Chat"),
			f1: true,
			precondition: ChatContextKeys.enabled,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const credentialsService = accessor.get(IImageGenerationCredentialsService);
		const notificationService = accessor.get(INotificationService);
		await credentialsService.clear();
		notificationService.info(localize('imageGeneration.remove.done', "Image generation credentials were removed."));
	}
}

registerAction2(SetUpImageGenerationAction);
registerAction2(RemoveImageGenerationCredentialsAction);
