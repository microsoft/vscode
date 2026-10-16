/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { Limiter, timeout } from '../../../../../../base/common/async.js';
import { Emitter, type Event } from '../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import type { ILogService } from '../../../../../log/common/log.js';
import type { ITelemetryService } from '../../../../../telemetry/common/telemetry.js';
import type { ILocalModelOfferV1, LocalModelCatalogState, LocalModelFitClass, LocalModelPublicRegistryState } from '../../../../common/localModel.js';
import { containsCredential, dropCredentialEntries, dropCredentialItems, errorCodeForLog, hasSignedUrlParameter, hasUrlUserinfo, isSafeRegistryIdentifier, reportDroppedStorageEntries } from '../../../../common/logRedaction.js';
import type { IAgentHostStorageService } from '../../../agentHostStorageService.js';
import { AZURE_ML_PUBLIC_RESOLVE_URL, AZURE_ML_PUBLIC_SEARCH_URL, BLOB_REQUEST_HEADERS, CATALOG_REFRESH_INTERVAL_MS, CONTAINER_LIST_MAX_BLOBS, CONTAINER_LIST_MAX_BYTES, DISPLAY_NAME_MAX_LENGTH, DOWNLOAD_MAX_REDIRECTS, getAzureMlSearchUserAgent, KNOWN_AUTO_LOCAL_IDS, LOCAL_CAPI_ID_SUFFIX, LOCAL_MODEL_METADATA, LOCAL_MODEL_METADATA_SCOPE, LOCAL_MODEL_TAGS, MAX_CONCURRENT_RESOLUTIONS, ON_DEVICE_ASSET_SUFFIX, PRESET_INI_FILE_NAME, PRESET_INI_MAX_BYTES, PRESET_JSON_FILE_NAME, PUBLIC_REGISTRY, UNPUBLISHED_REQUIREMENTS_FALLBACK, type LocalModelRegistryName } from './constants.js';
import { discardResponse, hostForLog, isAllowedDownloadUrl, isSafeModelFileName, readRemoteGgufArchitecture, readResponseText, type IDownloadFileSpec, type ILocalModelHttpClient, type ILocalModelHttpResponse } from './downloader.js';
import type { GgufArchitectureRead } from './gguf.js';
import { parseLlamaConfigJson, parseLlamaPreset, type ILlamaPreset } from './llamaPreset.js';

/* Azure ML tag-driven catalog: pure validation, identity, request and merge functions, then the `ModelCatalog` class (IO). */

// #region Profiles and identities

/** A validated catalog entry: one model version in one registry. Holds no secrets. */
export interface ILocalModelProfile {
	readonly registry: LocalModelRegistryName;
	readonly assetName: string;
	readonly version: string;
	readonly capiId: string;
	/** `capiId`, lowercased. */
	readonly familyId: string;
	readonly autoCapable: boolean;
	readonly displayName: string;
	readonly downloadBytes: number;
	readonly peakDiskBytes: number;
	readonly recommendedVramBytes: number;
	readonly maxPromptTokens: number;
	readonly maxContextWindowTokens: number;
	readonly maxOutputTokens: number;
	readonly licenseName?: string;
	readonly licenseUrl?: string;
	readonly minLlamaCppBuild?: number;
	readonly directoryPath?: string;
	/** The primary GGUF's file name from the `modelUri` tag ({@link modelFileNameFromUri}); the URI itself is never kept. */
	readonly modelFileName?: string;
	/** Diagnostics only. */
	readonly createdTime?: string;
}

export type LocalModelTagValidation =
	| { readonly ok: true; readonly profile: ILocalModelProfile }
	| { readonly ok: false; readonly reason: string };

/**
 * The CAPI id an on-device model is routed as, from its Azure ML asset name only (the rule the Copilot app and CLI
 * share): lowercased; a trailing `-on-device` becomes `-local`, a trailing `-local` is kept, else `-local` is appended. Pure.
 */
export function deriveCapiId(assetName: string): string {
	const lower = assetName.toLowerCase();
	if (lower.endsWith(ON_DEVICE_ASSET_SUFFIX)) {
		return lower.slice(0, lower.length - ON_DEVICE_ASSET_SUFFIX.length) + LOCAL_CAPI_ID_SUFFIX;
	}
	if (lower === ON_DEVICE_ASSET_SUFFIX.slice(1)) {
		return LOCAL_CAPI_ID_SUFFIX.slice(1);
	}
	return lower.endsWith(LOCAL_CAPI_ID_SUFFIX) ? lower : lower + LOCAL_CAPI_ID_SUFFIX;
}

/** Whether `capiId` may be declared to Auto (`KNOWN_AUTO_LOCAL_IDS`). Pure. */
export function isAutoCapable(capiId: string): boolean {
	return KNOWN_AUTO_LOCAL_IDS.includes(capiId.toLowerCase());
}

/** Whether `capiId` is a {@link isSafeRegistryIdentifier} ending with `-local`; such ids reach the status, the UI and logs. Pure. */
export function isValidCapiId(capiId: string): boolean {
	return isSafeRegistryIdentifier(capiId) && capiId.toLowerCase().endsWith(LOCAL_CAPI_ID_SUFFIX);
}

/** Whether `familyId` is a valid family id: a lowercase {@link isValidCapiId}. Pure. */
export function isValidFamilyId(familyId: unknown): familyId is string {
	return typeof familyId === 'string' && isValidCapiId(familyId) && familyId === familyId.toLowerCase();
}

/** Whether `value` is a content id or file hash: 64 lowercase hex digits. Pure. */
export function isSha256Hex(value: unknown): value is string {
	return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

/** Whether an optional license URL may be shown, published and cached: public HTTPS and no signed-URL credential. Pure. */
export function isSafeLicenseUrl(url: string): boolean {
	return isPublicHttpsUrl(url) && !hasSignedUrlParameter(url);
}

/**
 * Sanitizes a `displayName` tag: strips control and format characters (including bidi overrides) and collapses
 * whitespace. `undefined` when empty, too long, or holding a URL or signed-URL parameter: display names reach the UI
 * and logs, so they must never carry a credential. Pure.
 */
export function sanitizeDisplayName(value: string): string | undefined {
	const cleaned = value.replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}]/gu, '').replace(/\s+/g, ' ').trim();
	if (!cleaned || cleaned.length > DISPLAY_NAME_MAX_LENGTH || cleaned.includes('://') || containsCredential(cleaned)) {
		return undefined;
	}
	return cleaned;
}

/** Public HTTPS URL: `https:`, default port, no userinfo, a dotted non-IP host, not localhost. Pure. */
export function isPublicHttpsUrl(value: string): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	const host = url.hostname.toLowerCase();
	return url.protocol === 'https:'
		&& (url.port === '' || url.port === '443')
		&& !url.username && !url.password
		&& host.includes('.')
		&& !/^[\d.]+$/.test(host) && !host.startsWith('[')
		&& host !== 'localhost' && !host.endsWith('.localhost') && !host.endsWith('.local') && !host.endsWith('.internal');
}

/** A positive safe integer from a registry value: a JSON number (metadata) or a string of digits (tags). Pure. */
function positiveInteger(value: unknown): number | undefined {
	if (typeof value === 'number') {
		return Number.isSafeInteger(value) && value > 0 ? value : undefined;
	}
	if (typeof value !== 'string' || !/^[1-9]\d{0,15}$/.test(value.trim())) {
		return undefined;
	}
	const parsed = Number(value.trim());
	return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/**
 * The primary GGUF's file name from a `modelUri` tag (its last path segment), or `undefined` when the URI carries a
 * credential or the name isn't safe ({@link isSafeModelFileName}). Only this name is kept, never the URI. Pure.
 */
export function modelFileNameFromUri(modelUri: string): string | undefined {
	if (hasSignedUrlParameter(modelUri) || hasUrlUserinfo(modelUri)) {
		return undefined;
	}
	const withoutQuery = modelUri.replace(/[?#].*$/, '');
	const name = withoutQuery.slice(withoutQuery.lastIndexOf('/') + 1);
	return isSafeModelFileName(name) ? name : undefined;
}

/** A registry creation time for diagnostics: kept only when it is a short, parseable date without any credential. Pure. */
function safeCreatedTime(value: string | undefined): string | undefined {
	return value !== undefined && value.length <= 64 && /^[0-9TZ:.+-]+$/.test(value) && Number.isFinite(Date.parse(value)) ? value : undefined;
}

/** Longest `githubCopilotLocalRequirements` tag (a small JSON object) that is parsed. */
const REQUIREMENTS_TAG_MAX_LENGTH = 1024;

/**
 * Whether a model is in the local-coding scope: canonical metadata says Microsoft, GGUF and `Coding` (the Copilot CLI's
 * scope), or its tags opt it in as the Copilot app reads them or as an earlier tag contract did. Pure.
 */
export function isLocalCodingModel(tags: unknown, metadata: unknown): boolean {
	const m = asRecord(metadata);
	const keywords = m?.[LOCAL_MODEL_METADATA.keywords];
	if (m?.[LOCAL_MODEL_METADATA.publisher] === LOCAL_MODEL_METADATA_SCOPE.publisher
		&& m[LOCAL_MODEL_METADATA.modelFlavor] === LOCAL_MODEL_METADATA_SCOPE.modelFlavor
		&& Array.isArray(keywords) && keywords.every(keyword => typeof keyword === 'string') && keywords.includes(LOCAL_MODEL_METADATA_SCOPE.keyword)) {
		return true;
	}
	const t = asRecord(tags) ?? {};
	const tag = (key: string) => typeof t[key] === 'string' ? (t[key] as string).trim() : undefined;
	if (tag(LOCAL_MODEL_TAGS.githubCopilotLocal) === 'true' && tag(LOCAL_MODEL_TAGS.modelFlavor) === LOCAL_MODEL_METADATA_SCOPE.modelFlavor) {
		return true;
	}
	return tag(LOCAL_MODEL_TAGS.localCoding)?.toLowerCase() === 'true' && tag(LOCAL_MODEL_TAGS.modelFormat)?.toLowerCase() === 'gguf';
}

/** The requirements a version publishes: absent, invalid (the version is rejected), or its three byte counts. */
type RequirementsRead =
	| { readonly kind: 'absent' }
	| { readonly kind: 'invalid' }
	| { readonly kind: 'found'; readonly downloadBytes: number; readonly peakDiskBytes: number; readonly recommendedVramBytes: number };

/** Reads `githubCopilotLocalRequirements`: a metadata object, else a JSON string tag. Pure. */
function readRequirements(metadata: Record<string, unknown> | undefined, tags: Record<string, unknown>): RequirementsRead {
	let value = metadata?.[LOCAL_MODEL_METADATA.requirements];
	if (value === undefined || value === null) {
		const tag = tags[LOCAL_MODEL_TAGS.requirements];
		if (tag === undefined) {
			return { kind: 'absent' };
		}
		if (typeof tag !== 'string' || tag.length > REQUIREMENTS_TAG_MAX_LENGTH) {
			return { kind: 'invalid' };
		}
		try {
			value = JSON.parse(tag);
		} catch {
			return { kind: 'invalid' };
		}
	}
	const record = asRecord(value);
	const downloadBytes = positiveInteger(record?.downloadBytes);
	const peakDiskBytes = positiveInteger(record?.peakDiskBytes);
	const recommendedVramBytes = positiveInteger(record?.recommendedVramBytes);
	if (!downloadBytes || !peakDiskBytes || !recommendedVramBytes || peakDiskBytes < downloadBytes) {
		return { kind: 'invalid' };
	}
	return { kind: 'found', downloadBytes, peakDiskBytes, recommendedVramBytes };
}

/** The first public `https:` license URL in a license description (`MIT License at https://...`), when it is safe to show. Pure. */
function licenseUrlFromDescription(description: string | undefined): string | undefined {
	const url = description ? /https:\/\/[^\s<>()"'\\]+/.exec(description)?.[0].replace(/[.,;:]+$/, '') : undefined;
	return url && isSafeLicenseUrl(url) ? url : undefined;
}

/**
 * Validates a model version from its canonical metadata and tags (metadata first, then {@link LOCAL_MODEL_TAGS}, then
 * earlier tag names). It must be in scope and support tool calls; requirements fall back to earlier tags, then, for the
 * production MAI version only, to {@link UNPUBLISHED_REQUIREMENTS_FALLBACK}. A failing model is skipped. Pure.
 */
export function validateLocalModelTags(tags: unknown, source: { readonly registry: LocalModelRegistryName; readonly assetName: string; readonly version: string; readonly createdTime?: string; readonly metadata?: unknown }): LocalModelTagValidation {
	const metadata = asRecord(source.metadata);
	if (!asRecord(tags) && !metadata) {
		return { ok: false, reason: 'noTags' };
	}
	if (!isSafeRegistryIdentifier(source.assetName) || !isSafeRegistryIdentifier(source.version)) {
		return { ok: false, reason: 'invalidName' };
	}
	const t = asRecord(tags) ?? {};
	const str = (key: string) => typeof t[key] === 'string' ? (t[key] as string).trim() : undefined;
	/** The metadata value when present, else the first tag that is. */
	const pick = (metadataKey: string | undefined, ...tagKeys: string[]): unknown => {
		const fromMetadata = metadataKey !== undefined ? metadata?.[metadataKey] : undefined;
		if (fromMetadata !== undefined && fromMetadata !== null) {
			return fromMetadata;
		}
		return tagKeys.map(key => t[key]).find(value => value !== undefined && value !== null);
	};
	const text = (value: unknown) => typeof value === 'string' ? value.trim() : undefined;
	if (!isLocalCodingModel(t, metadata)) {
		return { ok: false, reason: 'scope' };
	}
	const toolCalls = pick(LOCAL_MODEL_METADATA.supportsToolCalling, LOCAL_MODEL_TAGS.supportsToolCalling, LOCAL_MODEL_TAGS.supportsToolCalls);
	if (toolCalls !== true && text(toolCalls)?.toLowerCase() !== 'true') {
		return { ok: false, reason: 'tag:supportsToolCalls' };
	}
	const rawDisplayName = text(pick(LOCAL_MODEL_METADATA.displayName, LOCAL_MODEL_TAGS.displayName));
	const displayName = rawDisplayName !== undefined ? sanitizeDisplayName(rawDisplayName) : undefined;
	if (!displayName) {
		return { ok: false, reason: 'tag:displayName' };
	}
	let downloadBytes: number | undefined;
	let peakDiskBytes: number | undefined;
	let recommendedVramBytes: number | undefined;
	const requirements = readRequirements(metadata, t);
	const fallback = UNPUBLISHED_REQUIREMENTS_FALLBACK;
	if (requirements.kind === 'invalid') {
		return { ok: false, reason: 'tag:requirements' };
	} else if (requirements.kind === 'found') {
		({ downloadBytes, peakDiskBytes, recommendedVramBytes } = requirements);
	} else if ([LOCAL_MODEL_TAGS.downloadBytes, LOCAL_MODEL_TAGS.peakDiskBytes, LOCAL_MODEL_TAGS.recommendedVramBytes].some(key => t[key] !== undefined)) {
		downloadBytes = positiveInteger(t[LOCAL_MODEL_TAGS.downloadBytes]);
		peakDiskBytes = positiveInteger(t[LOCAL_MODEL_TAGS.peakDiskBytes]);
		recommendedVramBytes = positiveInteger(t[LOCAL_MODEL_TAGS.recommendedVramBytes]);
	} else if (source.registry === fallback.registry && source.assetName === fallback.assetName && source.version === fallback.version) {
		({ downloadBytes, peakDiskBytes, recommendedVramBytes } = fallback);
	}
	if (!downloadBytes || !peakDiskBytes || peakDiskBytes < downloadBytes) {
		return { ok: false, reason: 'tag:sizes' };
	}
	if (!recommendedVramBytes) {
		return { ok: false, reason: 'tag:recommendedVramBytes' };
	}
	const maxPromptTokens = positiveInteger(pick(LOCAL_MODEL_METADATA.maxInputTokens, LOCAL_MODEL_TAGS.maxInputTokens, LOCAL_MODEL_TAGS.maxPromptTokens));
	const maxContextWindowTokens = positiveInteger(pick(LOCAL_MODEL_METADATA.textContextWindow, LOCAL_MODEL_TAGS.textContextWindow, LOCAL_MODEL_TAGS.maxContextWindowTokens));
	const maxOutputTokens = positiveInteger(pick(LOCAL_MODEL_METADATA.maxOutputTokens, LOCAL_MODEL_TAGS.maxOutputTokens));
	if (!maxPromptTokens || !maxContextWindowTokens || !maxOutputTokens || maxPromptTokens > maxContextWindowTokens || maxOutputTokens > maxContextWindowTokens) {
		return { ok: false, reason: 'tag:limits' };
	}
	const licenseName = str(LOCAL_MODEL_TAGS.licenseName) ?? text(pick(LOCAL_MODEL_METADATA.license, LOCAL_MODEL_TAGS.license));
	let licenseUrl = str(LOCAL_MODEL_TAGS.licenseUrl);
	if (licenseUrl !== undefined && licenseUrl !== '' && !isSafeLicenseUrl(licenseUrl)) {
		return { ok: false, reason: 'tag:licenseUrl' };
	}
	licenseUrl ||= licenseUrlFromDescription(text(pick(LOCAL_MODEL_METADATA.licenseDescription, LOCAL_MODEL_TAGS.licenseDescription)));
	const rawMinBuild = str(LOCAL_MODEL_TAGS.minLlamaCppBuild);
	let minLlamaCppBuild: number | undefined;
	if (rawMinBuild !== undefined && rawMinBuild !== '') {
		const match = /^b?(?<build>\d{1,7})$/i.exec(rawMinBuild);
		if (!match?.groups) {
			return { ok: false, reason: 'tag:minLlamaCppBuild' };
		}
		minLlamaCppBuild = Number(match.groups.build);
	}
	const directoryPath = str(LOCAL_MODEL_TAGS.directoryPath) ?? text(metadata?.[LOCAL_MODEL_METADATA.directoryPath]);
	if (directoryPath !== undefined && (directoryPath.includes('..') || directoryPath.includes('\\') || /[?#]/.test(directoryPath) || containsCredential(directoryPath))) {
		return { ok: false, reason: 'tag:directoryPath' };
	}
	const modelUri = str(LOCAL_MODEL_TAGS.modelUri);
	const modelFileName = modelUri ? modelFileNameFromUri(modelUri) : undefined;
	if (modelUri && !modelFileName) {
		return { ok: false, reason: 'tag:modelUri' };
	}
	const createdTime = safeCreatedTime(source.createdTime);
	const capiId = deriveCapiId(source.assetName);
	if (!isValidCapiId(capiId)) {
		return { ok: false, reason: 'invalidName' };
	}
	return {
		ok: true,
		profile: {
			registry: source.registry,
			assetName: source.assetName,
			version: source.version,
			capiId,
			familyId: capiId.toLowerCase(),
			autoCapable: isAutoCapable(capiId),
			displayName,
			downloadBytes,
			peakDiskBytes,
			recommendedVramBytes,
			maxPromptTokens,
			maxContextWindowTokens,
			maxOutputTokens,
			...(licenseName && sanitizeDisplayName(licenseName) ? { licenseName: sanitizeDisplayName(licenseName) } : {}),
			...(licenseUrl ? { licenseUrl } : {}),
			...(minLlamaCppBuild !== undefined ? { minLlamaCppBuild } : {}),
			...(directoryPath ? { directoryPath: directoryPath.replace(/^\/+|\/+$/g, '') } : {}),
			...(modelFileName ? { modelFileName } : {}),
			...(createdTime ? { createdTime } : {}),
		},
	};
}

/**
 * Serving compatibility: offered only when the `capiId` is in `KNOWN_AUTO_LOCAL_IDS`, or its `minLlamaCppBuild` is at
 * most the resolved llama.cpp build. The preset allowlist is enforced again at setup. Pure.
 */
export function isServingCompatible(profile: Pick<ILocalModelProfile, 'capiId' | 'minLlamaCppBuild'>, resolvedLlamaCppBuild: number | undefined): boolean {
	if (isAutoCapable(profile.capiId)) {
		return true;
	}
	return profile.minLlamaCppBuild !== undefined && resolvedLlamaCppBuild !== undefined && resolvedLlamaCppBuild >= profile.minLlamaCppBuild;
}

/** One file of a version's content. */
export interface IContentFile {
	readonly path: string;
	readonly sizeBytes: number;
	readonly sha256: string;
}

/** `contentId`: SHA-256 over the sorted `(relative path, size, sha256)` of every file in a version, independent of the registry. Pure. */
export function computeContentId(files: readonly IContentFile[]): string {
	const lines = [...files]
		.map(file => `${file.path}\n${file.sizeBytes}\n${file.sha256.toLowerCase()}\n`)
		.sort();
	return createHash('sha256').update(lines.join('')).digest('hex');
}

/** Key of one registry version, for content facts. */
export function sourceKey(profile: Pick<ILocalModelProfile, 'registry' | 'assetName' | 'version'>): string {
	return `${profile.registry}/${profile.assetName.toLowerCase()}/${profile.version}`;
}

// #endregion

// #region Registry requests

/** One search hit, before validation. */
export interface IRegistrySearchHit {
	readonly assetName: string;
	readonly version: string;
	readonly tags: unknown;
	/** `annotations.systemCatalogData`: the registry's canonical catalog metadata. */
	readonly metadata?: unknown;
	readonly archived: boolean;
	readonly createdTime?: string;
}

/** Parses `azureml://registries/<r>/models/<n>/versions/<v>`. Pure. */
export function parseAssetId(assetId: string): { readonly registry: string; readonly name: string; readonly version: string } | undefined {
	const match = /^azureml:\/\/registries\/(?<registry>[^/]+)\/models\/(?<name>[^/]+)\/versions\/(?<version>[^/]+)$/.exec(assetId);
	return match?.groups ? { registry: match.groups.registry, name: match.groups.name, version: match.groups.version } : undefined;
}

/** `azureml://registries/<r>/models/<n>/versions/<v>`. Pure. */
export function formatAssetId(registry: LocalModelRegistryName, assetName: string, version: string): string {
	return `azureml://registries/${registry}/models/${assetName}/versions/${version}`;
}

/** Builds the `crossRegion` search body: the latest versions in the Microsoft GGUF coding scope (the Copilot CLI's filter). Pure. */
export function buildTagSearchBody(registry: LocalModelRegistryName, continuationToken: string | undefined, pageSize = 50): string {
	const filter = (field: string, value: string) => ({ field, operator: 'eq', values: [value] });
	const scoped = [
		filter(`annotations/systemCatalogData/${LOCAL_MODEL_METADATA.publisher}`, LOCAL_MODEL_METADATA_SCOPE.publisher),
		filter(`annotations/systemCatalogData/${LOCAL_MODEL_METADATA.modelFlavor}`, LOCAL_MODEL_METADATA_SCOPE.modelFlavor),
		filter(`annotations/systemCatalogData/${LOCAL_MODEL_METADATA.keywords}`, LOCAL_MODEL_METADATA_SCOPE.keyword),
	];
	return JSON.stringify({
		resourceIds: [{ resourceId: registry, entityContainerType: 'Registry' }],
		indexEntitiesRequest: {
			filters: [
				filter('type', 'models'),
				filter('kind', 'Versioned'),
				filter('labels', 'latest'),
				...scoped,
			],
			pageSize,
			skip: null,
			continuationToken: continuationToken ?? null,
		},
	});
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Parses a `crossRegion` response into hits (archived ones flagged) and the continuation token; `undefined` for an unrecognizable body. Pure. */
export function parseTagSearchResponse(body: unknown): { readonly hits: IRegistrySearchHit[]; readonly continuationToken: string | undefined } | undefined {
	const page = asRecord(asRecord(body)?.indexEntitiesResponse);
	if (!page || !Array.isArray(page.value)) {
		return undefined;
	}
	const hits: IRegistrySearchHit[] = [];
	for (const raw of page.value) {
		const entity = asRecord(raw);
		const annotations = asRecord(entity?.annotations);
		const properties = asRecord(entity?.properties);
		const assetId = typeof entity?.assetId === 'string' ? parseAssetId(entity.assetId) : undefined;
		const assetName = assetId?.name ?? (typeof properties?.name === 'string' ? properties.name : undefined);
		const rawVersion = assetId?.version ?? entity?.version ?? properties?.version;
		const version = typeof rawVersion === 'string' || typeof rawVersion === 'number' ? String(rawVersion) : undefined;
		if (!assetName || !version) {
			continue;
		}
		const createdTime = asRecord(properties?.creationContext)?.createdTime;
		const metadata = asRecord(annotations?.systemCatalogData);
		hits.push({
			assetName,
			version,
			tags: annotations?.tags,
			...(metadata ? { metadata } : {}),
			archived: annotations?.archived === true || annotations?.isArchived === true,
			...(typeof createdTime === 'string' ? { createdTime } : {}),
		});
	}
	const token = page.continuationToken;
	return { hits, continuationToken: typeof token === 'string' && token ? token : undefined };
}

/** Public resolve URL (lazy). Pure. */
export function buildPublicResolveUrl(assetName: string, version: string): string {
	return `${AZURE_ML_PUBLIC_RESOLVE_URL}?assetId=${encodeURIComponent(formatAssetId(PUBLIC_REGISTRY, assetName, version))}`;
}

/** The public lookup of one version: the asset id it answered for, its tags and metadata, and the container SAS. */
export interface IPublicResolveResponse {
	/** `modelEntity.assetId`: the version the registry resolved, checked against the request. */
	readonly assetId: string | undefined;
	readonly tags: unknown;
	/** `modelEntity.systemMetadata`. */
	readonly metadata: unknown;
	readonly archived: boolean;
	readonly blobSasUri: string;
}

/** Parses the public resolve response: `{ modelEntity: { assetId, kvTags, systemMetadata, isArchived }, blobSasUri }`. Pure. */
export function parsePublicResolveResponse(body: unknown): IPublicResolveResponse | undefined {
	const record = asRecord(body);
	const entity = asRecord(record?.modelEntity);
	if (!entity || typeof record?.blobSasUri !== 'string') {
		return undefined;
	}
	return {
		assetId: typeof entity.assetId === 'string' ? entity.assetId : undefined,
		tags: entity.kvTags,
		metadata: entity.systemMetadata,
		archived: entity.isArchived === true,
		blobSasUri: record.blobSasUri,
	};
}

// #endregion

// #region File resolution

/** One blob from a container listing. */
export interface IListedBlob {
	readonly name: string;
	readonly sizeBytes: number;
}

function decodeXmlText(value: string): string {
	return value.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (entity, code: string) => {
		switch (code.toLowerCase()) {
			case 'lt': return '<';
			case 'gt': return '>';
			case 'amp': return '&';
			case 'quot': return '"';
			case 'apos': return '\'';
		}
		const n = code.startsWith('#x') || code.startsWith('#X') ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
		return Number.isFinite(n) ? String.fromCodePoint(n) : entity;
	});
}

/** Parses an Azure Blob `List Blobs` XML response; `undefined` when over {@link CONTAINER_LIST_MAX_BLOBS} or continued (`NextMarker`). Pure. */
export function parseBlobListXml(xml: string): IListedBlob[] | undefined {
	const blobs: IListedBlob[] = [];
	const blobPattern = /<Blob>([\s\S]*?)<\/Blob>/g;
	let match: RegExpExecArray | null;
	while ((match = blobPattern.exec(xml))) {
		const name = /<Name>([\s\S]*?)<\/Name>/.exec(match[1])?.[1];
		const size = /<Content-Length>(\d+)<\/Content-Length>/.exec(match[1])?.[1];
		if (name === undefined || size === undefined) {
			continue;
		}
		blobs.push({ name: decodeXmlText(name), sizeBytes: Number(size) });
		if (blobs.length > CONTAINER_LIST_MAX_BLOBS) {
			return undefined;
		}
	}
	const nextMarker = /<NextMarker>([^<]+)<\/NextMarker>/.exec(xml)?.[1];
	return nextMarker ? undefined : blobs;
}

/** Splits a container (or directory) SAS URL into container base, default prefix and SAS query. Pure. */
export function splitSasUrl(sasUrl: string): { readonly containerUrl: string; readonly prefix: string; readonly query: string } | undefined {
	let url: URL;
	try {
		url = new URL(sasUrl);
	} catch {
		return undefined;
	}
	const segments = url.pathname.split('/').filter(Boolean);
	if (segments.length === 0 || !url.search) {
		return undefined;
	}
	return { containerUrl: `${url.origin}/${segments[0]}`, prefix: segments.slice(1).map(decodeURIComponent).join('/'), query: url.search.slice(1) };
}

/** `List Blobs` URL under `prefix`. Pure. */
export function buildContainerListUrl(sas: { readonly containerUrl: string; readonly query: string }, prefix: string): string {
	const normalized = prefix ? `${prefix.replace(/\/+$/, '')}/` : '';
	return `${sas.containerUrl}?restype=container&comp=list&maxresults=${CONTAINER_LIST_MAX_BLOBS + 1}&prefix=${encodeURIComponent(normalized)}&${sas.query}`;
}

/** URL of one blob with the SAS query. Pure. */
export function buildBlobUrl(sas: { readonly containerUrl: string; readonly query: string }, blobName: string): string {
	return `${sas.containerUrl}/${blobName.split('/').map(encodeURIComponent).join('/')}?${sas.query}`;
}

/** The blob-name prefix of a version's files, `''` or ending in `/`: the listing prefix, then the packaging folder. Pure. */
function filesPrefix(prefix: string, wrapperFolder: string | undefined): string {
	const base = prefix ? `${prefix.replace(/\/+$/, '')}/` : '';
	return wrapperFolder ? `${base}${wrapperFolder}/` : base;
}

const SHARD_PATTERN = /-\d{5}-of-\d{5}\.gguf$/i;

export type ModelFileSelection =
	| { readonly ok: true; readonly config: IListedBlob; readonly configKind: 'json' | 'ini'; readonly primary: IListedBlob }
	| { readonly ok: false; readonly reason: string };

function baseName(name: string): string {
	return name.slice(name.lastIndexOf('/') + 1);
}

/**
 * Picks the required files among blobs directly under `prefix`: exactly one runtime config (`llama-config.json`, else
 * `llama-default.ini`) and the primary GGUF named by `modelFileName`, else the largest non-shard `.gguf`. Sharded
 * GGUFs are rejected. Pure.
 */
export function selectModelFiles(blobs: readonly IListedBlob[], prefix: string, modelFileName: string | undefined): ModelFileSelection {
	const normalized = prefix ? `${prefix.replace(/\/+$/, '')}/` : '';
	const direct = blobs.filter(blob => blob.name.startsWith(normalized) && !blob.name.slice(normalized.length).includes('/'));
	const configsNamed = (fileName: string) => direct.filter(blob => baseName(blob.name).toLowerCase() === fileName);
	const jsons = configsNamed(PRESET_JSON_FILE_NAME);
	const inis = configsNamed(PRESET_INI_FILE_NAME);
	const configKind = jsons.length ? 'json' : 'ini';
	const configs = jsons.length ? jsons : inis;
	if (configs.length !== 1) {
		return { ok: false, reason: configKind };
	}
	const ggufs = direct.filter(blob => blob.name.toLowerCase().endsWith('.gguf'));
	let primary: IListedBlob | undefined;
	if (modelFileName) {
		const wanted = baseName(modelFileName.replace(/[?#].*$/, '')).toLowerCase();
		primary = ggufs.find(blob => baseName(blob.name).toLowerCase() === wanted);
	} else {
		primary = ggufs.filter(blob => !SHARD_PATTERN.test(blob.name)).sort((a, b) => b.sizeBytes - a.sizeBytes)[0];
	}
	if (!primary) {
		return { ok: false, reason: 'primary' };
	}
	if (SHARD_PATTERN.test(primary.name)) {
		return { ok: false, reason: 'sharded' };
	}
	return { ok: true, config: configs[0], configKind, primary };
}

export type ModelFolderUnwrap =
	| { readonly ok: true; readonly folder: string | undefined }
	| { readonly ok: false; readonly reason: string };

/**
 * Reads a version whose files all sit in one packaging folder (e.g. `5/llama-config.json`) from that folder, as the
 * Copilot CLI and app do. Only an unambiguous wrapper is accepted; otherwise `folder` is undefined. Pure.
 */
export function unwrapModelFolder(blobs: readonly IListedBlob[], prefix: string): ModelFolderUnwrap {
	const normalized = prefix ? `${prefix.replace(/\/+$/, '')}/` : '';
	const relative = blobs.filter(blob => blob.name.startsWith(normalized)).map(blob => blob.name.slice(normalized.length));
	if (relative.length === 0 || relative.some(name => !name.includes('/'))) {
		return { ok: true, folder: undefined };
	}
	const configsNamed = (fileName: string) => relative.filter(name => baseName(name).toLowerCase() === fileName.toLowerCase());
	const jsons = configsNamed(PRESET_JSON_FILE_NAME);
	const configs = jsons.length ? jsons : configsNamed(PRESET_INI_FILE_NAME);
	if (configs.length !== 1) {
		return { ok: false, reason: 'wrapper' };
	}
	const folder = configs[0].slice(0, configs[0].lastIndexOf('/'));
	if (!folder.split('/').every(segment => isSafeRegistryIdentifier(segment)) || relative.some(name => !name.startsWith(`${folder}/`))) {
		return { ok: false, reason: 'wrapper' };
	}
	return { ok: true, folder };
}

/** Normalizes `x-ms-meta-sha256` (hex or base64) to lowercase hex. Pure. */
export function normalizeSha256Header(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}
	const trimmed = value.trim();
	if (/^[0-9a-f]{64}$/i.test(trimmed)) {
		return trimmed.toLowerCase();
	}
	if (/^[A-Za-z0-9+/]{43}=$/.test(trimmed)) {
		const hex = Buffer.from(trimmed, 'base64').toString('hex');
		return hex.length === 64 ? hex : undefined;
	}
	return undefined;
}

// #endregion

// #region Merge

/** An install as the catalog sees it (from the store). */
export interface ICatalogInstallFact {
	readonly familyId: string;
	readonly assetName: string;
	readonly contentId: string;
	/** The registry version the install is (its own version, or the one its content was recorded identical to). */
	readonly channelVersion: string;
	readonly owned: boolean;
	readonly adopted: boolean;
}

/** One merged row per family. */
export interface IMergedCatalogFamily {
	readonly familyId: string;
	readonly capiId: string;
	readonly autoCapable: boolean;
	readonly displayName: string;
	/** The build offered for download. */
	readonly offer?: ILocalModelProfile;
	readonly install?: ICatalogInstallFact;
	/** A newer build of the installed model. */
	readonly update?: ILocalModelProfile;
}

export interface IMergeInput {
	readonly profiles: readonly ILocalModelProfile[];
	readonly installs: readonly ICatalogInstallFact[];
	/** `sourceKey` -> `contentId`, for versions resolved so far. */
	readonly contentIds: ReadonlyMap<string, string>;
	/** Build of the resolved llama.cpp, for serving compatibility. */
	readonly resolvedLlamaCppBuild: number | undefined;
}

/** One row per family: the serving-compatible build is offered, and another version of an installed family is its update. Installed families are always listed. Pure. */
export function mergeCatalogFamilies(input: IMergeInput): IMergedCatalogFamily[] {
	const offers = new Map<string, ILocalModelProfile>();
	for (const profile of [...input.profiles].sort((a, b) => a.assetName.localeCompare(b.assetName))) {
		if (isServingCompatible(profile, input.resolvedLlamaCppBuild) && !offers.has(profile.familyId)) {
			offers.set(profile.familyId, profile);
		}
	}
	const installsByFamily = new Map<string, ICatalogInstallFact>();
	for (const install of input.installs) {
		// The first one wins: the store lists the registry's own folder first.
		if (!installsByFamily.has(install.familyId)) {
			installsByFamily.set(install.familyId, install);
		}
	}
	const families: IMergedCatalogFamily[] = [];
	for (const familyId of new Set([...offers.keys(), ...installsByFamily.keys()])) {
		const offer = offers.get(familyId);
		const install = installsByFamily.get(familyId);
		const offerContent = offer ? input.contentIds.get(sourceKey(offer)) : undefined;
		const update = install && offer && offer.version !== install.channelVersion && offerContent !== install.contentId ? offer : undefined;
		const capiId = offer?.capiId ?? familyId;
		families.push({
			familyId,
			capiId,
			autoCapable: isAutoCapable(capiId),
			displayName: offer?.displayName ?? install?.assetName ?? familyId,
			...(offer ? { offer } : {}),
			...(install ? { install } : {}),
			...(update ? { update } : {}),
		});
	}
	return families;
}

/** Projects an offer for the status. Pure. */
export function toLocalModelOffer(profile: ILocalModelProfile, fit: LocalModelFitClass): ILocalModelOfferV1 {
	return {
		fit,
		requiredGpuBytes: profile.recommendedVramBytes,
		downloadBytes: profile.downloadBytes,
		peakDiskBytes: profile.peakDiskBytes,
		...(profile.licenseName ? { licenseName: profile.licenseName } : {}),
		...(profile.licenseUrl ? { licenseUrl: profile.licenseUrl } : {}),
	};
}

/** The catalog's state: `ready` with any family, else the registry's (`unavailable` only when it failed with nothing cached). Pure. */
export function computeCatalogState(registryState: LocalModelPublicRegistryState, familyCount: number): LocalModelCatalogState {
	if (familyCount > 0) {
		return 'ready';
	}
	if (registryState === 'loading') {
		return 'loading';
	}
	return registryState === 'unavailable' ? 'unavailable' : 'empty';
}

// #endregion
// #region Catalog service

/** Catalog failure codes (resolution). */
export type LocalModelCatalogErrorCode = 'network' | 'notPublished' | 'noChecksum' | 'invalidContent' | 'cancelled';

export class LocalModelCatalogError extends Error {
	constructor(readonly code: LocalModelCatalogErrorCode, message?: string) {
		super(message ?? code);
		this.name = 'LocalModelCatalogError';
	}
}

/** A version resolved for setup. `files[].url` carry SAS signatures: memory only, never logged or persisted. */
export interface IResolvedModelVersion {
	readonly profile: ILocalModelProfile;
	readonly files: readonly IDownloadFileSpec[];
	readonly primaryFile: string;
	readonly preset: ILlamaPreset;
	readonly contentId: string;
	/** The packaging folder the files were read from ({@link unwrapModelFolder}), below the SAS or `directoryPath` prefix. */
	readonly wrapperFolder?: string;
}

/** Current catalog contents and the registry's state. */
export interface ICatalogSnapshot {
	readonly publicState: LocalModelPublicRegistryState;
	readonly publicProfiles: readonly ILocalModelProfile[];
	/** `sourceKey` -> `contentId` for versions resolved so far. */
	readonly contentIds: ReadonlyMap<string, string>;
	readonly refreshedAt: number | undefined;
}

export interface ICatalogRefreshOptions {
	/** Ignore the 24 h cache (Retry, setting turned on). */
	readonly force?: boolean;
	readonly signal?: AbortSignal;
}

export interface IModelCatalogOptions {
	readonly http: ILocalModelHttpClient;
	/** Agent Host storage for the 24 h cache (no SAS URLs). */
	readonly storage?: Pick<IAgentHostStorageService, 'get' | 'set'>;
	readonly log: ILogService;
	readonly telemetry?: Pick<ITelemetryService, 'publicLog2'>;
	/** VS Code's version, named in the search's User-Agent. */
	readonly productVersion?: string;
	readonly now?: () => number;
	/** Backoff delay (tests make it immediate). */
	readonly delay?: (ms: number) => Promise<void>;
}

interface ICachedContentFacts {
	readonly contentId: string;
	readonly files: readonly (IContentFile & { readonly etag?: string })[];
}

interface ICatalogCacheV2 {
	readonly schemaVersion: typeof CATALOG_CACHE_SCHEMA_VERSION;
	readonly refreshedAt: number;
	readonly publicState: LocalModelPublicRegistryState;
	readonly publicProfiles: readonly ILocalModelProfile[];
	readonly contentFacts: Readonly<Record<string, ICachedContentFacts>>;
}

const CATALOG_CACHE_KEY = 'localModel.catalog';
/** Bumped when the catalog contract changes: a cache written under an earlier contract is discarded. */
const CATALOG_CACHE_SCHEMA_VERSION = 2;
const SEARCH_MAX_PAGES = 20;
const JSON_RESPONSE_MAX_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const RESOLVE_RETRY_DELAYS_MS: readonly number[] = [1_000, 4_000];

function isPositiveSafeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/**
 * Validating reader for one cached profile: identifiers must be safe, `familyId === capiId.toLowerCase()`, texts safe
 * and nothing credential-like. It is rebuilt from known fields only (a `modelUri` is reduced to its file name); a
 * failing record is dropped whole. Pure.
 */
export function readCachedProfile(value: unknown): ILocalModelProfile | undefined {
	const record = asRecord(value);
	if (!record || containsCredential(record)) {
		return undefined;
	}
	const { registry, assetName, version, capiId, familyId, displayName, downloadBytes, peakDiskBytes, recommendedVramBytes, maxPromptTokens, maxContextWindowTokens, maxOutputTokens } = record;
	if (registry !== PUBLIC_REGISTRY
		|| !isSafeRegistryIdentifier(assetName) || !isSafeRegistryIdentifier(version)
		|| typeof capiId !== 'string' || !isValidCapiId(capiId) || familyId !== capiId.toLowerCase()
		|| typeof displayName !== 'string' || sanitizeDisplayName(displayName) !== displayName
		|| !isPositiveSafeInteger(downloadBytes) || !isPositiveSafeInteger(peakDiskBytes) || !isPositiveSafeInteger(recommendedVramBytes)
		|| !isPositiveSafeInteger(maxPromptTokens) || !isPositiveSafeInteger(maxContextWindowTokens) || !isPositiveSafeInteger(maxOutputTokens)) {
		return undefined;
	}
	const optionalString = (key: string, valid: (text: string) => boolean): string | undefined | false => {
		const item = record[key];
		return item === undefined ? undefined : typeof item === 'string' && valid(item) ? item : false;
	};
	const licenseName = optionalString('licenseName', text => sanitizeDisplayName(text) === text);
	const licenseUrl = optionalString('licenseUrl', isSafeLicenseUrl);
	const directoryPath = optionalString('directoryPath', text => !text.includes('..') && !text.includes('\\') && !/[?#]/.test(text));
	const modelFileName = optionalString('modelFileName', isSafeModelFileName);
	const legacyModelUri = optionalString('modelUri', text => modelFileNameFromUri(text) !== undefined);
	const createdTime = optionalString('createdTime', text => safeCreatedTime(text) === text);
	const minLlamaCppBuild = record.minLlamaCppBuild;
	if (licenseName === false || licenseUrl === false || directoryPath === false || modelFileName === false || legacyModelUri === false || createdTime === false
		|| (minLlamaCppBuild !== undefined && (typeof minLlamaCppBuild !== 'number' || !Number.isSafeInteger(minLlamaCppBuild) || minLlamaCppBuild < 0))) {
		return undefined;
	}
	const fileName = modelFileName ?? (legacyModelUri ? modelFileNameFromUri(legacyModelUri) : undefined);
	return {
		registry,
		assetName,
		version,
		capiId,
		familyId,
		autoCapable: isAutoCapable(capiId),
		displayName,
		downloadBytes,
		peakDiskBytes,
		recommendedVramBytes,
		maxPromptTokens,
		maxContextWindowTokens,
		maxOutputTokens,
		...(licenseName ? { licenseName } : {}),
		...(licenseUrl ? { licenseUrl } : {}),
		...(minLlamaCppBuild !== undefined ? { minLlamaCppBuild } : {}),
		...(directoryPath ? { directoryPath } : {}),
		...(fileName ? { modelFileName: fileName } : {}),
		...(createdTime ? { createdTime } : {}),
	};
}

/** Whether `key` is a {@link sourceKey}: a registry, a lowercase asset name and a version, all safe identifiers. Pure. */
function isCachedSourceKey(key: string): boolean {
	const [registry, assetName, version, ...rest] = key.split('/');
	return rest.length === 0 && registry === PUBLIC_REGISTRY
		&& isSafeRegistryIdentifier(assetName) && assetName === assetName.toLowerCase() && isSafeRegistryIdentifier(version);
}

/** Validating reader for one cached content-facts entry: key, hashes and content id must check out and nothing may hold a credential. Pure. */
function readCachedContentFacts(key: string, value: unknown): ICachedContentFacts | undefined {
	const record = asRecord(value);
	if (!isCachedSourceKey(key) || !record || containsCredential(record) || !isSha256Hex(record.contentId) || !Array.isArray(record.files) || record.files.length === 0) {
		return undefined;
	}
	const files: (IContentFile & { readonly etag?: string })[] = [];
	for (const item of record.files) {
		const file = asRecord(item);
		if (!file || typeof file.path !== 'string' || !isSafeModelFileName(file.path) || typeof file.sizeBytes !== 'number' || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0
			|| !isSha256Hex(file.sha256) || (file.etag !== undefined && (typeof file.etag !== 'string' || file.etag.length > 256))) {
			return undefined;
		}
		files.push({ path: file.path, sizeBytes: file.sizeBytes, sha256: file.sha256, ...(file.etag ? { etag: file.etag } : {}) });
	}
	return computeContentId(files) === record.contentId ? { contentId: record.contentId, files } : undefined;
}

/** The Azure ML catalog: anonymous `crossRegion` search, lazy resolution, a 24 h cache without SAS URLs, at most two concurrent resolutions. */
export class ModelCatalog extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	/** Fires when the snapshot changes. */
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _publicState: LocalModelPublicRegistryState = 'loading';
	private _publicProfiles: readonly ILocalModelProfile[] = [];
	private readonly _contentFacts = new Map<string, ICachedContentFacts>();
	private _refreshedAt: number | undefined;
	private readonly _limiter = new Limiter<void>(MAX_CONCURRENT_RESOLUTIONS);
	private readonly _now: () => number;
	private readonly _delay: (ms: number) => Promise<void>;

	constructor(private readonly _options: IModelCatalogOptions) {
		super();
		this._now = _options.now ?? Date.now;
		this._delay = _options.delay ?? (ms => timeout(ms));
		this._register(toDisposable(() => this._limiter.dispose()));
		this._loadCache();
	}

	get snapshot(): ICatalogSnapshot {
		return {
			publicState: this._publicState,
			publicProfiles: this._publicProfiles,
			contentIds: new Map([...this._contentFacts].map(([key, facts]) => [key, facts.contentId])),
			refreshedAt: this._refreshedAt,
		};
	}

	/** Whether a refresh is due: older than 24 h, or never run. */
	isStale(): boolean {
		return this._refreshedAt === undefined || this._now() - this._refreshedAt >= CATALOG_REFRESH_INTERVAL_MS;
	}

	/** Merged families for the current snapshot. */
	merge(installs: readonly ICatalogInstallFact[], resolvedLlamaCppBuild: number | undefined): IMergedCatalogFamily[] {
		const snapshot = this.snapshot;
		return mergeCatalogFamilies({
			profiles: snapshot.publicProfiles,
			installs,
			contentIds: snapshot.contentIds,
			resolvedLlamaCppBuild,
		});
	}

	async refresh(options: ICatalogRefreshOptions): Promise<ICatalogSnapshot> {
		if (!options.force && !this.isStale()) {
			return this.snapshot;
		}
		const started = this._now();
		const signal = options.signal ?? new AbortController().signal;
		this._publicState = 'loading';
		this._onDidChange.fire();
		await this._refreshPublic(signal);
		if (signal.aborted) {
			throw new LocalModelCatalogError('cancelled');
		}
		this._refreshedAt = this._now();
		this._saveCache();
		this._reportTelemetry(started);
		this._onDidChange.fire();
		return this.snapshot;
	}

	/** Resolves a version for setup (SAS, listing, preset, `HEAD` facts, `contentId`). Throws {@link LocalModelCatalogError}. */
	async resolveForSetup(profile: ILocalModelProfile, signal: AbortSignal): Promise<IResolvedModelVersion> {
		return this._withRetries(() => this._resolve(profile, signal), signal);
	}

	/** Re-resolves SAS URLs for the same files (downloader renewal), under the same packaging folder. File identity checks stay with the downloader. */
	async renewDownloadUrls(resolved: IResolvedModelVersion, signal: AbortSignal): Promise<IDownloadFileSpec[]> {
		const sas = await this._getContainerSas(resolved.profile, signal);
		const normalized = filesPrefix(resolved.profile.directoryPath ?? sas.prefix, resolved.wrapperFolder);
		return resolved.files.map(file => ({ ...file, url: buildBlobUrl(sas, normalized + file.relativePath) }));
	}

	/** `general.architecture` of the primary GGUF via bounded `Range` requests before the download; an expired SAS is renewed once. Never logs URLs. */
	async readPrimaryArchitecture(resolved: IResolvedModelVersion, signal: AbortSignal): Promise<GgufArchitectureRead> {
		const primary = resolved.files.find(file => file.relativePath === resolved.primaryFile);
		if (!primary) {
			return { kind: 'unknown', reason: 'invalid' };
		}
		return readRemoteGgufArchitecture({
			http: this._options.http,
			log: this._options.log,
			file: primary,
			signal,
			renew: async renewSignal => (await this.renewDownloadUrls(resolved, renewSignal)).find(file => file.relativePath === primary.relativePath),
		});
	}

	// #region Public registry

	private async _refreshPublic(signal: AbortSignal): Promise<void> {
		try {
			const profiles: ILocalModelProfile[] = [];
			let continuationToken: string | undefined;
			for (let page = 0; page < SEARCH_MAX_PAGES; page++) {
				const response = await this._request({ url: AZURE_ML_PUBLIC_SEARCH_URL, method: 'POST', body: buildTagSearchBody(PUBLIC_REGISTRY, continuationToken), headers: { 'User-Agent': getAzureMlSearchUserAgent(this._options.productVersion), 'Content-Type': 'application/json' } }, signal);
				const parsed = parseTagSearchResponse(await this._readJson(response, signal));
				if (!parsed) {
					throw new LocalModelCatalogError('network', 'Unrecognized search response');
				}
				profiles.push(...this._validateHits(parsed.hits, PUBLIC_REGISTRY));
				continuationToken = parsed.continuationToken;
				if (!continuationToken) {
					break;
				}
			}
			this._publicProfiles = profiles;
			this._publicState = profiles.length ? 'ready' : 'empty';
		} catch (error) {
			if (signal.aborted) {
				return;
			}
			// Cached public profiles stay usable; the registry reports `unavailable`.
			this._options.log.warn(`[LocalModelCatalog] Public registry unavailable (${errorCodeForLog(error)})`);
			this._publicState = 'unavailable';
		}
	}

	private _validateHits(hits: readonly IRegistrySearchHit[], registry: LocalModelRegistryName): ILocalModelProfile[] {
		const profiles: ILocalModelProfile[] = [];
		for (const hit of hits) {
			if (hit.archived) {
				continue;
			}
			const result = validateLocalModelTags(hit.tags, { registry, assetName: hit.assetName, version: hit.version, createdTime: hit.createdTime, metadata: hit.metadata });
			if (result.ok) {
				profiles.push(result.profile);
			} else {
				// Registry text that failed validation: logged bounded and redacted (a name or version may hold a signed URL).
				this._options.log.info(`[LocalModelCatalog] Skipping a search hit from ${registry} (${result.reason})`);
			}
		}
		return profiles;
	}

	// #endregion

	// #region Resolution

	private async _withRetries<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
		for (let attempt = 0; ; attempt++) {
			try {
				let result!: T;
				await this._limiter.queue(async () => { result = await work(); });
				return result;
			} catch (error) {
				const retryable = error instanceof LocalModelCatalogError && error.code === 'network';
				if (!retryable || attempt >= RESOLVE_RETRY_DELAYS_MS.length || signal.aborted) {
					throw signal.aborted ? new LocalModelCatalogError('cancelled') : error;
				}
				await this._delay(RESOLVE_RETRY_DELAYS_MS[attempt]);
			}
		}
	}

	private async _getContainerSas(profile: ILocalModelProfile, signal: AbortSignal): Promise<{ readonly containerUrl: string; readonly prefix: string; readonly query: string }> {
		const response = await this._request({ url: buildPublicResolveUrl(profile.assetName, profile.version), method: 'GET' }, signal);
		if (response.status === 404) {
			discardResponse(response);
			throw new LocalModelCatalogError('notPublished');
		}
		const resolved = parsePublicResolveResponse(await this._readJson(response, signal));
		if (!resolved || resolved.archived) {
			throw new LocalModelCatalogError('notPublished');
		}
		// The lookup must answer for exactly this version (the registry's identity; blob annotations copied
		// from an original upload are not), and the version must still be in the local-coding scope.
		if (resolved.assetId !== formatAssetId(PUBLIC_REGISTRY, profile.assetName, profile.version)) {
			throw new LocalModelCatalogError('invalidContent', 'The lookup answered for another model version');
		}
		if (!isLocalCodingModel(resolved.tags, resolved.metadata)) {
			throw new LocalModelCatalogError('notPublished');
		}
		const sas = splitSasUrl(resolved.blobSasUri);
		if (!sas || !isAllowedDownloadUrl(`${sas.containerUrl}?${sas.query}`)) {
			throw new LocalModelCatalogError('invalidContent', 'Unexpected storage location');
		}
		return sas;
	}

	private async _resolve(profile: ILocalModelProfile, signal: AbortSignal): Promise<IResolvedModelVersion> {
		const sas = await this._getContainerSas(profile, signal);
		const listingPrefix = profile.directoryPath ?? sas.prefix;

		const listing = await this._request({ url: buildContainerListUrl(sas, listingPrefix), method: 'GET', headers: BLOB_REQUEST_HEADERS }, signal);
		if (listing.status < 200 || listing.status >= 300) {
			discardResponse(listing);
			throw new LocalModelCatalogError('network', `Listing failed with HTTP ${listing.status} from ${hostForLog(sas.containerUrl)}`);
		}
		const blobs = parseBlobListXml(await this._readText(listing, CONTAINER_LIST_MAX_BYTES, signal));
		if (!blobs) {
			throw new LocalModelCatalogError('invalidContent', 'Container listing over the cap');
		}
		// A `directoryPath` tag or a `modelUri` naming its file fixes the folder; only a bare listing is unwrapped.
		let wrapperFolder: string | undefined;
		if (profile.directoryPath === undefined && profile.modelFileName === undefined) {
			const unwrap = unwrapModelFolder(blobs, listingPrefix);
			if (!unwrap.ok) {
				throw new LocalModelCatalogError('invalidContent', `File selection failed: ${unwrap.reason}`);
			}
			wrapperFolder = unwrap.folder;
		}
		const normalized = filesPrefix(listingPrefix, wrapperFolder);
		const selection = selectModelFiles(blobs, normalized, profile.modelFileName);
		if (!selection.ok) {
			throw new LocalModelCatalogError('invalidContent', `File selection failed: ${selection.reason}`);
		}
		if (selection.config.sizeBytes > PRESET_INI_MAX_BYTES) {
			throw new LocalModelCatalogError('invalidContent', 'Preset too large');
		}
		const configResponse = await this._request({ url: buildBlobUrl(sas, selection.config.name), method: 'GET', headers: BLOB_REQUEST_HEADERS }, signal);
		if (configResponse.status !== 200) {
			discardResponse(configResponse);
			throw new LocalModelCatalogError('network', `Preset download failed with HTTP ${configResponse.status}`);
		}
		const configText = await this._readText(configResponse, PRESET_INI_MAX_BYTES, signal);
		const presetResult = selection.configKind === 'json' ? parseLlamaConfigJson(configText, profile.assetName) : parseLlamaPreset(configText, profile.assetName);
		if (!presetResult.ok) {
			throw new LocalModelCatalogError('invalidContent', 'Preset rejected');
		}
		const preset = presetResult.preset;
		let primary = selection.primary;
		if (preset.primaryModel) {
			// The config names its primary GGUF; a `modelUri` tag naming another one is a conflict.
			const named = blobs.find(blob => blob.name === normalized + preset.primaryModel);
			if (!named || (profile.modelFileName && named !== primary)) {
				throw new LocalModelCatalogError('invalidContent', 'File selection failed: primary');
			}
			primary = named;
		}
		const chosen = [primary, selection.config];
		if (preset.draftModel) {
			const draft = blobs.find(blob => blob.name === normalized + preset.draftModel);
			if (!draft) {
				throw new LocalModelCatalogError('invalidContent', 'Draft model not found');
			}
			chosen.push(draft);
		}
		// The one validation of the file names a resolution returns, before anything uses them (a listing may hold `..\x.gguf`).
		if (!chosen.every(blob => isSafeModelFileName(blob.name.slice(normalized.length)))) {
			throw new LocalModelCatalogError('invalidContent', 'File selection failed: unsafe file name');
		}

		const files: IDownloadFileSpec[] = [];
		for (const blob of chosen) {
			const url = buildBlobUrl(sas, blob.name);
			const head = await this._request({ url, method: 'HEAD', headers: BLOB_REQUEST_HEADERS }, signal);
			discardResponse(head);
			if (head.status === 404) {
				throw new LocalModelCatalogError('notPublished');
			}
			if (head.status < 200 || head.status >= 300) {
				throw new LocalModelCatalogError('network', `HEAD failed with HTTP ${head.status}`);
			}
			const size = Number(head.headers['content-length']);
			const sha256 = normalizeSha256Header(head.headers['x-ms-meta-sha256']);
			if (!sha256) {
				throw new LocalModelCatalogError('noChecksum');
			}
			// Identity is the registry's (the lookup's asset id): blob
			// `x-ms-meta-name`/`version` annotations may be copied from the original upload and are not checked.
			if (!Number.isSafeInteger(size) || size !== blob.sizeBytes) {
				throw new LocalModelCatalogError('invalidContent', 'File facts do not match the listing');
			}
			files.push({ relativePath: blob.name.slice(normalized.length), url, sizeBytes: size, sha256, ...(head.headers.etag ? { etag: head.headers.etag } : {}) });
		}
		const contentId = computeContentId(files.map(file => ({ path: file.relativePath, sizeBytes: file.sizeBytes, sha256: file.sha256 })));
		this._contentFacts.set(sourceKey(profile), {
			contentId,
			files: files.map(file => ({ path: file.relativePath, sizeBytes: file.sizeBytes, sha256: file.sha256, ...(file.etag ? { etag: file.etag } : {}) })),
		});
		this._saveCache();
		return { profile, files, primaryFile: primary.name.slice(normalized.length), preset, contentId, ...(wrapperFolder ? { wrapperFolder } : {}) };
	}

	// #endregion

	// #region Transport

	/** One anonymous request, following redirects manually (<= 5, HTTPS only). */
	private async _request(request: { readonly url: string; readonly method: 'GET' | 'HEAD' | 'POST'; readonly body?: string; readonly headers?: Readonly<Record<string, string>> }, signal: AbortSignal): Promise<ILocalModelHttpResponse> {
		let url = request.url;
		let method = request.method;
		let body = request.body;
		for (let hop = 0; hop <= DOWNLOAD_MAX_REDIRECTS; hop++) {
			const headers: Record<string, string> = { ...request.headers };
			let response: ILocalModelHttpResponse;
			try {
				response = await this._options.http.request({ url, method, headers, body, timeoutMs: REQUEST_TIMEOUT_MS }, signal);
			} catch (error) {
				if (signal.aborted) {
					throw new LocalModelCatalogError('cancelled');
				}
				throw new LocalModelCatalogError('network', `Request to ${hostForLog(url)} failed (${errorCodeForLog(error)})`);
			}
			const location = response.headers.location;
			if (response.status >= 300 && response.status < 400 && location) {
				discardResponse(response);
				const next = new URL(location, url);
				if (next.protocol !== 'https:') {
					throw new LocalModelCatalogError('network', 'Refusing a non-HTTPS redirect');
				}
				url = next.toString();
				if (response.status === 303) {
					method = 'GET';
					body = undefined;
				}
				continue;
			}
			if (response.status >= 500) {
				discardResponse(response);
				throw new LocalModelCatalogError('network', `HTTP ${response.status} from ${hostForLog(url)}`);
			}
			return response;
		}
		throw new LocalModelCatalogError('network', 'Too many redirects');
	}

	private async _readJson(response: ILocalModelHttpResponse, signal: AbortSignal): Promise<unknown> {
		if (response.status < 200 || response.status >= 300) {
			discardResponse(response);
			throw new LocalModelCatalogError('network', `HTTP ${response.status}`);
		}
		const text = await this._readText(response, JSON_RESPONSE_MAX_BYTES, signal);
		try {
			return JSON.parse(text);
		} catch {
			throw new LocalModelCatalogError('network', 'Malformed JSON');
		}
	}

	private async _readText(response: ILocalModelHttpResponse, maxBytes: number, signal: AbortSignal): Promise<string> {
		try {
			return await readResponseText(response, maxBytes, signal);
		} catch (error) {
			throw signal.aborted ? new LocalModelCatalogError('cancelled') : new LocalModelCatalogError('network', `Reading the response failed (${errorCodeForLog(error)})`);
		}
	}

	// #endregion

	// #region Cache and telemetry

	private _loadCache(): void {
		const cache = asRecord(this._options.storage?.get<unknown>(CATALOG_CACHE_KEY));
		if (!cache || cache.schemaVersion !== CATALOG_CACHE_SCHEMA_VERSION || typeof cache.refreshedAt !== 'number' || !Array.isArray(cache.publicProfiles)) {
			return;
		}
		// Every restored entry is validated again (identifiers, no credential); a failing one is dropped alone.
		const profiles = cache.publicProfiles.map(readCachedProfile);
		this._publicProfiles = profiles.filter((profile): profile is ILocalModelProfile => profile?.registry === PUBLIC_REGISTRY);
		this._publicState = this._publicProfiles.length ? 'ready' : 'empty';
		this._refreshedAt = cache.refreshedAt;
		let dropped = profiles.filter(profile => !profile).length;
		for (const [key, value] of Object.entries(asRecord(cache.contentFacts) ?? {})) {
			const facts = readCachedContentFacts(key, value);
			if (facts) {
				this._contentFacts.set(key, facts);
			} else {
				dropped++;
			}
		}
		reportDroppedStorageEntries(this._options.log, CATALOG_CACHE_KEY, dropped);
	}

	private _saveCache(): void {
		if (!this._options.storage || this._refreshedAt === undefined) {
			return;
		}
		// Content facts hold no URLs. Belt and braces: an entry that holds anything credential-like is never written.
		const profiles = dropCredentialItems(this._publicProfiles);
		const facts = dropCredentialEntries(Object.fromEntries(this._contentFacts));
		reportDroppedStorageEntries(this._options.log, CATALOG_CACHE_KEY, profiles.dropped + facts.dropped);
		const cache: ICatalogCacheV2 = {
			schemaVersion: CATALOG_CACHE_SCHEMA_VERSION,
			refreshedAt: this._refreshedAt,
			publicState: this._publicState,
			publicProfiles: profiles.kept,
			contentFacts: facts.kept,
		};
		try {
			this._options.storage.set(CATALOG_CACHE_KEY, cache);
		} catch (error) {
			this._options.log.warn(`[LocalModelCatalog] Could not cache the catalog (${errorCodeForLog(error)})`);
		}
	}

	private _reportTelemetry(started: number): void {
		if (!this._options.telemetry) {
			return;
		}
		reportLocalModelCatalog(this._options.telemetry, {
			public: this._publicState,
			families: this.merge([], undefined).length,
			durationMs: Math.max(0, this._now() - started),
		});
	}
	// #endregion
}

/** `localModel.catalog`, one per refresh. No model names or accounts. */
export interface ILocalModelCatalogEvent {
	public: string;
	families: number;
	durationMs: number;
}

type LocalModelCatalogClassification = {
	public: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'State of the Azure ML registry query: ready, empty or unavailable.' };
	families: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of merged model families in the catalog.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Duration of the catalog refresh in milliseconds.' };
	owner: 'lramos15';
	comment: 'On-device model catalog health of the Azure ML registry.';
};
export function reportLocalModelCatalog(telemetryService: Pick<ITelemetryService, 'publicLog2'>, event: ILocalModelCatalogEvent): void {
	telemetryService.publicLog2<ILocalModelCatalogEvent, LocalModelCatalogClassification>('localModel.catalog', event);
}

// #endregion
