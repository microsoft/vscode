/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema, TypeFromJsonSchema } from '../../../../../base/common/jsonSchema.js';
import * as glob from '../../../../../base/common/glob.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { basename } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import * as nls from '../../../../../nls.js';
import { AgentHostChatResourcesConfigKey } from '../../../../../platform/agentHost/common/agentHostSchema.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { isProposedApiEnabled } from '../../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../../services/extensions/common/extensionsRegistry.js';

/**
 * How a chat shows one of its resources, such as a file the agent recorded or a resource an extension contributes.
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

/** A resource that an extension adds to every chat in which it exists. */
export interface IChatResourceContribution {
	readonly extensionId: ExtensionIdentifier;
	readonly id: string;
	readonly label: string;
	readonly icon: ThemeIcon | undefined;
	/** A URI template; `${chatSessionId}` is replaced with {@link getChatResourceSessionId}. */
	readonly resource: string;
	readonly mode: ChatResourceMode;
}

/** The identifier substituted for `${chatSessionId}`: the last path segment of the chat session resource. */
export function getChatResourceSessionId(sessionResource: URI): string {
	return basename(sessionResource);
}

export function resolveChatResourceTemplate(contribution: IChatResourceContribution, sessionResource: URI): URI | undefined {
	try {
		return URI.parse(contribution.resource.replaceAll('${chatSessionId}', encodeURIComponent(getChatResourceSessionId(sessionResource))));
	} catch {
		return undefined;
	}
}

const chatResourceSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['id', 'label', 'resource'],
	properties: {
		id: {
			type: 'string',
			description: nls.localize('chatResources.id', "Identifier of the chat resource, unique within the extension."),
		},
		label: {
			type: 'string',
			description: nls.localize('chatResources.label', "Label of the resource's pill."),
		},
		icon: {
			type: 'string',
			description: nls.localize('chatResources.icon', "Codicon of the resource's pill, such as {0}.", '`$(checklist)`'),
		},
		resource: {
			type: 'string',
			description: nls.localize('chatResources.resource', "URI of the resource for a chat, such as `chat-todos:/${chatSessionId}.todo.json`. The chat shows the resource while it exists."),
		},
		mode: {
			type: 'string',
			enum: ['pinned', 'embedded'],
			enumDescriptions: [
				nls.localize('chatResources.mode.pinned', "A pill that opens the resource in an editor."),
				nls.localize('chatResources.mode.embedded', "A pill that shows the resource above the chat input, rendered readonly by its default editor, such as a custom editor."),
			],
			default: 'pinned',
			description: nls.localize('chatResources.modeDescription', "How the chat shows the resource. Users can change it."),
		},
	},
} as const satisfies IJSONSchema;

type IRawChatResourceContribution = TypeFromJsonSchema<typeof chatResourceSchema>;

const chatResourcesExtensionPoint = ExtensionsRegistry.registerExtensionPoint<IRawChatResourceContribution[]>({
	extensionPoint: 'chatResources',
	jsonSchema: {
		description: nls.localize('vscode.extension.contributes.chatResources', "Contributes resources that every chat shows while they exist, for example a per-chat todo list rendered by a custom editor."),
		type: 'array',
		items: chatResourceSchema,
	},
});

function isRawChatResourceContribution(value: unknown): value is IRawChatResourceContribution {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const raw = value as { readonly id?: unknown; readonly label?: unknown; readonly resource?: unknown; readonly icon?: unknown };
	return typeof raw.id === 'string' && typeof raw.label === 'string' && typeof raw.resource === 'string'
		&& (raw.icon === undefined || typeof raw.icon === 'string');
}

const contributions = observableValue<readonly IChatResourceContribution[]>('chatResources', []);

chatResourcesExtensionPoint.setHandler(extensions => {
	const result: IChatResourceContribution[] = [];
	for (const extension of extensions) {
		if (!isProposedApiEnabled(extension.description, 'contribChatResources')) {
			extension.collector.error(`The 'chatResources' contribution point requires the 'contribChatResources' API proposal.`);
			continue;
		}
		if (!Array.isArray(extension.value)) {
			extension.collector.error(`The 'chatResources' contribution must be an array.`);
			continue;
		}
		for (const raw of extension.value as unknown[]) {
			if (!isRawChatResourceContribution(raw)) {
				extension.collector.error(`A chat resource needs an 'id', a 'label', and a 'resource', and its 'icon' must be a string.`);
				continue;
			}
			result.push({
				extensionId: extension.description.identifier,
				id: raw.id,
				label: raw.label,
				icon: raw.icon !== undefined ? ThemeIcon.fromString(raw.icon) : undefined,
				resource: raw.resource,
				mode: raw.mode === 'embedded' ? 'embedded' : 'pinned',
			});
		}
	}
	contributions.set(result, undefined);
});

/** The chat resources contributed by installed extensions. */
export const chatResourceContributions: IObservable<readonly IChatResourceContribution[]> = contributions;

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
			// Agents learn that they can choose how the chat shows what they record.
			agentHost: { key: AgentHostChatResourcesConfigKey },
			markdownDescription: nls.localize('chatResources.enabled', "Whether a chat can show its resources, such as files its agent recorded or resources extensions contribute, with pills of their own or above the chat input."),
			tags: ['experimental'],
		},
		[ChatResourceModesSettingId]: {
			type: 'object',
			additionalProperties: { type: 'string', enum: ['none', 'pinned', 'embedded'] },
			default: {},
			markdownDescription: nls.localize('chatResources.modes', "How a chat shows its resources (such as files the agent recorded), by glob pattern, for example `{ \"*.md\": \"embedded\" }`. `none` lists them under Artifacts, `pinned` gives them a pill that opens them in an editor, and `embedded` gives them a pill that shows them above the chat input. Overrides what extensions contribute; a mode chosen for a single resource overrides this."),
			tags: ['experimental'],
		},
	},
});
