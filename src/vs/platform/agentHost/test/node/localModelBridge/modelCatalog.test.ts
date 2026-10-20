/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { newWriteableBufferStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import type { ILocalModelHttpClient, ILocalModelHttpRequest, ILocalModelHttpResponse } from '../../../node/copilot/localModelBridge/shim/downloader.js';
import { buildSyntheticGguf } from '../../../node/copilot/localModelBridge/shim/gguf.js';
import { parseLlamaPreset } from '../../../node/copilot/localModelBridge/shim/llamaPreset.js';
import { buildTagSearchBody, computeCatalogState, computeContentId, deriveCapiId, isSafeLicenseUrl, isServingCompatible, LocalModelCatalogError, mergeCatalogFamilies, ModelCatalog, parseBlobListXml, sanitizeDisplayName, selectModelFiles, sourceKey, unwrapModelFolder, validateLocalModelVersion, type ICatalogInstallFact, type ILocalModelProfile, type IMergeInput } from '../../../node/copilot/localModelBridge/shim/modelCatalog.js';

// #region Fixtures

/** A registry version: its typed system metadata (eligibility and published facts) and its tags (optional serving hints). */
interface IVersionFixture {
	readonly metadata?: Readonly<Record<string, unknown>>;
	readonly tags: Readonly<Record<string, string>>;
}

/** A copy of `source` with `changes` applied; an `undefined` value removes the key. */
function override<T>(source: Readonly<Record<string, T>>, changes: Readonly<Record<string, T | undefined>> = {}): Record<string, T> {
	const result: Record<string, T> = { ...source };
	for (const [key, value] of Object.entries(changes)) {
		if (value === undefined) {
			delete result[key];
		} else {
			result[key] = value;
		}
	}
	return result;
}

function withVersion(base: IVersionFixture, changes: { readonly metadata?: Readonly<Record<string, unknown>>; readonly tags?: Readonly<Record<string, string | undefined>> }): IVersionFixture {
	return { metadata: override(base.metadata ?? {}, changes.metadata), tags: override(base.tags, changes.tags) };
}

/** A model published for GitHub Copilot local use. */
const MAI: IVersionFixture = {
	metadata: {
		githubCopilotLocal: true,
		modelFlavor: 'GGUF',
		supportsToolCalling: true,
		displayName: 'MAI Code 1.1 Flash',
		githubCopilotLocalRequirements: { downloadBytes: 56_688_835_228, peakDiskBytes: 58_000_000_000, recommendedVramBytes: 62_000_000_000 },
		maxInputTokens: 200_000,
		textContextWindow: 262_144,
		maxOutputTokens: 32_768,
		license: 'MAI Model License',
	},
	tags: { licenseUrl: 'https://example.com/mai-license', directoryPath: 'mai-code-1.1-flash/3' },
};

/** A model outside the Auto allowlist, served from llama.cpp b11000. */
const EXAMPLE = withVersion(MAI, {
	metadata: { displayName: 'Example Coder', githubCopilotLocalRequirements: { downloadBytes: 56_688_835_228, peakDiskBytes: 58_000_000_000, recommendedVramBytes: 30_000_000_000 } },
	tags: { minLlamaCppBuild: 'b11000', directoryPath: 'example/2' },
});
const OTHER = withVersion(MAI, { metadata: { displayName: 'Some Other Coder' }, tags: { directoryPath: 'other/1' } });

const MAI_INI = 'version = 1\n[MAI-Code-1.1-Flash]\nctx-size = 262144\nparallel = 1\nspec-type = draft-dflash\nspec-draft-n-max = 3\nn-gpu-layers = all\nfit = off\nmodel-draft = dflash-v3-lc1.gguf\njinja = true\n';
const MAI_FILES = [
	{ name: 'MAI-Code-1.1-Flash-Q2-XS.gguf', size: 56_307_620_832, sha: 'a'.repeat(64) },
	{ name: 'dflash-v3-lc1.gguf', size: 381_214_016, sha: 'b'.repeat(64) },
	{ name: 'llama-default.ini', size: MAI_INI.length, sha: 'c'.repeat(64) },
];

/*
 * The production registry as served on 2026-10-15 (anonymous search row, lookup, container listing, HEAD metadata and
 * `llama-config.json`), SAS removed and the license text shortened.
 */
const PROD_ASSET_ID = 'azureml://registries/azureml/models/MAI-Code-1.1-Flash-On-Device/versions/2';
const PROD_LICENSE_TEXT = 'MIT License Copyright (c) Microsoft Corporation. Permission is hereby granted, free of charge, to any person obtaining a copy of this software.';
const PROD_TAGS = {
	author: 'Microsoft', task: 'chat-completion', license: 'MIT', displayName: 'MAI Code 1.1 Flash', textContextWindow: '256000', maxOutputTokens: '128000',
	modelCapabilities: 'tool-calling', keywords: 'Coding', licenseDescription: PROD_LICENSE_TEXT, model_flavor: 'GGUF', supportsToolCalling: 'true',
};
const PROD_METADATA = {
	publisher: 'Microsoft', modelCapabilities: ['tool-calling'], license: 'MIT', inferenceTasks: ['chat-completion'], displayName: 'MAI Code 1.1 Flash',
	textContextWindow: 256000, maxOutputTokens: 128000, maxInputTokens: 128000, keywords: ['Coding'], licenseDescription: PROD_LICENSE_TEXT,
	githubCopilotLocal: true, githubCopilotLocalRequirements: { downloadBytes: 56_688_835_352, peakDiskBytes: 56_688_835_352, recommendedVramBytes: 96_636_764_160 },
	modelFlavor: 'GGUF', supportsToolCalling: true, directoryPath: null, domain: ['Code & Software Engineering'], foundryLocal: null, minFLVersion: null,
};
const PROD_SEARCH_ROW = {
	entityId: 'azureml://registries/b98c40bc-36d6-4175-b131-bad4502fe1a3/type/models/objectId/MAI-Code-1.1-Flash-On-Device/version/2',
	kind: 'Versioned',
	assetId: PROD_ASSET_ID,
	annotations: { invisibleUntil: '0001-01-01T00:00:00+00:00', archived: false, tags: PROD_TAGS, systemCatalogData: PROD_METADATA, labels: ['default', 'latest', 'invisibleLatest'], name: 'MAI-Code-1.1-Flash-On-Device' },
	properties: { creationContext: { createdTime: '2026-10-13T17:13:43.6212571+00:00' }, id: 'MAI-Code-1.1-Flash-On-Device:2', name: 'MAI-Code-1.1-Flash-On-Device', modelFormat: 'CUSTOM', version: 2, alphanumericVersion: '2' },
};
const PROD_CONTAINER = 'https://amlwlrt4use01.blob.core.windows.net/azureml-830b67f9-ff2c-555a-bf22-798f82eb69e3';
/** `llama-config.json` (504 bytes, CRLF). */
const PROD_LLAMA_CONFIG = JSON.stringify({
	model: 'MAI-Code-1.1-Flash-Q2-XS.gguf', draftModel: 'dflash-v3-lc1.gguf', ctxSize: 262144, parallel: 1, nGpuLayers: 999,
	args: ['--spec-type', 'draft-dflash', '--spec-draft-n-max', '3', '--spec-draft-p-min', '0.2', '--spec-draft-ngl', 'all', '--flash-attn', 'on', '--batch-size', '2048', '--ubatch-size', '2048', '--fit', 'off', '--ctx-checkpoints', '0', '--no-host'],
}, undefined, 2).replace(/\n/g, '\r\n') + '\r\n';
/** The files sit at the container root; the blobs carry annotations copied from the original upload (`MAI-Code-1.1-Flash`, version 5). */
const PROD_FILES = [
	{ name: 'MAI-Code-1.1-Flash-Q2-XS.gguf', size: 56_307_620_832, sha: '048788de4848e92c7a543feb1c5e0c9144515ac8a3fec1508d5857d25b0e556e', etag: '"0x8DF294D539EBDD4"' },
	{ name: 'dflash-v3-lc1.gguf', size: 381_214_016, sha: '7052df547898b46fab3ff23f8c1085547003116899506099467f948debb75b15', etag: '"0x8DF294C36B7FEBD"' },
	{ name: 'llama-config.json', size: 504, sha: 'afcfce372a09bfa79f8b655f048eadd12b2551a4d656d8bd8e6b662e2598fa96', etag: '"0x8DF294C3559E4E5"' },
];
/** The same files in one `5/` packaging folder, as version 1 was served on 2026-10-12. */
const PROD_WRAPPED_FILES = PROD_FILES.map(file => ({ ...file, name: `5/${file.name}` }));

function profile(registry: 'azureml', assetName: string, version: string, fixture: IVersionFixture = MAI): ILocalModelProfile {
	const result = validateLocalModelVersion(fixture.metadata, { registry, assetName, version, tags: fixture.tags });
	if (!result.ok) {
		throw new Error(result.reason);
	}
	return result.profile;
}

function searchHit(registry: string, name: string, version: string, fixture: IVersionFixture, archived = false) {
	return { assetId: `azureml://registries/${registry}/models/${name}/versions/${version}`, annotations: { tags: fixture.tags, ...(fixture.metadata ? { systemCatalogData: fixture.metadata } : {}), archived }, properties: { name, creationContext: { createdTime: '2026-09-01T00:00:00Z' } } };
}

function blobList(prefix: string, files: readonly { name: string; size: number }[]): string {
	return `<?xml version="1.0" encoding="utf-8"?><EnumerationResults ContainerName="models"><Prefix>${prefix}</Prefix><Blobs>${files.map(file => `<Blob><Name>${prefix}${file.name}</Name><Properties><Content-Length>${file.size}</Content-Length></Properties></Blob>`).join('')}</Blobs><NextMarker /></EnumerationResults>`;
}

interface IReply {
	readonly status: number;
	readonly headers?: Record<string, string>;
	readonly json?: unknown;
	readonly text?: string;
}

class FakeHttp implements ILocalModelHttpClient {
	readonly requests: ILocalModelHttpRequest[] = [];
	constructor(private readonly _reply: (request: ILocalModelHttpRequest) => IReply | Promise<IReply>) { }
	async request(request: ILocalModelHttpRequest): Promise<ILocalModelHttpResponse> {
		this.requests.push(request);
		const reply = await this._reply(request);
		const body = newWriteableBufferStream();
		body.end(VSBuffer.fromString(reply.text ?? (reply.json !== undefined ? JSON.stringify(reply.json) : '')));
		return { status: reply.status, headers: reply.headers ?? {}, body, abort: () => body.destroy() };
	}
}

/** A registry backend: the public gallery search and lookup, blob listing, INI and HEAD. */
function registryServer(options: {
	readonly publicHits?: readonly unknown[][];
	readonly publicStatus?: number;
	readonly files?: Record<string, readonly { name: string; size: number; sha: string }[]>;
	readonly headOverrides?: (name: string) => Record<string, string> | undefined;
	readonly delayMs?: number;
	readonly ini?: (prefix: string) => string;
	/** The asset id the public lookup answers with (`null`: none); the requested one by default. */
	readonly lookupAssetId?: string | null;
	readonly lookupMetadata?: Readonly<Record<string, unknown>>;
} = {}) {
	return async (request: ILocalModelHttpRequest): Promise<IReply> => {
		if (options.delayMs) {
			await new Promise(resolve => setTimeout(resolve, options.delayMs));
		}
		const url = new URL(request.url);
		if (url.pathname.endsWith('/asset-gallery/v1.0/models')) {
			if (options.publicStatus) {
				return { status: options.publicStatus };
			}
			const body = JSON.parse(request.body ?? '{}');
			const pages = options.publicHits ?? [[]];
			const page = Number(body.continuationToken ?? 0);
			return { status: 200, json: { value: pages[page] ?? [], continuationToken: page + 1 < pages.length ? String(page + 1) : null } };
		}
		if (url.pathname.endsWith('/nonazureaccount')) {
			const assetId = options.lookupAssetId === undefined ? url.searchParams.get('assetId') : options.lookupAssetId;
			return { status: 200, json: { modelEntity: { ...(assetId !== null ? { assetId } : {}), kvTags: MAI.tags, systemMetadata: options.lookupMetadata ?? MAI.metadata, isArchived: false }, blobSasUri: 'https://acct.blob.core.windows.net/models?sv=2024&sig=PUBLICSAS' } };
		}
		if (url.hostname.endsWith('.blob.core.windows.net')) {
			if (url.searchParams.get('comp') === 'list') {
				const prefix = url.searchParams.get('prefix') ?? '';
				return { status: 200, text: blobList(prefix, options.files?.[prefix] ?? MAI_FILES) };
			}
			const name = decodeURIComponent(url.pathname.split('/').pop()!);
			const prefix = decodeURIComponent(url.pathname.split('/').slice(2, -1).join('/')) + '/';
			if (request.method === 'GET' && name === 'llama-default.ini') {
				return { status: 200, text: options.ini?.(prefix) ?? MAI_INI };
			}
			const file = (options.files?.[prefix] ?? MAI_FILES).find(candidate => candidate.name === name);
			if (request.method === 'HEAD' && file) {
				return { status: 200, headers: { 'content-length': String(file.size), 'x-ms-meta-sha256': file.sha, 'etag': `"etag-${name}"`, ...options.headOverrides?.(name) } };
			}
		}
		return { status: 404 };
	};
}

class CapturingLog extends NullLogService {
	readonly messages: string[] = [];
	override info(message: string): void { this.messages.push(message); }
	override warn(message: string): void { this.messages.push(message); }
	override trace(message: string): void { this.messages.push(message); }
	override debug(message: string): void { this.messages.push(message); }
}

function createStorage() {
	const data = new Map<string, unknown>();
	return { data, get: <T>(key: string) => data.get(key) as T | undefined, set: <T>(key: string, value: T) => { data.set(key, value); } };
}

// #endregion

suite('localModel modelCatalog', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createCatalog(http: FakeHttp, options: { storage?: ReturnType<typeof createStorage>; now?: () => number; log?: CapturingLog; telemetry?: { name: string; data: unknown }[]; productVersion?: string } = {}) {
		const catalog = store.add(new ModelCatalog({
			http,
			storage: options.storage,
			log: options.log ?? new NullLogService(),
			productVersion: options.productVersion,
			now: options.now,
			delay: async () => { },
			telemetry: options.telemetry ? { publicLog2: (name: string, data?: unknown) => options.telemetry!.push({ name, data }) } as never : undefined,
		}));
		return { catalog };
	}

	test('version rules: eligibility and published facts come from typed system metadata only, tags add optional hints, and each invalid case is rejected', () => {
		const reasonFor = (changes: Parameters<typeof withVersion>[1]) => {
			const fixture = withVersion(MAI, changes);
			const result = validateLocalModelVersion(fixture.metadata, { registry: 'azureml', assetName: 'MAI-Code-1.1-Flash', version: '3', tags: fixture.tags });
			return result.ok ? 'ok' : result.reason;
		};
		const requirements = (values: Record<string, unknown>) => ({ githubCopilotLocalRequirements: { downloadBytes: 1, peakDiskBytes: 2, recommendedVramBytes: 3, ...values } });
		assert.deepStrictEqual({
			valid: reasonFor({}),
			noMetadata: validateLocalModelVersion(undefined, { registry: 'azureml', assetName: 'MAI-Code-1.1-Flash', version: '3', tags: MAI.tags }),
			notCopilotLocal: reasonFor({ metadata: { githubCopilotLocal: false } }),
			copilotLocalAsText: reasonFor({ metadata: { githubCopilotLocal: 'true' } }),
			notGguf: reasonFor({ metadata: { modelFlavor: 'ONNX' } }),
			// Publisher and keywords no longer scope the catalog, as for the Copilot CLI and app.
			anyPublisher: reasonFor({ metadata: { publisher: 'Contoso', keywords: [] } }),
			// Tags never opt a version in or supply its published facts.
			legacyTagsOnly: reasonFor({ metadata: { githubCopilotLocal: undefined, modelFlavor: undefined }, tags: { localCoding: 'true', modelFormat: 'gguf', githubCopilotLocal: 'true', model_flavor: 'GGUF' } }),
			displayNameTagOnly: reasonFor({ metadata: { displayName: undefined }, tags: { displayName: 'MAI Code 1.1 Flash' } }),
			requirementsTagsOnly: reasonFor({ metadata: { githubCopilotLocalRequirements: undefined }, tags: { githubCopilotLocalRequirements: '{"downloadBytes":1,"peakDiskBytes":2,"recommendedVramBytes":3}', downloadBytes: '1', peakDiskBytes: '2', recommendedVramBytes: '3' } }),
			noToolCalls: reasonFor({ metadata: { supportsToolCalling: false } }),
			toolCallsAsText: reasonFor({ metadata: { supportsToolCalling: 'true' } }),
			noDisplayName: reasonFor({ metadata: { displayName: undefined } }),
			longDisplayName: reasonFor({ metadata: { displayName: 'x'.repeat(101) } }),
			urlDisplayName: reasonFor({ metadata: { displayName: 'Other https://acct.blob.core.windows.net/c?sig=SECRET' } }),
			sasDisplayName: reasonFor({ metadata: { displayName: 'Model sv=2024&sig=SECRET' } }),
			peakBelowDownload: reasonFor({ metadata: requirements({ downloadBytes: 2, peakDiskBytes: 1 }) }),
			nonIntegerSize: reasonFor({ metadata: requirements({ downloadBytes: 5.5 }) }),
			sizeAsText: reasonFor({ metadata: requirements({ downloadBytes: '1' }) }),
			noVram: reasonFor({ metadata: requirements({ recommendedVramBytes: undefined }) }),
			requirementsAsText: reasonFor({ metadata: { githubCopilotLocalRequirements: '{"downloadBytes":1,"peakDiskBytes":2,"recommendedVramBytes":3}' } }),
			// Unlike the Copilot CLI, which lists such a version with its requirements marked unpublished.
			noRequirements: reasonFor({ metadata: { githubCopilotLocalRequirements: undefined } }),
			nullRequirements: reasonFor({ metadata: { githubCopilotLocalRequirements: null } }),
			promptOverWindow: reasonFor({ metadata: { maxInputTokens: 300_000 } }),
			zeroOutput: reasonFor({ metadata: { maxOutputTokens: 0 } }),
			limitAsText: reasonFor({ metadata: { textContextWindow: '262144' } }),
			httpLicense: reasonFor({ tags: { licenseUrl: 'http://example.com/license' } }),
			localhostLicense: reasonFor({ tags: { licenseUrl: 'https://localhost/license' } }),
			signedLicense: reasonFor({ tags: { licenseUrl: 'https://acct.blob.core.windows.net/license?sv=2024&sig=SECRET' } }),
			queryLicense: reasonFor({ tags: { licenseUrl: 'https://example.com/license?view=full' } }),
			license: [profile('azureml', 'MAI-Code-1.1-Flash', '3').licenseName, profile('azureml', 'MAI-Code-1.1-Flash', '3', withVersion(MAI, { metadata: { licenseDescription: 'MIT License at https://opensource.org/license/mit' }, tags: { licenseUrl: undefined } })).licenseUrl],
			// The `autoLocalCapiId` tag is not honoured: the CAPI id comes from the asset name only.
			ignoredAutoId: profile('azureml', 'MAI-Code-1.1-Flash', '3', withVersion(MAI, { tags: { autoLocalCapiId: 'other-model-local' } })).capiId,
			ignoredBadAutoId: reasonFor({ tags: { autoLocalCapiId: 'model&sv=2024&sig=SECRET-local' } }),
			badMinBuild: reasonFor({ tags: { minLlamaCppBuild: 'latest' } }),
			traversal: reasonFor({ tags: { directoryPath: '../../etc' } }),
			sanitized: sanitizeDisplayName('  MAI\u202E Code\u0007   Flash  '),
			registryName: profile('azureml', 'MAI-Code-1.1-Flash', '3').displayName,
			noOverride: profile('azureml', 'Example-Coder', '2', EXAMPLE).displayName,
		}, {
			valid: 'ok',
			noMetadata: { ok: false, reason: 'noMetadata' },
			notCopilotLocal: 'scope',
			copilotLocalAsText: 'scope',
			notGguf: 'scope',
			anyPublisher: 'ok',
			legacyTagsOnly: 'scope',
			displayNameTagOnly: 'metadata:displayName',
			requirementsTagsOnly: 'requirementsUnpublished',
			noToolCalls: 'metadata:supportsToolCalling',
			toolCallsAsText: 'metadata:supportsToolCalling',
			noDisplayName: 'metadata:displayName',
			longDisplayName: 'metadata:displayName',
			urlDisplayName: 'metadata:displayName',
			sasDisplayName: 'metadata:displayName',
			peakBelowDownload: 'metadata:requirements',
			nonIntegerSize: 'metadata:requirements',
			sizeAsText: 'metadata:requirements',
			noVram: 'metadata:requirements',
			requirementsAsText: 'metadata:requirements',
			noRequirements: 'requirementsUnpublished',
			nullRequirements: 'requirementsUnpublished',
			promptOverWindow: 'metadata:limits',
			zeroOutput: 'metadata:limits',
			limitAsText: 'metadata:limits',
			httpLicense: 'tag:licenseUrl',
			localhostLicense: 'tag:licenseUrl',
			signedLicense: 'tag:licenseUrl',
			queryLicense: 'ok',
			license: ['MAI Model License', 'https://opensource.org/license/mit'],
			ignoredAutoId: 'mai-code-1.1-flash-local',
			ignoredBadAutoId: 'ok',
			badMinBuild: 'tag:minLlamaCppBuild',
			traversal: 'tag:directoryPath',
			sanitized: 'MAI Code Flash',
			registryName: 'MAI Code 1.1 Flash',
			noOverride: 'Example Coder',
		});
	});

	test('capiId derivation: the asset name only, lowercased, -on-device replaced by -local, -local never doubled (the table shared with the Copilot CLI and app); the KNOWN_AUTO_LOCAL_IDS gate and serving compatibility', () => {
		const other = profile('azureml', 'Some-Coder', '1', OTHER);
		const otherWithMin = profile('azureml', 'Some-Coder', '1', withVersion(OTHER, { tags: { minLlamaCppBuild: 'b11000' } }));
		// The CAPI id cases the Copilot CLI and app share.
		const table: [string, string][] = [
			['MAI-Code-1.1-Flash-On-Device', 'mai-code-1.1-flash-local'],
			['mai-code-1.1-flash-on-device', 'mai-code-1.1-flash-local'],
			['MAI-Code-1.1-Flash-ON-DEVICE', 'mai-code-1.1-flash-local'],
			['MAI-Code-1.1-Flash', 'mai-code-1.1-flash-local'],
			['mai-code-1.1-flash', 'mai-code-1.1-flash-local'],
			['MAI-Code-1.1-Flash-local', 'mai-code-1.1-flash-local'],
			['mai-code-1.1-flash-LOCAL', 'mai-code-1.1-flash-local'],
			['example-coder', 'example-coder-local'],
			['Example-Coder-Local', 'example-coder-local'],
			['Qwen3.5-4B-Q4-K-M', 'qwen3.5-4b-q4-k-m-local'],
			['phi-4-mini', 'phi-4-mini-local'],
			['local', 'local-local'],
			['on-device', 'local'],
			['phi-local-4', 'phi-local-4-local'],
			['phi-on-device-4', 'phi-on-device-4-local'],
			['phi-4-LOCAL', 'phi-4-local'],
		];
		assert.deepStrictEqual({
			table: table.filter(([name, expected]) => deriveCapiId(name) !== expected),
			productionMai: [profile('azureml', 'MAI-Code-1.1-Flash-On-Device', '1').capiId, profile('azureml', 'MAI-Code-1.1-Flash-On-Device', '1').autoCapable],
			bareOnDevice: validateLocalModelVersion(MAI.metadata, { registry: 'azureml', assetName: 'on-device', version: '1', tags: MAI.tags }).ok,
			maiAuto: profile('azureml', 'mai-code-1.1-flash', '1').autoCapable,
			otherAuto: [other.capiId, other.autoCapable],
			compatible: {
				known: isServingCompatible(profile('azureml', 'mai-code-1.1-flash', '1'), undefined),
				unknownNoMin: isServingCompatible(other, 11459),
				unknownMinNoBuild: isServingCompatible(otherWithMin, undefined),
				unknownMinMet: isServingCompatible(otherWithMin, 11459),
				unknownMinNotMet: isServingCompatible(otherWithMin, 10999),
			},
			mergedWithoutBuild: mergeCatalogFamilies({ profiles: [other], installs: [], contentIds: new Map(), resolvedLlamaCppBuild: undefined }).length,
		}, {
			table: [],
			productionMai: ['mai-code-1.1-flash-local', true],
			// `local` is not a valid `-local` CAPI id: such an asset is skipped.
			bareOnDevice: false,
			maiAuto: true,
			otherAuto: ['some-coder-local', false],
			compatible: { known: true, unknownNoMin: false, unknownMinNoBuild: false, unknownMinMet: true, unknownMinNotMet: false },
			mergedWithoutBuild: 0,
		});
	});

	test('merge: one row per family with its offered build, install and update', () => {
		const pub = profile('azureml', 'MAI-Code-1.1-Flash-On-Device', '1');
		const pubNext = profile('azureml', 'MAI-Code-1.1-Flash-On-Device', '2');
		const example = profile('azureml', 'Example-Coder', '2', EXAMPLE);
		const install = (contentId: string, channelVersion: string): ICatalogInstallFact => ({ familyId: 'mai-code-1.1-flash-local', assetName: 'MAI-Code-1.1-Flash-On-Device', contentId, channelVersion, owned: true, adopted: false });
		const merge = (input: Partial<IMergeInput>) => mergeCatalogFamilies({ profiles: [], installs: [], contentIds: new Map(), resolvedLlamaCppBuild: 11459, ...input }).map(family => ({
			familyId: family.familyId,
			offer: family.offer ? `${family.offer.registry}:${family.offer.version}` : undefined,
			install: family.install?.channelVersion,
			update: family.update ? `${family.update.registry}:${family.update.version}` : undefined,
		}));
		const ids = (entries: [ILocalModelProfile, string][]) => new Map(entries.map(([p, id]) => [sourceKey(p), id]));
		assert.deepStrictEqual({
			offered: merge({ profiles: [pub, example] }),
			exampleWithOldBuild: merge({ profiles: [example], resolvedLlamaCppBuild: 10999 }),
			installedVersion: merge({ profiles: [pub], installs: [install('X', '1')] }),
			newerVersion: merge({ profiles: [pubNext], installs: [install('X', '1')], contentIds: ids([[pubNext, 'Y']]) }),
			newerVersionSameContent: merge({ profiles: [pubNext], installs: [install('X', '1')], contentIds: ids([[pubNext, 'X']]) }),
			newerVersionUnresolved: merge({ profiles: [pubNext], installs: [install('X', '1')] }),
			installOnly: merge({ installs: [install('X', '1')] }),
		}, {
			offered: [
				{ familyId: 'example-coder-local', offer: 'azureml:2', install: undefined, update: undefined },
				{ familyId: 'mai-code-1.1-flash-local', offer: 'azureml:1', install: undefined, update: undefined },
			],
			exampleWithOldBuild: [],
			installedVersion: [{ familyId: 'mai-code-1.1-flash-local', offer: 'azureml:1', install: '1', update: undefined }],
			newerVersion: [{ familyId: 'mai-code-1.1-flash-local', offer: 'azureml:2', install: '1', update: 'azureml:2' }],
			newerVersionSameContent: [{ familyId: 'mai-code-1.1-flash-local', offer: 'azureml:2', install: '1', update: undefined }],
			newerVersionUnresolved: [{ familyId: 'mai-code-1.1-flash-local', offer: 'azureml:2', install: '1', update: 'azureml:2' }],
			installOnly: [{ familyId: 'mai-code-1.1-flash-local', offer: undefined, install: '1', update: undefined }],
		});
	});

	test('public search: request shape, paging, archived, invalid and other registries\' hits skipped; the User-Agent names VS Code', async () => {
		const http = new FakeHttp(registryServer({
			publicHits: [
				[searchHit('azureml', 'mai-code-1.1-flash', '1', MAI), searchHit('azureml', 'Archived-Model', '1', OTHER, true), searchHit('other-registry', 'Other-Coder', '1', MAI)],
				[searchHit('azureml', 'Broken', '1', withVersion(MAI, { metadata: { supportsToolCalling: false } })), searchHit('azureml', 'Example-Coder', '2', EXAMPLE)],
			]
		}));
		const { catalog } = createCatalog(http, { productVersion: '1.143.0' });
		const snapshot = await catalog.refresh({});
		const first = http.requests[0];
		const body = JSON.parse(first.body!);
		const unversionedHttp = new FakeHttp(registryServer({ publicHits: [[searchHit('azureml', 'mai-code-1.1-flash', '1', MAI)]] }));
		await createCatalog(unversionedHttp).catalog.refresh({});
		assert.deepStrictEqual({
			state: snapshot.publicState,
			profiles: snapshot.publicProfiles.map(p => `${p.registry}/${p.assetName}:${p.version}`),
			pages: http.requests.map(r => JSON.parse(r.body!).continuationToken ?? null),
			method: first.method,
			userAgent: first.headers?.['User-Agent'],
			userAgentWithoutVersion: unversionedHttp.requests[0].headers?.['User-Agent'],
			fullContracts: first.headers?.['x-ms-use-full-service-contracts'],
			auth: http.requests.some(r => r.headers?.Authorization),
			filters: body.filters.map((f: { field: string; values: string[] }) => `${f.field}=${f.values.join(',')}`),
			sameAsBuilder: first.body === buildTagSearchBody(undefined),
		}, {
			state: 'ready',
			profiles: ['azureml/mai-code-1.1-flash:1', 'azureml/Example-Coder:2'],
			pages: [null, '1'],
			method: 'POST',
			userAgent: 'VSCode/1.143.0',
			userAgentWithoutVersion: 'VSCode',
			fullContracts: 'true',
			auth: false,
			// The Copilot CLI's filter: eligibility is checked per hit, so a newer version that opted out is still seen.
			filters: ['type=models', 'kind=Versioned', 'labels=latest', 'annotations/systemCatalogData/modelFlavor=GGUF'],
			sameAsBuilder: true,
		});
	});
	test('public search: a model labeled latest at more than one version is hidden until the index settles, counting versions before eligibility and across pages; a repeated row counts once', async () => {
		const log = new CapturingLog();
		const optedOut = withVersion(MAI, { metadata: { githubCopilotLocal: false } });
		const http = new FakeHttp(registryServer({
			publicHits: [
				[
					searchHit('azureml', 'mai-code-1.1-flash', '1', MAI),
					searchHit('azureml', 'two-eligible', '1', MAI), searchHit('azureml', 'two-eligible', '2', MAI),
					searchHit('azureml', 'newer-opted-out', '1', MAI), searchHit('azureml', 'newer-opted-out', '2', optedOut),
					searchHit('azureml', 'newer-without-metadata', '1', MAI), searchHit('azureml', 'newer-without-metadata', '2', { tags: MAI.tags }),
					searchHit('azureml', 'Mixed-Case', '1', MAI), searchHit('azureml', 'mixed-case', '2', MAI),
					searchHit('azureml', 'split-pages', '1', MAI),
					searchHit('azureml', 'repeated-coder', '3', EXAMPLE), searchHit('azureml', 'repeated-coder', '3', EXAMPLE),
				],
				[searchHit('azureml', 'split-pages', '2', MAI)],
			],
		}));
		const { catalog } = createCatalog(http, { log });
		const snapshot = await catalog.refresh({});
		assert.deepStrictEqual({ profiles: snapshot.publicProfiles.map(p => `${p.registry}/${p.assetName}:${p.version}`), logged: log.messages }, {
			profiles: ['azureml/mai-code-1.1-flash:1', 'azureml/repeated-coder:3'],
			logged: [
				'[LocalModelCatalog] Skipping 5 model(s) from azureml labeled latest at more than one version',
			],
		});
	});

	test('registry and catalog states: ready, empty, unavailable', async () => {
		const states = async (server: Parameters<typeof registryServer>[0]) => {
			const { catalog } = createCatalog(new FakeHttp(registryServer(server)));
			const snapshot = await catalog.refresh({});
			return `${snapshot.publicState}/${computeCatalogState(snapshot.publicState, catalog.merge([], undefined).length)}`;
		};
		assert.deepStrictEqual({
			ready: await states({ publicHits: [[searchHit('azureml', 'MAI-Code-1.1-Flash-On-Device', '1', MAI)]] }),
			empty: await states({}),
			down: await states({ publicStatus: 503 }),
			denied: await states({ publicStatus: 403 }),
			// Hits beyond the page limit could make a `latest` label ambiguous, so an incomplete search isn't used.
			pastPageLimit: await states({ publicHits: Array.from({ length: 21 }, (_, page) => [searchHit('azureml', `Model-${page}`, '1', MAI)]) }),
		}, {
			ready: 'ready/ready',
			empty: 'empty/empty',
			down: 'unavailable/unavailable',
			denied: 'unavailable/unavailable',
			pastPageLimit: 'unavailable/unavailable',
		});
	});

	test('24 h cache in Agent Host storage, without SAS URLs', async () => {
		const storage = createStorage();
		let now = 1_000_000;
		const http = new FakeHttp(registryServer({ publicHits: [[searchHit('azureml', 'mai-code-1.1-flash', '1', MAI)]] }));
		const { catalog } = createCatalog(http, { storage, now: () => now });
		const first = await catalog.refresh({});
		await catalog.resolveForSetup(first.publicProfiles[0], new AbortController().signal);
		const requestsAfterFirst = http.requests.length;
		now += 60 * 60_000;
		await catalog.refresh({});
		const requestsAfterCached = http.requests.length;
		now += 24 * 60 * 60_000;
		await catalog.refresh({});
		const persisted = JSON.stringify(storage.data.get('localModel.catalog'));
		const reloaded = createCatalog(new FakeHttp(registryServer()), { storage, now: () => now }).catalog.snapshot;
		assert.deepStrictEqual({
			cachedNoRequests: requestsAfterCached === requestsAfterFirst,
			refreshedAfter24h: http.requests.length > requestsAfterCached,
			persistedHasSas: /sig=|sv=|PUBLICSAS/.test(persisted),
			persistedShape: [Object.keys(JSON.parse(persisted)), JSON.parse(persisted).publicProfiles.map((p: ILocalModelProfile) => p.registry)],
			reloaded: [reloaded.publicState, reloaded.publicProfiles.map(p => p.assetName), reloaded.contentIds.size],
		}, {
			cachedNoRequests: true,
			refreshedAfter24h: true,
			persistedHasSas: false,
			persistedShape: [['schemaVersion', 'refreshedAt', 'publicState', 'publicProfiles', 'contentFacts'], ['azureml']],
			reloaded: ['ready', ['mai-code-1.1-flash'], 1],
		});
	});

	test('review-15 (a): the modelUri tag keeps only a validated file name; a signed or unsafe modelUri rejects the version and never reaches the cache', async () => {
		const tagged = (modelUri: string) => {
			const result = validateLocalModelVersion(MAI.metadata, { registry: 'azureml', assetName: 'mai-code-1.1-flash', version: '1', tags: { ...MAI.tags, modelUri } });
			return result.ok ? { modelFileName: result.profile.modelFileName, uriKeys: Object.keys(result.profile).filter(key => /uri/i.test(key)) } : result.reason;
		};
		const storage = createStorage();
		const http = new FakeHttp(registryServer({
			publicHits: [[
				searchHit('azureml', 'mai-code-1.1-flash', '1', withVersion(MAI, { tags: { modelUri: 'https://acct.blob.core.windows.net/models/mai-code-1.1-flash/3/MAI-Code-1.1-Flash-Q2-XS.gguf?sv=2024&sig=SECRET' } })),
				searchHit('azureml', 'example-coder', '2', withVersion(EXAMPLE, { tags: { modelUri: 'https://acct.blob.core.windows.net/models/example/2/Example.gguf' } })),
			]],
		}));
		const { catalog } = createCatalog(http, { storage, now: () => 1_000_000 });
		const snapshot = await catalog.refresh({});
		const persisted = JSON.stringify(storage.data.get('localModel.catalog'));
		assert.deepStrictEqual({
			plain: tagged('https://acct.blob.core.windows.net/models/m/3/model.gguf'),
			bareName: tagged('model.gguf'),
			signed: tagged('https://acct.blob.core.windows.net/models/m/3/model.gguf?sv=2024&sig=SECRET'),
			encodedSigned: tagged('https://acct.blob.core.windows.net/models/m/3/model.gguf?si=policy&%73ig=SECRET'),
			userinfo: tagged('https://user:SECRET@acct.blob.core.windows.net/models/m/3/model.gguf'),
			traversal: tagged('https://acct.blob.core.windows.net/models/m/3/..\\..\\outside.gguf'),
			directory: tagged('https://acct.blob.core.windows.net/models/m/3/'),
			profiles: snapshot.publicProfiles.map(profile => [profile.assetName, profile.modelFileName]),
			persistedLeaks: /SECRET|sig=|modelUri|:\/\/acct/.test(persisted),
		}, {
			plain: { modelFileName: 'model.gguf', uriKeys: [] },
			bareName: { modelFileName: 'model.gguf', uriKeys: [] },
			signed: 'tag:modelUri',
			encodedSigned: 'tag:modelUri',
			userinfo: 'tag:modelUri',
			traversal: 'tag:modelUri',
			directory: 'tag:modelUri',
			profiles: [['example-coder', 'Example.gguf']],
			persistedLeaks: false,
		});
	});

	test('review-15 (c, e): the cache reader drops each record with an unsafe, mismatched or credential-bearing identity, and logs only a count', async () => {
		const storage = createStorage();
		const mai = profile('azureml', 'mai-code-1.1-flash', '1');
		const example = profile('azureml', 'example-coder', '2', EXAMPLE);
		const files = MAI_FILES.map(file => ({ path: file.name, sizeBytes: file.size, sha256: file.sha }));
		const contentId = computeContentId(files);
		storage.set('localModel.catalog', {
			schemaVersion: 3,
			refreshedAt: 1_000_000,
			publicState: 'ready',
			publicProfiles: [
				mai,
				{ ...example, familyId: 'mai-code-1.1-flash-local' },
				{ ...example, assetName: 'example?sig=SECRET' },
				{ ...example, version: '2?sv=2024&sig=SECRET' },
				{ ...example, licenseUrl: 'https://example.com/license?si=policy&%73ig=SECRET' },
				{ ...example, modelUri: 'https://acct.blob.core.windows.net/models/example/2/Example.gguf?sv=2024&sig=SECRET' },
				{ ...example, notes: 'x%26sig%3DSECRET' },
				{ ...example, modelUri: 'https://acct.blob.core.windows.net/models/example/2/Example.gguf' },
			],
			contentFacts: {
				[sourceKey(mai)]: { contentId, files },
				'azureml/example-coder/2?sv=2024&sig=SECRET': { contentId, files },
				'azureml/example-coder/3': { contentId, files: files.map(file => ({ ...file, etag: '"x"&sig=SECRET' })) },
				'azureml/example-coder/4': { contentId: 'f'.repeat(64), files },
			},
		});
		const log = new CapturingLog();
		const { catalog } = createCatalog(new FakeHttp(registryServer()), { storage, log, now: () => 1_000_000 });
		const snapshot = catalog.snapshot;
		assert.deepStrictEqual({
			profiles: snapshot.publicProfiles.map(p => [p.assetName, p.version, p.familyId, p.modelFileName ?? null, Object.keys(p).some(key => key === 'modelUri' || key === 'notes')]),
			contentIds: [...snapshot.contentIds.keys()],
			license: { encoded: isSafeLicenseUrl('https://example.com/license?si=policy&%73ig=SECRET'), nested: isSafeLicenseUrl('https://example.com/license?%2573ig=SECRET'), benign: isSafeLicenseUrl('https://example.com/license?view=full') },
			logged: log.messages,
		}, {
			profiles: [['mai-code-1.1-flash', '1', 'mai-code-1.1-flash-local', null, false], ['example-coder', '2', 'example-coder-local', 'Example.gguf', false]],
			contentIds: ['azureml/mai-code-1.1-flash/1'],
			license: { encoded: false, nested: false, benign: true },
			logged: ['[LocalModel] Dropped 9 invalid or credential-bearing entries from localModel.catalog'],
		});
	});

	test('file resolution: listing, preset, HEAD facts and contentId; rejections', async () => {
		const pub = profile('azureml', 'mai-code-1.1-flash', '1');
		const resolve = async (options: Parameters<typeof registryServer>[0]) => {
			const { catalog } = createCatalog(new FakeHttp(registryServer(options)));
			try {
				return await catalog.resolveForSetup(pub, new AbortController().signal);
			} catch (error) {
				return error instanceof LocalModelCatalogError ? `${error.code}: ${error.message}` : String(error);
			}
		};
		const resolved = await resolve({});
		assert.deepStrictEqual({
			resolved: typeof resolved === 'string' ? resolved : {
				files: resolved.files.map(file => ({ ...file, url: file.url.replace(/\?.*/, '?<sas>') })),
				primaryFile: resolved.primaryFile,
				draftModel: resolved.preset.draftModel,
				ctxSize: resolved.preset.ctxSize,
				contentId: resolved.contentId === computeContentId(MAI_FILES.map(file => ({ path: file.name, sizeBytes: file.size, sha256: file.sha }))),
			},
			// A regional replica has no checksum: its strong ETag binds the file, and the content is known only once downloaded.
			checksumless: await resolve({ headOverrides: name => name.endsWith('.gguf') ? { 'x-ms-meta-sha256': '' } : undefined }).then(result => typeof result === 'string' ? result : { contentId: result.contentId ?? 'unknown', sha256s: result.files.map(file => file.sha256 ?? `etag ${file.etag}`) }),
			noChecksum: await resolve({ headOverrides: name => name.endsWith('.gguf') ? { 'x-ms-meta-sha256': '', 'etag': 'W/"weak"' } : undefined }),
			// Blob annotations copied from the original upload (another name and version) are not identity.
			copiedAnnotations: await resolve({ headOverrides: () => ({ 'x-ms-meta-name': 'Other-Model', 'x-ms-meta-version': '5' }) }).then(result => typeof result === 'string' || typeof resolved === 'string' ? result : result.contentId === resolved.contentId),
			otherAssetLookup: await resolve({ lookupAssetId: 'azureml://registries/azureml/models/other-model/versions/1' }),
			noLookupAssetId: await resolve({ lookupAssetId: null }),
			outOfScopeLookup: await resolve({ lookupMetadata: { ...MAI.metadata, githubCopilotLocal: false } }),
			sizeMismatch: await resolve({ headOverrides: name => name === 'dflash-v3-lc1.gguf' ? { 'content-length': '1' } : undefined }),
			sharded: await resolve({ files: { 'mai-code-1.1-flash/3/': [{ name: 'MAI-00001-of-00002.gguf', size: 10, sha: 'a'.repeat(64) }, { name: 'llama-default.ini', size: MAI_INI.length, sha: 'c'.repeat(64) }] } }),
			twoInis: await resolve({ files: { 'mai-code-1.1-flash/3/': [...MAI_FILES, { name: 'sub/llama-default.ini', size: 1, sha: 'd'.repeat(64) }, { name: 'LLAMA-DEFAULT.INI', size: 1, sha: 'd'.repeat(64) }] } }),
		}, {
			resolved: {
				files: [
					{ relativePath: 'MAI-Code-1.1-Flash-Q2-XS.gguf', url: 'https://acct.blob.core.windows.net/models/mai-code-1.1-flash/3/MAI-Code-1.1-Flash-Q2-XS.gguf?<sas>', sizeBytes: 56_307_620_832, sha256: 'a'.repeat(64), etag: '"etag-MAI-Code-1.1-Flash-Q2-XS.gguf"' },
					{ relativePath: 'llama-default.ini', url: 'https://acct.blob.core.windows.net/models/mai-code-1.1-flash/3/llama-default.ini?<sas>', sizeBytes: MAI_INI.length, sha256: 'c'.repeat(64), etag: '"etag-llama-default.ini"' },
					{ relativePath: 'dflash-v3-lc1.gguf', url: 'https://acct.blob.core.windows.net/models/mai-code-1.1-flash/3/dflash-v3-lc1.gguf?<sas>', sizeBytes: 381_214_016, sha256: 'b'.repeat(64), etag: '"etag-dflash-v3-lc1.gguf"' },
				],
				primaryFile: 'MAI-Code-1.1-Flash-Q2-XS.gguf',
				draftModel: 'dflash-v3-lc1.gguf',
				ctxSize: 262144,
				contentId: true,
			},
			checksumless: { contentId: 'unknown', sha256s: ['etag "etag-MAI-Code-1.1-Flash-Q2-XS.gguf"', 'c'.repeat(64), 'etag "etag-dflash-v3-lc1.gguf"'] },
			noChecksum: 'noChecksum: noChecksum',
			copiedAnnotations: true,
			otherAssetLookup: 'invalidContent: The lookup answered for another model version',
			noLookupAssetId: 'invalidContent: The lookup answered for another model version',
			outOfScopeLookup: 'notPublished: notPublished',
			sizeMismatch: 'invalidContent: File facts do not match the listing',
			sharded: 'invalidContent: File selection failed: primary',
			twoInis: 'invalidContent: File selection failed: ini',
		});
	});

	test('a listed name that would leave the version directory (backslash traversal, device name) is rejected at resolution, before any HEAD', async () => {
		const pub = profile('azureml', 'mai-code-1.1-flash', '1');
		const resolveWith = async (primaryName: string) => {
			const http = new FakeHttp(registryServer({ files: { 'mai-code-1.1-flash/3/': [{ name: primaryName, size: 60_000_000_000, sha: 'e'.repeat(64) }, ...MAI_FILES] } }));
			const { catalog } = createCatalog(http);
			const outcome = await catalog.resolveForSetup(pub, new AbortController().signal).then(resolved => resolved.files.map(file => file.relativePath), (error: LocalModelCatalogError) => `${error.code}: ${error.message}`);
			return { outcome, heads: http.requests.filter(request => request.method === 'HEAD').length };
		};
		const rejected = { outcome: 'invalidContent: File selection failed: unsafe file name', heads: 0 };
		assert.deepStrictEqual({
			backslashTraversal: await resolveWith('..\\..\\..\\outside.gguf'),
			driveRelative: await resolveWith('C:outside.gguf'),
			deviceName: await resolveWith('NUL.gguf'),
			leadingDot: await resolveWith('.hidden.gguf'),
		}, {
			backslashTraversal: rejected,
			driveRelative: rejected,
			deviceName: rejected,
			leadingDot: rejected,
		});
	});

	test('a skipped search hit is logged by registry and reason only: no name, version, URL or signed parameter reaches the log', async () => {
		const log = new CapturingLog();
		const hit = (name: string, version: string, fixture = MAI) => ({ assetId: `azureml://registries/azureml/models/${name}/versions/${version}`, annotations: { tags: fixture.tags, systemCatalogData: fixture.metadata, archived: false } });
		const hits = [
			hit('model?sig=SECRET1.gguf', '1'),
			hit('mai-code-1.1-flash', 'm.gguf?sv=2024&sig=SECRET2'),
			hit('other', '1&sig=SECRET3'),
			hit('example-coder', '2', withVersion(EXAMPLE, { metadata: { displayName: 'Example https://acct.blob.core.windows.net/c?sig=SECRET4' } })),
		];
		const { catalog } = createCatalog(new FakeHttp(registryServer({ publicHits: [hits] })), { log });
		const snapshot = await catalog.refresh({});
		assert.deepStrictEqual({ profiles: snapshot.publicProfiles.length, logged: log.messages }, {
			profiles: 0,
			logged: [
				'[LocalModelCatalog] Skipping a search hit from azureml (invalidName)',
				'[LocalModelCatalog] Skipping a search hit from azureml (invalidName)',
				'[LocalModelCatalog] Skipping a search hit from azureml (invalidName)',
				'[LocalModelCatalog] Skipping a search hit from azureml (metadata:displayName)',
			],
		});
	});

	test('at most two resolutions run concurrently; telemetry per refresh', async () => {
		const names = ['a-coder', 'b-coder', 'c-coder', 'd-coder', 'e-coder'];
		const active = new Set<string>();
		let maxActive = 0;
		const server = registryServer({ delayMs: 2, ini: prefix => MAI_INI.replace('[MAI-Code-1.1-Flash]', `[${prefix.split('/')[0]}]`) });
		const http = new FakeHttp(async request => {
			const resolveMatch = /models%2F(?<name>[a-e]-coder)%2F/.exec(request.url);
			if (resolveMatch?.groups) {
				active.add(resolveMatch.groups.name);
				maxActive = Math.max(maxActive, active.size);
			}
			const reply = await server(request);
			if (request.method === 'HEAD' && request.url.includes('dflash')) {
				for (const name of names) {
					if (request.url.includes(`/${name}/`)) {
						active.delete(name);
					}
				}
			}
			return reply;
		});
		const telemetry: { name: string; data: unknown }[] = [];
		const { catalog } = createCatalog(http, { telemetry });
		const profiles = names.map(name => profile('azureml', name, '1', withVersion(MAI, { tags: { directoryPath: `${name}/1` } })));
		const results = await Promise.all(profiles.map(p => catalog.resolveForSetup(p, new AbortController().signal).then(() => 'ok', (e: Error) => e.message)));
		await catalog.refresh({});
		assert.deepStrictEqual({ results, maxActive, telemetry: telemetry.map(event => [event.name, (event.data as { public: string }).public, (event.data as { families: number }).families]) }, {
			results: ['ok', 'ok', 'ok', 'ok', 'ok'],
			maxActive: 2,
			telemetry: [['localModel.catalog', 'empty', 0]],
		});
	});

	test('pure parsers: blob listing caps, file selection', () => {
		const tooMany = blobList('p/', Array.from({ length: 201 }, (_, i) => ({ name: `f${i}`, size: 1 })));
		const continued = blobList('p/', [{ name: 'a.gguf', size: 1 }]).replace('<NextMarker />', '<NextMarker>2!abc</NextMarker>');
		assert.deepStrictEqual({
			list: parseBlobListXml(blobList('p/', [{ name: 'a&amp;b.gguf', size: 5 }])),
			tooMany: parseBlobListXml(tooMany),
			continued: parseBlobListXml(continued),
			modelUriWins: selectModelFiles([{ name: 'p/big.gguf', sizeBytes: 100 }, { name: 'p/named.gguf', sizeBytes: 10 }, { name: 'p/llama-default.ini', sizeBytes: 1 }], 'p', 'https://x/p/named.gguf'),
			jsonConfigPreferred: selectModelFiles([{ name: 'big.gguf', sizeBytes: 100 }, { name: 'llama-default.ini', sizeBytes: 1 }, { name: 'llama-config.json', sizeBytes: 2 }], '', undefined),
		}, {
			list: [{ name: 'p/a&b.gguf', sizeBytes: 5 }],
			tooMany: undefined,
			continued: undefined,
			modelUriWins: { ok: true, config: { name: 'p/llama-default.ini', sizeBytes: 1 }, configKind: 'ini', primary: { name: 'p/named.gguf', sizeBytes: 10 } },
			jsonConfigPreferred: { ok: true, config: { name: 'llama-config.json', sizeBytes: 2 }, configKind: 'json', primary: { name: 'big.gguf', sizeBytes: 100 } },
		});
	});

	test('reads the primary GGUF architecture with a Range request on the resolved (SAS) URL', async () => {
		const header = new Uint8Array(1024);
		header.set(buildSyntheticGguf({ 'general.architecture': 'maion-coder' }));
		const http = new FakeHttp(request => request.headers?.Range === 'bytes=0-1023'
			? { status: 206, headers: { 'content-range': 'bytes 0-1023/1024', 'etag': '"e"' }, text: Buffer.from(header).toString('latin1') }
			: { status: 416 });
		const log = new CapturingLog();
		const { catalog } = createCatalog(http, { log });
		const resolvedProfile = profile('azureml', 'MAI-Code-1.1-Flash-On-Device', '1');
		const preset = parseLlamaPreset(MAI_INI, 'MAI-Code-1.1-Flash');
		assert.ok(preset.ok);
		const files = [{ relativePath: 'model.gguf', url: 'https://acct.blob.core.windows.net/c/model.gguf?sv=2024&sig=SAS1', sizeBytes: 1024, sha256: 'a'.repeat(64), etag: '"e"' }];
		const read = await catalog.readPrimaryArchitecture({ profile: resolvedProfile, files, primaryFile: 'model.gguf', preset: preset.preset, contentId: 'c' }, new AbortController().signal);
		assert.deepStrictEqual({
			read,
			requests: http.requests.map(request => [request.method, request.headers?.Range]),
			leaks: log.messages.filter(message => message.includes('sig=') || message.includes('SAS1')),
		}, {
			read: { kind: 'found', architecture: 'maion-coder' },
			requests: [['GET', 'bytes=0-1023']],
			leaks: [],
		});
	});

	/** The production registry from the 2026-10-15 evidence, serving `files`; `sig` counts the lookups (fresh SAS each time). */
	function productionServer(files: readonly { name: string; size: number; sha: string; etag: string }[] = PROD_FILES) {
		let lookups = 0;
		return (request: ILocalModelHttpRequest): IReply => {
			const url = new URL(request.url);
			if (url.pathname.endsWith('/asset-gallery/v1.0/models')) {
				const body = JSON.parse(request.body ?? '{}');
				const filters: string[] = body.filters.map((f: { field: string; values: string[] }) => `${f.field}=${f.values.join(',')}`);
				// The gallery returns full system metadata only on request; the registry's tags carry no eligibility.
				const found = request.headers?.['x-ms-use-full-service-contracts'] === 'true' && filters.includes('annotations/systemCatalogData/modelFlavor=GGUF') && !filters.some(filter => filter.startsWith('annotations/tags/'));
				return { status: 200, json: { totalCount: found ? 1 : 0, value: found ? [PROD_SEARCH_ROW] : [], nextSkip: null, continuationToken: null } };
			}
			if (url.pathname.endsWith('/nonazureaccount')) {
				lookups++;
				return url.searchParams.get('assetId') === PROD_ASSET_ID
					? { status: 200, json: { modelEntity: { assetId: PROD_ASSET_ID, kvTags: PROD_TAGS, systemMetadata: PROD_METADATA, isArchived: false }, blobSasUri: `${PROD_CONTAINER}?sv=2024&sr=c&sp=rl&sig=SAS${lookups}` } }
					: { status: 404 };
			}
			if (`${url.origin}${url.pathname}`.startsWith(PROD_CONTAINER)) {
				if (url.searchParams.get('comp') === 'list') {
					return url.searchParams.get('prefix') === '' ? { status: 200, text: blobList('', files) } : { status: 200, text: blobList('', []) };
				}
				const name = decodeURIComponent(url.pathname.slice(new URL(PROD_CONTAINER).pathname.length + 1));
				const file = files.find(candidate => candidate.name === name);
				if (file && request.method === 'GET' && name.endsWith('llama-config.json')) {
					return { status: 200, text: PROD_LLAMA_CONFIG };
				}
				if (file && request.method === 'HEAD') {
					return { status: 200, headers: { 'content-length': String(file.size), 'etag': file.etag, 'x-ms-meta-name': 'MAI-Code-1.1-Flash', 'x-ms-meta-version': '5', 'x-ms-meta-sha256': file.sha, 'x-ms-meta-upload_status': 'completed' } };
				}
			}
			return { status: 404 };
		};
	}

	test('production registry (2026-10-15 evidence): MAI-Code-1.1-Flash-On-Device v2 validates from its system metadata alone with its published requirements, copied blob annotations are accepted, an install recorded with the same content gets no update, and the same files in one packaging folder (as v1 was served) are unwrapped, also on renewal', async () => {
		// An install whose files the store recorded as this content (version 1 had the same files).
		const recordedInstall: ICatalogInstallFact = {
			familyId: 'mai-code-1.1-flash-local',
			assetName: 'MAI-Code-1.1-Flash',
			contentId: computeContentId([
				{ path: 'MAI-Code-1.1-Flash-Q2-XS.gguf', sizeBytes: 56_307_620_832, sha256: '048788de4848e92c7a543feb1c5e0c9144515ac8a3fec1508d5857d25b0e556e' },
				{ path: 'llama-config.json', sizeBytes: 504, sha256: 'afcfce372a09bfa79f8b655f048eadd12b2551a4d656d8bd8e6b662e2598fa96' },
				{ path: 'dflash-v3-lc1.gguf', sizeBytes: 381_214_016, sha256: '7052df547898b46fab3ff23f8c1085547003116899506099467f948debb75b15' },
			]),
			channelVersion: '1',
			owned: true,
			adopted: false,
		};
		const run = async (files: typeof PROD_FILES) => {
			const { catalog } = createCatalog(new FakeHttp(productionServer(files)));
			const snapshot = await catalog.refresh({});
			const prod = snapshot.publicProfiles[0];
			const resolved = await catalog.resolveForSetup(prod, new AbortController().signal);
			const renewed = await catalog.renewDownloadUrls(resolved, new AbortController().signal);
			const [family] = catalog.merge([recordedInstall], undefined);
			return { catalog, snapshot, prod, resolved, renewed, family };
		};
		const { catalog, snapshot, prod, resolved, renewed, family } = await run(PROD_FILES);
		const wrapped = await run(PROD_WRAPPED_FILES);
		const blobPath = (url: string) => decodeURIComponent(new URL(url).pathname.slice(new URL(PROD_CONTAINER).pathname.length));
		assert.deepStrictEqual({
			configBytes: PROD_LLAMA_CONFIG.length,
			states: [snapshot.publicState, computeCatalogState(snapshot.publicState, catalog.merge([], undefined).length)],
			profile: prod,
			resolved: {
				files: resolved.files.map(file => [file.relativePath, blobPath(file.url), file.sizeBytes, file.sha256?.slice(0, 8), file.etag]),
				primaryFile: resolved.primaryFile,
				wrapperFolder: resolved.wrapperFolder,
				preset: [resolved.preset.primaryModel, resolved.preset.draftModel, resolved.preset.ctxSize, resolved.preset.parallel],
				matchesRecordedInstall: resolved.contentId === recordedInstall.contentId,
			},
			renewed: renewed.map(file => [blobPath(file.url), new URL(file.url).searchParams.get('sig')]),
			family: { familyId: family.familyId, autoCapable: family.autoCapable, offer: `${family.offer?.registry}:${family.offer?.version}`, install: family.install?.channelVersion, update: family.update },
			wrapped: {
				files: wrapped.resolved.files.map(file => [file.relativePath, blobPath(file.url)]),
				wrapperFolder: wrapped.resolved.wrapperFolder,
				renewed: wrapped.renewed.map(file => [blobPath(file.url), new URL(file.url).searchParams.get('sig')]),
				matchesRecordedInstall: wrapped.resolved.contentId === recordedInstall.contentId,
			},
		}, {
			configBytes: 504,
			states: ['ready', 'ready'],
			profile: {
				registry: 'azureml',
				assetName: 'MAI-Code-1.1-Flash-On-Device',
				version: '2',
				capiId: 'mai-code-1.1-flash-local',
				familyId: 'mai-code-1.1-flash-local',
				autoCapable: true,
				displayName: 'MAI Code 1.1 Flash',
				downloadBytes: 56_688_835_352,
				peakDiskBytes: 56_688_835_352,
				recommendedVramBytes: 96_636_764_160,
				maxPromptTokens: 128000,
				maxContextWindowTokens: 256000,
				maxOutputTokens: 128000,
				licenseName: 'MIT',
				createdTime: '2026-10-13T17:13:43.6212571+00:00',
			},
			resolved: {
				files: [
					['MAI-Code-1.1-Flash-Q2-XS.gguf', '/MAI-Code-1.1-Flash-Q2-XS.gguf', 56_307_620_832, '048788de', '"0x8DF294D539EBDD4"'],
					['llama-config.json', '/llama-config.json', 504, 'afcfce37', '"0x8DF294C3559E4E5"'],
					['dflash-v3-lc1.gguf', '/dflash-v3-lc1.gguf', 381_214_016, '7052df54', '"0x8DF294C36B7FEBD"'],
				],
				primaryFile: 'MAI-Code-1.1-Flash-Q2-XS.gguf',
				wrapperFolder: undefined,
				preset: ['MAI-Code-1.1-Flash-Q2-XS.gguf', 'dflash-v3-lc1.gguf', 262144, 1],
				matchesRecordedInstall: true,
			},
			renewed: [
				['/MAI-Code-1.1-Flash-Q2-XS.gguf', 'SAS2'],
				['/llama-config.json', 'SAS2'],
				['/dflash-v3-lc1.gguf', 'SAS2'],
			],
			family: { familyId: 'mai-code-1.1-flash-local', autoCapable: true, offer: 'azureml:2', install: '1', update: undefined },
			wrapped: {
				files: [
					['MAI-Code-1.1-Flash-Q2-XS.gguf', '/5/MAI-Code-1.1-Flash-Q2-XS.gguf'],
					['llama-config.json', '/5/llama-config.json'],
					['dflash-v3-lc1.gguf', '/5/dflash-v3-lc1.gguf'],
				],
				wrapperFolder: '5',
				renewed: [
					['/5/MAI-Code-1.1-Flash-Q2-XS.gguf', 'SAS2'],
					['/5/llama-config.json', 'SAS2'],
					['/5/dflash-v3-lc1.gguf', 'SAS2'],
				],
				matchesRecordedInstall: true,
			},
		});
	});

	test('a single packaging folder is unwrapped only when it is unambiguous', () => {
		const files = (...names: string[]) => names.map(name => ({ name, sizeBytes: 1 }));
		assert.deepStrictEqual({
			wrapped: unwrapModelFolder(files('5/llama-config.json', '5/m.gguf', '5/d.gguf'), ''),
			nested: unwrapModelFolder(files('p/a/b/llama-config.json', 'p/a/b/m.gguf'), 'p'),
			underPrefix: unwrapModelFolder(files('models/x/5/llama-config.json', 'models/x/5/m.gguf'), 'models/x/'),
			iniOnly: unwrapModelFolder(files('5/llama-default.ini', '5/m.gguf'), ''),
			rootFiles: unwrapModelFolder(files('llama-config.json', 'm.gguf'), ''),
			rootAndFolder: unwrapModelFolder(files('m.gguf', '5/llama-config.json'), ''),
			twoFolders: unwrapModelFolder(files('5/llama-config.json', '5/m.gguf', '6/m.gguf'), ''),
			twoConfigs: unwrapModelFolder(files('5/llama-config.json', '6/LLAMA-CONFIG.JSON', '5/m.gguf'), ''),
			noConfig: unwrapModelFolder(files('5/m.gguf'), ''),
			unsafeSegment: unwrapModelFolder(files('../llama-config.json', '../m.gguf'), ''),
			empty: unwrapModelFolder([], ''),
		}, {
			wrapped: { ok: true, folder: '5' },
			nested: { ok: true, folder: 'a/b' },
			underPrefix: { ok: true, folder: '5' },
			iniOnly: { ok: true, folder: '5' },
			rootFiles: { ok: true, folder: undefined },
			rootAndFolder: { ok: true, folder: undefined },
			twoFolders: { ok: false, reason: 'wrapper' },
			twoConfigs: { ok: false, reason: 'wrapper' },
			noConfig: { ok: false, reason: 'wrapper' },
			unsafeSegment: { ok: false, reason: 'wrapper' },
			empty: { ok: true, folder: undefined },
		});
	});

});
