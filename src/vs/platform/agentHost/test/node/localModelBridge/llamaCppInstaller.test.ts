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
import { buildArchitectureProbeArgs, buildProbeEnvironment, classifyArchitectureProbe, classifyLlamaProbeFailure, computeLlamaRuntimeDigest, createLlamaRuntimeMissingError, createRuntimeUnsupportedModelError, expandWindowsEnvironmentVariables, getLlamaRuntimeLibraryLocations, isTrustedPathEntry, listLlamaServerCandidates, LLAMA_RUNTIME_DIGEST_MAX_BYTES, LLAMA_RUNTIME_DIGEST_MAX_FILES, LlamaCppRuntime, LlamaServerApprovalStore, parseLlamaServerHelp, parseLlamaServerVersion, qualifyLlamaServerHelp, sanitizeLlamaArchitecture, unpackagedLlamaArchitectureChange, type ILlamaDetectionHost } from '../../../node/copilot/localModelBridge/shim/llamaCppInstaller.js';
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

const LOCAL = 'C:\\Users\\u\\AppData\\Local';
const WINGET_DIR = `${LOCAL}\\Microsoft\\WinGet\\Packages\\ggml.llamacpp_Microsoft.Winget.Source_8wekyb3d8bbwe`;
const WINGET_EXE = `${WINGET_DIR}\\llama-server.exe`;

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

/** The runtime digest of `(relative path, sha256[, size = 4096])` entries, as the fake stat reports sizes. */
function digestOf(...files: readonly (readonly [path: string, sha256: string, size?: number])[]): string {
	return computeLlamaRuntimeDigest(files.map(([file, sha256, size]) => ({ path: file, size: size ?? 4096, sha256 })));
}

function createStorage() {
	const data = new Map<string, unknown>();
	return { data, get: <T>(key: string) => data.get(key) as T | undefined, set: <T>(key: string, value: T) => { data.set(key, value); } };
}

interface IFakeHostInput {
	readonly platform: NodeJS.Platform;
	readonly env: Record<string, string>;
	/** Existing files → real path. */
	readonly files: Record<string, string>;
	readonly dirs?: Record<string, string[]>;
	readonly livePaths?: string[];
	readonly workspaceFolders?: string[];
	readonly homeDir?: string;
	/** Directories → real path (symlinked roots). */
	readonly realDirs?: Record<string, string>;
}

function createHost(input: IFakeHostInput): ILlamaDetectionHost & { files: Record<string, string> } {
	const key = (p: string) => input.platform === 'win32' ? p.toLowerCase() : p;
	const lookup = (p: string) => Object.entries(input.files).find(([file]) => key(file) === key(p))?.[1];
	return {
		files: input.files,
		platform: input.platform,
		env: input.env,
		homeDir: input.homeDir ?? (input.platform === 'win32' ? 'C:\\Users\\u' : '/home/u'),
		workspaceFolders: input.workspaceFolders ?? [],
		isFile: async p => lookup(p) !== undefined,
		realpath: async p => {
			const real = lookup(p) ?? Object.entries(input.realDirs ?? {}).find(([dir]) => key(dir) === key(p))?.[1];
			if (!real) {
				throw new Error('ENOENT');
			}
			return real;
		},
		readdir: async p => {
			const listed = Object.entries(input.dirs ?? {}).find(([dir]) => key(dir) === key(p))?.[1];
			if (listed) {
				return listed;
			}
			// Otherwise the directory lists the files placed in it (by path or real path).
			const api = input.platform === 'win32' ? path.win32 : path.posix;
			const children = new Set([...Object.keys(input.files), ...Object.values(input.files)].filter(file => key(api.dirname(file)) === key(p)).map(file => api.basename(file)));
			if (!children.size) {
				throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
			}
			return [...children];
		},
		readLiveWindowsPaths: async () => input.livePaths ?? [],
	};
}

const WIN_HOST: IFakeHostInput = {
	platform: 'win32',
	env: { PATH: 'C:\\Windows\\System32', LOCALAPPDATA: LOCAL, SystemRoot: 'C:\\Windows', USERPROFILE: 'C:\\Users\\u', GITHUB_TOKEN: 'ghp_secretsecretsecretsecretsecret' },
	files: {},
	livePaths: ['%LOCALAPPDATA%\\Microsoft\\WinGet\\Packages\\ggml.llamacpp_Microsoft.Winget.Source_8wekyb3d8bbwe;C:\\Windows\\System32'],
	dirs: { [`${LOCAL}\\Microsoft\\WinGet\\Packages`]: ['ggml.llamacpp_Microsoft.Winget.Source_8wekyb3d8bbwe', 'Git.Git_8wekyb3d8bbwe'] },
	realDirs: { [WINGET_DIR]: WINGET_DIR },
};

suite('localModel llamaCppInstaller', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const tempDir = path.join(os.tmpdir(), `vscode-local-model-installer-test-${process.pid}`);
	teardown(async () => {
		await fs.promises.rm(tempDir, { recursive: true, force: true });
	});

	function createRuntime(host: ILlamaDetectionHost & { files: Record<string, string> }, runner: FakeRunner, options: { storage?: ReturnType<typeof createStorage>; hashes?: Map<string, string>; mtimes?: Map<string, number>; sizes?: Map<string, number>; unreadable?: ReadonlySet<string> } = {}) {
		const storage = options.storage ?? createStorage();
		const hashes = options.hashes ?? new Map<string, string>();
		const mtimes = options.mtimes ?? new Map<string, number>();
		const sizes = options.sizes ?? new Map<string, number>();
		const hashed: string[] = [];
		const runtime = new LlamaCppRuntime({
			storage,
			log: new NullLogService(),
			runner,
			platform: host.platform,
			env: host.env,
			homeDir: host.homeDir,
			tempDir,
			detectionHost: host,
			stat: async p => ({ mtimeMs: mtimes.get(p) ?? 1, size: sizes.get(p) ?? 4096 }),
			hashFile: async p => {
				hashed.push(p);
				if (options.unreadable?.has(p)) {
					throw new Error('EACCES');
				}
				return hashes.get(p) ?? `sha-${p.length}`;
			},
		});
		return { runtime, storage, hashes, mtimes, sizes, hashed };
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

	test('detection order and trust boundary on Windows (env → PATH incl. live registry PATH → known locations)', async () => {
		const host = createHost({
			...WIN_HOST,
			env: { ...WIN_HOST.env, PATH: 'C:\\tools;relative\\bin;;.;C:\\work\\repo\\bin;C:\\Windows\\System32', LLAMACPP_SERVER_PATH: 'C:\\env\\llama-server.exe' },
			workspaceFolders: ['C:\\work\\repo'],
			files: {
				'C:\\env\\llama-server.exe': 'C:\\env\\llama-server.exe',
				'C:\\tools\\llama-server.exe': 'C:\\tools\\llama-server.exe',
				'relative\\bin\\llama-server.exe': 'C:\\cwd\\relative\\bin\\llama-server.exe',
				'.\\llama-server.exe': 'C:\\cwd\\llama-server.exe',
				'C:\\work\\repo\\bin\\llama-server.exe': 'C:\\work\\repo\\bin\\llama-server.exe',
				[WINGET_EXE]: WINGET_EXE,
				[`${LOCAL}\\Microsoft\\WinGet\\Links\\llama-server.exe`]: WINGET_EXE,
			},
		});
		assert.deepStrictEqual({
			candidates: await listLlamaServerCandidates(host),
			expanded: expandWindowsEnvironmentVariables('%LocalAppData%\\x;%UNKNOWN%\\y', { LOCALAPPDATA: LOCAL }),
			trusted: ['C:\\tools', '', '.', 'relative\\bin', 'C:\\work\\repo\\bin', '\\\\server\\share'].map(entry => isTrustedPathEntry(entry, 'win32', ['C:\\work\\repo'])),
		}, {
			candidates: [
				{ path: 'C:\\env\\llama-server.exe', realPath: 'C:\\env\\llama-server.exe', source: 'env' },
				{ path: 'C:\\tools\\llama-server.exe', realPath: 'C:\\tools\\llama-server.exe', source: 'path' },
				{ path: WINGET_EXE, realPath: WINGET_EXE, source: 'path' },
			],
			expanded: `${LOCAL}\\x;%UNKNOWN%\\y`,
			trusted: [true, false, false, false, false, true],
		});
	});

	test('detection on Linux: PATH, Homebrew (real path into the Cellar), apt, ~/.local/bin', async () => {
		const brewReal = '/home/linuxbrew/.linuxbrew/Cellar/llama.cpp/6600/bin/llama-server';
		const host = createHost({
			platform: 'linux',
			env: { PATH: '/home/u/proj/bin:bin:/usr/local/bin' },
			workspaceFolders: ['/home/u/proj'],
			files: {
				'/home/u/proj/bin/llama-server': '/home/u/proj/bin/llama-server',
				'/home/linuxbrew/.linuxbrew/bin/llama-server': brewReal,
				'/usr/bin/llama-server': '/usr/bin/llama-server',
				'/home/u/.local/bin/llama-server': '/home/u/.local/bin/llama-server',
			},
		});
		assert.deepStrictEqual(await listLlamaServerCandidates(host), [
			{ path: '/home/linuxbrew/.linuxbrew/bin/llama-server', realPath: brewReal, source: 'packageManager' },
			{ path: '/usr/bin/llama-server', realPath: '/usr/bin/llama-server', source: 'packageManager' },
			{ path: '/home/u/.local/bin/llama-server', realPath: '/home/u/.local/bin/llama-server', source: 'packageManager' },
		]);
	});

	test('binaries are never executed while the setting is off', async () => {
		const runner = new FakeRunner(llamaServer());
		const { runtime } = createRuntime(createHost({ ...WIN_HOST, files: { [WINGET_EXE]: WINGET_EXE } }), runner);
		const resolution = await runtime.resolve({ enabled: false });
		assert.deepStrictEqual({ resolution, calls: runner.calls.length }, { resolution: { runtime: { source: 'none', trust: 'none' }, approved: false }, calls: 0 });
	});

	test('a detected binary is never executed before approval: it resolves pending approval by its files only, is probed once approved; approval is keyed by real path and runtime digest', async () => {
		const runner = new FakeRunner(llamaServer());
		const { runtime, hashes, mtimes } = createRuntime(createHost({ ...WIN_HOST, files: { [WINGET_EXE]: WINGET_EXE } }), runner);
		hashes.set(WINGET_EXE, 'hash-1');
		const pending = await runtime.resolve({ enabled: true, topologyKey: '10de:2e03@32.0.16.1662' });
		const probesBeforeApproval = runner.calls.length;
		const approved = await runtime.approve(WINGET_EXE, digestOf(['llama-server.exe', 'hash-1']));
		const afterApproval = await runtime.resolve({ enabled: true, topologyKey: '10de:2e03@32.0.16.1662' });
		await runtime.resolve({ enabled: true, topologyKey: '10de:2e03@32.0.16.1662' });
		const probeCallsAfterCache = runner.calls.filter(call => call.file === WINGET_EXE).length;
		hashes.set(WINGET_EXE, 'hash-2');
		mtimes.set(WINGET_EXE, 2);
		const changedBinary = await runtime.resolve({ enabled: true, topologyKey: '10de:2e03@32.0.16.1662' });
		assert.deepStrictEqual({
			pending: pending.runtime,
			probesBeforeApproval,
			approved,
			afterApproval: [afterApproval.runtime.trust, afterApproval.approved, afterApproval.runtime.version],
			capabilityDevices: afterApproval.capability?.devices,
			probesRunOnce: probeCallsAfterCache,
			changedBinary: [changedBinary.runtime.trust, changedBinary.approved, changedBinary.runtime.path],
		}, {
			pending: { source: 'path', trust: 'pendingApproval', path: WINGET_EXE, sha256: digestOf(['llama-server.exe', 'hash-1']), size: 4096 },
			probesBeforeApproval: 0,
			approved: true,
			afterApproval: ['userApproved', true, '0.6.0-dev (b11459)'],
			capabilityDevices: [{ name: 'Vulkan0', description: 'NVIDIA RTX Spark N1X (6144-core Blackwell RTX GPU)', totalBytes: 68784 * 1024 * 1024, backend: 'vulkan' }],
			probesRunOnce: 3,
			changedBinary: ['pendingApproval', false, WINGET_EXE],
		});
	});

	test('probes are sandboxed: temp cwd, minimal credential-free env, timeouts and output caps', async () => {
		const runner = new FakeRunner(llamaServer());
		const { runtime } = createRuntime(createHost({ ...WIN_HOST, env: { ...WIN_HOST.env, LLAMACPP_SERVER_PATH: WINGET_EXE }, files: { [WINGET_EXE]: WINGET_EXE } }), runner);
		await runtime.resolve({ enabled: true });
		assert.deepStrictEqual(runner.calls.filter(call => call.file === WINGET_EXE).map(call => ({ file: call.file, args: call.args, cwd: call.options.cwd, timeoutMs: call.options.timeoutMs, maxOutputBytes: call.options.maxOutputBytes, envKeys: Object.keys(call.options.env ?? {}).sort() })), [
			['--version', 64 * 1024], ['--help', 256 * 1024], ['--list-devices', 64 * 1024],
		].map(([arg, cap]) => ({
			file: WINGET_EXE,
			args: [arg],
			cwd: tempDir,
			timeoutMs: 10_000,
			maxOutputBytes: cap,
			envKeys: ['LOCALAPPDATA', 'PATH', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'windir'],
		})));
	});

	test('an explicit setting reports errors without falling back; verified detected failures are skipped silently', async () => {
		const blocked = 'C:\\blocked\\llama-server.exe';
		const tooOld = 'C:\\old\\llama-server.exe';
		const runner = new FakeRunner(llamaServer({
			[blocked]: { version: failed({ exitCode: undefined, spawnErrorCode: 'EPERM' }) },
			[tooOld]: { help: ok(HELP_WITHOUT_FIT) },
		}));
		const host = createHost({ ...WIN_HOST, env: { ...WIN_HOST.env, PATH: 'C:\\good', LLAMACPP_SERVER_PATH: blocked }, files: { [blocked]: blocked, [tooOld]: tooOld, 'C:\\good\\llama-server.exe': 'C:\\good\\llama-server.exe' } });
		const { runtime } = createRuntime(host, runner);
		const settingBlocked = await runtime.resolve({ enabled: true, settingPath: blocked });
		const settingRelative = await runtime.resolve({ enabled: true, settingPath: 'llama-server.exe' });
		const settingTooOld = await runtime.resolve({ enabled: true, settingPath: tooOld });
		runner.calls.length = 0;
		const detected = await runtime.resolve({ enabled: true });
		assert.deepStrictEqual({
			settingBlocked: [settingBlocked.runtime.source, settingBlocked.error?.code, settingBlocked.error?.actions],
			settingRelative: settingRelative.error?.code,
			settingTooOld: [settingTooOld.error?.code, settingTooOld.error?.actions],
			detected: [detected.runtime.source, detected.candidate?.realPath, detected.error, detected.runtime.trust],
			executed: [...new Set(runner.calls.map(call => call.file))].filter(file => file.endsWith('llama-server.exe')),
		}, {
			settingBlocked: ['setting', 'runtimeBlocked', ['openSettings']],
			settingRelative: 'runtimeNotFound',
			settingTooOld: ['runtimeTooOld', ['getLlamaCpp', 'openSettings', 'retry']],
			// The blocked LLAMACPP_SERVER_PATH binary was probed and skipped; the PATH one waits, unexecuted, for approval.
			detected: ['path', 'C:\\good\\llama-server.exe', undefined, 'pendingApproval'],
			executed: [blocked],
		});
	});

	test('a qualifying explicit setting is approved by the setting for the digest it was probed with; a replacement runs only after it is probed again', async () => {
		const setting = 'C:\\custom\\llama-server.exe';
		const other = 'C:\\other\\llama-server.exe';
		const runner = new FakeRunner(llamaServer());
		const { runtime, hashes, storage } = createRuntime(createHost({ ...WIN_HOST, files: { [setting]: setting, [other]: other } }), runner);
		hashes.set(setting, 'first');
		const resolved = await runtime.resolve({ enabled: true, settingPath: setting });
		const verified = await runtime.verifyApproval({ path: setting, realPath: setting });
		hashes.set(setting, 'second');
		const replacedVerified = await runtime.verifyApproval({ path: setting, realPath: setting });
		const replacedListing = await runtime.listDevices({ path: setting, realPath: setting });
		const reresolved = await runtime.resolve({ enabled: true, settingPath: setting });
		const switched = await runtime.resolve({ enabled: true, settingPath: other });
		assert.deepStrictEqual({
			resolved: [resolved.runtime.source, resolved.runtime.trust, resolved.approved, resolved.runtime.path],
			verified,
			replaced: [replacedVerified, replacedListing.kind],
			reresolved: [reresolved.runtime.trust, reresolved.approved, reresolved.capability?.sha256],
			switched: [switched.runtime.trust, switched.approved, switched.candidate?.realPath],
			approvals: (storage.data.get('localModel.runtimeApprovals') as { realPath: string; digest: string; trust: string }[]).map(record => [record.realPath, record.digest, record.trust]),
		}, {
			resolved: ['setting', 'userApproved', true, undefined],
			verified: true,
			replaced: [false, 'untrusted'],
			reresolved: ['userApproved', true, digestOf(['llama-server.exe', 'second'])],
			switched: ['userApproved', true, other],
			approvals: [
				[setting, digestOf(['llama-server.exe', 'second']), 'userApproved'],
				[other, digestOf(['llama-server.exe', `sha-${other.length}`]), 'userApproved'],
			],
		});
	});

	test('a symlinked workspace root is excluded on both its lexical and resolved paths', async () => {
		const host = createHost({
			platform: 'linux',
			env: { PATH: '/real/repo/bin:/workspace/repo/tools:/elsewhere/bin:/opt/tools/bin' },
			workspaceFolders: ['/workspace/repo'],
			realDirs: { '/workspace/repo': '/real/repo' },
			files: {
				'/real/repo/bin/llama-server': '/real/repo/bin/llama-server',
				'/workspace/repo/tools/llama-server': '/real/repo/tools/llama-server',
				'/elsewhere/bin/llama-server': '/real/repo/build/llama-server',
				'/opt/tools/bin/llama-server': '/opt/tools/bin/llama-server',
			},
		});
		const runner = new FakeRunner(llamaServer());
		const { runtime } = createRuntime(host, runner);
		const resolution = await runtime.resolve({ enabled: true });
		assert.deepStrictEqual({
			candidates: (await listLlamaServerCandidates(host)).map(candidate => candidate.realPath),
			resolved: [resolution.candidate?.realPath, resolution.runtime.trust],
			executed: [...new Set(runner.calls.map(call => call.file))],
		}, {
			candidates: ['/opt/tools/bin/llama-server'],
			// Outside the workspace, but unapproved: reported by file only, never executed before approval.
			resolved: ['/opt/tools/bin/llama-server', 'pendingApproval'],
			executed: [],
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

	test('fail closed: before consent only verified binaries run; an unverified PATH binary is approved by its file hash and only then probed', async () => {
		const tools = 'C:\\tools\\llama-server.exe';
		const fromEnvPath = 'C:\\env\\llama-server.exe';
		const runner = new FakeRunner(llamaServer());
		const { runtime, hashes } = createRuntime(createHost({ ...WIN_HOST, env: { ...WIN_HOST.env, PATH: 'C:\\tools' }, files: { [tools]: tools } }), runner);
		hashes.set(tools, 'tools-hash');
		const executed = (calls: FakeRunner) => [...new Set(calls.calls.map(call => call.file))].filter(file => file.endsWith('llama-server.exe'));
		const pending = await runtime.resolve({ enabled: true });
		const beforeApproval = executed(runner);
		const wrongHash = await runtime.approve(tools, digestOf(['llama-server.exe', 'other-hash']));
		const approved = await runtime.approve(tools, digestOf(['llama-server.exe', 'tools-hash']));
		const after = await runtime.resolve({ enabled: true });
		// LLAMACPP_SERVER_PATH is set by the user: it is probed before consent (still pending approval).
		const envRunner = new FakeRunner(llamaServer());
		const fromEnv = await createRuntime(createHost({ ...WIN_HOST, env: { ...WIN_HOST.env, PATH: 'C:\\tools', LLAMACPP_SERVER_PATH: fromEnvPath }, files: { [tools]: tools, [fromEnvPath]: fromEnvPath } }), envRunner).runtime.resolve({ enabled: true });
		assert.deepStrictEqual({
			pending: { runtime: pending.runtime, unprobed: pending.unprobed, capability: pending.capability },
			beforeApproval,
			wrongHash,
			approved,
			after: [after.runtime.trust, after.runtime.version, after.approved, executed(runner)],
			fromEnv: [fromEnv.candidate?.realPath, fromEnv.runtime.trust, fromEnv.runtime.version, executed(envRunner)],
		}, {
			pending: { runtime: { source: 'path', trust: 'pendingApproval', path: tools, sha256: digestOf(['llama-server.exe', 'tools-hash']), size: 4096 }, unprobed: { size: 4096, sha256: digestOf(['llama-server.exe', 'tools-hash']) }, capability: undefined },
			beforeApproval: [],
			wrongHash: false,
			approved: true,
			after: ['userApproved', '0.6.0-dev (b11459)', true, [tools]],
			fromEnv: [fromEnvPath, 'pendingApproval', '0.6.0-dev (b11459)', [fromEnvPath]],
		});
	});

	test('an approved binary that fails qualification reports why instead of being skipped', async () => {
		const tools = 'C:\\tools\\llama-server.exe';
		const runner = new FakeRunner(llamaServer({ [tools]: { help: ok(HELP_WITHOUT_FIT) } }));
		const { runtime, hashes } = createRuntime(createHost({ ...WIN_HOST, env: { ...WIN_HOST.env, PATH: 'C:\\tools' }, files: { [tools]: tools } }), runner);
		hashes.set(tools, 'tools-hash');
		await runtime.resolve({ enabled: true });
		await runtime.approve(tools, digestOf(['llama-server.exe', 'tools-hash']));
		const after = await runtime.resolve({ enabled: true });
		assert.deepStrictEqual([after.runtime.trust, after.approved, after.candidate?.realPath, after.error?.code, after.error?.actions], ['none', false, tools, 'runtimeTooOld', ['getLlamaCpp', 'openSettings', 'retry']]);
	});

	test('trust comes only from a fresh digest: a same-size, same-mtime replacement of an approved binary is never probed, before or after a topology change; display-only refreshes do not hash', async () => {
		const tools = 'C:\\tools\\llama-server.exe';
		const runner = new FakeRunner(llamaServer());
		const { runtime, hashes, hashed } = createRuntime(createHost({ ...WIN_HOST, env: { ...WIN_HOST.env, PATH: 'C:\\tools' }, files: { [tools]: tools } }), runner);
		hashes.set(tools, 'approved-hash');
		await runtime.resolve({ enabled: true });
		await runtime.approve(tools, digestOf(['llama-server.exe', 'approved-hash']));
		const approved = await runtime.resolve({ enabled: true, topologyKey: 't1' });
		const hashedBefore = hashed.length;
		const display = await runtime.resolve({ enabled: true, topologyKey: 't1' });
		const hashesForDisplay = hashed.length - hashedBefore;
		const probesOf = () => runner.calls.filter(call => call.file === tools).length;
		const probesBefore = probesOf();
		// Same path, size and mtime (all a display-only refresh compares), different content.
		hashes.set(tools, 'replaced-hash');
		// The topology change needs a probe, so the digest is computed afresh first: no match, nothing runs.
		const afterTopologyChange = await runtime.resolve({ enabled: true, topologyKey: 't2' });
		const listing = await runtime.listDevices({ path: tools, realPath: tools });
		const verified = await runtime.verifyApproval({ path: tools, realPath: tools });
		const replaced = await runtime.resolve({ enabled: true, topologyKey: 't1' });
		assert.deepStrictEqual({
			approved: [approved.runtime.trust, approved.approved],
			display: [display.runtime.trust, hashesForDisplay],
			afterTopologyChange: [afterTopologyChange.runtime.trust, afterTopologyChange.runtime.sha256, !!afterTopologyChange.capability],
			listing,
			verified,
			replaced: [replaced.runtime.trust, replaced.approved, replaced.runtime.sha256, !!replaced.capability],
			probesOfReplacement: probesOf() - probesBefore,
			reapproveOld: await runtime.approve(tools, digestOf(['llama-server.exe', 'approved-hash'])),
		}, {
			approved: ['userApproved', true],
			display: ['userApproved', 0],
			afterTopologyChange: ['pendingApproval', digestOf(['llama-server.exe', 'replaced-hash']), false],
			listing: { kind: 'untrusted' },
			verified: false,
			replaced: ['pendingApproval', false, digestOf(['llama-server.exe', 'replaced-hash']), false],
			probesOfReplacement: 0,
			reapproveOld: false,
		});
	});

	test('the three probes run under one identity: a replacement after --version (approved, LLAMACPP_SERVER_PATH or the setting) never has --help or --list-devices executed, and nothing is cached', async () => {
		const tools = 'C:\\tools\\llama-server.exe';
		const setting = 'C:\\setting\\llama-server.exe';
		/** Replaces `file`'s content (its hash) right after its `probe` ran. */
		const replacing = (hashes: Map<string, string>, file: string, probe: string, armed: () => boolean = () => true, respond = llamaServer()) => (called: string, args: readonly string[]) => {
			if (armed() && called === file && args[0] === probe) {
				hashes.set(file, 'replaced');
			}
			return respond(called, args);
		};
		const probesOf = (runner: FakeRunner, file: string) => runner.calls.filter(call => call.file === file).map(call => call.args[0]);
		const capabilities = (storage: ReturnType<typeof createStorage>) => Object.values((storage.data.get('localModel.runtimeCapabilities') ?? {}) as Record<string, { sha256: string }>).map(capability => capability.sha256);

		// Approved: a topology change forces probing; the file changes right after --version.
		const approvedHashes = new Map([[tools, 'approved']]);
		let armed = false;
		const approvedRunner = new FakeRunner(replacing(approvedHashes, tools, '--version', () => armed));
		const approved = createRuntime(createHost({ ...WIN_HOST, env: { ...WIN_HOST.env, PATH: 'C:\\tools' }, files: { [tools]: tools } }), approvedRunner, { hashes: approvedHashes });
		await approved.runtime.resolve({ enabled: true });
		await approved.runtime.approve(tools, digestOf(['llama-server.exe', 'approved']));
		await approved.runtime.resolve({ enabled: true, topologyKey: 't1' });
		approvedRunner.calls.length = 0;
		approved.storage.data.delete('localModel.runtimeCapabilities');
		armed = true;
		const approvedResult = await approved.runtime.resolve({ enabled: true, topologyKey: 't2' });

		// LLAMACPP_SERVER_PATH: probed before consent, changed after --version.
		const envHashes = new Map([[WINGET_EXE, 'explicit']]);
		const envRunner = new FakeRunner(replacing(envHashes, WINGET_EXE, '--version'));
		const fromEnv = createRuntime(createHost({ ...WIN_HOST, env: { ...WIN_HOST.env, LLAMACPP_SERVER_PATH: WINGET_EXE }, files: { [WINGET_EXE]: WINGET_EXE } }), envRunner, { hashes: envHashes });
		const envResult = await fromEnv.runtime.resolve({ enabled: true });

		// Explicit setting: changed after --help.
		const settingHashes = new Map([[setting, 'explicit']]);
		const settingRunner = new FakeRunner(replacing(settingHashes, setting, '--help'));
		const explicit = createRuntime(createHost({ ...WIN_HOST, files: { [setting]: setting } }), settingRunner, { hashes: settingHashes });
		const settingResult = await explicit.runtime.resolve({ enabled: true, settingPath: setting });

		assert.deepStrictEqual({
			approved: { probes: probesOf(approvedRunner, tools), trust: approvedResult.runtime.trust, sha256: approvedResult.runtime.sha256, unprobed: !!approvedResult.unprobed, capabilities: capabilities(approved.storage) },
			env: { probes: probesOf(envRunner, WINGET_EXE), trust: envResult.runtime.trust, sha256: envResult.runtime.sha256, unprobed: !!envResult.unprobed, capabilities: capabilities(fromEnv.storage) },
			setting: { probes: probesOf(settingRunner, setting), trust: settingResult.runtime.trust, error: settingResult.error && { code: settingResult.error.code, actions: settingResult.error.actions }, capabilities: capabilities(explicit.storage) },
		}, {
			approved: { probes: ['--version'], trust: 'pendingApproval', sha256: digestOf(['llama-server.exe', 'replaced']), unprobed: true, capabilities: [] },
			env: { probes: ['--version'], trust: 'pendingApproval', sha256: digestOf(['llama-server.exe', 'replaced']), unprobed: true, capabilities: [] },
			setting: { probes: ['--version', '--help'], trust: 'none', error: { code: 'runtimeChanged', actions: ['retry'] }, capabilities: [] },
		});
	});

	test('a consent approves only the digest it showed: a same-path swap A to B while the dialog is open is rejected', async () => {
		const tools = 'C:\\tools\\llama-server.exe';
		const runner = new FakeRunner(llamaServer());
		const { runtime, hashes, storage } = createRuntime(createHost({ ...WIN_HOST, env: { ...WIN_HOST.env, PATH: 'C:\\tools' }, files: { [tools]: tools } }), runner);
		hashes.set(tools, 'hash-a');
		const shown = await runtime.resolve({ enabled: true });
		// Same size and mtime: approval still hashes afresh.
		hashes.set(tools, 'hash-b');
		const swapped = await runtime.approve(tools, shown.runtime.sha256!);
		assert.deepStrictEqual({ shown: shown.runtime.sha256, swapped, approvals: storage.data.get('localModel.runtimeApprovals') ?? 'none', executed: runner.calls.filter(call => call.file === tools).length }, {
			shown: digestOf(['llama-server.exe', 'hash-a']), swapped: false, approvals: 'none', executed: 0,
		});
	});

	test('the runtime digest covers the shared libraries: a modified sibling DLL with an unchanged exe is rejected and nothing runs; adding or removing a library changes the digest', async () => {
		const dir = 'C:\\tools';
		const exe = `${dir}\\llama-server.exe`;
		const impl = `${dir}\\llama-server-impl.dll`;
		const vulkan = `${dir}\\ggml-vulkan.dll`;
		const files: Record<string, string> = { [exe]: exe, [impl]: impl, [vulkan]: vulkan, [`${dir}\\readme.txt`]: `${dir}\\readme.txt` };
		const runner = new FakeRunner(llamaServer());
		const { runtime, hashes, mtimes, storage } = createRuntime(createHost({ ...WIN_HOST, env: { ...WIN_HOST.env, PATH: dir }, files }), runner);
		hashes.set(exe, 'exe').set(impl, 'impl').set(vulkan, 'vulkan');
		const shown = await runtime.resolve({ enabled: true });
		const approved = await runtime.approve(exe, shown.runtime.sha256!);
		const qualified = await runtime.resolve({ enabled: true });
		const probesOf = () => runner.calls.filter(call => call.file === exe).length;
		const probesBefore = probesOf();
		// The stub executable is untouched; the code it loads is replaced.
		hashes.set(impl, 'tampered');
		mtimes.set(impl, 2);
		const listing = await runtime.listDevices({ path: exe, realPath: exe });
		const afterTamper = await runtime.resolve({ enabled: true });
		hashes.set(impl, 'impl');
		mtimes.set(impl, 3);
		const restored = await runtime.resolve({ enabled: true });
		const added = `${dir}\\ggml-cuda.dll`;
		files[added] = added;
		const withAdded = await runtime.resolve({ enabled: true });
		delete files[added];
		delete files[vulkan];
		const withRemoved = await runtime.resolve({ enabled: true });
		assert.deepStrictEqual({
			shown: [shown.runtime.trust, shown.runtime.sha256, shown.runtime.size],
			approved,
			approvalRecord: (storage.data.get('localModel.runtimeApprovals') as { realPath: string; digest: string }[]).map(record => [record.realPath, record.digest]),
			qualified: [qualified.runtime.trust, qualified.approved],
			listing,
			afterTamper: [afterTamper.runtime.trust, afterTamper.approved, afterTamper.runtime.sha256],
			probesAfterTamper: probesOf() - probesBefore,
			restored: [restored.runtime.trust, restored.approved],
			withAdded: [withAdded.runtime.trust, withAdded.runtime.sha256],
			withRemoved: [withRemoved.runtime.trust, withRemoved.runtime.sha256],
		}, {
			shown: ['pendingApproval', digestOf(['llama-server.exe', 'exe'], ['llama-server-impl.dll', 'impl'], ['ggml-vulkan.dll', 'vulkan']), 3 * 4096],
			approved: true,
			approvalRecord: [[exe, digestOf(['llama-server.exe', 'exe'], ['llama-server-impl.dll', 'impl'], ['ggml-vulkan.dll', 'vulkan'])]],
			qualified: ['userApproved', true],
			listing: { kind: 'untrusted' },
			afterTamper: ['pendingApproval', false, digestOf(['llama-server.exe', 'exe'], ['llama-server-impl.dll', 'tampered'], ['ggml-vulkan.dll', 'vulkan'])],
			probesAfterTamper: 0,
			restored: ['userApproved', true],
			withAdded: ['pendingApproval', digestOf(['llama-server.exe', 'exe'], ['llama-server-impl.dll', 'impl'], ['ggml-vulkan.dll', 'vulkan'], ['ggml-cuda.dll', `sha-${added.length}`])],
			withRemoved: ['pendingApproval', digestOf(['llama-server.exe', 'exe'], ['llama-server-impl.dll', 'impl'])],
		});
	});

	test('library locations per OS: macOS and Linux also cover ../lib (symlink aliases hashed once); a missing ../lib is empty', async () => {
		const digestFor = async (platform: NodeJS.Platform, exe: string, files: Record<string, string>) => {
			const runner = new FakeRunner(llamaServer());
			const { runtime, hashed } = createRuntime(createHost({ platform, env: { PATH: path.posix.dirname(exe) }, homeDir: '/home/u', files: { [exe]: exe, ...files } }), runner);
			const resolution = await runtime.resolve({ enabled: true });
			return { sha256: resolution.runtime.sha256, hashed: [...new Set(hashed)].sort(), executed: runner.calls.filter(call => call.file === exe).length };
		};
		const brew = '/opt/homebrew/Cellar/llama.cpp/8000/bin/llama-server';
		const linux = '/opt/llama/bin/llama-server';
		assert.deepStrictEqual({
			locations: [getLlamaRuntimeLibraryLocations('win32'), getLlamaRuntimeLibraryLocations('darwin'), getLlamaRuntimeLibraryLocations('linux')].map(({ dirs, pattern }) => [dirs, pattern.source]),
			darwin: await digestFor('darwin', brew, {
				'/opt/homebrew/Cellar/llama.cpp/8000/lib/libllama.dylib': '/opt/homebrew/Cellar/llama.cpp/8000/lib/libllama.dylib',
				'/opt/homebrew/Cellar/llama.cpp/8000/lib/libllama.a': '/opt/homebrew/Cellar/llama.cpp/8000/lib/libllama.a',
			}),
			linux: await digestFor('linux', linux, {
				'/opt/llama/lib/libggml.so': '/opt/llama/lib/libggml.so.0.1',
				'/opt/llama/lib/libggml.so.0.1': '/opt/llama/lib/libggml.so.0.1',
				'/opt/llama/bin/libmtmd.so': '/opt/llama/bin/libmtmd.so',
			}),
			noLib: await digestFor('linux', '/srv/llama-server', {}),
		}, {
			locations: [[['.'], '\\.dll$'], [['.', '../lib'], '\\.dylib$'], [['.', '../lib'], '\\.so$|\\.so\\.']],
			darwin: { sha256: digestOf(['llama-server', `sha-${brew.length}`], ['../lib/libllama.dylib', `sha-${'/opt/homebrew/Cellar/llama.cpp/8000/lib/libllama.dylib'.length}`]), hashed: [brew, '/opt/homebrew/Cellar/llama.cpp/8000/lib/libllama.dylib'], executed: 0 },
			linux: {
				sha256: digestOf(['llama-server', `sha-${linux.length}`], ['libmtmd.so', `sha-${'/opt/llama/bin/libmtmd.so'.length}`], ['../lib/libggml.so', `sha-${'/opt/llama/lib/libggml.so.0.1'.length}`], ['../lib/libggml.so.0.1', `sha-${'/opt/llama/lib/libggml.so.0.1'.length}`]),
				hashed: ['/opt/llama/bin/libmtmd.so', linux, '/opt/llama/lib/libggml.so.0.1'],
				executed: 0,
			},
			noLib: { sha256: digestOf(['llama-server', `sha-${'/srv/llama-server'.length}`]), hashed: ['/srv/llama-server'], executed: 0 },
		});
	});

	test('an install beyond the digest caps (files or bytes) or with an unreadable library is unverifiable: pending approval with a reason, never run or approved', async () => {
		const dir = 'C:\\big';
		const exe = `${dir}\\llama-server.exe`;
		const outcome = async (files: Record<string, string>, sizes: Map<string, number> = new Map(), unreadable: ReadonlySet<string> = new Set()) => {
			const runner = new FakeRunner(llamaServer());
			const host = createHost({ ...WIN_HOST, env: { ...WIN_HOST.env, PATH: dir }, files: { [exe]: exe, ...files } });
			const { runtime } = createRuntime(host, runner, { sizes, unreadable });
			const resolution = await runtime.resolve({ enabled: true });
			return {
				runtime: resolution.runtime,
				error: resolution.error && { code: resolution.error.code, actions: resolution.error.actions },
				approve: await runtime.approve(exe, digestOf(['llama-server.exe', `sha-${exe.length}`])),
				listing: (await runtime.listDevices({ path: exe, realPath: exe })).kind,
				executed: runner.calls.filter(call => call.file === exe).length,
			};
		};
		const manyLibraries = Object.fromEntries(Array.from({ length: LLAMA_RUNTIME_DIGEST_MAX_FILES }, (_, index) => `${dir}\\lib${index}.dll`).map(file => [file, file]));
		const huge = `${dir}\\ggml-huge.dll`;
		const unverifiable = { runtime: { source: 'path', trust: 'pendingApproval', path: exe }, approve: false, listing: 'untrusted', executed: 0 };
		assert.deepStrictEqual({
			tooManyFiles: await outcome(manyLibraries),
			tooManyBytes: await outcome({ [huge]: huge }, new Map([[huge, LLAMA_RUNTIME_DIGEST_MAX_BYTES]])),
			unreadable: await outcome({ [huge]: huge }, new Map(), new Set([huge])),
		}, {
			tooManyFiles: { ...unverifiable, error: { code: 'runtimeUnverifiable', actions: ['openSettings'] } },
			tooManyBytes: { ...unverifiable, error: { code: 'runtimeUnverifiable', actions: ['openSettings'] } },
			unreadable: { ...unverifiable, error: { code: 'runtimeUnverifiable', actions: ['retry', 'openSettings'] } },
		});
	});

	test('a binary without a GPU device is not qualified (the next candidate is used); probe env', async () => {
		const runner = new FakeRunner(llamaServer({ [WINGET_EXE]: { devices: ok('Available devices:\r\n  (none)\r\n') } }));
		// LLAMACPP_SERVER_PATH names the binary, so it is probed before any approval.
		const env = { ...WIN_HOST.env, LLAMACPP_SERVER_PATH: WINGET_EXE };
		const { runtime } = createRuntime(createHost({ ...WIN_HOST, env, files: { [WINGET_EXE]: WINGET_EXE } }), runner);
		const resolution = await runtime.resolve({ enabled: true });
		const withFallback = createRuntime(createHost({ ...WIN_HOST, env, files: { [WINGET_EXE]: WINGET_EXE, [`${LOCAL}\\Microsoft\\WinGet\\Links\\llama-server.exe`]: 'C:\\cuda\\llama-server.exe' } }), runner).runtime;
		const fallback = await withFallback.resolve({ enabled: true });
		assert.deepStrictEqual({
			resolution: [resolution.runtime.source, resolution.error],
			fallback: [fallback.runtime.source, fallback.candidate?.realPath, fallback.runtime.trust, !!fallback.unprobed],
			posixEnv: buildProbeEnvironment('linux', { HOME: '/home/u', GITHUB_TOKEN: 'x', LD_PRELOAD: '/evil.so', VK_ICD_FILENAMES: '/icd.json', CUDA_VISIBLE_DEVICES: '1', LLAMA_API_KEY: 'host', LLAMA_ARG_HOST: '0.0.0.0' }, '/opt/llama', '/tmp/p'),
			// The server inherits the device selection, so the probe lists the same (renumbered) devices it binds.
			winDeviceSelection: buildProbeEnvironment('win32', { SystemRoot: 'C:\\Windows', CUDA_VISIBLE_DEVICES: '1', GGML_VK_VISIBLE_DEVICES: '0', GITHUB_TOKEN: 'x' }, 'C:\\llama', 'C:\\t'),
			// A probe that starts a server (the architecture probe) gets its own key, never the host's.
			withKey: buildProbeEnvironment('linux', { HOME: '/home/u', LLAMA_API_KEY: 'host' }, '/opt/llama', '/tmp/p', 'probe-key'),
		}, {
			resolution: ['none', undefined],
			fallback: ['packageManager', 'C:\\cuda\\llama-server.exe', 'pendingApproval', true],
			posixEnv: { HOME: '/home/u', VK_ICD_FILENAMES: '/icd.json', CUDA_VISIBLE_DEVICES: '1', TMPDIR: '/tmp/p', PATH: '/opt/llama:/usr/bin:/bin' },
			winDeviceSelection: { CUDA_VISIBLE_DEVICES: '1', GGML_VK_VISIBLE_DEVICES: '0', SystemRoot: 'C:\\Windows', windir: 'C:\\Windows', TEMP: 'C:\\t', TMP: 'C:\\t', PATH: 'C:\\llama;C:\\Windows\\System32;C:\\Windows' },
			withKey: { HOME: '/home/u', TMPDIR: '/tmp/p', PATH: '/opt/llama:/usr/bin:/bin', LLAMA_API_KEY: 'probe-key' },
		});
	});

	test('the approval store drops credential-bearing records on read and never writes one; an install an earlier VS Code made stays approved', () => {
		const storage = createStorage();
		const warnings: string[] = [];
		const approvals = new LlamaServerApprovalStore(storage, { warn: message => warnings.push(message) });
		storage.set('localModel.runtimeApprovals', [
			{ realPath: 'C:\\tools\\llama-server.exe', digest: 'a'.repeat(64), trust: 'userApproved' },
			{ realPath: 'C:\\x?sv=2024&sig=SECRET\\llama-server.exe', digest: 'b'.repeat(64), trust: 'userApproved' },
			{ realPath: WINGET_EXE, digest: 'd'.repeat(64), trust: 'installedByVSCode' },
		]);
		const restored = approvals.approvedPaths();
		const legacy = approvals.lookup(WINGET_EXE, 'd'.repeat(64));
		approvals.record('C:\\y%26sig%3DSECRET\\llama-server.exe', 'c'.repeat(64));
		assert.deepStrictEqual({ restored, legacy, written: (storage.data.get('localModel.runtimeApprovals') as { realPath: string; trust: string }[]).map(record => [record.realPath, record.trust]), warnings: [...new Set(warnings)] }, {
			restored: ['C:\\tools\\llama-server.exe', WINGET_EXE],
			legacy: 'userApproved',
			written: [['C:\\tools\\llama-server.exe', 'userApproved'], [WINGET_EXE, 'userApproved']],
			warnings: [
				'[LocalModel] Dropped 1 invalid or credential-bearing entry from localModel.runtimeApprovals',
			],
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
			unpackaged: createRuntimeUnsupportedModelError('0.6.0-dev (b11459)', 'MAI Code 1.1 Flash', 'maion-coder'),
			unpackagedWithoutVersion: createRuntimeUnsupportedModelError(undefined, 'MAI Code 1.1 Flash', 'MAION-CODER').message,
			missing: createLlamaRuntimeMissingError('MAI Code 1.1 Flash'),
			changes: ['maion-coder', 'qwen3', undefined, '__proto__'].map(unpackagedLlamaArchitectureChange),
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
				message: `This llama.cpp build (0.6.0-dev (b11459)) can't run Example Flash 1.0. Install a llama.cpp build that supports it, then set ${SERVER_PATH_SETTING} to its llama-server, or add llama-server to PATH, and select Retry.`,
				actions: ['getLlamaCpp', 'openSettings', 'retry'],
			},
			errorWithoutVersion: `This llama.cpp build can't run Example Flash 1.0. Install a llama.cpp build that supports it, then set ${SERVER_PATH_SETTING} to its llama-server, or add llama-server to PATH, and select Retry.`,
			packagedArchitecture: ['getLlamaCpp', 'openSettings', 'retry'],
			// No llama.cpp release runs MAI yet (ggml-org/llama.cpp#29778): the directions name the change a build needs.
			unpackaged: {
				code: 'runtimeUnsupportedModel',
				message: `This llama.cpp build (0.6.0-dev (b11459)) can't run MAI Code 1.1 Flash. Install a llama.cpp build that includes ggml-org/llama.cpp#29778, then set ${SERVER_PATH_SETTING} to its llama-server, or add llama-server to PATH, and select Retry.`,
				actions: ['getLlamaCpp', 'openSettings', 'retry'],
			},
			unpackagedWithoutVersion: `This llama.cpp build can't run MAI Code 1.1 Flash. Install a llama.cpp build that includes ggml-org/llama.cpp#29778, then set ${SERVER_PATH_SETTING} to its llama-server, or add llama-server to PATH, and select Retry.`,
			missing: {
				code: 'runtimeNotFound',
				message: `MAI Code 1.1 Flash needs llama.cpp to run. Install a llama.cpp build that supports it, then set ${SERVER_PATH_SETTING} to its llama-server, or add llama-server to PATH, and select Retry.`,
				actions: ['getLlamaCpp', 'openSettings', 'retry'],
			},
			changes: ['ggml-org/llama.cpp#29778', undefined, undefined, undefined],
		});
	});

	test('architecture probe: runs the approved build on a private synthetic GGUF, caches by runtime digest + architecture, never runs an unapproved or changed build', async () => {
		const tools = 'C:\\tools\\llama-server.exe';
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
		const { runtime, hashes, mtimes } = createRuntime(createHost({ ...WIN_HOST, env: { ...WIN_HOST.env, PATH: 'C:\\tools' }, files: { [tools]: tools } }), runner);
		hashes.set(tools, 'hash-a');
		const candidate = { path: tools, realPath: tools };
		const unapproved = await runtime.checkArchitectureSupport(candidate, 'qwen3');
		await runtime.approve(tools, (await runtime.resolve({ enabled: true })).runtime.sha256!);
		const answers = {
			unsupported: await runtime.checkArchitectureSupport(candidate, 'maion-coder'),
			cached: await runtime.checkArchitectureSupport(candidate, 'maion-coder'),
			qwen3: await runtime.checkArchitectureSupport(candidate, 'qwen3'),
			llama: await runtime.checkArchitectureSupport(candidate, 'llama'),
			timeout: await runtime.checkArchitectureSupport(candidate, 'slowarch'),
			timeoutAgain: await runtime.checkArchitectureSupport(candidate, 'slowarch'),
			invalidName: await runtime.checkArchitectureSupport(candidate, 'Maion Coder'),
		};
		const probedBeforeUpdate = [...probed];
		// llama.cpp was updated (another runtime digest): nothing runs until it is approved, and no answer carries over.
		hashes.set(tools, 'hash-b');
		mtimes.set(tools, 2);
		const changed = await runtime.checkArchitectureSupport(candidate, 'maion-coder');
		await runtime.approve(tools, (await runtime.resolve({ enabled: true })).runtime.sha256!);
		const afterUpdate = await runtime.checkArchitectureSupport(candidate, 'maion-coder');
		const call = runner.calls.find(candidateCall => candidateCall.args[0] === '--model')!;
		const otherProbes = runner.calls.filter(candidateCall => candidateCall.file === tools && candidateCall.args[0] !== '--model');
		assert.deepStrictEqual({
			unapproved,
			answers,
			probedBeforeUpdate,
			changed,
			afterUpdate,
			probed: probed.length,
			args: call.args.map((arg, index) => index === 1 ? path.basename(arg) : arg),
			modelDir: path.dirname(path.dirname(call.args[1])) === tempDir && path.basename(path.dirname(call.args[1])).startsWith('arch-'),
			options: { cwd: call.options.cwd, timeoutMs: call.options.timeoutMs, maxOutputBytes: call.options.maxOutputBytes, env: Object.keys(call.options.env ?? {}).sort() },
			// The probe's random key reaches it only in the environment, never on the command line; no other probe gets one.
			apiKey: /^[0-9a-f]{32}$/.test(call.options.env?.LLAMA_API_KEY ?? ''),
			otherProbesWithKey: otherProbes.length > 0 && otherProbes.some(other => other.options.env?.LLAMA_API_KEY !== undefined || other.args.includes('--api-key')),
			leftovers: (await fs.promises.readdir(tempDir)).filter(name => name.startsWith('arch-')),
		}, {
			unapproved: 'untrusted',
			answers: { unsupported: 'unsupported', cached: 'unsupported', qwen3: 'supported', llama: 'supported', timeout: 'unknown', timeoutAgain: 'unknown', invalidName: 'unknown' },
			probedBeforeUpdate: ['maion-coder', 'qwen3', 'llama', 'slowarch', 'slowarch'],
			changed: 'untrusted',
			afterUpdate: 'unsupported',
			probed: 6,
			args: ['--model', 'architecture-probe.gguf', '--host', '127.0.0.1', '--port', '0', '--fit', 'off', '--n-gpu-layers', '0'],
			modelDir: true,
			options: { cwd: tempDir, timeoutMs: 10_000, maxOutputBytes: 64 * 1024, env: ['LLAMA_API_KEY', 'LOCALAPPDATA', 'PATH', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'windir'] },
			apiKey: true,
			otherProbesWithKey: false,
			leftovers: [],
		});
	});
});
