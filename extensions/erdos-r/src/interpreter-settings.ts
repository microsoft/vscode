/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { LOGGER } from './extension';
import { arePathsSame, isParentPath, untildify } from './path-utils';

export function userRHeadquarters(): string[] {
	const config = vscode.workspace.getConfiguration('erdos.r');
	const customRootFolders = config.get<string[]>('customRootFolders') ?? [];
	if (customRootFolders.length === 0) {
		LOGGER.debug('No custom root folders specified via erdos.r.customRootFolders');
		return [];
	}
	const userHqDirs = customRootFolders
		.map((item) => untildify(item))
		.filter((item) => {
			if (path.isAbsolute(item)) {
				return true;
			}
			LOGGER.info(`R custom root folder path ${item} is not absolute...ignoring`);
			return false;
		});
	const formattedPaths = JSON.stringify(userHqDirs, null, 2);
	LOGGER.info(`Directories from 'erdos.r.customRootFolders' to scan for R installations:\n${formattedPaths}`);
	return userHqDirs;
}

export function userRBinaries(): string[] {
	const config = vscode.workspace.getConfiguration('erdos.r');
	const customBinaries = config.get<string[]>('customBinaries') ?? [];
	if (customBinaries.length === 0) {
		LOGGER.debug('No custom binaries specified via erdos.r.customBinaries');
		return [];
	}
	const userBinaries = customBinaries
		.map((item) => untildify(item))
		.filter((item) => {
			if (path.isAbsolute(item)) {
				return true;
			}
			LOGGER.info(`R custom binary path ${item} is not absolute...ignoring`);
			return false;
		});
	const formattedPaths = JSON.stringify(userBinaries, null, 2);
	LOGGER.info(`R binaries from 'erdos.r.customBinaries' to discover:\n${formattedPaths}`);
	return userBinaries;
}

function getExcludedInstallations(): string[] {
	const config = vscode.workspace.getConfiguration('erdos.r');
	const interpretersExclude = config.get<string[]>('interpreters.exclude') ?? [];
	if (interpretersExclude.length === 0) {
		LOGGER.debug('No installation paths specified to exclude via erdos.r.interpreters.exclude');
		return [];
	}
	const excludedPaths = interpretersExclude
		.map((item) => untildify(item))
		.filter((item) => {
			if (path.isAbsolute(item)) {
				return true;
			}
			LOGGER.info(`R installation path to exclude ${item} is not absolute...ignoring`);
			return false;
		});
	const formattedPaths = JSON.stringify(excludedPaths, null, 2);
	LOGGER.info(`R installation paths from 'erdos.r.interpreters.exclude' to exclude:\n${formattedPaths}`);
	return excludedPaths;
}

export function getInterpreterOverridePaths(): string[] {
	const config = vscode.workspace.getConfiguration('erdos.r');
	const interpretersOverride = config.get<string[]>('interpreters.override') ?? [];
	if (interpretersOverride.length === 0) {
		LOGGER.debug('No installation paths specified to exclusively include via erdos.r.interpreters.override');
		return [];
	}
	const overridePaths = interpretersOverride
		.map((item) => untildify(item))
		.filter((item) => {
			if (path.isAbsolute(item)) {
				return true;
			}
			LOGGER.info(`R installation path to exclusively include ${item} is not absolute...ignoring`);
			return false;
		});
	const formattedPaths = JSON.stringify(overridePaths, null, 2);
	LOGGER.info(`R installation paths from 'erdos.r.interpreters.override' to exclusively include:\n${formattedPaths}`);
	return overridePaths;
}

export function isExcludedInstallation(binpath: string): boolean | undefined {
	const overridePaths = getInterpreterOverridePaths();
	if (overridePaths.length > 0) {
		return !overridePaths.some(
			override => isParentPath(binpath, override) || arePathsSame(binpath, override)
		);
	}

	const excludedInstallations = getExcludedInstallations();
	if (excludedInstallations.length === 0) {
		return undefined;
	}
	return excludedInstallations.some(
		excluded => isParentPath(binpath, excluded) || arePathsSame(binpath, excluded)
	);
}

export function getDefaultInterpreterPath(): string | undefined {
	const config = vscode.workspace.getConfiguration('erdos.r');
	let defaultInterpreterPath = config.get<string>('interpreters.default');
	if (defaultInterpreterPath) {
		defaultInterpreterPath = untildify(defaultInterpreterPath);
		if (path.isAbsolute(defaultInterpreterPath)) {
			LOGGER.info(`Default R interpreter path specified in 'erdos.r.interpreters.default': ${defaultInterpreterPath}`);
			return defaultInterpreterPath;
		}
		LOGGER.info(`Default R interpreter path ${defaultInterpreterPath} is not absolute...ignoring`);
		return undefined;
	}
	return undefined;
}

export function printInterpreterSettingsInfo(): void {
	const interpreterSettingsInfo = {
		'interpreters.default': getDefaultInterpreterPath(),
		'interpreters.override': getInterpreterOverridePaths(),
		'interpreters.exclude': getExcludedInstallations(),
		'customRootFolders': userRHeadquarters(),
		'customBinaries': userRBinaries(),
	};
	LOGGER.info('=====================================================================');
	LOGGER.info('=============== [START] R INTERPRETER SETTINGS INFO =================');
	LOGGER.info('=====================================================================');
	LOGGER.info('R interpreter settings:', JSON.stringify(interpreterSettingsInfo, null, 2));
	LOGGER.info('=====================================================================');
	LOGGER.info('================ [END] R INTERPRETER SETTINGS INFO ==================');
	LOGGER.info('=====================================================================');
}
