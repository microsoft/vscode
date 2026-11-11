/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { checkAdmission, chooseServingProfile, classifyServerStartFailure, computeFitClass, computeFootprintBytes, nextServerDowngrade, parseListDevicesOutput, reportLocalModelEligibility, spareSystemBytes, spareSystemMemoryAfterAdmission, type IServerStartConfig, type ServerDowngradeStep, type ServerStartFailureKind } from '../../../node/copilot/localModelBridge/shim/servingProfile.js';
import { selectCandidateDevice } from '../../../node/copilot/localModelBridge/shim/shimLocalModelProvider.js';

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

/** `llama-server --list-devices` on the N1X device (winget b11459). */
const N1X_LIST_DEVICES = [
	'Available devices:',
	'  Vulkan0: NVIDIA RTX Spark N1X (6144-core Blackwell RTX GPU) (68784 MiB, 68784 MiB free)',
	'',
].join('\r\n');
const N1X_SYSTEM_MEMORY = Math.round(118.4979 * GiB);
/** A hypothetical MAI requirement of 62 GB (`recommendedVramBytes`). */
const MAI_REQUIRED = 62_000_000_000;

suite('localModel servingProfile', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses --list-devices (N1X fixture, Metal, none, garbage)', () => {
		assert.deepStrictEqual({
			n1x: parseListDevicesOutput(N1X_LIST_DEVICES),
			metalAndVulkan: parseListDevicesOutput('Available devices:\n  MTL0: Apple M4 Max (98304 MiB, 97000 MiB free)\n  Vulkan1: AMD Radeon RX 7900 XTX (24560 MiB, 99999 MiB free)\n'),
			none: parseListDevicesOutput('Available devices:\n  (none)\n'),
			garbage: parseListDevicesOutput('error: unknown argument: --list-devices\n'),
		}, {
			n1x: [{ name: 'Vulkan0', description: 'NVIDIA RTX Spark N1X (6144-core Blackwell RTX GPU)', totalBytes: 68784 * MiB, freeBytes: 68784 * MiB, backend: 'vulkan' }],
			metalAndVulkan: [
				{ name: 'MTL0', description: 'Apple M4 Max', totalBytes: 98304 * MiB, freeBytes: 97000 * MiB, backend: 'metal' },
				{ name: 'Vulkan1', description: 'AMD Radeon RX 7900 XTX', totalBytes: 24560 * MiB, freeBytes: 24560 * MiB, backend: 'vulkan' },
			],
			none: [],
			garbage: undefined,
		});
	});

	test('fit classes at, just above and just below NEAR_FIT_RATIO, and with too little spare RAM', () => {
		const required = 100 * GiB;
		const fit = (capacity: number | undefined, systemMemory = 256 * GiB, counted = 0) => computeFitClass({ capacityBytes: capacity, requiredBytes: required, systemMemoryBytes: systemMemory, systemMemoryCountedAsGpuBytes: counted });
		assert.deepStrictEqual({
			full: fit(100 * GiB),
			atRatio: fit(85 * GiB),
			aboveRatio: fit(86 * GiB),
			belowRatio: fit(85 * GiB - 1),
			spareRamInsufficient: fit(90 * GiB, 16 * GiB),
			unifiedSpareInsufficient: fit(90 * GiB, 108 * GiB, 90 * GiB),
			unknown: fit(undefined),
			spareOn128: Math.round(spareSystemBytes({ systemMemoryBytes: 128 * GiB, systemMemoryCountedAsGpuBytes: 0 }) / GiB * 10) / 10,
			spareOn64: spareSystemBytes({ systemMemoryBytes: 64 * GiB, systemMemoryCountedAsGpuBytes: 0 }) / GiB,
		}, {
			full: 'full',
			atRatio: 'near',
			aboveRatio: 'near',
			belowRatio: 'insufficient',
			spareRamInsufficient: 'insufficient',
			unifiedSpareInsufficient: 'insufficient',
			unknown: 'unknown',
			spareOn128: 115.2,
			spareOn64: 56,
		});
	});

	test('device selection: the N1X device, and a unified APU next to a smaller discrete GPU', () => {
		const n1x = parseListDevicesOutput(N1X_LIST_DEVICES)!.map(device => ({ ...device, unifiedMemory: true }));
		const [dgpu, apu] = parseListDevicesOutput('Available devices:\n  Vulkan0: AMD Radeon RX 7600 (8176 MiB, 8000 MiB free)\n  Vulkan1: AMD Radeon 8060S Graphics (98304 MiB, 98000 MiB free)\n')!;
		const apuAndDgpu = [{ ...dgpu, unifiedMemory: false }, { ...apu, unifiedMemory: true }];
		assert.deepStrictEqual({
			n1x: selectCandidateDevice(n1x, MAI_REQUIRED, N1X_SYSTEM_MEMORY),
			apu: selectCandidateDevice(apuAndDgpu, MAI_REQUIRED, 128 * GiB)?.device.name,
			tooSmall: selectCandidateDevice(apuAndDgpu.slice(0, 1), MAI_REQUIRED, 128 * GiB),
		}, {
			n1x: { device: n1x[0], fit: 'full' },
			apu: 'Vulkan1',
			tooSmall: undefined,
		});
	});

	test('serving profiles for the reference devices', () => {
		const profile = (capacityGiB: number, systemGiB: number, unified: boolean) => {
			const result = chooseServingProfile({ capacityBytes: capacityGiB * GiB, systemMemoryBytes: systemGiB * GiB, systemMemoryCountedAsGpuBytes: unified ? capacityGiB * GiB : 0, ctxSize: 262_144, requiredBytes: MAI_REQUIRED });
			return result ? `${result.profile}@${result.ctxSize}` : 'hidden';
		};
		assert.deepStrictEqual({
			n1xStageB: profile(68784 / 1024, 118.4979, true),
			snapdragonLargeShare: profile(96, 128, true),
			snapdragonSmallShare: profile(55, 128, true),
			mac128: profile(0.75 * 128, 128, true),
			mac64: profile(0.75 * 64, 64, true),
			dgpu24With128: profile(24, 128, false),
		}, {
			n1xStageB: 'full-gpu@262144',
			snapdragonLargeShare: 'full-gpu@262144',
			snapdragonSmallShare: 'near-fit@262144',
			mac128: 'full-gpu@262144',
			mac64: 'hidden',
			dgpu24With128: 'hidden',
		});
	});

	test('near-fit overrides and the reduced-context steps (never below 65536)', () => {
		const weights = 50 * GiB;
		const footprintAt = (ctx: number) => computeFootprintBytes({ primaryBytes: weights, draftBytes: 0, contextBytes: ctx * 98_304 });
		const at = (capacityGiB: number) => chooseServingProfile({ capacityBytes: capacityGiB * GiB, systemMemoryBytes: 80 * GiB, systemMemoryCountedAsGpuBytes: capacityGiB * GiB, ctxSize: 262_144, footprintAt, requiredBytes: 0 });
		assert.deepStrictEqual({
			footprints: [262_144, 131_072, 65_536].map(ctx => Math.round(footprintAt(ctx) / GiB * 10) / 10),
			full: at(90),
			reduced: at(64),
			lastStep: at(52),
			none: at(48),
		}, {
			footprints: [75.7, 63.5, 57.4],
			full: { profile: 'full-gpu', fit: 'full', ctxSize: 262_144, ctxReduced: false, overrides: {} },
			reduced: { profile: 'near-fit', fit: 'near', ctxSize: 131_072, ctxReduced: true, overrides: { fit: 'on', nGpuLayers: 'auto', specDraftNgl: 'all' } },
			lastStep: { profile: 'near-fit', fit: 'near', ctxSize: 65_536, ctxReduced: true, overrides: { fit: 'on', nGpuLayers: 'auto', specDraftNgl: 'all' } },
			none: undefined,
		});
	});

	test('start-failure downgrade sequence', () => {
		const walk = (start: IServerStartConfig, failure: ServerStartFailureKind) => {
			const steps: string[] = [];
			const attempted: ServerDowngradeStep[] = [];
			let config = start;
			for (let next = nextServerDowngrade(config, attempted, failure); next; next = nextServerDowngrade(config, attempted, failure)) {
				attempted.push(next.step);
				config = next.config;
				steps.push(`${next.step}:${config.flashAttn}/${config.speculative}/${config.ctxSize}`);
			}
			return steps;
		};
		// winget b11459 loading MAI-Code-1.1-Flash v5 on the N1X device (paths shortened).
		const unknownArchitecture = [
			'0.00.102.227 I srv    load_model: loading model \'C:\\models\\MAI-Code-1.1-Flash-Q2-XS.gguf\'',
			'0.00.252.163 E llama_model_load: error loading model: unknown model architecture: \'maion-coder\'',
			'0.00.252.175 E llama_model_load_from_file_impl: failed to load model',
			'0.00.397.148 E srv  llama_server: exiting due to model loading error',
		].join('\n');
		assert.deepStrictEqual({
			oom: walk({ flashAttn: 'on', speculative: true, ctxSize: 262_144 }, 'outOfMemory'),
			unsupportedNoSpec: walk({ flashAttn: 'auto', speculative: false, ctxSize: 131_072 }, 'unsupportedFeature'),
			genericCrash: walk({ flashAttn: 'on', speculative: true, ctxSize: 262_144 }, 'other'),
			unknownArchitecture: walk({ flashAttn: 'on', speculative: true, ctxSize: 262_144 }, 'unsupportedArchitecture'),
			classified: [
				classifyServerStartFailure('ggml_vulkan: Device memory allocation of size 123 failed.\nvk::Device::allocateMemory: ErrorOutOfDeviceMemory'),
				classifyServerStartFailure('error: flash_attn is not supported on this device'),
				classifyServerStartFailure('Segmentation fault'),
				classifyServerStartFailure(unknownArchitecture),
			],
		}, {
			oom: ['flashAttnAuto:auto/true/262144', 'dropSpeculative:auto/false/262144', 'reduceContext:auto/false/131072', 'reduceContext:auto/false/65536'],
			unsupportedNoSpec: ['reduceContext:auto/false/65536'],
			genericCrash: [],
			unknownArchitecture: [],
			classified: ['outOfMemory', 'unsupportedFeature', 'other', 'unsupportedArchitecture'],
		});
	});

	test('a DFlash build that asserts on its first completion is specUnsupported: one step without speculative decoding, then the rest of the sequence; never for generic crashes', () => {
		// mai-coder-llamacpp 0.4.1-dev (build 4, commit 9a3ad6c), MAI-Code-1.1-Flash v5 with DFlash on the N1X device: healthy, then this on the first completion.
		const dflashAssert = 'C:\\src\\t\\mai-coder-llamacpp\\src\\llama-graph.cpp:1379: GGML_ASSERT(t_layer_inp[il] != nullptr && "layer input tensor is null") failed';
		const classify = (text: string, speculative: boolean, phase: 'load' | 'warmUp' | 'firstRequest') => classifyServerStartFailure(text, { speculative, phase });
		const spec: IServerStartConfig = { flashAttn: 'on', speculative: true, ctxSize: 262_144 };
		const afterDrop = nextServerDowngrade(spec, [], 'specUnsupported');
		assert.deepStrictEqual({
			classified: {
				warmUpAssert: classify(dflashAssert, true, 'warmUp'),
				warmUpSilentCrash: classify('', true, 'warmUp'),
				firstRequestAssert: classify(dflashAssert, true, 'firstRequest'),
				firstRequestGenericCrash: classify('Segmentation fault', true, 'firstRequest'),
				loadAssert: classify(dflashAssert, true, 'load'),
				withoutSpeculative: classify(dflashAssert, false, 'warmUp'),
				outOfMemoryFirst: classify('cudaMalloc failed: out of memory', true, 'warmUp'),
				noContext: classifyServerStartFailure(dflashAssert),
			},
			steps: {
				first: afterDrop,
				again: nextServerDowngrade(afterDrop!.config, ['dropSpeculative'], 'specUnsupported'),
				thenOutOfMemory: nextServerDowngrade(afterDrop!.config, ['dropSpeculative'], 'outOfMemory'),
				noSpeculative: nextServerDowngrade({ ...spec, speculative: false }, [], 'specUnsupported'),
			},
		}, {
			classified: {
				warmUpAssert: 'specUnsupported',
				warmUpSilentCrash: 'specUnsupported',
				firstRequestAssert: 'specUnsupported',
				firstRequestGenericCrash: 'other',
				loadAssert: 'other',
				withoutSpeculative: 'other',
				outOfMemoryFirst: 'outOfMemory',
				noContext: 'other',
			},
			steps: {
				first: { step: 'dropSpeculative', config: { flashAttn: 'on', speculative: false, ctxSize: 262_144 } },
				again: undefined,
				thenOutOfMemory: { step: 'flashAttnAuto', config: { flashAttn: 'auto', speculative: false, ctxSize: 262_144 } },
				noSpeculative: undefined,
			},
		});
	});

	test('MAI v3 footprint and admission (memoryBusy when free memory dropped)', () => {
		const footprint = computeFootprintBytes({ primaryBytes: 56_307_620_832, draftBytes: 381_214_016, contextBytes: 6 * GiB });
		assert.deepStrictEqual({
			footprintGiB: Math.round(footprint / GiB * 100) / 100,
			admittedN1x: checkAdmission({ profile: 'full-gpu', footprintBytes: footprint, deviceFreeBytes: 68784 * MiB, systemFreeBytes: 100 * GiB, systemMemoryBytes: N1X_SYSTEM_MEMORY }).admitted,
			busy: checkAdmission({ profile: 'full-gpu', footprintBytes: footprint, deviceFreeBytes: 40 * GiB, systemFreeBytes: 100 * GiB, systemMemoryBytes: N1X_SYSTEM_MEMORY }),
			nearFitWithRam: checkAdmission({ profile: 'near-fit', footprintBytes: 70 * GiB, deviceFreeBytes: 62 * GiB, systemFreeBytes: 30 * GiB, systemMemoryBytes: 128 * GiB }).admitted,
			nearFitPressure: checkAdmission({ profile: 'near-fit', footprintBytes: 70 * GiB, deviceFreeBytes: 62 * GiB, systemFreeBytes: 14 * GiB, systemMemoryBytes: 128 * GiB }).admitted,
		}, {
			footprintGiB: 60.22,
			admittedN1x: true,
			busy: { admitted: false, availableBytes: 40 * GiB, neededBytes: footprint },
			nearFitWithRam: true,
			nearFitPressure: false,
		});
	});

	test('system memory still spare after admission: all of it for full-gpu, less what near-fit keeps outside the GPU, less the whole model on unified memory', () => {
		// 64 GiB of RAM keeps the minimum 8 GiB reserve.
		const spareAfter = (profile: 'full-gpu' | 'near-fit', deviceFreeGiB: number, systemFreeGiB: number, unifiedMemory = false) =>
			spareSystemMemoryAfterAdmission({ profile, footprintBytes: 10 * GiB, deviceFreeBytes: deviceFreeGiB * GiB, systemFreeBytes: systemFreeGiB * GiB, systemMemoryBytes: 64 * GiB }, unifiedMemory) / GiB;
		assert.deepStrictEqual({
			fullGpu: spareAfter('full-gpu', 20, 30),
			nearFit: spareAfter('near-fit', 8, 30),
			nearFitWithoutSpare: spareAfter('near-fit', 8, 9),
			unified: spareAfter('full-gpu', 30, 30, true),
		}, { fullGpu: 22, nearFit: 20, nearFitWithoutSpare: 0, unified: 12 });
	});

	test('eligibility telemetry uses measurements for numbers and booleans', () => {
		const events: { name: string; data: unknown }[] = [];
		reportLocalModelEligibility({ publicLog2: (name: string, data?: unknown) => events.push({ name, data }) } as never, {
			stage: 'llamaCpp', fitClass: 'full', visible: true, target: 'win32-arm64', backend: 'vulkan', profile: 'full-gpu',
			gpuMemoryGiB: 67.2, requiredGpuGiB: 57.7, systemMemoryGiB: 118.5, stageADeltaGiB: -35.4, confidence: 'measured',
		});
		assert.deepStrictEqual(events.map(event => event.name), ['localModel.eligibility']);
	});
});
