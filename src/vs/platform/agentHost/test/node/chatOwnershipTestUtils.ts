/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IAgentHostDatabase, type IAgentHostDatabaseChatOwner, type IAgentHostDatabaseSessionRegistrations } from '../../node/agentHostDatabase.js';
import { AgentHostChatOwnershipService, IAgentHostChatOwnershipService } from '../../node/agentHostChatOwnershipService.js';
import { AgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';

/** A catalog that records no chats or sessions, so ownership comes from the live registry only. */
export class EmptyOwnershipDatabase extends mock<IAgentHostDatabase>() {
	override async findCentralChatOwners(): Promise<ReadonlyMap<string, IAgentHostDatabaseChatOwner>> {
		return new Map();
	}
	override async findCatalogPayloadChatOwners(): Promise<ReadonlyMap<string, IAgentHostDatabaseChatOwner>> {
		return new Map();
	}
	override async getRegistrationGeneration(): Promise<number> {
		return 0;
	}
	override async readSessionRegistrations(): Promise<IAgentHostDatabaseSessionRegistrations> {
		return { generation: 0, current: [], legacy: [], normalizedCatalogs: [] };
	}
}

/** The real chat ownership service over a state manager, with an empty catalog. */
export function createTestChatOwnershipService(stateManager: AgentHostStateManager): AgentHostChatOwnershipService {
	return new AgentHostChatOwnershipService(stateManager, new EmptyOwnershipDatabase());
}

/** An ownership service answering only live owner lookups, for consumers that need nothing else. */
export function createLiveChatOwnership(getChatOwner: (chat: string) => string | undefined, getDefaultChat: (session: string) => string | undefined): IAgentHostChatOwnershipService {
	return new class extends mock<IAgentHostChatOwnershipService>() {
		override readonly onDidRegisterChat = Event.None;
		override readonly onDidUnregisterChat = Event.None;
		override readonly onDidChangeChatOwner = Event.None;
		override getChatOwner(chat: string): string | undefined {
			return getChatOwner(chat);
		}
		override getDefaultChat(session: string): string | undefined {
			return getDefaultChat(session);
		}
		override isDefaultChat(session: string, chat: string): boolean {
			return getDefaultChat(session) === chat;
		}
		override isRegisteredDefaultChat(chat: string): boolean {
			const owner = getChatOwner(chat);
			return owner !== undefined && getDefaultChat(owner) === chat;
		}
		override findRetainedChatOwner(): string | undefined {
			return undefined;
		}
		override getChatStorageResource(): string | undefined {
			return undefined;
		}
		override resolveChatStorageResource(session: string, chat: string): string {
			return creationTimeChatStorageResource(session, chat, getDefaultChat(session));
		}
	}();
}
