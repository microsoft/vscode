/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';
import * as path from 'path';
import * as fs from 'fs';
import { extractValue, readLines, removeSurroundingQuotes } from './util';
import { LOGGER } from './extension';
import { MINIMUM_R_VERSION } from './constants';
import { arePathsSame } from './path-utils';
import { getDefaultInterpreterPath, isExcludedInstallation } from './interpreter-settings.js';

export interface RMetadataExtra {
	readonly homepath: string;

	readonly binpath: string;

	readonly scriptpath: string;

	readonly current: boolean;

	readonly default: boolean;

	readonly reasonDiscovered: ReasonDiscovered[] | null;
}

export enum ReasonDiscovered {
	affiliated = "affiliated",
	registry = "registry",
	PATH = "PATH",
	HQ = "HQ",
	CONDA = "CONDA",
	adHoc = "adHoc",
	userSetting = "userSetting",
	server = "server"
}

export enum ReasonRejected {
	invalid = "invalid",
	unsupported = "unsupported",
	nonOrthogonal = "nonOrthogonal",
	excluded = "excluded",
}

export function friendlyReason(reason: ReasonDiscovered | ReasonRejected | null): string {
	if (Object.values(ReasonDiscovered).includes(reason as ReasonDiscovered)) {
		switch (reason) {
			case ReasonDiscovered.affiliated:
				return 'Runtime previously affiliated with this workspace';
			case ReasonDiscovered.registry:
				return 'Found in Windows registry';
			case ReasonDiscovered.PATH:
				return 'Found in PATH, via the `which` command';
			case ReasonDiscovered.HQ:
				return 'Found in the primary location for R versions on this operating system';
			case ReasonDiscovered.CONDA:
				return 'Found in a Conda environment';
			case ReasonDiscovered.adHoc:
				return 'Found in a conventional location for symlinked R binaries';
			case ReasonDiscovered.userSetting:
				return 'Found in a location specified via user settings';
			case ReasonDiscovered.server:
				return 'Found in a conventional location for R binaries installed on a server';
		}
	} else if (Object.values(ReasonRejected).includes(reason as ReasonRejected)) {
		switch (reason) {
			case ReasonRejected.invalid:
				return 'Invalid installation';
			case ReasonRejected.unsupported:
				return `Unsupported version, i.e. version is less than ${MINIMUM_R_VERSION}`;
			case ReasonRejected.nonOrthogonal:
				return 'Non-orthogonal installation that is also not the current version';
			case ReasonRejected.excluded:
				return 'Installation path was excluded via user settings';
		}
	}

	return 'Unknown reason';
}

export class RInstallation {
	public readonly usable: boolean = false;

	public readonly supported: boolean = false;

	public readonly reasonDiscovered: ReasonDiscovered[] | null = null;
	public readonly reasonRejected: ReasonRejected | null = null;

	public readonly binpath: string = '';
	public readonly homepath: string = '';
	public readonly semVersion: semver.SemVer = new semver.SemVer('0.0.1');
	public readonly version: string = '';
	public readonly arch: string = '';
	public readonly current: boolean = false;
	public readonly orthogonal: boolean = false;
	public readonly default: boolean = false;

	constructor(
		pth: string,
		current: boolean = false,
		reasonDiscovered: ReasonDiscovered[] | null = null
	) {
		LOGGER.info(`Candidate R binary at ${pth}`);

		this.binpath = pth;
		this.current = current;
		this.reasonDiscovered = reasonDiscovered;

		const defaultInterpreterPath = getDefaultInterpreterPath();
		this.default = defaultInterpreterPath
			? arePathsSame(pth, defaultInterpreterPath)
			: false;

		const rHomePath = getRHomePath(pth);
		if (!rHomePath) {
			this.reasonRejected = ReasonRejected.invalid;
			this.usable = false;
			return;
		}
		this.homepath = rHomePath;

		const re2 = new RegExp('R[.]framework/Resources');
		this.orthogonal = !re2.test(this.homepath);

		const descPath = path.join(this.homepath, 'library', 'utils', 'DESCRIPTION');
		if (!fs.existsSync(descPath)) {
			LOGGER.info(`Can\'t find DESCRIPTION for the utils package at ${descPath}`);
			this.reasonRejected = ReasonRejected.invalid;
			this.usable = false;
			return;
		}
		const descLines = readLines(descPath);
		const targetLine2 = descLines.filter(line => line.match('Built'))[0];
		if (!targetLine2) {
			LOGGER.info(`Can't find 'Built' field for the utils package in its DESCRIPTION: ${descPath}`);
			this.reasonRejected = ReasonRejected.invalid;
			this.usable = false;
			return;
		}
		const builtField = extractValue(targetLine2, 'Built', ':');
		const builtParts = builtField.split(new RegExp(';\\s+'));

		const versionPart = builtParts[0];
		this.semVersion = semver.coerce(versionPart) ?? new semver.SemVer('0.0.1');
		this.version = this.semVersion.format();

		const minimumSupportedVersion = semver.coerce(MINIMUM_R_VERSION)!;
		this.supported = semver.gte(this.semVersion, minimumSupportedVersion);

		if (this.supported) {
			this.usable = this.current || this.orthogonal;
			if (!this.usable) {
				this.reasonRejected = ReasonRejected.nonOrthogonal;
			} else {
				const excluded = isExcludedInstallation(this.binpath);
				if (excluded) {
					LOGGER.info(`R installation excluded via settings: ${this.binpath}`);
					this.reasonRejected = ReasonRejected.excluded;
					this.usable = false;
				}
			}
		} else {
			this.reasonRejected = ReasonRejected.unsupported;
			this.usable = false;
		}

		const platformPart = builtParts[1];
		const architecture = platformPart.match('^(aarch64|x86_64)');

		if (architecture) {
			const arch = architecture[1];

			if (arch === 'aarch64') {
				this.arch = 'arm64';
			} else if (arch === 'x86_64') {
				this.arch = 'x86_64';
			} else {
				console.warn(`Matched an unknown architecture '${arch}' for R '${this.version}'.`);
				this.arch = arch;
			}
		} else {
			this.arch = '';
		}

		LOGGER.info(`R installation discovered: ${JSON.stringify(this, null, 2)}`);
	}

	toJSON() {
		return {
			...this,
			reasonDiscovered: this.reasonDiscovered?.map(friendlyReason) ?? null,
			reasonRejected: this.reasonRejected ? friendlyReason(this.reasonRejected) : null
		};
	}
}

export function getRHomePath(binpath: string): string | undefined {
	switch (process.platform) {
		case 'darwin':
		case 'linux':
			return getRHomePathNotWindows(binpath);
		case 'win32':
			return getRHomePathWindows(binpath);
		default:
			throw new Error('Unsupported platform');
	}
}

function getRHomePathNotWindows(binpath: string): string | undefined {
	const binLines = readLines(binpath);
	const re = new RegExp('Shell wrapper for R executable');
	if (!binLines.some(x => re.test(x))) {
		LOGGER.info(`Binary is not a shell script wrapping the executable: ${binpath}`);
		return undefined;
	}
	const targetLine = binLines.find(line => line.match('R_HOME_DIR'));
	if (!targetLine) {
		LOGGER.info(`Can\'t determine R_HOME_DIR from the binary: ${binpath}`);
		return undefined;
	}
	const R_HOME_DIR = removeSurroundingQuotes(extractValue(targetLine, 'R_HOME_DIR'));
	const homepath = R_HOME_DIR;
	if (homepath === '') {
		LOGGER.info(`Can\'t determine R_HOME_DIR from the binary: ${binpath}`);
		return undefined;
	}
	return homepath;
}

function getRHomePathWindows(binpath: string): string | undefined {
	const binIndex = binpath.lastIndexOf(path.sep + 'bin' + path.sep);
	if (binIndex === -1) {
		LOGGER.info(`Can\'t determine R_HOME_DIR from the path to the R binary: ${binpath}`);
		return undefined;
	} else {
		const pathUpToBin = binpath.substring(0, binIndex);
		return pathUpToBin;
	}
}
