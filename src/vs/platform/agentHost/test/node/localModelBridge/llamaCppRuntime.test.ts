/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import { buildArchitectureProbeArgs, buildProbeEnvironment, classifyArchitectureProbe, classifyLlamaProbeFailure, createLlamaRuntimeMissingError, createRuntimeUnsupportedModelError, LlamaCppRuntime, llamaArchitectureFirstBuild, parseLlamaServerHelp, parseLlamaServerVersion, qualifyLlamaServerHelp, sanitizeLlamaArchitecture } from '../../../node/copilot/localModelBridge/shim/llamaCppRuntime.js';
import { buildSyntheticGguf } from '../../../node/copilot/localModelBridge/shim/gguf.js';
import type { IProcessRunner, IProcessRunOptions, IProcessRunResult } from '../../../node/copilot/localModelBridge/shim/processRunner.js';

/** `llama-server --version` from the winget `ggml.llamacpp` package on the N1X device. */
const N1X_VERSION = 'version: 0.6.0-dev (build 11459, commit f498f864f)\r\nbuilt with Clang 20.1.8 for Windows arm64\r\n';

/** Excerpt of `llama-server --help` (b11459, N1X device): every option line VS Code relies on, plus prose that mentions flags. */
const N1X_HELP = [
	'----- common params -----',
	'',
	'-c,    --ctx-size N                     size of the prompt context (default: 0, 0 = loaded from model)',
	'-b,    --batch-size N                   logical maximum batch size (default: 2048)',
	'-ub,   --ubatch-size N                  physical maximum batch size (default: 512)',
	'-fa,   --flash-attn [on|off|auto]       set Flash Attention use (\'on\', \'off\', or \'auto\', default: \'auto\')',
	'--no-host                               bypass host buffer allowing extra buffers to be used',
	'-dev,  --device <dev1,dev2,..>          comma-separated list of devices to use for offloading (none = don\'t',
	'                                        offload)',
	'                                        use --list-devices to see a list of available devices',
	'--list-devices                          print list of available devices and exit',
	'-ngl,  --gpu-layers, --n-gpu-layers N   max. number of layers to store in VRAM, either an exact number,',
	'-sm,   --split-mode {none,layer,row,tensor}',
	'                                        how to split the model across multiple GPUs, one of:',
	'-fit,  --fit [on|off]                   whether to adjust unset arguments to fit in device memory (\'on\' or',
	'-fitc, --fit-ctx N                      minimum ctx size that can be set by --fit option, default: 4096',
	'-m,    --model FNAME                    model path to load',
	'--temp, --temperature N                 temperature (default: 0.80)',
	'--top-k N                               top-k sampling (default: 40, 0 = disabled)',
	'--top-p N                               top-p sampling (default: 0.95, 1.0 = disabled)',
	'--min-p N                               min-p sampling (default: 0.05, 0.0 = disabled)',
	'--spec-draft-n-max N                    number of tokens to draft for speculative decoding (default: 3)',
	'--spec-draft-p-min, --draft-p-min P     minimum speculative decoding probability (greedy) (default: 0.00)',
	'--spec-draft-device, -devd, --device-draft <dev1,dev2,..>',
	'--spec-draft-ngl, -ngld, --gpu-layers-draft, --n-gpu-layers-draft N',
	'--spec-draft-model, -md, --model-draft FNAME',
	'--spec-type none,draft-simple,draft-eagle3,draft-mtp,draft-dflash,draft-dspark,ngram-simple,ngram-map-k,ngram-map-k4v,ngram-mod,ngram-cache',
	'                                        comma-separated list of types of speculative decoding to use (default:',
	'--draft, --draft-n, --draft-max N       the argument has been removed. use --spec-draft-n-max or',
	'                                        --spec-imaginary-flag-in-prose',
	'-ctxcp, --ctx-checkpoints, --swa-checkpoints N',
	'-cram, --cache-ram N                    set the maximum cache size in MiB (default: 8192, -1 - no limit, 0 -',
	'-np,   --parallel N                     number of server slots (default: -1, -1 = auto)',
	'-a,    --alias STRING                   set model name aliases, comma-separated (to be used by API)',
	'--host HOST                             IP addresses to listen on, comma-separated, or UNIX socket paths',
	'--port PORT                             port to listen (default: 8080)',
	'--api-key KEY                           API key to use for authentication, multiple keys can be provided as a',
	'--jinja, --no-jinja                     whether to use jinja template engine for chat (default: enabled)',
].join('\r\n');

const N1X_LIST_DEVICES = 'Available devices:\r\n  Vulkan0: NVIDIA RTX Spark N1X (6144-core Blackwell RTX GPU) (68784 MiB, 68784 MiB free)\r\n';
const HELP_WITHOUT_FIT = N1X_HELP.split('\r\n').filter(line => !line.startsWith('-fit,')).join('\r\n');
const HELP_WITHOUT_DFLASH = N1X_HELP.replace('draft-dflash,', '');

/** The architecture probe's synthetic model, as llama-server prints its path. */
const PROBE_GGUF = 'C:\\Users\\u\\AppData\\Local\\Temp\\vscode-local-model-probe\\arch-AbCdEf\\architecture-probe.gguf';

/**
 * stderr of the architecture probe (`--model <synthetic> --host 127.0.0.1 --port 0 --fit off --n-gpu-layers 0`, the key in `LLAMA_API_KEY`),
 * winget `ggml.llamacpp` b11459 on the N1X device; exit code 1 in both cases.
 */
const B11459_ARCH_UNSUPPORTED_STDERR = [
	'0.00.308.166 I srv  llama_server: initializing ...',
	'0.00.308.173 I cmn  common_param: common_params_print_info: verbosity = 3 (adjust with the `-lv N` CLI arg)',
	`0.00.317.368 I srv    load_model: loading model '${PROBE_GGUF}'`,
	'0.00.318.364 E llama_model_load: error loading model: unknown model architecture: \'maion-coder\'',
	'0.00.318.375 E llama_model_load_from_file_impl: failed to load model',
	`0.00.318.381 E cmn  common_init_: failed to load model '${PROBE_GGUF}'`,
	`0.00.318.384 E srv    load_model: failed to load model, '${PROBE_GGUF}'`,
	'0.00.318.393 I srv    operator(): operator(): cleaning up before exit...',
	'0.00.319.503 E srv  llama_server: exiting due to model loading error',
	'',
].join('\n');
const B11459_ARCH_SUPPORTED_STDERR = [
	'0.00.093.484 I srv  llama_server: initializing ...',
	'0.00.093.497 I cmn  common_param: common_params_print_info: verbosity = 3 (adjust with the `-lv N` CLI arg)',
	`0.00.103.345 I srv    load_model: loading model '${PROBE_GGUF}'`,
	'0.00.105.987 E llama_model_load: error loading model: error loading model hyperparameters: key not found in model: qwen3.context_length',
	'0.00.105.993 E llama_model_load_from_file_impl: failed to load model',
	`0.00.105.996 E cmn  common_init_: failed to load model '${PROBE_GGUF}'`,
	`0.00.105.998 E srv    load_model: failed to load model, '${PROBE_GGUF}'`,
	'0.00.106.003 I srv    operator(): operator(): cleaning up before exit...',
	'0.00.106.907 E srv  llama_server: exiting due to model loading error',
	'',
].join('\n');

/** Where the directions point VS Code at a `llama-server`, as Settings names it. */
const SERVER_PATH_SETTING = 'Chat \u203a Copilot \u203a Local Model: Llama Server Path (chat.copilot.localModel.llamaServerPath)';

/** The setting's `llama-server` (its real path, as the fake file system resolves it). */
const EXE = 'C:\\llama\\llama-server.exe';

function ok(stdout: string): IProcessRunResult {
	return { exitCode: 0, signal: undefined, stdout, stderr: '', timedOut: false, truncated: false, aborted: false };
}

function failed(overrides: Partial<IProcessRunResult>): IProcessRunResult {
	return { exitCode: 1, signal: undefined, stdout: '', stderr: '', timedOut: false, truncated: false, aborted: false, ...overrides };
}

class FakeRunner implements IProcessRunner {
	readonly calls: { file: string; args: readonly string[]; options: IProcessRunOptions }[] = [];
	constructor(readonly respond: (file: string, args: readonly string[]) => IProcessRunResult) { }
	async run(file: string, args: readonly string[], options: IProcessRunOptions): Promise<IProcessRunResult> {
		this.calls.push({ file, args, options });
		return this.respond(file, args);
	}
}

/** Serves a working b11459 build for every binary unless overridden. */
function llamaServer(overrides: Readonly<Record<string, Partial<Record<'version' | 'help' | 'devices', IProcessRunResult>>>> = {}) {
	return (file: string, args: readonly string[]): IProcessRunResult => {
		const custom = overrides[file];
		switch (args[0]) {
			case '--version': return custom?.version ?? ok(N1X_VERSION);
			case '--help': return custom?.help ?? ok(N1X_HELP);
			case '--list-devices': return custom?.devices ?? ok(N1X_LIST_DEVICES);
		}
		return failed({});
	};
}

function createStorage() {
	const data = new Map<string, unknown>();
	return { data, get: <T>(key: string) => data.get(key) as T | undefined, set: <T>(key: string, value: T) => { data.set(key, value); } };
}

suite('localModel llamaCppRuntime', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const tempDir = path.join(os.tmpdir(), `vscode-local-model-runtime-test-${process.pid}`);
	teardown(async () => {
		await fs.promises.rm(tempDir, { recursive: true, force: true });
	});

	/** A runtime on a fake file system: `files` maps each existing regular file to its real path, size, modification time and libraries. */
	function createRuntime(runner: FakeRunner, files: Map<string, { readonly realPath?: string; readonly size?: number; readonly mtimeMs?: number; readonly libraries?: string }> = new Map([[EXE, {}]])) {
		const storage = createStorage();
		const runtime = new LlamaCppRuntime({
			storage,
			log: new NullLogService(),
			runner,
			platform: 'win32',
			env: { PATH: 'C:\\Windows\\System32', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local', SystemRoot: 'C:\\Windows', USERPROFILE: 'C:\\Users\\u', GITHUB_TOKEN: 'ghp_secretsecretsecretsecretsecret', LLAMACPP_SERVER_PATH: 'C:\\env\\llama-server.exe' },
			tempDir,
			resolveFile: async filePath => {
				const file = files.get(filePath);
				return file && { realPath: file.realPath ?? filePath, size: file.size ?? 4096, mtimeMs: file.mtimeMs ?? 1, libraries: file.libraries ?? 'libraries' };
			},
		});
		return { runtime, storage, files };
	}

	test('parses --version in every format and --help from the option column only', () => {
		const help = parseLlamaServerHelp(N1X_HELP);
		assert.deepStrictEqual({
			n1x: parseLlamaServerVersion(N1X_VERSION),
			plain: parseLlamaServerVersion('version: 6123 (abc1234)\nbuilt with cc'),
			bPrefixed: parseLlamaServerVersion('version: b6123 (abc1234)'),
			homebrew: parseLlamaServerVersion('version: 6600 (8ff20609)\nbuilt with Apple clang version 17.0.0 for arm64-apple-darwin24.4.0'),
			semver: parseLlamaServerVersion('version: 1.2.3'),
			garbage: parseLlamaServerVersion('llama-server: unknown option'),
			proseFlagIgnored: help.flags.has('--spec-imaginary-flag-in-prose'),
			splitMode: help.flags.has('--split-mode'),
			specTypes: [...help.specTypes].includes('draft-dflash'),
			qualified: qualifyLlamaServerHelp(help, true),
			tooOld: qualifyLlamaServerHelp(parseLlamaServerHelp(HELP_WITHOUT_FIT), false),
			noDflash: qualifyLlamaServerHelp(parseLlamaServerHelp(HELP_WITHOUT_DFLASH), false),
		}, {
			n1x: { version: '0.6.0-dev', build: 11459, commit: 'f498f864f' },
			plain: { version: '6123', build: 6123, commit: 'abc1234' },
			bPrefixed: { version: 'b6123', build: 6123, commit: 'abc1234' },
			homebrew: { version: '6600', build: 6600, commit: '8ff20609' },
			semver: { version: '1.2.3' },
			garbage: undefined,
			proseFlagIgnored: false,
			splitMode: true,
			specTypes: true,
			qualified: { missingFlags: [], dflashSupported: true },
			tooOld: { missingFlags: ['--fit'], dflashSupported: true },
			noDflash: { missingFlags: [], dflashSupported: false },
		});
	});

	test('only the setting names a llama-server: nothing runs while the feature is off or the setting is empty; a path that is relative or names no file is runtimeNotFound', async () => {
		const runner = new FakeRunner(llamaServer());
		const { runtime } = createRuntime(runner);
		assert.deepStrictEqual({
			off: await runtime.resolve({ enabled: false, settingPath: EXE }),
			unset: await runtime.resolve({ enabled: true }),
			relative: (await runtime.resolve({ enabled: true, settingPath: 'llama-server.exe' })).error,
			missing: (await runtime.resolve({ enabled: true, settingPath: 'C:\\missing\\llama-server.exe' })).error?.code,
			calls: runner.calls.length,
		}, {
			off: { runtime: {} },
			unset: { runtime: {} },
			relative: { code: 'runtimeNotFound', message: '`chat.copilot.localModel.llamaServerPath` must be the absolute path of an existing llama-server executable. Install a llama.cpp build, then set it to its llama-server and select Retry.', actions: ['getLlamaCpp', 'openSettings', 'retry'] },
			missing: 'runtimeNotFound',
			calls: 0,
		});
	});

	test('the setting\'s llama-server is probed once in the sandbox (temp cwd, minimal credential-free env, timeouts, output caps) and cached while its real path, size, modification time, libraries and the GPU topology are unchanged; a retargeted link probes its new target', async () => {
		const runner = new FakeRunner(llamaServer());
		const link = 'C:\\links\\llama-server.exe';
		const upgraded = 'C:\\llama-b12000\\llama-server.exe';
		const { runtime, files } = createRuntime(runner, new Map([[link, { realPath: EXE }]]));
		const resolved = await runtime.resolve({ enabled: true, settingPath: link, topologyKey: 't1' });
		const probes = runner.calls.map(call => ({ file: call.file, args: call.args, cwd: call.options.cwd, timeoutMs: call.options.timeoutMs, maxOutputBytes: call.options.maxOutputBytes, envKeys: Object.keys(call.options.env ?? {}).sort() }));
		const probeCount = () => runner.calls.length - probes.length;
		await runtime.resolve({ enabled: true, settingPath: link, topologyKey: 't1' });
		const cached = probeCount();
		await runtime.resolve({ enabled: true, settingPath: link, topologyKey: 't2' });
		const afterTopologyChange = probeCount();
		files.set(link, { realPath: EXE, mtimeMs: 2 });
		await runtime.resolve({ enabled: true, settingPath: link, topologyKey: 't2' });
		const afterReplacement = probeCount();
		// A GPU backend beside the binary was repaired; the binary itself is unchanged.
		files.set(link, { realPath: EXE, mtimeMs: 2, libraries: 'repaired' });
		await runtime.resolve({ enabled: true, settingPath: link, topologyKey: 't2' });
		const afterLibraryChange = probeCount();
		files.set(link, { realPath: upgraded });
		const retargeted = await runtime.resolve({ enabled: true, settingPath: link, topologyKey: 't2' });
		const afterRetarget = probeCount();
		await runtime.resolve({ enabled: true, settingPath: link, topologyKey: 't2' });
		assert.deepStrictEqual({ runtime: resolved.runtime, devices: resolved.capability?.devices, probes, cached, afterTopologyChange, afterReplacement, afterLibraryChange, afterRetarget, retargeted: [retargeted.capability?.realPath, ...runner.calls.slice(-3).map(call => call.file)], unchangedAgain: probeCount() }, {
			runtime: { version: '0.6.0-dev (b11459)', backend: 'vulkan' },
			devices: [{ name: 'Vulkan0', description: 'NVIDIA RTX Spark N1X (6144-core Blackwell RTX GPU)', totalBytes: 68784 * 1024 * 1024, backend: 'vulkan' }],
			probes: [['--version', 64 * 1024], ['--help', 256 * 1024], ['--list-devices', 64 * 1024]].map(([arg, cap]) => ({
				file: EXE,
				args: [arg],
				cwd: tempDir,
				timeoutMs: 10_000,
				maxOutputBytes: cap,
				envKeys: ['LOCALAPPDATA', 'PATH', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'windir'],
			})),
			cached: 0,
			afterTopologyChange: 3,
			afterReplacement: 6,
			afterLibraryChange: 9,
			afterRetarget: 12,
			retargeted: [upgraded, upgraded, upgraded, upgraded],
			unchangedAgain: 12,
		});
	});

	test('a qualification without a GPU device is never cached: every resolve (Retry) probes again until a device appears, then the build is cached', async () => {
		let devices = ok('Available devices:\r\n  (none)\r\n');
		const runner = new FakeRunner((file, args) => args[0] === '--list-devices' ? devices : llamaServer()(file, args));
		const { runtime, storage } = createRuntime(runner);
		const resolveOnce = async () => {
			const before = runner.calls.length;
			const { capability, error } = await runtime.resolve({ enabled: true, settingPath: EXE, topologyKey: 't1' });
			return { probes: runner.calls.length - before, error: error?.code, devices: capability?.devices.map(device => device.name), cached: Object.keys(storage.data.get('localModel.runtimeCapabilities') ?? {}) };
		};
		const noDevice = await resolveOnce();
		const retry = await resolveOnce();
		// A GPU driver (or the Vulkan loader) was installed; nothing beside llama-server changed.
		devices = ok(N1X_LIST_DEVICES);
		const repaired = await resolveOnce();
		const unchanged = await resolveOnce();
		assert.deepStrictEqual({ noDevice, retry, repaired, unchanged }, {
			noDevice: { probes: 3, error: 'gpuRuntimeMissing', devices: undefined, cached: [] },
			retry: { probes: 3, error: 'gpuRuntimeMissing', devices: undefined, cached: [] },
			repaired: { probes: 3, error: undefined, devices: ['Vulkan0'], cached: [EXE] },
			unchanged: { probes: 0, error: undefined, devices: ['Vulkan0'], cached: [EXE] },
		});
	});

	test('a build is its llama-server and the llama.cpp libraries beside it, by name, size and modification time: repairing or adding a backend or GPU runtime probes it again; other files don\'t count', async () => {
		const directory = path.join(tempDir, 'build');
		await fs.promises.mkdir(directory, { recursive: true });
		const server = path.join(directory, 'llama-server.exe');
		await fs.promises.writeFile(server, 'server');
		await fs.promises.writeFile(path.join(directory, 'ggml-vulkan.dll'), 'broken');
		const runner = new FakeRunner(llamaServer());
		const runtime = new LlamaCppRuntime({ storage: createStorage(), log: new NullLogService(), runner, platform: process.platform, env: {}, tempDir });
		const probesAfter = async (change: () => Promise<void>) => {
			await change();
			const before = runner.calls.length;
			await runtime.resolve({ enabled: true, settingPath: server });
			return runner.calls.length - before;
		};
		const write = (name: string, content: string) => () => fs.promises.writeFile(path.join(directory, name), content);
		assert.deepStrictEqual({
			first: await probesAfter(async () => { }),
			unchanged: await probesAfter(async () => { }),
			otherFiles: await probesAfter(async () => {
				await write('README.md', 'docs')();
				await write('llama-cli.exe', 'cli')();
			}),
			repairedBackend: await probesAfter(write('ggml-vulkan.dll', 'repaired backend')),
			addedGpuRuntime: await probesAfter(write('cudart64_12.dll', 'cuda runtime')),
			addedSharedObject: await probesAfter(write('libllama.so.0', 'llama')),
		}, { first: 3, unchanged: 0, otherFiles: 0, repairedBackend: 3, addedGpuRuntime: 3, addedSharedObject: 3 });
	});

	test('a setting whose llama-server can\'t serve reports why: blocked, too old or without a GPU device', async () => {
		const blocked = 'C:\\blocked\\llama-server.exe';
		const tooOld = 'C:\\old\\llama-server.exe';
		const noDevice = 'C:\\cpu\\llama-server.exe';
		const runner = new FakeRunner(llamaServer({
			[blocked]: { version: failed({ exitCode: undefined, spawnErrorCode: 'EPERM' }) },
			[tooOld]: { help: ok(HELP_WITHOUT_FIT) },
			[noDevice]: { devices: ok('Available devices:\r\n  (none)\r\n') },
		}));
		const { runtime } = createRuntime(runner, new Map([[blocked, {}], [tooOld, {}], [noDevice, {}], [EXE, {}]]));
		const errorOf = async (settingPath: string) => {
			const { runtime: shown, capability, error } = await runtime.resolve({ enabled: true, settingPath });
			return { shown, capability: !!capability, error: error && [error.code, error.actions] };
		};
		assert.deepStrictEqual({
			blocked: await errorOf(blocked),
			tooOld: await errorOf(tooOld),
			noDevice: await errorOf(noDevice),
			tooOldMessage: (await runtime.resolve({ enabled: true, settingPath: tooOld })).error?.message,
		}, {
			blocked: { shown: {}, capability: false, error: ['runtimeBlocked', ['openSettings']] },
			tooOld: { shown: {}, capability: false, error: ['runtimeTooOld', ['getLlamaCpp', 'openSettings', 'retry']] },
			noDevice: { shown: {}, capability: false, error: ['gpuRuntimeMissing', ['retry']] },
			tooOldMessage: `The llama-server at ${tooOld} is missing features VS Code needs (--fit). Install a newer llama.cpp build, then set ${SERVER_PATH_SETTING} to its llama-server and select Retry.`,
		});
	});

	test('execution failures are classified per platform', () => {
		assert.deepStrictEqual({
			eperm: classifyLlamaProbeFailure(failed({ exitCode: undefined, spawnErrorCode: 'EPERM' }), 'win32'),
			eacces: classifyLlamaProbeFailure(failed({ exitCode: undefined, spawnErrorCode: 'EACCES' }), 'linux'),
			invalidImageHash: classifyLlamaProbeFailure(failed({ exitCode: 0xC0000428 }), 'win32'),
			dllMissing: classifyLlamaProbeFailure(failed({ exitCode: 0xC0000135 }), 'win32'),
			glibc: classifyLlamaProbeFailure(failed({ stderr: './llama-server: /lib/x86_64-linux-gnu/libstdc++.so.6: version `GLIBCXX_3.4.32\' not found' }), 'linux'),
			vulkan: classifyLlamaProbeFailure(failed({ stderr: './llama-server: error while loading shared libraries: libvulkan.so.1: cannot open shared object file: No such file or directory' }), 'linux'),
			sharedObject: classifyLlamaProbeFailure(failed({ stderr: 'error while loading shared libraries: libgomp.so.1: cannot open shared object file' }), 'linux'),
			gatekeeper: classifyLlamaProbeFailure(failed({ exitCode: undefined, signal: 'SIGKILL' }), 'darwin'),
			timeout: classifyLlamaProbeFailure(failed({ exitCode: undefined, signal: 'SIGKILL', timedOut: true }), 'linux'),
		}, {
			eperm: { code: 'runtimeBlocked' },
			eacces: { code: 'runtimeBlocked' },
			invalidImageHash: { code: 'runtimeBlocked' },
			dllMissing: { code: 'runtimeLibraryMissing' },
			glibc: { code: 'runtimeLibraryMissing', library: 'GLIBCXX_3.4.32' },
			vulkan: { code: 'gpuRuntimeMissing' },
			sharedObject: { code: 'runtimeLibraryMissing', library: 'libgomp.so.1' },
			gatekeeper: { code: 'runtimeBlocked' },
			timeout: { code: 'probeFailed' },
		});
	});

	test('the probe environment keeps only what the loader and GPU drivers need, and the device selection', () => {
		assert.deepStrictEqual({
			posixEnv: buildProbeEnvironment('linux', { HOME: '/home/u', GITHUB_TOKEN: 'x', LD_PRELOAD: '/evil.so', VK_ICD_FILENAMES: '/icd.json', CUDA_VISIBLE_DEVICES: '1', LLAMA_API_KEY: 'host', LLAMA_ARG_HOST: '0.0.0.0' }, '/opt/llama', '/tmp/p'),
			// The server inherits the device selection, so the probe lists the same (renumbered) devices it binds.
			winDeviceSelection: buildProbeEnvironment('win32', { SystemRoot: 'C:\\Windows', CUDA_VISIBLE_DEVICES: '1', GGML_VK_VISIBLE_DEVICES: '0', GITHUB_TOKEN: 'x' }, 'C:\\llama', 'C:\\t'),
			// A probe that starts a server (the architecture probe) gets its own key, never the host's.
			withKey: buildProbeEnvironment('linux', { HOME: '/home/u', LLAMA_API_KEY: 'host' }, '/opt/llama', '/tmp/p', 'probe-key'),
		}, {
			posixEnv: { HOME: '/home/u', VK_ICD_FILENAMES: '/icd.json', CUDA_VISIBLE_DEVICES: '1', TMPDIR: '/tmp/p', PATH: '/opt/llama:/usr/bin:/bin' },
			winDeviceSelection: { CUDA_VISIBLE_DEVICES: '1', GGML_VK_VISIBLE_DEVICES: '0', SystemRoot: 'C:\\Windows', windir: 'C:\\Windows', TEMP: 'C:\\t', TMP: 'C:\\t', PATH: 'C:\\llama;C:\\Windows\\System32;C:\\Windows' },
			withKey: { HOME: '/home/u', TMPDIR: '/tmp/p', PATH: '/opt/llama:/usr/bin:/bin', LLAMA_API_KEY: 'probe-key' },
		});
	});

	test('architecture probe: b11459 stderr classification, name validation, command line and error', () => {
		assert.deepStrictEqual({
			unsupported: classifyArchitectureProbe(failed({ stderr: B11459_ARCH_UNSUPPORTED_STDERR })),
			supported: classifyArchitectureProbe(failed({ stderr: B11459_ARCH_SUPPORTED_STDERR })),
			olderFormat: classifyArchitectureProbe(failed({ stderr: 'llama_model_load: error loading model: error loading model architecture: unknown model architecture: \'maion-coder\'\n' })),
			vocabulary: classifyArchitectureProbe(failed({ stderr: 'llama_model_load: error loading model: error loading model vocabulary: unknown pre-tokenizer type\n' })),
			timeout: classifyArchitectureProbe(failed({ exitCode: undefined, signal: 'SIGKILL', timedOut: true, stderr: B11459_ARCH_SUPPORTED_STDERR.split('\n').slice(0, 3).join('\n') })),
			crash: classifyArchitectureProbe(failed({ exitCode: 0xC0000005, stderr: '0.00.093.484 I srv  llama_server: initializing ...\n' })),
			invalidArgument: classifyArchitectureProbe(failed({ stderr: 'error: invalid argument: --fit\n' })),
			blocked: classifyArchitectureProbe(failed({ exitCode: undefined, spawnErrorCode: 'EPERM' })),
			cleanExit: classifyArchitectureProbe(ok('')),
			aborted: classifyArchitectureProbe(failed({ aborted: true, stderr: B11459_ARCH_UNSUPPORTED_STDERR })),
			names: ['maion-coder', 'qwen3', 'gpt-oss', 'ernie4_5-moe', 'a.b', 'Qwen3', '', '-coder', 'maion coder', 'x\';rm', 'x'.repeat(64), 'x'.repeat(65)].map(sanitizeLlamaArchitecture),
			args: buildArchitectureProbeArgs(PROBE_GGUF),
			error: createRuntimeUnsupportedModelError('0.6.0-dev (b11459)', 'Example Flash 1.0'),
			errorWithoutVersion: createRuntimeUnsupportedModelError(undefined, 'Example Flash 1.0').message,
			packagedArchitecture: createRuntimeUnsupportedModelError('0.6.0-dev (b11459)', 'Some Coder', 'qwen3').actions,
			newArchitecture: createRuntimeUnsupportedModelError('0.6.0-dev (b11459)', 'MAI Code 1.1 Flash', 'maion-coder'),
			newArchitectureWithoutVersion: createRuntimeUnsupportedModelError(undefined, 'MAI Code 1.1 Flash', 'MAION-CODER').message,
			missing: createLlamaRuntimeMissingError('MAI Code 1.1 Flash'),
			firstBuilds: ['maion-coder', 'qwen3', undefined, '__proto__'].map(llamaArchitectureFirstBuild),
		}, {
			unsupported: 'unsupported',
			supported: 'supported',
			olderFormat: 'unsupported',
			vocabulary: 'supported',
			timeout: 'unknown',
			crash: 'unknown',
			invalidArgument: 'unknown',
			blocked: 'unknown',
			cleanExit: 'unknown',
			aborted: 'unknown',
			names: ['maion-coder', 'qwen3', 'gpt-oss', 'ernie4_5-moe', 'a.b', undefined, undefined, undefined, undefined, undefined, 'x'.repeat(64), undefined],
			args: ['--model', PROBE_GGUF, '--host', '127.0.0.1', '--port', '0', '--fit', 'off', '--n-gpu-layers', '0'],
			// Every way llama.cpp can't run a model gives the same directions: VS Code doesn't install it.
			error: {
				code: 'runtimeUnsupportedModel',
				message: `This llama.cpp build (0.6.0-dev (b11459)) can't run Example Flash 1.0. Install a llama.cpp build that supports it, then set ${SERVER_PATH_SETTING} to its llama-server and select Retry.`,
				actions: ['getLlamaCpp', 'openSettings', 'retry'],
			},
			errorWithoutVersion: `This llama.cpp build can't run Example Flash 1.0. Install a llama.cpp build that supports it, then set ${SERVER_PATH_SETTING} to its llama-server and select Retry.`,
			packagedArchitecture: ['getLlamaCpp', 'openSettings', 'retry'],
			// MAI's architecture needs llama.cpp b11658 or later (ggml-org/llama.cpp#29778): the directions name that release.
			newArchitecture: {
				code: 'runtimeUnsupportedModel',
				message: `This llama.cpp build (0.6.0-dev (b11459)) can't run MAI Code 1.1 Flash. Install llama.cpp b11658 or later, then set ${SERVER_PATH_SETTING} to its llama-server and select Retry.`,
				actions: ['getLlamaCpp', 'openSettings', 'retry'],
			},
			newArchitectureWithoutVersion: `This llama.cpp build can't run MAI Code 1.1 Flash. Install llama.cpp b11658 or later, then set ${SERVER_PATH_SETTING} to its llama-server and select Retry.`,
			missing: {
				code: 'runtimeNotFound',
				message: `MAI Code 1.1 Flash needs llama.cpp to run. Install a llama.cpp build that supports it, then set ${SERVER_PATH_SETTING} to its llama-server and select Retry.`,
				actions: ['getLlamaCpp', 'openSettings', 'retry'],
			},
			firstBuilds: [11658, undefined, undefined, undefined],
		});
	});

	test('architecture probe: runs the setting\'s build on a private synthetic GGUF, caches by build and architecture; another build is probed again', async () => {
		const known = ['maion-coder', 'qwen3', 'llama', 'slowarch'];
		const probed: string[] = [];
		const runner = new FakeRunner((file, args) => {
			if (args[0] !== '--model') {
				return llamaServer()(file, args);
			}
			// The synthetic model exists while the probe runs and holds only general.architecture.
			const bytes = fs.readFileSync(args[1]);
			const architecture = known.find(name => Buffer.from(buildSyntheticGguf({ 'general.architecture': name })).equals(bytes)) ?? '?';
			probed.push(architecture);
			switch (architecture) {
				case 'maion-coder': return failed({ stderr: B11459_ARCH_UNSUPPORTED_STDERR });
				case 'qwen3': return failed({ stderr: B11459_ARCH_SUPPORTED_STDERR });
				case 'llama': return failed({ stderr: B11459_ARCH_SUPPORTED_STDERR.replace(/qwen3/g, 'llama') });
				default: return failed({ exitCode: undefined, signal: 'SIGKILL', timedOut: true });
			}
		});
		const { runtime } = createRuntime(runner);
		const build = { realPath: EXE, size: 4096, mtimeMs: 1, libraries: 'libraries' };
		const answers = {
			unsupported: await runtime.checkArchitectureSupport(build, 'maion-coder'),
			cached: await runtime.checkArchitectureSupport(build, 'maion-coder'),
			qwen3: await runtime.checkArchitectureSupport(build, 'qwen3'),
			llama: await runtime.checkArchitectureSupport(build, 'llama'),
			timeout: await runtime.checkArchitectureSupport(build, 'slowarch'),
			timeoutAgain: await runtime.checkArchitectureSupport(build, 'slowarch'),
			invalidName: await runtime.checkArchitectureSupport(build, 'Maion Coder'),
		};
		const probedBeforeUpdate = [...probed];
		// llama.cpp was updated in place, or a library beside it replaced: no answer carries over.
		const afterUpdate = await runtime.checkArchitectureSupport({ ...build, mtimeMs: 2 }, 'maion-coder');
		const afterLibraryChange = await runtime.checkArchitectureSupport({ ...build, libraries: 'replaced' }, 'maion-coder');
		const call = runner.calls.find(candidateCall => candidateCall.args[0] === '--model')!;
		assert.deepStrictEqual({
			answers,
			probedBeforeUpdate,
			afterUpdate,
			afterLibraryChange,
			probed: probed.length,
			args: call.args.map((arg, index) => index === 1 ? path.basename(arg) : arg),
			modelDir: path.dirname(path.dirname(call.args[1])) === tempDir && path.basename(path.dirname(call.args[1])).startsWith('arch-'),
			options: { cwd: call.options.cwd, timeoutMs: call.options.timeoutMs, maxOutputBytes: call.options.maxOutputBytes, env: Object.keys(call.options.env ?? {}).sort() },
			// The probe's random key reaches it only in the environment, never on the command line.
			apiKey: /^[0-9a-f]{32}$/.test(call.options.env?.LLAMA_API_KEY ?? ''),
			leftovers: (await fs.promises.readdir(tempDir)).filter(name => name.startsWith('arch-')),
		}, {
			answers: { unsupported: 'unsupported', cached: 'unsupported', qwen3: 'supported', llama: 'supported', timeout: 'unknown', timeoutAgain: 'unknown', invalidName: 'unknown' },
			probedBeforeUpdate: ['maion-coder', 'qwen3', 'llama', 'slowarch', 'slowarch'],
			afterUpdate: 'unsupported',
			afterLibraryChange: 'unsupported',
			probed: 7,
			args: ['--model', 'architecture-probe.gguf', '--host', '127.0.0.1', '--port', '0', '--fit', 'off', '--n-gpu-layers', '0'],
			modelDir: true,
			options: { cwd: tempDir, timeoutMs: 10_000, maxOutputBytes: 64 * 1024, env: ['LLAMA_API_KEY', 'LOCALAPPDATA', 'PATH', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'windir'] },
			apiKey: true,
			leftovers: [],
		});
	});
});
