// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as path from 'path';
import { readJSON } from 'fs-extra';
import which from 'which';
import { getUserHomeDir, isWindows } from '../../../common/utils/platform';
import { exec, getPythonSetting, onDidChangePythonSetting, pathExists } from '../externalDependencies';
import { cache } from '../../../common/utils/decorators';
import { traceVerbose, traceWarn } from '../../../logging';
import { OUTPUT_MARKER_SCRIPT } from '../../../common/process/internal/scripts';
import { IDisposableRegistry } from '../../../common/types';
import { getWorkspaceFolderPaths } from '../../../common/vscodeApis/workspaceApis';
import { isTestExecution } from '../../../common/constants';
import { TerminalShellType } from '../../../common/terminal/types';

export const PIXITOOLPATH_SETTING_KEY = 'pixiToolPath';

// This type corresponds to the output of 'pixi info --json', and property
// names must be spelled exactly as they are in order to match the schema.
export type PixiInfo = {
    platform: string;
    virtual_packages: string[]; // eslint-disable-line camelcase
    version: string;
    cache_dir: string; // eslint-disable-line camelcase
    cache_size?: number; // eslint-disable-line camelcase
    auth_dir: string; // eslint-disable-line camelcase

    project_info?: PixiProjectInfo /* eslint-disable-line camelcase */;

    environments_info: /* eslint-disable-line camelcase */ {
        name: string;
        features: string[];
        solve_group: string; // eslint-disable-line camelcase
        environment_size: number; // eslint-disable-line camelcase
        dependencies: string[];
        tasks: string[];
        channels: string[];
        prefix: string;
    }[];
};

export type PixiProjectInfo = {
    manifest_path: string; // eslint-disable-line camelcase
    last_updated: string; // eslint-disable-line camelcase
    pixi_folder_size?: number; // eslint-disable-line camelcase
    version: string;
};

export type PixiEnvMetadata = {
    manifest_path: string; // eslint-disable-line camelcase
    pixi_version: string; // eslint-disable-line camelcase
    environment_name: string; // eslint-disable-line camelcase
};

export async function isPixiEnvironment(interpreterPath: string): Promise<boolean> {
    const prefix = getPrefixFromInterpreterPath(interpreterPath);
    return (
        pathExists(path.join(prefix, 'conda-meta/pixi')) || pathExists(path.join(prefix, 'conda-meta/pixi_env_prefix'))
    );
}

/**
 * Returns the path to the environment directory based on the interpreter path.
 */
export function getPrefixFromInterpreterPath(interpreterPath: string): string {
    const interpreterDir = path.dirname(interpreterPath);
    if (!interpreterDir.endsWith('bin') && !interpreterDir.endsWith('Scripts')) {
        return interpreterDir;
    }
    return path.dirname(interpreterDir);
}

async function findPixiOnPath(): Promise<readonly string[]> {
    try {
        return await which('pixi', { all: true });
    } catch {
        // Ignore errors
    }
    return [];
}

/** Wraps the "pixi" utility, and exposes its functionality.
 */
export class Pixi {
    /**
     * Creates a Pixi service corresponding to the corresponding "pixi" command.
     *
     * @param command - Command used to run pixi. This has the same meaning as the
     * first argument of spawn() - i.e. it can be a full path, or just a binary name.
     */
    constructor(public readonly command: string) {}

    /**
     * Retrieves list of Python environments known to this pixi for the specified directory.
     *
     * Corresponds to "pixi info --json" and extracting the environments. Swallows errors if any.
     */
    public async getEnvList(cwd: string): Promise<string[] | undefined> {
        const pixiInfo = await this.getPixiInfo(cwd);
        // eslint-disable-next-line camelcase
        return pixiInfo?.environments_info.map((env) => env.prefix);
    }

    /**
     * Method that runs `pixi info` and returns the result. The value is cached for "only" 1 second
     * because the output changes if the project manifest is modified.
     */
    @cache(1_000, true, 1_000)
    public async getPixiInfo(cwd: string): Promise<PixiInfo | undefined> {
        try {
            const infoOutput = await exec(this.command, ['info', '--json'], {
                cwd,
                throwOnStdErr: false,
            });

            if (!infoOutput || !infoOutput.stdout) {
                return undefined;
            }

            const pixiInfo: PixiInfo = JSON.parse(infoOutput.stdout);
            return pixiInfo;
        } catch (error) {
            traceWarn(`Failed to get pixi info for ${cwd}`, error);
            return undefined;
        }
    }

    /**
     * Returns the command line arguments to run `python` within a specific pixi environment.
     * @param manifestPath The path to the manifest file used by pixi.
     * @param envName The name of the environment in the pixi project
     * @param isolatedFlag Whether to add `-I` to the python invocation.
     * @returns A list of arguments that can be passed to exec.
     */
    public getRunPythonArgs(manifestPath: string, envName?: string, isolatedFlag = false): string[] {
        let python = [this.command, 'run', '--manifest-path', manifestPath];
        if (isNonDefaultPixiEnvironmentName(envName)) {
            python = python.concat(['--environment', envName]);
        }

        python.push('python');
        if (isolatedFlag) {
            python.push('-I');
        }
        return [...python, OUTPUT_MARKER_SCRIPT];
    }

    /**
     * Starting from Pixi 0.24.0, each environment has a special file that records some information
     * about which manifest created the environment.
     *
     * @param envDir The root directory (or prefix) of a conda environment
     */

    // eslint-disable-next-line class-methods-use-this
    @cache(5_000, true, 10_000)
    async getPixiEnvironmentMetadata(envDir: string): Promise<PixiEnvMetadata | undefined> {
        const pixiPath = path.join(envDir, 'conda-meta/pixi');
        try {
            const result: PixiEnvMetadata | undefined = await readJSON(pixiPath);
            return result;
        } catch (e) {
            traceVerbose(`Failed to get pixi environment metadata for ${envDir}`, e);
        }
        return undefined;
    }
}

async function getPixiTool(): Promise<Pixi | undefined> {
    let pixi = getPythonSetting<string>(PIXITOOLPATH_SETTING_KEY);

    if (!pixi || pixi === 'pixi' || !(await pathExists(pixi))) {
        pixi = undefined;
        const paths = await findPixiOnPath();
        for (const p of paths) {
            if (await pathExists(p)) {
                pixi = p;
                break;
            }
        }
    }

    if (!pixi) {
        // Check the default installation location
        const home = getUserHomeDir();
        if (home) {
            const pixiToolPath = path.join(home, '.pixi', 'bin', isWindows() ? 'pixi.exe' : 'pixi');
            if (await pathExists(pixiToolPath)) {
                pixi = pixiToolPath;
            }
        }
    }

    return pixi ? new Pixi(pixi) : undefined;
}

/**
 * Locating pixi binary can be expensive, since it potentially involves spawning or
 * trying to spawn processes; so we only do it once per session.
 */
let _pixi: Promise<Pixi | undefined> | undefined;

/**
 * Returns a Pixi instance corresponding to the binary which can be used to run commands for the cwd.
 *
 * Pixi commands can be slow and so can be bottleneck to overall discovery time. So trigger command
 * execution as soon as possible. To do that we need to ensure the operations before the command are
 * performed synchronously.
 */
export function getPixi(): Promise<Pixi | undefined> {
    if (_pixi === undefined || isTestExecution()) {
        _pixi = getPixiTool();
    }
    return _pixi;
}

export type PixiEnvironmentInfo = {
    interpreterPath: string;
    pixi: Pixi;
    pixiVersion: string;
    manifestPath: string;
    envName?: string;
};

function isPixiProjectDir(pixiProjectDir: string): boolean {
    const paths = getWorkspaceFolderPaths().map((f) => path.normalize(f));
    const normalized = path.normalize(pixiProjectDir);
    return paths.some((p) => p === normalized);
}

/**
 * Given the location of an interpreter, try to deduce information about the environment in which it
 * resides.
 * @param interpreterPath The full path to the interpreter.
 * @param pixi Optionally a pixi instance. If this is not specified it will be located.
 * @returns Information about the pixi environment.
 */
export async function getPixiEnvironmentFromInterpreter(
    interpreterPath: string,
): Promise<PixiEnvironmentInfo | undefined> {
    if (!interpreterPath) {
        return undefined;
    }

    const prefix = getPrefixFromInterpreterPath(interpreterPath);
    const pixi = await getPixi();
    if (!pixi) {
        traceVerbose(`could not find a pixi interpreter for the interpreter at ${interpreterPath}`);
        return undefined;
    }

    // Check if the environment has pixi metadata that we can source.
    const metadata = await pixi.getPixiEnvironmentMetadata(prefix);
    if (metadata !== undefined) {
        return {
            interpreterPath,
            pixi,
            pixiVersion: metadata.pixi_version,
            manifestPath: metadata.manifest_path,
            envName: metadata.environment_name,
        };
    }

    // Otherwise, we'll have to try to deduce this information.

    // Usually the pixi environments are stored under `<projectDir>/.pixi/envs/<environment>/`. So,
    // we walk backwards to determine the project directory.
    let envName: string | undefined;
    let envsDir: string;
    let dotPixiDir: string;
    let pixiProjectDir: string;
    let pixiInfo: PixiInfo | undefined;

    try {
        envName = path.basename(prefix);
        envsDir = path.dirname(prefix);
        dotPixiDir = path.dirname(envsDir);
        pixiProjectDir = path.dirname(dotPixiDir);
        if (!isPixiProjectDir(pixiProjectDir)) {
            traceVerbose(`could not determine the pixi project directory for the interpreter at ${interpreterPath}`);
            return undefined;
        }

        // Invoke pixi to get information about the pixi project
        pixiInfo = await pixi.getPixiInfo(pixiProjectDir);

        if (!pixiInfo || !pixiInfo.project_info) {
            traceWarn(`failed to determine pixi project information for the interpreter at ${interpreterPath}`);
            return undefined;
        }

        return {
            interpreterPath,
            pixi,
            pixiVersion: pixiInfo.version,
            manifestPath: pixiInfo.project_info.manifest_path,
            envName,
        };
    } catch (error) {
        traceWarn('Error processing paths or getting Pixi Info:', error);
    }

    return undefined;
}

/**
 * Returns true if the given environment name is *not* the default environment.
 */
export function isNonDefaultPixiEnvironmentName(envName?: string): envName is string {
    return envName !== 'default';
}

export function registerPixiFeatures(disposables: IDisposableRegistry): void {
    disposables.push(
        onDidChangePythonSetting(PIXITOOLPATH_SETTING_KEY, () => {
            _pixi = getPixiTool();
        }),
    );
}

/**
 * Returns the `pixi run` command
 */
export async function getRunPixiPythonCommand(pythonPath: string): Promise<string[] | undefined> {
    const pixiEnv = await getPixiEnvironmentFromInterpreter(pythonPath);
    if (!pixiEnv) {
        return undefined;
    }

    const args = [
        pixiEnv.pixi.command.toCommandArgumentForPythonExt(),
        'run',
        '--manifest-path',
        pixiEnv.manifestPath.toCommandArgumentForPythonExt(),
    ];
    if (isNonDefaultPixiEnvironmentName(pixiEnv.envName)) {
        args.push('--environment');
        args.push(pixiEnv.envName.toCommandArgumentForPythonExt());
    }

    args.push('python');
    return args;
}

export async function getPixiActivationCommands(
    pythonPath: string,
    _targetShell?: TerminalShellType,
): Promise<string[] | undefined> {
    const pixiEnv = await getPixiEnvironmentFromInterpreter(pythonPath);
    if (!pixiEnv) {
        return undefined;
    }

    const args = [
        pixiEnv.pixi.command.toCommandArgumentForPythonExt(),
        'shell',
        '--manifest-path',
        pixiEnv.manifestPath.toCommandArgumentForPythonExt(),
    ];
    if (isNonDefaultPixiEnvironmentName(pixiEnv.envName)) {
        args.push('--environment');
        args.push(pixiEnv.envName.toCommandArgumentForPythonExt());
    }

    // const pixiTargetShell = shellTypeToPixiShell(targetShell);
    // if (pixiTargetShell) {
    //     args.push('--shell');
    //     args.push(pixiTargetShell);
    // }

    // const shellHookOutput = await exec(pixiEnv.pixi.command, args, {
    //     throwOnStdErr: false,
    // }).catch(traceError);
    // if (!shellHookOutput) {
    //     return undefined;
    // }

    // return splitLines(shellHookOutput.stdout, {
    //     removeEmptyEntries: true,
    //     trim: true,
    // });
    return [args.join(' ')];
}
