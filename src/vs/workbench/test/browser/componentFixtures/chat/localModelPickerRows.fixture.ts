/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILocalModelFamilyV1, ILocalModelStatusV1 } from '../../../../../platform/agentHost/common/localModel.js';
import { getLocalModelServerStopId } from '../../../../services/agentHost/common/localModelService.js';
import { defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { ON_DEVICE_CONTEXT, OnDeviceThinking, renderPicker } from './tabbedModelPicker.fixture.js';

const GB = 1024 ** 3;
const MiB = 1024 ** 2;

const offer = { fit: 'full', requiredGpuBytes: 60 * GB, downloadBytes: 56.7 * GB, peakDiskBytes: 57.2 * GB, licenseName: 'MIT', licenseUrl: 'https://example.com/license' } as const;
const install = { contentId: 'c1', adopted: false, owned: true, modelId: 'MAI-Code-1.1-Flash' } as const;
const running = { kind: 'setup', state: 'running', resumeOnStartup: true } as const;
const qwenInstall = { ...install, contentId: 'q1', modelId: 'Qwen-Coder' } as const;
const entry = { modelFilesPresent: false, disk: { volume: 'C:', availableBytes: 412 * GB, requiredBytes: 57.2 * GB } } as const;

/** One family; an installed one has Example Flash's context sizes unless it says otherwise. */
function family(familyId: string, displayName: string, overrides: Partial<ILocalModelFamilyV1> = {}): ILocalModelFamilyV1 {
	return {
		familyId,
		capiId: familyId,
		autoCapable: true,
		displayName,
		usage: { runningStreams: 0, boundDirectChats: 0, liveAutoRoutes: 0 },
		consentGiven: false,
		context: overrides.install ? ON_DEVICE_CONTEXT.exampleFlash : undefined,
		...overrides,
	};
}

function status(families: readonly ILocalModelFamilyV1[], active?: ILocalModelStatusV1['active'], overrides: Partial<ILocalModelStatusV1> = {}): ILocalModelStatusV1 {
	return {
		schemaVersion: 1,
		device: { capacityBytes: 64 * GB, confidence: 'measured', vendor: 'nvidia' },
		runtime: { version: 'b11459' },
		catalog: { state: 'ready', registries: { azureml: 'ready' } },
		families,
		active,
		// The default: Use in Auto is off until the user turns it on.
		useInAuto: false,
		...overrides,
	};
}

function active(familyId: string, overrides: Partial<NonNullable<ILocalModelStatusV1['active']>> = {}): NonNullable<ILocalModelStatusV1['active']> {
	return { familyId, contentId: 'c1', servingGeneration: 1, server: 'ready', profile: 'full-gpu', autoEligible: true, ...overrides };
}

/**
 * Every readiness state of the picker's "On This Device" tab, one family per row.
 * A state lists no more rows than the tab shows without scrolling.
 */
const STATES = {
	SetUp: status([
		family('download', 'Example Flash 1.0', { offer }),
		family('near-fit', 'Near-Fit Model', { offer: { ...offer, fit: 'near' } }),
		family('found', 'Found Model', { offer, entry: { modelFilesPresent: true } }),
	]),
	Preparing: status([
		family('device', 'Checking Device', { offer, operation: { ...running, id: 'op2', phase: 'checkingDevice' } }),
		family('download', 'Downloading Model', { offer, operation: { ...running, id: 'op3', phase: 'downloading', completedBytes: 23.8 * GB, totalBytes: 56.7 * GB } }),
		family('verify', 'Verifying Model', { offer, operation: { ...running, id: 'op4', phase: 'verifying' } }),
	]),
	Loading: status([
		family('loading', 'Loading Model', { offer, operation: { ...running, id: 'op5', phase: 'loading' } }),
		family('drain', 'Draining Model', { install, operation: { ...running, id: 'op6', kind: 'swap', phase: 'draining' } }),
	], active('drain', { drain: { runningStreams: 2 } })),
	Paused: status([
		family('user', 'Paused by User', { offer, operation: { id: 'op1', kind: 'setup', state: 'paused', pausedReason: 'user', resumeOnStartup: false, phase: 'downloading', completedBytes: 23.8 * GB, totalBytes: 56.7 * GB } }),
		family('consent', 'Changed Download', { offer, operation: { id: 'op3', kind: 'setup', state: 'paused', pausedReason: 'consentChanged', resumeOnStartup: false } }),
	]),
	Installed: status([
		family('active', 'Example Flash 1.0', { install: { ...install, update: { contentId: 'c2', downloadBytes: 2.1 * GB } }, offer }),
		family('inactive', 'Qwen Coder', { install: qwenInstall, offer, context: ON_DEVICE_CONTEXT.qwen }),
		family('direct-only', 'Direct-Only Model', { autoCapable: false, install: { ...install, contentId: 'd1', modelId: 'Direct-Only' }, offer }),
	], active('active')),
	StartsWhenNeeded: status([family('active', 'Example Flash 1.0', { install, offer })], active('active', { server: 'stopped' })),
	LoadingModel: status([family('active', 'Example Flash 1.0', { install, offer }), family('inactive', 'Qwen Coder', { install: qwenInstall, offer, context: ON_DEVICE_CONTEXT.qwen })], active('active', { server: 'starting', load: { step: 'loading', startedAt: 0 } })),
	TooSlowForAuto: status([family('active', 'Example Flash 1.0', { install, offer })], active('active', { autoEligible: false, profile: 'near-fit' })),
	Errors: status([
		family('network', 'Interrupted Download', { offer, operation: { id: 'op1', kind: 'setup', state: 'error', resumeOnStartup: false, error: { code: 'network', message: 'The download was interrupted. Select Retry to resume.', actions: ['retry'] } } }),
		family('runtime', 'Old Runtime', { offer, operation: { id: 'op2', kind: 'setup', state: 'error', resumeOnStartup: false, error: { code: 'runtimeTooOld', message: 'The llama-server at C:\\llama\\llama-server.exe is missing features VS Code needs (--fit). Install a newer llama.cpp build, then set Chat \u203a Copilot \u203a Local Model: Llama Server Path (chat.copilot.localModel.llamaServerPath) to its llama-server and select Retry.', actions: ['getLlamaCpp', 'openSettings', 'retry'] } } }),
		family('orphan', 'Orphaned Server', { install, offer }),
	], active('orphan', { server: 'error', error: { code: 'orphan', message: 'A previous server is still running.', actions: ['retry', 'stopPrevious'] } })),
	// A model that isn't downloaded can't be selected: Download, the download's progress or Paused shows where an installed model's summary would be.
	NotDownloaded: status([
		family('active', 'Example Flash 1.0', { install, offer }),
		family('download', 'Qwen Coder', { offer }),
		family('downloading', 'Downloading Model', { offer, operation: { ...running, id: 'op3', phase: 'downloading', completedBytes: 23.8 * GB, totalBytes: 56.7 * GB } }),
		family('paused', 'Paused Model', { offer, operation: { id: 'op4', kind: 'setup', state: 'paused', pausedReason: 'user', resumeOnStartup: false, phase: 'downloading', completedBytes: 23.8 * GB, totalBytes: 56.7 * GB } }),
	], active('active')),
} satisfies Record<string, ILocalModelStatusV1>;

/** Example Flash 1.0 as set up on this device. */
function exampleFlash(overrides: Partial<ILocalModelFamilyV1> = {}): ILocalModelFamilyV1 {
	return family('example-flash', 'Example Flash 1.0', { install, offer, consentGiven: true, ...overrides });
}

const qwenOffer = { ...offer, downloadBytes: 18.4 * GB, requiredGpuBytes: 22 * GB, licenseName: 'Apache 2.0' } as const;

/** Qwen Coder as set up on this device. */
function qwen(overrides: Partial<ILocalModelFamilyV1> = {}): ILocalModelFamilyV1 {
	return family('qwen', 'Qwen Coder', { install: qwenInstall, offer: qwenOffer, consentGiven: true, context: ON_DEVICE_CONTEXT.qwen, ...overrides });
}

const llamaCppDirections = ['getLlamaCpp', 'openSettings', 'retry'] as const;
const downloading = { ...running, id: 'op1', phase: 'downloading', completedBytes: 23.8 * GB, totalBytes: 56.7 * GB, bytesPerSecond: 48 * 1024 * 1024 } as const;
/** Loading, 12 s into a load whose last comparable one took 31 s. */
const loadingWithEstimate = () => status([exampleFlash()], active('example-flash', { server: 'starting', load: { step: 'loading', startedAt: Date.now() - 12_000, expectedMs: 31_000 } }));

/** The detail page of one family in each state a user meets, opened as the show-details command does; a load's status is taken when it renders. */
const DETAILS: Record<string, { readonly familyId: string; readonly status: ILocalModelStatusV1 | (() => ILocalModelStatusV1); readonly pendingStops?: readonly string[]; readonly motionReduced?: boolean; readonly focusStateIcon?: boolean }> = {
	/** Download covers only the model: its size, source and license; loading it needs llama.cpp, which VS Code doesn't install. */
	DetailsDownloadNoLlamaCpp: { familyId: 'example-flash', status: status([family('example-flash', 'Example Flash 1.0', { offer, entry })], undefined, { runtime: {} }) },
	/** Downloaded, but no usable llama.cpp: loading it gives directions, with Get llama.cpp, Open Settings and Retry. */
	DetailsNeedsLlamaCpp: {
		familyId: 'example-flash',
		status: status([exampleFlash()], active('example-flash', { server: 'error', error: { code: 'runtimeNotFound', message: 'Example Flash 1.0 needs llama.cpp to run. Install a llama.cpp build that supports it, then set Chat \u203a Copilot \u203a Local Model: Llama Server Path (chat.copilot.localModel.llamaServerPath) to its llama-server and select Retry.', actions: llamaCppDirections } }), { runtime: {} }),
	},
	/** The llama.cpp set can't run the model's architecture (MAI before ggml-org/llama.cpp#29778). */
	DetailsUnsupportedLlamaCpp: {
		familyId: 'example-flash',
		status: status([exampleFlash()], active('example-flash', { server: 'error', error: { code: 'runtimeUnsupportedModel', message: 'This llama.cpp build (b11459) can\'t run Example Flash 1.0. Install a llama.cpp build that includes ggml-org/llama.cpp#29778, then set Chat \u203a Copilot \u203a Local Model: Llama Server Path (chat.copilot.localModel.llamaServerPath) to its llama-server and select Retry.', actions: llamaCppDirections } })),
	},
	DetailsDownloading: { familyId: 'example-flash', status: status([family('example-flash', 'Example Flash 1.0', { offer, operation: downloading })]) },
	DetailsPaused: { familyId: 'example-flash', status: status([family('example-flash', 'Example Flash 1.0', { offer, operation: { id: 'op1', kind: 'setup', state: 'paused', pausedReason: 'network', resumeOnStartup: true, phase: 'downloading', completedBytes: 23.8 * GB, totalBytes: 56.7 * GB } })]) },
	DetailsErrorRetry: { familyId: 'example-flash', status: status([family('example-flash', 'Example Flash 1.0', { offer, operation: { id: 'op1', kind: 'setup', state: 'error', resumeOnStartup: false, error: { code: 'network', message: 'The download was interrupted. Select Retry to resume.', actions: ['retry'] } } })]) },
	/** Loaded: the header offers Stop and Remove. */
	DetailsReady: { familyId: 'example-flash', status: status([exampleFlash()], active('example-flash')) },
	/** Stop was just selected: it reads as in progress until the host stops the model. */
	DetailsStopPending: { familyId: 'example-flash', pendingStops: [getLocalModelServerStopId('example-flash')], status: status([exampleFlash()], active('example-flash')) },
	/** An update is available for a model that isn't loaded: Load, Update and Remove. */
	DetailsUpdateAvailable: { familyId: 'qwen', status: status([exampleFlash(), qwen({ install: { ...qwenInstall, update: { contentId: 'q2', downloadBytes: 2.1 * GB } } })], active('example-flash')) },
	/** A long name and all three header icons, the first warming up: the name gives way to the icons. */
	DetailsLongNameWarmingUp: {
		familyId: 'example-flash',
		status: status([family('example-flash', 'Example Flash 1.0 Extended Context Preview', { install: { ...install, update: { contentId: 'c2', downloadBytes: 2.1 * GB } }, offer, consentGiven: true })], active('example-flash', { server: 'starting', load: { step: 'warmingUp', startedAt: 0 } })),
	},
	/** Qwen's thinking is a switch, and a new context size applies the next time it loads. */
	DetailsNotLoaded: { familyId: 'qwen', status: status([exampleFlash(), qwen()], active('example-flash')) },
	/** A new context size for the loaded model: it reloads once its running responses finish. */
	DetailsContextReloading: {
		familyId: 'example-flash',
		status: status([exampleFlash({ context: { ...ON_DEVICE_CONTEXT.exampleFlash, tokens: 262144 }, operation: { ...running, id: 'op1', kind: 'swap', phase: 'draining' } })], active('example-flash', { contextTokens: 131072, swapTo: 'example-flash', drain: { runningStreams: 2 } })),
	},
	/** Then it loads again at the new size, 12 s into a reload whose last comparable load took 31 s. */
	DetailsReloading: {
		familyId: 'example-flash',
		status: () => status([exampleFlash({ context: { ...ON_DEVICE_CONTEXT.exampleFlash, tokens: 262144 }, operation: { ...running, id: 'op1', kind: 'swap', phase: 'loading' } })], active('example-flash', { server: 'starting', swapTo: 'example-flash', load: { step: 'loading', startedAt: Date.now() - 12_000, expectedMs: 31_000 } })),
	},
	/** 256K selected, but this device only has the GPU memory to serve 128K. */
	DetailsContextReduced: { familyId: 'qwen', status: status([qwen({ context: { ...ON_DEVICE_CONTEXT.qwen, tokens: 262144 } })], active('qwen', { contextTokens: 131072 }), { device: { capacityBytes: 8 * GB, confidence: 'measured' } }) },
	/** The bar and time remaining are estimated from the last comparable load. */
	DetailsLoadingWithEstimate: { familyId: 'example-flash', status: loadingWithEstimate },
	/** The first load of this model at this context size: no estimate, so the bar is indeterminate. */
	DetailsLoadingFirstTime: { familyId: 'example-flash', status: () => status([exampleFlash()], active('example-flash', { server: 'starting', load: { step: 'loading', startedAt: Date.now() - 4_000 } })) },
	/** Keyboard focus on the in-progress indicator turns it into Cancel, the step's stop action. */
	DetailsLoadingFocusCancel: { familyId: 'example-flash', focusStateIcon: true, status: loadingWithEstimate },
	/** With reduced motion, the in-progress icon stands in for the spinner. */
	DetailsLoadingReducedMotion: { familyId: 'example-flash', motionReduced: true, status: loadingWithEstimate },
	/** This llama.cpp build crashed on the warm-up with speculative decoding: the model loads again without it. */
	DetailsRetryWithoutSpeculativeDecoding: { familyId: 'example-flash', status: () => status([exampleFlash()], active('example-flash', { server: 'starting', load: { step: 'loading', startedAt: Date.now() - 3_000, retry: 'withoutSpeculativeDecoding' } })) },
	/** Pause was just selected: it shows as in progress until the host pauses the download. */
	DetailsPausePending: { familyId: 'example-flash', pendingStops: ['op1'], status: status([family('example-flash', 'Example Flash 1.0', { offer, operation: downloading })]) },
	/** 256K selected on a device whose GPU can't hold it; a smaller size fits. */
	DetailsMemoryWarning: {
		familyId: 'qwen',
		status: status([qwen({ offer: { ...offer, downloadBytes: 3.2 * GB, requiredGpuBytes: 8.5 * GB, licenseName: 'Apache 2.0' }, context: { ...ON_DEVICE_CONTEXT.qwen, tokens: 262144 }, memoryWarning: { requiredBytes: 12825 * MiB, capacityBytes: 8 * GB } })], active('example-flash'), { device: { capacityBytes: 8 * GB, confidence: 'measured' } }),
	},
};

/** Example Flash sets a reasoning effort, Qwen switches thinking on or off, and the direct-only model has no thinking control. */
const THINKING: Record<string, OnDeviceThinking> = { 'example-flash': 'effort', active: 'effort', drain: 'effort', orphan: 'effort', qwen: 'toggle', inactive: 'toggle' };

const themes = { additionalThemes: ['darkHighContrast', 'lightHighContrast'] } as const;

export default defineThemedFixtureGroup({ path: 'chat/input/localModelPickerRows' }, {
	...Object.fromEntries(Object.entries(STATES).map(([name, state]) => [
		name,
		defineComponentFixture({ ...themes, render: context => renderPicker(context, { localModels: state, onDeviceThinking: THINKING, initialTabLabel: 'On This Device' }) }),
	])),
	...Object.fromEntries(Object.entries(DETAILS).map(([name, { familyId, status: state, pendingStops, motionReduced, focusStateIcon }]) => [
		name,
		defineComponentFixture({
			...themes,
			render: async context => {
				await renderPicker(context, { anchored: true, localModels: typeof state === 'function' ? state() : state, pendingStops, onDeviceThinking: THINKING, openLocalModelDetails: familyId, motionReduced: motionReduced ?? false });
				if (focusStateIcon) {
					context.container.querySelector<HTMLElement>('.chat-local-model-card-state-action')?.focus();
				}
			},
		}),
	])),
});
