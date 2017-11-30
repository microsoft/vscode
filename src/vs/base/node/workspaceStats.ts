/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { readdirSync, statSync } from 'fs';

export interface WorkspaceStatItem {
	name: string;
	value: number;
}
export interface WorkspaceStats {
	fileTypes: WorkspaceStatItem[];
	configFiles: WorkspaceStatItem[];
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

	let walkSync = (dir: string, acceptFile: (fileName: string) => void, filter: string[]) => {
		let files = readdirSync(dir);
		for (const file of files) {
			if (statSync(dir + '/' + file).isDirectory()) {
				if (filter.indexOf(file) === -1) {
					walkSync(dir + '/' + file, acceptFile, filter);
				}
			}
			else {
				acceptFile(file);
			}
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

	let asSortedItems = (map: Map<string, number>): WorkspaceStatItem[] => {
		let a: WorkspaceStatItem[] = [];
		map.forEach((value, index) => a.push({ name: index, value: value }));
		return a.sort((a, b) => b.value - a.value);
	};

	walkSync(folder, acceptFile, filter);

	let result = {
		'configFiles': asSortedItems(configFiles),
		'fileTypes': asSortedItems(fileTypes)
	};
	return result;
}