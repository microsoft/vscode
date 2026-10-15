/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ModelCapabilitiesOverride, NamedProviderConfig, ProviderModelConfig } from '@github/copilot-sdk';
import * as fs from 'fs';
import * as os from 'os';
import { Throttler } from '../../../../../../base/common/async.js';
import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, observableValue, type IObservable } from '../../../../../../base/common/observable.js';
import * as path from '../../../../../../base/common/path.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { ByteSize } from '../../../../../files/common/files.js';
import { ILogService } from '../../../../../log/common/log.js';
import type { IRequestService } from '../../../../../request/common/request.js';
import type { ITelemetryService } from '../../../../../telemetry/common/telemetry.js';
import { computeLocalModelConsentScope, isLocalModelContextTokens, LOCAL_MODEL_SENTINEL_PROVIDER_NAME, type ILocalModelActiveV1, type ILocalModelContextV1, type ILocalModelConsent, type ILocalModelEntryV1, type ILocalModelErrorV1, type ILocalModelFamilyV1, type ILocalModelLoadV1, type ILocalModelMemoryWarningV1, type ILocalModelOperationV1, type ILocalModelStatusV1, type ILocalTurnExecution, type LocalModelOperationKind, type LocalModelOperationPhase, type LocalModelPausedReason, type LocalModelServerState } from '../../../../common/localModel.js';
import { containsCredential, dropCredentialEntries, dropCredentialItems, errorCodeForLog, identifierForLog, isSafeRegistryIdentifier, reportDroppedStorageEntries } from '../../../../common/logRedaction.js';
import { IAgentHostProxyResolver } from '../../../agentHostProxyResolver.js';
import type { IAgentHostStorageService } from '../../../agentHostStorageService.js';
import type { ILocalModelDirectRequestWait, ILocalModelLiveConfig, ILocalModelModelRow, ILocalModelProvider, ILocalModelSessionConfigContribution } from '../localModelProvider.js';
import { getLocalModelSelectionId } from '../../copilotSessionLauncher.js';
import { createLocalModelRouteTelemetrySink, LocalModelCopilotRequestHandler, type LocalModelFetch } from './copilotRequestHandler.js';
import { CATALOG_REFRESH_INTERVAL_MS, CONTEXT_SIZE_OPTIONS, DEFAULT_CONTEXT_SIZE, GGUF_ARCHITECTURE_READ_MAX_BYTES, PRESET_INI_FILE_NAME, PRESET_INI_MAX_BYTES, PRESET_JSON_FILE_NAME, PRESET_MAX_PARALLEL, RECURRENT_MODEL_CTX_CHECKPOINTS, SENTINEL_BASE_URL, SENTINEL_MODEL_PROVIDER, PUBLIC_REGISTRY, type LocalModelRegistryName } from './constants.js';
import { createLocalModelAcquisitionError, findResumablePartial, LocalModelDownloadError, ModelDownloader, reportLocalModelSetup, RequestServiceHttpClient, resolveModelFilePath, toTelemetryArchitecture, type ILocalModelSetupEvent } from './downloader.js';
import { detectChatTemplateThinking, type LocalModelThinkingSupport } from '../localModelThinking.js';
import { estimateContextMemory, estimateContextMemoryBytes, hasRecurrentLayers, LLAMA_DEFAULT_BATCH, LLAMA_DEFAULT_UBATCH, readGgufArchitectureFromFile, readGgufModelMetadataFromFile, type GgufArchitectureRead, type IGgufModelMetadata } from './gguf.js';
import { GpuMemoryProbe, NVIDIA_VENDOR_ID, toLocalModelDeviceVendor, type IGpuAdapter, type IGpuMemoryProbeResult } from './gpuMemoryProbe.js';
import { createLlamaRuntimeError, createLlamaRuntimeMissingError, getFlagSupport, getLlamaServerKey, LlamaCppRuntime, sanitizeLlamaArchitecture, type ILlamaRuntimeResolution, type LlamaArchitectureSupport } from './llamaCppRuntime.js';
import { buildLlamaPresetArgs, parseLlamaConfigJson, parseLlamaPreset, type ILlamaPreset } from './llamaPreset.js';
import { isSha256Hex, isValidCapiId, isValidFamilyId, LocalModelCatalogError, ModelCatalog, sanitizeDisplayName, sourceKey, toLocalModelOffer, computeCatalogState, type ILocalModelProfile, type IMergedCatalogFamily, type IResolvedModelVersion } from './modelCatalog.js';
import { NodeLongLivedProcessSpawner, NodeProcessControl, NodeProcessRunner, type IProcessRunner } from './processRunner.js';
import { computeLocalModelLimits, createLocalModelRouterEnv, type ILocalModelRouterEnv } from './requestRouter.js';
import { RouteTable } from './routeTable.js';
import { getServerErrorActions, orphanMessage, ownedElsewhereMessage, reportLocalModelServer, ServerSupervisor, type IServerLaunchPlan, type IServerLoadProgress, type IServerLoadRecord, type IServerSupervisorState, type ServerAdmission } from './serverSupervisor.js';
import { LocalModelServingError, systemLocalModelClock, type IDirectFamilyLookup, type ILocalModelClock, type ILocalModelFamilyLimits, type ILocalModelLiveGates, type IServingIdentity, type IServingLease, type IServingSnapshot } from './servingAccess.js';
import { ServingAccess } from './servingAccessImpl.js';
import { checkAdmission, chooseServingProfile, computeFitClass, computeFootprintBytes, isOfferableFit, reportLocalModelEligibility, spareSystemMemoryAfterAdmission, toGiB, type IAdmissionInput, type ILlamaDevice, type LocalModelFitResult } from './servingProfile.js';
import { AZURE_ML_MODELS_DIR_NAME, LocalModelStore, LocalModelStoreError, type ILocalModelInstalledVersion, toCatalogInstallFact } from './store.js';
import { TurnLedger } from './turnLedger.js';

/** The status published before the catalog, device probe and runtime resolution have run. */
export function createInitialLocalModelStatus(useInAuto: boolean): ILocalModelStatusV1 {
	return {
		schemaVersion: 1,
		device: { confidence: 'unknown' },
		runtime: {},
		catalog: { state: 'loading', registries: { azureml: 'loading' } },
		families: [],
		useInAuto,
	};
}

// #region Host (injected dependencies)

/** The catalog surface the provider uses ({@link ModelCatalog}). */
export type IShimCatalog = Pick<ModelCatalog, 'snapshot' | 'onDidChange' | 'isStale' | 'merge' | 'refresh' | 'resolveForSetup' | 'renewDownloadUrls' | 'readPrimaryArchitecture'> & IDisposable;

/** The store surface the provider uses ({@link LocalModelStore}). */
export type IShimStore = Pick<LocalModelStore, 'familyDir' | 'versionDir' | 'beginVersion' | 'commitVersion' | 'listInstalled' | 'verifyAdoptedVersion' | 'pruneOwnedVersions' | 'removeFamily' | 'checkDiskSpace'>;

/** The runtime surface the provider uses ({@link LlamaCppRuntime}). */
export type IShimRuntime = Pick<LlamaCppRuntime, 'resolve' | 'listDevices' | 'checkArchitectureSupport'>;

/** The provider's dependencies, injected so tests can supply fakes. */
export interface IShimLocalModelProviderHost {
	readonly platform: NodeJS.Platform;
	readonly arch: string;
	readonly clock: ILocalModelClock;
	readonly storage: Pick<IAgentHostStorageService, 'get' | 'set'>;
	readonly telemetry: ITelemetryService;
	readonly systemMemoryBytes: number;
	/** `os.freemem()` (macOS: the larger of it and `vm_stat`-derived available memory). Never cached. */
	freeSystemMemoryBytes(): Promise<number>;
	createCatalog(): IShimCatalog;
	readonly store: IShimStore;
	readonly downloader: Pick<ModelDownloader, 'download' | 'clearStaleLock'>;
	readonly runtime: IShimRuntime;
	readonly gpuProbe: Pick<GpuMemoryProbe, 'probe'>;
	createSupervisor(log: ILogService): ServerSupervisor;
	readGgufMetadata(filePath: string): Promise<IGgufModelMetadata>;
	/** `general.architecture` of a local GGUF (or the prefix a partial download wrote), reading at most `maxBytes`; never throws. */
	readGgufArchitecture(filePath: string, maxBytes: number): Promise<GgufArchitectureRead>;
	/** Reads a small text file; `undefined` when missing or larger than `maxBytes`. */
	readTextFile(filePath: string, maxBytes: number): Promise<string | undefined>;
	/** CAPI base URLs of the signed-in accounts (see `resolveLocalModelCapiBaseUrls`). */
	resolveCapiBaseUrls(): Promise<readonly string[]>;
	/** Fires when the signed-in accounts (and so the CAPI endpoints) may have changed. */
	readonly onDidChangeCapiAccounts: Event<void>;
	readonly loopbackFetch: LocalModelFetch;
	generateId(): string;
}

// #endregion

// #region Durable state (AH storage)

const PROVIDER_STATE_KEY = 'localModel.provider';
/** A {@link IProviderState.speculativeUnsupported} entry: the llama-server's key ({@link getLlamaServerKey}) and content id. */
const SPECULATIVE_KEY_PATTERN = /^[0-9a-f]{64}:[0-9a-f]{64}$/;
const SPECULATIVE_UNSUPPORTED_MAX = 64;

/** The durable setup record of one acquisition operation. */
export interface ILocalModelSetupRecord {
	readonly operationId: string;
	readonly familyId: string;
	readonly kind: 'setup' | 'update';
	readonly target: { readonly source: LocalModelRegistryName; readonly assetName: string; readonly version: string; readonly contentId?: string };
	readonly consentScope: string;
	/** The offer facts at consent time (source, build kind, sizes, license); a change asks again. */
	readonly offerScope: string;
	/** Whether consent covered downloading the model, not only using model files already on this device. */
	readonly downloadAgreed: boolean;
	readonly intent: 'running' | 'pausedByUser';
	readonly resumeOnStartup: boolean;
	/** Set when the content or consent scope changed while paused: the user must agree again. */
	readonly pausedReason?: 'consentChanged';
}

/** What VS Code remembers about a family between sessions. */
interface IFamilyMeta {
	readonly displayName: string;
	readonly capiId: string;
	readonly autoCapable: boolean;
	readonly limits?: ILocalModelFamilyLimits;
}

interface IProviderState {
	readonly schemaVersion: 1;
	active?: string;
	/** Families whose setup completed, with the content that was set up. */
	setUp: Record<string, string>;
	families: Record<string, IFamilyMeta>;
	/** Content of the last install/update that reached ready (or completed as a second install), per family. */
	readyOffers: Record<string, string>;
	consent: string[];
	measured: Record<string, { readonly contentId: string; readonly nCtx: number; readonly totalSlots: number }>;
	operations: ILocalModelSetupRecord[];
	/** Families Stage B found insufficient at setup; cleared on a topology change. */
	hidden: string[];
	/** `<llama-server key>:<content id>` of models whose speculative decoding (DFlash) crashed that llama.cpp build; later starts skip it. */
	speculativeUnsupported: string[];
	/** The context size the user chose per family; absent until they choose one. */
	contextTokens: Record<string, number>;
	/** How long recent loads took, newest last (at most {@link LOAD_HISTORY_MAX}); the expected duration of a comparable load. */
	loadDurations: ILoadDurationRecord[];
}

/** The duration of one successful load, keyed by what makes loads comparable. */
interface ILoadDurationRecord {
	readonly contentId: string;
	readonly device: string;
	/** Total `--ctx-size`. */
	readonly ctxSize: number;
	/** Whether the DFlash draft was loaded too. */
	readonly speculative: boolean;
	readonly durationMs: number;
}

const LOAD_HISTORY_MAX = 16;
const LOAD_DURATION_MAX_MS = 24 * 60 * 60_000;
const DEVICE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function readLoadDuration(value: unknown): ILoadDurationRecord | undefined {
	if (!isRecord(value) || !isSha256Hex(value.contentId) || typeof value.device !== 'string' || !DEVICE_NAME_PATTERN.test(value.device) || !isLocalModelContextTokens(value.ctxSize)
		|| typeof value.speculative !== 'boolean' || typeof value.durationMs !== 'number' || !Number.isSafeInteger(value.durationMs) || value.durationMs <= 0 || value.durationMs > LOAD_DURATION_MAX_MS) {
		return undefined;
	}
	return { contentId: value.contentId, device: value.device, ctxSize: value.ctxSize, speculative: value.speculative, durationMs: value.durationMs };
}

function isSameLoad(a: Omit<ILoadDurationRecord, 'durationMs'>, b: Omit<ILoadDurationRecord, 'durationMs'>): boolean {
	return a.contentId === b.contentId && a.device === b.device && a.ctxSize === b.ctxSize && a.speculative === b.speculative;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readStringRecord(value: unknown, isValidKey: (key: string) => boolean, isValidValue: (value: string) => boolean): Record<string, string> {
	return isRecord(value) ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && isValidKey(entry[0]) && isValidValue(entry[1]) && !containsCredential(entry))) : {};
}

/**
 * Validating reader for a persisted setup record: identifiers must pass
 * {@link isSafeRegistryIdentifier}, content ids must be SHA-256s and nothing may hold a
 * credential. A failing record, or one of a kind this version no longer runs, is dropped. Pure.
 */
function readSetupRecord(value: unknown): ILocalModelSetupRecord | undefined {
	if (!isRecord(value) || containsCredential(value) || !isSafeRegistryIdentifier(value.operationId) || !isValidFamilyId(value.familyId) || !isRecord(value.target)) {
		return undefined;
	}
	const target = value.target;
	if ((value.kind !== 'setup' && value.kind !== 'update') || target.source !== PUBLIC_REGISTRY || !isSafeRegistryIdentifier(target.assetName) || !isSafeRegistryIdentifier(target.version)
		|| (target.contentId !== undefined && !isSha256Hex(target.contentId))) {
		return undefined;
	}
	return {
		operationId: value.operationId,
		familyId: value.familyId,
		kind: value.kind,
		target: { source: target.source, assetName: target.assetName, version: target.version, ...(typeof target.contentId === 'string' ? { contentId: target.contentId } : {}) },
		consentScope: typeof value.consentScope === 'string' ? value.consentScope : '',
		offerScope: typeof value.offerScope === 'string' ? value.offerScope : '',
		// An older record doesn't say: it counts as agreed to the files on this device only, so a download asks again.
		downloadAgreed: value.downloadAgreed === true,
		intent: value.intent === 'pausedByUser' ? 'pausedByUser' : 'running',
		resumeOnStartup: value.resumeOnStartup === true,
		...(value.pausedReason === 'consentChanged' ? { pausedReason: 'consentChanged' as const } : {}),
	};
}

function readLimits(value: unknown): ILocalModelFamilyLimits | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const { maxContextWindowTokens, maxPromptTokens, maxOutputTokens } = value;
	return typeof maxContextWindowTokens === 'number' && typeof maxPromptTokens === 'number' && typeof maxOutputTokens === 'number' ? { maxContextWindowTokens, maxPromptTokens, maxOutputTokens } : undefined;
}

/**
 * Validating reader for the provider's durable state: family ids must be valid lowercase CAPI
 * ids and content ids SHA-256s; a credential-like entry is dropped on its own and counted in `dropped`. Pure.
 */
function readProviderState(value: unknown): { readonly state: IProviderState; readonly dropped: number } {
	const state: IProviderState = { schemaVersion: 1, setUp: {}, families: {}, readyOffers: {}, consent: [], measured: {}, operations: [], hidden: [], speculativeUnsupported: [], contextTokens: {}, loadDurations: [] };
	if (!isRecord(value) || value.schemaVersion !== 1) {
		return { state, dropped: 0 };
	}
	let total = 0;
	const familyIds = (items: unknown): string[] => {
		const all = Array.isArray(items) ? items : [];
		total += all.length;
		return all.filter(isValidFamilyId);
	};
	const count = (items: unknown) => {
		total += isRecord(items) ? Object.keys(items).length : Array.isArray(items) ? items.length : 0;
	};
	if (value.active !== undefined) {
		total++;
		if (isValidFamilyId(value.active)) {
			state.active = value.active;
		}
	}
	count(value.speculativeUnsupported);
	state.speculativeUnsupported = Array.isArray(value.speculativeUnsupported) ? value.speculativeUnsupported.filter((key): key is string => typeof key === 'string' && SPECULATIVE_KEY_PATTERN.test(key)) : [];
	count(value.setUp);
	state.setUp = readStringRecord(value.setUp, isValidFamilyId, isSha256Hex);
	count(value.readyOffers);
	state.readyOffers = readStringRecord(value.readyOffers, isValidFamilyId, isSha256Hex);
	state.consent = familyIds(value.consent);
	state.hidden = familyIds(value.hidden);
	count(value.operations);
	state.operations = Array.isArray(value.operations) ? value.operations.map(readSetupRecord).filter((record): record is ILocalModelSetupRecord => !!record) : [];
	count(value.families);
	if (isRecord(value.families)) {
		for (const [familyId, meta] of Object.entries(value.families)) {
			if (isValidFamilyId(familyId) && isRecord(meta) && !containsCredential(meta) && typeof meta.displayName === 'string' && sanitizeDisplayName(meta.displayName) === meta.displayName
				&& typeof meta.capiId === 'string' && isValidCapiId(meta.capiId) && meta.capiId.toLowerCase() === familyId) {
				const limits = readLimits(meta.limits);
				state.families[familyId] = { displayName: meta.displayName, capiId: meta.capiId, autoCapable: meta.autoCapable === true, ...(limits ? { limits } : {}) };
			}
		}
	}
	count(value.measured);
	if (isRecord(value.measured)) {
		for (const [familyId, measured] of Object.entries(value.measured)) {
			if (isValidFamilyId(familyId) && isRecord(measured) && isSha256Hex(measured.contentId) && typeof measured.nCtx === 'number' && typeof measured.totalSlots === 'number') {
				state.measured[familyId] = { contentId: measured.contentId, nCtx: measured.nCtx, totalSlots: measured.totalSlots };
			}
		}
	}
	count(value.contextTokens);
	if (isRecord(value.contextTokens)) {
		for (const [familyId, tokens] of Object.entries(value.contextTokens)) {
			if (isValidFamilyId(familyId) && isLocalModelContextTokens(tokens)) {
				state.contextTokens[familyId] = tokens;
			}
		}
	}
	count(value.loadDurations);
	state.loadDurations = Array.isArray(value.loadDurations) ? value.loadDurations.map(readLoadDuration).filter((record): record is ILoadDurationRecord => !!record).slice(-LOAD_HISTORY_MAX) : [];
	const kept = (state.active ? 1 : 0) + Object.keys(state.setUp).length + Object.keys(state.readyOffers).length + state.consent.length + state.hidden.length
		+ state.operations.length + Object.keys(state.families).length + Object.keys(state.measured).length + state.speculativeUnsupported.length + Object.keys(state.contextTokens).length + state.loadDurations.length;
	return { state, dropped: Math.max(0, total - kept) };
}

/** A copy of `state` for storage without credential-like entries ({@link containsCredential}), and how many were dropped. Pure. */
function scrubProviderStateForStorage(state: IProviderState): { readonly state: IProviderState; readonly dropped: number } {
	const setUp = dropCredentialEntries(state.setUp);
	const readyOffers = dropCredentialEntries(state.readyOffers);
	const families = dropCredentialEntries(state.families);
	const measured = dropCredentialEntries(state.measured);
	const consent = dropCredentialItems(state.consent);
	const hidden = dropCredentialItems(state.hidden);
	const operations = dropCredentialItems(state.operations);
	const speculativeUnsupported = dropCredentialItems(state.speculativeUnsupported);
	const contextTokens = dropCredentialEntries(state.contextTokens);
	const loadDurations = dropCredentialItems(state.loadDurations);
	const activeDropped = state.active !== undefined && containsCredential(state.active);
	return {
		state: {
			schemaVersion: 1,
			...(state.active !== undefined && !activeDropped ? { active: state.active } : {}),
			setUp: setUp.kept,
			families: families.kept,
			readyOffers: readyOffers.kept,
			consent: consent.kept,
			measured: measured.kept,
			operations: operations.kept,
			hidden: hidden.kept,
			speculativeUnsupported: speculativeUnsupported.kept,
			contextTokens: contextTokens.kept,
			loadDurations: loadDurations.kept,
		},
		dropped: (activeDropped ? 1 : 0) + setUp.dropped + readyOffers.dropped + families.dropped + measured.dropped + consent.dropped + hidden.dropped + operations.dropped + speculativeUnsupported.dropped + contextTokens.dropped + loadDurations.dropped,
	};
}

// #endregion

// #region Pure helpers

/** The consent-scope fingerprint of the offer facts (source, build kind, sizes, license), without the runtime part. Pure. */
export function computeLocalModelOfferScope(family: Pick<ILocalModelFamilyV1, 'familyId' | 'offer'>): string {
	return computeLocalModelConsentScope({ family: { familyId: family.familyId, offer: family.offer } });
}

/** A device a model may be bound to, with whether its memory comes out of system RAM. */
interface ICandidateDevice {
	readonly name: string;
	readonly description: string;
	readonly totalBytes: number;
	readonly backend: string;
	readonly unifiedMemory: boolean;
}

/** Picks the largest device that gives `full` or `near` for `requiredBytes`, honouring each device's own memory kind. Pure. */
export function selectCandidateDevice<T extends Pick<ICandidateDevice, 'totalBytes' | 'unifiedMemory'>>(devices: readonly T[], requiredBytes: number, systemMemoryBytes: number): { readonly device: T; readonly fit: 'full' | 'near' } | undefined {
	for (const device of [...devices].sort((a, b) => b.totalBytes - a.totalBytes)) {
		const fit = computeFitClass({ capacityBytes: device.totalBytes, requiredBytes, systemMemoryBytes, systemMemoryCountedAsGpuBytes: device.unifiedMemory ? device.totalBytes : 0 });
		if (isOfferableFit(fit)) {
			return { device, fit };
		}
	}
	return undefined;
}

/** Whether a `--list-devices` device draws on system RAM, using the Stage A adapters. Pure. */
export function isUnifiedMemoryDevice(device: Pick<ILlamaDevice, 'description' | 'backend'>, adapters: readonly Pick<IGpuAdapter, 'description' | 'unifiedMemory'>[]): boolean {
	if (device.backend === 'metal') {
		return true;
	}
	const description = device.description.trim().toLowerCase();
	const match = adapters.find(adapter => {
		const name = adapter.description.trim().toLowerCase();
		return !!name && (description.startsWith(name) || name.startsWith(description));
	});
	if (match) {
		return match.unifiedMemory;
	}
	return adapters.length === 1 ? adapters[0].unifiedMemory : false;
}

/** Direct-row limits (without fallback-model terms): the family's tags (when known) and its own context. Pure. */
export function computeDirectRowLimits(nCtx: number, totalSlots: number, tags: ILocalModelFamilyLimits | undefined) {
	return computeLocalModelLimits({ nCtx, totalSlots }, tags ?? { maxContextWindowTokens: Number.MAX_SAFE_INTEGER, maxPromptTokens: Number.MAX_SAFE_INTEGER, maxOutputTokens: Number.MAX_SAFE_INTEGER });
}

export interface ILocalModelContextInput {
	/** The model's trained context (`{arch}.context_length`), when known. */
	readonly trainedTokens: number | undefined;
	/** The family's `maxContextWindowTokens` tag, when known. */
	readonly familyLimitTokens: number | undefined;
	/** The preset's context per slot: an upper bound, not the default. */
	readonly presetTokens: number;
	readonly chosenTokens: number | undefined;
	/** The estimated GPU memory of the whole model served at `tokens` per slot. */
	readonly gpuBytesAt: (tokens: number) => number;
}

/**
 * The selectable context sizes of an installed family ({@link CONTEXT_SIZE_OPTIONS} up to its
 * smallest bound) and the selected one: the user's choice while still offered, else
 * {@link DEFAULT_CONTEXT_SIZE}, else the largest option below it, else the smallest. Pure.
 */
export function computeLocalModelContext(input: ILocalModelContextInput): ILocalModelContextV1 {
	const cap = Math.min(input.trainedTokens ?? Infinity, input.familyLimitTokens ?? Infinity, input.presetTokens);
	let sizes = CONTEXT_SIZE_OPTIONS.filter(tokens => tokens <= cap);
	if (!sizes.length) {
		sizes = [Math.max(256, Math.floor(cap / 256) * 256)];
	}
	const below = sizes.filter(tokens => tokens <= DEFAULT_CONTEXT_SIZE);
	const tokens = input.chosenTokens !== undefined && sizes.includes(input.chosenTokens) ? input.chosenTokens : below.length ? below[below.length - 1] : sizes[0];
	return { tokens, options: sizes.map(size => ({ tokens: size, gpuBytes: input.gpuBytesAt(size) })) };
}

/** The effective `--ubatch-size` of a preset: llama.cpp caps it at `--batch-size`. Pure. */
export function presetUbatchTokens(preset: Pick<ILlamaPreset, 'entries'>): number {
	const value = (key: string, fallback: number) => {
		const entry = preset.entries.find(candidate => candidate.key === key)?.value;
		const parsed = entry !== undefined ? Number(entry) : NaN;
		return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
	};
	return Math.min(value('ubatch-size', LLAMA_DEFAULT_UBATCH), value('batch-size', LLAMA_DEFAULT_BATCH));
}

export interface IServingFootprintInput {
	readonly primaryBytes: number;
	readonly primary: IGgufModelMetadata;
	/** The DFlash draft when it is used; its context buffers count when its header could be read. */
	readonly draft?: { readonly bytes: number; readonly metadata: IGgufModelMetadata | undefined };
	readonly parallel: number;
	readonly ubatchTokens: number;
}

/** The GPU memory of a model served with `ctxSize` total context (weights, draft and buffers), estimated from GGUF headers. Pure. */
export function estimateServingFootprint(input: IServingFootprintInput, ctxSize: number): number {
	const options = { ubatchTokens: input.ubatchTokens, parallel: input.parallel };
	const draftContext = input.draft?.metadata ? estimateContextMemoryBytes(input.draft.metadata, ctxSize, options) : 0;
	return computeFootprintBytes({
		primaryBytes: input.primaryBytes,
		draftBytes: input.draft?.bytes ?? 0,
		contextBytes: estimateContextMemoryBytes(input.primary, ctxSize, options) + draftContext,
	});
}

/**
 * The sentinel provider and one direct row per installed family. The public capability override
 * type lacks `supports.toolCalls`, which the runtime accepts, so that typing is adapted here.
 */
export function buildLocalModelSessionConfig(rows: readonly ILocalModelModelRow[]): ILocalModelSessionConfigContribution {
	if (!rows.length) {
		return { providers: [], models: [] };
	}
	const providers: NamedProviderConfig[] = [{ name: LOCAL_MODEL_SENTINEL_PROVIDER_NAME, type: 'openai', wireApi: 'completions', baseUrl: SENTINEL_BASE_URL, modelProvider: SENTINEL_MODEL_PROVIDER }];
	const capabilitiesOf = (row: ILocalModelModelRow): ModelCapabilitiesOverride & { readonly supports: { readonly vision: boolean; readonly toolCalls: boolean } } => ({ supports: { vision: false, toolCalls: true, ...(row.thinking ? { reasoningEffort: true } : {}) } });
	const models: ProviderModelConfig[] = rows.map(row => ({
		id: row.id,
		provider: LOCAL_MODEL_SENTINEL_PROVIDER_NAME,
		name: row.name,
		...(row.maxContextWindow !== undefined ? { maxContextWindowTokens: row.maxContextWindow } : {}),
		...(row.maxPromptTokens !== undefined ? { maxPromptTokens: row.maxPromptTokens } : {}),
		...(row.maxOutputTokens !== undefined ? { maxOutputTokens: row.maxOutputTokens } : {}),
		capabilities: capabilitiesOf(row),
	}));
	return { providers, models };
}

/** The fallback preset of a foreign install without a valid `llama-config.json` or `llama-default.ini`: no extra arguments. */
function minimalPreset(assetName: string, ctxSize: number | undefined, parallel: number | undefined): ILlamaPreset {
	return { section: assetName, entries: [{ key: 'jinja', value: 'true' }], ctxSize, parallel, draftModel: undefined };
}

function formatBytes(bytes: number): string {
	return ByteSize.formatSize(bytes);
}

/** The first safe display name ({@link sanitizeDisplayName}); names reach the UI and logs, so values that could carry a URL or credential are skipped. Pure. */
function firstSafeDisplayName(...candidates: (string | undefined)[]): string | undefined {
	for (const candidate of candidates) {
		const safe = candidate !== undefined ? sanitizeDisplayName(candidate) : undefined;
		if (safe) {
			return safe;
		}
	}
	return undefined;
}

// #endregion

// #region Provider

/** What a family's preset says about serving it. */
interface IServeFacts {
	readonly contentId: string;
	/** The preset's total `--ctx-size`: an upper bound for the selectable context, not the default. */
	readonly ctxSize: number;
	readonly parallel: number;
	/** Effective `--ubatch-size`. */
	readonly ubatch: number;
	/** The DFlash draft GGUF the preset names, if any. */
	readonly draftModel: string | undefined;
}

/** A GGUF of an install: its absolute path and size. */
interface IModelFile {
	readonly filePath: string;
	readonly bytes: number;
}

/** One provider-owned operation: at most one per family. */
interface IOperation {
	readonly id: string;
	readonly familyId: string;
	readonly kind: LocalModelOperationKind;
	/** `swap` only: a reload of the active family (for a context size change), not a switch to another one. */
	reload?: boolean;
	state: 'running' | 'paused' | 'error';
	pausedReason?: LocalModelPausedReason;
	phase?: LocalModelOperationPhase;
	completedBytes?: number;
	totalBytes?: number;
	bytesPerSecond?: number;
	error?: ILocalModelErrorV1;
	/** Per run; replaced on resume/retry. Cancel and pause abort it immediately. */
	abort: AbortController;
	/** Acquisition kinds only. */
	record?: ILocalModelSetupRecord;
	/** The model architecture read before the download (validated), for telemetry and the load after it. */
	architecture?: string;
	/** The architecture probe's answer for {@link architecture} (when a qualified llama.cpp could be asked), for telemetry and the load after it. */
	architectureSupport?: LlamaArchitectureSupport;
	autoResumed: boolean;
	started: number;
}

/** Why the active model is being loaded. */
type StartTrigger = 'install' | 'direct' | 'auto' | 'useInAuto' | 'explicit' | 'swap' | 'update';

class OperationCancelled extends Error { }

/** The request-handler bridge's {@link ILocalModelProvider}: composes the catalog, store, downloader, runtime, GPU probe, supervisor and router. */
export class ShimLocalModelProvider extends Disposable implements ILocalModelProvider {

	private readonly _status = observableValue<ILocalModelStatusV1>(this, createInitialLocalModelStatus(false));
	readonly status: IObservable<ILocalModelStatusV1> = this._status;

	private readonly _onDidChangeModelRows = this._register(new Emitter<void>());
	readonly onDidChangeModelRows = this._onDidChangeModelRows.event;

	private readonly _onDidDirectRequestWait = this._register(new Emitter<ILocalModelDirectRequestWait>());
	readonly onDidDirectRequestWait = this._onDidDirectRequestWait.event;

	readonly requestHandler: LocalModelCopilotRequestHandler;

	private _liveConfig: ILocalModelLiveConfig | undefined;
	private readonly _clock: ILocalModelClock;
	private readonly _ledger = new TurnLedger();
	private readonly _routeTable: RouteTable;
	private readonly _serving: ServingAccess;
	private _routerEnv: ILocalModelRouterEnv = createLocalModelRouterEnv();
	private _accountGeneration = 1;

	private readonly _catalog: IShimCatalog;
	private readonly _supervisor: ServerSupervisor;
	private _state: IProviderState;
	private _initialization: Promise<void> | undefined;
	private _initialized = false;
	private _stageA: IGpuMemoryProbeResult | undefined;
	private _topologyKey = '';
	private _runtime: ILlamaRuntimeResolution = { runtime: {} };
	/** Serializes runtime resolutions ({@link _refreshRuntime}). */
	private readonly _runtimeResolution = this._register(new Throttler());
	/** The current activation: aborted and replaced whenever pending loads are superseded. */
	private _activation = new AbortController();
	private _installs: readonly ILocalModelInstalledVersion[] = [];
	/** Per family, what its preset says about serving: the context upper bound (total), slots, effective ubatch and DFlash draft. */
	private readonly _serveFacts = new Map<string, IServeFacts>();
	private readonly _disk = new Map<string, NonNullable<ILocalModelEntryV1['disk']>>();
	private readonly _operations = new Map<string, IOperation>();
	private _swap: { readonly toFamilyId: string; readonly operationId: string; readonly reload: boolean; readonly settled: Promise<void>; readonly done: () => void } | undefined;
	/** Families whose context size changed while a load was in progress; reconciled once it settles. */
	private readonly _pendingContextSizes = new Set<string>();
	/** The serving generation whose load duration was recorded. */
	private _recordedLoadGeneration: number | undefined;
	private _start: { readonly familyId: string; readonly activation: AbortSignal; readonly promise: Promise<void> } | undefined;
	private _activeError: ILocalModelErrorV1 | undefined;
	private readonly _previousServer = new Map<string, ILocalModelErrorV1>();
	private readonly _boundSessions = new Map<string, string>();
	private _userStopPending = false;
	private _reloading = false;
	private _rowsKey = '';
	private _catalogTimer: IDisposable | undefined;
	private _catalogRefresh: Promise<void> | undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IAgentHostProxyResolver proxyResolver: IAgentHostProxyResolver,
		private readonly _host: IShimLocalModelProviderHost,
	) {
		super();
		this._clock = _host.clock;
		const restored = readProviderState(_host.storage.get(PROVIDER_STATE_KEY));
		this._state = restored.state;
		reportDroppedStorageEntries(this._logService, PROVIDER_STATE_KEY, restored.dropped);
		this._routeTable = new RouteTable(this._clock);
		this._serving = this._register(new ServingAccess({
			getGates: () => this._gates(),
			getAccountGeneration: () => this._accountGeneration,
			getActiveServing: () => this._activeSnapshot(),
			getHeldServing: sessionId => this._heldServing(sessionId),
			acquireLease: (identity, sessionId) => this._acquireLease(identity, sessionId),
			servesHeldTurns: servingGeneration => this._supervisor.admitsHolders(servingGeneration),
			getIncomingSwap: () => this._swap ? { familyId: this._swap.toFamilyId, settled: this._swap.settled } : undefined,
			startActive: familyId => this._startForDirect(familyId),
			findFamilyByAlias: alias => this._findFamilyByAlias(alias),
			getFamilyDisplayName: familyId => this._displayNameOf(familyId),
		}, this._clock));
		this.requestHandler = new LocalModelCopilotRequestHandler({
			proxyFetch: (input, init) => proxyResolver.fetch(input, init),
			loopbackFetch: _host.loopbackFetch,
		}, this._logService, {
			serving: this._serving,
			routeTable: this._routeTable,
			ledger: this._ledger,
			getRouterEnv: () => this._routerEnv,
			telemetry: createLocalModelRouteTelemetrySink(_host.telemetry),
			clock: this._clock,
			onDirectRequestWaiting: event => {
				this._logService.trace(`[LocalModel] Request ${event.kind}${event.position ? ` (${event.position} in queue)` : ''}${event.percent !== undefined ? ` (${event.percent}%)` : ''}`);
				this._onDidDirectRequestWait.fire(event);
			},
		});
		this._catalog = this._register(_host.createCatalog());
		this._supervisor = this._register(_host.createSupervisor(this._logService));
		this._register(autorun(reader => this._onSupervisorState(this._supervisor.state.read(reader))));
		this._register(this._catalog.onDidChange(() => this._recompute()));
		this._register(_host.onDidChangeCapiAccounts(() => void this._refreshRouterEnv()));
		this._register(toDisposable(() => this._onDispose()));
	}

	// #region Live configuration and lifecycle

	updateLiveConfig(config: ILocalModelLiveConfig): void {
		const previous = this._liveConfig;
		this._liveConfig = config;
		if (!config.enabled) {
			if (previous?.enabled) {
				// Setting off: drain (system, <= 10 s) and stop; no files are deleted.
				this._invalidateActivation();
				void this._supervisor.stop('system');
			}
			this._recompute();
			return;
		}
		if (!this._initialization) {
			this._initialization = this._initialize().catch(error => this._logService.error(error, '[LocalModel] Initialization failed'));
		} else if (previous) {
			void this._initialization.then(() => this._onConfigChanged(previous, config));
		}
		this._recompute();
	}

	/** The last live configuration pushed by `CopilotAgent`, read at dispatch time. */
	protected get liveConfig(): ILocalModelLiveConfig | undefined {
		return this._liveConfig;
	}

	/** Resolves once the first discovery pass (device, runtime, installs, catalog, operations) has finished. */
	whenInitialized(): Promise<void> {
		return this._initialization ?? Promise.resolve();
	}

	private async _initialize(): Promise<void> {
		await this._step('device probe', () => this._refreshDevice(false));
		await this._step('runtime resolution', () => this._refreshRuntime());
		await this._step('installs', () => this._refreshInstalls());
		this._recompute();
		void this._refreshRouterEnv();
		await this._step('previous servers', () => this._checkPreviousServers());
		await this._step('catalog', () => this._refreshCatalog(false));
		await this._step('disk', () => this._refreshDisk());
		this._initialized = true;
		this._restoreOperations();
		this._scheduleCatalogRefresh();
		this._reportEligibility();
		this._recompute();
	}

	private async _step(name: string, work: () => Promise<unknown>): Promise<void> {
		if (this._store.isDisposed) {
			return;
		}
		try {
			await work();
		} catch (error) {
			this._logService.warn(`[LocalModel] ${name} failed (${errorCodeForLog(error)})`);
		}
	}

	private async _onConfigChanged(previous: ILocalModelLiveConfig, config: ILocalModelLiveConfig): Promise<void> {
		if (this._store.isDisposed || !config.enabled) {
			return;
		}
		if (previous.llamaServerPath !== config.llamaServerPath) {
			await this._step('runtime resolution', () => this._refreshRuntime());
			this._recompute();
		}
		if (!previous.enabled) {
			await this._step('catalog', () => this._refreshCatalog(true));
			await this._step('disk', () => this._refreshDisk());
			this._recompute();
		}
		if (!previous.useInAuto && config.useInAuto) {
			this._backgroundStart('useInAuto');
		}
		if ((!previous.accountGate && config.accountGate) || !previous.enabled) {
			this._restoreOperations();
		}
	}

	private _onDispose(): void {
		this._catalogTimer?.dispose();
		this._activation.abort();
		this._ledger.dispose();
		// A quit: running acquisitions keep `resumeOnStartup` and resume on the next start.
		for (const operation of this._operations.values()) {
			if (operation.kind === 'setup' && operation.phase === 'loading' && operation.state === 'running') {
				// Only the load was left: the install is complete and loads on the next start trigger.
				this._state.operations = this._state.operations.filter(record => record.operationId !== operation.id);
				this._persist();
			}
			operation.abort.abort(new OperationCancelled('quit'));
		}
		this._swap?.done();
	}

	/** Supersedes any pending load: a start still preparing its launch plan is abandoned before anything is spawned. */
	private _invalidateActivation(): void {
		this._activation.abort();
		this._activation = new AbortController();
	}

	private _scheduleCatalogRefresh(): void {
		this._catalogTimer?.dispose();
		if (this._store.isDisposed) {
			return;
		}
		this._catalogTimer = this._clock.setTimeout(() => {
			void this.refreshCatalog().finally(() => this._scheduleCatalogRefresh());
		}, CATALOG_REFRESH_INTERVAL_MS);
	}

	private async _refreshRouterEnv(): Promise<void> {
		try {
			this._routerEnv = createLocalModelRouterEnv(await this._host.resolveCapiBaseUrls());
		} catch (error) {
			this._logService.warn(`[LocalModel] Could not resolve CAPI endpoints (${errorCodeForLog(error)})`);
		}
	}

	// #endregion

	// #region Discovery

	private async _refreshDevice(force: boolean): Promise<boolean> {
		const outcome = await this._host.gpuProbe.probe({ force });
		const changed = !!this._topologyKey && (outcome.topologyChanged || outcome.result.topologyKey !== this._topologyKey);
		const wasSupported = this._isSupportedDevice();
		this._stageA = outcome.result;
		this._topologyKey = outcome.result.topologyKey;
		if (changed) {
			this._logService.info('[LocalModel] GPU topology changed; re-probing llama.cpp devices');
			this._state.hidden = [];
			this._persist();
		}
		if (wasSupported && !this._isSupportedDevice()) {
			// Nothing may keep running unseen on a device on-device models are no longer offered for.
			this._logService.info('[LocalModel] This device no longer has a GPU on-device models are offered for; stopping the on-device model');
			this._invalidateActivation();
			void this._supervisor.stop('system');
			this._recompute();
		}
		return changed;
	}

	/**
	 * Resolves the setting's llama-server. Serialized: an older resolution never overwrites a newer one, and the calls
	 * made while one runs share a single next one, which reads the configuration current then.
	 */
	private _refreshRuntime(): Promise<void> {
		return this._runtimeResolution.queue(async () => {
			this._runtime = await this._host.runtime.resolve({ enabled: !!this._liveConfig?.enabled, settingPath: this._liveConfig?.llamaServerPath, topologyKey: this._topologyKey });
		});
	}

	private async _refreshInstalls(): Promise<void> {
		this._installs = await this._host.store.listInstalled();
		for (const install of this._installs) {
			const familyId = install.capiId.toLowerCase();
			if (this._serveFacts.get(familyId)?.contentId === install.contentId) {
				continue;
			}
			const preset = await this._readPreset(install);
			this._serveFacts.set(familyId, { contentId: install.contentId, ctxSize: this._ctxSizeOf(install, preset), parallel: this._parallelOf(install, preset), ubatch: presetUbatchTokens(preset), draftModel: preset.draftModel });
		}
		void this._loadMetadata();
		const active = this._state.active;
		if (active && !this._setUpInstall(active) && !this._operations.has(active)) {
			this._logService.info('[LocalModel] The active model is no longer installed');
			this._state.active = undefined;
			this._persist();
		}
	}

	private async _refreshCatalog(force: boolean): Promise<void> {
		if (this._catalogRefresh) {
			return this._catalogRefresh;
		}
		const run = (async () => {
			const config = this._liveConfig;
			if (!config?.enabled) {
				return;
			}
			try {
				await this._catalog.refresh({ force });
			} catch (error) {
				if (!(error instanceof LocalModelCatalogError && error.code === 'cancelled')) {
					this._logService.warn(`[LocalModel] Catalog refresh failed (${errorCodeForLog(error)})`);
				}
			}
		})();
		this._catalogRefresh = run.finally(() => this._catalogRefresh = undefined);
		return this._catalogRefresh;
	}

	private async _refreshCatalogAndDisk(force: boolean): Promise<void> {
		await this._step('catalog', () => this._refreshCatalog(force));
		await this._step('disk', () => this._refreshDisk());
		this._recompute();
		this._restoreOperations();
	}

	private async _refreshDisk(): Promise<void> {
		for (const family of this._merged()) {
			if (this._installFor(family.familyId) || !family.offer) {
				continue;
			}
			const profile = family.offer;
			try {
				const check = await this._host.store.checkDiskSpace(profile.registry, profile.assetName, profile.peakDiskBytes, profile.version);
				this._disk.set(family.familyId, { volume: check.volume, availableBytes: check.availableBytes, requiredBytes: check.requiredBytes });
			} catch {
				this._disk.delete(family.familyId);
			}
		}
	}

	/** Orphan recovery: stops a verified orphan and reports another live owner on every installed family. `stopPrevious` is the user's Stop Previous Server. */
	private async _checkPreviousServers(stopPrevious = false): Promise<void> {
		if (!this._installs.length) {
			return;
		}
		const check = await this._supervisor!.checkPreviousServer({ stopPrevious });
		if (check === 'ownedElsewhere') {
			reportLocalModelServer(this._host!.telemetry, { target: this._target, event: 'ownedElsewhere', errorCode: 'ownedElsewhere' });
		}
		for (const install of this._installs) {
			const familyId = install.capiId.toLowerCase();
			if (check === 'ownedElsewhere') {
				this._previousServer.set(familyId, { code: 'ownedElsewhere', message: ownedElsewhereMessage(this._displayNameOf(familyId) ?? install.assetName), actions: [] });
			} else if (check === 'orphan') {
				this._previousServer.set(familyId, { code: 'orphan', message: orphanMessage(), actions: ['stopPrevious'] });
			} else {
				this._previousServer.delete(familyId);
			}
		}
	}

	private _merged(): IMergedCatalogFamily[] {
		// One install per family: the one it is served from.
		const familyIds = new Set(this._installs.map(install => install.capiId.toLowerCase()));
		const installs = [...familyIds].map(familyId => this._installFor(familyId)).filter(isDefined).map(toCatalogInstallFact);
		return this._catalog.merge(installs, this._runtime.capability?.version.build);
	}

	/** The servable version for a family: the set-up content first, then owned, then one in the registry's own folder. */
	private _installFor(familyId: string): ILocalModelInstalledVersion | undefined {
		const candidates = this._installs.filter(install => install.capiId.toLowerCase() === familyId);
		const setUp = this._state.setUp[familyId];
		return candidates.find(install => install.contentId === setUp)
			?? candidates.find(install => install.owned)
			?? candidates.find(install => install.registry === PUBLIC_REGISTRY)
			?? candidates[0];
	}

	/** The family's install once setup completed (owned versions, or adopted content that was set up). */
	private _setUpInstall(familyId: string): ILocalModelInstalledVersion | undefined {
		const install = this._installFor(familyId);
		return install && (install.owned || this._state.setUp[familyId] === install.contentId) ? install : undefined;
	}

	private _displayNameOf(familyId: string): string | undefined {
		return firstSafeDisplayName(this._merged().find(family => family.familyId === familyId)?.displayName, this._state.families[familyId]?.displayName, this._installFor(familyId)?.assetName);
	}

	private async _readPreset(install: ILocalModelInstalledVersion): Promise<ILlamaPreset> {
		const presetFile = install.manifest.files.find(file => file.path.toLowerCase() === PRESET_JSON_FILE_NAME)
			?? install.manifest.files.find(file => file.path.toLowerCase() === PRESET_INI_FILE_NAME.toLowerCase());
		const text = presetFile ? await this._host.readTextFile(path.join(install.versionDir, presetFile.path), PRESET_INI_MAX_BYTES) : undefined;
		const parsed = presetFile && text !== undefined
			? presetFile.path.toLowerCase() === PRESET_JSON_FILE_NAME ? parseLlamaConfigJson(text, install.assetName) : parseLlamaPreset(text, install.assetName)
			: undefined;
		if (parsed?.ok) {
			return parsed.preset;
		}
		if (parsed) {
			this._logService.warn('[LocalModel] Ignoring an invalid preset; serving without preset arguments');
		}
		const serve = install.manifest.serveOptions;
		return minimalPreset(install.assetName, serve.ctxSize > 0 ? serve.ctxSize : undefined, serve.parallel > 0 ? serve.parallel : undefined);
	}

	private _ctxSizeOf(install: ILocalModelInstalledVersion, preset: ILlamaPreset): number {
		const serve = install.manifest.serveOptions.ctxSize;
		return preset.ctxSize ?? (Number.isSafeInteger(serve) && serve > 0 ? serve : 4096);
	}

	private _parallelOf(install: ILocalModelInstalledVersion, preset: ILlamaPreset): number {
		const value = preset.parallel ?? install.manifest.serveOptions.parallel;
		return Number.isSafeInteger(value) ? Math.min(PRESET_MAX_PARALLEL, Math.max(1, value)) : 1;
	}

	private get _target(): string {
		return `${this._host.platform}-${this._host.arch}`;
	}

	// #endregion

	// #region Fit

	/** Devices for visibility: Stage B static devices when a qualifying llama.cpp was probed, else Stage A adapters. */
	private _candidateDevices(): { readonly stage: 'native' | 'llamaCpp'; readonly devices: readonly ICandidateDevice[] } {
		const adapters = this._stageA?.adapters ?? [];
		const stageB = this._runtime.capability?.devices;
		if (stageB?.length) {
			return { stage: 'llamaCpp', devices: stageB.map(device => ({ ...device, unifiedMemory: isUnifiedMemoryDevice(device, adapters) })) };
		}
		return { stage: 'native', devices: adapters.map(adapter => ({ name: adapter.id, description: adapter.description, totalBytes: adapter.capacityBytes, backend: '', unifiedMemory: adapter.unifiedMemory })) };
	}

	private _fitFor(requiredBytes: number): { readonly fit: LocalModelFitResult; readonly stage: 'native' | 'llamaCpp'; readonly device?: ICandidateDevice } {
		const { stage, devices } = this._candidateDevices();
		if (!devices.length) {
			return { fit: 'unknown', stage };
		}
		const selection = selectCandidateDevice(devices, requiredBytes, this._host.systemMemoryBytes);
		return selection ? { fit: selection.fit, stage, device: selection.device } : { fit: 'insufficient', stage };
	}

	/**
	 * The warning for an installed family whose footprint exceeds the largest device's total GPU memory.
	 * Uses static capacity, never free memory, so a loaded model of ours never counts against it.
	 */
	private _memoryWarningFor(requiredBytes: number): ILocalModelMemoryWarningV1 | undefined {
		const capacityBytes = Math.max(0, ...this._candidateDevices().devices.map(device => device.totalBytes));
		return capacityBytes > 0 && requiredBytes > capacityBytes ? { requiredBytes, capacityBytes } : undefined;
	}

	/** A model already on disk without catalog tags: its estimate at its selected context once its header is read, else its weights plus overhead, for visibility only. */
	private _approximateRequirement(install: ILocalModelInstalledVersion): number {
		const context = this._contextOf(install.capiId.toLowerCase(), install);
		return context?.options.find(option => option.tokens === context.tokens)?.gpuBytes
			?? computeFootprintBytes({ primaryBytes: install.manifest.totalBytes, draftBytes: 0, contextBytes: 0 });
	}

	// #endregion

	// #region Context size and memory estimate

	/** The primary GGUF and, when `draftModel` names one, the DFlash draft of an install. */
	private _modelFilesOf(install: ILocalModelInstalledVersion, draftModel: string | undefined): { readonly primary?: IModelFile; readonly draft?: IModelFile } {
		const files = install.manifest.files;
		const primaryName = path.basename(install.manifest.primaryPath);
		const primary = files.find(file => file.path === primaryName) ?? files.find(file => file.path.toLowerCase().endsWith('.gguf') && file.path !== draftModel);
		const draft = draftModel ? files.find(file => file.path === draftModel) : undefined;
		return {
			...(primary ? { primary: { filePath: path.join(install.versionDir, primary.path), bytes: primary.totalBytes } } : {}),
			...(draft ? { draft: { filePath: path.join(install.versionDir, draft.path), bytes: draft.totalBytes } } : {}),
		};
	}

	/** The GGUF header facts of `filePath`, read once; a failed read is tried again next time. */
	private _readMetadata(filePath: string): Promise<IGgufModelMetadata | undefined> {
		const cached = this._ggufMetadata.get(filePath);
		if (cached) {
			return Promise.resolve(cached);
		}
		let read = this._ggufMetadataReads.get(filePath);
		if (!read) {
			read = this._host.readGgufMetadata(filePath).then(metadata => {
				this._ggufMetadata.set(filePath, metadata);
				return metadata;
			}, () => undefined).finally(() => this._ggufMetadataReads.delete(filePath));
			this._ggufMetadataReads.set(filePath, read);
		}
		return read;
	}

	/** Reads, in the background, the headers of the installs' primary and draft GGUFs not read yet, then republishes. */
	private async _loadMetadata(): Promise<void> {
		const files = this._installs.flatMap(install => {
			const { primary, draft } = this._modelFilesOf(install, this._serveFacts.get(install.capiId.toLowerCase())?.draftModel);
			return [primary, draft].filter((file): file is IModelFile => !!file && !this._ggufMetadata.has(file.filePath));
		});
		if (!files.length) {
			return;
		}
		for (const file of files) {
			await this._readMetadata(file.filePath);
		}
		this._recompute();
	}

	/** Whether a load of `install` would use its preset's DFlash draft (assumed while the runtime is unknown). */
	private _usesDraft(install: ILocalModelInstalledVersion, facts: IServeFacts): boolean {
		if (!facts.draftModel) {
			return false;
		}
		const capability = this._runtime.capability;
		if (!capability) {
			return true;
		}
		const support = getFlagSupport(capability);
		return support.dflashSupported && support.flags.has('--device-draft') && !this._state.speculativeUnsupported.includes(`${getLlamaServerKey(capability)}:${install.contentId}`);
	}

	/** The selectable context sizes of a family and its selection, from the given facts and header. */
	private _computeContext(familyId: string, facts: IServeFacts, primary: IModelFile, metadata: IGgufModelMetadata, draft: IServingFootprintInput['draft']): ILocalModelContextV1 {
		return computeLocalModelContext({
			trainedTokens: metadata.contextLength,
			familyLimitTokens: this._state.families[familyId]?.limits?.maxContextWindowTokens,
			presetTokens: Math.floor(facts.ctxSize / facts.parallel),
			chosenTokens: this._state.contextTokens[familyId],
			gpuBytesAt: tokens => estimateServingFootprint({ primaryBytes: primary.bytes, primary: metadata, draft, parallel: facts.parallel, ubatchTokens: facts.ubatch }, tokens * facts.parallel),
		});
	}

	/** The family's context sizes with estimated GPU memory once its header is read; `withDraft` counts the DFlash draft when a load would use it. */
	private _contextOf(familyId: string, install: ILocalModelInstalledVersion, withDraft = true): ILocalModelContextV1 | undefined {
		const facts = this._serveFacts.get(familyId);
		if (!facts || facts.contentId !== install.contentId) {
			return undefined;
		}
		const { primary, draft } = this._modelFilesOf(install, facts.draftModel);
		const metadata = primary ? this._ggufMetadata.get(primary.filePath) : undefined;
		if (!primary || !metadata) {
			return undefined;
		}
		const usedDraft = withDraft && draft && this._usesDraft(install, facts) ? { bytes: draft.bytes, metadata: this._ggufMetadata.get(draft.filePath) } : undefined;
		return this._computeContext(familyId, facts, primary, metadata, usedDraft);
	}

	/** The chat template's thinking control of the family's install, once its header is read. */
	private _thinkingOf(familyId: string, install: ILocalModelInstalledVersion): LocalModelThinkingSupport | undefined {
		const { primary } = this._modelFilesOf(install, this._serveFacts.get(familyId)?.draftModel);
		return detectChatTemplateThinking(primary ? this._ggufMetadata.get(primary.filePath)?.chatTemplate : undefined);
	}

	// #endregion

	// #region Telemetry

	private _reportEligibility(): void {
		const telemetry = this._host.telemetry;
		const stageAAdapter = this._stageA?.adapter;
		for (const family of this._merged().filter(candidate => candidate.offer).slice(0, 5)) {
			const required = family.offer!.recommendedVramBytes;
			const result = this._fitFor(required);
			const capacity = result.device?.totalBytes ?? Math.max(0, ...this._candidateDevices().devices.map(device => device.totalBytes));
			const profile = isOfferableFit(result.fit) ? (result.fit === 'full' ? 'full-gpu' : 'near-fit') : 'none';
			reportLocalModelEligibility(telemetry, {
				stage: result.stage,
				fitClass: result.fit,
				visible: isOfferableFit(result.fit) && !this._state.hidden.includes(family.familyId),
				target: this._target,
				backend: result.device?.backend || 'none',
				profile,
				gpuMemoryGiB: toGiB(capacity),
				requiredGpuGiB: toGiB(required),
				systemMemoryGiB: toGiB(this._host.systemMemoryBytes),
				stageADeltaGiB: result.stage === 'llamaCpp' && stageAAdapter ? Math.round((toGiB(capacity) - toGiB(stageAAdapter.capacityBytes)) * 10) / 10 : 0,
				confidence: result.stage === 'llamaCpp' ? 'measured' : this._stageA?.confidence ?? 'unknown',
			});
		}
	}

	// #endregion

	// #region Status projection

	private _recompute(): void {
		if (this._store.isDisposed) {
			return;
		}
		const status = this._computeStatus();
		if (JSON.stringify(status) !== JSON.stringify(this._status.get())) {
			this._status.set(status, undefined);
		}
		const rowsKey = JSON.stringify(this.getModelRows());
		if (rowsKey !== this._rowsKey) {
			this._rowsKey = rowsKey;
			this._onDidChangeModelRows.fire();
		}
	}

	private _computeStatus(): ILocalModelStatusV1 {
		const config = this._liveConfig;
		const useInAuto = config?.useInAuto ?? false;
		if (!config?.enabled) {
			return createInitialLocalModelStatus(useInAuto);
		}
		const snapshot = this._catalog.snapshot;
		const merged = this._merged();
		// On-device models are offered on NVIDIA GPUs only: on any other (or an unknown) device nothing is listed.
		const supported = this._isSupportedDevice();
		const families: ILocalModelFamilyV1[] = [];
		const listed = new Set<string>();
		for (const family of supported ? merged : []) {
			const projected = this._projectFamily(family.familyId, family);
			if (projected) {
				families.push(projected);
				listed.add(family.familyId);
			}
		}
		for (const familyId of supported ? this._operations.keys() : []) {
			if (!listed.has(familyId)) {
				const projected = this._projectFamily(familyId, undefined);
				if (projected) {
					families.push(projected);
				}
			}
		}
		const fitRank = (family: ILocalModelFamilyV1) => family.offer?.fit === 'full' ? 0 : family.offer?.fit === 'near' ? 1 : 2;
		families.sort((a, b) => Number(b.autoCapable) - Number(a.autoCapable) || fitRank(a) - fitRank(b) || a.displayName.localeCompare(b.displayName));
		const offerable = merged.filter(family => family.offer).length;
		const active = supported ? this._projectActive() : undefined;
		return {
			schemaVersion: 1,
			device: this._projectDevice(),
			runtime: this._runtime.runtime,
			catalog: { state: computeCatalogState(snapshot.publicState, offerable), registries: { azureml: snapshot.publicState } },
			families,
			...(active ? { active } : {}),
			useInAuto,
		};
	}

	/** Whether on-device models are offered here: the selected GPU is NVIDIA's. Other or unknown devices list nothing, not even installs. */
	private _isSupportedDevice(): boolean {
		return this._stageA?.adapter?.vendorId === NVIDIA_VENDOR_ID;
	}

	private _projectDevice(): ILocalModelStatusV1['device'] {
		const adapter = this._stageA?.adapter;
		const vendor = adapter ? { vendor: toLocalModelDeviceVendor(adapter.vendorId) } : {};
		const stageB = this._runtime.capability?.devices;
		if (stageB?.length) {
			const best = [...stageB].sort((a, b) => b.totalBytes - a.totalBytes)[0];
			return { id: best.name, capacityBytes: best.totalBytes, confidence: 'measured', ...vendor };
		}
		return adapter ? { id: adapter.id, capacityBytes: adapter.capacityBytes, confidence: this._stageA!.confidence, ...vendor } : { confidence: 'unknown' };
	}

	private _projectFamily(familyId: string, merged: IMergedCatalogFamily | undefined): ILocalModelFamilyV1 | undefined {
		const install = this._setUpInstall(familyId);
		const onDisk = install ?? this._installFor(familyId);
		const operation = this._operations.get(familyId);
		const meta = this._state.families[familyId];
		const hidden = this._state.hidden.includes(familyId);
		const capiId = merged?.capiId ?? meta?.capiId ?? onDisk?.capiId ?? familyId;
		// Installed: the selected context size, and the model's footprint at it for the fit (the catalog's requirement otherwise).
		const context = install ? this._contextOf(familyId, install) : undefined;
		const estimatedBytes = context?.options.find(option => option.tokens === context.tokens)?.gpuBytes;
		const memoryWarning = estimatedBytes !== undefined ? this._memoryWarningFor(estimatedBytes) : undefined;
		let offer: ILocalModelFamilyV1['offer'];
		if (merged?.offer && !hidden) {
			const required = estimatedBytes ?? merged.offer.recommendedVramBytes;
			const { fit } = this._fitFor(required);
			if (isOfferableFit(fit)) {
				offer = { ...toLocalModelOffer(merged.offer, fit), requiredGpuBytes: required };
			}
		}
		const filesFit = !install && !!onDisk && !hidden && isOfferableFit(this._fitFor(merged?.offer?.recommendedVramBytes ?? this._approximateRequirement(onDisk)).fit);
		if (!offer && !install && !operation && !filesFit) {
			return undefined;
		}
		const update = install && merged?.update ? { contentId: this._catalog.snapshot.contentIds.get(sourceKey(merged.update)) ?? sourceKey(merged.update), downloadBytes: merged.update.downloadBytes } : undefined;
		const disk = this._disk.get(familyId);
		const entry: ILocalModelEntryV1 | undefined = install ? undefined : {
			modelFilesPresent: !!onDisk,
			...(disk && !onDisk ? { disk } : {}),
		};
		const readyContent = this._state.readyOffers[familyId];
		return {
			familyId,
			capiId,
			autoCapable: merged?.autoCapable ?? meta?.autoCapable ?? false,
			displayName: firstSafeDisplayName(merged?.displayName, meta?.displayName, onDisk?.assetName) ?? identifierForLog(familyId),
			...(offer ? { offer } : {}),
			...(install ? {
				install: {
					contentId: install.contentId,
					adopted: install.adopted,
					owned: install.owned,
					modelId: getLocalModelSelectionId(install.assetName),
					...(update ? { update } : {}),
				},
			} : {}),
			...(operation ? { operation: this._projectOperation(operation) } : {}),
			...(entry ? { entry } : {}),
			...(context ? { context } : {}),
			...(memoryWarning ? { memoryWarning } : {}),
			usage: this._usageOf(familyId),
			...(install && readyContent === install.contentId ? { readyOfferId: `${familyId}:${install.contentId}` } : {}),
			consentGiven: this._state.consent.includes(familyId),
		};
	}

	private _projectOperation(operation: IOperation): ILocalModelOperationV1 {
		return {
			id: operation.id,
			kind: operation.kind,
			state: operation.state,
			...(operation.state === 'paused' && operation.pausedReason ? { pausedReason: operation.pausedReason } : {}),
			resumeOnStartup: operation.record?.resumeOnStartup ?? false,
			...(operation.phase ? { phase: this._projectPhase(operation) } : {}),
			...(operation.completedBytes !== undefined ? { completedBytes: operation.completedBytes } : {}),
			...(operation.totalBytes !== undefined ? { totalBytes: operation.totalBytes } : {}),
			...(operation.bytesPerSecond !== undefined && operation.state === 'running' ? { bytesPerSecond: operation.bytesPerSecond } : {}),
			...(operation.state === 'error' && operation.error ? { error: operation.error } : {}),
		};
	}

	/** A swap or update reports waiting only while responses run; once none do, unloading the old server is reported as loading. */
	private _projectPhase(operation: IOperation): LocalModelOperationPhase | undefined {
		if (operation.phase !== 'draining' || operation.kind === 'remove') {
			return operation.phase;
		}
		const supervisor = this._supervisor.state.get();
		const running = supervisor.drain?.runningStreams ?? (supervisor.identity ? this._supervisor.responseCount(supervisor.identity.servingGeneration) : 0);
		return running > 0 ? operation.phase : 'loading';
	}

	private _projectActive(): ILocalModelActiveV1 | undefined {
		const familyId = this._state.active;
		const install = familyId ? this._setUpInstall(familyId) : undefined;
		if (!familyId || !install) {
			return undefined;
		}
		const supervisor = this._supervisor.state.get();
		const serving = supervisor.plan?.familyId === familyId;
		const identity = supervisor.identity?.familyId === familyId ? supervisor.identity : undefined;
		let server: LocalModelServerState = serving ? supervisor.server : this._start?.familyId === familyId ? 'starting' : 'stopped';
		let error = serving && supervisor.server === 'error' ? supervisor.error : undefined;
		if (!error && server !== 'ready' && server !== 'starting' && server !== 'stopping') {
			error = this._activeError ?? this._previousServer.get(familyId);
		}
		if (error) {
			server = 'error';
		}
		const ready = serving && server === 'ready';
		const props = ready ? supervisor.props : undefined;
		// While the previous content still runs (an update's drain), report what is actually serving.
		const running = serving && !!supervisor.plan && (server === 'ready' || server === 'starting' || server === 'stopping');
		return {
			familyId,
			contentId: running ? supervisor.plan!.contentId : install.contentId,
			servingGeneration: identity?.servingGeneration ?? 0,
			server,
			...(serving && supervisor.plan ? { profile: supervisor.plan.profile } : {}),
			...(props ? { contextTokens: Math.floor(props.nCtx / Math.max(1, props.totalSlots)) } : {}),
			...(ready ? { autoEligible: supervisor.autoEligible } : {}),
			// The preset's DFlash draft: whether it serves with it, or without because this llama.cpp build crashed with it.
			...(ready && supervisor.plan?.hasDraft && supervisor.config ? { dflashSupported: supervisor.config.speculative } : {}),
			...(serving && supervisor.drain ? { drain: { runningStreams: supervisor.drain.runningStreams } } : {}),
			...(serving && server === 'starting' && supervisor.load ? { load: this._projectLoad(supervisor.plan!.contentId, supervisor.load) } : {}),
			// The model loaded next: another one while the previous model is still active, or the active
			// one again for a reload. Once a swap made its model active, it is just that model loading.
			...(this._swap && (this._swap.reload || this._swap.toFamilyId !== familyId) ? { swapTo: this._swap.toFamilyId } : {}),
			...(error ? { error } : {}),
		};
	}

	/** The load in progress, with the last comparable load's duration and why it is a retry (without DFlash after it crashed this build). */
	private _projectLoad(contentId: string, load: IServerLoadProgress): ILocalModelLoadV1 {
		const key = { contentId, device: load.device, ctxSize: load.config.ctxSize, speculative: load.config.speculative };
		const expectedMs = this._state.loadDurations.findLast(record => isSameLoad(record, key))?.durationMs;
		return { step: load.step, startedAt: load.startedAt, ...(expectedMs ? { expectedMs } : {}), ...(load.retry ? { retry: load.retry } : {}) };
	}

	/** Remembers how long a load that became ready took (its final attempt), for the next comparable load's progress. */
	private _recordLoadDuration(contentId: string, loaded: IServerLoadRecord): void {
		const durationMs = Math.round(loaded.durationMs);
		if (!(durationMs > 0 && durationMs <= LOAD_DURATION_MAX_MS) || !isSha256Hex(contentId) || !DEVICE_NAME_PATTERN.test(loaded.device)) {
			return;
		}
		const record: ILoadDurationRecord = { contentId, device: loaded.device, ctxSize: loaded.config.ctxSize, speculative: loaded.config.speculative, durationMs };
		this._state.loadDurations = [...this._state.loadDurations.filter(candidate => !isSameLoad(candidate, record)), record].slice(-LOAD_HISTORY_MAX);
		this._persist();
		this._logService.info(`[LocalModel] Load took ${(durationMs / 1000).toFixed(1)} s`);
	}

	private _usageOf(familyId: string): ILocalModelFamilyV1['usage'] {
		const identity = this._supervisor.state.get().identity;
		const current = identity?.familyId === familyId ? identity : undefined;
		let boundDirectChats = 0;
		for (const bound of this._boundSessions.values()) {
			if (bound === familyId) {
				boundDirectChats++;
			}
		}
		return {
			runningStreams: current ? this._supervisor.responseCount(current.servingGeneration) : 0,
			boundDirectChats,
			liveAutoRoutes: current ? this._routeTable.countLiveRoutes(current.servingGeneration, this._accountGeneration) : 0,
		};
	}

	private _persist(): void {
		// Belt and braces: an entry that holds anything credential-like is never written.
		const scrubbed = scrubProviderStateForStorage(this._state);
		reportDroppedStorageEntries(this._logService, PROVIDER_STATE_KEY, scrubbed.dropped);
		this._host.storage.set(PROVIDER_STATE_KEY, scrubbed.state);
	}

	// #endregion

	// #region Acquisition operations

	async setUp(familyId: string, consent: ILocalModelConsent, _token: CancellationToken): Promise<void> {
		await this._ready();
		this._recompute();
		const status = this._status.get();
		const family = status.families.find(candidate => candidate.familyId === familyId);
		if (!family) {
			throw new Error('Unknown on-device model family');
		}
		const existing = this._operations.get(familyId);
		if (existing?.state === 'running') {
			throw new Error('An operation is already running for this model');
		}
		if (computeLocalModelConsentScope({ family }) !== consent.scope) {
			throw new Error('The consent no longer matches what this device would set up');
		}
		if (family.install && !existing) {
			// Already set up: a confirmed setup of an installed family only (re)loads it when nothing is active,
			// and only with a llama.cpp that can serve it (without one, it stays downloaded).
			if (!this._state.active) {
				this._state.active = familyId;
				this._persist();
				if (this._hasUsableRuntime()) {
					this._backgroundStart('install');
				}
			}
			return;
		}
		const target = this._setupTarget(familyId);
		if (!target) {
			throw new Error('Nothing to set up for this model');
		}
		if (existing) {
			this._dropOperation(existing);
		}
		if (!this._state.consent.includes(familyId)) {
			this._state.consent.push(familyId);
		}
		const operation = this._createOperation(familyId, 'setup', {
			operationId: this._host.generateId(),
			familyId,
			kind: 'setup',
			target,
			consentScope: consent.scope,
			offerScope: computeLocalModelOfferScope(family),
			downloadAgreed: !family.entry?.modelFilesPresent && !!family.offer,
			intent: 'running',
			resumeOnStartup: true,
		});
		void this._runAcquisition(operation);
	}

	/** Whether the setting's llama.cpp qualified to serve: without one, a downloaded model isn't loaded on its own. */
	private _hasUsableRuntime(): boolean {
		return !!this._runtime.capability;
	}

	async update(familyId: string, consent: ILocalModelConsent | undefined, _token: CancellationToken): Promise<void> {
		await this._ready();
		const merged = this._merged().find(family => family.familyId === familyId);
		const install = this._setUpInstall(familyId);
		const update = merged?.update;
		if (!install || !update) {
			throw new Error('No update is available for this model');
		}
		this._admitAcquisition(familyId);
		const operation = this._createOperation(familyId, 'update', {
			operationId: this._host.generateId(),
			familyId,
			kind: 'update',
			target: { source: update.registry, assetName: update.assetName, version: update.version },
			consentScope: consent?.scope ?? '',
			offerScope: computeLocalModelOfferScope({ familyId, offer: toLocalModelOffer(update, 'full') }),
			downloadAgreed: true,
			intent: 'running',
			resumeOnStartup: true,
		});
		void this._runAcquisition(operation);
	}

	cancel(operationId: string): void {
		const operation = this._operationById(operationId);
		if (!operation) {
			return;
		}
		if (operation.kind === 'swap') {
			if (operation.state !== 'running') {
				return;
			}
			if (operation.phase === 'draining') {
				// Cancelling while the serving model's responses finish takes the change back: that model
				// stays loaded and active, serving as before. Once none run, it is being unloaded for the
				// load, so the cancel ends the swap with nothing loaded.
				operation.abort.abort(new OperationCancelled('user'));
				this._endCancelledSwap(operation);
				return;
			}
			if (operation.phase === 'loading') {
				// The load may still be preparing its launch plan: supersede it first, so it never starts.
				this._invalidateActivation();
				operation.abort.abort(new OperationCancelled('user'));
				// Reflected at once: the operation ends now; the server shows `stopping` until its process is gone.
				this._endCancelledSwap(operation);
				void this._supervisor.stop('system');
			}
			return;
		}
		if (operation.kind === 'remove') {
			return;
		}
		if (operation.state === 'error') {
			this._dropOperation(operation);
			return;
		}
		this._pauseByUser(operation);
	}

	pause(operationId: string): void {
		const operation = this._operationById(operationId);
		if (operation?.record && operation.state === 'running') {
			this._pauseByUser(operation);
		}
	}

	async resume(operationId: string): Promise<void> {
		await this._ready();
		const operation = this._operationById(operationId);
		if (!operation?.record || operation.state !== 'paused') {
			throw new Error('No paused operation to resume');
		}
		if (operation.pausedReason === 'consentChanged') {
			throw new Error('The model changed since the consent; set it up again to review the details');
		}
		this._resumeOperation(operation, false);
	}

	async retry(operationId: string): Promise<void> {
		await this._ready();
		const operation = this._operationById(operationId);
		if (!operation) {
			throw new Error('No operation to retry');
		}
		if (operation.kind === 'swap') {
			if (operation.state === 'error') {
				this._retrySwap(operation);
			}
			return;
		}
		if (operation.kind === 'remove') {
			if (operation.state === 'error') {
				operation.state = 'running';
				operation.error = undefined;
				void this._runRemove(operation);
			}
			return;
		}
		if (operation.state !== 'error' && !(operation.state === 'paused' && operation.pausedReason !== 'consentChanged')) {
			return;
		}
		if (operation.state === 'error' && operation.error?.code === 'staleLock' && operation.record) {
			// The user's Retry is what clears a download lock its holder left behind (macOS).
			await this._host.downloader.clearStaleLock(this._host.store.familyDir(operation.record.target.source, operation.record.target.assetName));
			const current = this._operationById(operationId);
			if (current !== operation || current.state !== 'error') {
				return;
			}
		}
		this._resumeOperation(operation, false);
	}

	private async _ready(): Promise<void> {
		if (!this._liveConfig?.enabled) {
			throw new Error('On-device models are not available');
		}
		await this._initialization;
	}

	private _admitAcquisition(familyId: string): void {
		const existing = this._operations.get(familyId);
		if (existing?.state === 'running') {
			throw new Error('An operation is already running for this model');
		}
		if (existing) {
			this._dropOperation(existing);
		}
	}

	/** What a setup acquires: files already on this device, else the offered build. */
	private _setupTarget(familyId: string): ILocalModelSetupRecord['target'] | undefined {
		const onDisk = this._installFor(familyId);
		if (onDisk) {
			// Files already on this device are identified by their content; the registry is the one they are used as.
			return { source: PUBLIC_REGISTRY, assetName: onDisk.assetName, version: onDisk.version, contentId: onDisk.contentId };
		}
		const profile = this._merged().find(family => family.familyId === familyId)?.offer;
		return profile ? { source: profile.registry, assetName: profile.assetName, version: profile.version } : undefined;
	}

	private _operationById(operationId: string): IOperation | undefined {
		for (const operation of this._operations.values()) {
			if (operation.id === operationId) {
				return operation;
			}
		}
		return undefined;
	}

	private _createOperation(familyId: string, kind: LocalModelOperationKind, record: ILocalModelSetupRecord | undefined): IOperation {
		const operation: IOperation = {
			id: record?.operationId ?? this._host.generateId(),
			familyId,
			kind,
			state: 'running',
			abort: new AbortController(),
			...(record ? { record } : {}),
			autoResumed: false,
			started: this._clock.now(),
		};
		this._operations.set(familyId, operation);
		if (record) {
			this._saveRecord(record);
		}
		this._recompute();
		return operation;
	}

	private _saveRecord(record: ILocalModelSetupRecord): void {
		this._state.operations = [...this._state.operations.filter(candidate => candidate.familyId !== record.familyId), record];
		this._persist();
	}

	private _updateRecord(operation: IOperation, changes: Partial<ILocalModelSetupRecord>): void {
		if (!operation.record) {
			return;
		}
		operation.record = { ...operation.record, ...changes };
		// A completed acquisition's record is gone from storage and stays gone (a retry only reloads).
		if (this._state.operations.some(record => record.operationId === operation.id)) {
			this._saveRecord(operation.record);
		}
	}

	/** Removes an operation that is not running (dismissed error, replaced pause). Partial files stay for a later resume. */
	private _dropOperation(operation: IOperation): void {
		operation.abort.abort(new OperationCancelled('dropped'));
		this._removeOperation(operation);
	}

	private _removeOperation(operation: IOperation): void {
		if (this._operations.get(operation.familyId) === operation) {
			this._operations.delete(operation.familyId);
		}
		if (operation.record) {
			this._state.operations = this._state.operations.filter(record => record.operationId !== operation.id);
			this._persist();
		}
		this._recompute();
	}

	private _pauseByUser(operation: IOperation): void {
		operation.abort.abort(new OperationCancelled('user'));
		if (operation.kind === 'setup' && operation.phase === 'loading') {
			// Cancel the first load itself (it is still starting); a server already serving is untouched.
			const supervisor = this._supervisor.state.get();
			if (!(supervisor.server === 'ready' && supervisor.plan?.familyId === operation.familyId)) {
				this._invalidateActivation();
			}
		}
		operation.state = 'paused';
		operation.pausedReason = 'user';
		operation.bytesPerSecond = undefined;
		operation.error = undefined;
		this._updateRecord(operation, { intent: 'pausedByUser', resumeOnStartup: false });
		this._reportSetup({ phase: 'download', outcome: 'paused', pausedReason: 'user', registry: operation.record?.target.source ?? '' });
		this._recompute();
	}

	private _pauseFor(operation: IOperation, reason: LocalModelPausedReason): void {
		operation.state = 'paused';
		operation.pausedReason = reason;
		operation.bytesPerSecond = undefined;
		operation.error = undefined;
		this._updateRecord(operation, reason === 'consentChanged' ? { intent: 'pausedByUser', resumeOnStartup: false, pausedReason: 'consentChanged' } : { intent: 'running', resumeOnStartup: true });
		this._reportSetup({ phase: 'download', outcome: 'paused', pausedReason: reason, registry: operation.record?.target.source ?? '', autoResumed: operation.autoResumed });
		this._recompute();
	}

	private _resumeOperation(operation: IOperation, autoResumed: boolean): void {
		operation.abort.abort(new OperationCancelled('restart'));
		operation.abort = new AbortController();
		operation.state = 'running';
		operation.pausedReason = undefined;
		operation.error = undefined;
		operation.autoResumed = autoResumed;
		this._updateRecord(operation, { intent: 'running', resumeOnStartup: true, pausedReason: undefined });
		this._recompute();
		void this._runAcquisition(operation, true);
	}

	/** Restores durable setup records: an interrupted one resumes once its checks pass, a changed scope pauses with `consentChanged`, and an explicit cancel stays paused. */
	private _restoreOperations(): void {
		if (!this._initialized || this._store.isDisposed || !this._liveConfig?.enabled) {
			return;
		}
		for (const record of this._state.operations) {
			if (this._operations.has(record.familyId)) {
				continue;
			}
			const operation: IOperation = {
				id: record.operationId,
				familyId: record.familyId,
				kind: record.kind,
				state: 'paused',
				pausedReason: record.pausedReason ?? (record.intent === 'pausedByUser' ? 'user' : 'quit'),
				abort: new AbortController(),
				record,
				autoResumed: false,
				started: this._clock.now(),
			};
			this._operations.set(record.familyId, operation);
			if (operation.pausedReason === 'consentChanged' && this._acquiredTargetContent(operation)) {
				// Paused for consent although its files are already in place: only its load is left, so Resume loads it.
				operation.pausedReason = 'user';
				this._updateRecord(operation, { pausedReason: undefined });
			}
		}
		for (const operation of [...this._operations.values()]) {
			if (operation.state === 'paused' && operation.pausedReason === 'quit' && operation.record?.intent === 'running' && operation.record.resumeOnStartup) {
				void this._tryAutoResume(operation);
			}
		}
		this._recompute();
	}

	private async _tryAutoResume(operation: IOperation): Promise<void> {
		const config = this._liveConfig;
		const record = operation.record!;
		// Nothing is shown on a device on-device models aren't offered for, so nothing downloads there unseen.
		if (!config?.enabled || !config.accountGate || !this._isSupportedDevice()) {
			return;
		}
		if (this._downloadsWithoutConsent(operation)) {
			this._logService.info('[LocalModel] The model files the setup was agreed for are gone; asking before downloading');
			this._pauseFor(operation, 'consentChanged');
			return;
		}
		const needsCatalog = this._needsCatalog(operation);
		if (needsCatalog) {
			const registryState = this._catalog.snapshot.publicState;
			if (registryState !== 'ready' && registryState !== 'empty') {
				// The content cannot be checked yet; try again after the next catalog refresh.
				return;
			}
		}
		if (this._checkRetainedConsent(operation) !== 'holds') {
			this._logService.info('[LocalModel] The model changed while its download was paused; asking again');
			this._pauseFor(operation, 'consentChanged');
			return;
		}
		const profile = needsCatalog ? this._findProfile(record.target) : undefined;
		if (profile) {
			try {
				const disk = await this._host.store.checkDiskSpace(profile.registry, profile.assetName, profile.peakDiskBytes, profile.version);
				if (!disk.ok) {
					this._pauseFor(operation, 'diskFull');
					return;
				}
			} catch {
				// Preflight unavailable; the download reports a full disk itself.
			}
		}
		if (this._operations.get(operation.familyId) === operation && operation.state === 'paused' && operation.pausedReason === 'quit') {
			this._logService.info('[LocalModel] Resuming an interrupted download');
			this._resumeOperation(operation, true);
		}
	}

	/** The catalog profile a record targets (same asset and version). */
	private _findProfile(target: ILocalModelSetupRecord['target']): ILocalModelProfile | undefined {
		return this._catalog.snapshot.publicProfiles.find(profile => profile.assetName.toLowerCase() === target.assetName.toLowerCase() && profile.version === target.version);
	}

	/** Whether the operation still has files to acquire from the registry (anything but a setup of files already on this device). */
	private _needsCatalog(operation: IOperation): boolean {
		return operation.kind !== 'setup' || !this._installFor(operation.familyId);
	}

	/** Whether acquiring now would download although consent covered only model files on this device, which are gone or changed. */
	private _downloadsWithoutConsent(operation: IOperation): boolean {
		const record = operation.record;
		if (!record || operation.kind !== 'setup' || record.downloadAgreed) {
			return false;
		}
		const onDisk = this._installFor(operation.familyId);
		return !onDisk || (!!record.target.contentId && record.target.contentId !== onDisk.contentId);
	}

	/** Whether a setup already acquired exactly its target content, so loading downloads nothing and its consent needs no new check. */
	private _acquiredTargetContent(operation: IOperation): boolean {
		const contentId = operation.record?.target.contentId;
		return operation.kind === 'setup' && !!contentId
			&& this._state.setUp[operation.familyId] === contentId
			&& this._installFor(operation.familyId)?.contentId === contentId;
	}

	/**
	 * Whether a record's retained consent still covers what would be acquired now, judged against
	 * the current catalog. The one check behind the automatic resume, Resume and Retry.
	 */
	private _checkRetainedConsent(operation: IOperation): 'holds' | 'offerChanged' | 'downloadNotAgreed' {
		if (this._acquiredTargetContent(operation)) {
			return 'holds';
		}
		if (this._downloadsWithoutConsent(operation)) {
			return 'downloadNotAgreed';
		}
		const record = operation.record!;
		const merged = this._merged().find(family => family.familyId === operation.familyId);
		const offerScope = operation.kind === 'update' && merged?.update
			? computeLocalModelOfferScope({ familyId: operation.familyId, offer: toLocalModelOffer(merged.update, 'full') })
			: computeLocalModelOfferScope({ familyId: operation.familyId, offer: this._projectFamily(operation.familyId, merged)?.offer });
		return offerScope !== record.offerScope || (this._needsCatalog(operation) && !this._findProfile(record.target)) ? 'offerChanged' : 'holds';
	}

	/**
	 * Resume and Retry: checks the retained consent, querying the catalog again when the registry was
	 * unreachable. A change pauses with `consentChanged`; a still-unreachable registry with `network`.
	 */
	private async _ensureRetainedConsent(operation: IOperation): Promise<void> {
		const record = operation.record;
		if (!record) {
			return;
		}
		if (this._downloadsWithoutConsent(operation)) {
			this._logService.info('[LocalModel] The model files the setup was agreed for are gone; asking before downloading');
			throw new PauseRequest('consentChanged');
		}
		if (this._needsCatalog(operation)) {
			const known = () => this._catalog.snapshot.publicState === 'ready' || this._catalog.snapshot.publicState === 'empty';
			if (!known()) {
				await this._step('catalog', () => this._refreshCatalog(true));
				this._throwIfCancelled(operation.abort);
			}
			if (!known()) {
				throw this._missingProfilePause();
			}
		}
		if (this._checkRetainedConsent(operation) !== 'holds') {
			this._logService.info('[LocalModel] The model changed since the consent; asking again before downloading');
			throw new PauseRequest('consentChanged');
		}
	}

	/** {@link _findProfile}, querying an unreachable registry again first so stale state doesn't pause every Resume and Retry. */
	private async _findProfileRefreshing(operation: IOperation, record: ILocalModelSetupRecord): Promise<ILocalModelProfile | undefined> {
		const profile = this._findProfile(record.target);
		const state = this._catalog.snapshot.publicState;
		if (profile || (state !== 'unavailable' && state !== 'loading')) {
			return profile;
		}
		await this._step('catalog', () => this._refreshCatalog(true));
		this._throwIfCancelled(operation.abort);
		return this._findProfile(record.target);
	}

	/** Why a record's build is not in the catalog: an unreachable registry, or changed content. */
	private _missingProfilePause(): PauseRequest {
		const state = this._catalog.snapshot.publicState;
		return new PauseRequest(state === 'unavailable' || state === 'loading' ? 'network' : 'consentChanged');
	}

	private async _runAcquisition(operation: IOperation, resumed = false): Promise<void> {
		const abort = operation.abort;
		try {
			if (resumed) {
				await this._ensureRetainedConsent(operation);
				this._throwIfCancelled(abort);
			}
			// Downloading never needs llama.cpp. With a qualified one, Stage B asks it about this device's GPUs first.
			if (operation.kind === 'setup' && this._hasUsableRuntime() && !await this._checkDevice(operation)) {
				return;
			}
			this._throwIfCancelled(abort);
			const install = await this._ensureFiles(operation);
			this._throwIfCancelled(abort);
			await this._completeAcquisition(operation, install);
		} catch (error) {
			if (abort.signal.aborted || error instanceof OperationCancelled || this._store.isDisposed) {
				return;
			}
			this._failOperation(operation, error);
		} finally {
			this._reconcileContextSizes();
		}
	}

	private _throwIfCancelled(abort: AbortController): void {
		if (abort.signal.aborted || this._store.isDisposed) {
			throw new OperationCancelled('cancelled');
		}
	}

	/**
	 * Stage B visibility check with a qualified llama.cpp: an insufficient device stops before the
	 * download and hides the family. A llama.cpp that can't list devices skips the check.
	 */
	private async _checkDevice(operation: IOperation): Promise<boolean> {
		this._setPhase(operation, 'checkingDevice');
		const host = this._host;
		const capability = this._runtime.capability!;
		// The requirement of the build being set up. Never judge a device against an unknown one (a registry
		// that was unreachable at the last refresh): that would hide the model and drop the setup for good.
		const record = operation.record;
		let profile: ILocalModelProfile | undefined;
		if (record && !this._installFor(operation.familyId)) {
			profile = await this._findProfileRefreshing(operation, record);
			if (!profile) {
				throw this._missingProfilePause();
			}
		}
		const devices = await host.runtime.listDevices(capability.realPath, operation.abort.signal);
		this._throwIfCancelled(operation.abort);
		if (!devices) {
			this._logService.warn('[LocalModel] llama.cpp could not list GPU devices; downloading without asking it about this device');
			return true;
		}
		const required = profile?.recommendedVramBytes ?? this._requiredBytesFor(operation.familyId);
		const adapters = this._stageA?.adapters ?? [];
		const selection = selectCandidateDevice(devices.map(device => ({ ...device, unifiedMemory: isUnifiedMemoryDevice(device, adapters) })), required, host.systemMemoryBytes);
		reportLocalModelEligibility(host.telemetry, {
			stage: 'llamaCpp',
			fitClass: selection?.fit ?? 'insufficient',
			visible: !!selection,
			target: this._target,
			backend: selection?.device.backend ?? devices[0]?.backend ?? 'none',
			profile: selection ? (selection.fit === 'full' ? 'full-gpu' : 'near-fit') : 'none',
			gpuMemoryGiB: toGiB(selection?.device.totalBytes ?? Math.max(0, ...devices.map(device => device.totalBytes))),
			requiredGpuGiB: toGiB(required),
			systemMemoryGiB: toGiB(host.systemMemoryBytes),
			stageADeltaGiB: this._stageA?.adapter ? Math.round((toGiB(selection?.device.totalBytes ?? 0) - toGiB(this._stageA.adapter.capacityBytes)) * 10) / 10 : 0,
			confidence: 'measured',
		});
		if (selection) {
			return true;
		}
		this._logService.info('[LocalModel] llama.cpp reports too little GPU memory for this model; not downloading it');
		if (!this._state.hidden.includes(operation.familyId)) {
			this._state.hidden.push(operation.familyId);
		}
		this._reportSetup({ phase: 'download', outcome: 'failed', errorCode: 'insufficientMemory', registry: operation.record?.target.source ?? '' });
		this._removeOperation(operation);
		return false;
	}

	private _requiredBytesFor(familyId: string): number {
		const merged = this._merged().find(family => family.familyId === familyId);
		const profile = merged?.offer;
		if (profile) {
			return profile.recommendedVramBytes;
		}
		const install = this._installFor(familyId);
		return install ? this._approximateRequirement(install) : Number.MAX_SAFE_INTEGER;
	}

	/** Files step: verify files already on this device (adoption), or resolve, download, verify and place. */
	private async _ensureFiles(operation: IOperation): Promise<ILocalModelInstalledVersion> {
		const host = this._host;
		const signal = operation.abort.signal;
		const record = operation.record!;
		const onDisk = operation.kind === 'setup' ? this._installFor(operation.familyId) : undefined;
		if (onDisk && (!record.target.contentId || record.target.contentId === onDisk.contentId)) {
			// The files to load are already here: their own header says whether this llama.cpp can run them.
			const primaryPath = this._primaryModelPath(onDisk);
			await this._checkArchitecture(operation, primaryPath ? await host.readGgufArchitecture(primaryPath, GGUF_ARCHITECTURE_READ_MAX_BYTES) : { kind: 'unknown', reason: 'invalid' });
			if (!onDisk.hashesVerified) {
				this._setPhase(operation, 'verifying');
				const started = this._clock.now();
				const verified = await host.store.verifyAdoptedVersion(onDisk, signal);
				this._throwIfCancelled(operation.abort);
				this._reportSetup({ phase: 'verify', outcome: verified ? 'success' : 'failed', errorCode: verified ? '' : 'integrity', registry: onDisk.registry, durationMs: this._clock.now() - started, totalBytes: onDisk.manifest.totalBytes });
				if (!verified) {
					throw new OperationError(createLocalModelAcquisitionError('integrity', this._displayNameOf(operation.familyId) ?? onDisk.assetName));
				}
				await this._refreshInstalls();
			}
			return this._installs.find(install => install.contentId === onDisk.contentId && install.versionDir === onDisk.versionDir) ?? onDisk;
		}
		if (this._downloadsWithoutConsent(operation)) {
			// The files went away after the consent was checked: nothing downloads without the user's consent.
			throw new PauseRequest('consentChanged');
		}

		const profile = await this._findProfileRefreshing(operation, record);
		if (!profile) {
			throw this._missingProfilePause();
		}
		this._setPhase(operation, 'resolving');
		const resolved = await this._catalog.resolveForSetup(profile, signal);
		this._throwIfCancelled(operation.abort);
		if (record.target.contentId && record.target.contentId !== resolved.contentId) {
			throw new PauseRequest('consentChanged');
		}
		this._updateRecord(operation, { target: { ...record.target, contentId: resolved.contentId } });
		// Every name the registry provided must stay beneath the version directory (the catalog validated them; fail closed anyway).
		const targetDir = host.store.versionDir(profile.registry, profile.assetName, profile.version);
		if (![resolved.primaryFile, ...resolved.files.map(file => file.relativePath)].every(name => resolveModelFilePath(targetDir, name))) {
			throw new LocalModelCatalogError('invalidContent', 'Unsafe file name');
		}
		const modelId = `azureml://registries/${profile.registry}/models/${profile.assetName}/versions/${profile.version}`;
		// Whether a qualified llama.cpp knows the model's architecture decides only whether it loads once downloaded.
		await this._checkArchitecture(operation, await this._readArchitectureBeforeDownload(operation, resolved, modelId));
		const versionDir = await host.store.beginVersion(profile.registry, profile.assetName, profile.version, profile.capiId);
		const totalBytes = resolved.files.reduce((sum, file) => sum + file.sizeBytes, 0);
		this._setPhase(operation, 'downloading', { completedBytes: 0, totalBytes });
		await host.downloader.download({
			modelId,
			targetDir: versionDir,
			familyDir: host.store.familyDir(profile.registry, profile.assetName),
			files: resolved.files,
			renewFiles: renewSignal => this._catalog.renewDownloadUrls(resolved, renewSignal),
			signal,
			onProgress: progress => this._onDownloadProgress(operation, progress.phase, progress.completedBytes, progress.totalBytes, progress.bytesPerSecond),
			registry: profile.registry,
			autoResumed: operation.autoResumed,
		});
		this._throwIfCancelled(operation.abort);
		this._setPhase(operation, 'placing');
		// Without a qualified llama.cpp (downloading doesn't need one), the manifest keeps every argument of the preset.
		const support = this._runtime.capability ? getFlagSupport(this._runtime.capability) : { flags: new Set(resolved.preset.entries.map(entry => `--${entry.key}`)), dflashSupported: true };
		const install = await host.store.commitVersion({
			registry: profile.registry,
			assetName: profile.assetName,
			version: profile.version,
			primaryFile: resolved.primaryFile,
			files: resolved.files.map(file => ({ path: file.relativePath, totalBytes: file.sizeBytes, sha256: file.sha256, etag: file.etag ?? '' })),
			ctxSize: resolved.preset.ctxSize ?? 4096,
			parallel: resolved.preset.parallel ?? 1,
			args: buildLlamaPresetArgs(resolved.preset, support).args,
			displayName: profile.displayName,
			capiId: profile.capiId,
			autoCapable: profile.autoCapable,
			activate: true,
		});
		this._rememberFamily(operation.familyId, profile);
		await this._refreshInstalls();
		return install;
	}

	/** Absolute path of an install's primary GGUF, when its name is a safe one directly in its version directory. */
	private _primaryModelPath(install: ILocalModelInstalledVersion): string | undefined {
		return resolveModelFilePath(install.versionDir, path.basename(install.manifest.primaryPath));
	}

	/**
	 * `general.architecture` of the primary GGUF before the download: from bytes already on this device
	 * when possible, else via bounded `Range` requests. Local files are only read beneath the version directory.
	 */
	private async _readArchitectureBeforeDownload(operation: IOperation, resolved: IResolvedModelVersion, modelId: string): Promise<GgufArchitectureRead> {
		const host = this._host;
		const primary = resolved.files.find(file => file.relativePath === resolved.primaryFile);
		const versionDir = host.store.versionDir(resolved.profile.registry, resolved.profile.assetName, resolved.profile.version);
		const placed = primary && resolveModelFilePath(versionDir, primary.relativePath);
		if (primary && placed) {
			const local: string[] = [];
			if ((await fs.promises.stat(placed).catch(() => undefined))?.size === primary.sizeBytes) {
				local.push(placed);
			}
			const partial = await findResumablePartial(versionDir, modelId, primary);
			if (partial) {
				local.push(partial);
			}
			for (const file of local) {
				const read = await host.readGgufArchitecture(file, GGUF_ARCHITECTURE_READ_MAX_BYTES);
				this._throwIfCancelled(operation.abort);
				if (read.kind === 'found') {
					return read;
				}
			}
		}
		return this._catalog.readPrimaryArchitecture(resolved, operation.abort.signal);
	}

	/**
	 * Records the model's architecture before the download and, with a qualified llama-server, whether it
	 * supports it. Never blocks the download: a model this llama.cpp can't run is downloaded but not loaded.
	 */
	private async _checkArchitecture(operation: IOperation, read: GgufArchitectureRead): Promise<void> {
		const architecture = read.kind === 'found' ? sanitizeLlamaArchitecture(read.architecture) : undefined;
		operation.architecture = architecture;
		operation.architectureSupport = undefined;
		const capability = this._runtime.capability;
		if (!architecture || !capability) {
			this._logService.info(architecture
				? '[LocalModel] No qualified llama.cpp; not checking whether it supports the model architecture'
				: `[LocalModel] The model architecture is unknown (${read.kind === 'unknown' ? read.reason : 'unexpected name'}); not checking whether llama.cpp supports it`);
			return;
		}
		const support = await this._host.runtime.checkArchitectureSupport(capability, architecture, operation.abort.signal);
		this._throwIfCancelled(operation.abort);
		operation.architectureSupport = support;
		this._logService.info(`[LocalModel] llama.cpp support for the model architecture (${toTelemetryArchitecture(architecture)}) of ${identifierForLog(operation.familyId)}: ${support}`);
	}

	private _rememberFamily(familyId: string, profile: ILocalModelProfile | undefined, install?: ILocalModelInstalledVersion): void {
		const previous = this._state.families[familyId];
		const displayName = firstSafeDisplayName(profile?.displayName, previous?.displayName, this._displayNameOf(familyId), install?.assetName) ?? identifierForLog(familyId);
		const capiId = profile?.capiId ?? previous?.capiId ?? install?.capiId ?? familyId;
		const limits = profile ? { maxContextWindowTokens: profile.maxContextWindowTokens, maxPromptTokens: profile.maxPromptTokens, maxOutputTokens: profile.maxOutputTokens } : previous?.limits;
		this._state.families[familyId] = { displayName, capiId, autoCapable: profile?.autoCapable ?? previous?.autoCapable ?? false, ...(limits ? { limits } : {}) };
		this._persist();
	}

	private async _completeAcquisition(operation: IOperation, install: ILocalModelInstalledVersion): Promise<void> {
		const familyId = operation.familyId;
		const firstCompletion = this._state.setUp[familyId] !== install.contentId;
		const merged = this._merged().find(family => family.familyId === familyId);
		this._state.setUp[familyId] = install.contentId;
		this._rememberFamily(familyId, merged?.offer, install);
		if (firstCompletion) {
			this._reportSetup({ phase: operation.kind === 'setup' ? (install.adopted ? 'adopt' : 'complete') : 'update', outcome: 'success', registry: install.registry, autoResumed: operation.autoResumed, durationMs: this._clock.now() - operation.started, totalBytes: install.manifest.totalBytes, architecture: toTelemetryArchitecture(operation.architecture), architectureSupport: operation.architectureSupport ?? '' });
		}
		if (operation.kind !== 'setup') {
			// The record has served its purpose: a crash from here on must not resume a download.
			// (A setup keeps it through its first load, so a cancelled load stays resumable; the
			// files are in place, so resuming only verifies and loads.)
			this._state.operations = this._state.operations.filter(record => record.operationId !== operation.id);
			this._persist();
		}

		if (operation.kind === 'update') {
			await this._reloadIfActive(operation, familyId);
			await this._host.store.pruneOwnedVersions(install.registry, install.assetName, [install.version]);
			await this._refreshInstalls();
		} else if (!this._hasUsableRuntime() || operation.architectureSupport === 'unsupported') {
			this._logService.info('[LocalModel] Downloaded; not loading it without a llama.cpp that can run it');
			this._state.operations = this._state.operations.filter(record => record.operationId !== operation.id);
			this._persist();
		} else if (!this._state.active || this._state.active === familyId) {
			// The first install becomes active and starts, validating it and measuring the Auto gate.
			this._state.active = familyId;
			this._persist();
			this._setPhase(operation, 'loading');
			try {
				await this._startActive('install', operation.abort.signal);
			} catch (error) {
				if (this._operations.get(familyId) !== operation || operation.state !== 'running' || operation.abort.signal.aborted) {
					// Cancelled during the load: the paused record stays resumable.
					throw new OperationCancelled('cancelled');
				}
				if (this._state.active === familyId) {
					// Installed, but the load failed: Retry loads it; a quit does not resume it.
					this._state.operations = this._state.operations.filter(record => record.operationId !== operation.id);
					this._persist();
					throw error;
				}
				// Another model became active meanwhile: the install itself is complete.
			}
		} else {
			// A second install does not become active; its ready offer asks to load it.
			this._state.readyOffers[familyId] = install.contentId;
			this._persist();
		}
		// Completion belongs to this run only: a cancel (or a newer run) meanwhile keeps its own state.
		if (this._operations.get(familyId) !== operation || operation.state !== 'running' || operation.abort.signal.aborted) {
			throw new OperationCancelled('cancelled');
		}
		this._removeOperation(operation);
	}

	/** Update of the active family: user-initiated drain (no timeout), then reload on the new content. */
	private async _reloadIfActive(operation: IOperation, familyId: string): Promise<void> {
		const supervisor = this._supervisor.state.get();
		if (this._state.active !== familyId || supervisor.plan?.familyId !== familyId || (supervisor.server !== 'ready' && supervisor.server !== 'starting')) {
			return;
		}
		this._reloading = true;
		try {
			this._setPhase(operation, 'draining');
			this._invalidateActivation();
			await this._supervisor.stop('user');
			this._setPhase(operation, 'loading');
			await this._startActive('update', operation.abort.signal);
		} finally {
			this._reloading = false;
			this._recompute();
			this._reconcileContextSizes();
		}
	}

	private _failOperation(operation: IOperation, error: unknown): void {
		if (this._operations.get(operation.familyId) !== operation) {
			return;
		}
		const displayName = this._displayNameOf(operation.familyId) ?? operation.familyId;
		const outcome = toOperationOutcome(error, displayName);
		if (outcome.kind === 'paused') {
			this._pauseFor(operation, outcome.reason);
			return;
		}
		this._logService.warn(`[LocalModel] ${operation.kind} failed (${outcome.error.code})`);
		operation.state = 'error';
		operation.error = outcome.error;
		operation.bytesPerSecond = undefined;
		this._recompute();
	}

	private _onDownloadProgress(operation: IOperation, phase: 'downloading' | 'verifying' | 'placing', completedBytes: number, totalBytes: number, bytesPerSecond: number | undefined): void {
		if (this._operations.get(operation.familyId) !== operation || operation.state !== 'running') {
			return;
		}
		operation.phase = phase;
		operation.completedBytes = completedBytes;
		operation.totalBytes = totalBytes;
		operation.bytesPerSecond = bytesPerSecond;
		this._recompute();
	}

	private _setPhase(operation: IOperation, phase: LocalModelOperationPhase, bytes?: { readonly completedBytes: number; readonly totalBytes: number }): void {
		if (this._operations.get(operation.familyId) !== operation) {
			return;
		}
		operation.phase = phase;
		if (bytes) {
			operation.completedBytes = bytes.completedBytes;
			operation.totalBytes = bytes.totalBytes;
		} else if (phase !== 'verifying' && phase !== 'placing') {
			operation.completedBytes = undefined;
			operation.totalBytes = undefined;
		}
		operation.bytesPerSecond = undefined;
		this._recompute();
	}

	private _reportSetup(event: Partial<ILocalModelSetupEvent> & Pick<ILocalModelSetupEvent, 'phase' | 'outcome'>): void {
		reportLocalModelSetup(this._host.telemetry, {
			errorCode: '',
			registry: '',
			pausedReason: '',
			autoResumed: false,
			resumed: false,
			sasRefreshes: 0,
			durationMs: 0,
			totalBytes: 0,
			dflashSupported: this._runtime.capability ? getFlagSupport(this._runtime.capability).dflashSupported : false,
			architecture: '',
			architectureSupport: '',
			...event,
		});
	}

	// #endregion

	// #region Active model, swaps and removal

	async makeActive(familyId: string): Promise<void> {
		await this._ready();
		if (!this._setUpInstall(familyId)) {
			throw new Error('This model is not installed');
		}
		if (this._swap) {
			if (this._swap.toFamilyId === familyId) {
				// Single-flight: concurrent requests for the same swap share one operation.
				return;
			}
			throw new Error('Another model is being loaded');
		}
		const existing = this._operations.get(familyId);
		if (existing?.state === 'running') {
			throw new Error('An operation is already running for this model');
		}
		if (this._state.active === familyId) {
			this._backgroundStart('explicit');
			return;
		}
		if (existing) {
			this._dropOperation(existing);
		}
		this._beginSwap(familyId, false);
	}

	/** Starts a `swap` to `familyId`: drains the serving model (no timeout; Stop Now ends it), then loads it. `reload` reloads the active family. */
	private _beginSwap(familyId: string, reload: boolean): void {
		const operation = this._createOperation(familyId, 'swap', undefined);
		operation.reload = reload;
		let done!: () => void;
		const settled = new Promise<void>(resolve => done = resolve);
		// A load of the previous model still being prepared must not overtake the swap. One already
		// serving keeps its activation: a swap cancelled while it drains leaves it serving as before.
		if (this._start) {
			this._invalidateActivation();
		}
		this._swap = { toFamilyId: familyId, operationId: operation.id, reload, settled, done };
		this._recompute();
		if (!reload) {
			reportLocalModelServer(this._host.telemetry, { target: this._target, event: 'swapStarted', drainedStreams: this._usageOf(this._state.active ?? '').runningStreams });
		}
		void this._runSwap(operation);
	}

	async setContextSize(familyId: string, contextTokens: number): Promise<void> {
		await this._ready();
		const install = this._setUpInstall(familyId);
		if (!install) {
			throw new Error('This model is not installed');
		}
		if (!this._contextOf(familyId, install)) {
			await this._loadMetadata();
		}
		const context = this._contextOf(familyId, install);
		if (!context?.options.some(option => option.tokens === contextTokens)) {
			throw new Error('This context size is not available for this model');
		}
		this._state.contextTokens[familyId] = contextTokens;
		this._persist();
		this._recompute();
		this._reloadForContextSize(familyId);
	}

	/**
	 * Reloads the active family when what it serves differs from its selected context size, after running
	 * responses finish. During another load the change is remembered and reconciled once it settles.
	 */
	private _reloadForContextSize(familyId: string): void {
		if (this._store.isDisposed) {
			return;
		}
		if (this._isContextReloadDeferred(familyId)) {
			this._pendingContextSizes.add(familyId);
			return;
		}
		this._reloadIfContextDiffers(familyId);
	}

	/** A swap, reload, install or update in progress: a context change waits for it to settle. */
	private _isContextReloadDeferred(familyId: string): boolean {
		return !!this._swap || this._reloading || this._operations.get(familyId)?.state === 'running';
	}

	/** Once a load settles, reloads each family whose context size changed meanwhile, unless stopped or no longer active. */
	private _reconcileContextSizes(): void {
		for (const familyId of [...this._pendingContextSizes]) {
			if (this._store.isDisposed || !this._isContextReloadDeferred(familyId)) {
				this._pendingContextSizes.delete(familyId);
				this._reloadIfContextDiffers(familyId);
			}
		}
	}

	private _reloadIfContextDiffers(familyId: string): void {
		if (this._store.isDisposed || this._state.active !== familyId || this._userStopPending) {
			return;
		}
		const install = this._setUpInstall(familyId);
		const context = install ? this._contextOf(familyId, install) : undefined;
		const supervisor = this._supervisor.state.get();
		const loaded = supervisor.plan?.familyId === familyId && (supervisor.server === 'ready' || supervisor.server === 'starting');
		const preparing = this._start?.familyId === familyId && !loaded;
		if (!context || (!loaded && !preparing)) {
			return;
		}
		if (loaded && supervisor.config?.ctxSize === context.tokens * (this._serveFacts.get(familyId)?.parallel ?? 1)) {
			return;
		}
		const existing = this._operations.get(familyId);
		if (existing) {
			this._dropOperation(existing);
		}
		this._logService.info('[LocalModel] Reloading the active model for its new context size');
		this._beginSwap(familyId, true);
	}

	private async _runSwap(operation: IOperation): Promise<void> {
		const swap = this._swap;
		const started = this._clock.now();
		let drainMs = 0;
		let drainedStreams = 0;
		try {
			// 1. The swap flag already stops declaring the old model to Auto; 2. drain it (user-initiated, no
			// timeout). A cancel while it waits ends the drain and leaves the old model serving.
			const supervisor = this._supervisor.state.get();
			if (supervisor.plan && supervisor.server !== 'stopped' && supervisor.server !== 'error') {
				this._setPhase(operation, 'draining');
				const result = await this._supervisor.stop('user', operation.abort.signal);
				drainMs = result.drainMs;
				drainedStreams = result.drainedStreams;
			}
			this._throwIfCancelled(operation.abort);
			// 3. Unloaded: the new model is active and loads through admission, readiness and warm-up.
			this._state.active = operation.familyId;
			this._activeError = undefined;
			this._persist();
			this._setPhase(operation, 'loading');
			await this._startActive('swap', operation.abort.signal);
			const state = this._supervisor.state.get();
			if (!operation.reload) {
				reportLocalModelServer(this._host.telemetry, {
					target: this._target,
					event: 'swapCompleted',
					backend: state.plan?.backend ?? '',
					profile: state.plan?.profile ?? '',
					autoEligible: state.autoEligible,
					decodeTps: state.warmup?.decodeTps ?? -1,
					ttftMs: state.warmup?.ttftMs ?? -1,
					loadMs: this._clock.now() - started - drainMs,
					drainMs,
					drainedStreams,
					nCtx: state.props?.nCtx ?? -1,
					slots: state.props?.totalSlots ?? -1,
				});
			}
			this._removeOperation(operation);
		} catch (error) {
			if (operation.abort.signal.aborted || error instanceof OperationCancelled) {
				this._removeOperation(operation);
			} else {
				this._failOperation(operation, error);
			}
		} finally {
			if (this._swap === swap) {
				this._swap = undefined;
			}
			swap?.done();
			this._recompute();
			this._reconcileContextSizes();
		}
	}

	private _retrySwap(operation: IOperation): void {
		operation.abort = new AbortController();
		operation.state = 'running';
		operation.error = undefined;
		let done!: () => void;
		const settled = new Promise<void>(resolve => done = resolve);
		this._invalidateActivation();
		this._swap = { toFamilyId: operation.familyId, operationId: operation.id, reload: !!operation.reload, settled, done };
		this._recompute();
		void this._runSwap(operation);
	}

	/** Ends a cancelled swap at once: its operation goes away and its run settles on its own. */
	private _endCancelledSwap(operation: IOperation): void {
		const phase = operation.phase;
		this._removeOperation(operation);
		const swap = this._swap;
		if (swap?.operationId === operation.id) {
			this._swap = undefined;
			swap.done();
		}
		this._recompute();
		if (!operation.reload) {
			const draining = phase === 'draining';
			reportLocalModelServer(this._host.telemetry, {
				target: this._target,
				event: 'swapCancelled',
				drainMs: draining ? this._clock.now() - operation.started : -1,
				drainedStreams: draining ? this._usageOf(this._state.active ?? '').runningStreams : -1,
			});
		}
	}

	/** After the active family starts, clears the error of an operation that failed loading it so it no longer outranks the ready server. */
	private _retireFailedLoad(familyId: string): void {
		const operation = this._operations.get(familyId);
		const state = this._supervisor.state.get();
		if (operation?.state !== 'error' || operation.kind === 'remove' || (operation.kind !== 'swap' && operation.phase !== 'loading')) {
			return;
		}
		if (this._state.active !== familyId || state.server !== 'ready' || state.plan?.familyId !== familyId) {
			return;
		}
		this._logService.info(`[LocalModel] The model loaded; clearing the failed ${operation.kind} (${operation.error?.code ?? 'error'})`);
		this._removeOperation(operation);
	}

	async remove(familyId: string): Promise<void> {
		await this._ready();
		if (!this._installFor(familyId) && !this._operations.has(familyId)) {
			throw new Error('This model is not installed');
		}
		if (this._swap?.toFamilyId === familyId) {
			throw new Error('This model is being loaded');
		}
		const existing = this._operations.get(familyId);
		if (existing?.kind === 'remove' && existing.state === 'running') {
			return;
		}
		if (existing) {
			this._dropOperation(existing);
		}
		const operation = this._createOperation(familyId, 'remove', undefined);
		void this._runRemove(operation);
	}

	/** Remove: drain first when active, withdraw the row, delete only VS Code-owned files. No other model becomes active. */
	private async _runRemove(operation: IOperation): Promise<void> {
		const familyId = operation.familyId;
		try {
			if (this._state.active === familyId) {
				this._invalidateActivation();
			}
			const supervisor = this._supervisor.state.get();
			if (supervisor.plan?.familyId === familyId && supervisor.server !== 'stopped') {
				this._setPhase(operation, 'draining');
				await this._supervisor.stop('user');
			}
			if (this._state.active === familyId) {
				this._state.active = undefined;
				this._activeError = undefined;
			}
			delete this._state.setUp[familyId];
			delete this._state.readyOffers[familyId];
			delete this._state.measured[familyId];
			this._state.consent = this._state.consent.filter(id => id !== familyId);
			this._state.operations = this._state.operations.filter(record => record.familyId !== familyId);
			delete this._state.contextTokens[familyId];
			this._persist();
			// Every folder of the family: its installs (in the registry's folder or another one), and
			// the offered build's (a partial download). Only VS Code-owned files are deleted.
			const folders = new Map<string, { readonly registry: string; readonly assetName: string }>();
			for (const install of this._installs.filter(candidate => candidate.capiId.toLowerCase() === familyId)) {
				folders.set(`${install.registry}/${install.assetName}`, install);
			}
			const offer = this._merged().find(family => family.familyId === familyId)?.offer;
			if (offer) {
				folders.set(`${offer.registry}/${offer.assetName}`, offer);
			}
			for (const { registry, assetName } of folders.values()) {
				await this._host.store.removeFamily(registry, assetName);
			}
			this._serveFacts.delete(familyId);
			await this._refreshInstalls();
			await this._step('disk', () => this._refreshDisk());
			this._removeOperation(operation);
		} catch (error) {
			this._failOperation(operation, error);
		}
	}

	async start(): Promise<void> {
		await this._ready();
		if (!this._state.active) {
			throw new Error('No on-device model is active');
		}
		this._activeError = undefined;
		this._backgroundStart('explicit');
	}

	async stop(options: { readonly stopNow: boolean }): Promise<void> {
		await this._ready();
		const supervisor = this._supervisor;
		this._invalidateActivation();
		if (supervisor.isDraining) {
			if (options.stopNow) {
				supervisor.stopNow();
			}
			return;
		}
		this._userStopPending = true;
		this._recompute();
		const stopping = supervisor.stop('user').finally(() => {
			this._userStopPending = false;
			this._recompute();
		});
		if (options.stopNow) {
			supervisor.stopNow();
		}
		void stopping;
	}

	async stopPrevious(): Promise<void> {
		await this._ready();
		const supervisorError = this._supervisor!.state.get().error;
		await this._checkPreviousServers(true);
		this._recompute();
		if (supervisorError?.code === 'orphan' && this._state.active && !this._previousServer.has(this._state.active)) {
			// The active model's start was blocked by it: start again through the normal verified recovery.
			this._activeError = undefined;
			this._backgroundStart('explicit');
		}
	}

	async refreshCatalog(): Promise<void> {
		if (!this._liveConfig?.enabled) {
			return;
		}
		await this._initialization;
		const topologyChanged = await this._refreshDevice(true).catch(() => false);
		if (topologyChanged) {
			await this._step('runtime resolution', () => this._refreshRuntime());
		}
		await this._step('installs', () => this._refreshInstalls());
		await this._refreshCatalogAndDisk(true);
		this._reportEligibility();
	}

	/** Loads the active model in the background for `trigger`; failures surface in status. */
	private _backgroundStart(trigger: StartTrigger): void {
		const config = this._liveConfig;
		if (!config?.enabled || !this._isSupportedDevice() || !this._state.active || this._swap || this._userStopPending) {
			return;
		}
		if ((trigger === 'auto' || trigger === 'useInAuto') && (!config.useInAuto || !config.accountGate)) {
			return;
		}
		this._startActive(trigger).catch(error => this._logService.info(`[LocalModel] Background start (${trigger}) did not complete (${errorCodeForLog(error)})`));
	}

	// #endregion

	// #region Sessions, rows and turns

	setSessionDirectFamily(sessionId: string, familyId: string | undefined): void {
		if (familyId) {
			this._boundSessions.set(sessionId, familyId);
		} else {
			this._boundSessions.delete(sessionId);
		}
		this._recompute();
	}

	contributeSessionConfig(): ILocalModelSessionConfigContribution {
		return buildLocalModelSessionConfig(this.getModelRows());
	}

	getModelRows(): readonly ILocalModelModelRow[] {
		if (!this._liveConfig?.enabled || !this._isSupportedDevice()) {
			return [];
		}
		const rows: ILocalModelModelRow[] = [];
		const familyIds = new Set(this._installs.map(install => install.capiId.toLowerCase()));
		const supervisor = this._supervisor.state.get();
		for (const familyId of familyIds) {
			const install = this._setUpInstall(familyId);
			if (!install) {
				continue;
			}
			const measured = this._state.measured[familyId];
			const facts = this._serveFacts.get(familyId);
			const context = this._contextOf(familyId, install);
			// What serves now, else the size the next load uses (the user's selection), else what last served.
			const serving = supervisor.plan?.familyId === familyId && supervisor.plan.contentId === install.contentId && supervisor.server === 'ready' ? supervisor.props : undefined;
			const slots = facts?.parallel ?? 1;
			const size = serving
				?? (context ? { nCtx: context.tokens * slots, totalSlots: slots } : undefined)
				?? (measured?.contentId === install.contentId ? measured : undefined)
				?? { nCtx: facts?.ctxSize ?? install.manifest.serveOptions.ctxSize, totalSlots: slots };
			const limits = computeDirectRowLimits(size.nCtx, size.totalSlots, this._state.families[familyId]?.limits);
			const thinking = this._thinkingOf(familyId, install);
			rows.push({
				id: install.assetName,
				name: this._displayNameOf(familyId) ?? install.assetName,
				familyId,
				contentId: install.contentId,
				active: this._state.active === familyId,
				...(limits ? { maxContextWindow: limits.maxContextWindowTokens, maxPromptTokens: limits.maxPromptTokens, maxOutputTokens: limits.maxOutputTokens } : {}),
				...(thinking ? { thinking } : {}),
			});
		}
		return rows.sort((a, b) => a.id.localeCompare(b.id));
	}

	onAutoSessionStarted(): void {
		// A background load; this turn goes to the cloud.
		this._backgroundStart('auto');
	}

	onAccountChanged(): void {
		this._accountGeneration++;
		void this._refreshRouterEnv();
		this._recompute();
	}

	beginTurn(sessionId: string): number {
		// A turn this replaces releases its hold.
		const held = !!this._ledger.getHold(sessionId);
		const generation = this._ledger.beginTurn(sessionId);
		if (held) {
			this._recompute();
		}
		return generation;
	}

	endTurn(sessionId: string, generation: number): ILocalTurnExecution | undefined {
		const held = !!this._ledger.getHold(sessionId);
		const execution = this._ledger.endTurn(sessionId, generation);
		if (held && !this._ledger.getHold(sessionId)) {
			this._recompute();
		}
		return execution;
	}

	// #endregion

	// #region Serving: IServingAccess host and launch plans

	private _gates(): ILocalModelLiveGates {
		const config = this._liveConfig;
		// Nothing on-device serves on a device on-device models aren't offered for.
		const usable = !this._store.isDisposed && !!config?.enabled && this._isSupportedDevice();
		return { enabled: usable, accountGate: usable && !!config?.accountGate, useInAuto: usable && !!config?.useInAuto };
	}

	private _activeSnapshot(): IServingSnapshot | undefined {
		const familyId = this._state.active;
		if (this._store.isDisposed || !familyId) {
			return undefined;
		}
		const install = this._setUpInstall(familyId);
		if (!install) {
			return undefined;
		}
		const state = this._supervisor.state.get();
		const serving = state.plan?.familyId === familyId;
		const identity: IServingIdentity = state.identity?.familyId === familyId ? state.identity : { familyId, contentId: install.contentId, capiId: this._capiIdOf(familyId, install), alias: install.assetName, servingGeneration: 0 };
		const ready = serving && state.server === 'ready';
		const thinking = this._thinkingOf(familyId, install);
		return {
			identity,
			displayName: this._displayNameOf(familyId) ?? install.assetName,
			server: serving ? state.server : 'stopped',
			autoEligible: ready && state.autoEligible,
			swapInProgress: !!this._swap || this._reloading || this._userStopPending || !!state.drain,
			...(ready && state.endpoint ? { endpoint: state.endpoint } : {}),
			// Also while it drains: the turns that hold it still use its slots.
			...(serving && state.props && (ready || state.drain) ? { props: state.props } : {}),
			limits: this._state.families[familyId]?.limits ?? { maxContextWindowTokens: Number.MAX_SAFE_INTEGER, maxPromptTokens: Number.MAX_SAFE_INTEGER, maxOutputTokens: Number.MAX_SAFE_INTEGER },
			...(thinking ? { thinking } : {}),
		};
	}

	private _capiIdOf(familyId: string, install: ILocalModelInstalledVersion): string {
		return this._state.families[familyId]?.capiId ?? install.capiId;
	}

	/**
	 * A stream lease for a request. A request of an open turn makes the turn hold the generation
	 * ({@link TurnLedger}), so its requests are still admitted while a swap, reload or stop waits for it.
	 */
	private _acquireLease(identity: IServingIdentity, sessionId: string | undefined): IServingLease | undefined {
		const turnHold = this._ledger.getHold(sessionId);
		const held = turnHold?.servingGeneration === identity.servingGeneration && this._supervisor.admitsHold(turnHold) ? turnHold : undefined;
		if (!held && (this._swap || this._reloading || this._userStopPending)) {
			return undefined;
		}
		const newHold = !held && sessionId !== undefined && this._ledger.hasOpenTurn(sessionId) ? this._supervisor.acquireHold(identity) : undefined;
		const lease = this._supervisor.acquireLease(identity, held ?? newHold);
		if (!lease) {
			newHold?.dispose();
			return undefined;
		}
		if (newHold && sessionId !== undefined) {
			this._ledger.setHold(sessionId, newHold);
		}
		this._recompute();
		return {
			identity: lease.identity,
			dispose: () => {
				lease.dispose();
				this._recompute();
			},
		};
	}

	/** See {@link IServingAccess.getHeldServing}: the active model as the requests of a turn holding it see it, also while it drains. */
	private _heldServing(sessionId: string | undefined): IServingSnapshot | undefined {
		const hold = this._ledger.getHold(sessionId);
		if (!hold || !this._supervisor.admitsHold(hold)) {
			return undefined;
		}
		const active = this._activeSnapshot();
		const state = this._supervisor.state.get();
		if (!active || active.identity.servingGeneration !== hold.servingGeneration || !state.endpoint || !state.props) {
			return undefined;
		}
		return { ...active, server: 'ready', swapInProgress: false, endpoint: state.endpoint, props: state.props };
	}

	/** Starts the active family for a direct request while it is unloaded. Never swaps. */
	private async _startForDirect(familyId: string): Promise<void> {
		const displayName = this._displayNameOf(familyId);
		if (this._state.active !== familyId || this._swap || this._reloading || this._userStopPending || this._supervisor.isDraining) {
			throw notActiveError(displayName);
		}
		if (this._supervisor.state.get().server === 'stopping') {
			// An idle unload is finishing; load again afterwards.
			await this._supervisor.stop('idle');
		}
		await this._startActive('direct');
	}

	private _findFamilyByAlias(alias: string): IDirectFamilyLookup | undefined {
		if (this._store.isDisposed) {
			return undefined;
		}
		const wanted = alias.toLowerCase();
		for (const familyId of new Set(this._installs.map(install => install.capiId.toLowerCase()))) {
			const install = this._setUpInstall(familyId);
			if (!install || install.assetName.toLowerCase() !== wanted) {
				continue;
			}
			const state = this._state.active === familyId ? 'active' : this._swap?.toFamilyId === familyId ? 'incoming' : 'inactive';
			return { familyId, displayName: this._displayNameOf(familyId) ?? install.assetName, state };
		}
		return undefined;
	}

	/**
	 * Loads the active model (single-flight per family and activation). Nothing starts if the activation
	 * or `cancellation` is superseded meanwhile. Rejects with a {@link LocalModelServingError}.
	 */
	private _startActive(trigger: StartTrigger, cancellation?: AbortSignal): Promise<void> {
		const familyId = this._state.active;
		const supervisor = this._supervisor;
		if (!familyId) {
			return Promise.reject(notActiveError(undefined));
		}
		const activation = this._activation.signal;
		if (this._start?.familyId === familyId && this._start.activation === activation) {
			return this._start.promise;
		}
		const superseded = () => activation.aborted || !!cancellation?.aborted;
		const promise = (async () => {
			this._activeError = undefined;
			this._previousServer.delete(familyId);
			this._recompute();
			let plan: IServerLaunchPlan;
			try {
				if (!this._isSupportedDevice()) {
					// The one boundary every load passes (swaps, Auto, direct requests, Retry): nothing loads where on-device models aren't offered.
					throw new LocalModelServingError(DEVICE_UNSUPPORTED_CODE, deviceUnsupportedMessage(this._displayNameOf(familyId) ?? familyId), []);
				}
				// Every load (Retry included) resolves the setting's llama-server again, a cache hit without a probe while it is
				// unchanged: a link an upgrade retargeted, a build repaired since it failed, or one just set up is used now.
				await this._step('runtime resolution', () => this._refreshRuntime());
				this._recompute();
				plan = await this._buildLaunchPlan(familyId, cancellation ? AbortSignal.any([activation, cancellation]) : activation);
			} catch (error) {
				if (superseded()) {
					throw notActiveError(this._displayNameOf(familyId));
				}
				const servingError = error instanceof LocalModelServingError ? error : new LocalModelServingError('startFailed', localize('localModel.startFailed', "{0} couldn't start. Select Retry to try again.", this._displayNameOf(familyId) ?? familyId));
				this._activeError = { code: servingError.code, message: servingError.message, actions: servingError.actions ?? getServerErrorActions(servingError.code) };
				throw servingError;
			}
			if (superseded() || this._state.active !== familyId || this._setUpInstall(familyId)?.contentId !== plan.contentId || !this._isSupportedDevice()) {
				this._logService.info(`[LocalModel] A pending load (${trigger}) was superseded; not starting it`);
				throw notActiveError(this._displayNameOf(familyId));
			}
			this._logService.info(`[LocalModel] Loading the active model (${trigger})`);
			await supervisor.start(plan);
			this._retireFailedLoad(familyId);
		})();
		const entry = { familyId, activation, promise };
		this._start = entry;
		const clear = () => {
			if (this._start === entry) {
				this._start = undefined;
			}
			this._recompute();
		};
		promise.then(clear, clear);
		return promise;
	}

	/** GGUF header facts per file path, once read. */
	private readonly _ggufMetadata = new Map<string, IGgufModelMetadata>();
	private readonly _ggufMetadataReads = new Map<string, Promise<IGgufModelMetadata | undefined>>();

	/** Persists that speculative decoding crashed this llama-server with this content: later starts skip it. */
	private _recordSpeculativeUnsupported(key: string): void {
		if (!SPECULATIVE_KEY_PATTERN.test(key) || this._state.speculativeUnsupported.includes(key)) {
			return;
		}
		this._state.speculativeUnsupported = [...this._state.speculativeUnsupported, key].slice(-SPECULATIVE_UNSUPPORTED_MAX);
		this._persist();
		this._recompute();
	}

	private async _buildLaunchPlan(familyId: string, activation: AbortSignal): Promise<IServerLaunchPlan> {
		const host = this._host;
		const install = this._setUpInstall(familyId);
		const displayName = this._displayNameOf(familyId) ?? install?.assetName ?? familyId;
		if (!install) {
			throw notActiveError(displayName);
		}
		const runtime = this._runtime;
		const capability = runtime.capability;
		if (!capability) {
			if (runtime.error) {
				throw new LocalModelServingError(runtime.error.code, runtime.error.message, runtime.error.actions);
			}
			const missing = createLlamaRuntimeMissingError(displayName);
			throw new LocalModelServingError(missing.code, missing.message, missing.actions);
		}
		const preset = await this._readPreset(install);
		const support = getFlagSupport(capability);
		const { primary, draft } = this._modelFilesOf(install, preset.draftModel);
		if (!primary) {
			throw new LocalModelServingError('startFailed', localize('localModel.noPrimary', "{0} couldn't start because its model file is missing. Set it up again.", displayName));
		}
		const hasDraft = !!draft && support.dflashSupported && support.flags.has('--device-draft');
		const modelPath = primary.filePath;
		const metadata = await this._readMetadata(modelPath);
		if (!metadata) {
			throw new LocalModelServingError('startFailed', localize('localModel.invalidGguf', "{0} couldn't start because its model file can't be read.", displayName));
		}
		const parallel = this._parallelOf(install, preset);
		const facts: IServeFacts = { contentId: install.contentId, ctxSize: this._ctxSizeOf(install, preset), parallel, ubatch: presetUbatchTokens(preset), draftModel: preset.draftModel };
		// A DFlash configuration that crashed this exact build with this content before is skipped directly.
		const speculativeKey = `${getLlamaServerKey(capability)}:${install.contentId}`;
		const speculative = hasDraft && !this._state.speculativeUnsupported.includes(speculativeKey);
		const usedDraft = speculative && draft ? { bytes: draft.bytes, metadata: await this._readMetadata(draft.filePath) } : undefined;
		// The selected context size (per slot); the preset's own size is only its upper bound.
		const ctxSize = this._computeContext(familyId, facts, primary, metadata, usedDraft).tokens * parallel;
		const footprintAt = (ctx: number, withDraft = speculative) => estimateServingFootprint({ primaryBytes: primary.bytes, primary: metadata, draft: withDraft ? usedDraft : undefined, parallel, ubatchTokens: facts.ubatch }, ctx);
		const realPath = capability.realPath;
		const devices = await host.runtime.listDevices(realPath);
		if (!devices) {
			throw new LocalModelServingError('gpuRuntimeMissing', createLlamaRuntimeError({ code: 'gpuRuntimeMissing' }, {}).message);
		}
		const adapters = this._stageA?.adapters ?? [];
		const candidates = devices.map(device => ({ ...device, unifiedMemory: isUnifiedMemoryDevice(device, adapters) })).sort((a, b) => b.totalBytes - a.totalBytes);
		let chosen: { readonly device: (typeof candidates)[number]; readonly profile: NonNullable<ReturnType<typeof chooseServingProfile>> } | undefined;
		for (const device of candidates) {
			const profile = chooseServingProfile({
				capacityBytes: device.totalBytes,
				systemMemoryBytes: host.systemMemoryBytes,
				systemMemoryCountedAsGpuBytes: device.unifiedMemory ? device.totalBytes : 0,
				ctxSize,
				footprintAt: ctx => footprintAt(ctx),
				requiredBytes: footprintAt(ctxSize),
			});
			if (profile) {
				chosen = { device, profile };
				break;
			}
		}
		if (!chosen) {
			const capacity = candidates[0]?.totalBytes ?? 0;
			throw new LocalModelServingError('insufficientMemory', createLocalModelAcquisitionError('insufficientMemory', displayName, [formatBytes(capacity), formatBytes(footprintAt(ctxSize))]).message);
		}
		const { device, profile } = chosen;
		const flashAttnEntry = preset.entries.find(entry => entry.key === 'flash-attn')?.value;
		const presetFlashAttn = flashAttnEntry === 'on' || flashAttnEntry === 'off' || flashAttnEntry === 'auto' ? flashAttnEntry : undefined;
		// A preset that turns checkpoints off would make a model with recurrent layers reprocess the whole prompt
		// every turn. Each checkpoint keeps every slot's recurrent state in system memory: as many as it can spare.
		const checkpointBytes = hasRecurrentLayers(metadata) && preset.entries.find(entry => entry.key === 'ctx-checkpoints')?.value === '0'
			? estimateContextMemory(metadata, ctxSize, { parallel, ubatchTokens: facts.ubatch }).recurrentBytes
			: 0;
		let ctxCheckpoints = checkpointBytes ? RECURRENT_MODEL_CTX_CHECKPOINTS : undefined;
		const fitCheckpoints = (spareSystemBytes: number) => {
			ctxCheckpoints = Math.min(RECURRENT_MODEL_CTX_CHECKPOINTS, Math.floor(spareSystemBytes / checkpointBytes));
			if (ctxCheckpoints < RECURRENT_MODEL_CTX_CHECKPOINTS) {
				this._logService.info(`[LocalModel] Keeping ${ctxCheckpoints} context checkpoint(s) instead of ${RECURRENT_MODEL_CTX_CHECKPOINTS}: not enough free system memory`);
			}
		};
		const architecture = sanitizeLlamaArchitecture(metadata.architecture);
		return {
			familyId,
			contentId: install.contentId,
			capiId: this._capiIdOf(familyId, install),
			alias: install.assetName,
			displayName,
			binaryPath: realPath,
			versionDir: install.versionDir,
			familyDir: install.familyDir,
			modelPath,
			hasDraft,
			parallel,
			profile: profile.profile,
			ctxReduced: profile.ctxReduced,
			backend: device.backend,
			...(runtime.runtime.version ? { runtimeVersion: runtime.runtime.version } : {}),
			...(architecture ? { architecture } : {}),
			initialConfig: { flashAttn: presetFlashAttn, speculative, ctxSize: profile.ctxSize },
			onSpeculativeUnsupported: () => this._recordSpeculativeUnsupported(speculativeKey),
			buildArgs: config => buildLlamaPresetArgs(preset, support, {
				...profile.overrides,
				...(config.flashAttn && config.flashAttn !== presetFlashAttn ? { flashAttn: config.flashAttn } : {}),
				...(config.speculative ? {} : { dropSpeculative: true }),
				...(ctxCheckpoints !== undefined ? { ctxCheckpoints: String(ctxCheckpoints) } : {}),
			}).args,
			admit: (config, signal) => this._admit(realPath, displayName, device, profile.profile, footprintAt(config.ctxSize, config.speculative), signal, checkpointBytes ? fitCheckpoints : undefined),
			signal: activation,
		};
	}

	/**
	 * Admission right before each spawn (never cached, crash restarts included): the selected device's
	 * budget, free system memory and the GGUF footprint. A temporary shortage is `memoryBusy`. Once
	 * admitted, `onAdmitted` gets the spare system memory for buffers kept outside the GPU.
	 */
	private async _admit(realPath: string, displayName: string, selected: ICandidateDevice, profile: IServerLaunchPlan['profile'], footprintBytes: number, signal: AbortSignal, onAdmitted?: (spareSystemBytes: number) => void): Promise<ServerAdmission> {
		const host = this._host;
		if (!this._isSupportedDevice()) {
			// Also refuses the supervisor's own restarts (after a crash or with a smaller profile).
			return { admitted: false, error: { code: DEVICE_UNSUPPORTED_CODE, message: deviceUnsupportedMessage(displayName), actions: [] } };
		}
		const devices = await host.runtime.listDevices(realPath, signal);
		if (!devices) {
			return { admitted: false, error: createLlamaRuntimeError({ code: 'gpuRuntimeMissing' }, {}) };
		}
		const adapters = this._stageA?.adapters ?? [];
		const device = devices.find(candidate => candidate.name === selected.name && candidate.description === selected.description)
			?? selectCandidateDevice(devices.map(candidate => ({ ...candidate, unifiedMemory: isUnifiedMemoryDevice(candidate, adapters) })), footprintBytes, host.systemMemoryBytes)?.device;
		if (!device) {
			return { admitted: false, error: { code: 'insufficientMemory', message: localize('localModel.deviceGone', "The GPU this model was set up for is no longer available."), actions: [] } };
		}
		const input: IAdmissionInput = { profile, footprintBytes, deviceFreeBytes: device.freeBytes, systemFreeBytes: await host.freeSystemMemoryBytes(), systemMemoryBytes: host.systemMemoryBytes };
		const result = checkAdmission(input);
		if (!result.admitted) {
			return { admitted: false, error: { code: 'memoryBusy', message: localize('localModel.memoryBusy', "Not enough free GPU memory right now ({0} free, {1} needed). Close other apps and try again.", formatBytes(result.availableBytes), formatBytes(result.neededBytes)), actions: ['retry'] } };
		}
		onAdmitted?.(spareSystemMemoryAfterAdmission(input, isUnifiedMemoryDevice(device, adapters)));
		return { admitted: true, device: device.name };
	}

	private _onSupervisorState(state: IServerSupervisorState): void {
		this._serving.onServingChanged();
		const identity = state.identity;
		if (state.server === 'ready' && identity && state.loaded && this._recordedLoadGeneration !== identity.servingGeneration) {
			this._recordedLoadGeneration = identity.servingGeneration;
			this._recordLoadDuration(identity.contentId, state.loaded);
		}
		if (state.server === 'ready' && identity && state.props && identity.familyId === this._state.active) {
			const measured = this._state.measured[identity.familyId];
			if (this._state.readyOffers[identity.familyId] !== identity.contentId || measured?.contentId !== identity.contentId || measured.nCtx !== state.props.nCtx || measured.totalSlots !== state.props.totalSlots) {
				// The install reached ready: a one-time ready offer for this content.
				this._state.readyOffers[identity.familyId] = identity.contentId;
				this._state.measured[identity.familyId] = { contentId: identity.contentId, nCtx: state.props.nCtx, totalSlots: state.props.totalSlots };
				this._persist();
			}
		}
		this._recompute();
	}

	// #endregion
}

// #endregion

// #region Operation errors and messages

/** An operation failure with a ready-made user-facing error. */
class OperationError extends Error {
	constructor(readonly error: ILocalModelErrorV1) {
		super(error.code);
		this.name = 'OperationError';
	}
}

/** The operation must pause instead of failing (auth expired, disk full, network, content changed). */
class PauseRequest extends Error {
	constructor(readonly reason: LocalModelPausedReason) {
		super(reason);
		this.name = 'PauseRequest';
	}
}

function notActiveError(displayName: string | undefined): LocalModelServingError {
	return new LocalModelServingError('modelNotActive', displayName
		? localize('localModel.notActive', "{0} isn't loaded.", displayName)
		: localize('localModel.notActiveGeneric', "The on-device model isn't loaded."));
}

/** Why nothing on-device loads here: on-device models are offered on NVIDIA GPUs only. */
const DEVICE_UNSUPPORTED_CODE = 'deviceUnsupported';

function deviceUnsupportedMessage(displayName: string): string {
	return localize('localModel.deviceUnsupported', "{0} can't load: on-device models run only on NVIDIA GPUs.", displayName);
}

type OperationOutcome = { readonly kind: 'paused'; readonly reason: LocalModelPausedReason } | { readonly kind: 'error'; readonly error: ILocalModelErrorV1 };

/** Maps an acquisition, store or serving failure to a pause or a user-facing error. Pure. */
export function toOperationOutcome(error: unknown, displayName: string): OperationOutcome {
	if (error instanceof PauseRequest) {
		return { kind: 'paused', reason: error.reason };
	}
	if (error instanceof OperationError) {
		return { kind: 'error', error: error.error };
	}
	if (error instanceof LocalModelDownloadError) {
		switch (error.code) {
			case 'diskFull': return { kind: 'paused', reason: 'diskFull' };
			case 'network': return { kind: 'paused', reason: 'network' };
			default: return { kind: 'error', error: createLocalModelAcquisitionError(error.code, displayName) };
		}
	}
	if (error instanceof LocalModelCatalogError) {
		switch (error.code) {
			case 'network': return { kind: 'paused', reason: 'network' };
			case 'noChecksum': return { kind: 'error', error: createLocalModelAcquisitionError('noChecksum', displayName) };
			default: return { kind: 'error', error: createLocalModelAcquisitionError('notPublished', displayName) };
		}
	}
	if (error instanceof LocalModelStoreError) {
		return { kind: 'error', error: createLocalModelAcquisitionError(error.code === 'filesInUse' ? 'filesInUse' : 'storage', displayName) };
	}
	if (error instanceof LocalModelServingError) {
		return { kind: 'error', error: { code: error.code, message: error.message, actions: error.actions ?? getServerErrorActions(error.code) } };
	}
	return { kind: 'error', error: { code: 'setupFailed', message: localize('localModel.setupFailed', "Setting up {0} failed. Select Retry to try again.", displayName), actions: ['retry'] } };
}

// #endregion

// #region Node host

/** Inputs of {@link createNodeShimLocalModelProviderHost}. */
export interface INodeShimLocalModelProviderHostOptions {
	readonly requestService: Pick<IRequestService, 'request'>;
	readonly storage: Pick<IAgentHostStorageService, 'get' | 'set'>;
	readonly telemetry: ITelemetryService;
	readonly log: ILogService;
	/** `getCopilotHomePath(...)`: the model store lives in `<COPILOT_HOME>/azureml-models`. */
	readonly copilotHome: string;
	readonly userDataPath: string;
	readonly homeDir: string;
	/** A VS Code temp directory for probes (never a workspace). */
	readonly tempDir: string;
	readonly resolveCapiBaseUrls: () => Promise<readonly string[]>;
	readonly onDidChangeCapiAccounts: Event<void>;
	/** VS Code's version, named in the Azure ML catalog search's User-Agent. */
	readonly productVersion: string;
	/** Process environment for the probes and the server; defaults to `process.env`. */
	readonly env?: Readonly<Record<string, string | undefined>>;
	/** Runs short-lived processes (probes, OS tools); defaults to the Node runner. */
	readonly runner?: IProcessRunner;
}

/** Parses `vm_stat`: free + inactive + speculative + purgeable pages, in bytes. Pure. */
export function parseVmStatAvailableBytes(output: string): number | undefined {
	const pageSize = Number(/page size of (?<size>\d+) bytes/.exec(output)?.groups?.size);
	if (!Number.isFinite(pageSize) || pageSize <= 0) {
		return undefined;
	}
	const pages = (label: string) => Number(new RegExp(`^Pages ${label}:\\s+(?<pages>\\d+)\\.`, 'm').exec(output)?.groups?.pages ?? 0);
	return (pages('free') + pages('inactive') + pages('speculative') + pages('purgeable')) * pageSize;
}

/** `os.freemem()`; on macOS the larger of it and the `vm_stat`-derived available memory. Never cached. */
export async function readFreeSystemMemory(runner: IProcessRunner, platform: NodeJS.Platform): Promise<number> {
	const free = os.freemem();
	if (platform !== 'darwin') {
		return free;
	}
	const result = await runner.run('/usr/bin/vm_stat', [], { timeoutMs: 5_000, maxOutputBytes: 16 * 1024 });
	return Math.max(free, result.exitCode === 0 ? parseVmStatAvailableBytes(result.stdout) ?? 0 : 0);
}

async function readSmallTextFile(filePath: string, maxBytes: number): Promise<string | undefined> {
	try {
		const stat = await fs.promises.stat(filePath);
		return stat.isFile() && stat.size <= maxBytes ? await fs.promises.readFile(filePath, 'utf8') : undefined;
	} catch {
		return undefined;
	}
}

/** The real dependencies of {@link ShimLocalModelProvider} in the local Agent Host. */
export function createNodeShimLocalModelProviderHost(options: INodeShimLocalModelProviderHostOptions): IShimLocalModelProviderHost {
	const platform = process.platform;
	const env = options.env ?? process.env;
	const runner = options.runner ?? new NodeProcessRunner();
	const http = new RequestServiceHttpClient(options.requestService);
	const { storage, telemetry, log } = options;
	return {
		platform,
		arch: process.arch,
		clock: systemLocalModelClock,
		storage,
		telemetry,
		systemMemoryBytes: os.totalmem(),
		freeSystemMemoryBytes: () => readFreeSystemMemory(runner, platform),
		createCatalog: () => new ModelCatalog({ http, storage, log, telemetry, productVersion: options.productVersion }),
		store: new LocalModelStore({ copilotHome: options.copilotHome, storage, log }),
		downloader: new ModelDownloader({ http, log, telemetry }),
		runtime: new LlamaCppRuntime({ storage, log, runner, platform, env, tempDir: path.join(options.tempDir, 'vscode-local-model-probe') }),
		gpuProbe: new GpuMemoryProbe(storage, runner, undefined, undefined, undefined, log),
		createSupervisor: supervisorLog => new ServerSupervisor({
			spawner: new NodeLongLivedProcessSpawner(platform),
			processControl: new NodeProcessControl(runner, platform),
			fetch: (input, init) => globalThis.fetch(input, init),
			clock: systemLocalModelClock,
			log: supervisorLog,
			telemetry,
			modelsDir: path.join(options.copilotHome, AZURE_ML_MODELS_DIR_NAME),
			platform,
			target: `${platform}-${process.arch}`,
			homeDir: options.homeDir,
			env,
		}),
		readGgufMetadata: readGgufModelMetadataFromFile,
		readGgufArchitecture: readGgufArchitectureFromFile,
		readTextFile: readSmallTextFile,
		resolveCapiBaseUrls: options.resolveCapiBaseUrls,
		onDidChangeCapiAccounts: options.onDidChangeCapiAccounts,
		loopbackFetch: (input, init) => globalThis.fetch(input, init),
		generateId: generateUuid,
	};
}

// #endregion
