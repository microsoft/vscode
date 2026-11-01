/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { basename } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { IJSONSchema, TypeFromJsonSchema } from '../../../../../base/common/jsonSchema.js';
import * as nls from '../../../../../nls.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { isProposedApiEnabled } from '../../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../../services/extensions/common/extensionsRegistry.js';

/**
 * A view that an extension docks above the chat input of every chat whose
 * resource exists. The resource is rendered by its custom editor, readonly.
 */
export interface IChatDockedViewContribution {
	readonly extensionId: ExtensionIdentifier;
	readonly id: string;
	readonly label: string;
	readonly icon: ThemeIcon | undefined;
	/** A URI template; `${chatSessionId}` is replaced with {@link getChatDockedViewSessionId}. */
	readonly resource: string;
}

/** The identifier substituted for `${chatSessionId}`: the last path segment of the chat session resource. */
export function getChatDockedViewSessionId(sessionResource: URI): string {
	return basename(sessionResource);
}

export function resolveChatDockedViewResource(contribution: IChatDockedViewContribution, sessionResource: URI): URI | undefined {
	try {
		return URI.parse(contribution.resource.replaceAll('${chatSessionId}', encodeURIComponent(getChatDockedViewSessionId(sessionResource))));
	} catch {
		return undefined;
	}
}

const chatDockedViewSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['id', 'label', 'resource'],
	properties: {
		id: {
			type: 'string',
			description: nls.localize('chatDockedViews.id', "Identifier of the docked view, unique within the extension."),
		},
		label: {
			type: 'string',
			description: nls.localize('chatDockedViews.label', "Label of the pill that toggles the docked view."),
		},
		icon: {
			type: 'string',
			description: nls.localize('chatDockedViews.icon', "Codicon of the pill, such as {0}.", '`$(checklist)`'),
		},
		resource: {
			type: 'string',
			description: nls.localize('chatDockedViews.resource', "URI of the resource to show for a chat, such as `chat-todos:/${chatSessionId}.todo.json`. The view is offered while the resource exists and is rendered by the resource's custom editor."),
		},
	},
} as const satisfies IJSONSchema;

type IRawChatDockedViewContribution = TypeFromJsonSchema<typeof chatDockedViewSchema>;

const chatDockedViewsExtensionPoint = ExtensionsRegistry.registerExtensionPoint<IRawChatDockedViewContribution[]>({
	extensionPoint: 'chatDockedViews',
	jsonSchema: {
		description: nls.localize('vscode.extension.contributes.chatDockedViews', "Contributes views docked above the chat input, rendered from a per-chat resource by its custom editor."),
		type: 'array',
		items: chatDockedViewSchema,
	},
});

const contributions = observableValue<readonly IChatDockedViewContribution[]>('chatDockedViews', []);

chatDockedViewsExtensionPoint.setHandler(extensions => {
	const result: IChatDockedViewContribution[] = [];
	for (const extension of extensions) {
		if (!isProposedApiEnabled(extension.description, 'contribChatDockedViews')) {
			extension.collector.error(`The 'chatDockedViews' contribution point requires the 'contribChatDockedViews' API proposal.`);
			continue;
		}
		for (const raw of extension.value) {
			if (typeof raw.id !== 'string' || typeof raw.label !== 'string' || typeof raw.resource !== 'string') {
				extension.collector.error(`A chat docked view needs an 'id', a 'label', and a 'resource'.`);
				continue;
			}
			result.push({
				extensionId: extension.description.identifier,
				id: raw.id,
				label: raw.label,
				icon: raw.icon ? ThemeIcon.fromString(raw.icon) : undefined,
				resource: raw.resource,
			});
		}
	}
	contributions.set(result, undefined);
});

/** The docked views contributed by installed extensions. */
export const chatDockedViewContributions: IObservable<readonly IChatDockedViewContribution[]> = contributions;

export type ChatDockedViewsLayout = 'stack' | 'tabs';
export const ChatDockedViewsLayoutSettingId = 'chat.dockedViews.layout';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chatDockedViews',
	title: nls.localize('chatDockedViews.configurationTitle', "Chat Docked Views"),
	type: 'object',
	properties: {
		[ChatDockedViewsLayoutSettingId]: {
			type: 'string',
			enum: ['stack', 'tabs'] satisfies ChatDockedViewsLayout[],
			enumDescriptions: [
				nls.localize('chatDockedViews.layout.stack', "Each pill toggles its own view; open views stack above the pills."),
				nls.localize('chatDockedViews.layout.tabs', "Pills act as tabs: one view is shown at a time, and clicking the selected pill collapses it."),
			],
			default: 'stack',
			tags: ['experimental'],
			description: nls.localize('chatDockedViews.layout', "How views that extensions dock above the chat input share the space."),
		},
	},
});
