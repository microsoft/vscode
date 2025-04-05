/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { checkProposedApiEnabled } from '../../../../services/extensions/common/extensions.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
import { ChatViewsWelcomeExtensions, IChatViewsWelcomeContributionRegistry, IChatViewsWelcomeDescriptor } from './chatViewsWelcome.js';

interface IRawChatViewsWelcomeContribution {
	icon: string;
	title: string;
	content: string;
	when: string;
}

const chatViewsWelcomeExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawChatViewsWelcomeContribution[]>({
	extensionPoint: 'chatViewsWelcome',
	jsonSchema: {
		description: localize('vscode.extension.contributes.chatViewsWelcome', 'Contributes a welcome message to a chat view'),
		type: 'array',
		items: {
			additionalProperties: false,
			type: 'object',
			properties: {
				icon: {
					type: 'string',
					description: localize('chatViewsWelcome.icon', 'The icon for the welcome message.'),
				},
				title: {
					type: 'string',
					description: localize('chatViewsWelcome.title', 'The title of the welcome message.'),
				},
				content: {
					type: 'string',
					description: localize('chatViewsWelcome.content', 'The content of the welcome message. The first command link will be rendered as a button.'),
				},
				when: {
					type: 'string',
					description: localize('chatViewsWelcome.when', 'Condition when the welcome message is shown.'),
				}
			}
		},
		required: ['icon', 'title', 'contents', 'when'],
	}
});

export class ChatViewsWelcomeHandler implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatViewsWelcomeHandler';

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		chatViewsWelcomeExtensionPoint.setHandler((extensions, delta) => {
			for (const extension of delta.added) {
				for (const providerDescriptor of extension.value) {
					checkProposedApiEnabled(extension.description, 'chatParticipantPrivate');

					const when = ContextKeyExpr.deserialize(providerDescriptor.when);
					if (!when) {
						this.logService.error(`Could not deserialize 'when' clause for chatViewsWelcome contribution: ${providerDescriptor.when}`);
						continue;
					}

					const descriptor: IChatViewsWelcomeDescriptor = {
						...providerDescriptor,
						when,
						icon: ThemeIcon.fromString(providerDescriptor.icon),
						content: new MarkdownString(providerDescriptor.content, { isTrusted: true }), // private API with command links
					};
					Registry.as<IChatViewsWelcomeContributionRegistry>(ChatViewsWelcomeExtensions.ChatViewsWelcomeRegistry).register(descriptor);
				}
			}
		});
	}
}
