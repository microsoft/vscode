/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { stableStringify } from '../../../base/common/objects.js';
import type { AgentHostCatalogChatKind, AgentHostCatalogTitleSource, IAgentHostDatabaseCatalogChat, IAgentHostDatabaseSessionV2Projection } from './agentHostDatabase.js';

export const AGENT_HOST_CATALOG_PROJECTION_VERSION = 5;

/** Each GitHub URL history is truncated to this many list-visible references. */
export const AGENT_HOST_CATALOG_GITHUB_REFERENCE_LIMIT = 10;

export const AGENT_HOST_CATALOG_ARTIFACT_LIMIT = 100;
export const AGENT_HOST_CATALOG_CHILD_LIMIT = 1000;
export const AGENT_HOST_CATALOG_STRUCTURED_FIELD_BYTE_LIMIT = 64 * 1024;
export const AGENT_HOST_CATALOG_SOURCE_PAYLOAD_BYTE_LIMIT = 4 * 1024 * 1024;

const MAX_STRING_LENGTH = 4096;
const MAX_TITLE_LENGTH = 1024;
const MAX_JSON_DEPTH = 20;
const MAX_JSON_ENTRIES = 2000;

export type AgentHostCatalogJsonValue = null | boolean | number | string | readonly AgentHostCatalogJsonValue[] | { readonly [key: string]: AgentHostCatalogJsonValue };

export interface IAgentHostCatalogProject {
	readonly uri: string;
	readonly displayName: string;
}

export interface IAgentHostCatalogMultiRoot {
	readonly workspaceFile: string;
}

export interface IAgentHostCatalogFolderPickerDecision {
	readonly hidden: boolean;
	readonly primary?: string;
}

export interface IAgentHostCatalogChangesSummary {
	readonly additions?: number;
	readonly deletions?: number;
	readonly files?: number;
}

export interface IAgentHostCatalogGitHubSummary {
	readonly owner?: string;
	readonly repo?: string;
	readonly pullRequestUrls?: readonly string[];
	readonly initialPullRequestUrls?: readonly string[];
	readonly associatedPullRequestUrls?: readonly string[];
	readonly issueUrls?: readonly string[];
	readonly pullRequestBranchName?: string;
}

export interface IAgentHostCatalogGitSummary {
	readonly hasGitHubRemote?: boolean;
	readonly branchName?: string;
	readonly baseBranchName?: string;
	readonly upstreamBranchName?: string;
	readonly incomingChanges?: number;
	readonly outgoingChanges?: number;
	readonly uncommittedChanges?: number;
	readonly hasBaseBranchChanges?: boolean;
	readonly githubOwner?: string;
	readonly githubHeadOwner?: string;
	readonly githubRepo?: string;
}

export type AgentHostCatalogSourceControlOutcome = 'merge' | 'pullRequest';

export interface IAgentHostCatalogSourceControlSummary {
	readonly merge?: {
		readonly commit: string;
	};
	readonly latestOutcome?: AgentHostCatalogSourceControlOutcome;
}

export type AgentHostCatalogArtifactType = 'pullRequest' | 'issue' | 'commit' | 'website' | 'file' | 'resource';

export interface IAgentHostCatalogArtifact {
	readonly id: string;
	readonly type: AgentHostCatalogArtifactType;
	readonly label: string;
	readonly link?: string;
	readonly uri?: string;
	readonly commitHash?: string;
	readonly isGitHub?: boolean;
	readonly createdByThisSession?: boolean;
}

export interface IAgentHostCatalogOrchestration {
	readonly parentSession: string;
	readonly creatorSession: string;
	readonly label?: string;
	readonly coordinateWithCreator: boolean;
	readonly notifyOnIdle?: 'once' | 'always';
	readonly creatorNotificationState?: 'waitingForCompletion' | 'notified';
}

export interface IAgentHostCatalogSourceChat {
	readonly uri: string;
	readonly order: number;
	readonly kind: AgentHostCatalogChatKind;
	readonly title?: string;
	readonly titleSource?: AgentHostCatalogTitleSource;
	readonly origin?: AgentHostCatalogJsonValue;
}

/**
 * Provider-neutral, list-visible session state. Hydrate-on-open content and
 * transient activity state intentionally have no representation in this type.
 */
export interface IAgentHostCatalogSource {
	readonly modifiedTime: number;
	readonly title?: string;
	readonly titleSource?: AgentHostCatalogTitleSource;
	readonly isRead: boolean;
	readonly isArchived: boolean;
	readonly project?: IAgentHostCatalogProject;
	readonly workspaceless: boolean;
	readonly isChatBacking?: boolean;
	readonly ehcliAdoptable?: boolean;
	readonly ehcliAdopted?: boolean;
	readonly multiRoot?: IAgentHostCatalogMultiRoot;
	readonly folderPicker?: IAgentHostCatalogFolderPickerDecision;
	readonly changes?: IAgentHostCatalogChangesSummary;
	readonly github?: IAgentHostCatalogGitHubSummary;
	readonly git?: IAgentHostCatalogGitSummary;
	readonly sourceControl?: IAgentHostCatalogSourceControlSummary;
	readonly artifacts?: readonly IAgentHostCatalogArtifact[];
	readonly orchestration?: IAgentHostCatalogOrchestration;
	readonly workingDirectories: readonly string[];
	readonly chats: readonly IAgentHostCatalogSourceChat[];
}

export interface IAgentHostCatalogProjectionOptions {
	readonly session: string;
	readonly sessionGeneration: string;
	readonly sourceRevision: number;
}

export interface IAgentHostCatalogProjection {
	readonly catalog: IAgentHostDatabaseSessionV2Projection;
	readonly source: IAgentHostCatalogSource;
	readonly sourcePayload: string;
}

export interface IAgentHostCatalogValidationError {
	readonly field: string;
	readonly message: string;
}

export type AgentHostCatalogValidationResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: IAgentHostCatalogValidationError };

class CatalogValidationError extends Error {
	constructor(readonly field: string, message: string) {
		super(message);
	}
}

const artifactTypes: ReadonlySet<string> = new Set(['pullRequest', 'issue', 'commit', 'website', 'file', 'resource']);
const titleSources: ReadonlySet<string> = new Set(['user', 'agent', 'auto']);
const chatKinds: ReadonlySet<string> = new Set(['default', 'peer']);

export function projectAgentHostCatalog(source: IAgentHostCatalogSource, options: IAgentHostCatalogProjectionOptions): AgentHostCatalogValidationResult<IAgentHostCatalogProjection> {
	return validate(() => {
		const normalizedSource = normalizeSource(source);
		const normalizedOptions = normalizeOptions(options);
		const sourcePayload = stableStringify({
			projectionVersion: AGENT_HOST_CATALOG_PROJECTION_VERSION,
			source: normalizedSource,
		});
		if (!sourcePayload) {
			fail('sourcePayload', 'Could not serialize the catalog source payload.');
		}
		assertByteLength('sourcePayload', sourcePayload, AGENT_HOST_CATALOG_SOURCE_PAYLOAD_BYTE_LIMIT);

		const sourceHash = createHash('sha256').update(sourcePayload, 'utf8').digest('hex');
		const chats: readonly IAgentHostDatabaseCatalogChat[] = normalizedSource.chats.map(chat => ({
			uri: chat.uri,
			order: chat.order,
			kind: chat.kind,
			title: chat.title,
			titleSource: chat.titleSource,
			originJson: stringifyStructuredField(`chats[${chat.order}].origin`, chat.origin),
		}));
		const catalog: IAgentHostDatabaseSessionV2Projection = {
			session: normalizedOptions.session,
			sessionGeneration: normalizedOptions.sessionGeneration,
			modifiedTime: normalizedSource.modifiedTime,
			title: normalizedSource.title,
			titleSource: normalizedSource.titleSource,
			isRead: normalizedSource.isRead,
			isArchived: normalizedSource.isArchived,
			projectUri: normalizedSource.project?.uri,
			projectDisplayName: normalizedSource.project?.displayName,
			workspaceless: normalizedSource.workspaceless,
			isChatBacking: normalizedSource.isChatBacking ?? false,
			ehcliAdoptable: normalizedSource.ehcliAdoptable,
			ehcliAdopted: normalizedSource.ehcliAdopted,
			multiRootJson: stringifyStructuredField('multiRoot', normalizedSource.multiRoot),
			folderPickerJson: stringifyStructuredField('folderPicker', normalizedSource.folderPicker),
			changesSummaryJson: stringifyStructuredField('changes', normalizedSource.changes),
			githubSummaryJson: stringifyStructuredField('github', normalizedSource.github),
			gitSummaryJson: stringifyStructuredField('git', normalizedSource.git),
			sourceControlSummaryJson: stringifyStructuredField('sourceControl', normalizedSource.sourceControl),
			artifactsJson: stringifyStructuredField('artifacts', normalizedSource.artifacts),
			orchestrationJson: stringifyStructuredField('orchestration', normalizedSource.orchestration),
			sourceRevision: normalizedOptions.sourceRevision,
			projectionVersion: AGENT_HOST_CATALOG_PROJECTION_VERSION,
			sourceHash,
			verified: true,
			workingDirectoriesJson: stringifyRequiredStructuredField('workingDirectories', normalizedSource.workingDirectories),
			chatsJson: stringifyRequiredStructuredField('chats', chats),
		};
		return { catalog, source: normalizedSource, sourcePayload };
	});
}

export function parseAgentHostCatalogSourcePayload(payload: string): AgentHostCatalogValidationResult<Pick<IAgentHostCatalogProjection, 'source' | 'sourcePayload'>> {
	return validate(() => {
		const parsed = parseJson('sourcePayload', payload, AGENT_HOST_CATALOG_SOURCE_PAYLOAD_BYTE_LIMIT);
		const raw = requirePlainObject('sourcePayload', parsed);
		requireExactKeys('sourcePayload', raw, ['projectionVersion', 'source']);
		if (raw['projectionVersion'] !== AGENT_HOST_CATALOG_PROJECTION_VERSION) {
			fail('sourcePayload.projectionVersion', `Expected projection version ${AGENT_HOST_CATALOG_PROJECTION_VERSION}.`);
		}
		const source = normalizeSource(raw['source']);
		const sourcePayload = stableStringify({
			projectionVersion: AGENT_HOST_CATALOG_PROJECTION_VERSION,
			source,
		});
		if (payload !== sourcePayload) {
			fail('sourcePayload', 'Catalog source payload is not canonical.');
		}
		return { source, sourcePayload };
	});
}

export function parseAgentHostDatabaseCatalog(catalog: IAgentHostDatabaseSessionV2Projection): AgentHostCatalogValidationResult<IAgentHostCatalogProjection> {
	return validate(() => {
		const source = sourceFromCatalog(catalog);
		const projected = unwrap(projectAgentHostCatalog(source, {
			session: catalog.session,
			sessionGeneration: catalog.sessionGeneration,
			sourceRevision: catalog.sourceRevision,
		}));
		requireCatalogEqual(catalog, projected.catalog);
		return projected;
	});
}

function sourceFromCatalog(catalog: IAgentHostDatabaseSessionV2Projection): IAgentHostCatalogSource {
	if (catalog.projectionVersion !== AGENT_HOST_CATALOG_PROJECTION_VERSION) {
		fail('projectionVersion', `Expected projection version ${AGENT_HOST_CATALOG_PROJECTION_VERSION}.`);
	}
	const project = catalog.projectUri === undefined && catalog.projectDisplayName === undefined
		? undefined
		: {
			uri: requireString('projectUri', catalog.projectUri, MAX_STRING_LENGTH),
			displayName: requireString('projectDisplayName', catalog.projectDisplayName, MAX_TITLE_LENGTH),
		};
	return {
		modifiedTime: catalog.modifiedTime,
		title: catalog.title,
		titleSource: catalog.titleSource,
		isRead: catalog.isRead,
		isArchived: catalog.isArchived,
		project,
		workspaceless: catalog.workspaceless,
		isChatBacking: catalog.isChatBacking,
		ehcliAdoptable: catalog.ehcliAdoptable ?? false,
		ehcliAdopted: catalog.ehcliAdopted ?? false,
		multiRoot: parseOptionalStructuredField('multiRootJson', catalog.multiRootJson),
		folderPicker: parseOptionalStructuredField('folderPickerJson', catalog.folderPickerJson),
		changes: parseOptionalStructuredField('changesSummaryJson', catalog.changesSummaryJson),
		github: parseOptionalStructuredField('githubSummaryJson', catalog.githubSummaryJson),
		git: parseOptionalStructuredField('gitSummaryJson', catalog.gitSummaryJson),
		sourceControl: parseOptionalStructuredField('sourceControlSummaryJson', catalog.sourceControlSummaryJson),
		artifacts: parseOptionalStructuredField('artifactsJson', catalog.artifactsJson),
		orchestration: parseOptionalStructuredField('orchestrationJson', catalog.orchestrationJson),
		workingDirectories: normalizeWorkingDirectories(parseJson('workingDirectoriesJson', catalog.workingDirectoriesJson)),
		chats: parseDatabaseChats(catalog.chatsJson).map(chat => {
			return {
				uri: chat.uri,
				order: chat.order,
				kind: chat.kind,
				title: chat.title,
				titleSource: chat.titleSource,
				origin: chat.origin,
			};
		}),
	};
}

function normalizeSource(value: unknown): IAgentHostCatalogSource {
	const raw = requirePlainObject('source', value);
	requireExactKeys('source', raw, [
		'modifiedTime', 'title', 'titleSource', 'isRead', 'isArchived', 'project', 'workspaceless', 'isChatBacking',
		'ehcliAdoptable', 'ehcliAdopted', 'multiRoot', 'folderPicker', 'changes', 'github', 'git', 'sourceControl', 'artifacts', 'orchestration',
		'workingDirectories', 'chats'
	]);
	const workingDirectories = normalizeWorkingDirectories(raw['workingDirectories']);
	const chats = normalizeChats(raw['chats']);
	return {
		modifiedTime: requireSafeInteger('modifiedTime', raw['modifiedTime'], 0),
		title: optionalString('title', raw['title'], MAX_TITLE_LENGTH),
		titleSource: optionalTitleSource('titleSource', raw['titleSource']),
		isRead: requireBoolean('isRead', raw['isRead']),
		isArchived: requireBoolean('isArchived', raw['isArchived']),
		project: normalizeProject(raw['project']),
		workspaceless: requireBoolean('workspaceless', raw['workspaceless']),
		isChatBacking: optionalBoolean('isChatBacking', raw['isChatBacking']) ?? false,
		ehcliAdoptable: optionalBoolean('ehcliAdoptable', raw['ehcliAdoptable']) ?? false,
		ehcliAdopted: optionalBoolean('ehcliAdopted', raw['ehcliAdopted']) ?? false,
		multiRoot: normalizeMultiRoot(raw['multiRoot']),
		folderPicker: normalizeFolderPicker(raw['folderPicker']),
		changes: normalizeChanges(raw['changes']),
		github: normalizeGitHub(raw['github']),
		git: normalizeGit(raw['git']),
		sourceControl: normalizeSourceControl(raw['sourceControl']),
		artifacts: normalizeArtifacts(raw['artifacts']),
		orchestration: normalizeOrchestration(raw['orchestration']),
		workingDirectories,
		chats,
	};
}

function normalizeOptions(value: IAgentHostCatalogProjectionOptions): IAgentHostCatalogProjectionOptions {
	const raw = requirePlainObject('options', value);
	requireExactKeys('options', raw, ['session', 'sessionGeneration', 'sourceRevision']);
	return {
		session: requireString('options.session', raw['session'], MAX_STRING_LENGTH),
		sessionGeneration: requireString('options.sessionGeneration', raw['sessionGeneration'], MAX_STRING_LENGTH),
		sourceRevision: requireSafeInteger('options.sourceRevision', raw['sourceRevision'], 0),
	};
}

function normalizeProject(value: unknown): IAgentHostCatalogProject | undefined {
	if (value === undefined) {
		return undefined;
	}
	const raw = requirePlainObject('project', value);
	requireExactKeys('project', raw, ['uri', 'displayName']);
	return {
		uri: requireString('project.uri', raw['uri'], MAX_STRING_LENGTH),
		displayName: requireString('project.displayName', raw['displayName'], MAX_TITLE_LENGTH),
	};
}

function normalizeMultiRoot(value: unknown): IAgentHostCatalogMultiRoot | undefined {
	if (value === undefined) {
		return undefined;
	}
	const raw = requirePlainObject('multiRoot', value);
	requireExactKeys('multiRoot', raw, ['workspaceFile']);
	return { workspaceFile: requireString('multiRoot.workspaceFile', raw['workspaceFile'], MAX_STRING_LENGTH) };
}

function normalizeFolderPicker(value: unknown): IAgentHostCatalogFolderPickerDecision | undefined {
	if (value === undefined) {
		return undefined;
	}
	const raw = requirePlainObject('folderPicker', value);
	requireExactKeys('folderPicker', raw, ['hidden', 'primary']);
	const hidden = requireBoolean('folderPicker.hidden', raw['hidden']);
	const primary = optionalString('folderPicker.primary', raw['primary'], MAX_STRING_LENGTH);
	if (primary !== undefined && !hidden) {
		fail('folderPicker.primary', 'A pinned primary directory requires hidden to be true.');
	}
	return primary === undefined ? { hidden } : { hidden, primary };
}

function normalizeChanges(value: unknown): IAgentHostCatalogChangesSummary | undefined {
	if (value === undefined) {
		return undefined;
	}
	const raw = requirePlainObject('changes', value);
	requireExactKeys('changes', raw, ['additions', 'deletions', 'files']);
	return {
		additions: optionalSafeInteger('changes.additions', raw['additions'], 0),
		deletions: optionalSafeInteger('changes.deletions', raw['deletions'], 0),
		files: optionalSafeInteger('changes.files', raw['files'], 0),
	};
}

function normalizeGitHub(value: unknown): IAgentHostCatalogGitHubSummary | undefined {
	if (value === undefined) {
		return undefined;
	}
	const raw = requirePlainObject('github', value);
	requireExactKeys('github', raw, [
		'owner', 'repo', 'pullRequestUrls', 'initialPullRequestUrls', 'associatedPullRequestUrls',
		'issueUrls', 'pullRequestBranchName'
	]);
	return {
		owner: optionalString('github.owner', raw['owner'], MAX_TITLE_LENGTH),
		repo: optionalString('github.repo', raw['repo'], MAX_TITLE_LENGTH),
		pullRequestUrls: normalizeGitHubReferences('github.pullRequestUrls', raw['pullRequestUrls']),
		initialPullRequestUrls: normalizeGitHubReferences('github.initialPullRequestUrls', raw['initialPullRequestUrls']),
		associatedPullRequestUrls: normalizeGitHubReferences('github.associatedPullRequestUrls', raw['associatedPullRequestUrls']),
		issueUrls: normalizeGitHubReferences('github.issueUrls', raw['issueUrls']),
		pullRequestBranchName: optionalString('github.pullRequestBranchName', raw['pullRequestBranchName'], MAX_TITLE_LENGTH),
	};
}

function normalizeGit(value: unknown): IAgentHostCatalogGitSummary | undefined {
	if (value === undefined) {
		return undefined;
	}
	const raw = requirePlainObject('git', value);
	requireExactKeys('git', raw, [
		'hasGitHubRemote', 'branchName', 'baseBranchName', 'upstreamBranchName', 'incomingChanges',
		'outgoingChanges', 'uncommittedChanges', 'hasBaseBranchChanges', 'githubOwner', 'githubHeadOwner',
		'githubRepo'
	]);
	const hasGitHubRemote = optionalBoolean('git.hasGitHubRemote', raw['hasGitHubRemote']);
	const branchName = optionalString('git.branchName', raw['branchName'], MAX_TITLE_LENGTH);
	const baseBranchName = optionalString('git.baseBranchName', raw['baseBranchName'], MAX_TITLE_LENGTH);
	const upstreamBranchName = optionalString('git.upstreamBranchName', raw['upstreamBranchName'], MAX_TITLE_LENGTH);
	const incomingChanges = optionalSafeInteger('git.incomingChanges', raw['incomingChanges'], 0);
	const outgoingChanges = optionalSafeInteger('git.outgoingChanges', raw['outgoingChanges'], 0);
	const uncommittedChanges = optionalSafeInteger('git.uncommittedChanges', raw['uncommittedChanges'], 0);
	const hasBaseBranchChanges = optionalBoolean('git.hasBaseBranchChanges', raw['hasBaseBranchChanges']);
	const githubOwner = optionalString('git.githubOwner', raw['githubOwner'], MAX_TITLE_LENGTH);
	const githubHeadOwner = optionalString('git.githubHeadOwner', raw['githubHeadOwner'], MAX_TITLE_LENGTH);
	const githubRepo = optionalString('git.githubRepo', raw['githubRepo'], MAX_TITLE_LENGTH);
	return {
		...(hasGitHubRemote === undefined ? {} : { hasGitHubRemote }),
		...(branchName === undefined ? {} : { branchName }),
		...(baseBranchName === undefined ? {} : { baseBranchName }),
		...(upstreamBranchName === undefined ? {} : { upstreamBranchName }),
		...(incomingChanges === undefined ? {} : { incomingChanges }),
		...(outgoingChanges === undefined ? {} : { outgoingChanges }),
		...(uncommittedChanges === undefined ? {} : { uncommittedChanges }),
		...(hasBaseBranchChanges === undefined ? {} : { hasBaseBranchChanges }),
		...(githubOwner === undefined ? {} : { githubOwner }),
		...(githubHeadOwner === undefined ? {} : { githubHeadOwner }),
		...(githubRepo === undefined ? {} : { githubRepo }),
	};
}

function normalizeGitHubReferences(field: string, value: unknown): readonly string[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value)) {
		fail(field, 'Expected an array.');
	}
	const seen = new Set<string>();
	const result: string[] = [];
	for (let index = 0; index < value.length && result.length < AGENT_HOST_CATALOG_GITHUB_REFERENCE_LIMIT; index++) {
		const reference = requireString(`${field}[${index}]`, value[index], MAX_STRING_LENGTH);
		const comparisonKey = reference.toLowerCase();
		if (!seen.has(comparisonKey)) {
			seen.add(comparisonKey);
			result.push(reference);
		}
	}
	return result;
}

function normalizeSourceControl(value: unknown): IAgentHostCatalogSourceControlSummary | undefined {
	if (value === undefined) {
		return undefined;
	}
	const raw = requirePlainObject('sourceControl', value);
	requireExactKeys('sourceControl', raw, ['merge', 'latestOutcome']);
	let merge: IAgentHostCatalogSourceControlSummary['merge'];
	if (raw['merge'] !== undefined) {
		const rawMerge = requirePlainObject('sourceControl.merge', raw['merge']);
		requireExactKeys('sourceControl.merge', rawMerge, ['commit']);
		merge = { commit: requireString('sourceControl.merge.commit', rawMerge['commit'], MAX_STRING_LENGTH) };
	}
	const latestOutcome = raw['latestOutcome'];
	if (latestOutcome !== undefined && latestOutcome !== 'merge' && latestOutcome !== 'pullRequest') {
		fail('sourceControl.latestOutcome', 'Expected merge or pullRequest.');
	}
	if (latestOutcome === 'merge' && merge === undefined) {
		fail('sourceControl.merge', 'A merge outcome requires a commit.');
	}
	return { merge, latestOutcome };
}

function normalizeArtifacts(value: unknown): readonly IAgentHostCatalogArtifact[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value)) {
		fail('artifacts', 'Expected an array.');
	}
	const ids = new Set<string>();
	const retainedArtifacts = value.slice(-AGENT_HOST_CATALOG_ARTIFACT_LIMIT);
	const retainedOffset = value.length - retainedArtifacts.length;
	return retainedArtifacts.map((entry, retainedIndex) => {
		const index = retainedOffset + retainedIndex;
		const field = `artifacts[${index}]`;
		const raw = requirePlainObject(field, entry);
		requireExactKeys(field, raw, ['id', 'type', 'label', 'link', 'uri', 'commitHash', 'isGitHub', 'createdByThisSession']);
		const id = requireString(`${field}.id`, raw['id'], MAX_STRING_LENGTH);
		if (ids.has(id)) {
			fail(`${field}.id`, `Duplicate artifact id '${id}'.`);
		}
		ids.add(id);
		const type = raw['type'];
		if (typeof type !== 'string' || !artifactTypes.has(type)) {
			fail(`${field}.type`, 'Unsupported artifact type.');
		}
		return {
			id,
			type: type as AgentHostCatalogArtifactType,
			label: requireString(`${field}.label`, raw['label'], MAX_TITLE_LENGTH),
			link: optionalString(`${field}.link`, raw['link'], MAX_STRING_LENGTH),
			uri: optionalString(`${field}.uri`, raw['uri'], MAX_STRING_LENGTH),
			commitHash: optionalString(`${field}.commitHash`, raw['commitHash'], MAX_STRING_LENGTH),
			isGitHub: optionalBoolean(`${field}.isGitHub`, raw['isGitHub']),
			createdByThisSession: optionalBoolean(`${field}.createdByThisSession`, raw['createdByThisSession']),
		};
	});
}

function normalizeOrchestration(value: unknown): IAgentHostCatalogOrchestration | undefined {
	if (value === undefined) {
		return undefined;
	}
	const raw = requirePlainObject('orchestration', value);
	requireExactKeys('orchestration', raw, [
		'parentSession', 'creatorSession', 'label', 'coordinateWithCreator', 'notifyOnIdle', 'creatorNotificationState'
	]);
	const notifyOnIdle = raw['notifyOnIdle'];
	if (notifyOnIdle !== undefined && notifyOnIdle !== 'once' && notifyOnIdle !== 'always') {
		fail('orchestration.notifyOnIdle', 'Expected once or always.');
	}
	const creatorNotificationState = raw['creatorNotificationState'];
	if (creatorNotificationState !== undefined && creatorNotificationState !== 'waitingForCompletion' && creatorNotificationState !== 'notified') {
		fail('orchestration.creatorNotificationState', 'Unsupported creator notification state.');
	}
	return {
		parentSession: requireString('orchestration.parentSession', raw['parentSession'], MAX_STRING_LENGTH),
		creatorSession: requireString('orchestration.creatorSession', raw['creatorSession'], MAX_STRING_LENGTH),
		label: optionalString('orchestration.label', raw['label'], MAX_TITLE_LENGTH),
		coordinateWithCreator: requireBoolean('orchestration.coordinateWithCreator', raw['coordinateWithCreator']),
		notifyOnIdle,
		creatorNotificationState,
	};
}

function normalizeWorkingDirectories(value: unknown): readonly string[] {
	if (!Array.isArray(value)) {
		fail('workingDirectories', 'Expected an array.');
	}
	if (value.length > AGENT_HOST_CATALOG_CHILD_LIMIT) {
		fail('workingDirectories', `Expected at most ${AGENT_HOST_CATALOG_CHILD_LIMIT} entries.`);
	}
	const seen = new Set<string>();
	return value.map((entry, index) => {
		const directory = requireString(`workingDirectories[${index}]`, entry, MAX_STRING_LENGTH);
		if (seen.has(directory)) {
			fail(`workingDirectories[${index}]`, `Duplicate working directory '${directory}'.`);
		}
		seen.add(directory);
		return directory;
	});
}

function normalizeChats(value: unknown): readonly IAgentHostCatalogSourceChat[] {
	if (!Array.isArray(value)) {
		fail('chats', 'Expected an array.');
	}
	if (value.length > AGENT_HOST_CATALOG_CHILD_LIMIT) {
		fail('chats', `Expected at most ${AGENT_HOST_CATALOG_CHILD_LIMIT} entries.`);
	}
	const uris = new Set<string>();
	const orders = new Set<number>();
	const chats = value.map((entry, index) => {
		const field = `chats[${index}]`;
		const raw = requirePlainObject(field, entry);
		requireExactKeys(field, raw, ['uri', 'order', 'kind', 'title', 'titleSource', 'origin']);
		const uri = requireString(`${field}.uri`, raw['uri'], MAX_STRING_LENGTH);
		const order = requireSafeInteger(`${field}.order`, raw['order'], 0);
		if (uris.has(uri)) {
			fail(`${field}.uri`, `Duplicate chat URI '${uri}'.`);
		}
		if (orders.has(order)) {
			fail(`${field}.order`, `Duplicate chat order '${order}'.`);
		}
		uris.add(uri);
		orders.add(order);
		const kind = raw['kind'];
		if (typeof kind !== 'string' || !chatKinds.has(kind)) {
			fail(`${field}.kind`, 'Unsupported chat kind.');
		}
		const origin = raw['origin'] === undefined ? undefined : normalizeJsonValue(`${field}.origin`, raw['origin']);
		return {
			uri,
			order,
			kind: kind as AgentHostCatalogChatKind,
			title: optionalString(`${field}.title`, raw['title'], MAX_TITLE_LENGTH),
			titleSource: optionalTitleSource(`${field}.titleSource`, raw['titleSource']),
			origin,
		};
	}).sort((a, b) => a.order - b.order);
	for (let index = 0; index < chats.length; index++) {
		if (chats[index].order !== index) {
			fail(`chats[${index}].order`, 'Chat orders must form a contiguous zero-based sequence.');
		}
	}
	return chats;
}

function parseDatabaseChats(value: string): readonly IAgentHostCatalogSourceChat[] {
	const parsed = parseJson('chatsJson', value);
	if (!Array.isArray(parsed)) {
		fail('chatsJson', 'Expected an array.');
	}
	const sourceChats = parsed.map((entry, index) => {
		const field = `chatsJson[${index}]`;
		const raw = requirePlainObject(field, entry);
		requireExactKeys(field, raw, ['uri', 'order', 'kind', 'title', 'titleSource', 'originJson']);
		const originJson = raw['originJson'];
		if (originJson !== undefined && typeof originJson !== 'string') {
			fail(`${field}.originJson`, 'Expected a JSON string.');
		}
		return {
			uri: raw['uri'],
			order: raw['order'],
			kind: raw['kind'],
			title: raw['title'],
			titleSource: raw['titleSource'],
			origin: originJson === undefined ? undefined : parseJson(`${field}.originJson`, originJson),
		};
	});
	return normalizeChats(sourceChats);
}

function normalizeJsonValue(field: string, value: unknown): AgentHostCatalogJsonValue {
	let entries = 0;
	const ancestors = new Set<object>();
	const visit = (currentField: string, current: unknown, depth: number): AgentHostCatalogJsonValue => {
		if (depth > MAX_JSON_DEPTH) {
			fail(currentField, `JSON nesting exceeds ${MAX_JSON_DEPTH} levels.`);
		}
		if (current === null || typeof current === 'boolean' || typeof current === 'string') {
			if (typeof current === 'string' && current.length > MAX_STRING_LENGTH) {
				fail(currentField, `String exceeds ${MAX_STRING_LENGTH} characters.`);
			}
			return current;
		}
		if (typeof current === 'number') {
			if (!Number.isFinite(current)) {
				fail(currentField, 'Expected a finite JSON number.');
			}
			return current;
		}
		if (typeof current !== 'object') {
			fail(currentField, 'Expected a JSON-serializable value.');
		}
		if (ancestors.has(current)) {
			fail(currentField, 'Circular JSON values are not supported.');
		}
		ancestors.add(current);
		let result: AgentHostCatalogJsonValue;
		if (Array.isArray(current)) {
			entries += current.length;
			checkJsonEntryLimit(field, entries);
			result = current.map((entry, index) => visit(`${currentField}[${index}]`, entry, depth + 1));
		} else {
			const raw = requirePlainObject(currentField, current);
			const keys = Object.keys(raw).sort();
			entries += keys.length;
			checkJsonEntryLimit(field, entries);
			const normalized: { [key: string]: AgentHostCatalogJsonValue } = {};
			for (const key of keys) {
				if (key.length > MAX_STRING_LENGTH) {
					fail(currentField, `JSON key exceeds ${MAX_STRING_LENGTH} characters.`);
				}
				normalized[key] = visit(`${currentField}.${key}`, raw[key], depth + 1);
			}
			result = normalized;
		}
		ancestors.delete(current);
		return result;
	};
	const normalized = visit(field, value, 0);
	assertStructuredFieldSize(field, stableStringify(normalized));
	return normalized;
}

function parseOptionalStructuredField<T>(field: string, value: string | undefined): T | undefined {
	return value === undefined ? undefined : parseJson(field, value) as T;
}

function stringifyStructuredField(field: string, value: AgentHostCatalogJsonValue | object | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	const result = stableStringify(value);
	assertStructuredFieldSize(field, result);
	return result;
}

function stringifyRequiredStructuredField(field: string, value: AgentHostCatalogJsonValue | object): string {
	const result = stringifyStructuredField(field, value);
	if (result === undefined) {
		fail(field, 'Could not serialize the structured field.');
	}
	return result;
}

function assertStructuredFieldSize(field: string, value: string): void {
	if (!value) {
		fail(field, 'Could not serialize the structured field.');
	}
	assertByteLength(field, value, AGENT_HOST_CATALOG_STRUCTURED_FIELD_BYTE_LIMIT);
}

function parseJson(field: string, value: string, maximumBytes = AGENT_HOST_CATALOG_STRUCTURED_FIELD_BYTE_LIMIT): unknown {
	assertByteLength(field, value, maximumBytes);
	try {
		return JSON.parse(value);
	} catch (error) {
		fail(field, error instanceof Error ? error.message : 'Malformed JSON.');
	}
}

function assertByteLength(field: string, value: string, maximumBytes: number): void {
	if (Buffer.byteLength(value, 'utf8') > maximumBytes) {
		fail(field, `Serialized value exceeds ${maximumBytes} bytes.`);
	}
}

function requireCatalogEqual(actual: IAgentHostDatabaseSessionV2Projection, expected: IAgentHostDatabaseSessionV2Projection): void {
	const scalarFields: ReadonlyArray<keyof IAgentHostDatabaseSessionV2Projection> = [
		'session', 'sessionGeneration', 'modifiedTime', 'title', 'titleSource', 'isRead', 'isArchived',
		'projectUri', 'projectDisplayName', 'workspaceless', 'isChatBacking', 'ehcliAdoptable', 'ehcliAdopted', 'multiRootJson', 'folderPickerJson', 'changesSummaryJson',
		'githubSummaryJson', 'gitSummaryJson', 'sourceControlSummaryJson', 'artifactsJson', 'orchestrationJson', 'sourceRevision',
		'projectionVersion', 'sourceHash', 'verified', 'workingDirectoriesJson', 'chatsJson'
	];
	for (const field of scalarFields) {
		if (actual[field] !== expected[field]) {
			fail(field, 'Catalog field is not canonical or does not match its source hash.');
		}
	}
}

function requirePlainObject(field: string, value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
		fail(field, 'Expected a plain object.');
	}
	return value as Record<string, unknown>;
}

function requireExactKeys(field: string, value: Record<string, unknown>, allowedKeys: readonly string[]): void {
	const allowed = new Set(allowedKeys);
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) {
			fail(`${field}.${key}`, 'Unexpected field.');
		}
	}
}

function requireString(field: string, value: unknown, maximumLength: number): string {
	if (typeof value !== 'string' || value.length === 0) {
		fail(field, 'Expected a non-empty string.');
	}
	if (value.length > maximumLength) {
		fail(field, `String exceeds ${maximumLength} characters.`);
	}
	return value;
}

function optionalString(field: string, value: unknown, maximumLength: number): string | undefined {
	return value === undefined ? undefined : requireString(field, value, maximumLength);
}

function requireBoolean(field: string, value: unknown): boolean {
	if (typeof value !== 'boolean') {
		fail(field, 'Expected a boolean.');
	}
	return value;
}

function optionalBoolean(field: string, value: unknown): boolean | undefined {
	return value === undefined ? undefined : requireBoolean(field, value);
}

function requireSafeInteger(field: string, value: unknown, minimum: number): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
		fail(field, `Expected a safe integer greater than or equal to ${minimum}.`);
	}
	return value;
}

function optionalSafeInteger(field: string, value: unknown, minimum: number): number | undefined {
	return value === undefined ? undefined : requireSafeInteger(field, value, minimum);
}

function optionalTitleSource(field: string, value: unknown): AgentHostCatalogTitleSource | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== 'string' || !titleSources.has(value)) {
		fail(field, 'Unsupported title source.');
	}
	return value as AgentHostCatalogTitleSource;
}

function checkJsonEntryLimit(field: string, entries: number): void {
	if (entries > MAX_JSON_ENTRIES) {
		fail(field, `JSON value exceeds ${MAX_JSON_ENTRIES} entries.`);
	}
}

function unwrap<T>(result: AgentHostCatalogValidationResult<T>): T {
	if (!result.ok) {
		throw new CatalogValidationError(result.error.field, result.error.message);
	}
	return result.value;
}

function validate<T>(callback: () => T): AgentHostCatalogValidationResult<T> {
	try {
		return { ok: true, value: callback() };
	} catch (error) {
		if (error instanceof CatalogValidationError) {
			return { ok: false, error: { field: error.field, message: error.message } };
		}
		throw error;
	}
}

function fail(field: string, message: string): never {
	throw new CatalogValidationError(field, message);
}
