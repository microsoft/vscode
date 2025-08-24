/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as semver from 'semver';
import * as vscode from 'vscode';
import * as which from 'which';
import * as erdos from 'erdos';
import * as crypto from 'crypto';

import { RInstallation, RMetadataExtra, getRHomePath, ReasonDiscovered, friendlyReason } from './r-installation';
import { LOGGER } from './extension';
import { EXTENSION_ROOT_DIR, MINIMUM_R_VERSION } from './constants';
import { getInterpreterOverridePaths, printInterpreterSettingsInfo, userRBinaries, userRHeadquarters } from './interpreter-settings.js';
import { isDirectory, isFile } from './path-utils.js';
import { discoverCondaBinaries } from './provider-conda.js';

export const R_DOCUMENT_SELECTORS = [
	{ language: 'r', scheme: 'untitled' },
	{ language: 'r', scheme: 'inmemory' },
	{ language: 'r', pattern: '**/*.{r,R}' },
	{ language: 'r', pattern: '**/*.{rprofile,Rprofile}' },
];

export interface RBinary {
	path: string;
	reasons: ReasonDiscovered[];
}

interface DiscoveredBinaries {
	binaries: RBinary[];
	currentBinary?: string;
}

export enum RRuntimeSource {
	system = 'System',
	user = 'User',
	homebrew = 'Homebrew',
	conda = 'Conda',
}

export async function* rRuntimeDiscoverer(): AsyncGenerator<erdos.LanguageRuntimeMetadata> {
	const { binaries, currentBinary } = await getBinaries();

	if (binaries.length === 0) {
		LOGGER.warn('Erdos could not find any R installations. Please verify that you have R installed and review any custom settings.');
		printInterpreterSettingsInfo();
		return;
	}

	const rejectedRInstallations: RInstallation[] = [];
	const rInstallations: RInstallation[] = binaries
		.map(rbin => new RInstallation(rbin.path, rbin.path === currentBinary, rbin.reasons))
		.filter(r => {
			if (!r.usable) {
				LOGGER.info(`Filtering out ${r.binpath}, reason: ${friendlyReason(r.reasonRejected)}.`);
				rejectedRInstallations.push(r);
				return false;
			}
			return true;
		});

	if (rejectedRInstallations.length > 0) {
		if (rInstallations.length === 0) {
			LOGGER.warn(`All discovered R installations are unusable by Erdos.`);
			LOGGER.warn('Learn more about R discovery at https://erdos.dev/r-installations');
			const showLog = await erdos.window.showSimpleModalDialogPrompt(
				vscode.l10n.t('No usable R installations'),
				vscode.l10n.t('All discovered R installations are unusable by Erdos. Learn more about R discovery at <br><a href="https://erdos.dev/r-installations">https://erdos.dev/r-installations</a>'),
				vscode.l10n.t('View logs'),
				vscode.l10n.t('Dismiss')
			);
			if (showLog) {
				LOGGER.show();
			}
		} else {
			LOGGER.warn(`Some discovered R installations are unusable by Erdos.`);
			LOGGER.warn('Learn more about R discovery at https://erdos.dev/r-installations');
		}
	}

	rInstallations.sort((a, b) => {
		if (a.current || b.current) {
			return Number(b.current) - Number(a.current);
		}
		return semver.compare(b.semVersion, a.semVersion) || a.arch.localeCompare(b.arch);
	});

	let recommendedForWorkspace = await shouldRecommendForWorkspace();

	for (const rInst of rInstallations) {
		const startupBehavior = recommendedForWorkspace ?
			erdos.LanguageRuntimeStartupBehavior.Immediate :
			erdos.LanguageRuntimeStartupBehavior.Implicit;
		recommendedForWorkspace = false;

		let needsArch = false;
		for (const otherRInst of rInstallations) {
			if (rInst.version === otherRInst.version && rInst.arch !== otherRInst.arch) {
				needsArch = true;
				break;
			}
		}

		const metadata = makeMetadata(rInst, startupBehavior, needsArch);

		yield metadata;
	}
}

async function getBinaries(): Promise<DiscoveredBinaries> {
	const overrideBinaries = discoverOverrideBinaries();
	if (overrideBinaries !== undefined) {
		const uniqueBinaries = deduplicateRBinaries(overrideBinaries);
		return { binaries: uniqueBinaries, currentBinary: undefined };
	}

	const currentBinaries = await currentRBinaryCandidates();
	const systemBinaries = discoverSystemBinaries();
	const condaBinaries = await discoverCondaBinaries();
	const registryBinaries = await discoverRegistryBinaries();
	const moreBinaries = discoverAdHocBinaries([
		'/usr/bin/R',
		'/usr/local/bin/R',
		'/opt/local/bin/R',
		'/opt/homebrew/bin/R'
	]);
	const userBinaries = discoverUserSpecifiedBinaries();
	const serverBinaries = discoverServerBinaries();

	const rBinaries: RBinary[] = [
		...currentBinaries,
		...systemBinaries,
		...condaBinaries,
		...registryBinaries,
		...moreBinaries,
		...userBinaries,
		...serverBinaries
	];

	const uniqueBinaries = deduplicateRBinaries(rBinaries);

	return {
		binaries: uniqueBinaries,
		currentBinary: currentBinaries.length > 0 ? currentBinaries[0].path : undefined
	};
}

function deduplicateRBinaries(binaries: RBinary[]) {
	const binariesMap = binaries.reduce((acc, binary) => {
		if (acc.has(binary.path)) {
			const existingBinary = acc.get(binary.path)!;
			const mergedReasons = Array.from(new Set([...existingBinary.reasons, ...binary.reasons]));
			acc.set(binary.path, { ...existingBinary, reasons: mergedReasons });
		} else {
			acc.set(binary.path, binary);
		}
		return acc;
	}, new Map<string, RBinary>());

	return Array.from(binariesMap.values());
}

export async function makeMetadata(
	rInst: RInstallation,
	startupBehavior: erdos.LanguageRuntimeStartupBehavior = erdos.LanguageRuntimeStartupBehavior.Implicit,
	includeArch: boolean = false
): Promise<erdos.LanguageRuntimeMetadata> {
	const homedir = os.homedir();
	const isUserInstallation = rInst.binpath.startsWith(homedir);

	const runtimePath = os.platform() !== 'win32' && isUserInstallation ?
		path.join('~', rInst.binpath.substring(homedir.length)) :
		rInst.binpath;

	const scriptPath = rInst.binpath.replace(/R(\.exe)?$/, 'Rscript$1');

	const isHomebrewInstallation = rInst.binpath.includes('/homebrew/');

	const isCondaInstallation = rInst.reasonDiscovered && rInst.reasonDiscovered.includes(ReasonDiscovered.CONDA);

	const runtimeSource =
		isCondaInstallation ? RRuntimeSource.conda :
			isHomebrewInstallation ? RRuntimeSource.homebrew :
				isUserInstallation ? RRuntimeSource.user : RRuntimeSource.system;

	const runtimeShortName = includeArch ? `${rInst.version} (${rInst.arch})` : rInst.version;

	const runtimeName = `R ${runtimeShortName}`;

	const packageJson = require('../package.json');

	const rVersion = rInst.version;

	const digest = crypto.createHash('sha256');
	digest.update(rInst.binpath);
	digest.update(rVersion);
	const runtimeId = digest.digest('hex').substring(0, 32);

	const extraRuntimeData: RMetadataExtra = {
		homepath: rInst.homepath,
		binpath: rInst.binpath,
		scriptpath: scriptPath,
		current: rInst.current,
		default: rInst.default,
		reasonDiscovered: rInst.reasonDiscovered,
	};

	const config = vscode.workspace.getConfiguration('kernelSupervisor');
	const sessionLocation =
		config.get<string>('shutdownTimeout', 'immediately') !== 'immediately' ?
			erdos.LanguageRuntimeSessionLocation.Machine : erdos.LanguageRuntimeSessionLocation.Workspace;

	const uiSubscriptions = [erdos.UiRuntimeNotifications.DidChangePlotsRenderSettings];

	const metadata: erdos.LanguageRuntimeMetadata = {
		runtimeId,
		runtimeName,
		runtimeShortName,
		runtimePath,
		runtimeVersion: packageJson.version,
		runtimeSource,
		languageId: 'r',
		languageName: 'R',
		languageVersion: rVersion,
		base64EncodedIconSvg:
			fs.readFileSync(
				path.join(EXTENSION_ROOT_DIR, 'resources', 'branding', 'r-icon.svg')
			).toString('base64'),
		sessionLocation,
		startupBehavior,
		uiSubscriptions,
		extraRuntimeData
	};

	return metadata;
}

let cachedRBinaryCurrent: RBinary | undefined;

export async function currentRBinary(): Promise<RBinary | undefined> {
	if (cachedRBinaryCurrent !== undefined) {
		return cachedRBinaryCurrent;
	}

	const candidates = await currentRBinaryCandidates();
	if (candidates.length === 0) {
		return undefined;
	} else {
		cachedRBinaryCurrent = candidates[0];
		return cachedRBinaryCurrent;
	}
}

async function currentRBinaryCandidates(): Promise<RBinary[]> {
	const candidates: RBinary[] = [];
	let candidate: RBinary | undefined;

	if (os.platform() === 'win32') {
		candidate = await currentRBinaryFromRegistry();
		if (candidate) {
			candidates.push(candidate);
		}
	}

	candidate = await currentRBinaryFromPATH();
	if (candidate) {
		candidates.push(candidate);
	}

	if (os.platform() !== 'win32') {
		candidate = currentRBinaryFromHq(rHeadquarters());
		if (candidate) {
			candidates.push(candidate);
		}
	}

	return candidates;
}

let cachedRBinaryFromRegistry: RBinary | undefined;

async function currentRBinaryFromRegistry(): Promise<RBinary | undefined> {
	if (os.platform() !== 'win32') {
		LOGGER.info('Skipping registry check on non-Windows platform');
		return undefined;
	}

	if (cachedRBinaryFromRegistry !== undefined) {
		return cachedRBinaryFromRegistry;
	}

	const Registry = await import('@vscode/windows-registry');

	const hives: any[] = ['HKEY_CURRENT_USER', 'HKEY_LOCAL_MACHINE'];
	const wows = ['', 'WOW6432Node'];

	let installPath = undefined;

	for (const hive of hives) {
		for (const wow of wows) {
			const R64_KEY: string = `SOFTWARE\\${wow ? wow + '\\' : ''}R-core\\R64`;
			try {
				const key = Registry.GetStringRegKey(hive, R64_KEY, 'InstallPath');
				if (key) {
					installPath = key;
					LOGGER.info(`Registry key ${hive}\\${R64_KEY}\\InstallPath reports the current R installation is at ${key}`);
					break;
				}
			} catch { }
		}
	}

	if (installPath === undefined) {
		LOGGER.info('Cannot determine current version of R from the registry.');
		return undefined;
	}

	const binPath = firstExisting(installPath, binFragments());
	if (!binPath) {
		return undefined;
	}

	LOGGER.info(`Identified the current R binary: ${binPath}`);
	cachedRBinaryFromRegistry = { path: binPath, reasons: [ReasonDiscovered.registry] };
	return cachedRBinaryFromRegistry;
}

let cachedRBinaryFromPATH: RBinary | undefined;

async function currentRBinaryFromPATH(): Promise<RBinary | undefined> {
	if (cachedRBinaryFromPATH !== undefined) {
		return cachedRBinaryFromPATH;
	}

	const whichR = await which('R', { nothrow: true }) as string;
	if (whichR) {
		LOGGER.info(`Possibly found R on PATH: ${whichR}.`);
		if (os.platform() === 'win32') {
			cachedRBinaryFromPATH = await currentRBinaryFromPATHWindows(whichR);
		} else {
			cachedRBinaryFromPATH = await currentRBinaryFromPATHNotWindows(whichR);
		}
	} else {
		cachedRBinaryFromPATH = undefined;
	}

	return cachedRBinaryFromPATH;
}

export async function currentRBinaryFromPATHWindows(whichR: string): Promise<RBinary | undefined> {
	const ext = path.extname(whichR).toLowerCase();
	if (ext !== '.exe') {
		LOGGER.info(`Unsupported extension: ${ext}.`);
		return undefined;
	}

	const whichRHome = getRHomePath(whichR);
	if (!whichRHome) {
		LOGGER.info(`Failed to get R home path from ${whichR}.`);
		return undefined;
	}
	const binpathNormalized = firstExisting(whichRHome, binFragments());
	if (binpathNormalized) {
		LOGGER.info(`Resolved R binary at ${binpathNormalized}.`);
		return { path: binpathNormalized, reasons: [ReasonDiscovered.PATH] };
	} else {
		LOGGER.info(`Can't find R binary within ${whichRHome}.`);
		return undefined;
	}
}

async function currentRBinaryFromPATHNotWindows(whichR: string): Promise<RBinary | undefined> {
	const whichRCanonical = fs.realpathSync(whichR);
	LOGGER.info(`Resolved R binary at ${whichRCanonical}`);
	return { path: whichRCanonical, reasons: [ReasonDiscovered.PATH] };
}

function currentRBinaryFromHq(hqDirs: string[]): RBinary | undefined {
	if (os.platform() === 'win32') {
		return undefined;
	}

	if (hqDirs.length > 1) {
		LOGGER.error('Expected exactly one R HQ directory on this platform.');
	}
	const hqDir = hqDirs[0];

	if (!fs.existsSync(hqDir)) {
		return undefined;
	}

	const currentDirs = fs.readdirSync(hqDir)
		.map(file => path.join(hqDir, file))
		.filter(path => path.toLowerCase().endsWith('current'));

	if (currentDirs.length !== 1) {
		return undefined;
	}
	const currentDir = currentDirs[0];

	const binpath = firstExisting(currentDir, binFragments());
	if (!binpath) {
		return undefined;
	}

	const binary = { path: fs.realpathSync(binpath), reasons: [ReasonDiscovered.HQ] };
	return binary;
}

function discoverHQBinaries(hqDirs: string[]): RBinary[] {
	const existingHqDirs = hqDirs.filter(dir => {
		if (!fs.existsSync(dir)) {
			LOGGER.info(`Ignoring R headquarters directory ${dir} because it does not exist.`);
			return false;
		}
		return true;
	});
	if (existingHqDirs.length === 0) {
		return [];
	}

	const versionDirs = existingHqDirs
		.map(hqDir => fs.readdirSync(hqDir).map(file => path.join(hqDir, file)))
		.map(listing => listing.filter(path => !path.endsWith('bin')))
		.map(listing => listing.filter(path => !path.toLowerCase().endsWith('current')));

	const binaries = versionDirs
		.map(vd => vd.map(x => firstExisting(x, binFragments())))
		.flat()
		.filter(b => fs.existsSync(b))
		.map(b => ({ path: b, reasons: [ReasonDiscovered.HQ] }));
	return binaries;
}

async function discoverRegistryBinaries(): Promise<RBinary[]> {
	if (os.platform() !== 'win32') {
		LOGGER.info('Skipping registry check on non-Windows platform');
		return [];
	}

	const Registry = await import('@vscode/windows-registry');

	const hives: any[] = ['HKEY_CURRENT_USER', 'HKEY_LOCAL_MACHINE'];
	const wows = ['', 'WOW6432Node'];

	const versions = generateVersions();

	const discoveredKeys: string[] = [];

	for (const hive of hives) {
		for (const wow of wows) {
			for (const version of versions) {
				const R64_KEY: string = `SOFTWARE\\${wow ? wow + '\\' : ''}R-core\\R64\\${version}`;
				try {
					const key = Registry.GetStringRegKey(hive, R64_KEY, 'InstallPath');
					if (key) {
						LOGGER.info(`Registry key ${hive}\\${R64_KEY}\\InstallPath reports an R installation at ${key}`);
						discoveredKeys.push(key);
					}
				} catch { }
			}
		}
	}

	const binPaths = discoveredKeys
		.map(installPath => firstExisting(installPath, binFragments()))
		.filter(binPath => binPath !== undefined)
		.map(binPath => ({ path: binPath, reasons: [ReasonDiscovered.registry] }));

	return binPaths;
}

function discoverAdHocBinaries(paths: string[]): RBinary[] {
	return paths
		.filter(b => {
			if (!fs.existsSync(b)) {
				LOGGER.info(`Ignoring ad hoc R binary ${b} because it does not exist.`);
				return false;
			}
			return true;
		})
		.map(b => fs.realpathSync(b))
		.map(b => ({ path: b, reasons: [ReasonDiscovered.adHoc] }));
}

function discoverSystemBinaries(): RBinary[] {
	return discoverHQBinaries(rHeadquarters());
}

function discoverUserSpecifiedBinaries(): RBinary[] {
	const userHqBinaries = discoverHQBinaries(userRHeadquarters());
	const userMoreBinaries = discoverAdHocBinaries(userRBinaries());
	const userBinaries = userHqBinaries.concat(userMoreBinaries);
	return userBinaries.map(b => ({ path: b.path, reasons: [ReasonDiscovered.userSetting] }));
}

function discoverServerBinaries(): RBinary[] {
	if (os.platform() === 'win32') {
		return [];
	}

	const serverBinaries = discoverHQBinaries([
		'/usr/lib/R',
		'/usr/lib64/R',
		'/usr/local/lib/R',
		'/usr/local/lib64/R',
		'/opt/local/lib/R',
		'/opt/local/lib64/R',
		'/opt/local/R'
	]);

	return serverBinaries.map(b => ({ path: b.path, reasons: [ReasonDiscovered.server] }));
}

function discoverOverrideBinaries(): RBinary[] | undefined {
	const overridePaths = getInterpreterOverridePaths();
	if (overridePaths.length === 0) {
		return undefined;
	}

	const overrideDirs = overridePaths.filter((item) => isDirectory(item));
	const overrideFiles = overridePaths.filter((item) => isFile(item));

	const overrideHqBinaries = discoverHQBinaries(overrideDirs);
	const overrideAdHocBinaries = discoverAdHocBinaries(overrideFiles);
	const overrideBinaries = overrideHqBinaries.concat(overrideAdHocBinaries);

	return overrideBinaries.map(b => ({ path: b.path, reasons: [ReasonDiscovered.userSetting] }));
}

function rHeadquarters(): string[] {
	switch (process.platform) {
		case 'darwin':
			return [path.join('/Library', 'Frameworks', 'R.framework', 'Versions')];
		case 'linux':
			return [path.join('/opt', 'R')];
		case 'win32': {
			const paths = [
				path.join(process.env['ProgramW6432'] || 'C:\\Program Files', 'R')
			];
			if (process.env['LOCALAPPDATA']) {
				paths.push(path.join(process.env['LOCALAPPDATA'], 'Programs', 'R'));
			}
			return [...new Set(paths)];
		}
		default:
			throw new Error('Unsupported platform');
	}
}

function firstExisting(base: string, fragments: string[]): string {
	const potentialPaths = fragments.map(f => path.join(base, f));
	const existingPath = potentialPaths.find(p => fs.existsSync(p));
	return existingPath || '';
}

function binFragments(): string[] {
	switch (process.platform) {
		case 'darwin':
			return [path.join('Resources', 'bin', 'R')];
		case 'linux':
			return [path.join('bin', 'R')];
		case 'win32':
			return [
				path.join('bin', 'x64', 'R.exe'),
				path.join('bin', 'R.exe')
			];
		default:
			throw new Error('Unsupported platform');
	}
}

function generateVersions(): string[] {
	const minimumSupportedVersion = semver.coerce(MINIMUM_R_VERSION)!;
	const major = minimumSupportedVersion.major;
	const minor = minimumSupportedVersion.minor;
	const patch = minimumSupportedVersion.patch;

	const versions: string[] = [];
	for (let x = major; x <= major + 1; x++) {
		for (let y = (x === major ? minor : 0); y <= 9; y++) {
			for (let z = (x === major && y === minor ? patch : 0); z <= 9; z++) {
				versions.push(`${x}.${y}.${z}`);
				versions.push(`${x}.${y}.${z} Pre-release`);
			}
		}
	}

	return versions;
}

async function shouldRecommendForWorkspace(): Promise<boolean> {
	const globs = [
		'**/*.R',
		'**/*.Rmd',
		'.Rprofile',
		'renv.lock',
		'.Rbuildignore',
		'.Renviron',
		'*.Rproj'
	];
	const glob = `{${globs.join(',')}}`;
	if (await hasFiles(glob)) {
		return true;
	}

	if (!(await hasFiles('**/*')) && isRStudioUser()) {
		return true;
	}

	return false;
}

async function hasFiles(glob: string): Promise<boolean> {
	return (await vscode.workspace.findFiles(glob, '**/node_modules/**', 1)).length > 0;
}

function isRStudioUser(): boolean {
	try {
		const filenames = fs.readdirSync(rstudioStateFolderPath());
		const today = new Date();
		const thirtyDaysAgo = new Date(new Date().setDate(today.getDate() - 30));
		const isRecentlyModified = filenames.some(file => {
			const stats = fs.statSync(rstudioStateFolderPath(file));
			return stats.mtime > thirtyDaysAgo;
		});
		return isRecentlyModified;
	} catch { }
	return false;
}

function rstudioStateFolderPath(pathToAppend = ''): string {
	let newPath: string;
	switch (process.platform) {
		case 'darwin':
		case 'linux':
			newPath = path.join(process.env.HOME!, '.local/share/rstudio', pathToAppend);
			break;
		case 'win32':
			newPath = path.join(process.env.LOCALAPPDATA!, 'RStudio', pathToAppend);
			break;
		default:
			throw new Error('Unsupported platform');
	}
	return newPath;
}
