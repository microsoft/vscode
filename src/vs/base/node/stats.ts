/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readdir, stat, exists, readFile } from 'fs';
import { join } from 'path';
import { parse, ParseError } from 'vs/base/common/json';

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

export function collectLaunchConfigs(folder: string): Promise<WorkspaceStatItem[]> {
	let launchConfigs = new Map<string, number>();

	let launchConfig = join(folder, '.vscode', 'launch.json');
	return new Promise((resolve, reject) => {
		exists(launchConfig, (doesExist) => {
			if (doesExist) {
				readFile(launchConfig, (err, contents) => {
					if (err) {
						return resolve([]);
					}

					const errors: ParseError[] = [];
					const json = parse(contents.toString(), errors);
					if (errors.length) {
						console.log(`Unable to parse ${launchConfig}`);
						return resolve([]);
					}

					if (json['configurations']) {
						for (const each of json['configurations']) {
							const type = each['type'];
							if (type) {
								if (launchConfigs.has(type)) {
									launchConfigs.set(type, launchConfigs.get(type)! + 1);
								} else {
									launchConfigs.set(type, 1);
								}
							}
						}
					}

					return resolve(asSortedItems(launchConfigs));
				});
			} else {
				return resolve([]);
			}
		});
	});
}

export function collectWorkspaceStats(folder: string, filter: string[]): Promise<WorkspaceStats> {
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

	function walk(dir: string, filter: string[], token, done: (allFiles: string[]) => void): void {
		let results: string[] = [];
		readdir(dir, async (err, files) => {
			// Ignore folders that can't be read
			if (err) {
				return done(results);
			}

			let pending = files.length;
			if (pending === 0) {
				return done(results);
			}

			for (const file of files) {
				if (token.maxReached) {
					return done(results);
				}

				stat(join(dir, file), (err, stats) => {
					// Ignore files that can't be read
					if (err) {
						if (--pending === 0) {
							return done(results);
						}
					} else {
						if (stats.isDirectory()) {
							if (filter.indexOf(file) === -1) {
								walk(join(dir, file), filter, token, (res: string[]) => {
									results = results.concat(res);

									if (--pending === 0) {
										return done(results);
									}
								});
							} else {
								if (--pending === 0) {
									done(results);
								}
							}
						} else {
							if (token.count >= MAX_FILES) {
								token.maxReached = true;
							}

							token.count++;
							results.push(file);

							if (--pending === 0) {
								done(results);
							}
						}
					}
				});
			}
		});
	}

	let addFileType = (fileType: string) => {
		if (fileTypes.has(fileType)) {
			fileTypes.set(fileType, fileTypes.get(fileType)! + 1);
		}
		else {
			fileTypes.set(fileType, 1);
		}
	};

	let addConfigFiles = (fileName: string) => {
		for (const each of configFilePatterns) {
			if (each.pattern.test(fileName)) {
				if (configFiles.has(each.tag)) {
					configFiles.set(each.tag, configFiles.get(each.tag)! + 1);
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

	return new Promise((resolve, reject) => {
		walk(folder, filter, token, (files) => {
			files.forEach(acceptFile);

			resolve({
				configFiles: asSortedItems(configFiles),
				fileTypes: asSortedItems(fileTypes),
				fileCount: token.count,
				maxFilesReached: token.maxReached

			});
		});
	});
}