/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from '../../../base/common/async.js';
import { stableStringify } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import type { ISessionDataService } from '../common/sessionDataService.js';
import { ChatInteractivity, ChatOriginKind } from '../common/state/protocol/state.js';
import { chatStorageUri } from '../common/state/sessionState.js';
import { decodeAgentHostCatalogPayload, projectAgentHostCatalogChatOrigin } from './agentHostCatalogProjection.js';
import { fromCatalogChatOrigin } from './agentHostCatalogSourceResolver.js';
import type { AgentHostDatabaseChatV2WriteResult, IAgentHostDatabase, IAgentHostDatabaseChatV2Mutation, IAgentHostDatabaseChatV2NormalizationCandidate, IAgentHostDatabaseChatV2NormalizationChat } from './agentHostDatabase.js';
import { CHAT_INHERITED_TURN_METADATA_KEY, CHAT_ORIGIN_METADATA_KEY, CHAT_PROVIDER_DATA_METADATA_KEY, CHAT_WORKING_DIRECTORIES_METADATA_KEY } from './agentHostPeerChatStore.js';
import { customChatTitleMetadataKey, customChatTitleSourceMetadataKey, parseSessionWorkingDirectories } from './shared/persistSessionMetadata.js';

/** Prepares metadata-only legacy input; the database revalidates its receipt before activation. */
export async function migrateChatCatalogV2(
	database: IAgentHostDatabase,
	sessionDataService: ISessionDataService,
	session: URI,
	mutation?: IAgentHostDatabaseChatV2Mutation | ((candidate: IAgentHostDatabaseChatV2NormalizationCandidate) => IAgentHostDatabaseChatV2Mutation | undefined),
): Promise<AgentHostDatabaseChatV2WriteResult> {
	const sessionKey = session.toString();
	const [snapshot] = await database.readCatalogSnapshot([sessionKey]);
	if (snapshot?.authorityVersion === 2) {
		if (!mutation || typeof mutation === 'function') {
			return { status: 'alreadyNormalized' };
		}
		if (mutation.kind === 'replacePeers') {
			const result = await database.replaceSessionChatCatalog(sessionKey, mutation.chats, mutation.expectedRevision);
			return result.status === 'applied' ? { status: 'applied', catalogRevision: result.revision } : result;
		}
		if (!snapshot.chats.some(chat => chat.chat === mutation.chat)) {
			return { status: 'conflict' };
		}
		return database.updateChatV2Metadata(mutation.chat, mutation.expected, mutation.patch);
	}
	const [source, legacyCatalog] = await Promise.all([
		database.getSessionV2(sessionKey),
		database.getSessionChatCatalog(sessionKey),
	]);
	if (!source?.verified || source.payloadDirty !== 0) {
		return { status: 'notReady' };
	}
	const decoded = decodeAgentHostCatalogPayload(source.payload);
	if (!decoded.ok) {
		throw new Error(`Cannot migrate chat catalog for ${sessionKey}: ${decoded.error}`);
	}
	const sourceChats = decoded.value.data.chats;
	const defaultChat = sourceChats.find(chat => chat.kind === 'default');
	if (!defaultChat) {
		throw new Error(`Cannot migrate chat catalog without a default chat for ${sessionKey}`);
	}
	const legacyByChat = new Map(legacyCatalog?.chats.map(chat => [chat.chat, chat]));
	const visibleOrder = new Map(sourceChats.filter(chat => chat.interactivity !== ChatInteractivity.Hidden).map((chat, order) => [chat.uri, order]));
	const sessionReference = await sessionDataService.tryOpenDatabase(session);
	try {
		const titleKeys: Record<string, true> = {};
		for (const chat of legacyCatalog?.chats ?? []) {
			titleKeys[customChatTitleMetadataKey(chat.chat)] = true;
			titleKeys[customChatTitleSourceMetadataKey(chat.chat)] = true;
		}
		const titleMetadata = sessionReference ? await sessionReference.object.getMetadataObject(titleKeys) : {};
		const deletedChats = (legacyCatalog?.chats ?? [])
			.filter(chat => titleMetadata[customChatTitleMetadataKey(chat.chat)] === '' && titleMetadata[customChatTitleSourceMetadataKey(chat.chat)] === '')
			.map(chat => ({ chat: chat.chat, summary: '' as const, titleSource: '' as const }));
		const deleted = new Set(deletedChats.map(chat => chat.chat));
		const limiter = new Limiter<IAgentHostDatabaseChatV2NormalizationChat>(4);
		let needsLegacyReconciliation = false;
		const chats = await Promise.all(sourceChats.filter(chat => !deleted.has(chat.uri)).map(chat => limiter.queue(async () => {
			const legacy = legacyByChat.get(chat.uri);
			const reference = await sessionDataService.tryOpenDatabase(URI.parse(chat.uri));
			try {
				const metadata: Readonly<Record<string, string | undefined>> = reference ? await reference.object.getMetadataObject({
					[CHAT_PROVIDER_DATA_METADATA_KEY]: true,
					[CHAT_ORIGIN_METADATA_KEY]: true,
					[CHAT_INHERITED_TURN_METADATA_KEY]: true,
					[CHAT_WORKING_DIRECTORIES_METADATA_KEY]: true,
				}) : {};
				const origin = metadata[CHAT_ORIGIN_METADATA_KEY] === undefined
					? legacy?.origin ?? (chat.origin === undefined ? undefined : JSON.stringify(chat.origin))
					: metadata[CHAT_ORIGIN_METADATA_KEY] || undefined;
				const providerData = metadata[CHAT_PROVIDER_DATA_METADATA_KEY] === undefined
					? legacy?.providerData ?? (chat.kind === 'default' ? await sessionReference?.object.getMetadata('defaultChatProviderData') : undefined)
					: metadata[CHAT_PROVIDER_DATA_METADATA_KEY] || undefined;
				const inheritedTurnId = metadata[CHAT_INHERITED_TURN_METADATA_KEY] === undefined
					? legacy?.inheritedTurnId ?? chat.inheritedTurnId
					: metadata[CHAT_INHERITED_TURN_METADATA_KEY] || undefined;
				const rawDirectories = metadata[CHAT_WORKING_DIRECTORIES_METADATA_KEY];
				const workingDirectories = rawDirectories === undefined
					? legacy?.workingDirectories ?? chat.workingDirectories
					: rawDirectories === '' ? undefined : parseSessionWorkingDirectories(rawDirectories);
				if (legacy && (
					metadata[CHAT_PROVIDER_DATA_METADATA_KEY] !== undefined && providerData !== legacy.providerData
					|| metadata[CHAT_ORIGIN_METADATA_KEY] === '' && legacy.origin !== undefined
					|| metadata[CHAT_INHERITED_TURN_METADATA_KEY] === '' && legacy.inheritedTurnId !== undefined
					|| rawDirectories === '' && legacy.workingDirectories !== undefined
				)) {
					needsLegacyReconciliation = true;
				}
				if (stableStringify(origin === undefined ? undefined : projectAgentHostCatalogChatOrigin(JSON.parse(origin))) !== stableStringify(chat.origin)
					|| inheritedTurnId !== chat.inheritedTurnId
					|| rawDirectories === '' && chat.workingDirectories !== undefined
					|| workingDirectories !== undefined && chat.workingDirectories !== undefined && stableStringify(workingDirectories) !== stableStringify(chat.workingDirectories)
					|| workingDirectories !== undefined && chat.workingDirectories === undefined && chat.kind !== 'default') {
					needsLegacyReconciliation = true;
				}
				const provenance = fromCatalogChatOrigin(chat.origin);
				const isPrivate = chat.interactivity === ChatInteractivity.Hidden;
				return {
					chat: chat.uri,
					...(isPrivate ? {} : { order: visibleOrder.get(chat.uri) }),
					storageResource: chatStorageUri(chat.uri)?.toString() ?? chat.uri,
					...(isPrivate && provenance && provenance.kind !== ChatOriginKind.User ? { parentChat: provenance.chat } : {}),
					providerData,
					origin,
					inheritedTurnId,
					workingDirectories,
					isRead: chat.isRead,
					archived: chat.archived,
					metadata: { summary: chat.summary, titleSource: chat.titleSource, interactivity: chat.interactivity, changes: chat.changes },
				};
			} finally {
				reference?.dispose();
			}
		})));
		if (needsLegacyReconciliation) {
			return { status: 'notReady' };
		}
		const preparedDefault = chats.find(chat => chat.chat === defaultChat.uri);
		if (!preparedDefault) {
			throw new Error(`Cannot migrate a deleted default chat for ${sessionKey}`);
		}
		const candidate: IAgentHostDatabaseChatV2NormalizationCandidate = {
			defaultChat: preparedDefault,
			peers: chats.filter(chat => chat.chat !== defaultChat.uri && chat.order !== undefined),
			privateDescendants: chats.filter(chat => chat.order === undefined),
			deletedChats,
		};
		return database.ensureChatCatalogV2(sessionKey, {
			sessionGeneration: source.sessionGeneration,
			sourceRevision: source.sourceRevision,
			payloadHash: source.payloadHash,
			catalogRevision: legacyCatalog?.revision ?? 0,
		}, candidate, typeof mutation === 'function' ? mutation(candidate) : mutation);
	} finally {
		sessionReference?.dispose();
	}
}
