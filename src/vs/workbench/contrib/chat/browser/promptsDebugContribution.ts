/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatDebugEvent, IChatDebugResolvedEventContent, IChatDebugService } from '../common/chatDebugService.js';
import { IPromptDiscoveryChangeEvent, IPromptDiscoveryInfo, IPromptsService } from '../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../common/promptSyntax/promptTypes.js';

/**
 * Discovery type labels for debug log entries.
 */
const DISCOVERY_TYPE_LABELS: Record<PromptsType, string> = {
	[PromptsType.prompt]: localize('promptsDebug.loadSlashCommands', 'Load Slash Commands'),
	[PromptsType.agent]: localize('promptsDebug.loadAgents', 'Load Agents'),
	[PromptsType.skill]: localize('promptsDebug.loadSkills', 'Load Skills'),
	[PromptsType.hook]: localize('promptsDebug.loadHooks', 'Load Hooks'),
	[PromptsType.instructions]: localize('promptsDebug.loadInstructions', 'Load Instructions'),
};

/**
 * All discovery types that are emitted.
 */
const ALL_DISCOVERY_TYPES: readonly PromptsType[] = [
	PromptsType.prompt,
	PromptsType.agent,
	PromptsType.skill,
	PromptsType.hook,
	PromptsType.instructions,
];

/**
 * Bridges {@link IPromptsService} discovery events to {@link IChatDebugService}.
 *
 * This contribution handles two concerns:
 * 1. **Initial snapshot**: When a session first invokes providers, this contribution
 *    returns discovery events for all prompt types so the session starts with full context.
 * 2. **Change events**: When the prompts service emits {@link IPromptsService.onDidDiscoveryChange},
 *    this contribution broadcasts the change to all currently active debug sessions.
 *    Future sessions that start after the change will get the updated state via their initial snapshot,
 *    so they do not see stale change events.
 */
export class PromptsDebugContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.promptsDebug';

	private static readonly MAX_DISCOVERY_DETAILS = 10_000;

	/**
	 * Maps debug event IDs to their discovery info, so that
	 * {@link IChatDebugService.resolveEvent} can return rich details.
	 */
	private readonly _discoveryEventDetails = new Map<string, IPromptDiscoveryInfo>();

	constructor(
		@IPromptsService private readonly _promptsService: IPromptsService,
		@IChatDebugService private readonly _chatDebugService: IChatDebugService,
	) {
		super();

		// Broadcast global discovery change events to all active debug sessions.
		this._register(_promptsService.onDidDiscoveryChange(event => {
			this._broadcastDiscoveryChange(event);
		}));

		// Register a resolve provider:
		// - provideChatDebugLog: returns the initial discovery snapshot for a new session
		// - resolveChatDebugLogEvent: returns rich details when expanding a discovery event
		this._register(_chatDebugService.registerProvider({
			provideChatDebugLog: async (sessionResource, token) => {
				return this._provideInitialSnapshot(sessionResource, token);
			},
			resolveChatDebugLogEvent: async (eventId) => {
				return this._resolveDiscoveryEvent(eventId);
			}
		}));
	}

	/**
	 * Called once per session when debug providers are invoked.
	 * Returns discovery events for all prompt types as the initial snapshot.
	 */
	private async _provideInitialSnapshot(_sessionResource: URI, token: CancellationToken): Promise<IChatDebugEvent[]> {
		const events: IChatDebugEvent[] = [];

		for (const type of ALL_DISCOVERY_TYPES) {
			try {
				const discoveryInfo = await this._promptsService.getDiscoveryInfo(type, token);
				if (token.isCancellationRequested) {
					break;
				}
				const event = this._createDiscoveryEvent(_sessionResource, type, discoveryInfo);
				events.push(event);
			} catch {
				// Skip types that fail to compute discovery info
			}
		}

		return events;
	}

	/**
	 * Broadcasts a discovery change to all currently tracked debug sessions.
	 */
	private _broadcastDiscoveryChange(change: IPromptDiscoveryChangeEvent): void {
		const sessionResources = this._chatDebugService.getSessionResources();
		for (const sessionResource of sessionResources) {
			const event = this._createDiscoveryEvent(sessionResource, change.type, change.discoveryInfo, true);
			this._chatDebugService.addEvent(event);
		}
	}

	/**
	 * Creates a generic debug event for a discovery snapshot or change.
	 */
	private _createDiscoveryEvent(sessionResource: URI, type: PromptsType, discoveryInfo: IPromptDiscoveryInfo, isChange?: boolean): IChatDebugEvent {
		const eventId = generateUuid();
		this._discoveryEventDetails.set(eventId, discoveryInfo);

		// Evict oldest entries when the map exceeds the cap.
		if (this._discoveryEventDetails.size > PromptsDebugContribution.MAX_DISCOVERY_DETAILS) {
			const first = this._discoveryEventDetails.keys().next().value;
			if (first !== undefined) {
				this._discoveryEventDetails.delete(first);
			}
		}

		const name = isChange
			? localize('promptsDebug.discoveryChanged', '{0} (Changed)', DISCOVERY_TYPE_LABELS[type])
			: DISCOVERY_TYPE_LABELS[type];

		const details = this._buildDetailsString(discoveryInfo);

		return {
			kind: 'generic' as const,
			id: eventId,
			sessionResource,
			created: new Date(),
			name,
			details,
			level: 1 /* ChatDebugLogLevel.Info */,
			category: 'discovery',
		};
	}

	/**
	 * Builds a human-readable details string from discovery info.
	 */
	private _buildDetailsString(info: IPromptDiscoveryInfo): string {
		const loaded = info.files.filter(f => f.status === 'loaded').map(f => f.name ?? f.uri.path.split('/').pop() ?? f.uri.toString());
		const skipped = info.files.filter(f => f.status === 'skipped').map(f => {
			const label = f.uri.toString();
			return f.skipReason ? `${label} (${f.skipReason})` : label;
		});
		const folders = info.sourceFolders?.map(sf => sf.uri.path) ?? [];
		const parts: string[] = [];
		if (loaded.length > 0) { parts.push(`loaded: [${truncateList(loaded)}]`); }
		if (skipped.length > 0) { parts.push(`skipped: [${truncateList(skipped)}]`); }
		if (folders.length > 0) { parts.push(`folders: [${truncateList(folders)}]`); }
		return parts.join(' | ');
	}

	private _resolveDiscoveryEvent(eventId: string): IChatDebugResolvedEventContent | undefined {
		const info = this._discoveryEventDetails.get(eventId);
		if (!info) {
			return undefined;
		}

		return {
			kind: 'fileList',
			discoveryType: info.type,
			files: info.files.map(f => ({
				uri: f.uri,
				name: f.name,
				status: f.status,
				storage: f.storage,
				extensionId: f.extensionId,
				skipReason: f.skipReason,
				errorMessage: f.errorMessage,
				duplicateOf: f.duplicateOf,
			})),
			sourceFolders: info.sourceFolders?.map(sf => ({
				uri: sf.uri,
				storage: sf.storage,
			})),
		};
	}
}

const MAX_LIST_ITEMS = 100;

/**
 * Join a list of strings, truncating after {@link MAX_LIST_ITEMS} entries.
 * Full details are available via {@link IChatDebugService.resolveEvent}.
 */
function truncateList(items: string[]): string {
	if (items.length <= MAX_LIST_ITEMS) {
		return items.join(', ');
	}
	return items.slice(0, MAX_LIST_ITEMS).join(', ') + ` (+${items.length - MAX_LIST_ITEMS} more)`;
}
