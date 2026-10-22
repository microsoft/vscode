/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotRequestContext } from '@github/copilot-sdk';
import assert from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import * as path from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import { NullTelemetryServiceShape } from '../../../../telemetry/common/telemetryUtils.js';
import { computeLocalModelConsentScope, deriveLocalModelReadiness, type ILocalModelConsent, type ILocalModelFamilyV1, type LocalModelPublicRegistryState } from '../../../common/localModel.js';
import type { IAgentHostProxyResolver } from '../../../node/agentHostProxyResolver.js';
import type { ILocalModelLiveConfig } from '../../../node/copilot/localModelBridge/localModelProvider.js';
import { OPTIONAL_SPEC_FLAGS, REQUIRED_DRAFT_LLAMA_SERVER_FLAGS, REQUIRED_LLAMA_SERVER_FLAGS } from '../../../node/copilot/localModelBridge/shim/constants.js';
import { LocalModelDownloadError, type ILocalModelDownloadRequest, type ILocalModelDownloadResult } from '../../../node/copilot/localModelBridge/shim/downloader.js';
import type { IGpuAdapter, IGpuMemoryProbeOutcome } from '../../../node/copilot/localModelBridge/shim/gpuMemoryProbe.js';
import { buildSyntheticGguf, readGgufArchitectureFromFile, type GgufArchitectureRead, type IGgufModelMetadata } from '../../../node/copilot/localModelBridge/shim/gguf.js';
import { getLlamaServerKey, type ILlamaRuntimeResolution, type LlamaArchitectureSupport } from '../../../node/copilot/localModelBridge/shim/llamaCppRuntime.js';
import { parseLlamaPreset } from '../../../node/copilot/localModelBridge/shim/llamaPreset.js';
import { computeContentId, deriveCapiId, isAutoCapable, LocalModelCatalogError, mergeCatalogFamilies, sourceKey, type ICatalogInstallFact, type ICatalogSnapshot, type ILocalModelProfile, type IMergedCatalogFamily, type IResolvedModelVersion } from '../../../node/copilot/localModelBridge/shim/modelCatalog.js';
import type { IProcessRunner } from '../../../node/copilot/localModelBridge/shim/processRunner.js';
import { ServerSupervisor } from '../../../node/copilot/localModelBridge/shim/serverSupervisor.js';
import type { ILlamaDevice } from '../../../node/copilot/localModelBridge/shim/servingProfile.js';
import { createNodeShimLocalModelProviderHost, ShimLocalModelProvider, type IShimCatalog, type IShimLocalModelProviderHost, type IShimRuntime } from '../../../node/copilot/localModelBridge/shim/shimLocalModelProvider.js';
import { buildManifest, LocalModelStore } from '../../../node/copilot/localModelBridge/shim/store.js';
import { createFakeLlamaFetch, FakeLlamaSpawner, FakeProcessControl, settle, waitFor, type IFakeLlamaServerOptions } from './fakeLlamaServer.js';
import { FakeClock } from './fakeServingAccess.js';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
const LLAMA_SERVER = 'C:\\Users\\u\\AppData\\Local\\Microsoft\\WinGet\\Packages\\ggml.llamacpp_Microsoft.Winget.Source_8wekyb3d8bbwe\\llama-server.exe';
const N1X_NAME = 'NVIDIA RTX Spark N1X (6144-core Blackwell RTX GPU)';
const N1X_ADAPTER: IGpuAdapter = { id: '10de:2e12', description: N1X_NAME, vendorId: 0x10DE, driverVersion: '32.0', capacityBytes: 8_508_145_664 + 101_788_932_505, unifiedMemory: true };
const N1X_VULKAN: ILlamaDevice = { name: 'Vulkan0', description: N1X_NAME, totalBytes: 68784 * MIB, freeBytes: 68784 * MIB, backend: 'vulkan' };
const SYSTEM_MEMORY = Math.round(118.5 * GIB);
const DEFAULT_METADATA: IGgufModelMetadata = { architecture: 'qwen2', blockCount: 24, embeddingLength: 896, headCount: 14, headCountKv: 2, keyLength: 64, valueLength: 64, contextLength: 32768 };

/** stderr of winget b11459 loading the real MAI-Code-1.1-Flash v5 GGUF (`general.architecture = maion-coder`) on the N1X device; exit code 1. */
const STOCK_UNKNOWN_ARCHITECTURE_STDERR = [
	'0.00.093.104 I srv  llama_server: initializing ...',
	'0.00.093.111 I cmn  common_param: common_params_print_info: verbosity = 3 (adjust with the `-lv N` CLI arg)',
	'0.00.102.227 I srv    load_model: loading model \'C:\\models\\MAI-Code-1.1-Flash-Q2-XS.gguf\'',
	'0.00.252.163 E llama_model_load: error loading model: unknown model architecture: \'maion-coder\'',
	'0.00.252.175 E llama_model_load_from_file_impl: failed to load model',
	'0.00.396.095 E srv    load_model: failed to load model, \'C:\\models\\MAI-Code-1.1-Flash-Q2-XS.gguf\'',
	'0.00.397.148 E srv  llama_server: exiting due to model loading error',
	'',
].join('\n');

function sha256(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}

function presetFor(assetName: string, dflash = false, ctxSize = 32768, ctxCheckpoints?: number): string {
	return `version = 1\n[${assetName}]\nctx-size = ${ctxSize}\nparallel = 1\nflash-attn = on\njinja = true\n${ctxCheckpoints !== undefined ? `ctx-checkpoints = ${ctxCheckpoints}\n` : ''}${dflash ? 'spec-type = draft-dflash\nmodel-draft = dflash.gguf\n' : ''}`;
}

/** A catalog model with its resolvable files (`<asset>.gguf` and the preset). */
interface ITestModel {
	readonly profile: ILocalModelProfile;
	readonly files: Readonly<Record<string, string>>;
	/** Every file publishes its checksum, so the content is known before the download. */
	readonly resolved: IResolvedModelVersion & { readonly contentId: string };
}

function createModel(assetName: string, displayName: string, overrides: Partial<ILocalModelProfile> = {}, weights?: string, options: { readonly dflash?: boolean; readonly ctxSize?: number; readonly ctxCheckpoints?: number } = {}): ITestModel {
	const version = overrides.version ?? '1';
	const files: Record<string, string> = { 'model.gguf': weights ?? `${assetName}-${version}-weights`, 'llama-default.ini': presetFor(assetName, options.dflash, options.ctxSize, options.ctxCheckpoints), ...(options.dflash ? { 'dflash.gguf': 'draft-weights' } : {}) };
	const capiId = deriveCapiId(assetName);
	const sizes = Object.values(files).reduce((sum, content) => sum + Buffer.byteLength(content), 0);
	const profile: ILocalModelProfile = {
		registry: 'azureml', assetName, version, capiId, familyId: capiId, autoCapable: isAutoCapable(capiId), displayName,
		downloadBytes: sizes, peakDiskBytes: sizes, recommendedVramBytes: 4 * GIB, maxPromptTokens: 24_000, maxContextWindowTokens: 32_768, maxOutputTokens: 8192,
		...overrides,
	};
	const specs = Object.entries(files).map(([relativePath, content]) => ({ relativePath, url: `https://models.blob.core.windows.net/c/${relativePath}?sig=secret`, sizeBytes: Buffer.byteLength(content), sha256: sha256(content), etag: `"${relativePath}"` }));
	const parsed = parseLlamaPreset(files['llama-default.ini'], assetName);
	assert.ok(parsed.ok);
	return {
		profile,
		files,
		resolved: { profile, files: specs, primaryFile: 'model.gguf', preset: parsed.preset, contentId: computeContentId(specs.map(spec => ({ path: spec.relativePath, sizeBytes: spec.sizeBytes, sha256: spec.sha256 }))) },
	};
}

const MAI = createModel('MAI-Code-1.1-Flash', 'Example Flash 1.0');
/** A second model, outside the Auto allowlist. */
const EXAMPLE = createModel('example-coder', 'Example Coder', { minLlamaCppBuild: 11000 });

class FakeCatalog implements IShimCatalog {
	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange = this._onDidChange.event;
	publicState: LocalModelPublicRegistryState = 'ready';
	models: ITestModel[] = [];
	/** `sourceKey` to `contentId` of the versions the catalog has resolved. */
	readonly contentIds = new Map<string, string>();
	refreshes = 0;
	/** Runs on each refresh: a registry that recovers only once it is queried again. */
	onRefresh: (() => void) | undefined;

	get snapshot(): ICatalogSnapshot {
		return { publicState: this.publicState, publicProfiles: this.models.map(model => model.profile), contentIds: this.contentIds, refreshedAt: 1 };
	}
	isStale(): boolean {
		return false;
	}
	merge(installs: readonly ICatalogInstallFact[], resolvedLlamaCppBuild: number | undefined): IMergedCatalogFamily[] {
		return mergeCatalogFamilies({ profiles: this.snapshot.publicProfiles, installs, contentIds: this.contentIds, resolvedLlamaCppBuild });
	}
	async refresh(): Promise<ICatalogSnapshot> {
		this.refreshes++;
		this.onRefresh?.();
		return this.snapshot;
	}
	async resolveForSetup(profile: ILocalModelProfile): Promise<IResolvedModelVersion> {
		const model = this.models.find(candidate => sourceKey(candidate.profile) === sourceKey(profile));
		if (!model) {
			throw new LocalModelCatalogError('notPublished');
		}
		this.contentIds.set(sourceKey(profile), model.resolved.contentId);
		return model.resolved;
	}
	async renewDownloadUrls(resolved: IResolvedModelVersion) {
		return [...resolved.files];
	}
	/** `general.architecture` the registry's primary GGUF of each asset starts with (default `qwen3`). */
	readonly architectures = new Map<string, GgufArchitectureRead>();
	readonly architectureReads: string[] = [];
	async readPrimaryArchitecture(resolved: IResolvedModelVersion): Promise<GgufArchitectureRead> {
		this.architectureReads.push(resolved.profile.assetName);
		return this.architectures.get(resolved.profile.assetName) ?? { kind: 'found', architecture: 'qwen3' };
	}
	dispose(): void {
		this._onDidChange.dispose();
	}
}

class FakeDownloader {
	readonly requests: ILocalModelDownloadRequest[] = [];
	gate: DeferredPromise<void> | undefined;
	/** Another window holds the family's download lock: the next download fails with `lockedElsewhere`. */
	lockedElsewhere = false;
	/** A holder that died left the family's download lock behind: downloads fail with `staleLock` until it is cleared. */
	staleLock = false;
	/** Family directories whose stale download lock was cleared. */
	readonly cleared: string[] = [];

	async clearStaleLock(familyDir: string): Promise<boolean> {
		this.cleared.push(familyDir);
		this.staleLock = false;
		return true;
	}

	async download(request: ILocalModelDownloadRequest): Promise<ILocalModelDownloadResult> {
		this.requests.push(request);
		if (this.lockedElsewhere) {
			this.lockedElsewhere = false;
			throw new LocalModelDownloadError('lockedElsewhere');
		}
		if (this.staleLock) {
			throw new LocalModelDownloadError('staleLock');
		}
		const totalBytes = request.files.reduce((sum, file) => sum + file.sizeBytes, 0);
		request.onProgress?.({ phase: 'downloading', completedBytes: 0, totalBytes, bytesPerSecond: undefined, fileIndex: 0, fileCount: request.files.length });
		if (this.gate) {
			const gate = this.gate;
			await new Promise<void>((resolve, reject) => {
				const onAbort = () => reject(new LocalModelDownloadError('cancelled'));
				if (request.signal.aborted) {
					onAbort();
					return;
				}
				request.signal.addEventListener('abort', onAbort, { once: true });
				gate.p.then(() => {
					request.signal.removeEventListener('abort', onAbort);
					resolve();
				});
			});
		}
		const model = [...extraModels, MAI, EXAMPLE].find(candidate => request.modelId === `azureml://registries/${candidate.profile.registry}/models/${candidate.profile.assetName}/versions/${candidate.profile.version}`);
		for (const file of request.files) {
			await fs.promises.writeFile(path.join(request.targetDir, file.relativePath), model?.files[file.relativePath] ?? '');
		}
		request.onProgress?.({ phase: 'placing', completedBytes: totalBytes, totalBytes, bytesPerSecond: undefined, fileIndex: request.files.length - 1, fileCount: request.files.length });
		return { downloadedBytes: totalBytes, reusedFiles: [], resumed: false, sasRenewals: 0, sha256s: request.files.map(file => file.sha256!) };
	}
}

/** Models a test adds to the catalog beyond MAI and Example Coder (so the fake downloader can write their files). */
const extraModels: ITestModel[] = [];

class FakeRuntime implements IShimRuntime {
	present = true;
	/** The setting's llama-server lacks required features (`runtimeTooOld`). */
	tooOld = false;
	binary = LLAMA_SERVER;
	/** Modification time of the binary: another one is another build ({@link getLlamaServerKey}). */
	mtimeMs = 1;
	devices: ILlamaDevice[] = [N1X_VULKAN];
	/** `--spec-type` values of the build (`draft-dflash` enables DFlash). */
	specTypes: string[] = [];
	readonly topologyKeys: (string | undefined)[] = [];
	/** Holds the next `listDevices` call (one shot) until completed. */
	listDevicesGate: DeferredPromise<void> | undefined;
	listDevicesWaiting = false;

	async resolve(options: { readonly topologyKey?: string }): Promise<ILlamaRuntimeResolution> {
		this.topologyKeys.push(options.topologyKey);
		if (!this.present) {
			return { runtime: {} };
		}
		if (this.tooOld) {
			return { runtime: {}, error: { code: 'runtimeTooOld', message: 'The llama-server is too old.', actions: ['getLlamaCpp', 'openSettings', 'retry'] } };
		}
		return {
			runtime: { version: '0.6.0-dev (b11459)', backend: 'vulkan' },
			capability: {
				realPath: this.binary, mtimeMs: this.mtimeMs, size: 1, libraries: '', topologyKey: '',
				version: { version: '0.6.0-dev', build: 11459, commit: 'f498f864f' },
				flags: [...REQUIRED_LLAMA_SERVER_FLAGS, ...REQUIRED_DRAFT_LLAMA_SERVER_FLAGS, '--flash-attn', '--ctx-checkpoints', ...(this.specTypes.length ? OPTIONAL_SPEC_FLAGS : [])],
				specTypes: [...this.specTypes],
				devices: this.devices.map(({ name, description, totalBytes, backend }) => ({ name, description, totalBytes, backend })),
			},
		};
	}
	/** Only the current {@link binary} runs: another one (the old target of a retargeted link) is gone. */
	async listDevices(realPath: string): Promise<ILlamaDevice[] | undefined> {
		if (realPath !== this.binary) {
			return undefined;
		}
		const gate = this.listDevicesGate;
		if (gate) {
			this.listDevicesGate = undefined;
			this.listDevicesWaiting = true;
			await gate.p;
			this.listDevicesWaiting = false;
		}
		return this.devices.map(device => ({ ...device }));
	}
	/** What the architecture probe answers per architecture (default `supported`). */
	readonly architectureSupport = new Map<string, LlamaArchitectureSupport>();
	readonly architectureProbes: string[] = [];
	async checkArchitectureSupport(_file: unknown, architecture: string): Promise<LlamaArchitectureSupport> {
		this.architectureProbes.push(architecture);
		return this.architectureSupport.get(architecture) ?? 'supported';
	}
	/** The user set up a usable llama.cpp: it is resolved and qualifies. */
	provide(): void {
		this.present = true;
		this.tooOld = false;
	}
}
class FakeGpuProbe {
	adapters: IGpuAdapter[] = [N1X_ADAPTER];
	topologyKey = '10de:2e12@32.0';
	topologyChanged = false;
	async probe(): Promise<IGpuMemoryProbeOutcome> {
		const sorted = [...this.adapters].sort((a, b) => b.capacityBytes - a.capacityBytes);
		return {
			result: sorted.length
				? { confidence: 'measured', source: 'dxgi', adapter: sorted[0], adapters: sorted, systemMemoryBytes: SYSTEM_MEMORY, topologyKey: this.topologyKey }
				: { confidence: 'unknown', source: 'none', adapters: [], systemMemoryBytes: SYSTEM_MEMORY, topologyKey: '' },
			topologyChanged: this.topologyChanged,
			fromCache: false,
		};
	}
}

class RecordingTelemetry extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: Record<string, unknown> }[] = [];
	override publicLog2(eventName?: string, data?: Record<string, unknown>): void {
		this.events.push({ name: eventName ?? '', data: data ?? {} });
	}
	names(prefix: string, field: string): string[] {
		return this.events.filter(event => event.name === prefix).map(event => String(event.data[field]));
	}
}

const proxyResolver: IAgentHostProxyResolver = {
	_serviceBrand: undefined,
	onDidRegisterConnection: Event.None,
	onDidChangeConfiguration: Event.None,
	register: () => toDisposable(() => { }),
	getConfigurationValue: () => undefined,
	resolveProxy: async () => undefined,
	fetch: () => Promise.reject(new Error('no network in tests')),
	createWebSocket: () => { throw new Error('no network in tests'); },
};

function liveConfig(overrides: Partial<ILocalModelLiveConfig> = {}): ILocalModelLiveConfig {
	return { enabled: true, useInAuto: true, accountGate: true, llamaServerPath: undefined, ...overrides };
}

const CAPI = 'https://api.githubcopilot.com';
const ROUTE_TOKEN = 'jwt-for-fallback';

/** CAPI behind the proxy-aware fetch: `/auto` picks the declared local model; chat answers from the cloud. */
function createFakeCapi() {
	const chats: string[] = [];
	const fetch: IAgentHostProxyResolver['fetch'] = async input => {
		const request = input instanceof Request ? input : new Request(input);
		const body = (request.body ? JSON.parse(await request.text()) : {}) as Record<string, unknown>;
		if (new URL(request.url).pathname === '/auto') {
			const answer = Array.isArray(body.local_models) ? {
				session_token: ROUTE_TOKEN,
				selected_model: { id: body.local_models[0], name: 'Example Flash 1.0', vendor: 'Microsoft', capabilities: { type: 'chat', family: 'mai-code-1.1-flash' } },
				cloud_fallback_model: { id: 'cloud-model', supported_endpoints: ['/chat/completions'], capabilities: { limits: { max_context_window_tokens: 200000, max_prompt_tokens: 168000, max_output_tokens: 64000 } } },
				// Far beyond the fake clock, so a route outlives an hour-long drain.
				expires_at: 4_102_444_800,
			} : { session_token: 'cloud-token', selected_model: { id: 'gpt-5' } };
			return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } });
		}
		chats.push(String(body.model));
		return new Response(`cloud answer from ${body.model}`, { status: 200, headers: { 'content-type': 'text/plain' } });
	};
	return { chats, fetch };
}

function requestContext(url: string): CopilotRequestContext {
	return { requestId: 'request-1', sessionId: 'session-1', interactionType: 'conversation-agent', transport: 'http', url, headers: {}, signal: new AbortController().signal };
}

/** Runs CAPI `/auto` and then the runtime's (non-streaming) `-local` chat request with the route token. */
async function autoTurn(provider: ShimLocalModelProvider, declare: boolean): Promise<string> {
	if (declare) {
		await (await provider.requestHandler.handleRequest(new Request(`${CAPI}/auto`, {
			method: 'POST',
			headers: { 'authorization': '******', 'content-type': 'application/json' },
			body: JSON.stringify({ prompt: '<router prompt>', has_image: false, tier: 'balance' }),
		}), requestContext(`${CAPI}/auto`))).text();
	}
	const response = await provider.requestHandler.handleRequest(new Request(`${CAPI}/chat/completions`, {
		method: 'POST',
		headers: { 'authorization': '******', 'content-type': 'application/json', 'copilot-session-token': ROUTE_TOKEN },
		body: JSON.stringify({ model: MAI.profile.capiId, stream: false, messages: [{ role: 'user', content: 'hi' }] }),
	}), requestContext(`${CAPI}/chat/completions`));
	return response.text();
}

/** Shared between providers to model a quit and a later start. */
interface IPersistent {
	readonly home: string;
	readonly storage: Map<string, unknown>;
}

const MAI_ID = MAI.profile.familyId;
const EXAMPLE_ID = EXAMPLE.profile.familyId;

suite('localModel shim provider (§5.11, §5.12, §5.8.1)', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let root: string;
	let harnessCount = 0;
	setup(async () => {
		// Real path: the store resolves foreign installs with realpath (8.3 names on Windows).
		root = await fs.promises.realpath(await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-local-model-provider-')));
		extraModels.length = 0;
	});
	teardown(async () => {
		await fs.promises.rm(root, { recursive: true, force: true });
	});

	function createPersistent(name = 'copilot-home'): IPersistent {
		return { home: path.join(root, name), storage: new Map() };
	}

	interface IHarnessOptions {
		readonly persistent?: IPersistent;
		readonly models?: ITestModel[];
		readonly runtime?: FakeRuntime;
		readonly gpu?: FakeGpuProbe;
		readonly downloader?: FakeDownloader;
		readonly server?: Partial<IFakeLlamaServerOptions>;
		/** CAPI behind the proxy-aware fetch (default: no network). */
		readonly proxyFetch?: IAgentHostProxyResolver['fetch'];
		/** GGUF header facts per file (default: {@link DEFAULT_METADATA}). */
		readonly metadata?: (filePath: string) => IGgufModelMetadata;
		/** Free system memory (default: 64 GiB). */
		readonly freeSystemMemoryBytes?: () => number;
	}

	function createHarness(options: IHarnessOptions = {}) {
		const persistent = options.persistent ?? createPersistent();
		const clock = new FakeClock();
		const catalog = new FakeCatalog();
		catalog.models = options.models ?? [MAI, EXAMPLE];
		const runtime = options.runtime ?? new FakeRuntime();
		const gpu = options.gpu ?? new FakeGpuProbe();
		const downloader = options.downloader ?? new FakeDownloader();
		const spawner = new FakeLlamaSpawner(clock);
		const control = new FakeProcessControl(spawner);
		const server: IFakeLlamaServerOptions = { nCtx: 32768, totalSlots: 1, decodeTps: 40, ttftMs: 150, loading: false, ...options.server };
		const telemetry = new RecordingTelemetry();
		const storage = {
			get: <T>(key: string) => persistent.storage.get(key) as T | undefined,
			set: <T>(key: string, value: T) => { persistent.storage.set(key, JSON.parse(JSON.stringify(value))); },
		};
		const prefix = `p${++harnessCount}`;
		let ids = 0;
		const fetch = createFakeLlamaFetch(spawner, clock, server);
		const supervisors: ServerSupervisor[] = [];
		/** Every local file whose GGUF architecture the provider read. */
		const architectureReadPaths: string[] = [];
		const host: IShimLocalModelProviderHost = {
			platform: 'win32',
			arch: 'arm64',
			clock,
			storage,
			telemetry,
			systemMemoryBytes: SYSTEM_MEMORY,
			freeSystemMemoryBytes: async () => options.freeSystemMemoryBytes?.() ?? 64 * GIB,
			createCatalog: () => catalog,
			store: new LocalModelStore({ copilotHome: persistent.home, storage }),
			downloader,
			runtime,
			gpuProbe: gpu,
			createSupervisor: log => {
				const supervisor = new ServerSupervisor({
					spawner, processControl: control, fetch, clock, log, telemetry,
					modelsDir: path.join(persistent.home, 'azureml-models'), platform: 'win32', target: 'win32-arm64', homeDir: root, env: { PATH: 'C:\\Windows' },
					allocatePort: async () => 41000 + spawner.processes.length, randomHex: bytes => 'cd'.repeat(bytes),
				});
				supervisors.push(supervisor);
				return supervisor;
			},
			readGgufMetadata: async filePath => options.metadata?.(filePath) ?? DEFAULT_METADATA,
			readGgufArchitecture: (filePath, maxBytes) => {
				architectureReadPaths.push(filePath);
				return readGgufArchitectureFromFile(filePath, maxBytes);
			},
			readTextFile: filePath => fs.promises.readFile(filePath, 'utf8').catch(() => undefined),
			resolveCapiBaseUrls: async () => [],
			onDidChangeCapiAccounts: Event.None,
			loopbackFetch: (input, init) => fetch(input, init),
			generateId: () => `${prefix}-op-${++ids}`,
		};
		const provider = store.add(new ShimLocalModelProvider(new NullLogService(), options.proxyFetch ? { ...proxyResolver, fetch: options.proxyFetch } : proxyResolver, host));
		return { provider, clock, catalog, runtime, gpu, downloader, spawner, control, server, telemetry, persistent, architectureReadPaths, supervisor: () => supervisors[0] };
	}

	type Harness = ReturnType<typeof createHarness>;

	async function start(harness: Harness, config: ILocalModelLiveConfig = liveConfig()): Promise<void> {
		harness.provider.updateLiveConfig(config);
		await harness.provider.whenInitialized();
	}

	function family(harness: Harness, familyId: string): ILocalModelFamilyV1 | undefined {
		return harness.provider.status.get().families.find(candidate => candidate.familyId === familyId);
	}

	/** The download consent the detail page sends for the family as the host lists it now. */
	function consent(harness: Harness, familyId: string): ILocalModelConsent {
		const listed = family(harness, familyId);
		return { scope: listed ? computeLocalModelConsentScope({ family: listed }) : 'unlisted' };
	}

	async function setUpAndWait(harness: Harness, model: ITestModel): Promise<void> {
		await harness.provider.setUp(model.profile.familyId, consent(harness, model.profile.familyId), CancellationToken.None);
		await waitFor(() => !!family(harness, model.profile.familyId)?.install && !family(harness, model.profile.familyId)?.operation);
	}

	function activeReady(harness: Harness, familyId: string): boolean {
		const active = harness.provider.status.get().active;
		return active?.familyId === familyId && active.server === 'ready';
	}

	function offerFor(model: ITestModel) {
		return { fit: 'full', requiredGpuBytes: model.profile.recommendedVramBytes, downloadBytes: model.profile.downloadBytes, peakDiskBytes: model.profile.peakDiskBytes };
	}

	const NO_USAGE = { runningStreams: 0, boundDirectChats: 0, liveAutoRoutes: 0 };

	async function writeOwnedInstall(persistent: IPersistent, model: ITestModel): Promise<string> {
		const modelStore = new LocalModelStore({ copilotHome: persistent.home });
		const { profile } = model;
		const versionDir = await modelStore.beginVersion(profile.registry, profile.assetName, profile.version, profile.capiId);
		for (const [name, content] of Object.entries(model.files)) {
			await fs.promises.writeFile(path.join(versionDir, name), content);
		}
		await modelStore.commitVersion({
			registry: profile.registry, assetName: profile.assetName, version: profile.version, primaryFile: 'model.gguf',
			files: model.resolved.files.map(file => ({ path: file.relativePath, totalBytes: file.sizeBytes, sha256: file.sha256!, etag: '' })),
			ctxSize: 32768, parallel: 1, args: ['--jinja'], displayName: profile.displayName, capiId: profile.capiId, autoCapable: profile.autoCapable, activate: true,
		});
		return versionDir;
	}

	/** Sets `model` up and waits until it is the active model and ready. */
	async function setUpActive(harness: Harness, model: ITestModel): Promise<void> {
		await setUpAndWait(harness, model);
		await waitFor(() => activeReady(harness, model.profile.familyId));
	}

	/** A started harness with MAI active and ready, and Example Coder installed. */
	async function createTwoInstalled(options: IHarnessOptions = {}): Promise<Harness> {
		const harness = createHarness(options);
		await start(harness);
		await setUpActive(harness, MAI);
		await setUpAndWait(harness, EXAMPLE);
		return harness;
	}

	/** A setup of `familyId` whose download is interrupted by a quit (after a Cancel, with `cancel`); returns its operation id. */
	async function interruptDownload(persistent: IPersistent, options: { readonly familyId?: string; readonly cancel?: boolean; readonly runtime?: FakeRuntime } = {}): Promise<string> {
		const familyId = options.familyId ?? EXAMPLE_ID;
		const first = createHarness({ persistent, runtime: options.runtime, downloader: Object.assign(new FakeDownloader(), { gate: new DeferredPromise<void>() }) });
		await start(first);
		await first.provider.setUp(familyId, consent(first, familyId), CancellationToken.None);
		await waitFor(() => first.downloader.requests.length === 1);
		const operationId = family(first, familyId)!.operation!.id;
		if (options.cancel) {
			first.provider.cancel(operationId);
		}
		first.provider.dispose();
		await settle();
		return operationId;
	}

	test('projects offerable families with the Stage B fit, entry and usage; a model that does not fit stays hidden', async () => {
		const huge = createModel('huge-model', 'Huge Model', { recommendedVramBytes: 200 * GIB, minLlamaCppBuild: 11000 });
		const harness = createHarness({ models: [MAI, EXAMPLE, huge] });
		await start(harness);
		const status = harness.provider.status.get();
		const row = (model: ITestModel) => ({
			familyId: model.profile.familyId, capiId: model.profile.capiId, autoCapable: model.profile.autoCapable, displayName: model.profile.displayName,
			offer: offerFor(model), entry: { modelFilesPresent: false, disk: model.profile.peakDiskBytes + 2 * GIB }, usage: NO_USAGE, consentGiven: false,
		});
		assert.deepStrictEqual({
			...status,
			families: status.families.map(candidate => ({ ...candidate, entry: candidate.entry && { ...candidate.entry, disk: candidate.entry.disk?.requiredBytes } })),
			eligibility: harness.telemetry.events.filter(event => event.name === 'localModel.eligibility').map(event => `${event.data.fitClass}/${event.data.visible}/${event.data.stage}/${event.data.backend}`).sort(),
		}, {
			schemaVersion: 1,
			device: { id: 'Vulkan0', capacityBytes: 68784 * MIB, confidence: 'measured', vendor: 'nvidia' },
			runtime: { version: '0.6.0-dev (b11459)', backend: 'vulkan' },
			catalog: { state: 'ready', registries: { azureml: 'ready' } },
			families: [row(MAI), row(EXAMPLE)],
			useInAuto: true,
			eligibility: ['full/true/llamaCpp/vulkan', 'full/true/llamaCpp/vulkan', 'insufficient/false/llamaCpp/none'],
		});
	});

	test('setUp checks the device, downloads, places, makes the first install active and loads it with a ready offer', async () => {
		const harness = createHarness();
		await start(harness);
		const phases: string[] = [];
		store.add(autorun(reader => {
			const phase = harness.provider.status.read(reader).families.find(candidate => candidate.familyId === MAI_ID)?.operation?.phase;
			if (phase && phases.at(-1) !== phase) {
				phases.push(phase);
			}
		}));
		await setUpActive(harness, MAI);
		const status = harness.provider.status.get();
		const child = harness.spawner.processes[0];
		const request = harness.downloader.requests[0];
		const versionDir = path.join(harness.persistent.home, 'azureml-models', 'azureml', 'MAI-Code-1.1-Flash', '1');
		assert.deepStrictEqual({
			phases,
			family: family(harness, MAI_ID),
			active: status.active,
			download: { modelId: request.modelId, targetDir: request.targetDir, files: request.files.map(file => file.relativePath), registry: request.registry, autoResumed: request.autoResumed },
			spawn: { model: child.arg('--model'), alias: child.arg('--alias'), device: child.arg('--device'), split: child.arg('--split-mode'), ctx: child.arg('--ctx-size'), preset: child.args.slice(-3) },
			rows: harness.provider.getModelRows(),
			config: harness.provider.contributeSessionConfig(),
			setupEvents: harness.telemetry.names('localModel.setup', 'phase'),
			serverEvents: harness.telemetry.names('localModel.server', 'event'),
		}, {
			phases: ['checkingDevice', 'resolving', 'downloading', 'placing', 'loading'],
			family: {
				// Installed: the model's own estimate replaces the catalog requirement. Trained context, tags and preset cap it at 32K:
				// (weights + 24 layers x 2 KV heads x 128 x 2 bytes x 32768 + compute at the default ubatch) x 1.02 + 256 MiB.
				familyId: MAI_ID, capiId: MAI_ID, autoCapable: true, displayName: 'Example Flash 1.0', offer: { ...offerFor(MAI), requiredGpuBytes: 1_241_723_728 },
				install: { contentId: MAI.resolved.contentId, adopted: false, owned: true, modelId: 'vscode-on-device/MAI-Code-1.1-Flash' },
				context: { tokens: 32768, options: [{ tokens: 32768, gpuBytes: 1_241_723_728 }] },
				usage: NO_USAGE, readyOfferId: `${MAI_ID}:${MAI.resolved.contentId}`, consentGiven: true,
			},
			active: { familyId: MAI_ID, contentId: MAI.resolved.contentId, servingGeneration: 1, server: 'ready', profile: 'full-gpu', contextTokens: 32768, autoEligible: true },
			download: { modelId: 'azureml://registries/azureml/models/MAI-Code-1.1-Flash/versions/1', targetDir: versionDir, files: ['model.gguf', 'llama-default.ini'], registry: 'azureml', autoResumed: false },
			spawn: { model: path.join(versionDir, 'model.gguf'), alias: 'MAI-Code-1.1-Flash', device: 'Vulkan0', split: 'none', ctx: '32768', preset: ['--flash-attn', 'on', '--jinja'] },
			rows: [{ id: 'MAI-Code-1.1-Flash', name: 'Example Flash 1.0', familyId: MAI_ID, contentId: MAI.resolved.contentId, active: true, maxContextWindow: 32768, maxPromptTokens: 23552, maxOutputTokens: 8192 }],
			config: {
				providers: [{ name: 'vscode-on-device', type: 'openai', wireApi: 'completions', baseUrl: 'http://on-device.vscode.invalid/v1', modelProvider: 'llama_cpp' }],
				models: [{ id: 'MAI-Code-1.1-Flash', provider: 'vscode-on-device', name: 'Example Flash 1.0', maxContextWindowTokens: 32768, maxPromptTokens: 23552, maxOutputTokens: 8192, capabilities: { supports: { vision: false, toolCalls: true } } }],
			},
			setupEvents: ['complete'],
			serverEvents: ['ready'],
		});
	});

	test('with Use in Auto off (the default), an Auto session never loads the stopped model; turning it on loads it', async () => {
		const harness = createHarness();
		await start(harness, liveConfig({ useInAuto: false }));
		await setUpActive(harness, MAI);
		await harness.provider.stop({ stopNow: true });
		await waitFor(() => harness.provider.status.get().active?.server === 'stopped');
		harness.provider.onAutoSessionStarted();
		await settle();
		const autoWhileOff = { server: harness.provider.status.get().active?.server, useInAuto: harness.provider.status.get().useInAuto, spawns: harness.spawner.processes.length };
		harness.provider.updateLiveConfig(liveConfig({ useInAuto: true }));
		await waitFor(() => activeReady(harness, MAI_ID));
		assert.deepStrictEqual({ autoWhileOff, turnedOn: { useInAuto: harness.provider.status.get().useInAuto, spawns: harness.spawner.processes.length } }, {
			autoWhileOff: { server: 'stopped', useInAuto: false, spawns: 1 },
			turnedOn: { useInAuto: true, spawns: 2 },
		});
	});

	test('model A keeps serving while B downloads; Cancel and Resume target B only', async () => {
		const harness = createHarness();
		await start(harness);
		await setUpActive(harness, MAI);
		harness.downloader.gate = new DeferredPromise<void>();
		await harness.provider.setUp(EXAMPLE_ID, consent(harness, EXAMPLE_ID), CancellationToken.None);
		await waitFor(() => family(harness, EXAMPLE_ID)?.operation?.phase === 'downloading');
		const operationId = family(harness, EXAMPLE_ID)!.operation!.id;
		harness.provider.cancel(operationId);
		const cancelled = { operation: family(harness, EXAMPLE_ID)?.operation, maiReady: activeReady(harness, MAI_ID), stored: harness.persistent.storage.get('localModel.provider') as { operations: unknown[] } };
		await harness.provider.resume(operationId);
		await waitFor(() => harness.downloader.requests.length === 3);
		harness.downloader.gate.complete();
		await waitFor(() => !!family(harness, EXAMPLE_ID)?.install && !family(harness, EXAMPLE_ID)?.operation);
		assert.deepStrictEqual({
			cancelled: { operation: cancelled.operation, maiReady: cancelled.maiReady, records: (cancelled.stored.operations as { operationId: string; intent: string; resumeOnStartup: boolean; target: unknown }[]).map(record => ({ operationId: record.operationId, intent: record.intent, resumeOnStartup: record.resumeOnStartup, target: record.target })) },
			requests: harness.downloader.requests.map(request => request.modelId.split('/models/')[1]),
			active: harness.provider.status.get().active?.familyId,
			maiStillReady: activeReady(harness, MAI_ID),
			spawns: harness.spawner.processes.length,
		}, {
			cancelled: {
				operation: { id: operationId, kind: 'setup', state: 'paused', pausedReason: 'user', resumeOnStartup: false, phase: 'downloading', completedBytes: 0, totalBytes: EXAMPLE.profile.downloadBytes },
				maiReady: true,
				records: [{ operationId, intent: 'pausedByUser', resumeOnStartup: false, target: { source: 'azureml', assetName: 'example-coder', version: '1', contentId: EXAMPLE.resolved.contentId } }],
			},
			requests: ['MAI-Code-1.1-Flash/versions/1', 'example-coder/versions/1', 'example-coder/versions/1'],
			active: MAI_ID,
			maiStillReady: true,
			spawns: 1,
		});
	});

	test('a download interrupted by a quit resumes on the next start; an explicit cancel does not', async () => {
		const persistent = createPersistent();
		const first = createHarness({ persistent, downloader: Object.assign(new FakeDownloader(), { gate: new DeferredPromise<void>() }) });
		await start(first);
		await first.provider.setUp(MAI_ID, consent(first, MAI_ID), CancellationToken.None);
		await first.provider.setUp(EXAMPLE_ID, consent(first, EXAMPLE_ID), CancellationToken.None);
		await waitFor(() => first.downloader.requests.length === 2);
		first.provider.cancel(family(first, EXAMPLE_ID)!.operation!.id);
		first.provider.dispose();
		await settle();

		const second = createHarness({ persistent });
		await start(second);
		await waitFor(() => activeReady(second, MAI_ID));
		assert.deepStrictEqual({
			resumed: second.downloader.requests.map(request => ({ asset: request.modelId.split('/models/')[1], autoResumed: request.autoResumed })),
			example: family(second, EXAMPLE_ID)?.operation && { state: family(second, EXAMPLE_ID)!.operation!.state, pausedReason: family(second, EXAMPLE_ID)!.operation!.pausedReason, resumeOnStartup: family(second, EXAMPLE_ID)!.operation!.resumeOnStartup },
			maiInstalled: !!family(second, MAI_ID)?.install,
		}, {
			resumed: [{ asset: 'MAI-Code-1.1-Flash/versions/1', autoResumed: true }],
			example: { state: 'paused', pausedReason: 'user', resumeOnStartup: false },
			maiInstalled: true,
		});
	});

	test('Resume after the registry was unreachable queries it again instead of pausing on the stale state', async () => {
		const persistent = createPersistent();
		await interruptDownload(persistent);

		// The next start finds the registry unreachable: the interrupted download cannot auto-resume.
		const second = createHarness({ persistent, models: [] });
		second.catalog.publicState = 'unavailable';
		await start(second);
		const operation = family(second, EXAMPLE_ID)!.operation!;
		const before = { state: operation.state, pausedReason: operation.pausedReason, refreshes: second.catalog.refreshes };
		// It is reachable again, but only a new query shows it.
		second.catalog.onRefresh = () => {
			second.catalog.publicState = 'ready';
			second.catalog.models = [MAI, EXAMPLE];
		};
		await second.provider.resume(operation.id);
		// Before the fix: the device check judged an unknown requirement, hid the model and dropped the setup.
		await waitFor(() => !!family(second, EXAMPLE_ID)?.install || !family(second, EXAMPLE_ID)?.operation || family(second, EXAMPLE_ID)?.operation?.state === 'paused');
		assert.deepStrictEqual({
			before,
			refreshedOnResume: second.catalog.refreshes > before.refreshes,
			downloads: second.downloader.requests.map(request => request.modelId.split('/models/')[1]),
			installed: family(second, EXAMPLE_ID)?.install?.contentId,
		}, {
			before: { state: 'paused', pausedReason: 'quit', refreshes: 1 },
			refreshedOnResume: true,
			downloads: ['example-coder/versions/1'],
			installed: EXAMPLE.resolved.contentId,
		});
	});

	test('content changed while paused asks again instead of resuming', async () => {
		const persistent = createPersistent();
		await interruptDownload(persistent);

		const example2 = createModel('example-coder', 'Example Coder', { version: '2', minLlamaCppBuild: 11000 });
		extraModels.push(example2);
		const second = createHarness({ persistent, models: [MAI, example2] });
		await start(second);
		const operation = family(second, EXAMPLE_ID)!.operation!;
		const resume = await second.provider.resume(operation.id).then(() => 'resumed', () => 'rejected');
		await setUpAndWait(second, example2);
		assert.deepStrictEqual({
			operation: { state: operation.state, pausedReason: operation.pausedReason, resumeOnStartup: operation.resumeOnStartup },
			resume,
			requests: second.downloader.requests.map(request => request.modelId.split('/models/')[1]),
			installed: family(second, EXAMPLE_ID)?.install?.contentId,
		}, {
			operation: { state: 'paused', pausedReason: 'consentChanged', resumeOnStartup: false },
			resume: 'rejected',
			requests: ['example-coder/versions/2'],
			installed: example2.resolved.contentId,
		});
	});

	test('review-15 (b): restored provider state drops every family id, CAPI id, target or record that is unsafe or credential-bearing; nothing of it is published or written back', async () => {
		const persistent = createPersistent();
		const operationId = await interruptDownload(persistent, { cancel: true });

		const stored = persistent.storage.get('localModel.provider') as { operations: Record<string, unknown>[]; families: Record<string, unknown>; setUp: Record<string, string>; consent: string[]; hidden: string[]; measured: Record<string, unknown> };
		const valid = stored.operations[0] as { target: Record<string, unknown> };
		persistent.storage.set('localModel.provider', {
			...stored,
			active: 'evil?sig=SECRET-local',
			operations: [
				...stored.operations,
				{ ...valid, operationId: 'op-signed-version', familyId: MAI_ID, target: { ...valid.target, version: '1?sv=2024&sig=SECRET' } },
				{ ...valid, operationId: 'op-signed-family', familyId: 'evil?sig=SECRET-local' },
				{ ...valid, operationId: 'op-encoded-scope', familyId: MAI_ID, consentScope: 'https://example.com/license?si=policy&%73ig=SECRET' },
				{ ...valid, operationId: 'op?sig=SECRET' },
				{ ...valid, operationId: 'op-upper-family', familyId: 'Example-Coder-Local' },
			],
			families: {
				...stored.families,
				'evil-local': { displayName: 'Evil', capiId: 'other-local' },
				'sas-local': { displayName: 'Model sv=2024&sig=SECRET', capiId: 'sas-local' },
			},
			setUp: { ...stored.setUp, 'a?sig=SECRET-local': EXAMPLE.resolved.contentId, 'b-local': 'not-a-content-id' },
			consent: [...stored.consent, 'c%26sig%3DSECRET-local'],
			hidden: [...stored.hidden, 'Upper-Local'],
			measured: { ...stored.measured, 'm?sig=SECRET-local': { contentId: EXAMPLE.resolved.contentId, nCtx: 1, totalSlots: 1 } },
		});

		const second = createHarness({ persistent });
		await start(second);
		second.provider.cancel(operationId);
		const status = second.provider.status.get();
		const written = JSON.stringify(persistent.storage.get('localModel.provider'));
		assert.deepStrictEqual({
			families: status.families.map(candidate => candidate.familyId).sort(),
			operations: status.families.filter(candidate => candidate.operation).map(candidate => [candidate.familyId, candidate.operation!.id]),
			active: status.active?.familyId,
			statusLeaks: /SECRET|sig=|evil|Upper|op-signed|op-encoded|op-upper/.test(JSON.stringify(status)),
			writtenLeaks: /SECRET|sig=|evil|sas-local|Upper|not-a-content-id|op-signed|op-encoded|op-upper/.test(written),
			writtenOperations: (persistent.storage.get('localModel.provider') as { operations: { operationId: string }[] }).operations.map(record => record.operationId),
		}, {
			families: [MAI_ID, EXAMPLE_ID].sort(),
			operations: [[EXAMPLE_ID, operationId]],
			active: undefined,
			statusLeaks: false,
			writtenLeaks: false,
			writtenOperations: [operationId],
		});
	});

	test('a persisted replace operation of the removed Switch to Public Build is dropped on load: it neither resumes nor downloads, and is not written back', async () => {
		const persistent = createPersistent();
		const operationId = await interruptDownload(persistent, { cancel: true });

		const stored = persistent.storage.get('localModel.provider') as { operations: Record<string, unknown>[] };
		persistent.storage.set('localModel.provider', {
			...stored,
			operations: [
				...stored.operations,
				{ ...stored.operations[0], operationId: 'op-replace', familyId: MAI_ID, kind: 'replace', target: { source: 'azureml', assetName: MAI.profile.assetName, version: MAI.profile.version }, intent: 'running', resumeOnStartup: true },
			],
		});

		const second = createHarness({ persistent });
		await start(second);
		await settle();
		second.provider.cancel(operationId);
		assert.deepStrictEqual({
			operations: second.provider.status.get().families.filter(candidate => candidate.operation).map(candidate => [candidate.familyId, candidate.operation!.kind]),
			downloads: second.downloader.requests.length,
			writtenOperations: (persistent.storage.get('localModel.provider') as { operations: { operationId: string }[] }).operations.map(record => record.operationId),
		}, {
			operations: [[EXAMPLE_ID, 'setup']],
			downloads: 0,
			writtenOperations: [operationId],
		});
	});

	test('a DFlash build that crashes on the first completion serves without speculative decoding, persisted per llama-server build and content: later starts skip DFlash; another build tries it again', async () => {
		const dflash = createModel('dflash-coder', 'DFlash Coder', { minLlamaCppBuild: 11000 }, undefined, { dflash: true });
		extraModels.push(dflash);
		const familyId = dflash.profile.familyId;
		const crashWithDflash: Partial<IFakeLlamaServerOptions> = {
			onChatCompletion: process => {
				if (process.arg('--device-draft')) {
					process.writeStderr('C:\\src\\t\\mai-coder-llamacpp\\src\\llama-graph.cpp:1379: GGML_ASSERT(t_layer_inp[il] != nullptr && "layer input tensor is null") failed\n');
					process.exit(3);
				}
			},
		};
		const persistent = createPersistent();
		const dflashRuntime = (mtimeMs: number) => Object.assign(new FakeRuntime(), { specTypes: ['draft-dflash'], mtimeMs });
		const run = async (mtimeMs: number, setUp: boolean) => {
			const harness = createHarness({ persistent, models: [dflash], runtime: dflashRuntime(mtimeMs), server: crashWithDflash });
			// Each published load: its step, why it is a retry, and whether a comparable load's duration is known.
			const loads: string[] = [];
			store.add(autorun(reader => {
				const load = harness.provider.status.read(reader).active?.load;
				const entry = load && `${load.step}/${load.retry ?? '-'}/${load.expectedMs !== undefined}`;
				if (entry && loads.at(-1) !== entry) {
					loads.push(entry);
				}
			}));
			await start(harness);
			if (setUp) {
				await setUpAndWait(harness, dflash);
			} else {
				// An installed, active model loads on demand (the workbench's Start, or a request).
				await harness.provider.start();
			}
			await waitFor(() => activeReady(harness, familyId));
			const active = harness.provider.status.get().active;
			const result = {
				drafts: harness.spawner.processes.map(child => child.arg('--device-draft') ?? null),
				dflashSupported: active?.dflashSupported,
				downgrades: harness.telemetry.events.filter(event => event.name === 'localModel.server' && event.data.event === 'profileDowngraded').map(event => event.data.errorCode),
				loads,
			};
			// Quit. Disposing kills the server but releases its lock only later, so stop it first: the next start must find the lock free.
			await harness.supervisor().stop('system');
			harness.provider.dispose();
			await settle();
			return result;
		};
		const first = await run(1, true);
		const persisted = (persistent.storage.get('localModel.provider') as { speculativeUnsupported: string[] }).speculativeUnsupported;
		const restarted = await run(1, false);
		const otherBuild = await run(2, false);
		assert.deepStrictEqual({ first, persisted, restarted, otherBuild }, {
			first: {
				drafts: ['Vulkan0', null], dflashSupported: false, downgrades: ['specUnsupported'],
				loads: ['loading/-/false', 'warmingUp/-/false', 'loading/withoutSpeculativeDecoding/false', 'warmingUp/withoutSpeculativeDecoding/false'],
			},
			persisted: [`${getLlamaServerKey({ realPath: LLAMA_SERVER, size: 1, mtimeMs: 1, libraries: '' })}:${dflash.resolved.contentId}`],
			// Skipping DFlash because of the recorded crash is a normal load, with the duration of the last load without it.
			restarted: { drafts: [null], dflashSupported: false, downgrades: [], loads: ['loading/-/true', 'warmingUp/-/true'] },
			// No load with DFlash ever completed; the retry without it expects the duration of the loads without it.
			otherBuild: {
				drafts: ['Vulkan0', null], dflashSupported: false, downgrades: ['specUnsupported'],
				loads: ['loading/-/false', 'warmingUp/-/false', 'loading/withoutSpeculativeDecoding/true', 'warmingUp/withoutSpeculativeDecoding/true'],
			},
		});
	});

	test('concurrent swap requests share one operation; the drain has no timeout and Stop Now ends it', async () => {
		const harness = await createTwoInstalled();
		const supervisor = harness.supervisor();
		const lease = supervisor.acquireLease(supervisor.state.get().identity!)!;
		const operationIds = new Set<string>();
		store.add(autorun(reader => {
			const id = harness.provider.status.read(reader).families.find(candidate => candidate.familyId === EXAMPLE_ID)?.operation?.id;
			if (id) {
				operationIds.add(id);
			}
		}));
		await Promise.all([harness.provider.makeActive(EXAMPLE_ID), harness.provider.makeActive(EXAMPLE_ID)]);
		await waitFor(() => !!harness.provider.status.get().active?.drain);
		harness.clock.advance(60 * 60_000);
		await settle();
		const afterAnHour = { active: harness.provider.status.get().active, phase: family(harness, EXAMPLE_ID)?.operation?.phase, usage: family(harness, MAI_ID)?.usage };
		await harness.provider.stop({ stopNow: true });
		await waitFor(() => activeReady(harness, EXAMPLE_ID) && !family(harness, EXAMPLE_ID)?.operation);
		lease.dispose();
		assert.deepStrictEqual({
			afterAnHour,
			operations: operationIds.size,
			active: harness.provider.status.get().active,
			rows: harness.provider.getModelRows().map(row => [row.id, row.active]),
			serverEvents: harness.telemetry.names('localModel.server', 'event'),
		}, {
			afterAnHour: {
				active: { familyId: MAI_ID, contentId: MAI.resolved.contentId, servingGeneration: 1, server: 'stopping', profile: 'full-gpu', drain: { runningStreams: 1 }, swapTo: EXAMPLE_ID },
				phase: 'draining',
				usage: { runningStreams: 1, boundDirectChats: 0, liveAutoRoutes: 0 },
			},
			operations: 1,
			active: { familyId: EXAMPLE_ID, contentId: EXAMPLE.resolved.contentId, servingGeneration: 2, server: 'ready', profile: 'full-gpu', contextTokens: 32768, autoEligible: true },
			rows: [['example-coder', true], ['MAI-Code-1.1-Flash', false]],
			serverEvents: ['ready', 'swapStarted', 'stopNow', 'ready', 'swapCompleted'],
		});
	});

	test('context size: 64K/128K/256K up to the trained context, 128K by default; a change on the loaded model reloads it once running responses finish, and is remembered', async () => {
		const big = createModel('Big-Model', 'Big Model', { maxContextWindowTokens: 262_144, maxPromptTokens: 200_000, maxOutputTokens: 32_768, minLlamaCppBuild: 11000 }, undefined, { ctxSize: 262_144 });
		const bigId = big.profile.familyId;
		// One full-attention layer and three sliding-window layers; a harmony chat template.
		const metadata: IGgufModelMetadata = {
			architecture: 'maion-coder', blockCount: 4, embeddingLength: 1024, headCount: 8, headCountKv: 2, keyLength: 128, valueLength: 128, contextLength: 262_145,
			slidingWindow: 512, slidingWindowLayers: [true, true, true, false], vocabSize: 1000, chatTemplate: '{%- set reasoning_effort = "high" %}{{ "Reasoning: " + reasoning_effort }}',
		};
		const harness = createHarness({ models: [big], metadata: () => metadata, server: { nCtx: 131_072 } });
		extraModels.push(big);
		await start(harness);
		await setUpActive(harness, big);
		const row = () => {
			const { maxContextWindow, maxPromptTokens, maxOutputTokens, thinking } = harness.provider.getModelRows()[0];
			return { maxContextWindow, maxPromptTokens, maxOutputTokens, thinking };
		};
		const initial = { context: family(harness, bigId)?.context, ctx: harness.spawner.processes[0].arg('--ctx-size'), row: row(), capabilities: harness.provider.contributeSessionConfig().models[0].capabilities };

		const rejected = await harness.provider.setContextSize(bigId, 100_000).then(() => 'accepted', (error: Error) => error.message);
		const unchanged = { operation: family(harness, bigId)?.operation, processes: harness.spawner.processes.length };

		const supervisor = harness.supervisor();
		const lease = supervisor.acquireLease(supervisor.state.get().identity!)!;
		const phases: string[] = [];
		store.add(autorun(reader => {
			const operation = harness.provider.status.read(reader).families.find(candidate => candidate.familyId === bigId)?.operation;
			const phase = operation && `${operation.kind}:${operation.phase}`;
			if (phase && phases.at(-1) !== phase) {
				phases.push(phase);
			}
		}));
		await harness.provider.setContextSize(bigId, 65_536);
		await waitFor(() => !!harness.provider.status.get().active?.drain);
		const draining = { active: harness.provider.status.get().active, selected: family(harness, bigId)?.context?.tokens, row: row() };
		harness.server.nCtx = 65_536;
		// The running response finishes; the model loads again at the new size.
		lease.dispose();
		await waitFor(() => activeReady(harness, bigId) && !family(harness, bigId)?.operation);

		// The same size again: nothing to reload.
		await harness.provider.setContextSize(bigId, 65_536);
		await settle();

		const gib = (bytes: number | undefined) => bytes === undefined ? undefined : Math.round(bytes / GIB * 1000) / 1000;
		assert.deepStrictEqual({
			initial: { ...initial, context: initial.context && { tokens: initial.context.tokens, options: initial.context.options.map(option => [option.tokens, gib(option.gpuBytes)]) } },
			rejected,
			unchanged,
			phases,
			draining,
			reloaded: { ctx: harness.spawner.processes[1]?.arg('--ctx-size'), processes: harness.spawner.processes.length, active: harness.provider.status.get().active, context: family(harness, bigId)?.context?.tokens, row: row() },
			persisted: (harness.persistent.storage.get('localModel.provider') as { contextTokens?: unknown }).contextTokens,
			serverEvents: harness.telemetry.names('localModel.server', 'event'),
		}, {
			initial: {
				// The estimate grows with the one full-attention layer only.
				context: { tokens: 131_072, options: [[65_536, 0.335], [131_072, 0.398], [262_144, 0.526]] },
				ctx: '131072',
				row: { maxContextWindow: 131_072, maxPromptTokens: 97_280, maxOutputTokens: 32_768, thinking: { kind: 'effort', levels: ['low', 'medium', 'high'], defaultLevel: 'high' } },
				capabilities: { supports: { vision: false, toolCalls: true, reasoningEffort: true } },
			},
			rejected: 'This context size is not available for this model',
			unchanged: { operation: undefined, processes: 1 },
			phases: ['swap:undefined', 'swap:draining', 'swap:loading'],
			draining: {
				active: { familyId: bigId, contentId: big.resolved.contentId, servingGeneration: 1, server: 'stopping', profile: 'full-gpu', drain: { runningStreams: 1 }, swapTo: bigId },
				selected: 65_536,
				// New requests wait for the reload: the row already has the new size.
				row: { maxContextWindow: 65_536, maxPromptTokens: 48_128, maxOutputTokens: 16_384, thinking: { kind: 'effort', levels: ['low', 'medium', 'high'], defaultLevel: 'high' } },
			},
			reloaded: {
				ctx: '65536',
				processes: 2,
				active: { familyId: bigId, contentId: big.resolved.contentId, servingGeneration: 2, server: 'ready', profile: 'full-gpu', contextTokens: 65_536, autoEligible: true },
				context: 65_536,
				row: { maxContextWindow: 65_536, maxPromptTokens: 48_128, maxOutputTokens: 16_384, thinking: { kind: 'effort', levels: ['low', 'medium', 'high'], defaultLevel: 'high' } },
			},
			persisted: { [bigId]: 65_536 },
			// A reload is not a swap to another model.
			serverEvents: ['ready', 'ready'],
		});
	});

	test('a model with recurrent layers keeps context checkpoints its preset turns off, so later turns reuse the cache, as many as free system memory holds; other models keep the preset\'s value', async () => {
		const hybrid = createModel('Hybrid-Model', 'Hybrid Model', { minLlamaCppBuild: 11000 }, undefined, { ctxCheckpoints: 0 });
		const plain = createModel('Plain-Model', 'Plain Model', { minLlamaCppBuild: 11000 }, undefined, { ctxCheckpoints: 0 });
		const hybridMetadata: IGgufModelMetadata = { ...DEFAULT_METADATA, fullAttentionInterval: 4, ssm: { convKernel: 4, stateSize: 128, groupCount: 16, innerSize: 4096 } };
		extraModels.push(hybrid, plain);
		let freeSystemMemory = 64 * GIB;
		const harness = createHarness({ models: [hybrid, plain], metadata: filePath => filePath.includes('Hybrid-Model') ? hybridMetadata : DEFAULT_METADATA, freeSystemMemoryBytes: () => freeSystemMemory });
		const activate = async (model: ITestModel) => {
			await harness.provider.makeActive(model.profile.familyId);
			await waitFor(() => activeReady(harness, model.profile.familyId) && !family(harness, model.profile.familyId)?.operation);
		};
		await start(harness);
		await setUpActive(harness, hybrid);
		await setUpAndWait(harness, plain);
		await activate(plain);
		freeSystemMemory = 0;
		await activate(hybrid);
		assert.deepStrictEqual(harness.spawner.processes.map(child => `${child.arg('--alias')}: ${child.arg('--ctx-checkpoints')}`), [
			'Hybrid-Model: 4',
			'Plain-Model: 0',
			'Hybrid-Model: 0',
		]);
	});

	test('Stop Now ends the drain of a context size reload; the model then loads at the new size', async () => {
		const big = createModel('Big-Model', 'Big Model', { maxContextWindowTokens: 262_144, maxPromptTokens: 200_000, maxOutputTokens: 32_768, minLlamaCppBuild: 11000 }, undefined, { ctxSize: 262_144 });
		const bigId = big.profile.familyId;
		const harness = createHarness({ models: [big], metadata: () => ({ ...DEFAULT_METADATA, contextLength: 262_144 }), server: { nCtx: 131_072 } });
		extraModels.push(big);
		await start(harness);
		await setUpActive(harness, big);
		const supervisor = harness.supervisor();
		const lease = supervisor.acquireLease(supervisor.state.get().identity!)!;
		await harness.provider.setContextSize(bigId, 262_144);
		await waitFor(() => !!harness.provider.status.get().active?.drain);
		await harness.provider.stop({ stopNow: true });
		await waitFor(() => activeReady(harness, bigId) && !family(harness, bigId)?.operation);
		lease.dispose();
		assert.deepStrictEqual({ ctx: harness.spawner.processes.map(child => child.arg('--ctx-size')), serverEvents: harness.telemetry.names('localModel.server', 'event') }, {
			ctx: ['131072', '262144'],
			serverEvents: ['ready', 'stopNow', 'ready'],
		});
	});

	test('a context size chosen while an update loads the previous size reloads once the update settles, exactly once', async () => {
		const limits = { maxContextWindowTokens: 262_144, maxPromptTokens: 200_000, maxOutputTokens: 32_768, minLlamaCppBuild: 11000 };
		const big = createModel('Big-Model', 'Big Model', limits, undefined, { ctxSize: 262_144 });
		const big2 = createModel('Big-Model', 'Big Model', { ...limits, version: '2' }, undefined, { ctxSize: 262_144 });
		const bigId = big.profile.familyId;
		const harness = createHarness({ models: [big], metadata: () => ({ ...DEFAULT_METADATA, contextLength: 262_144 }), server: { nCtx: 131_072 } });
		extraModels.push(big, big2);
		await start(harness);
		await setUpActive(harness, big);
		harness.catalog.models = [big2];
		harness.catalog.contentIds.set(sourceKey(big2.profile), big2.resolved.contentId);
		await harness.provider.refreshCatalog();
		// The update's server stays loading until released: its launch plan already holds 128K.
		let released = false;
		harness.server.loading = process => process === harness.spawner.processes[1] && !released;
		await harness.provider.update(bigId, undefined, CancellationToken.None);
		await waitFor(() => family(harness, bigId)?.operation?.phase === 'loading' && harness.spawner.processes.length === 2);
		await harness.provider.setContextSize(bigId, 65_536);
		await settle();
		const whileLoading = { operation: family(harness, bigId)?.operation?.kind, processes: harness.spawner.processes.length };
		released = true;
		const reloaded = () => harness.spawner.processes.length === 3 && activeReady(harness, bigId) && !family(harness, bigId)?.operation;
		for (let polls = 0; polls < 50 && !reloaded(); polls++) {
			// The loading server's health is polled on the fake clock.
			harness.clock.advance(500);
			await settle();
		}
		await waitFor(reloaded);
		await settle();
		assert.deepStrictEqual({
			whileLoading,
			ctx: harness.spawner.processes.map(child => child.arg('--ctx-size')),
			selected: family(harness, bigId)?.context?.tokens,
			serving: { contentId: harness.provider.status.get().active?.contentId, server: harness.provider.status.get().active?.server },
		}, {
			whileLoading: { operation: 'update', processes: 2 },
			// The update loads 128K, then one reload at the chosen 64K; no further reloads.
			ctx: ['131072', '131072', '65536'],
			selected: 65_536,
			serving: { contentId: big2.resolved.contentId, server: 'ready' },
		});
	});

	test('a context size chosen for a model that is not loaded applies at its next load', async () => {
		const big = createModel('Big-Model', 'Big Model', { maxContextWindowTokens: 262_144, maxPromptTokens: 200_000, maxOutputTokens: 32_768, minLlamaCppBuild: 11000 }, undefined, { ctxSize: 262_144 });
		const bigId = big.profile.familyId;
		const metadata: IGgufModelMetadata = { ...DEFAULT_METADATA, contextLength: 262_144 };
		const harness = createHarness({ models: [big], metadata: () => metadata, server: { nCtx: 262_144 } });
		extraModels.push(big);
		await start(harness);
		await setUpActive(harness, big);
		await harness.provider.stop({ stopNow: false });
		await waitFor(() => harness.provider.status.get().active?.server === 'stopped');
		await harness.provider.setContextSize(bigId, 262_144);
		const whileStopped = { operation: family(harness, bigId)?.operation, processes: harness.spawner.processes.length, rowContext: harness.provider.getModelRows()[0].maxContextWindow };
		await harness.provider.start();
		await waitFor(() => activeReady(harness, bigId));
		assert.deepStrictEqual({ whileStopped, ctx: harness.spawner.processes.map(child => child.arg('--ctx-size')) }, {
			whileStopped: { operation: undefined, processes: 1, rowContext: 262_144 },
			ctx: ['131072', '262144'],
		});
	});

	test('publishes the load step while the model loads, with the duration of the last comparable load once one completed', async () => {
		const harness = createHarness({ server: { loading: true } });
		await start(harness);
		await harness.provider.setUp(MAI_ID, consent(harness, MAI_ID), CancellationToken.None);
		await waitFor(() => harness.provider.status.get().active?.load?.step === 'loading');
		const firstLoad = harness.provider.status.get().active?.load;
		let warmingUp: unknown;
		harness.server.onChatCompletion = () => warmingUp = harness.provider.status.get().active?.load?.step;
		harness.server.loading = false;
		const ready = () => activeReady(harness, MAI_ID) && !family(harness, MAI_ID)?.operation;
		for (let polls = 0; polls < 50 && !ready(); polls++) {
			harness.clock.advance(500);
			await settle();
		}
		await waitFor(ready);
		const records = () => (harness.persistent.storage.get('localModel.provider') as { loadDurations: { durationMs: number }[] }).loadDurations;
		const recorded = records()[0]?.durationMs;

		await harness.provider.stop({ stopNow: false });
		await waitFor(() => harness.provider.status.get().active?.server === 'stopped');
		harness.server.loading = true;
		harness.server.onChatCompletion = undefined;
		await harness.provider.start();
		await waitFor(() => harness.provider.status.get().active?.load?.step === 'loading');
		const secondLoad = harness.provider.status.get().active?.load;
		assert.deepStrictEqual({
			first: { step: firstLoad?.step, startedAt: typeof firstLoad?.startedAt, expectedMs: firstLoad?.expectedMs },
			warmingUp,
			records: records().map(({ durationMs, ...key }) => ({ ...key, durationMs: durationMs === recorded && durationMs > 0 })),
			second: { step: secondLoad?.step, expectedMs: secondLoad?.expectedMs === recorded },
		}, {
			// The first load has no history: the UI shows it as indeterminate.
			first: { step: 'loading', startedAt: 'number', expectedMs: undefined },
			warmingUp: 'warmingUp',
			records: [{ contentId: MAI.resolved.contentId, device: 'Vulkan0', ctxSize: 32768, speculative: false, durationMs: true }],
			second: { step: 'loading', expectedMs: true },
		});
	});

	test('a swap with no running responses never reports waiting for them: the old server unloading is part of loading; once its model is active, it isn\'t named as the one loaded next', async () => {
		const harness = await createTwoInstalled();
		// The old server takes a while to exit, as a large model's does while it frees its GPU memory.
		harness.spawner.processes[0].exitDelayMs = 50;
		const phases: (string | undefined)[] = [];
		const swapTargets = new Set<string>();
		store.add(autorun(reader => {
			const status = harness.provider.status.read(reader);
			const phase = status.families.find(candidate => candidate.familyId === EXAMPLE_ID)?.operation?.phase;
			if (phase && phases.at(-1) !== phase) {
				phases.push(phase);
			}
			if (status.active?.swapTo) {
				swapTargets.add(`${status.active.familyId}->${status.active.swapTo}`);
			}
		}));
		await harness.provider.makeActive(EXAMPLE_ID);
		await waitFor(() => harness.provider.status.get().active?.server === 'stopping');
		const whileUnloading = { phase: family(harness, EXAMPLE_ID)?.operation?.phase, drain: harness.provider.status.get().active?.drain, exited: harness.spawner.processes[0].hasExited };
		await waitFor(() => activeReady(harness, EXAMPLE_ID) && !family(harness, EXAMPLE_ID)?.operation);
		assert.deepStrictEqual({ whileUnloading, phases, swapTargets: [...swapTargets] }, {
			whileUnloading: { phase: 'loading', drain: undefined, exited: false },
			phases: ['loading'],
			// Once its model is active, a swap is that model loading, not a reload of it.
			swapTargets: [`${MAI_ID}->${EXAMPLE_ID}`],
		});
	});

	test('Cancel of a load is reflected at once (the operation ends, the server shows stopping before its process is gone); repeated Cancels do nothing more', async () => {
		const harness = await createTwoInstalled();
		harness.server.loading = process => process === harness.spawner.processes[1];
		await harness.provider.makeActive(EXAMPLE_ID);
		await waitFor(() => family(harness, EXAMPLE_ID)?.operation?.phase === 'loading' && harness.provider.status.get().active?.load?.step === 'loading');
		harness.spawner.processes[1].exitDelayMs = 50;
		const swapId = family(harness, EXAMPLE_ID)!.operation!.id;
		harness.provider.cancel(swapId);
		const active = () => {
			const { familyId, server, swapTo, load } = harness.provider.status.get().active ?? {};
			return { familyId, server, swapTo, load };
		};
		const swapCancelled = { operation: family(harness, EXAMPLE_ID)?.operation, active: active(), exited: harness.spawner.processes[1].hasExited };
		harness.provider.cancel(swapId);
		harness.provider.cancel(swapId);
		await waitFor(() => harness.provider.status.get().active?.server === 'stopped');
		const swapAfter = { active: active(), exited: harness.spawner.processes[1].hasExited, spawns: harness.spawner.processes.length };

		// The first load of a setup: Cancel pauses it at once.
		const setup = createHarness({ server: { loading: true }, persistent: createPersistent('setup-home') });
		await start(setup);
		await setup.provider.setUp(MAI_ID, consent(setup, MAI_ID), CancellationToken.None);
		await waitFor(() => setup.provider.status.get().active?.load?.step === 'loading');
		setup.spawner.processes[0].exitDelayMs = 50;
		setup.provider.cancel(family(setup, MAI_ID)!.operation!.id);
		const setupCancelled = { operation: family(setup, MAI_ID)?.operation?.state, server: setup.provider.status.get().active?.server, exited: setup.spawner.processes[0].hasExited };
		await waitFor(() => setup.provider.status.get().active?.server === 'stopped');

		assert.deepStrictEqual({ swapCancelled, swapAfter, setupCancelled }, {
			swapCancelled: { operation: undefined, active: { familyId: EXAMPLE_ID, server: 'stopping', swapTo: undefined, load: undefined }, exited: false },
			swapAfter: { active: { familyId: EXAMPLE_ID, server: 'stopped', swapTo: undefined, load: undefined }, exited: true, spawns: 2 },
			setupCancelled: { operation: 'paused', server: 'stopping', exited: false },
		});
	});

	test('the memory warning depends only on the device\'s total GPU memory and the estimate at the selected context: never on the catalog or a model of ours being loaded', async () => {
		const persistent = createPersistent();
		const other = createModel('other-model', 'Other Model', { minLlamaCppBuild: 11000 });
		// Installed, but the registry doesn't offer them now.
		await writeOwnedInstall(persistent, EXAMPLE);
		await writeOwnedInstall(persistent, other);
		// EXAMPLE's KV cache alone (80 layers x 64 KV heads x 512 x 2 bytes x 32K) exceeds the device's 67 GiB.
		const huge: IGgufModelMetadata = { ...DEFAULT_METADATA, blockCount: 80, headCountKv: 64, keyLength: 256, valueLength: 256 };
		const harness = createHarness({ persistent, models: [MAI], metadata: filePath => filePath.toLowerCase().includes('example-coder') ? huge : DEFAULT_METADATA });
		await start(harness);
		await setUpAndWait(harness, MAI);
		await waitFor(() => activeReady(harness, MAI_ID) && !!family(harness, EXAMPLE_ID)?.context && !!family(harness, other.profile.familyId)?.context);
		const view = (familyId: string) => {
			const projected = family(harness, familyId);
			return { installed: !!projected?.install, offered: !!projected?.offer, memoryWarning: projected?.memoryWarning };
		};
		const exampleRequired = family(harness, EXAMPLE_ID)!.context!.options[0].gpuBytes;
		assert.deepStrictEqual({ loaded: view(MAI_ID), notOffered: view(other.profile.familyId), tooLarge: view(EXAMPLE_ID), exampleRequiredExceedsDevice: exampleRequired > 68784 * MIB }, {
			loaded: { installed: true, offered: true, memoryWarning: undefined },
			notOffered: { installed: true, offered: false, memoryWarning: undefined },
			tooLarge: { installed: true, offered: false, memoryWarning: { requiredBytes: exampleRequired, capacityBytes: 68784 * MIB } },
			exampleRequiredExceedsDevice: true,
		});
	});

	test('on an NVIDIA device, an installed model stays listed and removable when the runtime probe and the catalog fail', async () => {
		const persistent = createPersistent();
		const versionDir = await writeOwnedInstall(persistent, MAI);
		const runtime = new FakeRuntime();
		runtime.present = false;
		const harness = createHarness({ persistent, runtime, models: [] });
		harness.catalog.publicState = 'unavailable';
		await start(harness);
		const before = family(harness, MAI_ID);
		const rowsBefore = harness.provider.getModelRows().length;
		await harness.provider.remove(MAI_ID);
		await waitFor(() => !family(harness, MAI_ID));
		assert.deepStrictEqual({
			before: { install: before?.install?.owned, offer: before?.offer, entry: before?.entry },
			device: harness.provider.status.get().device,
			rowsBefore,
			rowsAfter: harness.provider.getModelRows(),
			filesRemoved: !fs.existsSync(versionDir),
		}, {
			before: { install: true, offer: undefined, entry: undefined },
			device: { id: N1X_ADAPTER.id, capacityBytes: N1X_ADAPTER.capacityBytes, confidence: 'measured', vendor: 'nvidia' },
			rowsBefore: 1,
			rowsAfter: [],
			filesRemoved: true,
		});
	});

	test('a UMA GPU next to a smaller discrete GPU: the UMA GPU is selected and pinned with --device', async () => {
		const runtime = new FakeRuntime();
		runtime.devices = [
			{ name: 'Vulkan0', description: 'NVIDIA GeForce RTX 4060 Laptop GPU', totalBytes: 8 * GIB, freeBytes: 8 * GIB, backend: 'vulkan' },
			{ name: 'Vulkan1', description: N1X_NAME, totalBytes: 96 * GIB, freeBytes: 96 * GIB, backend: 'vulkan' },
		];
		const gpu = new FakeGpuProbe();
		gpu.adapters = [
			{ id: '10de:28e0', description: 'NVIDIA GeForce RTX 4060 Laptop GPU', vendorId: 0x10DE, capacityBytes: 8 * GIB, unifiedMemory: false },
			{ ...N1X_ADAPTER, capacityBytes: 96 * GIB },
		];
		const large = createModel('MAI-Code-1.1-Flash', 'Example Flash 1.0', { recommendedVramBytes: 60 * GIB });
		const harness = createHarness({ runtime, gpu, models: [large] });
		await start(harness);
		const offer = family(harness, MAI_ID)?.offer;
		await setUpActive(harness, large);
		const child = harness.spawner.processes[0];
		assert.deepStrictEqual({ device: harness.provider.status.get().device, fit: offer?.fit, bound: [child.arg('--device'), child.arg('--split-mode')] }, {
			device: { id: 'Vulkan1', capacityBytes: 96 * GIB, confidence: 'measured', vendor: 'nvidia' },
			fit: 'full',
			bound: ['Vulkan1', 'none'],
		});
	});

	test('Stage B below the requirement stops before the download and hides the model; a topology change re-probes', async () => {
		const runtime = new FakeRuntime();
		const large = createModel('MAI-Code-1.1-Flash', 'Example Flash 1.0', { recommendedVramBytes: 60 * GIB });
		const gpu = new FakeGpuProbe();
		const harness = createHarness({ runtime, gpu, models: [large] });
		await start(harness);
		const stageAOffer = family(harness, MAI_ID)?.offer?.fit;
		runtime.devices = [{ ...N1X_VULKAN, totalBytes: 24 * GIB, freeBytes: 24 * GIB }];
		await harness.provider.setUp(MAI_ID, consent(harness, MAI_ID), CancellationToken.None);
		await waitFor(() => !family(harness, MAI_ID));
		const hidden = { downloads: harness.downloader.requests.length, setup: harness.telemetry.events.filter(event => event.name === 'localModel.setup').map(event => `${event.data.outcome}:${event.data.errorCode}`) };

		gpu.topologyKey = '10de:2e12@33.0';
		gpu.topologyChanged = true;
		runtime.devices = [N1X_VULKAN];
		await harness.provider.refreshCatalog();
		assert.deepStrictEqual({ stageAOffer, hidden, topologyKeys: runtime.topologyKeys, offerAfterReprobe: family(harness, MAI_ID)?.offer?.fit }, {
			stageAOffer: 'full',
			hidden: { downloads: 0, setup: ['failed:insufficientMemory'] },
			topologyKeys: ['10de:2e12@32.0', '10de:2e12@33.0'],
			offerAfterReprobe: 'full',
		});
	});

	test('serving compatibility: a model this llama.cpp can\'t run is still downloaded (resuming its partial), but not loaded or made active; with a llama.cpp that can, selecting it loads it', async () => {
		// The primary GGUF's header names an architecture this build doesn't know yet; an earlier, interrupted download left its first bytes.
		const weights = Buffer.from(buildSyntheticGguf({ 'general.architecture': 'qwen9' })).toString('latin1') + 'weights'.repeat(16);
		const mai = createModel('MAI-Code-1.1-Flash', 'Example Flash 1.0', {}, weights);
		extraModels.push(mai);
		const runtime = new FakeRuntime();
		runtime.architectureSupport.set('qwen9', 'unsupported');
		const harness = createHarness({ runtime, models: [mai, EXAMPLE] });
		// The interrupted download was VS Code's own: the version is recorded as owned, its partial and identity sidecar are there.
		const versionDir = await new LocalModelStore({ copilotHome: harness.persistent.home }).beginVersion('azureml', 'MAI-Code-1.1-Flash', '1', mai.profile.capiId);
		const primary = mai.resolved.files.find(file => file.relativePath === 'model.gguf')!;
		const partial = path.join(versionDir, 'model.gguf.vscode.partial');
		await fs.promises.writeFile(partial, Buffer.from(weights.slice(0, 80), 'latin1'));
		await fs.promises.writeFile(`${partial}.json`, JSON.stringify({ modelId: 'azureml://registries/azureml/models/MAI-Code-1.1-Flash/versions/1', totalBytes: primary.sizeBytes, sha256: primary.sha256, etag: primary.etag }));
		await start(harness);
		await harness.provider.setUp(MAI_ID, consent(harness, MAI_ID), CancellationToken.None);
		await waitFor(() => !!family(harness, MAI_ID)?.install && !family(harness, MAI_ID)?.operation);
		const setupEvents = () => harness.telemetry.events.filter(event => event.name === 'localModel.setup').map(event => `${event.data.phase}:${event.data.outcome}:${event.data.errorCode}:${event.data.architecture}:${event.data.architectureSupport}`);
		const downloaded = {
			active: harness.provider.status.get().active,
			downloads: harness.downloader.requests.length,
			remoteReads: [...harness.catalog.architectureReads],
			probes: [...runtime.architectureProbes],
			spawns: harness.spawner.processes.length,
			setupEvents: setupEvents(),
		};

		// A llama.cpp that knows the architecture is found: selecting the model loads it.
		runtime.architectureSupport.set('qwen9', 'supported');
		await harness.provider.makeActive(MAI_ID);
		await waitFor(() => activeReady(harness, MAI_ID) && !family(harness, MAI_ID)?.operation);
		assert.deepStrictEqual({ downloaded, spawns: harness.spawner.processes.length }, {
			downloaded: {
				active: undefined,
				downloads: 1,
				remoteReads: [],
				probes: ['qwen9'],
				spawns: 0,
				setupEvents: ['complete:success::other:unsupported'],
			},
			spawns: 1,
		});
	});

	test('without a usable llama.cpp (none, or too old), a model is downloaded but not loaded; loading it gives directions (Get llama.cpp, Open Settings, Retry); once one is found, Retry or selecting the model again loads it and the failed change no longer reports its error', async () => {
		let homes = 0;
		const run = async (unusable: 'notFound' | 'tooOld', recover: 'retry' | 'selectAgain') => {
			const runtime = new FakeRuntime();
			runtime.present = unusable !== 'notFound';
			runtime.tooOld = unusable === 'tooOld';
			const harness = createHarness({ runtime, persistent: createPersistent(`home-${++homes}`) });
			harness.catalog.architectures.set(MAI.profile.assetName, { kind: 'found', architecture: 'maion-coder' });
			await start(harness);
			const offered = family(harness, MAI_ID);
			await setUpAndWait(harness, MAI);
			const status = harness.provider.status.get();
			const downloaded = { active: status.active, runtime: status.runtime, downloads: harness.downloader.requests.length, probes: [...runtime.architectureProbes], spawns: harness.spawner.processes.length };
			await harness.provider.makeActive(MAI_ID).catch(() => undefined);
			await waitFor(() => family(harness, MAI_ID)?.operation?.state === 'error');
			const failed = recovery(harness, MAI_ID);
			const operation = family(harness, MAI_ID)!.operation!;
			runtime.provide();
			if (recover === 'retry') {
				await harness.provider.retry(operation.id);
			} else {
				// As the detail page's Load does: Start, not the operation's Retry.
				await harness.provider.start();
			}
			await waitFor(() => activeReady(harness, MAI_ID) && !family(harness, MAI_ID)?.operation);
			return { offered: { offer: !!offered?.offer, entry: offered?.entry && { modelFilesPresent: offered.entry.modelFilesPresent } }, downloaded, error: operation.error, failed, recovered: recovery(harness, MAI_ID), spawns: harness.spawner.processes.length };
		};
		const directions = ['getLlamaCpp', 'openSettings', 'retry'];
		const expected = (error: { readonly code: string; readonly message: string }) => ({
			offered: { offer: true, entry: { modelFilesPresent: false } },
			downloaded: { active: undefined, runtime: {}, downloads: 1, probes: [], spawns: 0 },
			error: { ...error, actions: directions },
			failed: { active: MAI_ID, server: 'error', operation: { kind: 'swap', state: 'error', code: error.code }, readiness: 'error' },
			recovered: { active: MAI_ID, server: 'ready', operation: undefined, readiness: 'ready' },
			spawns: 1,
		});
		const notFound = { code: 'runtimeNotFound', message: 'Example Flash 1.0 needs llama.cpp to run. Install a llama.cpp build that supports it, then set Chat \u203a Copilot \u203a Local Model: Llama Server Path (chat.copilot.localModel.llamaServerPath) to its llama-server and select Retry.' };
		assert.deepStrictEqual({
			notFoundRetry: await run('notFound', 'retry'),
			notFoundSelectAgain: await run('notFound', 'selectAgain'),
			tooOldRetry: await run('tooOld', 'retry'),
		}, {
			notFoundRetry: expected(notFound),
			notFoundSelectAgain: expected(notFound),
			tooOldRetry: expected({ code: 'runtimeTooOld', message: 'The llama-server is too old.' }),
		});
	});

	test('every load resolves the setting\'s llama-server again: once an upgrade retargets its link (the old target gone), Start runs the new target; while the link dangles the load fails with directions, and Retry runs the build it points at next', async () => {
		const runtime = new FakeRuntime();
		const harness = createHarness({ runtime });
		await start(harness);
		await setUpActive(harness, MAI);
		const resolvesBefore = runtime.topologyKeys.length;
		const stopped = async () => {
			await harness.provider.stop({ stopNow: false });
			await waitFor(() => harness.provider.status.get().active?.server === 'stopped');
		};
		await stopped();
		runtime.binary = 'C:\\llama\\b12000\\llama-server.exe';
		await harness.provider.start();
		await waitFor(() => activeReady(harness, MAI_ID));
		await stopped();
		runtime.present = false;
		await harness.provider.start();
		await waitFor(() => harness.provider.status.get().active?.server === 'error');
		const dangling = harness.provider.status.get().active?.error;
		runtime.binary = 'C:\\llama\\b12100\\llama-server.exe';
		runtime.provide();
		// The Retry of a server error.
		await harness.provider.start();
		await waitFor(() => activeReady(harness, MAI_ID));
		assert.deepStrictEqual({ spawned: harness.spawner.processes.map(child => child.file), dangling: dangling && [dangling.code, dangling.actions], resolves: runtime.topologyKeys.length - resolvesBefore }, {
			spawned: [LLAMA_SERVER, 'C:\\llama\\b12000\\llama-server.exe', 'C:\\llama\\b12100\\llama-server.exe'],
			dangling: ['runtimeNotFound', ['getLlamaCpp', 'openSettings', 'retry']],
			resolves: 3,
		});
	});

	test('on-device models are offered on NVIDIA GPUs only: another vendor or an unknown device lists no family or active model, not even an installed one', async () => {
		let homes = 0;
		const listing = async (adapters: IGpuAdapter[]) => {
			const persistent = createPersistent(`home-vendor-${++homes}`);
			await writeOwnedInstall(persistent, EXAMPLE);
			const gpu = new FakeGpuProbe();
			gpu.adapters = adapters;
			const harness = createHarness({ gpu, persistent });
			await start(harness);
			const status = harness.provider.status.get();
			return { vendor: status.device.vendor, families: status.families.map(candidate => candidate.familyId), active: status.active?.familyId, rows: harness.provider.getModelRows().length, spawns: harness.spawner.processes.length };
		};
		assert.deepStrictEqual({
			nvidia: await listing([N1X_ADAPTER]),
			amd: await listing([{ id: '1002:150e', description: 'AMD Radeon 8060S Graphics', vendorId: 0x1002, capacityBytes: 96 * GIB, unifiedMemory: true }]),
			intel: await listing([{ id: '8086:7d55', description: 'Intel(R) Arc(TM) Graphics', vendorId: 0x8086, capacityBytes: 64 * GIB, unifiedMemory: true }]),
			unknown: await listing([]),
		}, {
			nvidia: { vendor: 'nvidia', families: [MAI_ID, EXAMPLE_ID], active: undefined, rows: 1, spawns: 0 },
			amd: { vendor: 'amd', families: [], active: undefined, rows: 0, spawns: 0 },
			intel: { vendor: 'intel', families: [], active: undefined, rows: 0, spawns: 0 },
			unknown: { vendor: undefined, families: [], active: undefined, rows: 0, spawns: 0 },
		});
	});
	test('a setup agreed to only for model files already on this device never downloads: when the files are gone, the automatic resume and Resume ask again (consentChanged)', async () => {
		const persistent = createPersistent();
		await interruptDownload(persistent);
		const stored = persistent.storage.get('localModel.provider') as { operations: Record<string, unknown>[] };
		const downloadRecord = stored.operations[0];
		/** Restarts with `record` in a home where EXAMPLE's files aren't (or are no longer) on disk. */
		const restart = async (name: string, record: Record<string, unknown>, resume = false) => {
			const home = createPersistent(name);
			home.storage.set('localModel.provider', { ...stored, operations: [record] });
			const harness = createHarness({ persistent: home });
			await start(harness);
			if (resume) {
				await harness.provider.resume(String(record.operationId)).catch(() => undefined);
			}
			await waitFor(() => family(harness, EXAMPLE_ID)?.operation?.pausedReason === 'consentChanged' || (!!family(harness, EXAMPLE_ID)?.install && !family(harness, EXAMPLE_ID)?.operation));
			await settle();
			const operation = family(harness, EXAMPLE_ID)?.operation;
			return { operation: operation && { state: operation.state, pausedReason: operation.pausedReason }, downloads: harness.downloader.requests.length };
		};
		const { downloadAgreed: agreedWhenSetUp, ...olderRecord } = downloadRecord;
		const asksAgain = { operation: { state: 'paused', pausedReason: 'consentChanged' }, downloads: 0 };
		assert.deepStrictEqual({
			agreedWhenSetUp,
			download: await restart('home-download', downloadRecord),
			reuseOnly: await restart('home-reuse', { ...downloadRecord, downloadAgreed: false }),
			// A record of an earlier version doesn't say what was agreed to: a download asks again.
			olderRecord: await restart('home-older', olderRecord),
			reuseOnlyResume: await restart('home-reuse-resume', { ...downloadRecord, downloadAgreed: false, intent: 'pausedByUser' }, true),
		}, {
			agreedWhenSetUp: true,
			download: { operation: undefined, downloads: 1 },
			reuseOnly: asksAgain,
			olderRecord: asksAgain,
			reuseOnlyResume: asksAgain,
		});
	});

	test('a device that stops being an NVIDIA GPU while a swap waits for running responses: the incoming model never loads, the server stops, and neither a start nor a direct request loads one', async () => {
		const harness = await createTwoInstalled();
		const turn = harness.provider.beginTurn('session-1');
		await sendDirect(harness, MAI.profile.assetName, 'session-1');
		await harness.provider.makeActive(EXAMPLE_ID);
		await waitFor(() => !!harness.provider.status.get().active?.drain);
		// The device probe now selects an AMD GPU.
		harness.gpu.adapters = [{ id: '1002:150e', description: 'AMD Radeon 8060S Graphics', vendorId: 0x1002, capacityBytes: 96 * GIB, unifiedMemory: true }];
		harness.gpu.topologyKey = '1002:150e@1.0';
		harness.gpu.topologyChanged = true;
		await harness.provider.refreshCatalog();
		harness.provider.endTurn('session-1', turn);
		await waitFor(() => harness.supervisor().state.get().server === 'stopped' && family(harness, EXAMPLE_ID) === undefined);
		await settle(20);
		await harness.provider.start().catch(() => undefined);
		const direct = await sendDirect(harness, EXAMPLE.profile.assetName, 'session-2');
		await settle(20);
		const status = harness.provider.status.get();
		assert.deepStrictEqual({
			spawns: harness.spawner.processes.map(child => child.arg('--alias')),
			server: harness.supervisor().state.get().server,
			listed: { vendor: status.device.vendor, families: status.families, active: status.active, rows: harness.provider.getModelRows().length },
			direct,
		}, {
			spawns: ['MAI-Code-1.1-Flash'],
			server: 'stopped',
			listed: { vendor: 'amd', families: [], active: undefined, rows: 0 },
			direct: '503: The on-device model is not available. Start a new chat or pick another model.',
		});
	});
	test('serving compatibility: a supported architecture, an inconclusive probe or an unknown architecture continue to the download', async () => {
		let homes = 0;
		const run = async (read: GgufArchitectureRead, support?: LlamaArchitectureSupport) => {
			const runtime = new FakeRuntime();
			if (support) {
				runtime.architectureSupport.set('qwen3', support);
			}
			const harness = createHarness({ runtime, persistent: createPersistent(`home-${++homes}`) });
			harness.catalog.architectures.set(EXAMPLE.profile.assetName, read);
			await start(harness);
			await setUpAndWait(harness, EXAMPLE);
			const complete = harness.telemetry.events.find(event => event.name === 'localModel.setup' && event.data.phase === 'complete')?.data;
			return { remoteReads: harness.catalog.architectureReads, probes: runtime.architectureProbes, downloads: harness.downloader.requests.length, complete: [complete?.architecture, complete?.architectureSupport] };
		};
		assert.deepStrictEqual({
			supported: await run({ kind: 'found', architecture: 'qwen3' }),
			inconclusiveProbe: await run({ kind: 'found', architecture: 'qwen3' }, 'unknown'),
			unknownArchitecture: await run({ kind: 'unknown', reason: 'overCap' }),
			unexpectedName: await run({ kind: 'found', architecture: 'Qwen 3' }),
		}, {
			supported: { remoteReads: ['example-coder'], probes: ['qwen3'], downloads: 1, complete: ['qwen3', 'supported'] },
			inconclusiveProbe: { remoteReads: ['example-coder'], probes: ['qwen3'], downloads: 1, complete: ['qwen3', 'unknown'] },
			unknownArchitecture: { remoteReads: ['example-coder'], probes: [], downloads: 1, complete: ['', ''] },
			unexpectedName: { remoteReads: ['example-coder'], probes: [], downloads: 1, complete: ['', ''] },
		});
	});

	test('a resolved file name that would leave the version directory is never read or downloaded: the setup fails closed, not with a false runtimeUnsupportedModel', async () => {
		// A planted GGUF outside managed storage whose header would make the probe say "unsupported".
		const weights = Buffer.from(buildSyntheticGguf({ 'general.architecture': 'maion-coder' })).toString('latin1') + 'weights'.repeat(16);
		const base = createModel('example-coder', 'Example Coder', { minLlamaCppBuild: 11000 }, weights);
		const traversal = '..\\..\\..\\outside.gguf';
		const crafted: ITestModel = { ...base, resolved: { ...base.resolved, primaryFile: traversal, files: base.resolved.files.map(file => file.relativePath === 'model.gguf' ? { ...file, relativePath: traversal } : file) } };
		const runtime = new FakeRuntime();
		runtime.architectureSupport.set('maion-coder', 'unsupported');
		const harness = createHarness({ runtime, models: [MAI, crafted] });
		const outside = path.join(harness.persistent.home, 'azureml-models', 'outside.gguf');
		await fs.promises.mkdir(path.dirname(outside), { recursive: true });
		await fs.promises.writeFile(outside, Buffer.from(weights, 'latin1'));
		await start(harness);
		await harness.provider.setUp(EXAMPLE_ID, consent(harness, EXAMPLE_ID), CancellationToken.None);
		await waitFor(() => family(harness, EXAMPLE_ID)?.operation?.state === 'error');
		assert.deepStrictEqual({
			error: family(harness, EXAMPLE_ID)?.operation?.error?.code,
			localReads: harness.architectureReadPaths,
			remoteReads: harness.catalog.architectureReads,
			probes: runtime.architectureProbes,
			downloads: harness.downloader.requests.length,
		}, {
			error: 'notPublished',
			localReads: [],
			remoteReads: [],
			probes: [],
			downloads: 0,
		});
	});

	test('load time: a model whose architecture llama.cpp does not know fails with runtimeUnsupportedModel once, without downgrade retries, naming the first release that runs it when only recent releases do (maion-coder)', async () => {
		const run = async (architecture: string) => {
			const harness = createHarness({ server: { loading: true }, metadata: () => ({ ...DEFAULT_METADATA, architecture }), persistent: createPersistent(`home-${architecture}`) });
			// The pre-download read could not tell (the registry refused the Range request).
			harness.catalog.architectures.set(MAI.profile.assetName, { kind: 'unknown', reason: 'http' });
			harness.spawner.behavior = child => {
				child.writeStderr(STOCK_UNKNOWN_ARCHITECTURE_STDERR);
				child.exit(1);
			};
			await start(harness);
			await harness.provider.setUp(MAI_ID, consent(harness, MAI_ID), CancellationToken.None);
			await waitFor(() => family(harness, MAI_ID)?.operation?.state === 'error');
			const status = harness.provider.status.get();
			return {
				operation: family(harness, MAI_ID)?.operation?.error,
				active: { server: status.active?.server, error: status.active?.error },
				spawns: harness.spawner.processes.length,
				server: harness.telemetry.events.filter(event => event.name === 'localModel.server' && (event.data.event === 'profileDowngraded' || event.data.event === 'startFailed')).map(event => `${event.data.event}:${event.data.errorCode}`),
			};
		};
		const expected = (directions: string) => {
			const error = {
				code: 'runtimeUnsupportedModel',
				message: `This llama.cpp build (0.6.0-dev (b11459)) can't run Example Flash 1.0. ${directions}, then set Chat \u203a Copilot \u203a Local Model: Llama Server Path (chat.copilot.localModel.llamaServerPath) to its llama-server and select Retry.`,
				actions: ['getLlamaCpp', 'openSettings', 'retry'],
			};
			return { operation: error, active: { server: 'error', error }, spawns: 1, server: ['startFailed:runtimeUnsupportedModel'] };
		};
		assert.deepStrictEqual({ packaged: await run('qwen2'), newArchitecture: await run('maion-coder') }, {
			packaged: expected('Install a llama.cpp build that supports it'),
			newArchitecture: expected('Install llama.cpp b11658 or later'),
		});
	});

	test('Resume and Retry after an offline restart ask again when the refreshed catalog changed the size or the license of the same content', async () => {
		const scenario = async (name: string, changed: ITestModel, act: (provider: ShimLocalModelProvider, operationId: string) => Promise<void>) => {
			const persistent = createPersistent(`home-${name}`);
			await interruptDownload(persistent);

			// The next start is offline: the interrupted download cannot auto-resume.
			const second = createHarness({ persistent, models: [] });
			second.catalog.publicState = 'unavailable';
			await start(second);
			const operationId = family(second, EXAMPLE_ID)!.operation!.id;
			second.catalog.onRefresh = () => {
				second.catalog.publicState = 'ready';
				second.catalog.models = [MAI, changed];
			};
			await act(second.provider, operationId);
			await waitFor(() => family(second, EXAMPLE_ID)?.operation?.state === 'paused' || !!family(second, EXAMPLE_ID)?.install);
			const operation = family(second, EXAMPLE_ID)?.operation;
			return {
				sameContent: changed.resolved.contentId === EXAMPLE.resolved.contentId,
				operation: operation && { state: operation.state, pausedReason: operation.pausedReason, resumeOnStartup: operation.resumeOnStartup },
				downloads: second.downloader.requests.length,
				installed: !!family(second, EXAMPLE_ID)?.install,
			};
		};
		const larger = createModel('example-coder', 'Example Coder', { minLlamaCppBuild: 11000, downloadBytes: EXAMPLE.profile.downloadBytes + 20 * GIB, peakDiskBytes: EXAMPLE.profile.peakDiskBytes + 20 * GIB });
		const relicensed = createModel('example-coder', 'Example Coder', { minLlamaCppBuild: 11000, licenseName: 'Other License', licenseUrl: 'https://example.com/other-license' });
		const asksAgain = { sameContent: true, operation: { state: 'paused', pausedReason: 'consentChanged', resumeOnStartup: false }, downloads: 0, installed: false };
		assert.deepStrictEqual({
			largerOnResume: await scenario('larger-resume', larger, (provider, id) => provider.resume(id)),
			largerOnRetry: await scenario('larger-retry', larger, (provider, id) => provider.retry(id)),
			relicensedOnResume: await scenario('license-resume', relicensed, (provider, id) => provider.resume(id)),
			relicensedOnRetry: await scenario('license-retry', relicensed, (provider, id) => provider.retry(id)),
		}, {
			largerOnResume: asksAgain,
			largerOnRetry: asksAgain,
			relicensedOnResume: asksAgain,
			relicensedOnRetry: asksAgain,
		});
	});

	test('a foreign install found on disk is set up by verifying it (adopted, not owned) and then loads', async () => {
		const persistent = createPersistent();
		const asset = 'Example-0.5B-Instruct';
		const familyDir = path.join(persistent.home, 'azureml-models', 'azureml', asset);
		const versionDir = path.join(familyDir, '1');
		const files = { 'example-0.5b-instruct-q4_k_m.gguf': 'gguf-weights', 'llama-default.ini': presetFor(asset) };
		await fs.promises.mkdir(versionDir, { recursive: true });
		for (const [name, content] of Object.entries(files)) {
			await fs.promises.writeFile(path.join(versionDir, name), content);
		}
		const primaryPath = path.join(versionDir, 'example-0.5b-instruct-q4_k_m.gguf');
		const manifestPath = path.join(versionDir, 'manifest.json');
		const manifestFiles = Object.entries(files).map(([name, content]) => ({ path: name, totalBytes: Buffer.byteLength(content), sha256: sha256(content), etag: '' }));
		await fs.promises.writeFile(manifestPath, JSON.stringify({ assetId: `azureml://registries/azureml/models/${asset}/versions/1`, registry: 'azureml', name: asset, version: '1', primaryPath, totalBytes: 1, serveOptions: { ctxSize: 32768, parallel: 1, args: ['--host', '0.0.0.0'] }, maxConcurrent: 1, files: manifestFiles, extraFiles: ['llama-default.ini'] }));
		await fs.promises.writeFile(path.join(familyDir, 'active.json'), JSON.stringify({ version: '1', primaryPath, manifestPath, registration: { model: { id: asset } } }));
		const familyId = 'example-0.5b-instruct-local';

		const harness = createHarness({ persistent, models: [] });
		await start(harness);
		const found = family(harness, familyId);
		await harness.provider.setUp(familyId, consent(harness, familyId), CancellationToken.None);
		await waitFor(() => activeReady(harness, familyId) && !family(harness, familyId)?.operation);
		const child = harness.spawner.processes[0];
		assert.deepStrictEqual({
			found: { entry: found?.entry, install: found?.install, offer: found?.offer, displayName: found?.displayName },
			install: family(harness, familyId)?.install,
			spawn: { model: child.arg('--model'), alias: child.arg('--alias'), host: child.arg('--host'), ctx: child.arg('--ctx-size') },
			setupEvents: harness.telemetry.names('localModel.setup', 'phase'),
			ownerFile: fs.existsSync(path.join(familyDir, '.vscode-owner.json')),
		}, {
			found: { entry: { modelFilesPresent: true }, install: undefined, offer: undefined, displayName: asset },
			install: { contentId: computeContentId(manifestFiles.map(file => ({ path: file.path, sizeBytes: file.totalBytes, sha256: file.sha256 }))), adopted: true, owned: false, modelId: `vscode-on-device/${asset}` },
			spawn: { model: primaryPath, alias: asset, host: '127.0.0.1', ctx: '32768' },
			setupEvents: ['verify', 'adopt'],
			ownerFile: false,
		});
	});

	test('memory pressure at admission reports memoryBusy with Retry; Retry loads once memory is free', async () => {
		const runtime = new FakeRuntime();
		runtime.devices = [{ ...N1X_VULKAN, freeBytes: 100 * MIB }];
		const harness = createHarness({ runtime });
		await start(harness);
		await harness.provider.setUp(MAI_ID, consent(harness, MAI_ID), CancellationToken.None);
		await waitFor(() => family(harness, MAI_ID)?.operation?.state === 'error');
		const operation = family(harness, MAI_ID)!.operation!;
		const busy = { code: operation.error?.code, actions: operation.error?.actions, active: harness.provider.status.get().active?.server, spawns: harness.spawner.processes.length };
		runtime.devices = [N1X_VULKAN];
		await harness.provider.retry(operation.id);
		await waitFor(() => activeReady(harness, MAI_ID) && !family(harness, MAI_ID)?.operation);
		assert.deepStrictEqual({ busy, spawns: harness.spawner.processes.length, serverEvents: harness.telemetry.names('localModel.server', 'event') }, {
			busy: { code: 'memoryBusy', actions: ['retry'], active: 'error', spawns: 0 },
			spawns: 1,
			serverEvents: ['memoryBusy', 'ready'],
		});
	});

	test('a second install does not become active: it gets a ready offer and an inactive row; direct turns route through the sentinel row to the active model and fail closed for the inactive one', async () => {
		const harness = await createTwoInstalled();
		assert.deepStrictEqual({
			active: harness.provider.status.get().active?.familyId,
			example: { owned: family(harness, EXAMPLE_ID)?.install?.owned, readyOfferId: family(harness, EXAMPLE_ID)?.readyOfferId },
			spawns: harness.spawner.processes.length,
			rows: harness.provider.getModelRows().map(row => [row.id, row.active]),
			activeTurn: await sendDirect(harness, MAI.profile.assetName, 'session-1'),
			inactiveTurn: await sendDirect(harness, EXAMPLE.profile.assetName, 'session-1'),
		}, {
			active: MAI_ID,
			example: { owned: true, readyOfferId: `${EXAMPLE_ID}:${EXAMPLE.resolved.contentId}` },
			spawns: 1,
			rows: [['example-coder', false], ['MAI-Code-1.1-Flash', true]],
			activeTurn: 'served by generation 1',
			inactiveTurn: '409: Example Coder isn\'t loaded.',
		});
	});

	/** A streamed direct request of `sessionId` for the row `alias`, read to its end: which generation served it, or the error. */
	async function sendDirect(harness: Harness, alias: string, sessionId: string): Promise<string> {
		const url = 'http://on-device.vscode.invalid/v1/chat/completions';
		const response = await harness.provider.requestHandler.handleRequest(new Request(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: '******' },
			body: JSON.stringify({ model: alias, stream: true, messages: [{ role: 'user', content: 'hi' }] }),
		}), { requestId: 'request-1', sessionId, interactionType: 'conversation-agent', transport: 'http', url, headers: {}, signal: new AbortController().signal });
		const text = await response.text();
		return response.status === 200 && text.includes('Hello')
			? `served by generation ${harness.provider.status.get().active?.servingGeneration}`
			: `${response.status}: ${(JSON.parse(text) as { error: { message: string } }).error.message}`;
	}

	test('a turn that used the model keeps it through a swap until the turn ends: the drain counts it as one response, its next request is still served, other sessions are refused', async () => {
		const harness = await createTwoInstalled();
		const turn = harness.provider.beginTurn('session-1');
		const first = await sendDirect(harness, MAI.profile.assetName, 'session-1');
		await harness.provider.makeActive(EXAMPLE_ID);
		await waitFor(() => !!harness.provider.status.get().active?.drain);
		const draining = () => ({ active: harness.provider.status.get().active, phase: family(harness, EXAMPLE_ID)?.operation?.phase, usage: family(harness, MAI_ID)?.usage.runningStreams });
		// The turn runs a tool between its requests: still one response.
		const betweenRequests = draining();
		const next = await sendDirect(harness, MAI.profile.assetName, 'session-1');
		const otherSession = await sendDirect(harness, MAI.profile.assetName, 'session-2');
		const afterNext = draining();
		harness.provider.endTurn('session-1', turn);
		await waitFor(() => activeReady(harness, EXAMPLE_ID) && !family(harness, EXAMPLE_ID)?.operation);
		const drainingMai = { familyId: MAI_ID, contentId: MAI.resolved.contentId, servingGeneration: 1, server: 'stopping', profile: 'full-gpu', drain: { runningStreams: 1 }, swapTo: EXAMPLE_ID };
		assert.deepStrictEqual({
			first,
			betweenRequests,
			next,
			otherSession,
			afterNext,
			swapped: activeIdentity(harness),
			afterTurn: await sendDirect(harness, MAI.profile.assetName, 'session-1'),
			serverEvents: harness.telemetry.names('localModel.server', 'event'),
		}, {
			first: 'served by generation 1',
			betweenRequests: { active: drainingMai, phase: 'draining', usage: 1 },
			next: 'served by generation 1',
			otherSession: '409: Example Flash 1.0 isn\'t loaded.',
			afterNext: { active: drainingMai, phase: 'draining', usage: 1 },
			swapped: { contentId: EXAMPLE.resolved.contentId, servingGeneration: 2, server: 'ready' },
			afterTurn: '409: Example Flash 1.0 isn\'t loaded.',
			serverEvents: ['ready', 'swapStarted', 'ready', 'swapCompleted'],
		});
	});

	test('a turn that used the model keeps it through a context size reload until the turn ends; its next request is still served at the old size', async () => {
		const big = createModel('Big-Model', 'Big Model', { maxContextWindowTokens: 262_144, maxPromptTokens: 200_000, maxOutputTokens: 32_768, minLlamaCppBuild: 11000 }, undefined, { ctxSize: 262_144 });
		const bigId = big.profile.familyId;
		const metadata: IGgufModelMetadata = {
			architecture: 'maion-coder', blockCount: 4, embeddingLength: 1024, headCount: 8, headCountKv: 2, keyLength: 128, valueLength: 128, contextLength: 262_145,
			slidingWindow: 512, slidingWindowLayers: [true, true, true, false], vocabSize: 1000,
		};
		extraModels.push(big);
		const harness = createHarness({ models: [big], metadata: () => metadata, server: { nCtx: 131_072 } });
		await start(harness);
		await setUpActive(harness, big);
		const turn = harness.provider.beginTurn('session-1');
		const first = await sendDirect(harness, big.profile.assetName, 'session-1');
		await harness.provider.setContextSize(bigId, 65_536);
		await waitFor(() => !!harness.provider.status.get().active?.drain);
		const draining = () => ({ drain: harness.provider.status.get().active?.drain, phase: family(harness, bigId)?.operation?.phase });
		const betweenRequests = draining();
		const next = await sendDirect(harness, big.profile.assetName, 'session-1');
		const afterNext = draining();
		harness.server.nCtx = 65_536;
		harness.provider.endTurn('session-1', turn);
		await waitFor(() => activeReady(harness, bigId) && !family(harness, bigId)?.operation);
		assert.deepStrictEqual({
			first,
			betweenRequests,
			next,
			afterNext,
			reloaded: { active: activeIdentity(harness), ctx: harness.spawner.processes.map(process => process.arg('--ctx-size')) },
		}, {
			first: 'served by generation 1',
			betweenRequests: { drain: { runningStreams: 1 }, phase: 'draining' },
			next: 'served by generation 1',
			afterNext: { drain: { runningStreams: 1 }, phase: 'draining' },
			reloaded: { active: { contentId: big.resolved.contentId, servingGeneration: 2, server: 'ready' }, ctx: ['131072', '65536'] },
		});
	});

	test('Stop Now ends a drain that waits for a turn: the swap completes and the turn no longer holds the old model', async () => {
		const harness = await createTwoInstalled();
		harness.provider.beginTurn('session-1');
		await sendDirect(harness, MAI.profile.assetName, 'session-1');
		await harness.provider.makeActive(EXAMPLE_ID);
		await waitFor(() => !!harness.provider.status.get().active?.drain);
		const drain = harness.provider.status.get().active?.drain;
		await harness.provider.stop({ stopNow: true });
		await waitFor(() => activeReady(harness, EXAMPLE_ID) && !family(harness, EXAMPLE_ID)?.operation);
		assert.deepStrictEqual({
			drain,
			swapped: activeIdentity(harness),
			oldResponses: harness.supervisor().responseCount(1),
			// The turn's next request: the old model is gone; the new one serves it.
			oldModel: await sendDirect(harness, MAI.profile.assetName, 'session-1'),
			newModel: await sendDirect(harness, EXAMPLE.profile.assetName, 'session-1'),
			serverEvents: harness.telemetry.names('localModel.server', 'event'),
		}, {
			drain: { runningStreams: 1 },
			swapped: { contentId: EXAMPLE.resolved.contentId, servingGeneration: 2, server: 'ready' },
			oldResponses: 0,
			oldModel: '409: Example Flash 1.0 isn\'t loaded.',
			newModel: 'served by generation 2',
			serverEvents: ['ready', 'swapStarted', 'stopNow', 'ready', 'swapCompleted'],
		});
	});

	test('cancelling a swap while it waits for running responses keeps the previous model loaded and active: it serves the turn and other sessions again, and nothing else loads', async () => {
		const harness = await createTwoInstalled();
		const turn = harness.provider.beginTurn('session-1');
		await sendDirect(harness, MAI.profile.assetName, 'session-1');
		await harness.provider.makeActive(EXAMPLE_ID);
		await waitFor(() => !!harness.provider.status.get().active?.drain);
		harness.provider.cancel(family(harness, EXAMPLE_ID)!.operation!.id);
		const atCancel = { swapTo: harness.provider.status.get().active?.swapTo, incoming: family(harness, EXAMPLE_ID)?.operation };
		await waitFor(() => activeReady(harness, MAI_ID));
		const afterCancel = activeIdentity(harness);
		const turnRequest = await sendDirect(harness, MAI.profile.assetName, 'session-1');
		const otherSession = await sendDirect(harness, MAI.profile.assetName, 'session-2');
		harness.provider.endTurn('session-1', turn);
		await settle();
		assert.deepStrictEqual({
			atCancel,
			afterCancel,
			turnRequest,
			otherSession,
			afterTurn: activeIdentity(harness),
			spawns: harness.spawner.processes.length,
			rows: harness.provider.getModelRows().map(row => [row.id, row.active]),
			serverEvents: harness.telemetry.names('localModel.server', 'event'),
		}, {
			atCancel: { swapTo: undefined, incoming: undefined },
			afterCancel: { contentId: MAI.resolved.contentId, servingGeneration: 1, server: 'ready' },
			turnRequest: 'served by generation 1',
			otherSession: 'served by generation 1',
			afterTurn: { contentId: MAI.resolved.contentId, servingGeneration: 1, server: 'ready' },
			spawns: 1,
			rows: [['example-coder', false], ['MAI-Code-1.1-Flash', true]],
			serverEvents: ['ready', 'swapStarted', 'swapCancelled'],
		});
	});

	/** What the picker and the notice read for `familyId`: the active model, its failed operation, and the derived readiness. */
	function recovery(harness: Harness, familyId: string) {
		const status = harness.provider.status.get();
		const entry = family(harness, familyId)!;
		const operation = entry.operation;
		return {
			active: status.active?.familyId,
			server: status.active?.server,
			operation: operation && { kind: operation.kind, state: operation.state, code: operation.error?.code },
			readiness: deriveLocalModelReadiness(entry, status),
		};
	}

	test('a hold ends with its turn however the turn ends: replaced by the session\'s next turn (a cancelled turn), ended, or the provider disposed', async () => {
		const harness = createHarness();
		await start(harness);
		await setUpActive(harness, MAI);
		const responses = () => family(harness, MAI_ID)?.usage.runningStreams;
		const supervisor = harness.supervisor();
		const generation = supervisor.state.get().identity!.servingGeneration;

		harness.provider.beginTurn('session-1');
		await sendDirect(harness, MAI.profile.assetName, 'session-1');
		const held = responses();
		const nextTurn = harness.provider.beginTurn('session-1');
		const replaced = responses();
		await sendDirect(harness, MAI.profile.assetName, 'session-1');
		const heldAgain = responses();
		harness.provider.endTurn('session-1', nextTurn);
		const ended = responses();
		harness.provider.beginTurn('session-2');
		await sendDirect(harness, MAI.profile.assetName, 'session-2');
		const beforeDispose = supervisor.responseCount(generation);
		harness.provider.dispose();
		assert.deepStrictEqual({ held, replaced, heldAgain, ended, beforeDispose, afterDispose: supervisor.responseCount(generation) }, {
			held: 1,
			replaced: 0,
			heldAgain: 1,
			ended: 0,
			beforeDispose: 1,
			afterDispose: 0,
		});
	});

	function familyDirOf(harness: Harness, model: ITestModel): string {
		return path.join(harness.persistent.home, 'azureml-models', model.profile.registry, model.profile.assetName);
	}

	function downloadedIds(harness: Harness): string[] {
		return harness.downloader.requests.map(request => request.modelId.replace('azureml://registries/', ''));
	}

	function activeIdentity(harness: Harness) {
		const active = harness.provider.status.get().active;
		return active && { contentId: active.contentId, servingGeneration: active.servingGeneration, server: active.server };
	}

	test('update: a newer build downloads into a new version, switches active.json, reloads once idle on a new generation, prunes the old version; Auto routes bound to the old content fall back as staleModel', async () => {
		const mai2 = createModel('MAI-Code-1.1-Flash', 'Example Flash 1.0', { version: '2' });
		extraModels.push(mai2);
		const capi = createFakeCapi();
		const harness = createHarness({ proxyFetch: capi.fetch });
		await start(harness);
		await setUpActive(harness, MAI);
		const familyDir = familyDirOf(harness, MAI);
		const localBefore = await autoTurn(harness.provider, true);

		harness.catalog.models = [mai2, EXAMPLE];
		harness.catalog.contentIds.set(sourceKey(mai2.profile), mai2.resolved.contentId);
		await harness.provider.refreshCatalog();
		const offered = family(harness, MAI_ID)?.install?.update;
		const supervisor = harness.supervisor();
		const inFlight = supervisor.acquireLease(supervisor.state.get().identity!)!;
		await harness.provider.update(MAI_ID, undefined, CancellationToken.None);
		await waitFor(() => family(harness, MAI_ID)?.operation?.phase === 'draining');
		harness.clock.advance(60 * 60_000);
		await settle();
		const readActiveVersion = async () => (JSON.parse(await fs.promises.readFile(path.join(familyDir, 'active.json'), 'utf8')) as { version: string }).version;
		const whileDraining = {
			phase: family(harness, MAI_ID)?.operation?.phase,
			kind: family(harness, MAI_ID)?.operation?.kind,
			active: activeIdentity(harness),
			activeJson: await readActiveVersion(),
			versions: fs.readdirSync(familyDir).filter(name => /^\d+$/.test(name)).sort(),
		};
		inFlight.dispose();
		await waitFor(() => activeReady(harness, MAI_ID) && !family(harness, MAI_ID)?.operation);
		await waitFor(() => !fs.existsSync(path.join(familyDir, '1')));
		const fellBack = await autoTurn(harness.provider, false);

		assert.deepStrictEqual({
			localBefore: localBefore.includes('Hello'),
			offered,
			whileDraining,
			after: {
				active: activeIdentity(harness),
				install: family(harness, MAI_ID)?.install,
				activeJson: await readActiveVersion(),
				versions: fs.readdirSync(familyDir).filter(name => /^\d+$/.test(name)).sort(),
				spawnedModel: harness.spawner.processes.at(-1)!.arg('--model'),
			},
			fellBack,
			cloudChats: capi.chats,
			routes: harness.telemetry.events.filter(event => event.name === 'localModel.route').map(event => `${event.data.selection}:${event.data.reason}`),
			downloads: downloadedIds(harness),
			setupEvents: harness.telemetry.names('localModel.setup', 'phase'),
		}, {
			localBefore: true,
			offered: { contentId: mai2.resolved.contentId, downloadBytes: mai2.profile.downloadBytes },
			whileDraining: { phase: 'draining', kind: 'update', active: { contentId: MAI.resolved.contentId, servingGeneration: 1, server: 'stopping' }, activeJson: '2', versions: ['1', '2'] },
			after: {
				active: { contentId: mai2.resolved.contentId, servingGeneration: 2, server: 'ready' },
				install: { contentId: mai2.resolved.contentId, adopted: false, owned: true, modelId: 'vscode-on-device/MAI-Code-1.1-Flash' },
				activeJson: '2',
				versions: ['2'],
				spawnedModel: path.join(familyDir, '2', 'model.gguf'),
			},
			fellBack: 'cloud answer from cloud-model',
			cloudChats: ['cloud-model'],
			routes: ['local:', 'fallback:staleModel'],
			downloads: ['azureml/models/MAI-Code-1.1-Flash/versions/1', 'azureml/models/MAI-Code-1.1-Flash/versions/2'],
			setupEvents: ['complete', 'update'],
		});
	});

	test('model files VS Code recorded identical to a production build, in another registry folder, are used as that build without a download; unrecorded files there are neither listed nor touched', async () => {
		const persistent = createPersistent();
		const writeElsewhere = async (model: ITestModel, promotedTo: object | undefined) => {
			const familyDir = path.join(persistent.home, 'azureml-models', 'example-registry', model.profile.assetName);
			const versionDir = path.join(familyDir, '5');
			await fs.promises.mkdir(versionDir, { recursive: true });
			for (const [name, content] of Object.entries(model.files)) {
				await fs.promises.writeFile(path.join(versionDir, name), content);
			}
			const files = model.resolved.files.map(file => ({ path: file.relativePath, totalBytes: file.sizeBytes, sha256: file.sha256!, etag: '' }));
			const manifest = buildManifest({ registry: 'azureml', assetName: model.profile.assetName, version: '5', versionDir, primaryFile: 'model.gguf', files, ctxSize: 32768, parallel: 1, args: ['--jinja'] });
			await fs.promises.writeFile(path.join(versionDir, 'manifest.json'), JSON.stringify(manifest));
			await fs.promises.writeFile(path.join(familyDir, '.vscode-owner.json'), JSON.stringify({ writer: 'vscode', versions: ['5'], writtenAt: new Date(0).toISOString(), capiId: model.profile.capiId, ...(promotedTo ? { promotedTo } : {}) }));
			return versionDir;
		};
		const recorded = await writeElsewhere(MAI, { registry: 'azureml', assetName: MAI.profile.assetName, version: MAI.profile.version, contentId: MAI.resolved.contentId });
		const unrecorded = await writeElsewhere(EXAMPLE, undefined);
		const harness = createHarness({ persistent });
		await start(harness);
		const listed = { mai: family(harness, MAI_ID)?.install, example: family(harness, EXAMPLE_ID)?.install };
		await harness.provider.setUp(MAI_ID, consent(harness, MAI_ID), CancellationToken.None);
		await waitFor(() => activeReady(harness, MAI_ID) && !family(harness, MAI_ID)?.operation);
		assert.deepStrictEqual({
			listed,
			spawnedModel: harness.spawner.processes[0].arg('--model'),
			downloads: downloadedIds(harness),
			unrecordedFiles: fs.readdirSync(unrecorded).sort(),
		}, {
			listed: { mai: { contentId: MAI.resolved.contentId, adopted: false, owned: true, modelId: 'vscode-on-device/MAI-Code-1.1-Flash' }, example: undefined },
			spawnedModel: path.join(recorded, 'model.gguf'),
			downloads: [],
			unrecordedFiles: ['llama-default.ini', 'manifest.json', 'model.gguf'],
		});
	});

	test('a download resumes after a restart whatever llama.cpp is set: the download consent never covers or runs a llama-server', async () => {
		const persistent = createPersistent('home-resume');
		await interruptDownload(persistent, { familyId: MAI_ID, runtime: Object.assign(new FakeRuntime(), { present: false }) });
		const record = (persistent.storage.get('localModel.provider') as { operations: Record<string, unknown>[] }).operations[0];

		// Another llama-server is set after the restart: the download still resumes.
		const restarted = Object.assign(new FakeRuntime(), { tooOld: true });
		const harness = createHarness({ persistent, runtime: restarted });
		await start(harness);
		await waitFor(() => !!family(harness, MAI_ID)?.install && !family(harness, MAI_ID)?.operation);
		assert.deepStrictEqual({
			runtimeKeys: Object.keys(record).filter(key => key.startsWith('runtime')),
			downloads: harness.downloader.requests.length,
			active: harness.provider.status.get().active,
			runtime: harness.provider.status.get().runtime,
			spawns: harness.spawner.processes.length,
		}, {
			runtimeKeys: [],
			downloads: 1,
			active: undefined,
			runtime: {},
			spawns: 0,
		});
	});
	test('a load still being prepared never overtakes a swap: the newly active model and its running response are untouched', async () => {
		const harness = await createTwoInstalled();
		await harness.provider.stop({ stopNow: false });
		await waitFor(() => harness.provider.status.get().active?.server === 'stopped');

		// A load of MAI starts preparing (blocked in its device probe) ...
		const preparing = new DeferredPromise<void>();
		harness.runtime.listDevicesGate = preparing;
		await harness.provider.start();
		await waitFor(() => harness.runtime.listDevicesWaiting);
		// ... while the user swaps to Example Coder, which loads and starts answering.
		await harness.provider.makeActive(EXAMPLE_ID);
		await waitFor(() => activeReady(harness, EXAMPLE_ID) && !family(harness, EXAMPLE_ID)?.operation);
		const supervisor = harness.supervisor();
		const exampleIdentity = supervisor.state.get().identity!;
		const response = supervisor.acquireLease(exampleIdentity)!;
		// The stale preparation now completes.
		preparing.complete();
		await settle(20);
		const exampleProcess = harness.spawner.processes.at(-1)!;
		assert.deepStrictEqual({
			active: activeIdentity(harness) && { ...activeIdentity(harness), familyId: harness.provider.status.get().active?.familyId },
			loaded: supervisor.state.get().plan?.familyId,
			spawns: harness.spawner.processes.map(child => child.arg('--alias')),
			exampleRunning: !exampleProcess.hasExited && exampleProcess.kills.length === 0,
			runningResponses: supervisor.leaseCount(exampleIdentity.servingGeneration),
		}, {
			active: { contentId: EXAMPLE.resolved.contentId, servingGeneration: 2, server: 'ready', familyId: EXAMPLE_ID },
			loaded: EXAMPLE_ID,
			spawns: ['MAI-Code-1.1-Flash', 'example-coder'],
			exampleRunning: true,
			runningResponses: 1,
		});
		response.dispose();
	});

	test('cancel during the first load stops that load and keeps a resumable paused record; Resume loads it', async () => {
		const harness = createHarness({ server: { loading: true } });
		await start(harness);
		await harness.provider.setUp(MAI_ID, consent(harness, MAI_ID), CancellationToken.None);
		await waitFor(() => family(harness, MAI_ID)?.operation?.phase === 'loading' && harness.spawner.processes.length === 1);
		const operationId = family(harness, MAI_ID)!.operation!.id;
		harness.provider.cancel(operationId);
		await waitFor(() => harness.spawner.processes[0].hasExited && harness.supervisor().state.get().server === 'stopped');
		await settle();
		const records = () => (harness.persistent.storage.get('localModel.provider') as { operations: { operationId: string; intent: string; resumeOnStartup: boolean }[] }).operations.map(record => ({ operationId: record.operationId, intent: record.intent, resumeOnStartup: record.resumeOnStartup }));
		const cancelled = { operation: family(harness, MAI_ID)?.operation && { state: family(harness, MAI_ID)!.operation!.state, pausedReason: family(harness, MAI_ID)!.operation!.pausedReason }, installed: !!family(harness, MAI_ID)?.install, records: records() };

		harness.server.loading = false;
		await harness.provider.resume(operationId);
		await waitFor(() => activeReady(harness, MAI_ID) && !family(harness, MAI_ID)?.operation);
		assert.deepStrictEqual({ cancelled, records: records(), spawns: harness.spawner.processes.length, downloads: harness.downloader.requests.length }, {
			cancelled: { operation: { state: 'paused', pausedReason: 'user' }, installed: true, records: [{ operationId, intent: 'pausedByUser', resumeOnStartup: false }] },
			records: [],
			spawns: 2,
			downloads: 1,
		});
	});

	test('a setup whose files were placed before its first load was interrupted only loads, even when its consent was recorded in an earlier format: no consent is asked again and nothing downloads', async () => {
		/** A setup of MAI paused during its first load, then quit, with its record as an earlier build wrote it. */
		const restart = async (name: string, changes: Record<string, unknown>, resume: boolean) => {
			const persistent = createPersistent(name);
			const first = createHarness({ persistent, server: { loading: true } });
			await start(first);
			await first.provider.setUp(MAI_ID, consent(first, MAI_ID), CancellationToken.None);
			await waitFor(() => family(first, MAI_ID)?.operation?.phase === 'loading' && first.spawner.processes.length === 1);
			first.provider.cancel(family(first, MAI_ID)!.operation!.id);
			await waitFor(() => first.spawner.processes[0].hasExited && first.supervisor().state.get().server === 'stopped');
			first.provider.dispose();
			await settle();
			const stored = persistent.storage.get('localModel.provider') as { operations: Record<string, unknown>[] };
			const earlierScope = JSON.stringify([2, 'model', MAI_ID, ['azureml', false, MAI.profile.downloadBytes, MAI.profile.peakDiskBytes, null, null], null]);
			persistent.storage.set('localModel.provider', { ...stored, operations: [{ ...stored.operations[0], offerScope: earlierScope, ...changes }] });

			const harness = createHarness({ persistent });
			await start(harness);
			const operation = family(harness, MAI_ID)?.operation;
			const restored = resume ? operation && { state: operation.state, pausedReason: operation.pausedReason, installed: !!family(harness, MAI_ID)?.install } : undefined;
			if (resume) {
				await harness.provider.resume(operation!.id);
			}
			await waitFor(() => activeReady(harness, MAI_ID) && !family(harness, MAI_ID)?.operation);
			return { restored, downloads: harness.downloader.requests.length, records: (persistent.storage.get('localModel.provider') as { operations: unknown[] }).operations.length };
		};
		assert.deepStrictEqual({
			interruptedByQuit: await restart('home-quit', { intent: 'running', resumeOnStartup: true }, false),
			pausedByUser: await restart('home-paused', {}, true),
			// Already paused for consent by a check of the earlier format: restored as paused by the user, so Resume loads it.
			pausedForConsent: await restart('home-consent', { pausedReason: 'consentChanged' }, true),
		}, {
			interruptedByQuit: { restored: undefined, downloads: 0, records: 0 },
			pausedByUser: { restored: { state: 'paused', pausedReason: 'user', installed: true }, downloads: 0, records: 0 },
			pausedForConsent: { restored: { state: 'paused', pausedReason: 'user', installed: true }, downloads: 0, records: 0 },
		});
	});

	test('the production host runs only the setting\'s llama-server: nothing on PATH or in LLAMACPP_SERVER_PATH', async () => {
		const exe = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
		for (const dir of ['tools', 'custom']) {
			await fs.promises.mkdir(path.join(root, dir), { recursive: true });
			await fs.promises.writeFile(path.join(root, dir, exe), 'not really llama-server');
			await fs.promises.chmod(path.join(root, dir, exe), 0o755);
		}
		const executed: string[] = [];
		const runner: IProcessRunner = {
			run: async file => {
				executed.push(file);
				return { exitCode: 1, signal: undefined, stdout: '', stderr: '', timedOut: false, truncated: false, aborted: false };
			},
		};
		const storage = new Map<string, unknown>();
		const host = createNodeShimLocalModelProviderHost({
			requestService: { request: () => Promise.reject(new Error('no network in tests')) },
			storage: { get: <T>(key: string) => storage.get(key) as T | undefined, set: (key, value) => { storage.set(key, value); } },
			telemetry: new RecordingTelemetry(),
			log: new NullLogService(),
			copilotHome: path.join(root, 'copilot-home'),
			userDataPath: path.join(root, 'user-data'),
			homeDir: path.join(root, 'home'),
			tempDir: path.join(root, 'tmp'),
			resolveCapiBaseUrls: async () => [],
			onDidChangeCapiAccounts: Event.None,
			productVersion: '1.2.3',
			env: { PATH: path.join(root, 'tools'), LLAMACPP_SERVER_PATH: path.join(root, 'tools', exe) },
			runner,
		});
		const resolve = async (settingPath?: string) => {
			executed.length = 0;
			const resolution = await host.runtime.resolve({ enabled: true, settingPath });
			return { executed: [...new Set(executed.filter(file => file.startsWith(root)).map(file => path.relative(root, file)))], error: resolution.error?.code };
		};
		assert.deepStrictEqual({ unset: await resolve(), set: await resolve(path.join(root, 'custom', exe)) }, {
			unset: { executed: [], error: undefined },
			set: { executed: [path.join('custom', exe)], error: 'probeFailed' },
		});
	});

	test('cancelling a swap while its load is still being prepared never starts that model', async () => {
		const harness = await createTwoInstalled();
		const preparing = new DeferredPromise<void>();
		harness.runtime.listDevicesGate = preparing;
		await harness.provider.makeActive(EXAMPLE_ID);
		await waitFor(() => harness.runtime.listDevicesWaiting && family(harness, EXAMPLE_ID)?.operation?.phase === 'loading');
		harness.provider.cancel(family(harness, EXAMPLE_ID)!.operation!.id);
		preparing.complete();
		await waitFor(() => !family(harness, EXAMPLE_ID)?.operation);
		await settle(20);
		assert.deepStrictEqual({
			spawns: harness.spawner.processes.map(child => child.arg('--alias')),
			server: harness.supervisor().state.get().server,
			active: { familyId: harness.provider.status.get().active?.familyId, server: harness.provider.status.get().active?.server },
		}, {
			spawns: ['MAI-Code-1.1-Flash'],
			server: 'stopped',
			active: { familyId: EXAMPLE_ID, server: 'stopped' },
		});
	});

	test('a download locked by another window, or by a holder that died, is published with Retry; the Retry clears a stale lock once, then downloads', async () => {
		const run = async (lock: 'lockedElsewhere' | 'staleLock') => {
			const downloader = new FakeDownloader();
			downloader[lock] = true;
			const harness = createHarness({ downloader, persistent: createPersistent(`home-${lock}`) });
			await start(harness);
			await harness.provider.setUp(MAI_ID, consent(harness, MAI_ID), CancellationToken.None);
			await waitFor(() => family(harness, MAI_ID)?.operation?.state === 'error');
			const failed = family(harness, MAI_ID)!.operation!;
			const clearedBeforeRetry = downloader.cleared.length;
			await harness.provider.retry(failed.id);
			await waitFor(() => activeReady(harness, MAI_ID) && !family(harness, MAI_ID)?.operation);
			return {
				error: { code: failed.error?.code, actions: failed.error?.actions },
				clearedBeforeRetry,
				cleared: downloader.cleared.map(dir => path.relative(harness.persistent.home, dir)),
				downloads: downloader.requests.map(request => path.relative(harness.persistent.home, request.familyDir)),
			};
		};
		const familyDir = path.join('azureml-models', MAI.profile.registry, MAI.profile.assetName);
		assert.deepStrictEqual({ lockedElsewhere: await run('lockedElsewhere'), staleLock: await run('staleLock') }, {
			lockedElsewhere: { error: { code: 'lockedElsewhere', actions: ['retry'] }, clearedBeforeRetry: 0, cleared: [], downloads: [familyDir, familyDir] },
			staleLock: { error: { code: 'staleLock', actions: ['retry'] }, clearedBeforeRetry: 0, cleared: [familyDir], downloads: [familyDir, familyDir] },
		});
	});
});
