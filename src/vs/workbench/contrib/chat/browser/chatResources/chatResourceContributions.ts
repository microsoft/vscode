/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema, TypeFromJsonSchema } from '../../../../../base/common/jsonSchema.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, mapObservableArrayCached, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import * as nls from '../../../../../nls.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IChatPillEntry, IChatPillSection } from '../../../../browser/chatPills.js';
import { isProposedApiEnabled } from '../../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../../services/extensions/common/extensionsRegistry.js';
import { observeChatResourceExists } from './chatResourceExistence.js';

/**
 * A resource an extension adds to every chat whose resource exists, contributed with the proposed `chatResources`
 * contribution point. Whatever makes the resource exist for a chat, such as the extension's file system provider or a tool
 * that writes a file, makes it appear in the chat's Artifacts pill, where it can be pinned and shown like a recorded file.
 */
export interface IChatResourceContribution {
	readonly extensionId: ExtensionIdentifier;
	readonly id: string;
	readonly label: string;
	readonly icon: ThemeIcon | undefined;
	/** A URI template; see {@link resolveChatResourceTemplate}. */
	readonly resource: string;
}

/** The identifiers of a chat that a {@link IChatResourceContribution.resource} template can use. */
export interface IChatResourceSessionIds {
	/** `${chatSessionId}`: the agent host's identifier of the chat, distinct for each chat of a session, such as a side chat. */
	readonly chatSessionId: string;
	/**
	 * `${agentSessionId}`: the agent host's identifier of the session, the `<id>` of `ahp-session:/<id>`, shared by all its
	 * chats. Agents get it from the `get_current_session` tool. It differs from a provider's own ID, such as the Copilot CLI's.
	 * Only native agent hosts have it.
	 */
	readonly agentSessionId: string | undefined;
}

/**
 * The resource of a contribution for a chat: its template with `${chatSessionId}` and `${agentSessionId}` replaced. A chat
 * without an agent session has no resource for templates that use `${agentSessionId}`.
 */
export function resolveChatResourceTemplate(template: string, ids: IChatResourceSessionIds): URI | undefined {
	if (template.includes('${agentSessionId}') && ids.agentSessionId === undefined) {
		return undefined;
	}
	try {
		return URI.parse(template
			.replaceAll('${chatSessionId}', encodeURIComponent(ids.chatSessionId))
			.replaceAll('${agentSessionId}', encodeURIComponent(ids.agentSessionId ?? '')), true);
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
			description: nls.localize('chatResources.label', "Label of the resource in the chat's Artifacts pill."),
		},
		icon: {
			type: 'string',
			description: nls.localize('chatResources.icon', "Codicon of the resource, such as {0}.", '`$(checklist)`'),
		},
		resource: {
			type: 'string',
			description: nls.localize('chatResources.resource', "URI of the resource for a chat, such as `chat-todos:/${agentSessionId}.todo.json`. `${chatSessionId}` is the agent host's identifier of the chat, `${agentSessionId}` the agent host's identifier of the session, which agents get from the `get_current_session` tool. The chat lists the resource while it exists."),
		},
	},
} as const satisfies IJSONSchema;

type IRawChatResourceContribution = TypeFromJsonSchema<typeof chatResourceSchema>;

const chatResourcesExtensionPoint = ExtensionsRegistry.registerExtensionPoint<IRawChatResourceContribution[]>({
	extensionPoint: 'chatResources',
	jsonSchema: {
		description: nls.localize('vscode.extension.contributes.chatResources', "Contributes resources that every chat lists while they exist, for example a per-chat todo list rendered by a custom editor."),
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

const contributions = observableValue<readonly IChatResourceContribution[]>('chatResourceContributions', []);

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
			});
		}
	}
	contributions.set(result, undefined);
});

/** The chat resources contributed by installed extensions. */
export const chatResourceContributions: IObservable<readonly IChatResourceContribution[]> = contributions;

/** The ID of the pill entry of a contributed resource, stable across the chat's lifetime so that pinning it sticks. */
export function getContributedChatResourceEntryId(contribution: IChatResourceContribution): string {
	return `contributed:${contribution.extensionId.value}/${contribution.id}`;
}

/** The contributed resources of a chat that exist, as a section of its Artifacts pill. */
export class ChatResourceContributionEntries extends Disposable {

	readonly sections: IObservable<readonly IChatPillSection[]>;

	/**
	 * @param ids The identifiers of the chat, or `undefined` while it has none, such as in a subagent chat.
	 * @param open Opens a resource in an editor.
	 */
	constructor(
		contributionList: IObservable<readonly IChatResourceContribution[]>,
		ids: IObservable<IChatResourceSessionIds | undefined>,
		open: (resource: URI) => void,
		@IFileService fileService: IFileService,
	) {
		super();
		const candidates = derived(this, reader => {
			const current = ids.read(reader);
			return current ? contributionList.read(reader).flatMap(contribution => {
				const resource = resolveChatResourceTemplate(contribution.resource, current);
				return resource ? [{ contribution, resource }] : [];
			}) : [];
		});
		// A resource of a scheme that no file system provides does not exist: its extension has not made it exist.
		const withExistence = mapObservableArrayCached(this, candidates, (candidate, store) => ({
			...candidate,
			exists: observeChatResourceExists(fileService, candidate.resource, store, false),
		}), candidate => `${getContributedChatResourceEntryId(candidate.contribution)}\u0000${candidate.resource.toString()}`);
		this.sections = derived(this, reader => {
			const entries = withExistence.read(reader).filter(candidate => candidate.exists.read(reader)).map(({ contribution, resource }): IChatPillEntry => ({
				id: getContributedChatResourceEntryId(contribution),
				label: contribution.label,
				icon: contribution.icon,
				resource,
				open: () => open(resource),
			}));
			return entries.length ? [{ title: nls.localize('chatResources.contributedSection', "Extensions"), entries }] : [];
		});
	}
}
