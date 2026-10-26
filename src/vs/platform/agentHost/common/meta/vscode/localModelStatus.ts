/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Mutable } from '../../../../../base/common/types.js';
import {
	isLocalModelContextTokens,
	LOCAL_MODEL_META_KEY,
	localModelCatalogStates,
	localModelDeviceConfidences,
	localModelDeviceVendors,
	localModelErrorActions,
	localModelFitClasses,
	localModelLoadRetryReasons,
	localModelLoadSteps,
	localModelOperationKinds,
	localModelOperationPhases,
	localModelOperationStates,
	localModelPausedReasons,
	localModelPublicRegistryStates,
	localModelServerStates,
	localModelServingProfiles,
	type ILocalModelActiveV1,
	type ILocalModelCatalogV1,
	type ILocalModelContextOptionV1,
	type ILocalModelContextV1,
	type ILocalModelDeviceV1,
	type ILocalModelEntryV1,
	type ILocalModelErrorV1,
	type ILocalModelFamilyV1,
	type ILocalModelInstallV1,
	type ILocalModelLoadV1,
	type ILocalModelMemoryWarningV1,
	type ILocalModelOfferV1,
	type ILocalModelOperationV1,
	type ILocalModelRowMetaV1,
	type ILocalModelRuntimeV1,
	type ILocalModelStatusV1,
	type ILocalModelUsageV1,
} from '../../localModel.js';

/*
 * Validating readers for the VS Code local-model extension values: every field is checked, unknown keys are ignored,
 * malformed optional sub-objects and entries without identity are dropped, and lists are bounded.
 */

const MAX_ID_LENGTH = 256;
const MAX_DISPLAY_NAME_LENGTH = 100;
const MAX_TEXT_LENGTH = 1000;
const MAX_PATH_LENGTH = 4096;
const MAX_FAMILIES = 32;
const MAX_CONTEXT_OPTIONS = 8;

type Bag = Readonly<Record<string, unknown>>;

function asBag(value: unknown): Bag | undefined {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Bag : undefined;
}

function oneOf<T extends string>(values: readonly T[], value: unknown): T | undefined {
	return values.find(candidate => candidate === value);
}

function boundedString(value: unknown, maxLength: number): string | undefined {
	return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : undefined;
}

function id(value: unknown): string | undefined {
	return boundedString(value, MAX_ID_LENGTH);
}

function count(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function rate(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function bool(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

function httpsUrl(value: unknown): string | undefined {
	const candidate = boundedString(value, MAX_PATH_LENGTH);
	if (!candidate) {
		return undefined;
	}
	try {
		return new URL(candidate).protocol === 'https:' ? candidate : undefined;
	} catch {
		return undefined;
	}
}

function readError(value: unknown): ILocalModelErrorV1 | undefined {
	const raw = asBag(value);
	const code = id(raw?.code);
	const message = boundedString(raw?.message, MAX_TEXT_LENGTH);
	if (!raw || !code || !message) {
		return undefined;
	}
	const actions = Array.isArray(raw.actions)
		? raw.actions.map(action => oneOf(localModelErrorActions, action)).filter(action => action !== undefined)
		: [];
	return { code, message, actions: [...new Set(actions)] };
}

function readDevice(value: unknown): ILocalModelDeviceV1 {
	const raw = asBag(value);
	const device: Mutable<ILocalModelDeviceV1> = { confidence: oneOf(localModelDeviceConfidences, raw?.confidence) ?? 'unknown' };
	const deviceId = id(raw?.id);
	if (deviceId) { device.id = deviceId; }
	const capacityBytes = count(raw?.capacityBytes);
	if (capacityBytes !== undefined) { device.capacityBytes = capacityBytes; }
	const vendor = oneOf(localModelDeviceVendors, raw?.vendor);
	if (vendor) { device.vendor = vendor; }
	return device;
}

function readRuntime(value: unknown): ILocalModelRuntimeV1 {
	const raw = asBag(value);
	const runtime: Mutable<ILocalModelRuntimeV1> = {};
	const version = boundedString(raw?.version, MAX_ID_LENGTH);
	if (version) { runtime.version = version; }
	const backend = id(raw?.backend);
	if (backend) { runtime.backend = backend; }
	return runtime;
}

function readCatalog(value: unknown): ILocalModelCatalogV1 {
	const raw = asBag(value);
	const registries = asBag(raw?.registries);
	return {
		state: oneOf(localModelCatalogStates, raw?.state) ?? 'unavailable',
		registries: {
			azureml: oneOf(localModelPublicRegistryStates, registries?.azureml) ?? 'unavailable',
		},
	};
}

/** An older host's `source` and `previewBuild` (the registry it was offered from) are ignored. */
function readOffer(value: unknown): ILocalModelOfferV1 | undefined {
	const raw = asBag(value);
	const fit = oneOf(localModelFitClasses, raw?.fit);
	const requiredGpuBytes = count(raw?.requiredGpuBytes);
	const downloadBytes = count(raw?.downloadBytes);
	const peakDiskBytes = count(raw?.peakDiskBytes);
	if (!fit || requiredGpuBytes === undefined || downloadBytes === undefined || peakDiskBytes === undefined) {
		return undefined;
	}
	const offer: Mutable<ILocalModelOfferV1> = { fit, requiredGpuBytes, downloadBytes, peakDiskBytes };
	const licenseName = boundedString(raw?.licenseName, MAX_DISPLAY_NAME_LENGTH);
	if (licenseName) { offer.licenseName = licenseName; }
	const licenseUrl = httpsUrl(raw?.licenseUrl);
	if (licenseUrl) { offer.licenseUrl = licenseUrl; }
	return offer;
}

/** An older host's `channel` (the registry it takes updates from) is ignored. */
function readInstall(value: unknown): ILocalModelInstallV1 | undefined {
	const raw = asBag(value);
	const contentId = id(raw?.contentId);
	const modelId = id(raw?.modelId);
	if (!contentId || !modelId) {
		return undefined;
	}
	const install: Mutable<ILocalModelInstallV1> = { contentId, adopted: bool(raw?.adopted) ?? false, owned: bool(raw?.owned) ?? false, modelId };
	const update = asBag(raw?.update);
	const updateContentId = id(update?.contentId);
	const updateDownloadBytes = count(update?.downloadBytes);
	if (updateContentId && updateDownloadBytes !== undefined) {
		install.update = { contentId: updateContentId, downloadBytes: updateDownloadBytes };
	}
	return install;
}

function readOperation(value: unknown): ILocalModelOperationV1 | undefined {
	const raw = asBag(value);
	const operationId = id(raw?.id);
	const kind = oneOf(localModelOperationKinds, raw?.kind);
	const state = oneOf(localModelOperationStates, raw?.state);
	if (!operationId || !kind || !state) {
		return undefined;
	}
	const operation: Mutable<ILocalModelOperationV1> = { id: operationId, kind, state, resumeOnStartup: bool(raw?.resumeOnStartup) ?? false };
	const pausedReason = oneOf(localModelPausedReasons, raw?.pausedReason);
	if (pausedReason) { operation.pausedReason = pausedReason; }
	const phase = oneOf(localModelOperationPhases, raw?.phase);
	if (phase) { operation.phase = phase; }
	const completedBytes = count(raw?.completedBytes);
	if (completedBytes !== undefined) { operation.completedBytes = completedBytes; }
	const totalBytes = count(raw?.totalBytes);
	if (totalBytes !== undefined) { operation.totalBytes = totalBytes; }
	const bytesPerSecond = rate(raw?.bytesPerSecond);
	if (bytesPerSecond !== undefined) { operation.bytesPerSecond = bytesPerSecond; }
	const error = readError(raw?.error);
	if (error) { operation.error = error; }
	return operation;
}

function readEntry(value: unknown): ILocalModelEntryV1 | undefined {
	const raw = asBag(value);
	const modelFilesPresent = bool(raw?.modelFilesPresent);
	if (modelFilesPresent === undefined) {
		return undefined;
	}
	const entry: Mutable<ILocalModelEntryV1> = { modelFilesPresent };
	const disk = asBag(raw?.disk);
	const volume = boundedString(disk?.volume, MAX_PATH_LENGTH);
	const availableBytes = count(disk?.availableBytes);
	const requiredBytes = count(disk?.requiredBytes);
	if (volume && availableBytes !== undefined && requiredBytes !== undefined) {
		entry.disk = { volume, availableBytes, requiredBytes };
	}
	return entry;
}

function readContext(value: unknown): ILocalModelContextV1 | undefined {
	const raw = asBag(value);
	const tokens = raw?.tokens;
	if (!raw || !isLocalModelContextTokens(tokens) || !Array.isArray(raw.options)) {
		return undefined;
	}
	const options = new Map<number, ILocalModelContextOptionV1>();
	for (const item of raw.options.slice(0, MAX_CONTEXT_OPTIONS)) {
		const option = asBag(item);
		const optionTokens = option?.tokens;
		const gpuBytes = count(option?.gpuBytes);
		if (isLocalModelContextTokens(optionTokens) && gpuBytes !== undefined && !options.has(optionTokens)) {
			options.set(optionTokens, { tokens: optionTokens, gpuBytes });
		}
	}
	if (options.size === 0) {
		return undefined;
	}
	return { tokens, options: [...options.values()].sort((a, b) => a.tokens - b.tokens) };
}

function readUsage(value: unknown): ILocalModelUsageV1 {
	const raw = asBag(value);
	return {
		runningStreams: count(raw?.runningStreams) ?? 0,
		boundDirectChats: count(raw?.boundDirectChats) ?? 0,
		liveAutoRoutes: count(raw?.liveAutoRoutes) ?? 0,
	};
}

function readFamily(value: unknown): ILocalModelFamilyV1 | undefined {
	const raw = asBag(value);
	const familyId = id(raw?.familyId);
	const capiId = id(raw?.capiId);
	const displayName = typeof raw?.displayName === 'string' ? raw.displayName.trim().slice(0, MAX_DISPLAY_NAME_LENGTH) : undefined;
	if (!raw || !familyId || !capiId || !displayName) {
		return undefined;
	}
	const family: Mutable<ILocalModelFamilyV1> = {
		familyId,
		capiId,
		autoCapable: bool(raw.autoCapable) ?? false,
		displayName,
		usage: readUsage(raw.usage),
		consentGiven: bool(raw.consentGiven) ?? false,
	};
	const offer = readOffer(raw.offer);
	if (offer) { family.offer = offer; }
	const install = readInstall(raw.install);
	if (install) { family.install = install; }
	const operation = readOperation(raw.operation);
	if (operation) { family.operation = operation; }
	const entry = install ? undefined : readEntry(raw.entry);
	if (entry) { family.entry = entry; }
	const context = install ? readContext(raw.context) : undefined;
	if (context) { family.context = context; }
	const memoryWarning = install ? readMemoryWarning(raw.memoryWarning) : undefined;
	if (memoryWarning) { family.memoryWarning = memoryWarning; }
	const readyOfferId = boundedString(raw.readyOfferId, MAX_ID_LENGTH * 2 + 1);
	if (readyOfferId) { family.readyOfferId = readyOfferId; }
	return family;
}

function readLoad(value: unknown): ILocalModelLoadV1 | undefined {
	const raw = asBag(value);
	const step = oneOf(localModelLoadSteps, raw?.step);
	const startedAt = count(raw?.startedAt);
	if (!step || startedAt === undefined) {
		return undefined;
	}
	const load: Mutable<ILocalModelLoadV1> = { step, startedAt };
	const expectedMs = count(raw?.expectedMs);
	if (expectedMs) { load.expectedMs = expectedMs; }
	const retry = oneOf(localModelLoadRetryReasons, raw?.retry);
	if (retry) { load.retry = retry; }
	return load;
}

function readMemoryWarning(value: unknown): ILocalModelMemoryWarningV1 | undefined {
	const raw = asBag(value);
	const requiredBytes = count(raw?.requiredBytes);
	const capacityBytes = count(raw?.capacityBytes);
	return requiredBytes !== undefined && capacityBytes !== undefined ? { requiredBytes, capacityBytes } : undefined;
}

function readActive(value: unknown): ILocalModelActiveV1 | undefined {
	const raw = asBag(value);
	const familyId = id(raw?.familyId);
	const contentId = id(raw?.contentId);
	const servingGeneration = count(raw?.servingGeneration);
	const server = oneOf(localModelServerStates, raw?.server);
	if (!familyId || !contentId || servingGeneration === undefined || !server) {
		return undefined;
	}
	const active: Mutable<ILocalModelActiveV1> = { familyId, contentId, servingGeneration, server };
	const profile = oneOf(localModelServingProfiles, raw?.profile);
	if (profile) { active.profile = profile; }
	const contextTokens = count(raw?.contextTokens);
	if (contextTokens) { active.contextTokens = contextTokens; }
	const autoEligible = bool(raw?.autoEligible);
	if (autoEligible !== undefined) { active.autoEligible = autoEligible; }
	const runningStreams = count(asBag(raw?.drain)?.runningStreams);
	if (runningStreams !== undefined) { active.drain = { runningStreams }; }
	const load = server === 'starting' ? readLoad(raw?.load) : undefined;
	if (load) { active.load = load; }
	const swapTo = id(raw?.swapTo);
	if (swapTo) { active.swapTo = swapTo; }
	const error = readError(raw?.error);
	if (error) { active.error = error; }
	return active;
}

/** Reads an {@link ILocalModelStatusV1}; `undefined` unless `schemaVersion: 1`. Families without identity are dropped, duplicates keep the first, at most 32. */
export function readLocalModelStatus(value: unknown): ILocalModelStatusV1 | undefined {
	const raw = asBag(value);
	if (!raw || raw.schemaVersion !== 1) {
		return undefined;
	}
	const families: ILocalModelFamilyV1[] = [];
	const seen = new Set<string>();
	for (const item of Array.isArray(raw.families) ? raw.families : []) {
		const family = readFamily(item);
		if (family && !seen.has(family.familyId)) {
			seen.add(family.familyId);
			families.push(family);
			if (families.length === MAX_FAMILIES) {
				break;
			}
		}
	}
	const status: Mutable<ILocalModelStatusV1> = {
		schemaVersion: 1,
		device: readDevice(raw.device),
		runtime: readRuntime(raw.runtime),
		catalog: readCatalog(raw.catalog),
		families,
		useInAuto: bool(raw.useInAuto) ?? false,
	};
	const active = readActive(raw.active);
	if (active) { status.active = active; }
	return status;
}

/** Reads `_meta['vscode.localModel']` from a direct-selection model row. */
export function readLocalModelRowMeta(meta: Readonly<Record<string, unknown>> | undefined): ILocalModelRowMetaV1 | undefined {
	const raw = asBag(meta?.[LOCAL_MODEL_META_KEY]);
	const familyId = id(raw?.familyId);
	const contentId = id(raw?.contentId);
	const active = bool(raw?.active);
	return familyId && contentId && active !== undefined ? { familyId, contentId, active } : undefined;
}

/** Builds the `_meta` entry for a direct-selection model row. */
export function createLocalModelRowMeta(row: ILocalModelRowMetaV1): Record<string, unknown> {
	return { [LOCAL_MODEL_META_KEY]: { familyId: row.familyId, contentId: row.contentId, active: row.active } };
}
