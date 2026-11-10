/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from '../../../../../base/common/glob.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import * as nls from '../../../../../nls.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';

/**
 * How a chat shows one of its resources, such as a file the agent recorded.
 * - `none`: only in the Artifacts list.
 * - `pinned`: with a pill of its own that opens it in an editor, or reveals its editor if it is open.
 * - `embedded`: with a pill of its own that shows it above the chat input.
 *
 * The pills of embedded resources act as tabs of the area above the chat input.
 */
export type ChatResourceMode = 'none' | 'pinned' | 'embedded';

/** The modes that show a resource in an area of the chat. */
export type ChatResourceArea = Extract<ChatResourceMode, 'embedded'>;

const chatResourceModes: readonly ChatResourceMode[] = ['none', 'pinned', 'embedded'];

export function isChatResourceMode(value: unknown): value is ChatResourceMode {
	return chatResourceModes.includes(value as ChatResourceMode);
}

export const ChatResourcesEnabledSettingId = 'chat.resources.enabled';
export const ChatResourceModesSettingId = 'chat.resources.modes';

/** The mode the user configured for resources whose path matches a glob pattern of {@link ChatResourceModesSettingId}. */
export function getConfiguredChatResourceMode(modes: Readonly<Record<string, unknown>> | undefined, resource: URI): ChatResourceMode | undefined {
	for (const [pattern, mode] of Object.entries(modes ?? {})) {
		if (isChatResourceMode(mode) && (glob.match(pattern, resource.path) || glob.match(pattern, basename(resource)))) {
			return mode;
		}
	}
	return undefined;
}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chatResources',
	title: nls.localize('chatResources.configurationTitle', "Chat Resources"),
	type: 'object',
	properties: {
		[ChatResourcesEnabledSettingId]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			markdownDescription: nls.localize('chatResources.enabled', "Whether a chat can show its resources, such as files its agent recorded, with pills of their own or above the chat input."),
			tags: ['experimental'],
		},
		[ChatResourceModesSettingId]: {
			type: 'object',
			additionalProperties: { type: 'string', enum: ['none', 'pinned', 'embedded'] },
			default: {},
			markdownDescription: nls.localize('chatResources.modes', "How a chat shows its resources (such as files the agent recorded), by glob pattern, for example `{ \"*.md\": \"embedded\" }`. `none` lists them under Artifacts, `pinned` gives them a pill that opens them in an editor, and `embedded` gives them a pill that shows them above the chat input. A mode chosen for a single resource overrides this."),
			tags: ['experimental'],
		},
	},
});
