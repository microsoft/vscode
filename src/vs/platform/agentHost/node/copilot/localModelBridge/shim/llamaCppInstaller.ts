/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from '../../../../../../base/common/path.js';
import { localize } from '../../../../../../nls.js';
import type { ILogService } from '../../../../../log/common/log.js';
import { LocalModelLlamaServerPathSettingId, type ILocalModelErrorV1, type ILocalModelRuntimeV1, type LocalModelErrorAction, type LocalModelRuntimeSource, type LocalModelRuntimeTrust } from '../../../../common/localModel.js';
import { containsCredential, dropCredentialEntries, dropCredentialItems, reportDroppedStorageEntries } from '../../../../common/logRedaction.js';
import type { IAgentHostStorageService } from '../../../agentHostStorageService.js';
import { DFLASH_SPEC_TYPE, LLAMA_API_KEY_ENV, LLAMA_ARCHITECTURE_NAME_MAX_LENGTH, LLAMA_SERVER_EXECUTABLE_NAME, LLAMA_SERVER_HELP_OUTPUT_CAP_BYTES, LLAMA_SERVER_KNOWN_LOCATIONS, LLAMA_SERVER_PROBE_OUTPUT_CAP_BYTES, LLAMA_SERVER_PROBE_TIMEOUT_MS, LLAMACPP_SERVER_PATH_ENV_VAR, OPTIONAL_SPEC_FLAGS, REQUIRED_DRAFT_LLAMA_SERVER_FLAGS, REQUIRED_LLAMA_SERVER_FLAGS, UNPACKAGED_LLAMA_ARCHITECTURES, WINDOWS_LIVE_PATH_SOURCES, type ILlamaServerKnownLocation } from './constants.js';
import { computeFileSha256, toTelemetryArchitecture } from './downloader.js';
import { buildSyntheticGguf } from './gguf.js';
import type { ILlamaServerFlagSupport } from './llamaPreset.js';
import { computeContentId } from './modelCatalog.js';
import { NodeProcessRunner, queryRegistry, type IProcessRunner, type IProcessRunResult } from './processRunner.js';
import { parseListDevicesOutput, type ILlamaDevice } from './servingProfile.js';

/*
 * llama.cpp runtime. VS Code never downloads, installs or redistributes
 * llama.cpp: it detects an existing `llama-server` (the setting,
 * `LLAMACPP_SERVER_PATH`, `PATH`, known install locations), qualifies it and
 * runs it only after the user approved it. The binary named by
 * `chat.copilot.localModel.llamaServerPath` is approved by that setting, and
 * `LLAMACPP_SERVER_PATH` may be probed before approval. When there is no
 * usable llama.cpp, loading a model gives directions to get one
 * ({@link createLlamaRuntimeMissingError}).
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

/**
 * Parses `--version` output in every known format: `version: 0.6.0-dev
 * (build 11459, commit f498f864f)`, `version: 6123 (abc1234)`, `version:
 * b6123 (abc1234)` and Homebrew semver builds. Pure.
 */
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

/**
 * Parses `--help`: long flags from the option column of each option line
 * (aliases included), and the `--spec-type` value list. Descriptions are
 * ignored, so a flag merely mentioned in prose never counts. Pure.
 */
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

/**
 * Capability-based qualification: every required flag (plus
 * `--device-draft` for a draft preset) must be listed. Speculative decoding
 * is optional. Pure.
 */
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

/**
 * Classifies a failed probe: spawn `EPERM`/`EACCES` or a
 * blocked-image NTSTATUS -> `runtimeBlocked`; missing Vulkan -> `gpuRuntimeMissing`;
 * other missing libraries (`GLIBC_`, `cannot open shared object`, DLL not
 * found) -> `runtimeLibraryMissing`; macOS code-signature kills ->
 * `runtimeBlocked`; anything else -> `probeFailed`. Pure.
 */
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

/**
 * The fixes of an error that a llama.cpp build the user gets resolves (none
 * found, too old, can't run the model): Get llama.cpp (the page that says how),
 * Open Settings (`chat.copilot.localModel.llamaServerPath`), then Retry.
 */
export const LLAMA_CPP_DIRECTIONS_ACTIONS: readonly LocalModelErrorAction[] = ['getLlamaCpp', 'openSettings', 'retry'];

/** The setting's name as Settings shows it, with its id: where to point VS Code at a `llama-server`. */
function serverPathSettingLabel(): string {
	return localize('localModel.llamaServerPathSetting', "Chat \u203a Copilot \u203a Local Model: Llama Server Path ({0})", LocalModelLlamaServerPathSettingId);
}

/**
 * `runtimeNotFound` when a model is loaded but no `llama-server` was found:
 * VS Code doesn't install llama.cpp, so it says how to get one and where to
 * point VS Code at it.
 */
export function createLlamaRuntimeMissingError(displayName: string): ILocalModelErrorV1 {
	return {
		code: 'runtimeNotFound',
		message: localize('localModel.runtimeMissing', "{0} needs llama.cpp to run. Install a llama.cpp build that supports it, then set {1} to its llama-server, or add llama-server to PATH, and select Retry.", displayName, serverPathSettingLabel()),
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
			message = localize('localModel.runtimeBlocked', "Your organization's policy blocked llama.cpp. Set `{0}` to an approved build.", setting);
			actions.push('openSettings');
			break;
		case 'runtimeTooOld':
			message = localize('localModel.runtimeTooOld', "The llama-server at {0} is missing features VS Code needs ({1}). Install a newer llama.cpp build, then set {2} to its llama-server, or add llama-server to PATH, and select Retry.", details.path ?? '', (details.missingFlags ?? []).join(', '), serverPathSettingLabel());
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

/**
 * Localized `runtimeUnverifiable` error: the install's runtime digest cannot
 * be computed, because its library locations hold more files or bytes than
 * the caps, or something there cannot be read. The install is never
 * executed or approved.
 */
export function createLlamaRuntimeUnverifiableError(realPath: string, reason: 'limits' | 'unreadable', platform: NodeJS.Platform): ILocalModelErrorV1 {
	const folder = pathApi(platform).dirname(realPath);
	const setting = LocalModelLlamaServerPathSettingId;
	return reason === 'limits'
		? { code: RUNTIME_UNVERIFIABLE, message: localize('localModel.runtimeUnverifiableLimits', "VS Code can't verify the llama.cpp at {0}: its folder holds more than {1} library files or {2} GB of them. Set `{3}` to a llama-server installed in a folder of its own.", folder, String(LLAMA_RUNTIME_DIGEST_MAX_FILES), String(LLAMA_RUNTIME_DIGEST_MAX_BYTES / (1024 * 1024 * 1024)), setting), actions: ['openSettings'] }
		: { code: RUNTIME_UNVERIFIABLE, message: localize('localModel.runtimeUnverifiableUnreadable', "VS Code can't verify the llama.cpp at {0}: some of its library files can't be read. Check the folder's permissions, or set `{1}` to another build.", folder, setting), actions: ['retry', 'openSettings'] };
}

/** Whether a file-system error means the path does not exist. */
function isMissingFileError(error: unknown): boolean {
	const code = (error as { readonly code?: unknown } | undefined)?.code;
	return code === 'ENOENT' || code === 'ENOTDIR';
}

// #endregion

// #region Architecture probe

/** Whether a `llama-server` knows a model architecture. `unknown` (an ambiguous probe) never blocks anything. */
export type LlamaArchitectureSupport = 'supported' | 'unsupported' | 'unknown';

/** {@link LlamaCppRuntime.checkArchitectureSupport}: `untrusted` when the install's fresh runtime digest no longer carries its approval (nothing ran). */
export type LlamaArchitectureCheck = LlamaArchitectureSupport | 'untrusted';

const LLAMA_ARCHITECTURE_NAME = new RegExp(`^[a-z0-9][a-z0-9._-]{0,${LLAMA_ARCHITECTURE_NAME_MAX_LENGTH - 1}}$`);

/**
 * `value` when it is a plausible llama.cpp architecture name (bounded length,
 * `[a-z0-9._-]` only), else `undefined`. Names are validated, never
 * rewritten: llama.cpp looks them up exactly. Pure.
 */
export function sanitizeLlamaArchitecture(value: string | undefined): string | undefined {
	return value !== undefined && LLAMA_ARCHITECTURE_NAME.test(value) ? value : undefined;
}

/**
 * Arguments of the architecture probe: the synthetic model, loopback with an
 * ephemeral port, no GPU offload, and no fit pass (which would load the model
 * twice). Only flags every qualified build has. The probe's random API key is
 * not here: it travels as {@link LLAMA_API_KEY_ENV} in the probe environment
 * ({@link buildProbeEnvironment}), never on the command line. Pure.
 */
export function buildArchitectureProbeArgs(modelPath: string): string[] {
	return ['--model', modelPath, '--host', '127.0.0.1', '--port', '0', '--fit', 'off', '--n-gpu-layers', '0'];
}

/**
 * Classifies the architecture probe: `llama-server` loading a synthetic GGUF
 * that holds only `general.architecture`. llama.cpp looks the architecture
 * up before anything else, so `unknown model architecture: '<name>'` is
 * `unsupported`, and an error of a later load step (hyperparameters, as
 * `key not found in model: <name>.context_length`, vocabulary or tensors)
 * is `supported`. Anything else (timeout, crash, cancellation, a clean exit,
 * unexpected output) is `unknown`. Pure.
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

/**
 * The change a llama.cpp build needs to run `architecture` when no llama.cpp
 * release supports it yet ({@link UNPACKAGED_LLAMA_ARCHITECTURES}), else
 * `undefined`. Pure.
 */
export function unpackagedLlamaArchitectureChange(architecture: string | undefined): string | undefined {
	const name = architecture?.toLowerCase();
	return name !== undefined && Object.prototype.hasOwnProperty.call(UNPACKAGED_LLAMA_ARCHITECTURES, name) ? UNPACKAGED_LLAMA_ARCHITECTURES[name] : undefined;
}

/**
 * `runtimeUnsupportedModel`: the resolved llama.cpp can't load the model's
 * architecture, found when the model is loaded. The message says how to get
 * a build that can (naming the change it needs when no release has it yet,
 * {@link unpackagedLlamaArchitectureChange}) and where to point VS Code at it.
 */
export function createRuntimeUnsupportedModelError(version: string | undefined, displayName: string, architecture?: string): ILocalModelErrorV1 {
	const change = unpackagedLlamaArchitectureChange(architecture);
	const setting = serverPathSettingLabel();
	let message: string;
	if (change) {
		message = version
			? localize('localModel.runtimeUnpackagedModel', "This llama.cpp build ({0}) can't run {1}. Install a llama.cpp build that includes {2}, then set {3} to its llama-server, or add llama-server to PATH, and select Retry.", version, displayName, change, setting)
			: localize('localModel.runtimeUnpackagedModelNoVersion', "This llama.cpp build can't run {0}. Install a llama.cpp build that includes {1}, then set {2} to its llama-server, or add llama-server to PATH, and select Retry.", displayName, change, setting);
	} else {
		message = version
			? localize('localModel.runtimeUnsupportedModel', "This llama.cpp build ({0}) can't run {1}. Install a llama.cpp build that supports it, then set {2} to its llama-server, or add llama-server to PATH, and select Retry.", version, displayName, setting)
			: localize('localModel.runtimeUnsupportedModelNoVersion', "This llama.cpp build can't run {0}. Install a llama.cpp build that supports it, then set {1} to its llama-server, or add llama-server to PATH, and select Retry.", displayName, setting);
	}
	return { code: 'runtimeUnsupportedModel', message, actions: [...LLAMA_CPP_DIRECTIONS_ACTIONS] };
}

// #endregion

// #region Detection

/** One `llama-server` found by detection. */
export interface ILlamaServerCandidate {
	/** Path as found. */
	readonly path: string;
	/** `fs.realpath` of {@link path}; recorded and used for approval. */
	readonly realPath: string;
	readonly source: Exclude<LocalModelRuntimeSource, 'none'>;
}

/** File-system and process inputs to detection; injectable. */
export interface ILlamaDetectionHost {
	readonly platform: NodeJS.Platform;
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly homeDir: string;
	/** Open workspace folders: `PATH` entries inside them are skipped. */
	readonly workspaceFolders: readonly string[];
	realpath(path: string): Promise<string>;
	/** Whether `path` is an existing regular file. */
	isFile(path: string): Promise<boolean>;
	readdir(path: string): Promise<string[]>;
	/** Live `Path` values from the Windows registry (empty elsewhere). */
	readLiveWindowsPaths(): Promise<string[]>;
}

/** Expands `%VAR%` references (case-insensitive) from `env`; unknown variables are left as-is. Pure. */
export function expandWindowsEnvironmentVariables(value: string, env: Readonly<Record<string, string | undefined>>): string {
	const lookup = new Map(Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string').map(([key, val]) => [key.toLowerCase(), val]));
	return value.replace(/%(?<name>[^%;]+)%/g, (whole, name: string) => lookup.get(name.toLowerCase()) ?? whole);
}

/** Splits a PATH-style list, trimming quotes. Pure. */
export function splitPathList(value: string, platform: NodeJS.Platform): string[] {
	return value.split(platform === 'win32' ? ';' : ':').map(entry => entry.trim().replace(/^"(.*)"$/, '$1'));
}

function pathApi(platform: NodeJS.Platform) {
	return platform === 'win32' ? path.win32 : path.posix;
}

function isUnder(parent: string, child: string, platform: NodeJS.Platform): boolean {
	const api = pathApi(platform);
	const relative = api.relative(api.resolve(parent), api.resolve(child));
	return relative === '' || (!!relative && relative !== '..' && !relative.startsWith(`..${api.sep}`) && !api.isAbsolute(relative));
}

/** Workspace folders as given plus their canonical (`realpath`) forms, read fresh on every detection pass. */
async function canonicalWorkspaceRoots(host: Pick<ILlamaDetectionHost, 'workspaceFolders' | 'realpath'>): Promise<string[]> {
	const roots: string[] = [];
	for (const folder of host.workspaceFolders) {
		if (!folder) {
			continue;
		}
		roots.push(folder);
		try {
			const real = await host.realpath(folder);
			if (real !== folder) {
				roots.push(real);
			}
		} catch {
			// A missing folder still excludes its lexical path.
		}
	}
	return roots;
}

/**
 * Trust boundary for `PATH` entries: absolute only; skip empty, `.`,
 * relative entries and anything inside an open workspace folder. Pure.
 */
export function isTrustedPathEntry(entry: string, platform: NodeJS.Platform, workspaceFolders: readonly string[]): boolean {
	const api = pathApi(platform);
	if (!entry || entry === '.' || !api.isAbsolute(entry) || (platform === 'win32' && !/^([A-Za-z]:\\|\\\\)/.test(entry))) {
		return false;
	}
	return !workspaceFolders.some(folder => isUnder(folder, entry, platform));
}

function knownLocationRoot(location: ILlamaServerKnownLocation, host: ILlamaDetectionHost): string | undefined {
	switch (location.root) {
		case 'absolute': return '';
		case 'home': return host.homeDir;
		case 'localAppData': return host.env.LOCALAPPDATA ?? (host.homeDir ? pathApi(host.platform).join(host.homeDir, 'AppData', 'Local') : undefined);
	}
}

async function expandKnownLocation(location: ILlamaServerKnownLocation, host: ILlamaDetectionHost): Promise<string[]> {
	const api = pathApi(host.platform);
	const root = knownLocationRoot(location, host);
	if (root === undefined) {
		return [];
	}
	let current = [location.root === 'absolute' ? (host.platform === 'win32' ? '' : '/') : root];
	for (const segment of location.path.split('/').filter(Boolean)) {
		const next: string[] = [];
		for (const base of current) {
			if (segment.endsWith('*')) {
				const prefix = segment.slice(0, -1).toLowerCase();
				try {
					for (const entry of (await host.readdir(base)).sort()) {
						if (entry.toLowerCase().startsWith(prefix)) {
							next.push(api.join(base, entry));
						}
					}
				} catch {
					// Missing directory.
				}
			} else {
				next.push(base ? api.join(base, segment) : segment);
			}
		}
		current = next;
	}
	return current;
}

/**
 * Lists candidates in detection order: `LLAMACPP_SERVER_PATH`
 * -> `PATH` (process PATH plus, on Windows, the live registry `Path` values)
 * -> known install locations. Deduplicated by real path. The setting is
 * handled separately (explicit, no fallback).
 *
 * Workspace folders are canonicalized (`realpath`) on every pass, and both
 * the lexical and the resolved paths of PATH entries and candidates are
 * excluded when they fall inside one, so a symlinked workspace cannot slip a
 * binary into the probes.
 */
export async function listLlamaServerCandidates(host: ILlamaDetectionHost): Promise<ILlamaServerCandidate[]> {
	const api = pathApi(host.platform);
	const exe = host.platform === 'win32' ? LLAMA_SERVER_EXECUTABLE_NAME.win32 : LLAMA_SERVER_EXECUTABLE_NAME.posix;
	const candidates: ILlamaServerCandidate[] = [];
	const seen = new Set<string>();
	const workspaceRoots = await canonicalWorkspaceRoots(host);
	const inWorkspace = (candidatePath: string) => workspaceRoots.some(folder => isUnder(folder, candidatePath, host.platform));
	const add = async (filePath: string, source: ILlamaServerCandidate['source']) => {
		if (!api.isAbsolute(filePath) || inWorkspace(filePath) || !await host.isFile(filePath)) {
			return;
		}
		let realPath: string;
		try {
			realPath = await host.realpath(filePath);
		} catch {
			return;
		}
		const key = host.platform === 'win32' ? realPath.toLowerCase() : realPath;
		if (seen.has(key) || inWorkspace(realPath)) {
			return;
		}
		seen.add(key);
		candidates.push({ path: filePath, realPath, source });
	};

	const envPath = host.env[LLAMACPP_SERVER_PATH_ENV_VAR]?.trim();
	if (envPath) {
		await add(envPath, 'env');
	}

	const pathValue = host.env.PATH ?? host.env.Path ?? '';
	const entries = splitPathList(pathValue, host.platform);
	if (host.platform === 'win32') {
		for (const live of await host.readLiveWindowsPaths()) {
			entries.push(...splitPathList(expandWindowsEnvironmentVariables(live, host.env), host.platform));
		}
	}
	for (const entry of entries) {
		if (isTrustedPathEntry(entry, host.platform, workspaceRoots)) {
			await add(api.join(entry, exe), 'path');
		}
	}

	const platformKey = host.platform === 'win32' || host.platform === 'darwin' ? host.platform : 'linux';
	for (const location of LLAMA_SERVER_KNOWN_LOCATIONS[platformKey]) {
		for (const filePath of await expandKnownLocation(location, host)) {
			await add(filePath, 'packageManager');
		}
	}
	return candidates;
}

/**
 * GPU device selection the server inherits with the host environment: the
 * probe (`--list-devices`) must see the same devices, numbered the same way,
 * as the server it binds with `--device`.
 */
const DEVICE_SELECTION_ENV: readonly string[] = ['CUDA_VISIBLE_DEVICES', 'HIP_VISIBLE_DEVICES', 'ROCR_VISIBLE_DEVICES', 'GGML_VK_VISIBLE_DEVICES', 'ONEAPI_DEVICE_SELECTOR'];

/**
 * Probe environment: minimal, credential-free, with only what the
 * loader and GPU drivers need, and the GPU device selection. No `LLAMA_*`
 * variable of the host is passed (llama.cpp reads them as arguments); a
 * probe that starts a server gets its own random `apiKey` as
 * {@link LLAMA_API_KEY_ENV}. Pure.
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

// #region Approval and capability cache

type ApprovedTrust = Extract<LocalModelRuntimeTrust, 'userApproved'>;

interface IApprovalRecord {
	readonly realPath: string;
	/** The runtime digest (executable plus its install's shared libraries) that was approved. */
	readonly digest: string;
	readonly trust: ApprovedTrust;
}

const APPROVALS_KEY = 'localModel.runtimeApprovals';
const CAPABILITIES_KEY = 'localModel.runtimeCapabilities';

/**
 * Approvals of `llama-server` installs, keyed by the executable's real path
 * and the runtime digest (see {@link computeLlamaRuntimeDigest}) and
 * persisted in Agent Host storage. Any change to the executable or to a
 * shared library of its install requires approval again. Records without a
 * runtime digest (executable-only approvals) are ignored; a record of an
 * install an earlier VS Code installed (`installedByVSCode`, after the user's
 * consent) counts as the user's approval.
 */
export class LlamaServerApprovalStore {

	constructor(private readonly _storage: Pick<IAgentHostStorageService, 'get' | 'set'> | undefined, private readonly _log?: { warn(message: string): void }) { }

	lookup(realPath: string, digest: string): ApprovedTrust | undefined {
		return this._read().find(record => record.realPath === realPath && record.digest === digest)?.trust;
	}

	/** Real paths with an approval record (of any digest). */
	approvedPaths(): string[] {
		return this._read().map(record => record.realPath);
	}

	record(realPath: string, digest: string): void {
		const records = this._read().filter(record => record.realPath !== realPath);
		records.push({ realPath, digest, trust: 'userApproved' });
		// Belt and braces: a record that holds anything credential-like is never written.
		const scrubbed = dropCredentialItems(records);
		reportDroppedStorageEntries(this._log, APPROVALS_KEY, scrubbed.dropped);
		this._storage?.set(APPROVALS_KEY, scrubbed.kept);
	}

	private _read(): IApprovalRecord[] {
		const value = this._storage?.get<unknown>(APPROVALS_KEY);
		if (!Array.isArray(value)) {
			return [];
		}
		const records: IApprovalRecord[] = value
			.filter((record): record is { readonly realPath: string; readonly digest: string; readonly trust: string } => !!record && typeof record.realPath === 'string' && typeof record.digest === 'string' && (record.trust === 'installedByVSCode' || record.trust === 'userApproved') && !containsCredential(record))
			.map(record => ({ realPath: record.realPath, digest: record.digest, trust: 'userApproved' }));
		reportDroppedStorageEntries(this._log, APPROVALS_KEY, value.length - records.length);
		return records;
	}
}

/** At most this many files (the executable plus its shared libraries) are covered by a runtime digest; more is unverifiable. */
export const LLAMA_RUNTIME_DIGEST_MAX_FILES = 200;
/** At most this many bytes are covered by a runtime digest; more is unverifiable. */
export const LLAMA_RUNTIME_DIGEST_MAX_BYTES = 1024 * 1024 * 1024;

/** One file covered by a runtime digest. */
export interface ILlamaRuntimeFile {
	/** Path relative to the executable's directory, `/`-separated (lowercase on Windows). */
	readonly path: string;
	readonly size: number;
	/** SHA-256 (lowercase hex) of the file's content. */
	readonly sha256: string;
}

/**
 * The runtime digest that approvals and consent bind: SHA-256 over the sorted
 * `(relative path, size, sha256)` of the executable and of every shared
 * library it can load from its install (the same construction as a model's
 * `contentId`). Pure.
 */
export function computeLlamaRuntimeDigest(files: readonly ILlamaRuntimeFile[]): string {
	return computeContentId(files.map(file => ({ path: file.path, sizeBytes: file.size, sha256: file.sha256 })));
}

/**
 * Where a `llama-server` loads shared libraries from its own install, relative
 * to the executable's directory: on Windows every `*.dll` beside it; on macOS
 * `*.dylib` beside it and in `../lib`; on Linux `*.so` and `*.so.*` beside it
 * and in `../lib`. Pure.
 */
export function getLlamaRuntimeLibraryLocations(platform: NodeJS.Platform): { readonly dirs: readonly string[]; readonly pattern: RegExp } {
	if (platform === 'win32') {
		return { dirs: ['.'], pattern: /\.dll$/i };
	}
	if (platform === 'darwin') {
		return { dirs: ['.', '../lib'], pattern: /\.dylib$/i };
	}
	return { dirs: ['.', '../lib'], pattern: /\.so$|\.so\./ };
}

/** A device without its dynamic `free` value (static capability). */
export type ILlamaStaticDevice = Omit<ILlamaDevice, 'freeBytes'>;

/** Static capability of a probed install, cached by real path and reused only for the same runtime digest, size and GPU topology. */
export interface ILlamaServerCapability {
	readonly realPath: string;
	/** Modification time of the executable. */
	readonly mtimeMs: number;
	/** Total bytes covered by the runtime digest (the executable plus its shared libraries). */
	readonly size: number;
	/** The runtime digest ({@link computeLlamaRuntimeDigest}) of the probed install. */
	readonly sha256: string;
	readonly topologyKey: string;
	readonly version: ILlamaServerVersion;
	/** Relevant `--help` flags and the `--spec-type` values. */
	readonly flags: readonly string[];
	readonly specTypes: readonly string[];
	readonly devices: readonly ILlamaStaticDevice[];
}

/** {@link ILlamaServerFlagSupport} from a capability. Pure. */
export function getFlagSupport(capability: Pick<ILlamaServerCapability, 'flags' | 'specTypes'>): ILlamaServerFlagSupport {
	const help: ILlamaServerHelp = { flags: new Set(capability.flags), specTypes: new Set(capability.specTypes) };
	return { flags: help.flags, dflashSupported: qualifyLlamaServerHelp(help, false).dflashSupported };
}

/** `version` for the status and consent text: `0.6.0-dev (b11459)`, `b6123`, or the raw token. Pure. */
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
	readonly candidate?: ILlamaServerCandidate;
	readonly capability?: ILlamaServerCapability;
	/** The binary may serve: the user approved it (or named it in the setting). */
	readonly approved: boolean;
	/** Why the setting's, `LLAMACPP_SERVER_PATH`'s or an approved binary can't serve (too old, blocked, unverifiable, ...). */
	readonly error?: ILocalModelErrorV1;
	/**
	 * A detected binary not yet approved, identified by its files only (`size`
	 * and the runtime digest `sha256` of the executable plus its shared
	 * libraries): it has not been executed (so there is no capability or
	 * version) and is probed only after the user approves exactly this digest.
	 */
	readonly unprobed?: { readonly size: number; readonly sha256: string };
}

/** `--list-devices` of an approved binary; `untrusted` when its fresh runtime digest no longer carries the approval (nothing ran). */
export type LlamaDeviceListing =
	| { readonly kind: 'devices'; readonly devices: ILlamaDevice[] }
	| { readonly kind: 'failed' }
	| { readonly kind: 'untrusted' };

/**
 * An install's identity: the executable's canonical path and the runtime
 * digest over it and its shared libraries, or `unverifiable` when the
 * libraries exceed the caps or cannot be read.
 */
type LlamaRuntimeIdentity =
	| {
		readonly kind: 'digest';
		readonly realPath: string;
		/** Modification time of the executable. */
		readonly mtimeMs: number;
		/** Total bytes covered. */
		readonly size: number;
		/** The runtime digest. */
		readonly sha256: string;
		/** Hashed during this call (not taken from the status-only memo). */
		readonly fresh: boolean;
	}
	| { readonly kind: 'unverifiable'; readonly realPath: string; readonly reason: 'limits' | 'unreadable' };

type LlamaVerifiedIdentity = Extract<LlamaRuntimeIdentity, { readonly kind: 'digest' }>;

/** How an identity may be established: `fresh` always re-hashes (before anything runs); `status` may reuse a digest whose files' stat is unchanged (display only). */
type LlamaIdentityMode = 'fresh' | 'status';

/** Stat of one file covered by a runtime digest; `ctimeMs`/`ino` strengthen the status-only memo when available. */
interface ILlamaFileStat {
	readonly mtimeMs: number;
	readonly size: number;
	readonly ctimeMs?: number;
	readonly ino?: number;
}

const RUNTIME_UNVERIFIABLE = 'runtimeUnverifiable';

/** Why a candidate may be probed: an approval of its current hash, or the user's explicit path (the setting or `LLAMACPP_SERVER_PATH`). */
type LlamaProbeAuthorization = 'approval' | 'explicit';

const RUNTIME_CHANGED = 'runtimeChanged';

export interface ILlamaCppRuntimeOptions {
	readonly storage: Pick<IAgentHostStorageService, 'get' | 'set'> | undefined;
	readonly log: ILogService;
	readonly runner?: IProcessRunner;
	readonly platform?: NodeJS.Platform;
	readonly env?: Readonly<Record<string, string | undefined>>;
	readonly homeDir?: string;
	/** Probe working directory root (a VS Code temp directory, never a workspace). */
	readonly tempDir?: string;
	readonly workspaceFolders?: () => readonly string[];
	readonly detectionHost?: ILlamaDetectionHost;
	/** Stat used for the runtime digest and capability caching; injectable. */
	readonly stat?: (path: string) => Promise<ILlamaFileStat>;
	readonly hashFile?: (path: string, signal?: AbortSignal) => Promise<string>;
}

export interface ILlamaResolveOptions {
	/** `chat.copilot.localModel.enabled`: binaries are executed only while it is on. */
	readonly enabled: boolean;
	/** Trimmed `chat.copilot.localModel.llamaServerPath`. */
	readonly settingPath?: string;
	/** The preset uses a draft model (`--device-draft` becomes required). */
	readonly needsDraft?: boolean;
	/** Stage A topology key; a change invalidates cached device capability. */
	readonly topologyKey?: string;
	readonly signal?: AbortSignal;
}

/**
 * Detects, qualifies and approves an existing llama.cpp. VS Code never
 * installs or upgrades it.
 */
export class LlamaCppRuntime {

	readonly approvals: LlamaServerApprovalStore;
	private readonly _runner: IProcessRunner;
	private readonly _platform: NodeJS.Platform;
	private readonly _env: Readonly<Record<string, string | undefined>>;
	private readonly _homeDir: string;
	private readonly _tempDir: string;
	private readonly _host: ILlamaDetectionHost;
	private readonly _stat: (path: string) => Promise<ILlamaFileStat>;
	private readonly _hashFile: (path: string, signal?: AbortSignal) => Promise<string>;
	/**
	 * Runtime digests by executable real path, with the stat fingerprint of
	 * the files they covered. Display only (`status` mode): anything that
	 * executes a binary or records trust hashes afresh.
	 */
	private readonly _statusDigests = new Map<string, { readonly fingerprint: string; readonly sha256: string }>();
	/** Architecture probe results by runtime digest and architecture name (`unknown` is never cached). */
	private readonly _architectureSupport = new Map<string, Exclude<LlamaArchitectureSupport, 'unknown'>>();

	constructor(private readonly _options: ILlamaCppRuntimeOptions) {
		this._runner = _options.runner ?? new NodeProcessRunner();
		this._platform = _options.platform ?? process.platform;
		this._env = _options.env ?? process.env;
		this._homeDir = _options.homeDir ?? os.homedir();
		this._tempDir = _options.tempDir ?? path.join(os.tmpdir(), 'vscode-local-model-probe');
		this.approvals = new LlamaServerApprovalStore(_options.storage, _options.log);
		this._stat = _options.stat ?? (async p => {
			const stat = await fs.promises.stat(p);
			return { mtimeMs: stat.mtimeMs, size: stat.size, ctimeMs: stat.ctimeMs, ino: stat.ino };
		});
		this._hashFile = _options.hashFile ?? ((p, signal) => computeFileSha256(p, { signal }));
		const workspaceFolders = _options.workspaceFolders;
		this._host = _options.detectionHost ?? {
			platform: this._platform,
			env: this._env,
			homeDir: this._homeDir,
			// Read on every detection pass: workspaces open and close while the host runs.
			get workspaceFolders() { return workspaceFolders?.() ?? []; },
			realpath: p => fs.promises.realpath(p),
			isFile: async p => {
				try {
					return (await fs.promises.stat(p)).isFile();
				} catch {
					return false;
				}
			},
			readdir: p => fs.promises.readdir(p),
			readLiveWindowsPaths: () => this._readLiveWindowsPaths(),
		};
	}

	/**
	 * Resolves the runtime: the explicit setting (errors
	 * shown, no fallback; a qualifying binary is approved by the setting, for
	 * the runtime digest it was probed with), else the first qualifying
	 * candidate that may be probed. Fail closed: before the user's consent only
	 * these are executed (probed): an install already approved by real path
	 * and runtime digest, and `LLAMACPP_SERVER_PATH`. Any other `PATH` or
	 * known-location binary is reported `pendingApproval` by its files only
	 * (real path, size, runtime digest), never executed, and probed once
	 * approved. An install whose libraries exceed the digest caps (or cannot
	 * be read) stays `pendingApproval` with a `runtimeUnverifiable` error and
	 * is never executed. A display-only refresh reuses a digest whose files'
	 * stat is unchanged; anything about to run is hashed afresh.
	 * Non-qualifying binaries are ignored silently, except an approved one
	 * (its error is shown, e.g. `runtimeTooOld`). Never executes anything
	 * while the setting is off.
	 */
	async resolve(options: ILlamaResolveOptions): Promise<ILlamaRuntimeResolution> {
		return this._resolve(options, false);
	}

	private async _resolve(options: ILlamaResolveOptions, recheckedApproval: boolean): Promise<ILlamaRuntimeResolution> {
		if (!options.enabled) {
			return { runtime: { source: 'none', trust: 'none' }, approved: false };
		}
		const topologyKey = options.topologyKey ?? '';

		if (options.settingPath) {
			const settingPath = options.settingPath;
			const api = pathApi(this._platform);
			if (!api.isAbsolute(settingPath) || !await this._host.isFile(settingPath)) {
				return { runtime: { source: 'setting', trust: 'none' }, approved: false, error: createLlamaRuntimeError({ code: 'runtimeNotFound' }, {}) };
			}
			let realPath: string;
			try {
				realPath = await this._host.realpath(settingPath);
			} catch {
				return { runtime: { source: 'setting', trust: 'none' }, approved: false, error: createLlamaRuntimeError({ code: 'runtimeNotFound' }, {}) };
			}
			const candidate: ILlamaServerCandidate = { path: settingPath, realPath, source: 'setting' };
			const outcome = await this._qualify(candidate, 'explicit', !!options.needsDraft, topologyKey, options.signal);
			if (outcome.ok) {
				// Naming the binary in the setting is the user's approval. Recording it binds serving to
				// the digest just probed: a binary changed after this is checked again before it runs.
				if (!this.approvals.lookup(realPath, outcome.capability.sha256)) {
					this.approvals.record(realPath, outcome.capability.sha256);
				}
				return this._toResolution(candidate, outcome.capability);
			}
			return outcome.error.code === RUNTIME_UNVERIFIABLE
				? this._unverifiableResolution(candidate, outcome.error)
				: { runtime: { source: 'setting', trust: 'none' }, candidate, approved: false, error: outcome.error };
		}

		let failure: { readonly candidate: ILlamaServerCandidate; readonly error: ILocalModelErrorV1 } | undefined;
		let unverifiable: { readonly candidate: ILlamaServerCandidate; readonly error: ILocalModelErrorV1 } | undefined;
		/** Approval candidates whose fresh digest no longer matched: offered for approval again below. */
		const rechecked = new Set<string>();
		const detected = await listLlamaServerCandidates(this._host);
		// An install the user approved wins over earlier, unapproved ones (by its runtime digest, without executing anything).
		const approvedCandidate = await this._findApprovedCandidate(detected, options.signal);
		const verified: { readonly candidate: ILlamaServerCandidate; readonly authorization: LlamaProbeAuthorization }[] = [];
		const isVerified = (candidate: ILlamaServerCandidate) => verified.some(entry => this._samePath(entry.candidate.realPath, candidate.realPath));
		if (approvedCandidate) {
			verified.push({ candidate: approvedCandidate, authorization: 'approval' });
		}
		for (const candidate of detected) {
			if (!isVerified(candidate) && candidate.source === 'env') {
				verified.push({ candidate, authorization: 'explicit' });
			}
		}
		for (const { candidate, authorization } of verified) {
			if (options.signal?.aborted) {
				break;
			}
			const outcome = await this._qualify(candidate, authorization, !!options.needsDraft, topologyKey, options.signal);
			if (outcome.ok) {
				return this._toResolution(candidate, outcome.capability);
			}
			this._options.log.info(`[LocalModelRuntime] Ignoring ${candidate.source} candidate (${outcome.error.code})`);
			if (outcome.error.code === RUNTIME_CHANGED) {
				// The display-only digest still matched an approval, but the fresh one taken before
				// probing does not: judge every candidate again on the fresh digest (once). A change
				// between probes is not retried: nothing more runs, and the file is offered for
				// approval (unprobed) below.
				if (!recheckedApproval && !outcome.changedWhileProbing) {
					return this._resolve(options, true);
				}
				rechecked.add(this._pathKey(candidate.realPath));
				continue;
			}
			if (outcome.error.code === RUNTIME_UNVERIFIABLE) {
				unverifiable ??= { candidate, error: outcome.error };
				continue;
			}
			if (authorization === 'approval') {
				failure ??= { candidate, error: outcome.error };
			}
		}
		if (failure) {
			// The user approved this binary: say why it can't serve (too old, blocked, ...) rather than skipping it silently.
			const { candidate, error } = failure;
			return { runtime: { source: candidate.source, trust: 'none' }, candidate, approved: false, error };
		}
		// Anything else waits for the user's approval, identified by its files only: it is not executed.
		for (const candidate of detected) {
			if (options.signal?.aborted) {
				break;
			}
			if (isVerified(candidate) && !rechecked.has(this._pathKey(candidate.realPath))) {
				continue;
			}
			const identity = await this._identify(candidate.path, options.signal, 'status');
			if (!identity || !this._samePath(identity.realPath, candidate.realPath)) {
				continue;
			}
			if (identity.kind === 'unverifiable') {
				unverifiable ??= { candidate, error: createLlamaRuntimeUnverifiableError(identity.realPath, identity.reason, this._platform) };
				continue;
			}
			return {
				runtime: { source: candidate.source, trust: 'pendingApproval', path: identity.realPath, sha256: identity.sha256, size: identity.size },
				candidate,
				approved: false,
				unprobed: { size: identity.size, sha256: identity.sha256 },
			};
		}
		if (unverifiable) {
			return this._unverifiableResolution(unverifiable.candidate, unverifiable.error);
		}
		return { runtime: { source: 'none', trust: 'none' }, approved: false };
	}

	/**
	 * Records the user's approval of exactly the install the consent showed:
	 * the runtime digest (executable plus shared libraries), computed afresh at
	 * the executable's canonical path, must equal `expectedSha256`. A cached
	 * digest never stands in for it.
	 */
	async approve(realPath: string, expectedSha256: string, signal?: AbortSignal): Promise<boolean> {
		const identity = await this._identify(realPath, signal, 'fresh');
		if (identity?.kind !== 'digest' || !this._samePath(identity.realPath, realPath) || identity.sha256 !== expectedSha256) {
			return false;
		}
		this.approvals.record(identity.realPath, identity.sha256);
		return true;
	}

	/**
	 * Fresh `--list-devices` (dynamic `free`) for Stage B and admission. Never
	 * cached, and run only after the install's freshly computed runtime digest
	 * matched its approval: a changed executable or library is `untrusted`
	 * and nothing is executed.
	 */
	async listDevices(candidate: Pick<ILlamaServerCandidate, 'path' | 'realPath'>, signal?: AbortSignal): Promise<LlamaDeviceListing> {
		await this._ensureProbeDirectory();
		// The last asynchronous step before the probe runs.
		const identity = await this._verifiedIdentity(candidate, signal, 'fresh');
		if (!identity) {
			return { kind: 'untrusted' };
		}
		const result = await this._probe(identity.realPath, ['--list-devices'], LLAMA_SERVER_PROBE_OUTPUT_CAP_BYTES, signal);
		const devices = result.exitCode === 0 ? parseListDevicesOutput(result.stdout) : undefined;
		return devices ? { kind: 'devices', devices } : { kind: 'failed' };
	}

	/**
	 * Architecture probe: whether this
	 * install can load `architecture`, without a real model. Writes a
	 * synthetic GGUF holding only `general.architecture` into a private temp
	 * directory and runs `llama-server` on it ({@link buildArchitectureProbeArgs})
	 * in the probe sandbox (temp cwd, minimal env, timeout, output cap), only
	 * after the install's freshly computed runtime digest matched its approval
	 * (`untrusted` otherwise: nothing runs). Results are cached by runtime
	 * digest and architecture; `unknown` is not cached. A name that fails
	 * {@link sanitizeLlamaArchitecture} is `unknown`, and nothing is written
	 * or run for it.
	 */
	async checkArchitectureSupport(candidate: Pick<ILlamaServerCandidate, 'path' | 'realPath'>, architecture: string, signal?: AbortSignal): Promise<LlamaArchitectureCheck> {
		const name = sanitizeLlamaArchitecture(architecture);
		if (!name) {
			return 'unknown';
		}
		// A cached answer runs nothing, so a display-only digest is enough to look it up.
		const current = await this._verifiedIdentity(candidate, signal, 'status');
		if (!current) {
			return 'untrusted';
		}
		const cached = this._architectureSupport.get(`${current.sha256}\n${name}`);
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
			// The last asynchronous step before the probe runs.
			const identity = await this._verifiedIdentity(candidate, signal, 'fresh');
			if (!identity) {
				return 'untrusted';
			}
			const key = `${identity.sha256}\n${name}`;
			const known = this._architectureSupport.get(key);
			if (known) {
				return known;
			}
			const result = await this._probe(identity.realPath, buildArchitectureProbeArgs(modelPath), LLAMA_SERVER_PROBE_OUTPUT_CAP_BYTES, signal, randomBytes(16).toString('hex'));
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

	private _samePath(a: string, b: string): boolean {
		return this._pathKey(a) === this._pathKey(b);
	}

	private _pathKey(filePath: string): string {
		return this._platform === 'win32' ? filePath.toLowerCase() : filePath;
	}

	/**
	 * The install's identity: the executable's canonical path and the runtime
	 * digest over it and the shared libraries of its install (see
	 * {@link getLlamaRuntimeLibraryLocations}), or `unverifiable` beyond
	 * {@link LLAMA_RUNTIME_DIGEST_MAX_FILES} files /
	 * {@link LLAMA_RUNTIME_DIGEST_MAX_BYTES} bytes or when a library cannot be
	 * read. `fresh` hashes every file now (the only basis for trust and for
	 * anything that executes); `status` may reuse the last digest when every
	 * file's stat is unchanged (display only). Undefined when the executable
	 * is gone.
	 */
	private async _identify(filePath: string, signal: AbortSignal | undefined, mode: LlamaIdentityMode): Promise<LlamaRuntimeIdentity | undefined> {
		let realPath: string;
		let executable: ILlamaFileStat;
		try {
			realPath = await this._host.realpath(filePath);
			executable = await this._stat(realPath);
		} catch {
			return undefined;
		}
		const listed = await this._listRuntimeFiles(realPath, executable);
		if (listed.kind !== 'files') {
			return { kind: 'unverifiable', realPath, reason: listed.kind };
		}
		const fingerprint = JSON.stringify(listed.entries.map(entry => [entry.path, entry.real, entry.stat.size, entry.stat.mtimeMs, entry.stat.ctimeMs ?? null, entry.stat.ino ?? null]));
		const key = this._pathKey(realPath);
		const remembered = this._statusDigests.get(key);
		if (mode === 'status' && remembered?.fingerprint === fingerprint) {
			return { kind: 'digest', realPath, mtimeMs: executable.mtimeMs, size: listed.size, sha256: remembered.sha256, fresh: false };
		}
		// Each distinct file is hashed once (hashing is CPU-bound on this thread, so in sequence).
		const hashes = new Map<string, string>();
		for (const file of new Set(listed.entries.map(entry => entry.real))) {
			try {
				hashes.set(file, await this._hashFile(file, signal));
			} catch {
				return signal?.aborted || file === realPath ? undefined : { kind: 'unverifiable', realPath, reason: 'unreadable' };
			}
		}
		const files: ILlamaRuntimeFile[] = listed.entries.map(entry => ({ path: entry.path, size: entry.stat.size, sha256: hashes.get(entry.real)! }));
		const sha256 = computeLlamaRuntimeDigest(files);
		this._statusDigests.set(key, { fingerprint, sha256 });
		return { kind: 'digest', realPath, mtimeMs: executable.mtimeMs, size: listed.size, sha256, fresh: true };
	}

	/**
	 * The files a runtime digest covers: the executable and every shared
	 * library of its install, each with its relative path, canonical path (an
	 * aliasing symlink is hashed and counted once) and stat. Bounded by the
	 * digest caps (`limits`); an unreadable library location or file is
	 * `unreadable`. A missing `../lib` is simply empty.
	 */
	private async _listRuntimeFiles(realPath: string, executable: ILlamaFileStat): Promise<{ readonly kind: 'files'; readonly size: number; readonly entries: readonly { readonly path: string; readonly real: string; readonly stat: ILlamaFileStat }[] } | { readonly kind: 'limits' | 'unreadable' }> {
		const api = pathApi(this._platform);
		const relative = (value: string) => this._platform === 'win32' ? value.replace(/\\/g, '/').toLowerCase() : value;
		const directory = api.dirname(realPath);
		const entries = [{ path: relative(api.basename(realPath)), real: realPath, stat: executable }];
		const sizes = new Map<string, number>([[realPath, executable.size]]);
		const { dirs, pattern } = getLlamaRuntimeLibraryLocations(this._platform);
		for (const relativeDir of dirs) {
			const libraryDir = api.join(directory, relativeDir);
			let names: string[];
			try {
				names = await this._host.readdir(libraryDir);
			} catch (error) {
				if (relativeDir !== '.' && isMissingFileError(error)) {
					continue;
				}
				return { kind: 'unreadable' };
			}
			for (const name of [...names].sort()) {
				const library = api.join(libraryDir, name);
				if (!pattern.test(name) || this._samePath(library, realPath) || !await this._host.isFile(library)) {
					continue;
				}
				if (entries.length >= LLAMA_RUNTIME_DIGEST_MAX_FILES) {
					return { kind: 'limits' };
				}
				try {
					const real = await this._host.realpath(library);
					const stat = await this._stat(real);
					entries.push({ path: relative(relativeDir === '.' ? name : `${relativeDir}/${name}`), real, stat });
					sizes.set(real, stat.size);
				} catch {
					return { kind: 'unreadable' };
				}
			}
		}
		const size = [...sizes.values()].reduce((sum, bytes) => sum + bytes, 0);
		return size > LLAMA_RUNTIME_DIGEST_MAX_BYTES ? { kind: 'limits' } : { kind: 'files', size, entries };
	}

	/** The candidate's identity when it still resolves to the same executable and its runtime digest carries an approval. */
	private async _verifiedIdentity(candidate: Pick<ILlamaServerCandidate, 'path' | 'realPath'>, signal: AbortSignal | undefined, mode: LlamaIdentityMode): Promise<LlamaVerifiedIdentity | undefined> {
		if (!this.approvals.approvedPaths().some(approved => this._samePath(approved, candidate.realPath))) {
			// Nothing was ever approved at this path: no digest can match, so none is computed.
			return undefined;
		}
		const identity = await this._identify(candidate.path, signal, mode);
		return identity?.kind === 'digest' && this._samePath(identity.realPath, candidate.realPath) && this.approvals.lookup(identity.realPath, identity.sha256) ? identity : undefined;
	}

	/** A candidate that cannot be verified: offered for approval only to explain why (`runtimeUnverifiable`); never executed or approved. */
	private _unverifiableResolution(candidate: ILlamaServerCandidate, error: ILocalModelErrorV1): ILlamaRuntimeResolution {
		return {
			runtime: { source: candidate.source, trust: 'pendingApproval', path: candidate.realPath },
			candidate,
			approved: false,
			error,
		};
	}

	/** The first candidate whose runtime digest has an approval record (display only: hashes, or reuses an unchanged digest; never executes). */
	private async _findApprovedCandidate(candidates: readonly ILlamaServerCandidate[], signal: AbortSignal | undefined): Promise<ILlamaServerCandidate | undefined> {
		for (const candidate of candidates) {
			if (await this._verifiedIdentity(candidate, signal, 'status')) {
				return candidate;
			}
		}
		return undefined;
	}

	private _toResolution(candidate: ILlamaServerCandidate, capability: ILlamaServerCapability): ILlamaRuntimeResolution {
		const trust: LocalModelRuntimeTrust = this.approvals.lookup(candidate.realPath, capability.sha256) ?? 'pendingApproval';
		const backend = [...capability.devices].sort((a, b) => b.totalBytes - a.totalBytes)[0]?.backend;
		return {
			runtime: {
				source: candidate.source,
				version: formatLlamaServerVersion(capability.version),
				...(backend ? { backend } : {}),
				trust,
				// The approval shows (and binds its consent to) exactly this file.
				...(trust === 'pendingApproval' ? { path: candidate.realPath, sha256: capability.sha256, size: capability.size } : {}),
			},
			candidate,
			capability,
			approved: trust === 'userApproved',
		};
	}
	/**
	 * Qualifies a candidate after establishing its authorization on its
	 * identity (canonical path + runtime digest): `approval` requires the
	 * digest to carry an approval; `explicit` (the setting or
	 * `LLAMACPP_SERVER_PATH`) is authorized by where the file is. A
	 * capability cached for the very same digest needs nothing executed, so a
	 * display-only identity suffices; before probing (executing) the install,
	 * the digest is computed afresh and the authorization checked again.
	 * `fresh` forces a fresh digest even for a cache hit.
	 */
	private async _qualify(candidate: ILlamaServerCandidate, authorization: LlamaProbeAuthorization, needsDraft: boolean, topologyKey: string, signal: AbortSignal | undefined, mode: LlamaIdentityMode = 'status'): Promise<{ readonly ok: true; readonly capability: ILlamaServerCapability } | { readonly ok: false; readonly error: ILocalModelErrorV1; readonly changedWhileProbing?: boolean }> {
		// Prepared first, so nothing asynchronous separates a fresh digest from the probe it authorizes.
		await this._ensureProbeDirectory();
		let checked = this._authorize(candidate, authorization, await this._identify(candidate.path, signal, mode));
		if (!checked.ok) {
			return checked;
		}
		let capability = this._cachedCapability(checked.identity, topologyKey);
		if (!capability) {
			if (!checked.identity.fresh) {
				// About to execute: only a digest computed now authorizes it.
				checked = this._authorize(candidate, authorization, await this._identify(candidate.path, signal, 'fresh'));
				if (!checked.ok) {
					return checked;
				}
			}
			const probed = await this._probeCapability(candidate, authorization, checked.identity, topologyKey, signal);
			if (probed.kind === 'changed') {
				return { ok: false, error: { code: RUNTIME_CHANGED, message: localize('localModel.runtimeChangedWhileChecking', "The llama-server at {0} changed while VS Code was checking it, so nothing more was run. Review it again to continue.", candidate.realPath), actions: ['retry'] }, changedWhileProbing: true };
			}
			if (probed.kind === 'failed') {
				return { ok: false, error: createLlamaRuntimeError(probed.failure, { path: candidate.realPath }) };
			}
			capability = probed.capability;
		}
		const qualification = qualifyLlamaServerHelp({ flags: new Set(capability.flags), specTypes: new Set(capability.specTypes) }, needsDraft);
		if (qualification.missingFlags.length) {
			return { ok: false, error: createLlamaRuntimeError({ code: 'runtimeTooOld' }, { path: candidate.realPath, missingFlags: qualification.missingFlags }) };
		}
		if (capability.devices.length === 0) {
			return { ok: false, error: createLlamaRuntimeError({ code: 'gpuRuntimeMissing' }, { path: candidate.realPath }) };
		}
		return { ok: true, capability };
	}

	/** Whether `identity` (of `candidate`) may be probed under `authorization`. */
	private _authorize(candidate: ILlamaServerCandidate, authorization: LlamaProbeAuthorization, identity: LlamaRuntimeIdentity | undefined): { readonly ok: true; readonly identity: LlamaVerifiedIdentity } | { readonly ok: false; readonly error: ILocalModelErrorV1 } {
		if (!identity || !this._samePath(identity.realPath, candidate.realPath)) {
			return { ok: false, error: createLlamaRuntimeError({ code: 'runtimeNotFound' }, { path: candidate.realPath }) };
		}
		if (identity.kind === 'unverifiable') {
			return { ok: false, error: createLlamaRuntimeUnverifiableError(identity.realPath, identity.reason, this._platform) };
		}
		if (authorization === 'approval' && !this.approvals.lookup(identity.realPath, identity.sha256)) {
			return { ok: false, error: { code: RUNTIME_CHANGED, message: localize('localModel.runtimeChangedSinceApproval', "The llama-server at {0} changed since it was approved.", candidate.realPath), actions: [] } };
		}
		return { ok: true, identity };
	}

	/** Capabilities only, of this exact install: the same runtime digest and size, the same GPU topology. */
	private _cachedCapability(identity: LlamaVerifiedIdentity, topologyKey: string): ILlamaServerCapability | undefined {
		const cached = this._readCapabilities()[identity.realPath];
		return cached && cached.sha256 === identity.sha256 && cached.size === identity.size && cached.topologyKey === topologyKey ? cached : undefined;
	}

	/**
	 * Probes `--version`, `--help` and `--list-devices` under one identity:
	 * `start`, authorized (approval or explicit) and computed just before the
	 * first probe. Before each further probe the real path and runtime digest
	 * are recomputed and must be unchanged (for an approval, still approved);
	 * this binds an explicit authorization, which was established for `start`,
	 * to the same content. On any change, all results are discarded and
	 * nothing more is executed (`changed`).
	 */
	private async _probeCapability(candidate: ILlamaServerCandidate, authorization: LlamaProbeAuthorization, start: LlamaVerifiedIdentity, topologyKey: string, signal: AbortSignal | undefined): Promise<{ readonly kind: 'ok'; readonly capability: ILlamaServerCapability } | { readonly kind: 'failed'; readonly failure: ILlamaProbeFailure } | { readonly kind: 'changed' }> {
		const realPath = start.realPath;
		let first = true;
		const probe = async (args: readonly string[], maxOutputBytes: number): Promise<IProcessRunResult | undefined> => {
			if (!first) {
				const current = await this._identify(candidate.path, signal, 'fresh');
				if (current?.kind !== 'digest' || !this._samePath(current.realPath, realPath) || current.sha256 !== start.sha256 || (authorization === 'approval' && !this.approvals.lookup(current.realPath, current.sha256))) {
					this._options.log.warn('[LocalModelRuntime] The llama-server changed between probes; discarding the results');
					return undefined;
				}
			}
			first = false;
			return this._probe(realPath, args, maxOutputBytes, signal);
		};
		const versionResult = await probe(['--version'], LLAMA_SERVER_PROBE_OUTPUT_CAP_BYTES);
		if (!versionResult) {
			return { kind: 'changed' };
		}
		const version = versionResult.exitCode === 0 ? parseLlamaServerVersion(`${versionResult.stdout}\n${versionResult.stderr}`) : undefined;
		if (!version) {
			return { kind: 'failed', failure: classifyLlamaProbeFailure(versionResult, this._platform) };
		}
		const helpResult = await probe(['--help'], LLAMA_SERVER_HELP_OUTPUT_CAP_BYTES);
		if (!helpResult) {
			return { kind: 'changed' };
		}
		if (helpResult.exitCode !== 0 && !helpResult.truncated) {
			return { kind: 'failed', failure: classifyLlamaProbeFailure(helpResult, this._platform) };
		}
		const help = parseLlamaServerHelp(`${helpResult.stdout}\n${helpResult.stderr}`);
		const devicesResult = await probe(['--list-devices'], LLAMA_SERVER_PROBE_OUTPUT_CAP_BYTES);
		if (!devicesResult) {
			return { kind: 'changed' };
		}
		const devices = devicesResult.exitCode === 0 ? parseListDevicesOutput(devicesResult.stdout) : undefined;
		if (!devices) {
			const failure = classifyLlamaProbeFailure(devicesResult, this._platform);
			return { kind: 'failed', failure: failure.code === 'probeFailed' ? { code: 'gpuRuntimeMissing' } : failure };
		}
		const capability: ILlamaServerCapability = {
			realPath,
			mtimeMs: start.mtimeMs,
			size: start.size,
			sha256: start.sha256,
			topologyKey,
			version,
			flags: [...help.flags].filter(flag => RELEVANT_FLAGS.has(flag)).sort(),
			specTypes: [...help.specTypes].sort(),
			devices: devices.map(({ name, description, totalBytes, backend }) => ({ name, description, totalBytes, backend })),
		};
		this._writeCapabilities({ ...this._readCapabilities(), [realPath]: capability });
		return { kind: 'ok', capability };
	}

	private async _ensureProbeDirectory(): Promise<void> {
		await fs.promises.mkdir(this._tempDir, { recursive: true }).catch(() => undefined);
	}

	/**
	 * Sandboxed probe: temp cwd ({@link _ensureProbeDirectory}),
	 * minimal env, `windowsHide`, 10 s timeout, output cap. A probe that
	 * starts a server passes its `apiKey`, which reaches it only as
	 * {@link LLAMA_API_KEY_ENV}. Starts the process synchronously, so a
	 * verification awaited just before it is the last thing that happens
	 * before execution.
	 */
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

	private async _readLiveWindowsPaths(): Promise<string[]> {
		if (this._platform !== 'win32') {
			return [];
		}
		const values: string[] = [];
		for (const source of WINDOWS_LIVE_PATH_SOURCES) {
			for (const value of await queryRegistry(this._runner, this._env, `${source.hive}\\${source.key}`, { value: source.value })) {
				if (value.name.toLowerCase() === source.value.toLowerCase()) {
					values.push(value.data);
				}
			}
		}
		return values;
	}

	/**
	 * Revalidates an approved install right before it is executed for serving
	 * (decision #6): the candidate path must still resolve to the same real
	 * path, and the runtime digest of the executable and its shared libraries,
	 * computed afresh, must carry an approval. Hashes only; never executes
	 * anything.
	 */
	async verifyApproval(candidate: Pick<ILlamaServerCandidate, 'path' | 'realPath'>, signal?: AbortSignal): Promise<boolean> {
		return !!await this._verifiedIdentity(candidate, signal, 'fresh');
	}
}

// #endregion
