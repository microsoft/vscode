/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from '../../../base/common/async.js';
import { URI } from '../../../base/common/uri.js';
import { AH_META_DEV_CONTAINER_WORKTREE_DB_KEY, readAgentDevContainerWorktreeMetadata } from '../common/meta/agentDevContainerWorktreeMeta.js';
import { parseSessionArtifacts, readSessionArtifacts, SESSION_META_ARTIFACTS_KEY, stringifySessionArtifacts } from '../common/sessionArtifacts.js';
import { META_CHANGES_SUMMARY } from '../common/agentHostChangesetService.js';
import { META_GIT_STATE, META_GITHUB_STATE, META_SOURCE_CONTROL_STATE } from '../common/agentHostGitStateService.js';
import { ChangesSummary, ChatOrigin, ChatOriginKind } from '../common/state/protocol/state.js';
import { AH_META_CREATED_BY_SESSION_DB_KEY, AH_META_EHCLI_ADOPTED_DB_KEY, AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_DONE_DB_KEY, AH_META_IS_READ_DB_KEY, AH_META_WORKSPACELESS_DB_KEY, ISessionGitHubState, ISessionGitState, ISessionSourceControlState, parseSessionCreationReference, parseSessionFolderPickerDecision, parseSessionMultiRootMetadata, readSessionCreationReference, readSessionEhcliAdoptable, readSessionEhcliAdopted, readSessionFolderPickerDecision, readSessionGitHubState, readSessionGitState, readSessionMultiRootMetadata, readSessionSourceControlState, readSessionWorkspaceless, SESSION_META_CREATED_BY_SESSION_KEY, SESSION_META_EHCLI_ADOPTABLE_KEY, SESSION_META_EHCLI_ADOPTED_KEY, SESSION_META_FOLDER_PICKER_KEY, SESSION_META_GIT_KEY, SESSION_META_GITHUB_KEY, SESSION_META_MULTI_ROOT_KEY, SESSION_META_SOURCE_CONTROL_KEY, SESSION_META_WORKSPACELESS_KEY, SessionStatus, SessionSummary } from '../common/state/sessionState.js';
import { AGENT_HOST_CATALOG_JSON_STRING_LENGTH_LIMIT, AGENT_HOST_CATALOG_TITLE_LENGTH_LIMIT, AgentHostCatalogData, AgentHostCatalogJsonValue, AgentHostCatalogMetadata, agentHostCatalogChangesValidator, agentHostCatalogGitValidator } from './agentHostCatalogProjection.js';
import { IAgentHostCatalogSyncRequest } from './agentHostCatalogSyncService.js';
import { AGENT_HOST_TITLE_SOURCE_AUTO, AgentHostTitleSource, customChatTitleMetadataKey, customChatTitleSourceMetadataKey, SESSION_ARTIFACTS_KEY, SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY } from './shared/persistSessionMetadata.js';
import { WORKTREE_META_REPOSITORY_ROOT } from './shared/worktreeIsolation.js';

export const CHAT_BACKING_METADATA_KEY = 'peerChatBacking';

export interface ICatalogSourceState {
	readonly modifiedTime: number;
	readonly title?: string;
	readonly status: SessionStatus;
	readonly project?: { readonly uri: string; readonly displayName: string };
	readonly workingDirectories: readonly string[];
	readonly changes?: ChangesSummary;
	readonly meta?: SessionSummary['_meta'];
	readonly chats: readonly {
		readonly uri: string;
		readonly kind: 'default' | 'peer';
		readonly title?: string;
		readonly origin?: ChatOrigin;
	}[];
}

export interface IAgentHostCatalogSourceResolverDependencies {
	readonly openDatabase: (session: URI) => {
		readonly object: {
			getMetadataObject<T extends Record<string, unknown>>(keys: T): Promise<{ [K in keyof T]: string | undefined }>;
		};
		dispose(): void;
	};
	readonly tryOpenDatabase?: (session: URI) => Promise<{
		readonly object: {
			getMetadataObject<T extends Record<string, unknown>>(keys: T): Promise<{ [K in keyof T]: string | undefined }>;
		};
		dispose(): void;
	} | undefined>;
	readonly isUnpersistedChatBacking: (session: URI) => boolean;
	readonly worktreeProjectFromRepositoryRoot: (repositoryRoot: string | undefined) => { readonly uri: URI; readonly displayName: string } | undefined;
}

interface ISessionMetadataKey {
	readonly key: string;
}

interface ITypedSessionMetadataKey<T> extends ISessionMetadataKey {
	has(values: Readonly<Record<string, string | undefined>>): boolean;
	read(values: Readonly<Record<string, string | undefined>>): T | undefined;
}

function stringSessionMetadataKey(key: string): ITypedSessionMetadataKey<string> {
	return {
		key,
		has: values => values[key] !== undefined,
		read: values => values[key],
	};
}

function parsedSessionMetadataKey<T>(key: string, parse: (value: string) => T | undefined): ITypedSessionMetadataKey<T> {
	return {
		key,
		has: values => values[key] !== undefined,
		read: values => {
			const value = values[key];
			return value === undefined ? undefined : parse(value);
		},
	};
}

const sessionMetadata = {
	title: stringSessionMetadataKey(SESSION_CUSTOM_TITLE_KEY),
	titleSource: stringSessionMetadataKey(SESSION_CUSTOM_TITLE_SOURCE_KEY),
	isRead: parsedSessionMetadataKey(AH_META_IS_READ_DB_KEY, value => value === 'true'),
	isArchived: parsedSessionMetadataKey(AH_META_IS_ARCHIVED_DB_KEY, value => value === 'true'),
	isDone: parsedSessionMetadataKey(AH_META_IS_DONE_DB_KEY, value => value === 'true'),
	creationReference: parsedSessionMetadataKey(AH_META_CREATED_BY_SESSION_DB_KEY, parseSessionCreationReference),
	workspaceless: parsedSessionMetadataKey(AH_META_WORKSPACELESS_DB_KEY, value => value === 'true'),
	ehcliAdopted: parsedSessionMetadataKey(AH_META_EHCLI_ADOPTED_DB_KEY, value => value === 'true'),
	multiRoot: parsedSessionMetadataKey(SESSION_META_MULTI_ROOT_KEY, parseSessionMultiRootMetadata),
	folderPicker: parsedSessionMetadataKey(SESSION_META_FOLDER_PICKER_KEY, parseSessionFolderPickerDecision),
	artifacts: parsedSessionMetadataKey(SESSION_ARTIFACTS_KEY, value => parseSessionArtifacts(value).artifacts),
	changes: parsedSessionMetadataKey(META_CHANGES_SUMMARY, readPersistedChanges),
	chatBacking: stringSessionMetadataKey(CHAT_BACKING_METADATA_KEY),
	worktreeRepositoryRoot: stringSessionMetadataKey(WORKTREE_META_REPOSITORY_ROOT),
	gitHub: parsedSessionMetadataKey(META_GITHUB_STATE, readPersistedGitHubState),
	git: parsedSessionMetadataKey(META_GIT_STATE, readPersistedGitState),
	sourceControl: parsedSessionMetadataKey(META_SOURCE_CONTROL_STATE, readPersistedSourceControlState),
	devContainerWorktree: parsedSessionMetadataKey(AH_META_DEV_CONTAINER_WORKTREE_DB_KEY, readPersistedDevContainerWorktree),
} as const;

const sessionMetadataKeys: readonly ISessionMetadataKey[] = Object.values(sessionMetadata);

function createMetadataKeySet(keys: readonly ISessionMetadataKey[]): Record<string, true> {
	return keys.reduce<Record<string, true>>((result, metadata) => {
		result[metadata.key] = true;
		return result;
	}, {});
}

export class AgentHostCatalogSourceResolver {

	constructor(private readonly _dependencies: IAgentHostCatalogSourceResolverDependencies) { }

	async buildCatalogSyncRequest(session: URI, state: ICatalogSourceState, metadataOverrides: Readonly<Record<string, string>>, preferPersistedMetadata: boolean): Promise<IAgentHostCatalogSyncRequest> {
		const metadataKeys = createMetadataKeySet(sessionMetadataKeys);
		for (const chat of state.chats) {
			metadataKeys[customChatTitleMetadataKey(chat.uri)] = true;
			metadataKeys[customChatTitleSourceMetadataKey(chat.uri)] = true;
		}

		const ref = this._dependencies.openDatabase(session);
		let persisted: { readonly [key: string]: string | undefined };
		try {
			persisted = await ref.object.getMetadataObject(metadataKeys);
		} finally {
			ref.dispose();
		}
		const metadata = { ...persisted, ...metadataOverrides };
		const chatMetadataLimiter = new Limiter<readonly [string, Readonly<Record<string, string | undefined>> | undefined]>(4);
		const chatMetadata = new Map(await Promise.all(state.chats.map(chat => chatMetadataLimiter.queue(async () => {
			try {
				const ref = await this._dependencies.tryOpenDatabase?.(URI.parse(chat.uri));
				if (!ref) {
					return [chat.uri, undefined] as const;
				}
				try {
					return [chat.uri, await ref.object.getMetadataObject({
						[SESSION_CUSTOM_TITLE_KEY]: true,
						[SESSION_CUSTOM_TITLE_SOURCE_KEY]: true,
					})] as const;
				} finally {
					ref.dispose();
				}
			} catch {
				return [chat.uri, undefined] as const;
			}
		}))));
		const persistedTitle = sessionMetadata.title.read(metadata);
		const persistedTitleSource = sessionMetadata.titleSource.read(metadata);
		const defaultChat = state.chats.find(chat => chat.kind === 'default');
		const defaultChatMetadata = defaultChat ? chatMetadata.get(defaultChat.uri) : undefined;
		const title = preferPersistedMetadata
			? persistedTitle ?? defaultChatMetadata?.[SESSION_CUSTOM_TITLE_KEY] ?? state.title ?? ''
			: metadataOverrides[SESSION_CUSTOM_TITLE_KEY] ?? state.title ?? defaultChatMetadata?.[SESSION_CUSTOM_TITLE_KEY] ?? '';
		const titleSource = normalizeCatalogTitleSource(
			persistedTitleSource
			?? (persistedTitle === undefined ? defaultChatMetadata?.[SESSION_CUSTOM_TITLE_SOURCE_KEY] : undefined),
		);
		const persistedMultiRoot = sessionMetadata.multiRoot.read(metadata);
		const multiRoot = preferPersistedMetadata
			? (sessionMetadata.multiRoot.has(metadata) ? persistedMultiRoot : readSessionMultiRootMetadata(state.meta))
			: readSessionMultiRootMetadata(state.meta) ?? persistedMultiRoot;
		const persistedFolderPicker = sessionMetadata.folderPicker.read(metadata);
		const folderPicker = preferPersistedMetadata
			? (sessionMetadata.folderPicker.has(metadata) ? persistedFolderPicker : readSessionFolderPickerDecision(state.meta))
			: readSessionFolderPickerDecision(state.meta) ?? persistedFolderPicker;
		const persistedArtifacts = sessionMetadata.artifacts.read(metadata) ?? [];
		const stateArtifacts = readSessionArtifacts(state.meta);
		const artifacts = preferPersistedMetadata
			? (metadata[SESSION_ARTIFACTS_KEY] !== undefined ? persistedArtifacts : stateArtifacts)
			: (metadataOverrides[SESSION_ARTIFACTS_KEY] !== undefined || stateArtifacts.length === 0 ? persistedArtifacts : stateArtifacts);
		const persistedCreationReference = sessionMetadata.creationReference.read(metadata);
		const creationReference = preferPersistedMetadata
			? (sessionMetadata.creationReference.has(metadata) ? persistedCreationReference : readSessionCreationReference(state.meta))
			: readSessionCreationReference(state.meta) ?? persistedCreationReference;
		const persistedGitHub = sessionMetadata.gitHub.read(metadata);
		const github = preferPersistedMetadata
			? (sessionMetadata.gitHub.has(metadata) ? persistedGitHub : readSessionGitHubState(state.meta))
			: readSessionGitHubState(state.meta) ?? persistedGitHub;
		const persistedSourceControl = sessionMetadata.sourceControl.read(metadata);
		const sourceControl = preferPersistedMetadata
			? (sessionMetadata.sourceControl.has(metadata) ? persistedSourceControl : readSessionSourceControlState(state.meta))
			: readSessionSourceControlState(state.meta) ?? persistedSourceControl;
		const persistedGit = sessionMetadata.git.read(metadata);
		const git = readSessionGitState(state.meta) ?? persistedGit;
		const persistedWorkspaceless = sessionMetadata.workspaceless.read(metadata) ?? false;
		const workspaceless = preferPersistedMetadata && metadata[AH_META_WORKSPACELESS_DB_KEY] !== undefined
			? persistedWorkspaceless
			: readSessionWorkspaceless(state.meta) || persistedWorkspaceless;
		const stateIsRead = (state.status & SessionStatus.IsRead) !== 0;
		const isRead = preferPersistedMetadata && metadata[AH_META_IS_READ_DB_KEY] !== undefined
			? sessionMetadata.isRead.read(metadata) ?? false
			: stateIsRead;
		const persistedArchived = sessionMetadata.isArchived.read(metadata) ?? sessionMetadata.isDone.read(metadata);
		const isArchived = preferPersistedMetadata && persistedArchived !== undefined
			? persistedArchived
			: (state.status & SessionStatus.IsArchived) !== 0;
		const persistedChanges = sessionMetadata.changes.read(metadata);
		const changes = preferPersistedMetadata && metadata[META_CHANGES_SUMMARY] !== undefined ? persistedChanges : state.changes;
		const worktreeProject = this._dependencies.worktreeProjectFromRepositoryRoot(sessionMetadata.worktreeRepositoryRoot.read(metadata));
		const ehcliAdoptable = readSessionEhcliAdoptable(state.meta);
		const ehcliAdopted = readSessionEhcliAdopted(state.meta) || sessionMetadata.ehcliAdopted.read(metadata) === true;
		const persistedDevContainerWorktree = sessionMetadata.devContainerWorktree.read(metadata);
		const devContainerWorktree = preferPersistedMetadata && sessionMetadata.devContainerWorktree.has(metadata)
			? persistedDevContainerWorktree
			: readAgentDevContainerWorktreeMetadata(state.meta) ?? persistedDevContainerWorktree;
		const meta: AgentHostCatalogMetadata = {
			...(multiRoot ? { [SESSION_META_MULTI_ROOT_KEY]: multiRoot } : undefined),
			...(folderPicker ? { [SESSION_META_FOLDER_PICKER_KEY]: folderPicker } : undefined),
			...(github ? { [SESSION_META_GITHUB_KEY]: github } : undefined),
			...(git ? { [SESSION_META_GIT_KEY]: git } : undefined),
			...(sourceControl ? { [SESSION_META_SOURCE_CONTROL_KEY]: sourceControl } : undefined),
			...(artifacts.length > 0 ? { [SESSION_META_ARTIFACTS_KEY]: [...artifacts] } : undefined),
			...(creationReference ? { [SESSION_META_CREATED_BY_SESSION_KEY]: creationReference } : undefined),
			...(workspaceless ? { [SESSION_META_WORKSPACELESS_KEY]: true } : undefined),
			...(ehcliAdoptable ? { [SESSION_META_EHCLI_ADOPTABLE_KEY]: true } : undefined),
			...(ehcliAdopted ? { [SESSION_META_EHCLI_ADOPTED_KEY]: true } : undefined),
			...(devContainerWorktree ? { [AH_META_DEV_CONTAINER_WORKTREE_DB_KEY]: devContainerWorktree } : undefined),
		};
		const data: AgentHostCatalogData = {
			modifiedTime: state.modifiedTime,
			summary: toCatalogSummary(title),
			titleSource,
			isRead,
			isArchived,
			project: worktreeProject
				? { uri: worktreeProject.uri.toString(), displayName: worktreeProject.displayName }
				: state.project,
			isChatBacking: !!sessionMetadata.chatBacking.read(metadata) || this._dependencies.isUnpersistedChatBacking(session),
			workingDirectories: state.workingDirectories,
			changes,
			_meta: Object.keys(meta).length > 0 ? meta : undefined,
			chats: state.chats.map((chat, order) => {
				const local = chatMetadata.get(chat.uri);
				const summary = preferPersistedMetadata
					? local?.[SESSION_CUSTOM_TITLE_KEY]
					|| metadata[customChatTitleMetadataKey(chat.uri)]
					|| chat.title
					|| undefined
					: metadataOverrides[customChatTitleMetadataKey(chat.uri)]
					|| chat.title
					|| local?.[SESSION_CUSTOM_TITLE_KEY]
					|| undefined;
				const titleSource = preferPersistedMetadata
					? local?.[SESSION_CUSTOM_TITLE_SOURCE_KEY] ?? metadata[customChatTitleSourceMetadataKey(chat.uri)]
					: metadataOverrides[customChatTitleSourceMetadataKey(chat.uri)] ?? local?.[SESSION_CUSTOM_TITLE_SOURCE_KEY] ?? metadata[customChatTitleSourceMetadataKey(chat.uri)];
				return {
					uri: chat.uri,
					order,
					kind: chat.kind,
					summary: toCatalogSummary(summary),
					titleSource: normalizeCatalogTitleSource(titleSource),
					origin: toCatalogChatOrigin(chat.origin),
				};
			}),
		};
		const legacyMetadata: Record<string, string> = {
			...metadataOverrides,
			[AH_META_IS_READ_DB_KEY]: data.isRead ? 'true' : '',
			[AH_META_IS_ARCHIVED_DB_KEY]: data.isArchived ? 'true' : '',
			[SESSION_META_MULTI_ROOT_KEY]: multiRoot ? JSON.stringify(multiRoot) : '',
			[SESSION_META_FOLDER_PICKER_KEY]: folderPicker ? JSON.stringify(folderPicker) : '',
			[SESSION_ARTIFACTS_KEY]: stringifySessionArtifacts(artifacts),
		};
		if (creationReference || metadata[AH_META_CREATED_BY_SESSION_DB_KEY] !== undefined) {
			legacyMetadata[AH_META_CREATED_BY_SESSION_DB_KEY] = creationReference ? JSON.stringify(creationReference) : '';
		}
		if (workspaceless || metadata[AH_META_WORKSPACELESS_DB_KEY] !== undefined) {
			legacyMetadata[AH_META_WORKSPACELESS_DB_KEY] = workspaceless ? 'true' : 'false';
		}
		if (metadata[CHAT_BACKING_METADATA_KEY] !== undefined) {
			legacyMetadata[CHAT_BACKING_METADATA_KEY] = metadata[CHAT_BACKING_METADATA_KEY];
		}
		if (metadata[WORKTREE_META_REPOSITORY_ROOT] !== undefined) {
			legacyMetadata[WORKTREE_META_REPOSITORY_ROOT] = metadata[WORKTREE_META_REPOSITORY_ROOT];
		}
		if (devContainerWorktree || sessionMetadata.devContainerWorktree.has(metadata)) {
			legacyMetadata[AH_META_DEV_CONTAINER_WORKTREE_DB_KEY] = devContainerWorktree ? JSON.stringify(devContainerWorktree) : '';
		}
		if (metadataOverrides[SESSION_CUSTOM_TITLE_KEY] !== undefined || persisted[SESSION_CUSTOM_TITLE_KEY] !== undefined) {
			legacyMetadata[SESSION_CUSTOM_TITLE_KEY] = title;
			legacyMetadata[SESSION_CUSTOM_TITLE_SOURCE_KEY] = titleSource;
		} else if (metadataOverrides[SESSION_CUSTOM_TITLE_SOURCE_KEY] !== undefined || persisted[SESSION_CUSTOM_TITLE_SOURCE_KEY] !== undefined) {
			legacyMetadata[SESSION_CUSTOM_TITLE_SOURCE_KEY] = titleSource;
		}
		if (github) {
			legacyMetadata[META_GITHUB_STATE] = JSON.stringify(github);
		}
		if (sourceControl) {
			legacyMetadata[META_SOURCE_CONTROL_STATE] = JSON.stringify(sourceControl);
		}
		if (git) {
			legacyMetadata[META_GIT_STATE] = JSON.stringify(git);
		} else if (metadata[META_GIT_STATE] !== undefined) {
			legacyMetadata[META_GIT_STATE] = '';
		}
		if (metadata[META_CHANGES_SUMMARY] !== undefined) {
			legacyMetadata[META_CHANGES_SUMMARY] = changes ? JSON.stringify(changes) : '';
		}
		return { data, legacyMetadata };
	}
}

function toCatalogSummary(value: string | undefined): string | undefined {
	if (!value || value.length <= AGENT_HOST_CATALOG_TITLE_LENGTH_LIMIT) {
		return value || undefined;
	}
	let end = AGENT_HOST_CATALOG_TITLE_LENGTH_LIMIT - 1;
	const lastCodeUnit = value.charCodeAt(end - 1);
	if (lastCodeUnit >= 0xD800 && lastCodeUnit <= 0xDBFF) {
		end--;
	}
	return `${value.slice(0, end)}…`;
}

export function toSerializableJsonValue(value: unknown): AgentHostCatalogJsonValue | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (value === null || typeof value === 'string' || typeof value === 'boolean') {
		return value;
	}
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : undefined;
	}
	if (Array.isArray(value)) {
		const result: AgentHostCatalogJsonValue[] = [];
		for (const entry of value) {
			const converted = toSerializableJsonValue(entry);
			if (converted !== undefined) {
				result.push(converted);
			}
		}
		return result;
	}
	if (typeof value === 'object') {
		const result: { [key: string]: AgentHostCatalogJsonValue } = {};
		for (const [key, entry] of Object.entries(value)) {
			const converted = toSerializableJsonValue(entry);
			if (converted !== undefined) {
				result[key] = converted;
			}
		}
		return result;
	}
	return undefined;
}

/** Projects bounded navigation provenance while authoritative selection snapshots remain in peer-chat metadata. */
function toCatalogChatOrigin(origin: ChatOrigin | undefined): AgentHostCatalogJsonValue | undefined {
	if (!origin) {
		return undefined;
	}
	const projected = origin.kind === ChatOriginKind.SideChat
		? { kind: origin.kind, chat: origin.chat, turnId: origin.turnId }
		: origin;
	const value = toSerializableJsonValue(projected);
	return value !== undefined && hasOnlyBoundedStrings(value) ? value : undefined;
}

function hasOnlyBoundedStrings(value: AgentHostCatalogJsonValue): boolean {
	if (typeof value === 'string') {
		return value.length <= AGENT_HOST_CATALOG_JSON_STRING_LENGTH_LIMIT;
	}
	if (Array.isArray(value)) {
		return value.every(hasOnlyBoundedStrings);
	}
	if (value && typeof value === 'object') {
		return Object.entries(value).every(([key, entry]) =>
			key.length <= AGENT_HOST_CATALOG_JSON_STRING_LENGTH_LIMIT && hasOnlyBoundedStrings(entry));
	}
	return true;
}

export function fromCatalogChatOrigin(value: AgentHostCatalogJsonValue | undefined): ChatOrigin | undefined {
	if (!isRecord(value) || typeof value.kind !== 'string') {
		return undefined;
	}
	if (value.kind === ChatOriginKind.User) {
		return { kind: ChatOriginKind.User };
	}
	if (typeof value.chat !== 'string') {
		return undefined;
	}
	if (value.kind === ChatOriginKind.Fork && typeof value.turnId === 'string') {
		return { kind: ChatOriginKind.Fork, chat: value.chat, turnId: value.turnId };
	}
	if (value.kind === ChatOriginKind.SideChat && typeof value.turnId === 'string') {
		const selection = isRecord(value.selection)
			&& typeof value.selection.text === 'string'
			&& (value.selection.responsePartId === undefined || typeof value.selection.responsePartId === 'string')
			? {
				text: value.selection.text,
				...(typeof value.selection.responsePartId === 'string' ? { responsePartId: value.selection.responsePartId } : {}),
			}
			: undefined;
		return {
			kind: ChatOriginKind.SideChat,
			chat: value.chat,
			turnId: value.turnId,
			...(selection ? { selection } : {}),
		};
	}
	if (value.kind === ChatOriginKind.Tool && typeof value.toolCallId === 'string') {
		return { kind: ChatOriginKind.Tool, chat: value.chat, toolCallId: value.toolCallId };
	}
	return undefined;
}

function normalizeCatalogTitleSource(value: string | undefined): AgentHostTitleSource {
	return value === 'user' || value === 'agent' || value === 'auto' ? value : AGENT_HOST_TITLE_SOURCE_AUTO;
}

function readPersistedGitHubState(value: string | undefined): ISessionGitHubState | undefined {
	if (!value) {
		return undefined;
	}
	try {
		return readSessionGitHubState({ [SESSION_META_GITHUB_KEY]: JSON.parse(value) });
	} catch {
		return undefined;
	}
}

function readPersistedDevContainerWorktree(value: string): ReturnType<typeof readAgentDevContainerWorktreeMetadata> {
	try {
		return readAgentDevContainerWorktreeMetadata({ [AH_META_DEV_CONTAINER_WORKTREE_DB_KEY]: JSON.parse(value) });
	} catch {
		return undefined;
	}
}

function readPersistedSourceControlState(value: string | undefined): ISessionSourceControlState | undefined {
	if (!value) {
		return undefined;
	}
	try {
		return readSessionSourceControlState({ [SESSION_META_SOURCE_CONTROL_KEY]: JSON.parse(value) });
	} catch {
		return undefined;
	}
}

function readPersistedGitState(value: string | undefined): ISessionGitState | undefined {
	if (!value) {
		return undefined;
	}
	try {
		return agentHostCatalogGitValidator.validate(JSON.parse(value)).content;
	} catch {
		return undefined;
	}
}

function readPersistedChanges(value: string | undefined): ChangesSummary | undefined {
	if (!value) {
		return undefined;
	}
	try {
		return agentHostCatalogChangesValidator.validate(JSON.parse(value)).content;
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
