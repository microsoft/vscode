/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from '../../../../../../base/common/path.js';
import { localize } from '../../../../../../nls.js';
import type { ILogService } from '../../../../../log/common/log.js';
import { LocalModelLlamaServerPathSettingId, type ILocalModelErrorV1, type ILocalModelRuntimeV1, type LocalModelErrorAction } from '../../../../common/localModel.js';
import { dropCredentialEntries, reportDroppedStorageEntries } from '../../../../common/logRedaction.js';
import type { IAgentHostStorageService } from '../../../agentHostStorageService.js';
import { DFLASH_SPEC_TYPE, LLAMA_API_KEY_ENV, LLAMA_ARCHITECTURE_NAME_MAX_LENGTH, LLAMA_SERVER_HELP_OUTPUT_CAP_BYTES, LLAMA_SERVER_PROBE_OUTPUT_CAP_BYTES, LLAMA_SERVER_PROBE_TIMEOUT_MS, OPTIONAL_SPEC_FLAGS, REQUIRED_DRAFT_LLAMA_SERVER_FLAGS, REQUIRED_LLAMA_SERVER_FLAGS, UNPACKAGED_LLAMA_ARCHITECTURES } from './constants.js';
import { toTelemetryArchitecture } from './downloader.js';
import { buildSyntheticGguf } from './gguf.js';
import type { ILlamaServerFlagSupport } from './llamaPreset.js';
import { NodeProcessRunner, type IProcessRunner, type IProcessRunResult } from './processRunner.js';
import { parseListDevicesOutput, type ILlamaDevice } from './servingProfile.js';

/*
 * llama.cpp runtime. VS Code never downloads, installs or redistributes llama.cpp: it runs only the qualified
 * `llama-server` named in `chat.copilot.localModel.llamaServerPath` (a machine setting, so a workspace can't set it).
 */

// #region `--version` and `--help`

/** Parsed `llama-server --version`. */
export interface ILlamaServerVersion {
	/** The first version token, for example `0.6.0-dev` or `6123`. */
	readonly version: string;
	/** llama.cpp build number (`b<build>`), when present. */
	readonly build?: number;
	readonly commit?: string;
}

/** Parses `--version` output in every known format, including Homebrew semver builds. Pure. */
export function parseLlamaServerVersion(output: string): ILlamaServerVersion | undefined {
	const match = /^\s*version:\s*(?<version>[^\s(]+)\s*(?:\((?<inner>[^)]*)\))?/im.exec(output);
	if (!match?.groups) {
		return undefined;
	}
	const version = match.groups.version.trim();
	const inner = match.groups.inner?.trim() ?? '';
	let build: number | undefined;
	let commit: string | undefined;
	const buildMatch = /\bbuild\s+(?<build>\d+)/i.exec(inner);
	const commitMatch = /\bcommit\s+(?<commit>[0-9a-f]{6,40})\b/i.exec(inner) ?? /^(?<commit>[0-9a-f]{6,40})$/i.exec(inner);
	if (buildMatch?.groups) {
		build = Number(buildMatch.groups.build);
	} else if (/^b?\d+$/i.test(version)) {
		build = Number(version.replace(/^b/i, ''));
	}
	if (commitMatch?.groups) {
		commit = commitMatch.groups.commit;
	}
	return { version, ...(build !== undefined && Number.isSafeInteger(build) ? { build } : {}), ...(commit ? { commit } : {}) };
}

/** Flags and `--spec-type` values listed by `--help`. */
export interface ILlamaServerHelp {
	readonly flags: ReadonlySet<string>;
	readonly specTypes: ReadonlySet<string>;
}

/** Parses `--help`: long flags from each option line's option column (aliases included) and the `--spec-type` values; mentions in prose never count. Pure. */
export function parseLlamaServerHelp(output: string): ILlamaServerHelp {
	const flags = new Set<string>();
	const specTypes = new Set<string>();
	for (const line of output.split(/\r?\n/)) {
		if (!/^-{1,2}[A-Za-z0-9]/.test(line)) {
			continue;
		}
		// The option column ends at the first run of 2+ spaces not followed by another option.
		const optionColumn = line.split(/\s{2,}(?=[^-\s])/)[0];
		for (const match of optionColumn.matchAll(/(?:^|[\s,])(?<flag>--[a-z0-9][a-z0-9-]*)/gi)) {
			flags.add(match.groups!.flag.toLowerCase());
		}
		const specMatch = /--spec-type\s+(?<values>[a-z0-9,_-]+)/i.exec(optionColumn);
		if (specMatch?.groups) {
			for (const value of specMatch.groups.values.split(',')) {
				specTypes.add(value.trim().toLowerCase());
			}
		}
	}
	return { flags, specTypes };
}

export interface ILlamaServerQualification {
	readonly missingFlags: readonly string[];
	/** `--spec-type` with `draft-dflash` and the companion flags are present. */
	readonly dflashSupported: boolean;
}

/** Qualifies a build by capability: every required flag (and `--device-draft` for a draft preset) must be listed; speculative decoding is optional. Pure. */
export function qualifyLlamaServerHelp(help: ILlamaServerHelp, needsDraft: boolean): ILlamaServerQualification {
	const required = needsDraft ? [...REQUIRED_LLAMA_SERVER_FLAGS, ...REQUIRED_DRAFT_LLAMA_SERVER_FLAGS] : REQUIRED_LLAMA_SERVER_FLAGS;
	return {
		missingFlags: required.filter(flag => !help.flags.has(flag)),
		dflashSupported: OPTIONAL_SPEC_FLAGS.every(flag => help.flags.has(flag)) && help.specTypes.has(DFLASH_SPEC_TYPE),
	};
}

/** Flags kept in the static-capability cache (the rest of `--help` is not needed later). */
const RELEVANT_FLAGS = new Set([
	...REQUIRED_LLAMA_SERVER_FLAGS, ...REQUIRED_DRAFT_LLAMA_SERVER_FLAGS, ...OPTIONAL_SPEC_FLAGS,
	'--temp', '--top-p', '--min-p', '--top-k', '--batch-size', '--ubatch-size', '--ctx-checkpoints', '--cache-ram',
	'--n-gpu-layers', '--flash-attn', '--no-host', '--jinja', '--spec-draft-model',
]);

// #endregion

// #region Execution failures

export type LlamaRuntimeErrorCode = 'runtimeBlocked' | 'runtimeLibraryMissing' | 'gpuRuntimeMissing' | 'runtimeTooOld' | 'runtimeNotFound' | 'probeFailed';

/** NTSTATUS values meaning the image was blocked (Defender ASR, WDAC, AppLocker, SRP, code integrity). */
const WINDOWS_BLOCKED_STATUSES = new Set([0xC0000428, 0xC0000022, 0xC0000361, 0xC0000362, 0xC0000363, 0xC0000364, 0xC0000372, 0xC0000603, 0xC0000605, 0xC000036A, 0xC000036B]);
/** NTSTATUS values for a missing/broken DLL dependency. */
const WINDOWS_LIBRARY_STATUSES = new Set([0xC0000135, 0xC0000139, 0xC000007B, 0xC0000142]);

export interface ILlamaProbeFailure {
	readonly code: LlamaRuntimeErrorCode;
	/** Missing library name (`runtimeLibraryMissing`). */
	readonly library?: string;
}

/** Classifies a failed probe from its spawn error, exit status and output (blocked image, missing GPU runtime or library, macOS code-signature kill). Pure. */
export function classifyLlamaProbeFailure(result: IProcessRunResult, platform: NodeJS.Platform): ILlamaProbeFailure {
	if (result.spawnErrorCode === 'EPERM' || result.spawnErrorCode === 'EACCES') {
		return { code: 'runtimeBlocked' };
	}
	if (result.spawnErrorCode === 'ENOENT') {
		return { code: 'runtimeNotFound' };
	}
	const stderr = `${result.stderr}\n${result.stdout}`;
	if (platform === 'win32' && result.exitCode !== undefined) {
		if (WINDOWS_BLOCKED_STATUSES.has(result.exitCode)) {
			return { code: 'runtimeBlocked' };
		}
		if (WINDOWS_LIBRARY_STATUSES.has(result.exitCode)) {
			return /vulkan-1\.dll/i.test(stderr) ? { code: 'gpuRuntimeMissing' } : { code: 'runtimeLibraryMissing' };
		}
	}
	if (platform === 'darwin' && (result.signal === 'SIGKILL' && !result.timedOut || /code signature|not valid for use in process|library load disallowed/i.test(stderr))) {
		return { code: 'runtimeBlocked' };
	}
	const sharedObject = /error while loading shared libraries:\s*(?<lib>[^\s:]+)/i.exec(stderr) ?? /Library not loaded:\s*(?<lib>\S+)/i.exec(stderr);
	if (sharedObject?.groups) {
		return /vulkan/i.test(sharedObject.groups.lib) ? { code: 'gpuRuntimeMissing' } : { code: 'runtimeLibraryMissing', library: path.basename(sharedObject.groups.lib) };
	}
	const glibc = /(?<lib>GLIBC(?:XX)?_[\d.]+)/.exec(stderr);
	if (glibc?.groups) {
		return { code: 'runtimeLibraryMissing', library: glibc.groups.lib };
	}
	return { code: 'probeFailed' };
}

/** The fixes of errors a user-provided llama.cpp build resolves: Get llama.cpp, Open Settings, then Retry. */
export const LLAMA_CPP_DIRECTIONS_ACTIONS: readonly LocalModelErrorAction[] = ['getLlamaCpp', 'openSettings', 'retry'];

/** The setting's name as Settings shows it, with its id: where to point VS Code at a `llama-server`. */
function serverPathSettingLabel(): string {
	return localize('localModel.llamaServerPathSetting', "Chat \u203a Copilot \u203a Local Model: Llama Server Path ({0})", LocalModelLlamaServerPathSettingId);
}

/** `runtimeNotFound`: a model is loaded but no `llama-server` is set, so the error says how to get one and where to point VS Code at it. */
export function createLlamaRuntimeMissingError(displayName: string): ILocalModelErrorV1 {
	return {
		code: 'runtimeNotFound',
		message: localize('localModel.runtimeMissing', "{0} needs llama.cpp to run. Install a llama.cpp build that supports it, then set {1} to its llama-server and select Retry.", displayName, serverPathSettingLabel()),
		actions: [...LLAMA_CPP_DIRECTIONS_ACTIONS],
	};
}

/** Localized message and actions for a runtime error. */
export function createLlamaRuntimeError(failure: ILlamaProbeFailure, details: { readonly path?: string; readonly missingFlags?: readonly string[] }): ILocalModelErrorV1 {
	const setting = LocalModelLlamaServerPathSettingId;
	const actions: LocalModelErrorAction[] = [];
	let message: string;
	switch (failure.code) {
		case 'runtimeBlocked':
			message = localize('localModel.runtimeBlocked', "Your organization's policy blocked llama.cpp. Set `{0}` to a build it allows.", setting);
			actions.push('openSettings');
			break;
		case 'runtimeTooOld':
			message = localize('localModel.runtimeTooOld', "The llama-server at {0} is missing features VS Code needs ({1}). Install a newer llama.cpp build, then set {2} to its llama-server and select Retry.", details.path ?? '', (details.missingFlags ?? []).join(', '), serverPathSettingLabel());
			actions.push(...LLAMA_CPP_DIRECTIONS_ACTIONS);
			break;
		case 'runtimeLibraryMissing':
			message = localize('localModel.runtimeLibraryMissing', "llama.cpp couldn't start because a required system library is missing ({0}). Set `{1}` to a compatible build.", failure.library ?? '?', setting);
			actions.push('retry', 'openSettings');
			break;
		case 'gpuRuntimeMissing':
			message = localize('localModel.gpuRuntimeMissing', "llama.cpp didn't find a GPU it can use. Install or update your GPU driver (Vulkan or Metal), then select Retry.");
			actions.push('retry');
			break;
		case 'runtimeNotFound':
			message = localize('localModel.runtimeNotFound', "`{0}` must be the absolute path of an existing llama-server executable. Install a llama.cpp build, then set it to its llama-server and select Retry.", setting);
			actions.push(...LLAMA_CPP_DIRECTIONS_ACTIONS);
			break;
		default:
			message = localize('localModel.runtimeProbeFailed', "The llama-server at {0} didn't respond as expected. Set `{1}` to a working build.", details.path ?? '', setting);
			actions.push('retry', 'openSettings');
			break;
	}
	return { code: failure.code, message, actions };
}

// #endregion

// #region Architecture probe

/** Whether a `llama-server` knows a model architecture. `unknown` (an ambiguous probe) never blocks anything. */
export type LlamaArchitectureSupport = 'supported' | 'unsupported' | 'unknown';

const LLAMA_ARCHITECTURE_NAME = new RegExp(`^[a-z0-9][a-z0-9._-]{0,${LLAMA_ARCHITECTURE_NAME_MAX_LENGTH - 1}}$`);

/** `value` when it is a plausible llama.cpp architecture name (bounded, `[a-z0-9._-]`), else `undefined`; never rewritten, as llama.cpp matches names exactly. Pure. */
export function sanitizeLlamaArchitecture(value: string | undefined): string | undefined {
	return value !== undefined && LLAMA_ARCHITECTURE_NAME.test(value) ? value : undefined;
}

/**
 * Architecture probe arguments: the synthetic model, loopback on an ephemeral port, no GPU offload and no fit pass
 * (which would load the model twice). The probe's API key travels in the environment, never on the command line. Pure.
 */
export function buildArchitectureProbeArgs(modelPath: string): string[] {
	return ['--model', modelPath, '--host', '127.0.0.1', '--port', '0', '--fit', 'off', '--n-gpu-layers', '0'];
}

/**
 * Classifies the architecture probe (`llama-server` loading a GGUF holding only `general.architecture`). llama.cpp checks
 * the architecture first, so `unknown model architecture` is `unsupported` and an error of a later load step is
 * `supported`; anything else is `unknown`. Pure.
 */
export function classifyArchitectureProbe(result: IProcessRunResult): LlamaArchitectureSupport {
	if (result.aborted || result.spawnErrorCode) {
		return 'unknown';
	}
	const output = `${result.stderr}\n${result.stdout}`;
	if (/unknown model architecture/i.test(output)) {
		return 'unsupported';
	}
	if (result.timedOut || result.exitCode === 0) {
		return 'unknown';
	}
	return /error loading model (?:hyperparameters|vocabulary)|key not found in model|missing tensor|wrong number of tensors/i.test(output) ? 'supported' : 'unknown';
}

/** The change a llama.cpp build needs to run `architecture` when no release supports it yet ({@link UNPACKAGED_LLAMA_ARCHITECTURES}). Pure. */
export function unpackagedLlamaArchitectureChange(architecture: string | undefined): string | undefined {
	const name = architecture?.toLowerCase();
	return name !== undefined && Object.prototype.hasOwnProperty.call(UNPACKAGED_LLAMA_ARCHITECTURES, name) ? UNPACKAGED_LLAMA_ARCHITECTURES[name] : undefined;
}

/** `runtimeUnsupportedModel`: the llama.cpp can't load the model's architecture; says how to get a build that can and where to point VS Code at it. */
export function createRuntimeUnsupportedModelError(version: string | undefined, displayName: string, architecture?: string): ILocalModelErrorV1 {
	const change = unpackagedLlamaArchitectureChange(architecture);
	const setting = serverPathSettingLabel();
	let message: string;
	if (change) {
		message = version
			? localize('localModel.runtimeUnpackagedModel', "This llama.cpp build ({0}) can't run {1}. Install a llama.cpp build that includes {2}, then set {3} to its llama-server and select Retry.", version, displayName, change, setting)
			: localize('localModel.runtimeUnpackagedModelNoVersion', "This llama.cpp build can't run {0}. Install a llama.cpp build that includes {1}, then set {2} to its llama-server and select Retry.", displayName, change, setting);
	} else {
		message = version
			? localize('localModel.runtimeUnsupportedModel', "This llama.cpp build ({0}) can't run {1}. Install a llama.cpp build that supports it, then set {2} to its llama-server and select Retry.", version, displayName, setting)
			: localize('localModel.runtimeUnsupportedModelNoVersion', "This llama.cpp build can't run {0}. Install a llama.cpp build that supports it, then set {1} to its llama-server and select Retry.", displayName, setting);
	}
	return { code: 'runtimeUnsupportedModel', message, actions: [...LLAMA_CPP_DIRECTIONS_ACTIONS] };
}

// #endregion

// #region Probe environment

/** GPU device selection variables the server inherits: the `--list-devices` probe must see the same devices, numbered the same way. */
const DEVICE_SELECTION_ENV: readonly string[] = ['CUDA_VISIBLE_DEVICES', 'HIP_VISIBLE_DEVICES', 'ROCR_VISIBLE_DEVICES', 'GGML_VK_VISIBLE_DEVICES', 'ONEAPI_DEVICE_SELECTOR'];

/**
 * Probe environment: minimal and credential-free, with only what the loader and GPU drivers need plus the device
 * selection. No host `LLAMA_*` variable (llama.cpp reads them as arguments); a server probe gets its own `apiKey`. Pure.
 */
export function buildProbeEnvironment(platform: NodeJS.Platform, env: Readonly<Record<string, string | undefined>>, binaryDir: string, tempDir: string, apiKey?: string): Record<string, string> {
	const pick = (names: readonly string[]) => Object.fromEntries(names.map(name => [name, env[name]]).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
	const key: Record<string, string> = apiKey !== undefined ? { [LLAMA_API_KEY_ENV]: apiKey } : {};
	if (platform === 'win32') {
		const systemRoot = env.SystemRoot ?? env.SYSTEMROOT ?? 'C:\\Windows';
		return {
			...pick(['SystemDrive', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'ProgramData', 'ProgramFiles', 'CommonProgramFiles', ...DEVICE_SELECTION_ENV]),
			SystemRoot: systemRoot,
			windir: systemRoot,
			TEMP: tempDir,
			TMP: tempDir,
			PATH: [binaryDir, `${systemRoot}\\System32`, systemRoot].join(';'),
			...key,
		};
	}
	return {
		...pick(['HOME', 'LANG', 'XDG_RUNTIME_DIR', 'XDG_DATA_DIRS', 'XDG_CONFIG_DIRS', 'VK_ICD_FILENAMES', 'VK_DRIVER_FILES', 'DISPLAY', 'WAYLAND_DISPLAY', ...DEVICE_SELECTION_ENV]),
		TMPDIR: tempDir,
		PATH: [binaryDir, '/usr/bin', '/bin'].join(':'),
		...key,
	};
}

// #endregion

// #region Capability cache

/** A device without its dynamic `free` value (static capability). */
export type ILlamaStaticDevice = Omit<ILlamaDevice, 'freeBytes'>;

/**
 * llama.cpp's shared libraries (its GPU backends are loaded dynamically) and the GPU runtimes bundled with them, by file
 * name: replacing one changes what a build can do without changing `llama-server`.
 */
const LLAMA_LIBRARY = /^(?:(?:lib)?(?:ggml|llama|mtmd).*|.*(?:cuda|cublas).*)\.(?:dll|dylib|so(?:\.\d+)*)$/i;

/**
 * Static capability of the setting's `llama-server` that qualified with a GPU device, cached by real path while its
 * size, modification time, the libraries beside it and the GPU topology are unchanged.
 */
export interface ILlamaServerCapability {
	readonly realPath: string;
	readonly mtimeMs: number;
	readonly size: number;
	/** Fingerprint of the {@link LLAMA_LIBRARY llama.cpp libraries} beside it: their names, sizes and modification times. */
	readonly libraries: string;
	readonly topologyKey: string;
	readonly version: ILlamaServerVersion;
	/** Relevant `--help` flags and the `--spec-type` values. */
	readonly flags: readonly string[];
	readonly specTypes: readonly string[];
	readonly devices: readonly ILlamaStaticDevice[];
}

/** The build a capability describes: the executable's real path, size and modification time, and its libraries. */
type LlamaServerFile = Pick<ILlamaServerCapability, 'realPath' | 'size' | 'mtimeMs' | 'libraries'>;

/** Identifies a probed build (SHA-256 of its real path, size, modification time and libraries); facts learned about it are keyed by it, so a replaced binary or library starts over. Pure. */
export function getLlamaServerKey(file: LlamaServerFile): string {
	return createHash('sha256').update(JSON.stringify([file.realPath, file.size, file.mtimeMs, file.libraries])).digest('hex');
}

/** {@link ILlamaServerFlagSupport} from a capability. Pure. */
export function getFlagSupport(capability: Pick<ILlamaServerCapability, 'flags' | 'specTypes'>): ILlamaServerFlagSupport {
	const help: ILlamaServerHelp = { flags: new Set(capability.flags), specTypes: new Set(capability.specTypes) };
	return { flags: help.flags, dflashSupported: qualifyLlamaServerHelp(help, false).dflashSupported };
}

/** `version` for the status: `0.6.0-dev (b11459)`, `b6123`, or the raw token. Pure. */
export function formatLlamaServerVersion(version: ILlamaServerVersion): string {
	if (version.build === undefined) {
		return version.version;
	}
	return /^b?\d+$/i.test(version.version) ? `b${version.build}` : `${version.version} (b${version.build})`;
}

// #endregion

// #region Runtime service

/** The resolved runtime for the status and serving. */
export interface ILlamaRuntimeResolution {
	readonly runtime: ILocalModelRuntimeV1;
	/** The setting's `llama-server`, qualified to serve. */
	readonly capability?: ILlamaServerCapability;
	/** Why the setting's `llama-server` can't serve (not found, too old, blocked, ...). */
	readonly error?: ILocalModelErrorV1;
}

const CAPABILITIES_KEY = 'localModel.runtimeCapabilities';

export interface ILlamaCppRuntimeOptions {
	readonly storage: Pick<IAgentHostStorageService, 'get' | 'set'> | undefined;
	readonly log: ILogService;
	readonly runner?: IProcessRunner;
	readonly platform?: NodeJS.Platform;
	readonly env?: Readonly<Record<string, string | undefined>>;
	/** Probe working directory root (a VS Code temp directory, never a workspace). */
	readonly tempDir?: string;
	/** The real path, size, modification time and libraries of a path, `undefined` unless it is an existing regular file; injectable. */
	readonly resolveFile?: (path: string) => Promise<LlamaServerFile | undefined>;
}

export interface ILlamaResolveOptions {
	/** `chat.copilot.localModel.enabled`: the binary is executed only while it is on. */
	readonly enabled: boolean;
	/** Trimmed `chat.copilot.localModel.llamaServerPath`. */
	readonly settingPath?: string;
	/** The preset uses a draft model (`--device-draft` becomes required). */
	readonly needsDraft?: boolean;
	/** Stage A topology key; a change invalidates cached device capability. */
	readonly topologyKey?: string;
	readonly signal?: AbortSignal;
}

/** Qualifies and probes the `llama-server` of the setting. VS Code never installs or upgrades it. */
export class LlamaCppRuntime {

	private readonly _runner: IProcessRunner;
	private readonly _platform: NodeJS.Platform;
	private readonly _env: Readonly<Record<string, string | undefined>>;
	private readonly _tempDir: string;
	private readonly _resolveFile: (path: string) => Promise<LlamaServerFile | undefined>;
	/** Architecture probe results by {@link getLlamaServerKey} and architecture name (`unknown` is never cached). */
	private readonly _architectureSupport = new Map<string, Exclude<LlamaArchitectureSupport, 'unknown'>>();

	constructor(private readonly _options: ILlamaCppRuntimeOptions) {
		this._runner = _options.runner ?? new NodeProcessRunner();
		this._platform = _options.platform ?? process.platform;
		this._env = _options.env ?? process.env;
		this._tempDir = _options.tempDir ?? path.join(os.tmpdir(), 'vscode-local-model-probe');
		this._resolveFile = _options.resolveFile ?? resolveLlamaServerFile;
	}

	/**
	 * Resolves the setting's `llama-server`, qualified by `--version`, `--help` and `--list-devices` (cached while the file,
	 * its libraries and the GPU topology are unchanged; a build without a GPU device is probed again every time). Never
	 * executes anything while the feature is off.
	 */
	async resolve(options: ILlamaResolveOptions): Promise<ILlamaRuntimeResolution> {
		if (!options.enabled || !options.settingPath) {
			return { runtime: {} };
		}
		const file = pathApi(this._platform).isAbsolute(options.settingPath) ? await this._resolveFile(options.settingPath) : undefined;
		if (!file) {
			return { runtime: {}, error: createLlamaRuntimeError({ code: 'runtimeNotFound' }, {}) };
		}
		const topologyKey = options.topologyKey ?? '';
		let capability = this._cachedCapability(file, topologyKey);
		if (!capability) {
			const probed = await this._probeCapability(file, topologyKey, options.signal);
			if (!probed.ok) {
				return { runtime: {}, error: createLlamaRuntimeError(probed.failure, { path: file.realPath }) };
			}
			capability = probed.capability;
		}
		const { missingFlags } = qualifyLlamaServerHelp({ flags: new Set(capability.flags), specTypes: new Set(capability.specTypes) }, !!options.needsDraft);
		if (missingFlags.length) {
			return { runtime: {}, error: createLlamaRuntimeError({ code: 'runtimeTooOld' }, { path: file.realPath, missingFlags }) };
		}
		if (capability.devices.length === 0) {
			return { runtime: {}, error: createLlamaRuntimeError({ code: 'gpuRuntimeMissing' }, { path: file.realPath }) };
		}
		const backend = [...capability.devices].sort((a, b) => b.totalBytes - a.totalBytes)[0]?.backend;
		return { runtime: { version: formatLlamaServerVersion(capability.version), ...(backend ? { backend } : {}) }, capability };
	}

	/** Fresh `--list-devices` (dynamic `free`) for Stage B and admission; never cached. `undefined` when it fails. */
	async listDevices(realPath: string, signal?: AbortSignal): Promise<ILlamaDevice[] | undefined> {
		await this._ensureProbeDirectory();
		const result = await this._probe(realPath, ['--list-devices'], LLAMA_SERVER_PROBE_OUTPUT_CAP_BYTES, signal);
		return result.exitCode === 0 ? parseListDevicesOutput(result.stdout) : undefined;
	}

	/**
	 * Architecture probe: whether the build can load `architecture`, by running `llama-server` in the probe sandbox on a
	 * synthetic GGUF holding only `general.architecture`. Cached per build and architecture (`unknown` is not); an invalid
	 * name is `unknown` and nothing runs.
	 */
	async checkArchitectureSupport(file: LlamaServerFile, architecture: string, signal?: AbortSignal): Promise<LlamaArchitectureSupport> {
		const name = sanitizeLlamaArchitecture(architecture);
		if (!name) {
			return 'unknown';
		}
		const key = `${getLlamaServerKey(file)}\n${name}`;
		const cached = this._architectureSupport.get(key);
		if (cached) {
			return cached;
		}
		await this._ensureProbeDirectory();
		let directory: string;
		try {
			directory = await fs.promises.mkdtemp(path.join(this._tempDir, 'arch-'));
		} catch {
			return 'unknown';
		}
		try {
			const modelPath = path.join(directory, 'architecture-probe.gguf');
			try {
				await fs.promises.writeFile(modelPath, buildSyntheticGguf({ 'general.architecture': name }), { flag: 'wx', mode: 0o600 });
			} catch {
				return 'unknown';
			}
			const result = await this._probe(file.realPath, buildArchitectureProbeArgs(modelPath), LLAMA_SERVER_PROBE_OUTPUT_CAP_BYTES, signal, randomBytes(16).toString('hex'));
			const support = signal?.aborted ? 'unknown' : classifyArchitectureProbe(result);
			if (support === 'unknown') {
				const exit = result.exitCode ?? (result.timedOut ? 'timeout' : result.spawnErrorCode ?? result.signal ?? '?');
				this._options.log.info(`[LocalModelRuntime] Architecture probe for ${toTelemetryArchitecture(name)} was inconclusive (exit ${exit}, ${result.stderr.length} characters of output)`);
			} else {
				this._options.log.info(`[LocalModelRuntime] Architecture probe: llama-server ${support === 'supported' ? 'supports' : 'does not support'} ${toTelemetryArchitecture(name)}`);
				this._architectureSupport.set(key, support);
			}
			return support;
		} finally {
			await fs.promises.rm(directory, { recursive: true, force: true }).catch(() => undefined);
		}
	}

	/** The cached capability of `file`, while its size, modification time, libraries and the GPU topology are unchanged. */
	private _cachedCapability(file: LlamaServerFile, topologyKey: string): ILlamaServerCapability | undefined {
		const cached = this._readCapabilities()[file.realPath];
		return cached && cached.size === file.size && cached.mtimeMs === file.mtimeMs && cached.libraries === file.libraries && cached.topologyKey === topologyKey && cached.devices.length > 0 ? cached : undefined;
	}

	/** Probes `--version`, `--help` and `--list-devices`, and caches the capability they describe when it has a GPU device. */
	private async _probeCapability(file: LlamaServerFile, topologyKey: string, signal: AbortSignal | undefined): Promise<{ readonly ok: true; readonly capability: ILlamaServerCapability } | { readonly ok: false; readonly failure: ILlamaProbeFailure }> {
		await this._ensureProbeDirectory();
		const versionResult = await this._probe(file.realPath, ['--version'], LLAMA_SERVER_PROBE_OUTPUT_CAP_BYTES, signal);
		const version = versionResult.exitCode === 0 ? parseLlamaServerVersion(`${versionResult.stdout}\n${versionResult.stderr}`) : undefined;
		if (!version) {
			return { ok: false, failure: classifyLlamaProbeFailure(versionResult, this._platform) };
		}
		const helpResult = await this._probe(file.realPath, ['--help'], LLAMA_SERVER_HELP_OUTPUT_CAP_BYTES, signal);
		if (helpResult.exitCode !== 0 && !helpResult.truncated) {
			return { ok: false, failure: classifyLlamaProbeFailure(helpResult, this._platform) };
		}
		const help = parseLlamaServerHelp(`${helpResult.stdout}\n${helpResult.stderr}`);
		const devicesResult = await this._probe(file.realPath, ['--list-devices'], LLAMA_SERVER_PROBE_OUTPUT_CAP_BYTES, signal);
		const devices = devicesResult.exitCode === 0 ? parseListDevicesOutput(devicesResult.stdout) : undefined;
		if (!devices) {
			const failure = classifyLlamaProbeFailure(devicesResult, this._platform);
			return { ok: false, failure: failure.code === 'probeFailed' ? { code: 'gpuRuntimeMissing' } : failure };
		}
		const capability: ILlamaServerCapability = {
			realPath: file.realPath,
			mtimeMs: file.mtimeMs,
			size: file.size,
			libraries: file.libraries,
			topologyKey,
			version,
			flags: [...help.flags].filter(flag => RELEVANT_FLAGS.has(flag)).sort(),
			specTypes: [...help.specTypes].sort(),
			devices: devices.map(({ name, description, totalBytes, backend }) => ({ name, description, totalBytes, backend })),
		};
		if (capability.devices.length > 0) {
			// Having no device is often fixed outside the build (a GPU driver or Vulkan loader installed later): not cached, so Retry probes it again.
			this._writeCapabilities({ ...this._readCapabilities(), [file.realPath]: capability });
		}
		return { ok: true, capability };
	}

	private async _ensureProbeDirectory(): Promise<void> {
		await fs.promises.mkdir(this._tempDir, { recursive: true }).catch(() => undefined);
	}

	/** Sandboxed probe: temp cwd, minimal env, `windowsHide`, 10 s timeout and output cap; a server probe's `apiKey` reaches it only as {@link LLAMA_API_KEY_ENV}. */
	private _probe(realPath: string, args: readonly string[], maxOutputBytes: number, signal: AbortSignal | undefined, apiKey?: string): Promise<IProcessRunResult> {
		return this._runner.run(realPath, args, {
			cwd: this._tempDir,
			env: buildProbeEnvironment(this._platform, this._env, pathApi(this._platform).dirname(realPath), this._tempDir, apiKey),
			timeoutMs: LLAMA_SERVER_PROBE_TIMEOUT_MS,
			maxOutputBytes,
			signal,
		});
	}

	/** The capability cache; an entry that holds anything credential-like (from a binary's output) is dropped. */
	private _readCapabilities(): Record<string, ILlamaServerCapability> {
		const value = this._options.storage?.get<unknown>(CAPABILITIES_KEY);
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return {};
		}
		const scrubbed = dropCredentialEntries(value as Record<string, ILlamaServerCapability>);
		reportDroppedStorageEntries(this._options.log, CAPABILITIES_KEY, scrubbed.dropped);
		return scrubbed.kept;
	}

	/** Belt and braces: an entry that holds anything credential-like is never written. */
	private _writeCapabilities(capabilities: Record<string, ILlamaServerCapability>): void {
		const scrubbed = dropCredentialEntries(capabilities);
		reportDroppedStorageEntries(this._options.log, CAPABILITIES_KEY, scrubbed.dropped);
		this._options.storage?.set(CAPABILITIES_KEY, scrubbed.kept);
	}
}

function pathApi(platform: NodeJS.Platform) {
	return platform === 'win32' ? path.win32 : path.posix;
}

/** The real path, size, modification time and libraries of `filePath`, `undefined` unless it is an existing regular file. */
async function resolveLlamaServerFile(filePath: string): Promise<LlamaServerFile | undefined> {
	try {
		const realPath = await fs.promises.realpath(filePath);
		const stat = await fs.promises.stat(realPath);
		return stat.isFile() ? { realPath, size: stat.size, mtimeMs: stat.mtimeMs, libraries: await fingerprintLlamaLibraries(path.dirname(realPath)) } : undefined;
	} catch {
		return undefined;
	}
}

/** SHA-256 of the names, sizes and modification times of the {@link LLAMA_LIBRARY llama.cpp libraries} in `directory`; reads no content. */
async function fingerprintLlamaLibraries(directory: string): Promise<string> {
	const names = (await fs.promises.readdir(directory).catch(() => [])).filter(name => LLAMA_LIBRARY.test(name)).sort();
	const libraries = await Promise.all(names.map(async name => {
		const stat = await fs.promises.stat(path.join(directory, name)).catch(() => undefined);
		return stat ? [name, stat.size, stat.mtimeMs] : [name];
	}));
	return createHash('sha256').update(JSON.stringify(libraries)).digest('hex');
}

// #endregion
