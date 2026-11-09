/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { computeLocalModelConsentScope, deriveLocalModelReadiness, isLocalModelRequest, LOCAL_MODEL_STATUS_KEY, type ILocalModelFamilyV1, type ILocalModelStatusV1 } from '../../common/localModel.js';
import { createLocalModelTurnExecutionMeta, readLocalModelTurnExecution, readUsageInfoMeta } from '../../common/meta/agentUsageMeta.js';
import { createLocalModelRowMeta, readLocalModelRowMeta, readLocalModelStatus, readLocalModelStatusFromRootState } from '../../common/meta/localModelStatus.js';
import type { RootState } from '../../common/state/protocol/state.js';

const family: ILocalModelFamilyV1 = {
	familyId: 'mai-code-1.1-flash-local',
	capiId: 'mai-code-1.1-flash-local',
	autoCapable: true,
	displayName: 'Example Flash 1.0',
	offer: { fit: 'full', requiredGpuBytes: 64_000_000_000, downloadBytes: 56_688_834_848, peakDiskBytes: 56_688_834_848, licenseName: 'MIT', licenseUrl: 'https://example.com/license' },
	operation: { id: 'op-1', kind: 'setup', state: 'running', resumeOnStartup: true, phase: 'downloading', completedBytes: 10, totalBytes: 100, bytesPerSecond: 2.5 },
	entry: { modelFilesPresent: false, disk: { volume: 'C:', availableBytes: 100, requiredBytes: 50 } },
	usage: { runningStreams: 0, boundDirectChats: 0, liveAutoRoutes: 0 },
	consentGiven: true,
};

const status: ILocalModelStatusV1 = {
	schemaVersion: 1,
	device: { id: 'Vulkan0', capacityBytes: 72_124_497_920, confidence: 'measured', vendor: 'nvidia' },
	runtime: {},
	catalog: { state: 'ready', registries: { azureml: 'empty' } },
	families: [family],
	active: { familyId: 'other-local', contentId: 'c2', servingGeneration: 3, server: 'error', error: { code: 'crashed', message: 'It crashed.', actions: ['retry'] } },
	useInAuto: false,
};

suite('localModel contract', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips a valid status and reads it from root state', () => {
		const rootState: RootState = { agents: [], config: { schema: { type: 'object', properties: {} }, values: { [LOCAL_MODEL_STATUS_KEY]: JSON.parse(JSON.stringify(status)) } } };
		assert.deepStrictEqual({
			direct: readLocalModelStatus(JSON.parse(JSON.stringify(status))),
			fromRootState: readLocalModelStatusFromRootState(rootState),
			absent: readLocalModelStatusFromRootState({ agents: [] }),
			error: readLocalModelStatusFromRootState(new Error('disconnected')),
			notVersion1: [readLocalModelStatus(undefined), readLocalModelStatus([]), readLocalModelStatus({ schemaVersion: 2, families: [] })],
		}, {
			direct: status,
			fromRootState: status,
			absent: undefined,
			error: undefined,
			notVersion1: [undefined, undefined, undefined],
		});
	});

	test('drops malformed fields, unknown values and invalid families', () => {
		const read = readLocalModelStatus({
			schemaVersion: 1,
			device: { confidence: 'guessed', capacityBytes: -1, vendor: 'matrox' },
			runtime: { source: 'managed', trust: 'verified', path: '/opt/llama-server', packageManager: 'choco', installChannel: 'brew', version: 'b11459' },
			catalog: { state: 'nope' },
			families: [
				{ familyId: 'a', capiId: 'a-local', displayName: '  A model  ', offer: { source: 'azureml', fit: 'full', requiredGpuBytes: 1, downloadBytes: 2, peakDiskBytes: 3, licenseUrl: 'http://insecure.example.com' }, install: { contentId: 'c', modelId: 'A' }, operation: { id: 'op', kind: 'teleport', state: 'running' }, entry: { modelFilesPresent: true }, usage: { runningStreams: 1.5 } },
				{ familyId: 'a', capiId: 'duplicate', displayName: 'Duplicate' },
				{ familyId: '', capiId: 'x', displayName: 'No id' },
				'not a family',
			],
			active: { familyId: 'a', contentId: 'c', servingGeneration: -1, server: 'ready' },
			useInAuto: 'yes',
			extra: { ignored: true },
		});
		assert.deepStrictEqual(read, {
			schemaVersion: 1,
			device: { confidence: 'unknown' },
			runtime: { version: 'b11459' },
			catalog: { state: 'unavailable', registries: { azureml: 'unavailable' } },
			families: [{
				familyId: 'a',
				capiId: 'a-local',
				autoCapable: false,
				displayName: 'A model',
				usage: { runningStreams: 0, boundDirectChats: 0, liveAutoRoutes: 0 },
				consentGiven: false,
				offer: { fit: 'full', requiredGpuBytes: 1, downloadBytes: 2, peakDiskBytes: 3 },
				install: { contentId: 'c', adopted: false, owned: false, modelId: 'A' },
			}],
			useInAuto: false,
		});
	});

	test('reads a status from an older host: Switch to Public Build, named install channels, and its llama.cpp install, discovery and approval state are dropped', () => {
		const install = { contentId: 'c', adopted: false, owned: true, modelId: 'vscode-on-device/A' } as const;
		const publicBuild = readLocalModelStatus({
			...status,
			families: [{ ...family, install: { ...install, channel: 'azureml', publicBuildAvailable: true }, operation: { id: 'op-2', kind: 'replace', state: 'running', resumeOnStartup: true, phase: 'downloading' } }],
		});
		const read = readLocalModelStatus({
			schemaVersion: 1,
			runtime: { source: 'packageManager', packageManager: 'winget', installChannel: 'winget', trust: 'installedByVSCode', version: 'b11459', path: 'C:\\tools\\llama-server.exe', sha256: 'a'.repeat(64), size: 4096, operation: { id: 'runtime-1', kind: 'upgrade', state: 'error', error: { code: 'packageInstallFailed', message: 'winget failed.', actions: ['retry'] } } },
			families: [{ ...family, operation: undefined, entry: { runtimeNeeded: true, modelFilesPresent: false, packagedRuntimeUnsupported: true } }],
			active: { familyId: family.familyId, contentId: 'c', servingGeneration: 1, server: 'error', error: { code: 'runtimeUnsupportedModel', message: 'Update llama.cpp.', actions: ['updateRuntime', 'openSettings', 'retry'] } },
		});
		assert.deepStrictEqual({ publicBuild: publicBuild?.families.map(candidate => ({ install: candidate.install, operation: candidate.operation })), runtime: read?.runtime, entry: read?.families[0].entry, actions: read?.active?.error?.actions }, {
			publicBuild: [{ install, operation: undefined }],
			runtime: { version: 'b11459' },
			entry: { modelFilesPresent: false },
			actions: ['openSettings', 'retry'],
		});
	});
	test('reads the context sizes of installed families and drops malformed ones', () => {
		const install = { contentId: 'c', modelId: 'A' };
		const contextOf = (context: unknown, withInstall = true) => readLocalModelStatus({ schemaVersion: 1, families: [{ familyId: 'a', capiId: 'a', displayName: 'A', install: withInstall ? install : undefined, context }] })?.families[0].context;
		assert.deepStrictEqual({
			valid: contextOf({ tokens: 131072, options: [{ tokens: 262144, gpuBytes: 3 }, { tokens: 65536, gpuBytes: 1 }, { tokens: 131072, gpuBytes: 2 }] }),
			dropsBadOptions: contextOf({ tokens: 65536, options: [{ tokens: 65536, gpuBytes: 1 }, { tokens: 65536, gpuBytes: 9 }, { tokens: 0, gpuBytes: 1 }, { tokens: 1.5, gpuBytes: 1 }, { tokens: 32768, gpuBytes: -1 }, { tokens: 1e12, gpuBytes: 1 }, 'x'] }),
			noOptions: contextOf({ tokens: 65536, options: [] }),
			badTokens: contextOf({ tokens: -1, options: [{ tokens: 65536, gpuBytes: 1 }] }),
			notInstalled: contextOf({ tokens: 65536, options: [{ tokens: 65536, gpuBytes: 1 }] }, false),
		}, {
			valid: { tokens: 131072, options: [{ tokens: 65536, gpuBytes: 1 }, { tokens: 131072, gpuBytes: 2 }, { tokens: 262144, gpuBytes: 3 }] },
			dropsBadOptions: { tokens: 65536, options: [{ tokens: 65536, gpuBytes: 1 }] },
			noOptions: undefined,
			badTokens: undefined,
			notInstalled: undefined,
		});
	});

	test('reads the load progress of a starting model and the memory warning of installed families', () => {
		const install = { contentId: 'c', modelId: 'A' };
		const activeOf = (server: string, load: unknown) => readLocalModelStatus({ schemaVersion: 1, active: { familyId: 'a', contentId: 'c', servingGeneration: 1, server, load } })?.active?.load;
		const warningOf = (memoryWarning: unknown, withInstall = true) => readLocalModelStatus({ schemaVersion: 1, families: [{ familyId: 'a', capiId: 'a', displayName: 'A', install: withInstall ? install : undefined, memoryWarning }] })?.families[0].memoryWarning;
		assert.deepStrictEqual({
			loading: activeOf('starting', { step: 'loading', startedAt: 1_700_000_000_000, expectedMs: 42_000 }),
			firstLoad: activeOf('starting', { step: 'warmingUp', startedAt: 5, expectedMs: 0 }),
			retry: activeOf('starting', { step: 'warmingUp', startedAt: 5, retry: 'withoutSpeculativeDecoding' }),
			unknownRetry: activeOf('starting', { step: 'loading', startedAt: 5, retry: 'withSmallerContext' }),
			unknownStep: activeOf('starting', { step: 'downloading', startedAt: 5 }),
			badStart: activeOf('starting', { step: 'loading', startedAt: -1 }),
			notStarting: activeOf('ready', { step: 'loading', startedAt: 5 }),
			warning: warningOf({ requiredBytes: 70, capacityBytes: 64 }),
			badWarning: warningOf({ requiredBytes: 70 }),
			notInstalled: warningOf({ requiredBytes: 70, capacityBytes: 64 }, false),
		}, {
			loading: { step: 'loading', startedAt: 1_700_000_000_000, expectedMs: 42_000 },
			firstLoad: { step: 'warmingUp', startedAt: 5 },
			retry: { step: 'warmingUp', startedAt: 5, retry: 'withoutSpeculativeDecoding' },
			unknownRetry: { step: 'loading', startedAt: 5 },
			unknownStep: undefined,
			badStart: undefined,
			notStarting: undefined,
			warning: { requiredBytes: 70, capacityBytes: 64 },
			badWarning: undefined,
			notInstalled: undefined,
		});
	});

	test('derives readiness in plan order', () => {
		const installed: ILocalModelFamilyV1 = { ...family, operation: undefined, entry: undefined, install: { contentId: 'c1', adopted: false, owned: true, modelId: 'MAI' } };
		const active = (server: 'ready' | 'starting' | 'error') => ({ familyId: family.familyId, contentId: 'c1', servingGeneration: 1, server });
		assert.deepStrictEqual({
			running: deriveLocalModelReadiness(family, {}),
			paused: deriveLocalModelReadiness({ ...family, operation: { ...family.operation!, state: 'paused' } }, {}),
			error: deriveLocalModelReadiness({ ...family, operation: { ...family.operation!, state: 'error' } }, {}),
			ready: deriveLocalModelReadiness(installed, { active: active('ready') }),
			serverError: deriveLocalModelReadiness(installed, { active: active('error') }),
			loading: deriveLocalModelReadiness(installed, { active: active('starting') }),
			inactive: deriveLocalModelReadiness(installed, {}),
			download: deriveLocalModelReadiness({ ...family, operation: undefined }, {}),
			foundOnDevice: deriveLocalModelReadiness({ ...family, operation: undefined, offer: undefined, entry: { modelFilesPresent: true } }, {}),
			nothing: deriveLocalModelReadiness({ ...family, operation: undefined, offer: undefined, entry: undefined }, {}),
		}, {
			running: 'preparing',
			paused: 'paused',
			error: 'error',
			ready: 'ready',
			serverError: 'error',
			loading: 'installed',
			inactive: 'installed',
			download: 'requiresSetup',
			foundOnDevice: 'requiresSetup',
			nothing: undefined,
		});
	});

	test('validates requests including per-action targets', () => {
		const consent = { scope: '[2]' };
		assert.deepStrictEqual({
			setUp: isLocalModelRequest({ nonce: 'n', action: 'setUp', familyId: 'f', consent }),
			setUpWithoutConsent: isLocalModelRequest({ nonce: 'n', action: 'setUp', familyId: 'f' }),
			setUpWithoutFamily: isLocalModelRequest({ nonce: 'n', action: 'setUp', consent }),
			cancel: isLocalModelRequest({ nonce: 'n', action: 'cancel', operationId: 'op' }),
			cancelWithoutOperation: isLocalModelRequest({ nonce: 'n', action: 'cancel' }),
			start: isLocalModelRequest({ nonce: 'n', action: 'start' }),
			removedUpdateRuntime: isLocalModelRequest({ nonce: 'n', action: 'updateRuntime' }),
			removedApproveRuntime: isLocalModelRequest({ nonce: 'n', action: 'approveRuntime', consent }),
			unknownAction: isLocalModelRequest({ nonce: 'n', action: 'format' }),
			removedReplaceWithPublic: isLocalModelRequest({ nonce: 'n', action: 'replaceWithPublic', familyId: 'f', consent }),
			emptyNonce: isLocalModelRequest({ nonce: '', action: 'start' }),
			// An older client's consent also says how llama.cpp is provided: only the scope counts.
			olderClientConsent: isLocalModelRequest({ nonce: 'n', action: 'setUp', familyId: 'f', consent: { scope: 's', runtimeChoice: 'useDetected' } }),
			getLlamaCppIsNotARequest: isLocalModelRequest({ nonce: 'n', action: 'getLlamaCpp' }),
			setContextSize: isLocalModelRequest({ nonce: 'n', action: 'setContextSize', familyId: 'f', contextTokens: 131072 }),
			setContextSizeWithoutTokens: isLocalModelRequest({ nonce: 'n', action: 'setContextSize', familyId: 'f' }),
			setContextSizeWithoutFamily: isLocalModelRequest({ nonce: 'n', action: 'setContextSize', contextTokens: 131072 }),
			setContextSizeFractional: isLocalModelRequest({ nonce: 'n', action: 'setContextSize', familyId: 'f', contextTokens: 1.5 }),
			setContextSizeTooLarge: isLocalModelRequest({ nonce: 'n', action: 'setContextSize', familyId: 'f', contextTokens: 2 ** 40 }),
		}, {
			setUp: true,
			setUpWithoutConsent: false,
			setUpWithoutFamily: false,
			cancel: true,
			cancelWithoutOperation: false,
			start: true,
			removedUpdateRuntime: false,
			removedApproveRuntime: false,
			unknownAction: false,
			removedReplaceWithPublic: false,
			emptyNonce: false,
			olderClientConsent: true,
			getLlamaCppIsNotARequest: false,
			setContextSize: true,
			setContextSizeWithoutTokens: false,
			setContextSizeWithoutFamily: false,
			setContextSizeFractional: false,
			setContextSizeTooLarge: false,
		});
	});

	test('fingerprints only what the consent shows: a download covers the model, never llama.cpp', () => {
		const base = computeLocalModelConsentScope({ family });
		assert.deepStrictEqual({
			stable: computeLocalModelConsentScope({ family: { ...family, entry: { ...family.entry!, disk: { volume: 'D:', availableBytes: 1, requiredBytes: 2 } } } }) === base,
			sizeChanged: computeLocalModelConsentScope({ family: { ...family, offer: { ...family.offer!, downloadBytes: 1 } } }) === base,
			licenseChanged: computeLocalModelConsentScope({ family: { ...family, offer: { ...family.offer!, licenseName: 'Other' } } }) === base,
			filesNowPresent: computeLocalModelConsentScope({ family: { ...family, entry: { ...family.entry!, modelFilesPresent: true } } }) === base,
			model: JSON.parse(base),
		}, {
			stable: true,
			sizeChanged: false,
			licenseChanged: false,
			filesNowPresent: false,
			model: [3, 'model', family.familyId, [56_688_834_848, 56_688_834_848, 'MIT', 'https://example.com/license'], false],
		});
	});
	test('reads and writes turn execution and model row metadata', () => {
		const usage = { inputTokens: 1, outputTokens: 2, model: 'auto', _meta: { cost: 1, ...createLocalModelTurnExecutionMeta({ execution: 'fallback', fallbackReason: 'slotsFull', fallbackModel: 'gpt-5.5' }) } };
		assert.deepStrictEqual({
			execution: readLocalModelTurnExecution(usage),
			unknownExecution: readLocalModelTurnExecution({ inputTokens: 0, outputTokens: 0, model: 'auto', _meta: { 'vscode.localModel': { execution: 'teleported' } } }),
			absent: readLocalModelTurnExecution(undefined),
			selectsVSCodeUsage: readUsageInfoMeta({ inputTokens: 0, outputTokens: 0, model: 'auto', _meta: { 'vscode.localModel': { execution: 'local' } } }),
			row: readLocalModelRowMeta({ _meta: createLocalModelRowMeta({ familyId: 'f', contentId: 'c', active: true }) }),
			invalidRow: readLocalModelRowMeta({ _meta: { 'vscode.localModel': { familyId: 'f', active: true } } }),
		}, {
			execution: { execution: 'fallback', fallbackReason: 'slotsFull', fallbackModel: 'gpt-5.5' },
			unknownExecution: undefined,
			absent: undefined,
			selectsVSCodeUsage: {},
			row: { familyId: 'f', contentId: 'c', active: true },
			invalidRow: undefined,
		});
	});
});
