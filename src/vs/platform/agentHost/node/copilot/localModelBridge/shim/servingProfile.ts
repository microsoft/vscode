/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITelemetryService } from '../../../../../telemetry/common/telemetry.js';
import type { LocalModelDeviceConfidence, LocalModelServingProfile } from '../../../../common/localModel.js';
import { FOOTPRINT_FACTOR, FOOTPRINT_OVERHEAD_BYTES, NEAR_FIT_RATIO, REDUCED_CONTEXT_STEPS, SYSTEM_MEMORY_RESERVE_MIN_BYTES, SYSTEM_MEMORY_RESERVE_RATIO } from './constants.js';
import type { ILlamaPresetOverrides } from './llamaPreset.js';

/* Fit classes, device listing and serving profiles; all pure. */

const MIB = 1024 * 1024;

// #region `--list-devices` (Stage B)

/** One GPU device reported by `llama-server --list-devices`. */
export interface ILlamaDevice {
	/** llama.cpp device name, bound at spawn with `--device` (for example `Vulkan0`). */
	readonly name: string;
	readonly description: string;
	/** Static capability (`total`). */
	readonly totalBytes: number;
	/** Budget for the probing process (`free`); dynamic, never cached. */
	readonly freeBytes: number;
	/** Backend inferred from the device name (`vulkan`, `metal`, `cuda`, ...). */
	readonly backend: string;
}

const DEVICE_LINE = /^\s*(?<name>[A-Za-z][A-Za-z0-9_]*\d+):\s*(?<description>.*?)\s*\((?<total>\d+)\s*MiB,\s*(?<free>\d+)\s*MiB free\)\s*$/;

/** Maps a llama.cpp device name prefix to a backend id. */
export function backendFromDeviceName(name: string): string {
	const prefix = name.replace(/\d+$/, '').toLowerCase();
	switch (prefix) {
		case 'vulkan': return 'vulkan';
		case 'mtl':
		case 'metal': return 'metal';
		case 'cuda': return 'cuda';
		case 'rocm':
		case 'hip': return 'rocm';
		case 'gpuopencl':
		case 'opencl': return 'opencl';
		case 'sycl': return 'sycl';
		default: return prefix || 'unknown';
	}
}

/** Parses `--list-devices` output (`<name>: <description> (<total> MiB, <free> MiB free)` per device, or `(none)`); `undefined` when unrecognizable. Pure. */
export function parseListDevicesOutput(output: string): ILlamaDevice[] | undefined {
	const lines = output.split(/\r?\n/);
	const headerIndex = lines.findIndex(line => /^\s*Available devices:\s*$/.test(line));
	const devices: ILlamaDevice[] = [];
	let sawNone = false;
	for (const line of headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines) {
		if (/^\s*\(none\)\s*$/.test(line)) {
			sawNone = true;
			continue;
		}
		const match = DEVICE_LINE.exec(line);
		if (match?.groups) {
			const totalMiB = Number(match.groups.total);
			const freeMiB = Number(match.groups.free);
			devices.push({
				name: match.groups.name,
				description: match.groups.description,
				totalBytes: totalMiB * MIB,
				freeBytes: Math.min(freeMiB, totalMiB) * MIB,
				backend: backendFromDeviceName(match.groups.name),
			});
		}
	}
	if (devices.length === 0 && !sawNone && headerIndex < 0) {
		return undefined;
	}
	return devices;
}

// #endregion

// #region Fit classes

export type LocalModelFitResult = 'full' | 'near' | 'insufficient' | 'unknown';

/** OS reserve when computing spare system memory: max(8 GiB, 10 % of RAM). */
export function systemMemoryReserveBytes(systemMemoryBytes: number): number {
	return Math.max(SYSTEM_MEMORY_RESERVE_MIN_BYTES, Math.round(systemMemoryBytes * SYSTEM_MEMORY_RESERVE_RATIO));
}

export interface IFitInput {
	/** `gpuCapacityBytes` of the device; `undefined` when unknown. */
	readonly capacityBytes: number | undefined;
	readonly requiredBytes: number;
	/** Total system RAM. */
	readonly systemMemoryBytes: number;
	/** System RAM already counted in {@link capacityBytes}: the GPU-addressable share with unified memory, 0 for a discrete GPU. */
	readonly systemMemoryCountedAsGpuBytes: number;
}

/** RAM not counted as GPU memory, minus the OS reserve. Pure. */
export function spareSystemBytes(input: Pick<IFitInput, 'systemMemoryBytes' | 'systemMemoryCountedAsGpuBytes'>): number {
	return Math.max(0, input.systemMemoryBytes - input.systemMemoryCountedAsGpuBytes - systemMemoryReserveBytes(input.systemMemoryBytes));
}

/** Fit: `full` when capacity >= required; `near` when capacity >= required x NEAR_FIT_RATIO and the gap fits in spare RAM; `unknown` without capacity; else `insufficient`. Pure. */
export function computeFitClass(input: IFitInput): LocalModelFitResult {
	if (input.capacityBytes === undefined || !Number.isFinite(input.capacityBytes) || input.capacityBytes <= 0) {
		return 'unknown';
	}
	if (input.capacityBytes >= input.requiredBytes) {
		return 'full';
	}
	if (input.capacityBytes >= input.requiredBytes * NEAR_FIT_RATIO && input.requiredBytes - input.capacityBytes <= spareSystemBytes(input)) {
		return 'near';
	}
	return 'insufficient';
}

/** Whether a fit class makes a catalog model offerable. */
export function isOfferableFit(fit: LocalModelFitResult): fit is 'full' | 'near' {
	return fit === 'full' || fit === 'near';
}

// #endregion

// #region Serving profile

export interface IFootprintInput {
	readonly primaryBytes: number;
	readonly draftBytes: number;
	/** What the served models allocate besides weights at the serving context (`estimateContextMemoryBytes`), for the primary and any draft. */
	readonly contextBytes: number;
}

/** Footprint: `(primary + draft + context buffers) x 1.02 + 256 MiB`. Pure. */
export function computeFootprintBytes(input: IFootprintInput): number {
	return Math.ceil((input.primaryBytes + input.draftBytes + input.contextBytes) * FOOTPRINT_FACTOR + FOOTPRINT_OVERHEAD_BYTES);
}

export interface IServingProfileInput {
	readonly capacityBytes: number;
	readonly systemMemoryBytes: number;
	readonly systemMemoryCountedAsGpuBytes: number;
	/** The selected `--ctx-size`. */
	readonly ctxSize: number;
	/** Footprint at a given context, from the local GGUF header; absent before download (tag requirement only). */
	readonly footprintAt?: (ctxSize: number) => number;
	/** `recommendedVramBytes`, used when no footprint is available. */
	readonly requiredBytes: number;
}

export interface IServingProfile {
	readonly profile: LocalModelServingProfile;
	readonly fit: 'full' | 'near';
	readonly ctxSize: number;
	readonly ctxReduced: boolean;
	readonly overrides: ILlamaPresetOverrides;
}

/** `near-fit` overrides: llama.cpp places what fits and spills the rest to RAM; the small draft stays on the GPU. */
export const NEAR_FIT_OVERRIDES: ILlamaPresetOverrides = { fit: 'on', nGpuLayers: 'auto', specDraftNgl: 'all' };

/** Context sizes to try for the last-resort reduction: below the selected size, never below the last step. */
export function reducedContextSteps(ctxSize: number): number[] {
	return REDUCED_CONTEXT_STEPS.filter(step => step < ctxSize);
}

/**
 * Chooses the serving profile: `full-gpu` for `full`, `near-fit` for `near`, and within `near-fit`, when the KV cache is
 * what pushes the device out of `near`, the reduced-context steps. `undefined` when nothing fits. Pure.
 */
export function chooseServingProfile(input: IServingProfileInput): IServingProfile | undefined {
	const fitAt = (requiredBytes: number) => computeFitClass({
		capacityBytes: input.capacityBytes,
		requiredBytes,
		systemMemoryBytes: input.systemMemoryBytes,
		systemMemoryCountedAsGpuBytes: input.systemMemoryCountedAsGpuBytes,
	});
	const required = input.footprintAt ? input.footprintAt(input.ctxSize) : input.requiredBytes;
	const fit = fitAt(required);
	if (fit === 'full') {
		return { profile: 'full-gpu', fit, ctxSize: input.ctxSize, ctxReduced: false, overrides: {} };
	}
	if (fit === 'near') {
		return { profile: 'near-fit', fit, ctxSize: input.ctxSize, ctxReduced: false, overrides: NEAR_FIT_OVERRIDES };
	}
	if (!input.footprintAt) {
		return undefined;
	}
	for (const ctxSize of reducedContextSteps(input.ctxSize)) {
		if (isOfferableFit(fitAt(input.footprintAt(ctxSize)))) {
			return { profile: 'near-fit', fit: 'near', ctxSize, ctxReduced: true, overrides: NEAR_FIT_OVERRIDES };
		}
	}
	return undefined;
}

/** A server start configuration the downgrade sequence walks. */
export interface IServerStartConfig {
	readonly flashAttn: 'on' | 'off' | 'auto' | undefined;
	readonly speculative: boolean;
	readonly ctxSize: number;
}

export type ServerStartFailureKind = 'outOfMemory' | 'unsupportedFeature' | 'unsupportedArchitecture' | 'specUnsupported' | 'other';

export type ServerDowngradeStep = 'flashAttnAuto' | 'dropSpeculative' | 'reduceContext';

/** Where a server failed: while loading, during the warm-up (its first completion), or on the first request it served after ready. */
export type ServerFailurePhase = 'load' | 'warmUp' | 'firstRequest';

/** The failed start's context for {@link classifyServerStartFailure}. */
export interface IServerFailureContext {
	/** Speculative decoding (DFlash) was part of the configuration that failed. */
	readonly speculative: boolean;
	readonly phase: ServerFailurePhase;
}

/** An assertion or abort in llama.cpp's output (`GGML_ASSERT(...) failed`, `GGML_ABORT`, `abort()`). */
const LLAMA_ABORT_PATTERN = /ggml_assert\(|ggml_abort|\babort\(\)|assertion .*failed|terminate called/;

/**
 * Classifies a failed start from the stderr tail; only `outOfMemory`, `unsupportedFeature` and `specUnsupported` trigger
 * downgrades. `unsupportedArchitecture` is checked first, as no profile can load it. With speculative decoding on, a
 * server dying on its first completion is `specUnsupported`: some DFlash builds load, report healthy, then assert. Pure.
 */
export function classifyServerStartFailure(stderrTail: string, context?: IServerFailureContext): ServerStartFailureKind {
	const text = stderrTail.toLowerCase();
	if (/unknown model architecture/.test(text)) {
		return 'unsupportedArchitecture';
	}
	if (/out of (device |host )?memory|failed to allocate|erroroutofdevicememory|erroroutofhostmemory|cudamalloc failed|insufficient memory|unable to allocate|kv cache.*(too large|failed)/.test(text)) {
		return 'outOfMemory';
	}
	if (context?.speculative && (context.phase === 'warmUp' || (context.phase === 'firstRequest' && LLAMA_ABORT_PATTERN.test(text)))) {
		return 'specUnsupported';
	}
	if (/not supported|unsupported|unknown argument|invalid argument|flash.?attn|flash attention/.test(text)) {
		return 'unsupportedFeature';
	}
	return 'other';
}

/**
 * The start-failure downgrade sequence: 1. `flash-attn on` -> `auto`; 2. drop speculative decoding; 3. step the context
 * down. Each step is tried once, in order; `specUnsupported` goes straight to step 2. Generic crashes and unknown
 * architectures never downgrade. `undefined` when no step is left. Pure.
 */
export function nextServerDowngrade(current: IServerStartConfig, attempted: readonly ServerDowngradeStep[], failure: ServerStartFailureKind): { readonly step: ServerDowngradeStep; readonly config: IServerStartConfig } | undefined {
	if (failure === 'other' || failure === 'unsupportedArchitecture') {
		return undefined;
	}
	if (failure === 'specUnsupported') {
		return !attempted.includes('dropSpeculative') && current.speculative ? { step: 'dropSpeculative', config: { ...current, speculative: false } } : undefined;
	}
	if (!attempted.includes('flashAttnAuto') && current.flashAttn === 'on') {
		return { step: 'flashAttnAuto', config: { ...current, flashAttn: 'auto' } };
	}
	if (!attempted.includes('dropSpeculative') && current.speculative) {
		return { step: 'dropSpeculative', config: { ...current, speculative: false } };
	}
	const nextCtx = reducedContextSteps(current.ctxSize)[0];
	if (nextCtx !== undefined) {
		return { step: 'reduceContext', config: { ...current, ctxSize: nextCtx } };
	}
	return undefined;
}

// #endregion

// #region Admission

export interface IAdmissionInput {
	readonly profile: LocalModelServingProfile;
	readonly footprintBytes: number;
	/** The selected device's `free` from a fresh `--list-devices`. */
	readonly deviceFreeBytes: number;
	/** `os.freemem()` (macOS: also `vm_stat`-derived available memory). */
	readonly systemFreeBytes: number;
	readonly systemMemoryBytes: number;
}

export interface IAdmissionResult {
	readonly admitted: boolean;
	/** What is available for this profile right now (for the `memoryBusy` message). */
	readonly availableBytes: number;
	readonly neededBytes: number;
}

/** Admission right before spawn: `full-gpu` needs the footprint in the device's free budget; `near-fit` needs NEAR_FIT_RATIO of it there and the rest in free RAM above the reserve. Pure. */
export function checkAdmission(input: IAdmissionInput): IAdmissionResult {
	const spareRam = Math.max(0, input.systemFreeBytes - systemMemoryReserveBytes(input.systemMemoryBytes));
	if (input.profile === 'full-gpu') {
		return { admitted: input.footprintBytes <= input.deviceFreeBytes, availableBytes: input.deviceFreeBytes, neededBytes: input.footprintBytes };
	}
	const available = input.deviceFreeBytes + spareRam;
	const admitted = input.deviceFreeBytes >= input.footprintBytes * NEAR_FIT_RATIO && input.footprintBytes <= available;
	return { admitted, availableBytes: available, neededBytes: input.footprintBytes };
}

/** Free system memory beyond the reserve once an admitted model loads: unified memory takes the whole footprint, otherwise only what `near-fit` keeps off the GPU. Pure. */
export function spareSystemMemoryAfterAdmission(input: IAdmissionInput, unifiedMemory: boolean): number {
	const spareRam = Math.max(0, input.systemFreeBytes - systemMemoryReserveBytes(input.systemMemoryBytes));
	const fromSystem = unifiedMemory ? input.footprintBytes : input.profile === 'full-gpu' ? 0 : Math.max(0, input.footprintBytes - input.deviceFreeBytes);
	return Math.max(0, spareRam - fromSystem);
}

// #endregion

// #region Telemetry

/** `localModel.eligibility`, emitted after each visibility evaluation. */
export interface ILocalModelEligibilityEvent {
	stage: 'native' | 'llamaCpp';
	fitClass: LocalModelFitResult;
	visible: boolean;
	target: string;
	backend: string;
	profile: LocalModelServingProfile | 'none';
	gpuMemoryGiB: number;
	requiredGpuGiB: number;
	systemMemoryGiB: number;
	stageADeltaGiB: number;
	confidence: LocalModelDeviceConfidence;
}

type LocalModelEligibilityClassification = {
	stage: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Which probe decided the fit: the native probe or llama.cpp --list-devices.' };
	fitClass: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fit class of the device for the model: full, near, insufficient or unknown.' };
	visible: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the model was offered on this device.' };
	target: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Platform and architecture, for example win32-arm64.' };
	backend: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'GPU backend of the selected device (vulkan, metal, ...) or none.' };
	profile: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Serving profile: full-gpu, near-fit or none.' };
	gpuMemoryGiB: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'GPU capacity used for the fit decision, in GiB (rounded to 0.1).' };
	requiredGpuGiB: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'GPU memory the model needs, in GiB (rounded to 0.1).' };
	systemMemoryGiB: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total system memory, in GiB (rounded to 0.1).' };
	stageADeltaGiB: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Stage B capacity minus Stage A capacity in GiB, for calibrating the native probe; 0 when Stage B did not run.' };
	confidence: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Confidence of the capacity: measured, estimated or unknown.' };
	owner: 'lramos15';
	comment: 'On-device model visibility: whether this device can run a catalog model, and how that was decided.';
};

/** Rounds bytes to GiB with one decimal. */
export function toGiB(bytes: number | undefined): number {
	return bytes === undefined ? 0 : Math.round(bytes / (1024 * 1024 * 1024) * 10) / 10;
}

/** Emits `localModel.eligibility`. */
export function reportLocalModelEligibility(telemetryService: Pick<ITelemetryService, 'publicLog2'>, event: ILocalModelEligibilityEvent): void {
	telemetryService.publicLog2<ILocalModelEligibilityEvent, LocalModelEligibilityClassification>('localModel.eligibility', event);
}

// #endregion
