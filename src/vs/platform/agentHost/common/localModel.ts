/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Provider-neutral contract for on-device ("local") models.
 *
 * The local Agent Host publishes {@link ILocalModelStatusV1} as the root
 * transient value {@link LOCAL_MODEL_STATUS_KEY}; clients send
 * {@link ILocalModelRequest}s through the root config key
 * {@link LOCAL_MODEL_REQUEST_KEY}. Both ride namespaced root config values, not
 * AHP proper, so hosts that do not implement the feature publish nothing and
 * clients show nothing. The only provider is the Copilot request-handler
 * bridge, but the projection stays provider-neutral: nothing here names
 * Azure ML, llama.cpp internals or the shim.
 *
 * The values crossing the wire are read back through the validating reader in
 * `common/meta/localModelStatus.ts`; never cast them.
 */

import { localize } from '../../../nls.js';

// #region Settings, keys and identifiers

/** Opt-in for on-device models. Startup key: toggling it restarts the Copilot client. */
export const LocalModelEnabledSettingId = 'chat.copilot.localModel.enabled';

/** Whether Auto may route turns to the active on-device model. Read live at dispatch. Off unless the user turns it on. */
export const LocalModelUseInAutoSettingId = 'chat.copilot.localModel.useInAuto';

/**
 * The agreed safety disclosure for on-device models, the same text the
 * Copilot CLI and app show for local model auto routing. Shown wherever the
 * user opts in to on-device models or to Auto using them.
 */
export function getLocalModelSafetyDisclosure(): string {
	return localize('localModel.safetyDisclosure', "Local models may not use the same safety filters as GitHub Copilot-provided models and may be more susceptible to malicious instructions, especially when actions are automatically approved.");
}

/** Absolute path to an approved custom `llama-server`. Explicit: probe failures are shown, never bypassed. */
export const LocalModelLlamaServerPathSettingId = 'chat.copilot.localModel.llamaServerPath';

/**
 * Root config key the client writes an {@link ILocalModelRequest} to. The host
 * claims the request's nonce and clears the key before acting on it, so a
 * repeated identical gesture still lands.
 *
 * The settings themselves are forwarded as the Copilot-owned root config keys
 * `CopilotCliConfigKey.LocalModel*` (see `copilotCliConfig.ts`), including the
 * workbench-computed `localModelAccountGate`.
 */
export const LOCAL_MODEL_REQUEST_KEY = 'vscode.localModel.request';

/** Root transient value carrying the host's {@link ILocalModelStatusV1}. Absent when the host has no provider. */
export const LOCAL_MODEL_STATUS_KEY = 'vscode.localModel.status';

/**
 * Namespaced `_meta` key used on turn usage ({@link ILocalTurnExecution}) and on
 * each direct-selection model row ({@link ILocalModelRowMetaV1}).
 */
export const LOCAL_MODEL_META_KEY = 'vscode.localModel';

/**
 * Name of the sentinel BYOK provider whose rows select an on-device model
 * directly. Generic session code strips entries with this provider name from
 * the additive BYOK merge so the provider's rows stay replaceable.
 */
export const LOCAL_MODEL_SENTINEL_PROVIDER_NAME = 'vscode-on-device';

/**
 * Placeholder for the GPU memory figure in the setting description. Replaced
 * by the real requirement once the catalog's smallest `recommendedVramBytes` is
 * known for the shipping model.
 */
export const LOCAL_MODEL_MIN_GPU_MEMORY_GB_PLACEHOLDER = 64;

// #endregion

// #region Status projection

export const localModelDeviceConfidences = ['measured', 'estimated', 'unknown'] as const;
export type LocalModelDeviceConfidence = typeof localModelDeviceConfidences[number];

/**
 * The GPU vendor of the device the host judges models against, from its PCI
 * vendor id (`nvidia` 0x10DE, `amd` 0x1002/0x1022, `intel` 0x8086, `apple`
 * 0x106B, `qualcomm`; anything else `other`).
 */
export const localModelDeviceVendors = ['nvidia', 'amd', 'intel', 'apple', 'qualcomm', 'other'] as const;
export type LocalModelDeviceVendor = typeof localModelDeviceVendors[number];

/**
 * Where the resolved `llama-server` came from: the setting, the
 * `LLAMACPP_SERVER_PATH` environment variable, `PATH`, or a known install
 * location of a package manager (`packageManager`: winget, Homebrew, apt).
 * VS Code never installs llama.cpp itself.
 */
export const localModelRuntimeSources = ['setting', 'env', 'path', 'packageManager', 'none'] as const;
export type LocalModelRuntimeSource = typeof localModelRuntimeSources[number];

/**
 * Why the host may execute the resolved binary: the user approved it (or named
 * it in `chat.copilot.localModel.llamaServerPath`), approval is still pending,
 * or there is no binary.
 */
export const localModelRuntimeTrusts = ['userApproved', 'pendingApproval', 'none'] as const;
export type LocalModelRuntimeTrust = typeof localModelRuntimeTrusts[number];

export const localModelCatalogStates = ['loading', 'ready', 'empty', 'unavailable'] as const;
export type LocalModelCatalogState = typeof localModelCatalogStates[number];

/** The state of the Azure ML registry query behind the catalog. */
export const localModelPublicRegistryStates = ['loading', 'ready', 'empty', 'unavailable'] as const;
export type LocalModelPublicRegistryState = typeof localModelPublicRegistryStates[number];

export const localModelFitClasses = ['full', 'near'] as const;
export type LocalModelFitClass = typeof localModelFitClasses[number];

export const localModelServerStates = ['stopped', 'starting', 'ready', 'stopping', 'error'] as const;
export type LocalModelServerState = typeof localModelServerStates[number];

export const localModelServingProfiles = ['full-gpu', 'near-fit'] as const;
export type LocalModelServingProfile = typeof localModelServingProfiles[number];

export const localModelOperationKinds = ['setup', 'update', 'remove', 'swap'] as const;
export type LocalModelOperationKind = typeof localModelOperationKinds[number];

export const localModelOperationStates = ['running', 'paused', 'error'] as const;
export type LocalModelOperationState = typeof localModelOperationStates[number];

/** `consentChanged`: the resolved content or consent scope changed while paused, so the user must agree again. */
export const localModelPausedReasons = ['user', 'quit', 'diskFull', 'network', 'consentChanged'] as const;
export type LocalModelPausedReason = typeof localModelPausedReasons[number];

export const localModelOperationPhases = ['resolving', 'checkingDevice', 'downloading', 'verifying', 'placing', 'draining', 'loading'] as const;
export type LocalModelOperationPhase = typeof localModelOperationPhases[number];

/**
 * `getLlamaCpp` opens the page that tells how to get a llama.cpp build
 * (`runtimeNotFound`, `runtimeTooOld`, `runtimeUnsupportedModel`); `openSettings`
 * opens `chat.copilot.localModel.llamaServerPath`.
 */
export const localModelErrorActions = ['retry', 'stopPrevious', 'openSettings', 'getLlamaCpp'] as const;
export type LocalModelErrorAction = typeof localModelErrorActions[number];

/**
 * A user-facing failure. `message` is already localized by the host. `code`
 * stays an open string so a newer host's code still reaches older clients;
 * clients fall back to the host-provided message for codes they do not know.
 */
export interface ILocalModelErrorV1 {
	readonly code: string;
	readonly message: string;
	readonly actions: readonly LocalModelErrorAction[];
}

/** Static capability of the selected GPU device. Dynamic availability is never published. */
export interface ILocalModelDeviceV1 {
	readonly id?: string;
	readonly capacityBytes?: number;
	readonly confidence: LocalModelDeviceConfidence;
	/**
	 * The vendor of the GPU the host's device probe selected; absent when the
	 * probe found none. The host lists families only for an `nvidia` device,
	 * so on any other device the status lists nothing.
	 */
	readonly vendor?: LocalModelDeviceVendor;
}

/** The resolved llama.cpp runtime. VS Code never installs it: it detects one and asks the user to approve it. */
export interface ILocalModelRuntimeV1 {
	readonly source: LocalModelRuntimeSource;
	/**
	 * Version string as reported by `llama-server --version`. Absent for a
	 * `pendingApproval` binary: VS Code does not run it before the user
	 * approves it.
	 */
	readonly version?: string;
	/** GPU backend the probe found (for example `vulkan` or `metal`). */
	readonly backend?: string;
	readonly trust: LocalModelRuntimeTrust;
	/**
	 * Absolute (real) path of a pre-existing binary awaiting approval. Set only
	 * when {@link trust} is `pendingApproval`; feeds the consent text
	 * "Use llama.cpp found at {path} ({version})", or "Use llama.cpp found at
	 * {path}?" when there is no version.
	 */
	readonly path?: string;
	/**
	 * Runtime digest (lowercase hex SHA-256) of the install awaiting approval,
	 * computed by the host over the sorted `(relative path, size, sha256)` of
	 * the executable and every shared library it can load from its install
	 * (Windows: `*.dll` beside it; macOS: `*.dylib` beside it and in `../lib`;
	 * Linux: `*.so`/`*.so.*` beside it and in `../lib`). Set only with
	 * {@link path}; absent when the install cannot be verified. The consent
	 * scope includes it, so an approval covers exactly these files; the dialog
	 * shows a short form.
	 */
	readonly sha256?: string;
	/** Total bytes covered by {@link sha256} (the executable plus its shared libraries). Set only with {@link sha256}. */
	readonly size?: number;
}

export interface ILocalModelCatalogV1 {
	readonly state: LocalModelCatalogState;
	readonly registries: {
		readonly azureml: LocalModelPublicRegistryState;
	};
}

/** What can be downloaded now from the Azure ML registry. */
export interface ILocalModelOfferV1 {
	readonly fit: LocalModelFitClass;
	readonly requiredGpuBytes: number;
	readonly downloadBytes: number;
	readonly peakDiskBytes: number;
	readonly licenseName?: string;
	/** Public `https:` URL only. */
	readonly licenseUrl?: string;
}

/**
 * A completed install: files verified, manifest recorded, and servable by the
 * host. Files found on disk that have not been set up yet are reported through
 * {@link ILocalModelFamilyV1.entry} instead, so "Found on this device · Set Up"
 * (`requiresSetup`) never reads as `installed`.
 */
export interface ILocalModelInstallV1 {
	readonly contentId: string;
	readonly adopted: boolean;
	readonly owned: boolean;
	/**
	 * Selection id of this family's direct-selection model row:
	 * `vscode-on-device/<alias>`, where the alias is the `llama-server`
	 * `--alias` (the Azure ML asset name). Clients match the agent-host model
	 * row's `id` against it; never build these strings themselves.
	 */
	readonly modelId: string;
	/** A newer build of the same model. */
	readonly update?: { readonly contentId: string; readonly downloadBytes: number };
}

/** At most one operation per family. */
export interface ILocalModelOperationV1 {
	readonly id: string;
	readonly kind: LocalModelOperationKind;
	readonly state: LocalModelOperationState;
	readonly pausedReason?: LocalModelPausedReason;
	readonly resumeOnStartup: boolean;
	readonly phase?: LocalModelOperationPhase;
	readonly completedBytes?: number;
	readonly totalBytes?: number;
	readonly bytesPerSecond?: number;
	readonly error?: ILocalModelErrorV1;
}

/**
 * What is already on this device for a family that is not installed yet; drives
 * the setup entry paths and the consent text. Setup only acquires the model:
 * it never needs llama.cpp, which is needed (and asked for) only to load it.
 */
export interface ILocalModelEntryV1 {
	/** The model files are already on this device (VS Code-owned, or adoptable from the Copilot CLI/app). */
	readonly modelFilesPresent: boolean;
	/**
	 * Disk preflight for setup, measured when the status was published.
	 * `volume` is the display name of the target volume. The host re-checks
	 * before acting.
	 */
	readonly disk?: { readonly volume: string; readonly availableBytes: number; readonly requiredBytes: number };
}

/** One selectable context size of an installed family. */
export interface ILocalModelContextOptionV1 {
	readonly tokens: number;
	/** Estimated GPU memory of the whole model served at this size (weights + draft + KV + fixed buffers). */
	readonly gpuBytes: number;
}

/** Present on installed families. */
export interface ILocalModelContextV1 {
	/** The selected size; the next/current load uses it. Normally one of {@link options}. */
	readonly tokens: number;
	/** Ascending by {@link ILocalModelContextOptionV1.tokens}; a `setContextSize` request must name one of them. */
	readonly options: readonly ILocalModelContextOptionV1[];
}

/** Present on {@link ILocalModelActiveV1} while `server === 'starting'`. */
export interface ILocalModelLoadV1 {
	/** `loading`: the server was spawned and loads the model (`/health` answers 503); `warmingUp`: it is healthy and serves the warm-up request. */
	readonly step: 'loading' | 'warmingUp';
	/** Epoch ms when this load started (host and client share the machine). */
	readonly startedAt: number;
	/** Duration of the last comparable load (same contentId, context size and device), when known. */
	readonly expectedMs?: number;
	/** Present when this attempt retries a start that failed, e.g. without the DFlash draft after speculative decoding crashed this llama.cpp build. */
	readonly retry?: LocalModelLoadRetryReason;
}

/** The steps of {@link ILocalModelLoadV1}. */
export const localModelLoadSteps = ['loading', 'warmingUp'] as const;

/** Why this load attempt is a retry of a failed one. */
export const localModelLoadRetryReasons = ['withoutSpeculativeDecoding'] as const;
export type LocalModelLoadRetryReason = typeof localModelLoadRetryReasons[number];

/** Present on a family only when the device's total GPU memory can't hold it at its selected context. */
export interface ILocalModelMemoryWarningV1 {
	readonly requiredBytes: number;
	readonly capacityBytes: number;
}

/** Per-family usage accounting, used in confirmation text. */
export interface ILocalModelUsageV1 {
	/** Running responses: agent turns that used the loaded model and have not ended (also while they run a tool), plus requests of no such turn. */
	readonly runningStreams: number;
	readonly boundDirectChats: number;
	readonly liveAutoRoutes: number;
}

export interface ILocalModelFamilyV1 {
	/** `capiId`, lowercased. */
	readonly familyId: string;
	readonly capiId: string;
	/** `capiId` is a known Auto-admitted id; otherwise the family is direct-selection only. */
	readonly autoCapable: boolean;
	/** `displayName` tag (or temporary override), already sanitized by the host. */
	readonly displayName: string;
	/** Absent if not offerable (no longer fits, not in the catalog, ...). */
	readonly offer?: ILocalModelOfferV1;
	/** Present when setup has completed. Always manageable, even without an offer. */
	readonly install?: ILocalModelInstallV1;
	readonly operation?: ILocalModelOperationV1;
	/** Present while not installed: what setup would reuse from this device. */
	readonly entry?: ILocalModelEntryV1;
	/** Present on installed families: the selected context size and the selectable ones. */
	readonly context?: ILocalModelContextV1;
	/** Present only when the device's total GPU memory can't hold the family at its selected context. */
	readonly memoryWarning?: ILocalModelMemoryWarningV1;
	readonly usage: ILocalModelUsageV1;
	/** `${familyId}:${contentId}` of the last install/update that reached ready; drives the one-time ready offer. */
	readonly readyOfferId?: string;
	readonly consentGiven: boolean;
}

/** The single active model's serving state. */
export interface ILocalModelActiveV1 {
	readonly familyId: string;
	readonly contentId: string;
	readonly servingGeneration: number;
	readonly server: LocalModelServerState;
	readonly profile?: LocalModelServingProfile;
	readonly contextTokens?: number;
	/** Passed the Auto performance gate. */
	readonly autoEligible?: boolean;
	/**
	 * Present when the model's preset uses a DFlash draft: `true` when it
	 * serves with speculative decoding, `false` when this llama.cpp build
	 * crashed with it and the model serves without.
	 */
	readonly dflashSupported?: boolean;
	/**
	 * Set while a user-initiated stop/swap waits for running responses (see
	 * {@link ILocalModelUsageV1.runningStreams}): a turn that used the model
	 * keeps it until the turn ends, and its later requests are still served.
	 */
	readonly drain?: { readonly runningStreams: number };
	/** Present while {@link server} is `starting`: the load's step and its expected duration. */
	readonly load?: ILocalModelLoadV1;
	/** `familyId` being loaded next: another family while this one is still active, or this family again when it reloads (a new context size). */
	readonly swapTo?: string;
	/** Present while {@link server} is `error` (crash, owned elsewhere, orphan, memory busy, ...). */
	readonly error?: ILocalModelErrorV1;
}

/** Provider-neutral status projection. */
export interface ILocalModelStatusV1 {
	readonly schemaVersion: 1;
	readonly device: ILocalModelDeviceV1;
	readonly runtime: ILocalModelRuntimeV1;
	readonly catalog: ILocalModelCatalogV1;
	/**
	 * Offerable (fit full/near, compatible), installed, or with an operation in
	 * progress, on an NVIDIA device only ({@link ILocalModelDeviceV1.vendor}).
	 * Empty means nothing is shown.
	 */
	readonly families: readonly ILocalModelFamilyV1[];
	/** Absent when no model is active. */
	readonly active?: ILocalModelActiveV1;
	readonly useInAuto: boolean;
}

/** Readiness of one family, for the picker and context keys. */
export type LocalModelReadiness = 'preparing' | 'paused' | 'error' | 'ready' | 'installed' | 'requiresSetup';

/**
 * Derives a family's readiness, in order:
 * 1. operation running → `preparing`; paused → `paused`; error → `error`;
 * 2. installed and active, server `error` → `error` (refinement: a crashed or
 *    blocked server surfaces its {@link ILocalModelActiveV1.error});
 * 3. installed and active, server `ready` → `ready`;
 * 4. installed → `installed` (inactive, or active but idle/loading);
 * 5. offer present, or model files found on this device → `requiresSetup`.
 *
 * Returns `undefined` for a family that should not be listed.
 */
export function deriveLocalModelReadiness(family: ILocalModelFamilyV1, status: Pick<ILocalModelStatusV1, 'active'>): LocalModelReadiness | undefined {
	switch (family.operation?.state) {
		case 'running': return 'preparing';
		case 'paused': return 'paused';
		case 'error': return 'error';
	}
	if (family.install) {
		const active = status.active?.familyId === family.familyId ? status.active : undefined;
		if (active?.server === 'error') {
			return 'error';
		}
		return active?.server === 'ready' ? 'ready' : 'installed';
	}
	if (family.offer || family.entry?.modelFilesPresent) {
		return 'requiresSetup';
	}
	return undefined;
}

// #endregion

// #region Requests

/**
 * Actions a client may request. `setContextSize` selects one of the family's
 * {@link ILocalModelContextV1.options} ({@link ILocalModelRequest.contextTokens});
 * for the active loaded family it reloads right away after running responses
 * finish, reported as a `swap` operation.
 */
export const localModelActions = [
	'setUp',
	'cancel',
	'pause',
	'resume',
	'retry',
	'makeActive',
	'start',
	'stop',
	'stopNow',
	'update',
	'remove',
	'stopPrevious',
	'approveRuntime',
	'refreshCatalog',
	'setContextSize',
] as const;
export type LocalModelAction = typeof localModelActions[number];

/** Actions that must carry {@link ILocalModelRequest.familyId}. */
export const localModelFamilyActions: readonly LocalModelAction[] = ['setUp', 'makeActive', 'update', 'remove', 'setContextSize'];

/** Actions that must carry {@link ILocalModelRequest.contextTokens}. */
export const localModelContextActions: readonly LocalModelAction[] = ['setContextSize'];

/** Actions that must carry {@link ILocalModelRequest.operationId}. */
export const localModelOperationActions: readonly LocalModelAction[] = ['cancel', 'pause', 'resume', 'retry'];

/** Actions that must carry {@link ILocalModelRequest.consent}. */
export const localModelConsentActions: readonly LocalModelAction[] = ['setUp', 'approveRuntime'];

/** What the user agreed to: a model download (`setUp`), or running a detected `llama-server` (`approveRuntime`). */
export interface ILocalModelConsent {
	/**
	 * Fingerprint of the facts the consent showed, from
	 * {@link computeLocalModelConsentScope}. The host recomputes it from its own
	 * projection before acting and before an automatic resume; a mismatch pauses
	 * the operation with `consentChanged` instead of proceeding.
	 */
	readonly scope: string;
}

/** The value a client writes to {@link LOCAL_MODEL_REQUEST_KEY}. */
export interface ILocalModelRequest {
	/** Fresh per gesture; the host ignores nonces it has already seen. */
	readonly nonce: string;
	readonly action: LocalModelAction;
	readonly familyId?: string;
	readonly operationId?: string;
	readonly consent?: ILocalModelConsent;
	/** `setContextSize`: the selected {@link ILocalModelContextOptionV1.tokens}. */
	readonly contextTokens?: number;
}

const MAX_ID_LENGTH = 256;
const MAX_CONSENT_SCOPE_LENGTH = 8192;
/** Upper bound for a context size crossing the wire (16M tokens). */
export const MAX_LOCAL_MODEL_CONTEXT_TOKENS = 16 * 1024 * 1024;

function isBoundedId(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

/** A positive integer context size no larger than {@link MAX_LOCAL_MODEL_CONTEXT_TOKENS}. */
export function isLocalModelContextTokens(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= MAX_LOCAL_MODEL_CONTEXT_TOKENS;
}

function isLocalModelConsent(value: unknown): value is ILocalModelConsent {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	// Keys of older clients (`runtimeChoice`) are ignored: the scope alone says what was agreed to.
	const consent: Partial<Record<keyof ILocalModelConsent, unknown>> = value;
	return typeof consent.scope === 'string' && consent.scope.length > 0 && consent.scope.length <= MAX_CONSENT_SCOPE_LENGTH;
}

/**
 * Validates an untrusted request value, including the per-action targets:
 * family actions need `familyId`, operation actions need `operationId`,
 * consent actions need a well-formed `consent`, and `setContextSize` needs
 * `contextTokens`.
 */
export function isLocalModelRequest(value: unknown): value is ILocalModelRequest {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const request: Partial<Record<keyof ILocalModelRequest, unknown>> = value;
	const action = localModelActions.find(candidate => candidate === request.action);
	if (!isBoundedId(request.nonce) || !action) {
		return false;
	}
	if (request.familyId !== undefined && !isBoundedId(request.familyId)) {
		return false;
	}
	if (request.operationId !== undefined && !isBoundedId(request.operationId)) {
		return false;
	}
	if (request.consent !== undefined && !isLocalModelConsent(request.consent)) {
		return false;
	}
	if (request.contextTokens !== undefined && !isLocalModelContextTokens(request.contextTokens)) {
		return false;
	}
	if (localModelFamilyActions.includes(action) && request.familyId === undefined) {
		return false;
	}
	if (localModelOperationActions.includes(action) && request.operationId === undefined) {
		return false;
	}
	if (localModelContextActions.includes(action) && request.contextTokens === undefined) {
		return false;
	}
	return !localModelConsentActions.includes(action) || request.consent !== undefined;
}

/**
 * Inputs to {@link computeLocalModelConsentScope}: the family of a model
 * download consent (`setUp`), or the detected runtime of an approval
 * (`approveRuntime`).
 */
export type ILocalModelConsentScopeInput =
	| { readonly family: Pick<ILocalModelFamilyV1, 'familyId' | 'offer' | 'entry'>; readonly runtime?: undefined }
	| { readonly family?: undefined; readonly runtime: Pick<ILocalModelRuntimeV1, 'path' | 'version' | 'sha256'> };

/**
 * Fingerprints exactly what a consent shows. A model download: the offer's
 * sizes and license, and whether model files are reused. An approval of a
 * detected `llama-server`: its path, version and runtime digest, so the
 * consent covers exactly that executable and its shared libraries. Dynamic
 * values (free disk space, progress) are excluded. Pure and shared by the
 * client (when sending) and the host (when comparing), so both sides must call
 * it on the same projection. A download consent of an earlier version (which
 * also named the registry and build kind) is asked for again.
 */
export function computeLocalModelConsentScope(input: ILocalModelConsentScopeInput): string {
	const { family, runtime } = input;
	if (runtime) {
		return JSON.stringify([2, 'runtime', runtime.path ?? null, runtime.version ?? null, runtime.sha256 ?? null]);
	}
	const offer = family.offer;
	return JSON.stringify([
		3,
		'model',
		family.familyId,
		offer ? [offer.downloadBytes, offer.peakDiskBytes, offer.licenseName ?? null, offer.licenseUrl ?? null] : null,
		family.entry ? family.entry.modelFilesPresent : null,
	]);
}

// #endregion

// #region Usage and model-row metadata

/** How one turn actually executed, persisted on turn usage under {@link LOCAL_MODEL_META_KEY}. */
export const localTurnExecutions = ['local', 'fallback', 'mixed', 'unknown'] as const;
export type LocalTurnExecutionKind = typeof localTurnExecutions[number];

export interface ILocalTurnExecution {
	readonly execution: LocalTurnExecutionKind;
	/** Why the local model did not answer, e.g. `staleModel` or `slotsFull`. */
	readonly fallbackReason?: string;
	/** The cloud model that answered instead. */
	readonly fallbackModel?: string;
	/** The serving family, from the request's serving lease (never the current active model). */
	readonly familyId?: string;
}

/** `_meta[LOCAL_MODEL_META_KEY]` on a direct-selection model row. */
export interface ILocalModelRowMetaV1 {
	readonly familyId: string;
	readonly contentId: string;
	readonly active: boolean;
}

// #endregion
