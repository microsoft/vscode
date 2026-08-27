/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { parseSessionArtifacts, readSessionArtifacts, SESSION_META_ARTIFACTS_KEY, stringifySessionArtifacts } from '../common/sessionArtifacts.js';
import { META_CHANGES_SUMMARY } from '../common/agentHostChangesetService.js';
import { GIT_DB_METADATA_KEYS, META_GIT_STATE, META_GITHUB_STATE, META_SOURCE_CONTROL_STATE } from '../common/agentHostGitStateService.js';
import { ChangesSummary, ChatOrigin, ChatOriginKind } from '../common/state/protocol/state.js';
import { AH_META_CREATED_BY_SESSION_DB_KEY, AH_META_EHCLI_ADOPTED_DB_KEY, AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_DONE_DB_KEY, AH_META_IS_READ_DB_KEY, AH_META_WORKSPACELESS_DB_KEY, ISessionGitHubState, ISessionGitState, ISessionSourceControlState, parseSessionCreationReference, parseSessionFolderPickerDecision, parseSessionMultiRootMetadata, readSessionCreationReference, readSessionEhcliAdoptable, readSessionEhcliAdopted, readSessionFolderPickerDecision, readSessionGitHubState, readSessionGitState, readSessionMultiRootMetadata, readSessionSourceControlState, readSessionWorkspaceless, SESSION_META_CREATED_BY_SESSION_KEY, SESSION_META_EHCLI_ADOPTABLE_KEY, SESSION_META_EHCLI_ADOPTED_KEY, SESSION_META_FOLDER_PICKER_KEY, SESSION_META_GIT_KEY, SESSION_META_GITHUB_KEY, SESSION_META_MULTI_ROOT_KEY, SESSION_META_SOURCE_CONTROL_KEY, SESSION_META_WORKSPACELESS_KEY, SessionStatus, SessionSummary } from '../common/state/sessionState.js';
import { AgentHostCatalogData, AgentHostCatalogJsonValue, AgentHostCatalogMetadata, agentHostCatalogGitValidator } from './agentHostCatalogProjection.js';
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
		readonly origin?: AgentHostCatalogJsonValue;
	}[];
}

export interface IAgentHostCatalogSourceResolverDependencies {
	readonly openDatabase: (session: URI) => {
		readonly object: {
			getMetadataObject<T extends Record<string, unknown>>(keys: T): Promise<{ [K in keyof T]: string | undefined }>;
		};
		dispose(): void;
	};
	readonly isUnpersistedChatBacking: (session: URI) => boolean;
	readonly worktreeProjectFromRepositoryRoot: (repositoryRoot: string | undefined) => { readonly uri: URI; readonly displayName: string } | undefined;
}

export class AgentHostCatalogSourceResolver {

	constructor(private readonly _dependencies: IAgentHostCatalogSourceResolverDependencies) { }

	async buildCatalogSyncRequest(session: URI, state: ICatalogSourceState, metadataOverrides: Readonly<Record<string, string>>, preferPersistedMetadata: boolean): Promise<IAgentHostCatalogSyncRequest> {
		const metadataKeys: Record<string, true> = {
			[SESSION_CUSTOM_TITLE_KEY]: true,
			[SESSION_CUSTOM_TITLE_SOURCE_KEY]: true,
			[AH_META_IS_READ_DB_KEY]: true,
			[AH_META_IS_ARCHIVED_DB_KEY]: true,
			[AH_META_IS_DONE_DB_KEY]: true,
			[AH_META_CREATED_BY_SESSION_DB_KEY]: true,
			[AH_META_WORKSPACELESS_DB_KEY]: true,
			[AH_META_EHCLI_ADOPTED_DB_KEY]: true,
			[SESSION_META_MULTI_ROOT_KEY]: true,
			[SESSION_META_FOLDER_PICKER_KEY]: true,
			[SESSION_ARTIFACTS_KEY]: true,
			[META_CHANGES_SUMMARY]: true,
			[CHAT_BACKING_METADATA_KEY]: true,
			[WORKTREE_META_REPOSITORY_ROOT]: true,
			...GIT_DB_METADATA_KEYS,
		};
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
		const title = (preferPersistedMetadata ? metadata[SESSION_CUSTOM_TITLE_KEY] : metadataOverrides[SESSION_CUSTOM_TITLE_KEY]) ?? state.title ?? '';
		const titleSource = normalizeCatalogTitleSource(metadata[SESSION_CUSTOM_TITLE_SOURCE_KEY]);
		const persistedMultiRoot = metadata[SESSION_META_MULTI_ROOT_KEY] !== undefined
			? parseSessionMultiRootMetadata(metadata[SESSION_META_MULTI_ROOT_KEY])
			: undefined;
		const multiRoot = preferPersistedMetadata
			? (metadata[SESSION_META_MULTI_ROOT_KEY] !== undefined ? persistedMultiRoot : readSessionMultiRootMetadata(state.meta))
			: readSessionMultiRootMetadata(state.meta) ?? persistedMultiRoot;
		const persistedFolderPicker = metadata[SESSION_META_FOLDER_PICKER_KEY] !== undefined
			? parseSessionFolderPickerDecision(metadata[SESSION_META_FOLDER_PICKER_KEY])
			: undefined;
		const folderPicker = preferPersistedMetadata
			? (metadata[SESSION_META_FOLDER_PICKER_KEY] !== undefined ? persistedFolderPicker : readSessionFolderPickerDecision(state.meta))
			: readSessionFolderPickerDecision(state.meta) ?? persistedFolderPicker;
		const persistedArtifacts = parseSessionArtifacts(metadata[SESSION_ARTIFACTS_KEY]).artifacts;
		const stateArtifacts = readSessionArtifacts(state.meta);
		const artifacts = preferPersistedMetadata
			? (metadata[SESSION_ARTIFACTS_KEY] !== undefined ? persistedArtifacts : stateArtifacts)
			: (metadataOverrides[SESSION_ARTIFACTS_KEY] !== undefined || stateArtifacts.length === 0 ? persistedArtifacts : stateArtifacts);
		const persistedCreationReference = metadata[AH_META_CREATED_BY_SESSION_DB_KEY] !== undefined
			? parseSessionCreationReference(metadata[AH_META_CREATED_BY_SESSION_DB_KEY])
			: undefined;
		const creationReference = preferPersistedMetadata
			? (metadata[AH_META_CREATED_BY_SESSION_DB_KEY] !== undefined ? persistedCreationReference : readSessionCreationReference(state.meta))
			: readSessionCreationReference(state.meta) ?? persistedCreationReference;
		const persistedGitHub = metadata[META_GITHUB_STATE] !== undefined
			? readPersistedGitHubState(metadata[META_GITHUB_STATE])
			: undefined;
		const github = preferPersistedMetadata
			? (metadata[META_GITHUB_STATE] !== undefined ? persistedGitHub : readSessionGitHubState(state.meta))
			: readSessionGitHubState(state.meta) ?? persistedGitHub;
		const persistedSourceControl = metadata[META_SOURCE_CONTROL_STATE] !== undefined
			? readPersistedSourceControlState(metadata[META_SOURCE_CONTROL_STATE])
			: undefined;
		const sourceControl = preferPersistedMetadata
			? (metadata[META_SOURCE_CONTROL_STATE] !== undefined ? persistedSourceControl : readSessionSourceControlState(state.meta))
			: readSessionSourceControlState(state.meta) ?? persistedSourceControl;
		const persistedGit = metadata[META_GIT_STATE] !== undefined
			? readPersistedGitState(metadata[META_GIT_STATE])
			: undefined;
		const git = readSessionGitState(state.meta) ?? persistedGit;
		const persistedWorkspaceless = metadata[AH_META_WORKSPACELESS_DB_KEY] === 'true';
		const workspaceless = preferPersistedMetadata && metadata[AH_META_WORKSPACELESS_DB_KEY] !== undefined
			? persistedWorkspaceless
			: readSessionWorkspaceless(state.meta) || persistedWorkspaceless;
		const stateIsRead = (state.status & SessionStatus.IsRead) !== 0;
		const isRead = preferPersistedMetadata && metadata[AH_META_IS_READ_DB_KEY] !== undefined
			? metadata[AH_META_IS_READ_DB_KEY] === 'true'
			: stateIsRead;
		const persistedArchived = metadata[AH_META_IS_ARCHIVED_DB_KEY] ?? metadata[AH_META_IS_DONE_DB_KEY];
		const isArchived = preferPersistedMetadata && persistedArchived !== undefined
			? persistedArchived === 'true'
			: (state.status & SessionStatus.IsArchived) !== 0;
		const persistedChanges = metadata[META_CHANGES_SUMMARY] !== undefined
			? readPersistedChanges(metadata[META_CHANGES_SUMMARY])
			: undefined;
		const changes = preferPersistedMetadata && metadata[META_CHANGES_SUMMARY] !== undefined ? persistedChanges : state.changes;
		const worktreeProject = this._dependencies.worktreeProjectFromRepositoryRoot(metadata[WORKTREE_META_REPOSITORY_ROOT]);
		const ehcliAdoptable = readSessionEhcliAdoptable(state.meta);
		const ehcliAdopted = readSessionEhcliAdopted(state.meta) || metadata[AH_META_EHCLI_ADOPTED_DB_KEY] === 'true';
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
		};
		const data: AgentHostCatalogData = {
			modifiedTime: state.modifiedTime,
			summary: title || undefined,
			titleSource,
			isRead,
			isArchived,
			project: worktreeProject
				? { uri: worktreeProject.uri.toString(), displayName: worktreeProject.displayName }
				: state.project,
			isChatBacking: !!metadata[CHAT_BACKING_METADATA_KEY] || this._dependencies.isUnpersistedChatBacking(session),
			workingDirectories: state.workingDirectories,
			changes,
			_meta: Object.keys(meta).length > 0 ? meta : undefined,
			chats: state.chats.map((chat, order) => ({
				uri: chat.uri,
				order,
				kind: chat.kind,
				summary: (preferPersistedMetadata ? metadata[customChatTitleMetadataKey(chat.uri)] : metadataOverrides[customChatTitleMetadataKey(chat.uri)]) || chat.title || undefined,
				titleSource: normalizeCatalogTitleSource(metadata[customChatTitleSourceMetadataKey(chat.uri)]),
				origin: chat.origin,
			})),
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

export function toCatalogJsonValue(value: unknown): AgentHostCatalogJsonValue | undefined {
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
			const converted = toCatalogJsonValue(entry);
			if (converted !== undefined) {
				result.push(converted);
			}
		}
		return result;
	}
	if (typeof value === 'object') {
		const result: { [key: string]: AgentHostCatalogJsonValue } = {};
		for (const [key, entry] of Object.entries(value)) {
			const converted = toCatalogJsonValue(entry);
			if (converted !== undefined) {
				result[key] = converted;
			}
		}
		return result;
	}
	return undefined;
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
		return JSON.parse(value) as ChangesSummary;
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
