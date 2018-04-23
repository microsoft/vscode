/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { readdirSync, statSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface WorkspaceStatItem {
	name: string;
	count: number;
}

export interface WorkspaceStats {
	fileTypes: WorkspaceStatItem[];
	configFiles: WorkspaceStatItem[];
	fileCount: number;
	maxFilesReached: boolean;
}

function asSortedItems(map: Map<string, number>): WorkspaceStatItem[] {
	let a: WorkspaceStatItem[] = [];
	map.forEach((value, index) => a.push({ name: index, count: value }));
	return a.sort((a, b) => b.count - a.count);
}

export function collectLaunchConfigs(folder: string): WorkspaceStatItem[] {
	let launchConfigs = new Map<string, number>();

	let launchConfig = join(folder, '.vscode', 'launch.json');
	if (existsSync(launchConfig)) {
		try {
			const contents = readFileSync(launchConfig).toString();
			const json = JSON.parse(contents);
			if (json['configurations']) {
				for (const each of json['configurations']) {
					const type = each['type'];
					if (type) {
						if (launchConfigs.has(type)) {
							launchConfigs.set(type, launchConfigs.get(type) + 1);
						}
						else {
							launchConfigs.set(type, 1);
						}
					}
				}
			}
		} catch {
		}
	}
	return asSortedItems(launchConfigs);
}

export function collectWorkspaceStats(folder: string, filter: string[]): WorkspaceStats {
	const configFilePatterns = [
		{ 'tag': 'grunt.js', 'pattern': /^gruntfile\.js$/i },
		{ 'tag': 'gulp.js', 'pattern': /^gulpfile\.js$/i },
		{ 'tag': 'tsconfig.json', 'pattern': /^tsconfig\.json$/i },
		{ 'tag': 'package.json', 'pattern': /^package\.json$/i },
		{ 'tag': 'jsconfig.json', 'pattern': /^jsconfig\.json$/i },
		{ 'tag': 'tslint.json', 'pattern': /^tslint\.json$/i },
		{ 'tag': 'eslint.json', 'pattern': /^eslint\.json$/i },
		{ 'tag': 'tasks.json', 'pattern': /^tasks\.json$/i },
		{ 'tag': 'launch.json', 'pattern': /^launch\.json$/i },
		{ 'tag': 'settings.json', 'pattern': /^settings\.json$/i },
		{ 'tag': 'webpack.config.js', 'pattern': /^webpack\.config\.js$/i },
		{ 'tag': 'project.json', 'pattern': /^project\.json$/i },
		{ 'tag': 'makefile', 'pattern': /^makefile$/i },
		{ 'tag': 'sln', 'pattern': /^.+\.sln$/i },
		{ 'tag': 'csproj', 'pattern': /^.+\.csproj$/i },
		{ 'tag': 'cmake', 'pattern': /^.+\.cmake$/i }
	];

	let fileTypes = new Map<string, number>();
	let configFiles = new Map<string, number>();

	const MAX_FILES = 20000;

	let walkSync = (dir: string, acceptFile: (fileName: string) => void, filter: string[], token) => {
		try {
			let files = readdirSync(dir);
			for (const file of files) {
				if (token.maxReached) {
					return;
				}
				try {
					if (statSync(join(dir, file)).isDirectory()) {
						if (filter.indexOf(file) === -1) {
							walkSync(join(dir, file), acceptFile, filter, token);
						}
					}
					else {
						if (token.count >= MAX_FILES) {
							token.maxReached = true;
							return;
						}
						token.count++;
						acceptFile(file);
					}
				} catch {
					// skip over files for which stat fails
				}
			}
		} catch {
			// skip over folders that cannot be read
		}
	};

	let addFileType = (fileType: string) => {
		if (fileTypes.has(fileType)) {
			fileTypes.set(fileType, fileTypes.get(fileType) + 1);
		}
		else {
			fileTypes.set(fileType, 1);
		}
	};

	let addConfigFiles = (fileName: string) => {
		for (const each of configFilePatterns) {
			if (each.pattern.test(fileName)) {
				if (configFiles.has(each.tag)) {
					configFiles.set(each.tag, configFiles.get(each.tag) + 1);
				} else {
					configFiles.set(each.tag, 1);
				}
			}
		}
	};

	let acceptFile = (name: string) => {
		if (name.lastIndexOf('.') >= 0) {
			let suffix: string | undefined = name.split('.').pop();
			if (suffix) {
				addFileType(suffix);
			}
		}
		addConfigFiles(name);
	};

	let token: { count: number, maxReached: boolean } = { count: 0, maxReached: false };
	walkSync(folder, acceptFile, filter, token);

	return {
		configFiles: asSortedItems(configFiles),
		fileTypes: asSortedItems(fileTypes),
		fileCount: token.count,
		maxFilesReached: token.maxReached

	};
}