/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatDebugResolvedEventContent, IChatDebugService } from '../common/chatDebugService.js';
import { LocalChatSessionUri } from '../common/model/chatUri.js';
import { IPromptDiscoveryInfo, IPromptsService } from '../common/promptSyntax/service/promptsService.js';

/**
 * Bridges {@link IPromptsService} discovery log events to {@link IChatDebugService}.
 *
 * This contribution listens for discovery events emitted by the prompts service
 * and forwards them as debug log entries. It also registers a resolve provider
 * so expanding a discovery event in the debug panel shows the full file list.
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
		@IPromptsService promptsService: IPromptsService,
		@IChatDebugService chatDebugService: IChatDebugService,
	) {
		super();

		// Forward discovery log events to the debug service.
		this._register(promptsService.onDidLogDiscovery(entry => {
			let eventId: string | undefined;

			if (entry.discoveryInfo) {
				eventId = generateUuid();
				this._discoveryEventDetails.set(eventId, entry.discoveryInfo);

				// Evict oldest entries when the map exceeds the cap.
				if (this._discoveryEventDetails.size > PromptsDebugContribution.MAX_DISCOVERY_DETAILS) {
					const first = this._discoveryEventDetails.keys().next().value;
					if (first !== undefined) {
						this._discoveryEventDetails.delete(first);
					}
				}
			}

			chatDebugService.log(
				LocalChatSessionUri.forSession(entry.sessionId),
				entry.name,
				entry.details,
				undefined,
				{ id: eventId, category: entry.category },
			);
		}));

		// Register a resolve provider so expanding a discovery event
		// in the debug panel shows the full file list.
		this._register(chatDebugService.registerProvider({
			provideChatDebugLog: async () => undefined,
			resolveChatDebugLogEvent: async (eventId) => {
				return this._resolveDiscoveryEvent(eventId);
			}
		}));
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
				exists: sf.exists,
				fileCount: sf.fileCount,
				errorMessage: sf.errorMessage,
			})),
		};
	}
}
