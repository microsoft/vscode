// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Uri } from 'vscode';
import { Architecture } from '../../../common/utils/platform';
import { BasicVersionInfo, VersionInfo } from '../../../common/utils/version';

/**
 * IDs for the various supported Python environments.
 */
export enum PythonEnvKind {
    Unknown = 'unknown',
    // "global"
    System = 'global-system',
    MicrosoftStore = 'global-microsoft-store',
    Pyenv = 'global-pyenv',
    Poetry = 'poetry',
    Hatch = 'hatch',
    Pixi = 'pixi',
    ActiveState = 'activestate',
    Custom = 'global-custom',
    OtherGlobal = 'global-other',
    // "virtual"
    Venv = 'virt-venv',
    VirtualEnv = 'virt-virtualenv',
    VirtualEnvWrapper = 'virt-virtualenvwrapper',
    Pipenv = 'virt-pipenv',
    Conda = 'virt-conda',
    OtherVirtual = 'virt-other',
}

export enum PythonEnvType {
    Conda = 'Conda',
    Virtual = 'Virtual',
}

export interface EnvPathType {
    /**
     * Path to environment folder or path to interpreter that uniquely identifies an environment.
     * Virtual environments lacking an interpreter are identified by environment folder paths,
     * whereas other envs can be identified using interpreter path.
     */
    path: string;
    pathType: 'envFolderPath' | 'interpreterPath';
}

export const virtualEnvKinds = [
    PythonEnvKind.Poetry,
    PythonEnvKind.Hatch,
    PythonEnvKind.Pixi,
    PythonEnvKind.Pipenv,
    PythonEnvKind.Venv,
    PythonEnvKind.VirtualEnvWrapper,
    PythonEnvKind.Conda,
    PythonEnvKind.VirtualEnv,
];

export const globallyInstalledEnvKinds = [
    PythonEnvKind.OtherGlobal,
    PythonEnvKind.Unknown,
    PythonEnvKind.MicrosoftStore,
    PythonEnvKind.System,
    PythonEnvKind.Custom,
];

/**
 * Information about a file.
 */
export type FileInfo = {
    filename: string;
    ctime: number;
    mtime: number;
};

/**
 * Information about a Python binary/executable.
 */
export type PythonExecutableInfo = FileInfo & {
    sysPrefix: string;
};

/**
 * Source types indicating how a particular environment was discovered.
 *
 * Notes: This is used in auto-selection to figure out which python to select.
 * We added this field to support the existing mechanism in the extension to
 * calculate the auto-select python.
 */
export enum PythonEnvSource {
    /**
     * Environment was found via PATH env variable
     */
    PathEnvVar = 'path env var',
    /**
     * Environment was found in windows registry
     */
    WindowsRegistry = 'windows registry',
    // If source turns out to be useful we will expand this enum to contain more details sources.
}

/**
 * The most fundamental information about a Python environment.
 *
 * You should expect these objects to be complete (no empty props).
 * Note that either `name` or `location` must be non-empty, though
 * the other *can* be empty.
 *
 * @prop id - the env's unique ID
 * @prop kind - the env's kind
 * @prop executable - info about the env's Python binary
 * @prop name - the env's distro-specific name, if any
 * @prop location - the env's location (on disk), if relevant
 * @prop source - the locator[s] which found the environment.
 */
type PythonEnvBaseInfo = {
    id?: string;
    kind: PythonEnvKind;
    type?: PythonEnvType;
    executable: PythonExecutableInfo;
    // One of (name, location) must be non-empty.
    name: string;
    location: string;
    // Other possible fields:
    // * managed: boolean (if the env is "managed")
    // * parent: PythonEnvBaseInfo (the env from which this one was created)
    // * binDir: string (where env-installed executables are found)

    source: PythonEnvSource[];
};

/**
 * The possible Python release levels.
 */
export enum PythonReleaseLevel {
    Alpha = 'alpha',
    Beta = 'beta',
    Candidate = 'candidate',
    Final = 'final',
}

/**
 * Release information for a Python version.
 */
export type PythonVersionRelease = {
    level: PythonReleaseLevel;
    serial: number;
};

/**
 * Version information for a Python build/installation.
 *
 * @prop sysVersion - the raw text from `sys.version`
 */
export type PythonVersion = BasicVersionInfo & {
    release?: PythonVersionRelease;
    sysVersion?: string;
};

/**
 * Information for a Python build/installation.
 */
type PythonBuildInfo = {
    version: PythonVersion; // incl. raw, AKA sys.version
    arch: Architecture;
};

/**
 * Meta information about a Python distribution.
 *
 * @prop org - the name of the distro's creator/publisher
 * @prop defaultDisplayName - the text to use when showing the distro to users
 */
type PythonDistroMetaInfo = {
    org: string;
    defaultDisplayName?: string;
};

/**
 * Information about an installed Python distribution.
 *
 * @prop version - the installed *distro* version (not the Python version)
 * @prop binDir - where to look for the distro's executables (i.e. tools)
 */
export type PythonDistroInfo = PythonDistroMetaInfo & {
    version?: VersionInfo;
    binDir?: string;
};

type _PythonEnvInfo = PythonEnvBaseInfo & PythonBuildInfo;

/**
 * All the available information about a Python environment.
 *
 * Note that not all the information will necessarily be filled in.
 * Locators are only required to fill in the "base" info, though
 * they will usually be able to provide the version as well.
 *
 * @prop distro - the installed Python distro that this env is using or belongs to
 * @prop display - the text to use when showing the env to users
 * @prop detailedDisplayName - display name containing all details
 * @prop searchLocation - the project to which this env is related to, if any
 */
export type PythonEnvInfo = _PythonEnvInfo & {
    distro: PythonDistroInfo;
    display?: string;
    detailedDisplayName?: string;
    searchLocation?: Uri;
    /**
     * Command used to run Python in this environment.
     * E.g. `conda run -n envName python` or `python.exe`
     */
    pythonRunCommand?: string[];
    identifiedUsingNativeLocator?: boolean;
};

/**
 * A dummy python version object containing default fields.
 *
 * Note this object is immutable. So if it is assigned to another object, the properties of the other object
 * also cannot be modified by reference. For eg. `otherVersionObject.major = 3` won't work.
 */
export const UNKNOWN_PYTHON_VERSION: PythonVersion = {
    major: -1,
    minor: -1,
    micro: -1,
    release: { level: PythonReleaseLevel.Final, serial: -1 },
    sysVersion: undefined,
};
Object.freeze(UNKNOWN_PYTHON_VERSION);
