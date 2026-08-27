/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { IJSONSchema } from '../../../base/common/jsonSchema.js';
import { stableStringify } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { IValidator, ValidationError, ValidatorBase, ValidatorType, vArray, vBoolean, vEnum, vObj, vOptionalProp } from '../../../base/common/validation.js';
import { SESSION_META_ARTIFACTS_KEY } from '../common/sessionArtifacts.js';
import { SESSION_META_CREATED_BY_SESSION_KEY, SESSION_META_EHCLI_ADOPTABLE_KEY, SESSION_META_EHCLI_ADOPTED_KEY, SESSION_META_FOLDER_PICKER_KEY, SESSION_META_GIT_KEY, SESSION_META_GITHUB_KEY, SESSION_META_MULTI_ROOT_KEY, SESSION_META_SOURCE_CONTROL_KEY, SESSION_META_WORKSPACELESS_KEY } from '../common/state/sessionState.js';

export const AGENT_HOST_CATALOG_PAYLOAD_VERSION = 1;
export const AGENT_HOST_CATALOG_GITHUB_REFERENCE_LIMIT = 10;
export const AGENT_HOST_CATALOG_ARTIFACT_LIMIT = 100;
export const AGENT_HOST_CATALOG_CHILD_LIMIT = 1000;
export const AGENT_HOST_CATALOG_PAYLOAD_BYTE_LIMIT = 4 * 1024 * 1024;

const MAX_STRING_LENGTH = 4096;
const MAX_TITLE_LENGTH = 1024;
const MAX_JSON_DEPTH = 20;
const MAX_JSON_ENTRIES = 2000;

class RefinedValidator<T> extends ValidatorBase<T> {
	constructor(
		private readonly validator: IValidator<T>,
		private readonly refine: (value: T, original: unknown) => T | ValidationError,
	) {
		super();
	}

	validate(content: unknown): { content: T; error: undefined } | { content: undefined; error: ValidationError } {
		const result = this.validator.validate(content);
		if (result.error) {
			return result;
		}
		const refined = this.refine(result.content, content);
		return isRefinementError(refined)
			? { content: undefined, error: refined }
			: { content: refined, error: undefined };
	}

	getJSONSchema(): IJSONSchema {
		return this.validator.getJSONSchema();
	}
}

class StringValidator extends ValidatorBase<string> {
	constructor(
		private readonly maximumLength: number,
		private readonly uri: boolean,
	) {
		super();
	}

	validate(content: unknown): { content: string; error: undefined } | { content: undefined; error: ValidationError } {
		if (typeof content !== 'string' || content.length === 0) {
			return { content: undefined, error: { message: 'Expected a non-empty string.' } };
		}
		if (content.length > this.maximumLength) {
			return { content: undefined, error: { message: `String exceeds ${this.maximumLength} characters.` } };
		}
		if (this.uri) {
			try {
				if (!URI.parse(content, true).scheme) {
					return { content: undefined, error: { message: 'Expected a URI with a scheme.' } };
				}
			} catch (error) {
				return { content: undefined, error: { message: error instanceof Error ? error.message : 'Expected a valid URI.' } };
			}
		}
		return { content, error: undefined };
	}

	getJSONSchema(): IJSONSchema {
		return { type: 'string', minLength: 1, maxLength: this.maximumLength };
	}
}

class SafeIntegerValidator extends ValidatorBase<number> {
	validate(content: unknown): { content: number; error: undefined } | { content: undefined; error: ValidationError } {
		return typeof content === 'number' && Number.isSafeInteger(content) && content >= 0
			? { content, error: undefined }
			: { content: undefined, error: { message: 'Expected a non-negative safe integer.' } };
	}

	getJSONSchema(): IJSONSchema {
		return { type: 'integer', minimum: 0 };
	}
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Forward-compatible JSON accepted for payload fields whose shape the catalog does not own. */
export type AgentHostCatalogJsonValue = JsonValue;

class JsonValueValidator extends ValidatorBase<JsonValue> {
	validate(content: unknown): { content: JsonValue; error: undefined } | { content: undefined; error: ValidationError } {
		let entries = 0;
		const ancestors = new Set<object>();
		const visit = (value: unknown, depth: number): { value: JsonValue; error?: undefined } | { value?: undefined; error: ValidationError } => {
			if (depth > MAX_JSON_DEPTH) {
				return { error: { message: `JSON nesting exceeds ${MAX_JSON_DEPTH} levels.` } };
			}
			if (value === null || typeof value === 'boolean') {
				return { value };
			}
			if (typeof value === 'string') {
				return value.length <= MAX_STRING_LENGTH
					? { value }
					: { error: { message: `String exceeds ${MAX_STRING_LENGTH} characters.` } };
			}
			if (typeof value === 'number') {
				return Number.isFinite(value)
					? { value }
					: { error: { message: 'Expected a finite JSON number.' } };
			}
			if (typeof value !== 'object' || ancestors.has(value)) {
				return { error: { message: 'Expected a non-circular JSON value.' } };
			}
			ancestors.add(value);
			if (Array.isArray(value)) {
				entries += value.length;
				if (entries > MAX_JSON_ENTRIES) {
					return { error: { message: `JSON value exceeds ${MAX_JSON_ENTRIES} entries.` } };
				}
				const result: JsonValue[] = [];
				for (const entry of value) {
					const parsed = visit(entry, depth + 1);
					if (parsed.error) {
						return parsed;
					}
					result.push(parsed.value);
				}
				ancestors.delete(value);
				return { value: result };
			}
			if (Object.getPrototypeOf(value) !== Object.prototype) {
				return { error: { message: 'Expected a plain JSON object.' } };
			}
			const keys = Object.keys(value).sort();
			entries += keys.length;
			if (entries > MAX_JSON_ENTRIES) {
				return { error: { message: `JSON value exceeds ${MAX_JSON_ENTRIES} entries.` } };
			}
			const result: { [key: string]: JsonValue } = {};
			for (const key of keys) {
				if (key.length > MAX_STRING_LENGTH) {
					return { error: { message: `JSON key exceeds ${MAX_STRING_LENGTH} characters.` } };
				}
				const parsed = visit((value as Record<string, unknown>)[key], depth + 1);
				if (parsed.error) {
					return parsed;
				}
				result[key] = parsed.value;
			}
			ancestors.delete(value);
			return { value: result };
		};
		const result = visit(content, 0);
		return result.error
			? { content: undefined, error: result.error }
			: { content: result.value, error: undefined };
	}

	getJSONSchema(): IJSONSchema {
		return {};
	}
}

const boundedString = (maximumLength = MAX_STRING_LENGTH) => new StringValidator(maximumLength, false);
const uriString = () => new StringValidator(MAX_STRING_LENGTH, true);
const safeInteger = () => new SafeIntegerValidator();
const jsonValue = () => new JsonValueValidator();

function boundedArray<T>(validator: IValidator<T>, maximumLength: number): ValidatorBase<readonly T[]> {
	return new RefinedValidator<readonly T[]>(vArray(validator), value => value.length <= maximumLength
		? value
		: { message: `Expected at most ${maximumLength} entries.` });
}

function plainObject<T>(validator: IValidator<T>): ValidatorBase<T> {
	return new RefinedValidator(validator, (value, original) =>
		typeof original === 'object' && original !== null && !Array.isArray(original) && Object.getPrototypeOf(original) === Object.prototype
			? value
			: { message: 'Expected a plain object.' });
}

const changesValidator = plainObject(vObj({
	additions: vOptionalProp(safeInteger()),
	deletions: vOptionalProp(safeInteger()),
	files: vOptionalProp(safeInteger()),
}));

const projectValidator = plainObject(vObj({
	uri: uriString(),
	displayName: boundedString(MAX_TITLE_LENGTH),
}));

const multiRootValidator = plainObject(vObj({
	workspaceFile: uriString(),
}));

const folderPickerValidator = new RefinedValidator(plainObject(vObj({
	hidden: vBoolean(),
	primary: vOptionalProp(uriString()),
})), value => value.primary !== undefined && !value.hidden
	? { message: 'A pinned primary directory requires hidden to be true.' }
	: value);

const githubReferencesValidator = boundedArray(uriString(), AGENT_HOST_CATALOG_GITHUB_REFERENCE_LIMIT);
const githubValidator = plainObject(vObj({
	owner: vOptionalProp(boundedString(MAX_TITLE_LENGTH)),
	repo: vOptionalProp(boundedString(MAX_TITLE_LENGTH)),
	pullRequestUrls: vOptionalProp(githubReferencesValidator),
	initialPullRequestUrls: vOptionalProp(githubReferencesValidator),
	associatedPullRequestUrls: vOptionalProp(githubReferencesValidator),
	issueUrls: vOptionalProp(githubReferencesValidator),
	pullRequestBranchName: vOptionalProp(boundedString(MAX_TITLE_LENGTH)),
}));

const gitValidator = plainObject(vObj({
	hasGitHubRemote: vOptionalProp(vBoolean()),
	branchName: vOptionalProp(boundedString(MAX_TITLE_LENGTH)),
	isDetachedHead: vOptionalProp(vBoolean()),
	baseBranchName: vOptionalProp(boundedString(MAX_TITLE_LENGTH)),
	upstreamBranchName: vOptionalProp(boundedString(MAX_TITLE_LENGTH)),
	incomingChanges: vOptionalProp(safeInteger()),
	outgoingChanges: vOptionalProp(safeInteger()),
	uncommittedChanges: vOptionalProp(safeInteger()),
	hasBaseBranchChanges: vOptionalProp(vBoolean()),
	githubOwner: vOptionalProp(boundedString(MAX_TITLE_LENGTH)),
	githubHeadOwner: vOptionalProp(boundedString(MAX_TITLE_LENGTH)),
	githubRepo: vOptionalProp(boundedString(MAX_TITLE_LENGTH)),
}));

/** Exposed so persisted git metadata is parsed by the payload authority instead of a private copy. */
export const agentHostCatalogGitValidator: IValidator<ValidatorType<typeof gitValidator>> = gitValidator;

const sourceControlValidator = new RefinedValidator(plainObject(vObj({
	merge: vOptionalProp(plainObject(vObj({ commit: boundedString() }))),
	latestOutcome: vOptionalProp(vEnum('merge', 'pullRequest')),
})), value => value.latestOutcome === 'merge' && value.merge === undefined
	? { message: 'A merge outcome requires a commit.' }
	: value);

const artifactValidator = plainObject(vObj({
	id: boundedString(),
	type: vEnum('pullRequest', 'issue', 'commit', 'website', 'file', 'resource'),
	label: boundedString(MAX_TITLE_LENGTH),
	isArtifact: vOptionalProp(vBoolean()),
	link: vOptionalProp(boundedString()),
	uri: vOptionalProp(boundedString()),
	commitHash: vOptionalProp(boundedString()),
	isGitHub: vOptionalProp(vBoolean()),
}));

const artifactsValidator = new RefinedValidator(
	vArray(artifactValidator),
	value => {
		const retained = value.slice(-AGENT_HOST_CATALOG_ARTIFACT_LIMIT);
		return hasUniqueValues(retained, artifact => artifact.id) ? retained : { message: 'Artifact ids must be unique.' };
	},
);

const creationReferenceValidator = plainObject(vObj({
	session: uriString(),
	chat: vOptionalProp(uriString()),
	turnId: vOptionalProp(boundedString()),
}));

/**
 * The session's `_meta` bag, validated slot by slot under the same well-known
 * keys `sessionState.ts` uses, so readers such as `readSessionGitState` accept
 * it as-is. Unknown keys are stripped.
 */
const metadataValidator = plainObject(vObj({
	[SESSION_META_MULTI_ROOT_KEY]: vOptionalProp(multiRootValidator),
	[SESSION_META_FOLDER_PICKER_KEY]: vOptionalProp(folderPickerValidator),
	[SESSION_META_GITHUB_KEY]: vOptionalProp(githubValidator),
	[SESSION_META_GIT_KEY]: vOptionalProp(gitValidator),
	[SESSION_META_SOURCE_CONTROL_KEY]: vOptionalProp(sourceControlValidator),
	[SESSION_META_ARTIFACTS_KEY]: vOptionalProp(artifactsValidator),
	[SESSION_META_CREATED_BY_SESSION_KEY]: vOptionalProp(creationReferenceValidator),
	[SESSION_META_WORKSPACELESS_KEY]: vOptionalProp(vBoolean()),
	[SESSION_META_EHCLI_ADOPTABLE_KEY]: vOptionalProp(vBoolean()),
	[SESSION_META_EHCLI_ADOPTED_KEY]: vOptionalProp(vBoolean()),
}));

const chatValidator = plainObject(vObj({
	uri: uriString(),
	order: safeInteger(),
	kind: vEnum('default', 'peer'),
	summary: vOptionalProp(boundedString(MAX_TITLE_LENGTH)),
	titleSource: vOptionalProp(vEnum('user', 'agent', 'auto')),
	origin: vOptionalProp(jsonValue()),
}));

const chatsValidator = new RefinedValidator(
	boundedArray(chatValidator, AGENT_HOST_CATALOG_CHILD_LIMIT),
	value => {
		const sorted = value.slice().sort((a, b) => a.order - b.order);
		if (!hasUniqueValues(sorted, chat => chat.uri)) {
			return { message: 'Chat URIs must be unique.' };
		}
		if (sorted.some((chat, index) => chat.order !== index)) {
			return { message: 'Chat orders must form a contiguous zero-based sequence.' };
		}
		return sorted;
	},
);

const workingDirectoriesValidator = new RefinedValidator(
	boundedArray(uriString(), AGENT_HOST_CATALOG_CHILD_LIMIT),
	value => hasUniqueValues(value, directory => directory) ? value : { message: 'Working directories must be unique.' },
);

export const agentHostCatalogDataValidator = plainObject(vObj({
	modifiedTime: safeInteger(),
	summary: vOptionalProp(boundedString(MAX_TITLE_LENGTH)),
	titleSource: vOptionalProp(vEnum('user', 'agent', 'auto')),
	isRead: vBoolean(),
	isArchived: vBoolean(),
	project: vOptionalProp(projectValidator),
	isChatBacking: vOptionalProp(vBoolean()),
	workingDirectories: workingDirectoriesValidator,
	changes: vOptionalProp(changesValidator),
	_meta: vOptionalProp(metadataValidator),
	chats: chatsValidator,
}));

const payloadValidator = plainObject(vObj({
	payloadVersion: safeInteger(),
	data: agentHostCatalogDataValidator,
}));

export type AgentHostCatalogData = ValidatorType<typeof agentHostCatalogDataValidator>;
export type AgentHostCatalogChat = AgentHostCatalogData['chats'][number];
export type AgentHostCatalogMetadata = NonNullable<AgentHostCatalogData['_meta']>;

export type AgentHostCatalogRevivedData = Omit<AgentHostCatalogData, 'project' | 'workingDirectories' | 'chats'> & {
	readonly project?: Omit<NonNullable<AgentHostCatalogData['project']>, 'uri'> & { readonly uri: URI };
	readonly workingDirectories: readonly URI[];
	readonly chats: ReadonlyArray<Omit<AgentHostCatalogChat, 'uri'> & { readonly uri: URI }>;
};

export interface IAgentHostCatalogDecodedPayload {
	readonly data: AgentHostCatalogData;
	/** Canonical serialization of {@link data}; equal for every input that validates to the same data. */
	readonly payload: string;
}

export interface IAgentHostCatalogEncodedPayload extends IAgentHostCatalogDecodedPayload {
	readonly payloadHash: string;
}

export type AgentHostCatalogPayloadResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly reason: 'invalid' | 'outdated'; readonly error: string };

/**
 * Validates `data` and returns its canonical payload plus content hash. The result carries no
 * database identity: callers own session, generation and revision.
 */
export function encodeAgentHostCatalogPayload(data: AgentHostCatalogData): AgentHostCatalogPayloadResult<IAgentHostCatalogEncodedPayload> {
	const normalized = agentHostCatalogDataValidator.validate(data);
	if (normalized.error) {
		return invalidPayload(normalized.error.message);
	}
	const payload = stableStringify({
		payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION,
		data: normalized.content,
	});
	if (Buffer.byteLength(payload, 'utf8') > AGENT_HOST_CATALOG_PAYLOAD_BYTE_LIMIT) {
		return invalidPayload(`Payload exceeds ${AGENT_HOST_CATALOG_PAYLOAD_BYTE_LIMIT} bytes.`);
	}
	return {
		ok: true,
		value: {
			data: normalized.content,
			payload,
			payloadHash: hashAgentHostCatalogPayload(payload),
		},
	};
}

/** Validates a stored payload and returns its canonical form without hashing it. */
export function decodeAgentHostCatalogPayload(payload: string): AgentHostCatalogPayloadResult<IAgentHostCatalogDecodedPayload> {
	if (Buffer.byteLength(payload, 'utf8') > AGENT_HOST_CATALOG_PAYLOAD_BYTE_LIMIT) {
		return invalidPayload(`Payload exceeds ${AGENT_HOST_CATALOG_PAYLOAD_BYTE_LIMIT} bytes.`);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(payload);
	} catch (error) {
		return invalidPayload(error instanceof Error ? error.message : 'Malformed JSON.');
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		return invalidPayload('Expected a payload object.');
	}
	const payloadVersion = (parsed as Record<string, unknown>)['payloadVersion'];
	if (typeof payloadVersion !== 'number' || !Number.isSafeInteger(payloadVersion) || payloadVersion < 0) {
		return invalidPayload('Expected a non-negative safe integer payloadVersion.');
	}
	if (payloadVersion !== AGENT_HOST_CATALOG_PAYLOAD_VERSION) {
		return { ok: false, reason: 'outdated', error: `Expected payload version ${AGENT_HOST_CATALOG_PAYLOAD_VERSION}, but got ${payloadVersion}.` };
	}
	const result = payloadValidator.validate(parsed);
	if (result.error) {
		return invalidPayload(result.error.message);
	}
	return {
		ok: true,
		value: {
			data: result.content.data,
			payload: stableStringify(result.content),
		},
	};
}

export function reviveAgentHostCatalogData(data: AgentHostCatalogData): AgentHostCatalogRevivedData {
	return {
		...data,
		project: data.project ? { ...data.project, uri: URI.parse(data.project.uri, true) } : undefined,
		workingDirectories: data.workingDirectories.map(directory => URI.parse(directory, true)),
		chats: data.chats.map(chat => ({ ...chat, uri: URI.parse(chat.uri, true) })),
	};
}

export function hashAgentHostCatalogPayload(payload: string): string {
	return createHash('sha256').update(payload, 'utf8').digest('hex');
}

function invalidPayload<T>(error: string): AgentHostCatalogPayloadResult<T> {
	return { ok: false, reason: 'invalid', error };
}

function hasUniqueValues<T>(values: readonly T[], getKey: (value: T) => string): boolean {
	const keys = new Set<string>();
	for (const value of values) {
		const key = getKey(value);
		if (keys.has(key)) {
			return false;
		}
		keys.add(key);
	}
	return true;
}

function isRefinementError<T>(value: T | ValidationError): value is ValidationError {
	return typeof value === 'object' && value !== null && !Array.isArray(value) && 'message' in value;
}
