/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs = require('fs');
import path = require('path');
import vm = require('vm');

interface IPosition {
	line: number;
	col: number;
}

interface IBuildModuleInfo {
	id: string;
	path: string;
	defineLocation: IPosition;
	dependencies: string[];
	shim: string;
	exports: any;
}

interface IBuildModuleInfoMap {
	[moduleId: string]: IBuildModuleInfo;
}

interface ILoaderPlugin {
	write(pluginName: string, moduleName: string, write: ILoaderPluginWriteFunc): void;
	writeFile(pluginName: string, entryPoint: string, req: ILoaderPluginReqFunc, write: (filename: string, contents: string) => void, config: any): void;
	finishBuild(write: (filename: string, contents: string) => void): void;
}

interface ILoaderPluginWriteFunc {
	(something: string): void;
	getEntryPoint(): string;
	asModule(moduleId: string, code: string): void;
}

interface ILoaderPluginReqFunc {
	(something: string): void;
	toUrl(something: string): string;
}

export interface IEntryPoint {
	name: string;
	include: string[];
	exclude: string[];
	prepend: string[];
	append: string[];
	dest: string;
}

interface IEntryPointMap {
	[moduleId: string]: IEntryPoint;
}

export interface IGraph {
	[node: string]: string[];
}

interface INodeSet {
	[node: string]: boolean;
}

export interface IFile {
	path: string;
	contents: string;
}

export interface IConcatFile {
	dest: string;
	sources: IFile[];
}

export interface IBundleData {
	graph: IGraph;
	bundles: { [moduleId: string]: string[]; };
}

export interface IBundleResult {
	files: IConcatFile[];
	cssInlinedResources: string[];
	bundleData: IBundleData;
}

interface IPartialBundleResult {
	files: IConcatFile[];
	bundleData: IBundleData;
}

export interface ILoaderConfig {
	isBuild?: boolean;
}

/**
 * Bundle `entryPoints` given config `config`.
 */
export function bundle(entryPoints: IEntryPoint[], config: ILoaderConfig, callback: (err: any, result: IBundleResult) => void): void {
	let entryPointsMap: IEntryPointMap = {};
	entryPoints.forEach((module: IEntryPoint) => {
		entryPointsMap[module.name] = module;
	});

	let allMentionedModulesMap: { [modules: string]: boolean; } = {};
	entryPoints.forEach((module: IEntryPoint) => {
		allMentionedModulesMap[module.name] = true;
		(module.include || []).forEach(function (includedModule) {
			allMentionedModulesMap[includedModule] = true;
		});
		(module.exclude || []).forEach(function (excludedModule) {
			allMentionedModulesMap[excludedModule] = true;
		});
	});


	var code = require('fs').readFileSync(path.join(__dirname, '../../src/vs/loader.js'));
	var r: Function = <any>vm.runInThisContext('(function(require, module, exports) { ' + code + '\n});');
	var loaderModule = { exports: {} };
	r.call({}, require, loaderModule, loaderModule.exports);

	var loader: any = loaderModule.exports;
	config.isBuild = true;
	loader.config(config);

	loader(['require'], (localRequire) => {
		let resolvePath = (path: string) => {
			let r = localRequire.toUrl(path);
			if (!/\.js/.test(r)) {
				return r + '.js';
			}
			return r;
		};
		for (let moduleId in entryPointsMap) {
			let entryPoint = entryPointsMap[moduleId];
			if (entryPoint.append) {
				entryPoint.append = entryPoint.append.map(resolvePath);
			}
			if (entryPoint.prepend) {
				entryPoint.prepend = entryPoint.prepend.map(resolvePath);
			}
		}
	});

	loader(Object.keys(allMentionedModulesMap), () => {
		let modules = <IBuildModuleInfo[]>loader.getBuildInfo();
		let partialResult = emitEntryPoints(modules, entryPointsMap);
		let cssInlinedResources = loader('vs/css').getInlinedResources();
		callback(null, {
			files: partialResult.files,
			cssInlinedResources: cssInlinedResources,
			bundleData: partialResult.bundleData
		});
	}, (err) => callback(err, null));
}

function emitEntryPoints(modules: IBuildModuleInfo[], entryPoints: IEntryPointMap): IPartialBundleResult {
	let modulesMap: IBuildModuleInfoMap = {};
	modules.forEach((m: IBuildModuleInfo) => {
		modulesMap[m.id] = m;
	});

	let modulesGraph: IGraph = {};
	modules.forEach((m: IBuildModuleInfo) => {
		modulesGraph[m.id] = m.dependencies;
	});

	let sortedModules = topologicalSort(modulesGraph);

	let result: IConcatFile[] = [];
	let usedPlugins: IPluginMap = {};
	let bundleData: IBundleData = {
		graph: modulesGraph,
		bundles: {}
	};

	Object.keys(entryPoints).forEach((moduleToBundle: string) => {
		let info = entryPoints[moduleToBundle];
		let rootNodes = [moduleToBundle].concat(info.include || []);
		let allDependencies = visit(rootNodes, modulesGraph);
		let excludes: string[] = ['require', 'exports', 'module'].concat(info.exclude || []);

		excludes.forEach((excludeRoot: string) => {
			let allExcludes = visit([excludeRoot], modulesGraph);
			Object.keys(allExcludes).forEach((exclude: string) => {
				delete allDependencies[exclude];
			});
		});

		let includedModules = sortedModules.filter((module: string) => {
			return allDependencies[module];
		});

		bundleData.bundles[moduleToBundle] = includedModules;

		let res = emitEntryPoint(
			modulesMap,
			modulesGraph,
			moduleToBundle,
			includedModules,
			info.prepend,
			info.append,
			info.dest
		);

		result = result.concat(res.files);
		for (let pluginName in res.usedPlugins) {
			usedPlugins[pluginName] = usedPlugins[pluginName] || res.usedPlugins[pluginName];
		}
	});

	Object.keys(usedPlugins).forEach((pluginName: string) => {
		let plugin = usedPlugins[pluginName];
		if (typeof plugin.finishBuild === 'function') {
			let write = (filename: string, contents: string) => {
				result.push({
					dest: filename,
					sources: [{
						path: null,
						contents: contents
					}]
				});
			};
			plugin.finishBuild(write);
		}
	});

	return {
		files: extractStrings(removeDuplicateTSBoilerplate(result)),
		bundleData: bundleData
	};
}

function extractStrings(destFiles: IConcatFile[]): IConcatFile[] {
	let parseDefineCall = (moduleMatch: string, depsMatch: string) => {
		let module = moduleMatch.replace(/^"|"$/g, '');
		let deps = depsMatch.split(',');
		deps = deps.map((dep) => {
			dep = dep.trim();
			dep = dep.replace(/^"|"$/g, '');
			dep = dep.replace(/^'|'$/g, '');
			let prefix: string = null;
			let _path: string = null;
			let pieces = dep.split('!');
			if (pieces.length > 1) {
				prefix = pieces[0] + '!';
				_path = pieces[1];
			} else {
				prefix = '';
				_path = pieces[0];
			}

			if (/^\.\//.test(_path) || /^\.\.\//.test(_path)) {
				let res = path.join(path.dirname(module), _path).replace(/\\/g, '/');
				return prefix + res;
			}
			return prefix + _path;
		});
		return {
			module: module,
			deps: deps
		};
	};

	destFiles.forEach((destFile, index) => {
		if (!/\.js$/.test(destFile.dest)) {
			return;
		}
		if (/\.nls\.js$/.test(destFile.dest)) {
			return;
		}

		// Do one pass to record the usage counts for each module id
		let useCounts: { [moduleId: string]: number; } = {};
		destFile.sources.forEach((source) => {
			let matches = source.contents.match(/define\(("[^"]+"),\s*\[(((, )?("|')[^"']+("|'))+)\]/);
			if (!matches) {
				return;
			}

			let defineCall = parseDefineCall(matches[1], matches[2]);
			useCounts[defineCall.module] = (useCounts[defineCall.module] || 0) + 1;
			defineCall.deps.forEach((dep) => {
				useCounts[dep] = (useCounts[dep] || 0) + 1;
			});
		});

		let sortedByUseModules = Object.keys(useCounts);
		sortedByUseModules.sort((a, b) => {
			return useCounts[b] - useCounts[a];
		});

		let replacementMap: { [moduleId: string]: number; } = {};
		sortedByUseModules.forEach((module, index) => {
			replacementMap[module] = index;
		});

		destFile.sources.forEach((source) => {
			source.contents = source.contents.replace(/define\(("[^"]+"),\s*\[(((, )?("|')[^"']+("|'))+)\]/, (_, moduleMatch, depsMatch) => {
				let defineCall = parseDefineCall(moduleMatch, depsMatch);
				return `define(__m[${replacementMap[defineCall.module]}/*${defineCall.module}*/], __M([${defineCall.deps.map(dep => replacementMap[dep] + '/*' + dep + '*/').join(',')}])`;
			});
		});

		destFile.sources.unshift({
			path: null,
			contents: [
				'(function() {',
				`var __m = ${JSON.stringify(sortedByUseModules)};`,
				`var __M = function(deps) {`,
				`  var result = [];`,
				`  for (var i = 0, len = deps.length; i < len; i++) {`,
				`    result[i] = __m[deps[i]];`,
				`  }`,
				`  return result;`,
				`};`
			].join('\n')
		});

		destFile.sources.push({
			path: null,
			contents: '}).call(this);'
		});
	});
	return destFiles;
}

function removeDuplicateTSBoilerplate(destFiles: IConcatFile[]): IConcatFile[] {
	// Taken from typescript compiler => emitFiles
	let BOILERPLATE = [
		{ start: /^var __extends/, end: /^};$/ },
		{ start: /^var __assign/, end: /^};$/ },
		{ start: /^var __decorate/, end: /^};$/ },
		{ start: /^var __metadata/, end: /^};$/ },
		{ start: /^var __param/, end: /^};$/ },
		{ start: /^var __awaiter/, end: /^};$/ },
	];

	destFiles.forEach((destFile) => {
		let SEEN_BOILERPLATE = [];
		destFile.sources.forEach((source) => {
			let lines = source.contents.split(/\r\n|\n|\r/);
			let newLines: string[] = [];
			let IS_REMOVING_BOILERPLATE = false, END_BOILERPLATE: RegExp;

			for (let i = 0; i < lines.length; i++) {
				let line = lines[i];
				if (IS_REMOVING_BOILERPLATE) {
					newLines.push('');
					if (END_BOILERPLATE.test(line)) {
						IS_REMOVING_BOILERPLATE = false;
					}
				} else {
					for (let j = 0; j < BOILERPLATE.length; j++) {
						let boilerplate = BOILERPLATE[j];
						if (boilerplate.start.test(line)) {
							if (SEEN_BOILERPLATE[j]) {
								IS_REMOVING_BOILERPLATE = true;
								END_BOILERPLATE = boilerplate.end;
							} else {
								SEEN_BOILERPLATE[j] = true;
							}
						}
					}
					if (IS_REMOVING_BOILERPLATE) {
						newLines.push('');
					} else {
						newLines.push(line);
					}
				}
			}
			source.contents = newLines.join('\n');
		});
	});

	return destFiles;
}

interface IPluginMap {
	[moduleId: string]: ILoaderPlugin;
}

interface IEmitEntryPointResult {
	files: IConcatFile[];
	usedPlugins: IPluginMap;
}

function emitEntryPoint(
	modulesMap: IBuildModuleInfoMap,
	deps: IGraph,
	entryPoint: string,
	includedModules: string[],
	prepend: string[],
	append: string[],
	dest: string
): IEmitEntryPointResult {
	if (!dest) {
		dest = entryPoint + '.js';
	}
	let mainResult: IConcatFile = {
		sources: [],
		dest: dest
	},
		results: IConcatFile[] = [mainResult];

	let usedPlugins: IPluginMap = {};
	let getLoaderPlugin = (pluginName: string): ILoaderPlugin => {
		if (!usedPlugins[pluginName]) {
			usedPlugins[pluginName] = modulesMap[pluginName].exports;
		}
		return usedPlugins[pluginName];
	};

	includedModules.forEach((c: string) => {
		let bangIndex = c.indexOf('!');

		if (bangIndex >= 0) {
			let pluginName = c.substr(0, bangIndex);
			let plugin = getLoaderPlugin(pluginName);
			mainResult.sources.push(emitPlugin(entryPoint, plugin, pluginName, c.substr(bangIndex + 1)));
			return;
		}

		let module = modulesMap[c];

		if (module.path === 'empty:') {
			return;
		}

		let contents = readFileAndRemoveBOM(module.path);

		if (module.shim) {
			mainResult.sources.push(emitShimmedModule(c, deps[c], module.shim, module.path, contents));
		} else {
			mainResult.sources.push(emitNamedModule(c, deps[c], module.defineLocation, module.path, contents));
		}
	});

	Object.keys(usedPlugins).forEach((pluginName: string) => {
		let plugin = usedPlugins[pluginName];
		if (typeof plugin.writeFile === 'function') {
			let req: ILoaderPluginReqFunc = <any>(() => {
				throw new Error('no-no!');
			});
			req.toUrl = something => something;

			let write = (filename: string, contents: string) => {
				results.push({
					dest: filename,
					sources: [{
						path: null,
						contents: contents
					}]
				});
			};
			plugin.writeFile(pluginName, entryPoint, req, write, {});
		}
	});

	let toIFile = (path): IFile => {
		let contents = readFileAndRemoveBOM(path);
		return {
			path: path,
			contents: contents
		};
	};

	let toPrepend = (prepend || []).map(toIFile);
	let toAppend = (append || []).map(toIFile);

	mainResult.sources = toPrepend.concat(mainResult.sources).concat(toAppend);

	return {
		files: results,
		usedPlugins: usedPlugins
	};
}

function readFileAndRemoveBOM(path: string): string {
	var BOM_CHAR_CODE = 65279;
	var contents = fs.readFileSync(path, 'utf8');
	// Remove BOM
	if (contents.charCodeAt(0) === BOM_CHAR_CODE) {
		contents = contents.substring(1);
	}
	return contents;
}

function emitPlugin(entryPoint: string, plugin: ILoaderPlugin, pluginName: string, moduleName: string): IFile {
	let result = '';
	if (typeof plugin.write === 'function') {
		let write: ILoaderPluginWriteFunc = <any>((what) => {
			result += what;
		});
		write.getEntryPoint = () => {
			return entryPoint;
		};
		write.asModule = (moduleId: string, code: string) => {
			code = code.replace(/^define\(/, 'define("' + moduleId + '",');
			result += code;
		};
		plugin.write(pluginName, moduleName, write);
	}
	return {
		path: null,
		contents: result
	};
}

function emitNamedModule(moduleId: string, myDeps: string[], defineCallPosition: IPosition, path: string, contents: string): IFile {

	// `defineCallPosition` is the position in code: |define()
	let defineCallOffset = positionToOffset(contents, defineCallPosition.line, defineCallPosition.col);

	// `parensOffset` is the position in code: define|()
	let parensOffset = contents.indexOf('(', defineCallOffset);

	let insertStr = '"' + moduleId + '", ';

	return {
		path: path,
		contents: contents.substr(0, parensOffset + 1) + insertStr + contents.substr(parensOffset + 1)
	};
}

function emitShimmedModule(moduleId: string, myDeps: string[], factory: string, path: string, contents: string): IFile {
	let strDeps = (myDeps.length > 0 ? '"' + myDeps.join('", "') + '"' : '');
	let strDefine = 'define("' + moduleId + '", [' + strDeps + '], ' + factory + ');';
	return {
		path: path,
		contents: contents + '\n;\n' + strDefine
	};
}

/**
 * Convert a position (line:col) to (offset) in string `str`
 */
function positionToOffset(str: string, desiredLine: number, desiredCol: number): number {
	if (desiredLine === 1) {
		return desiredCol - 1;
	}

	let line = 1,
		lastNewLineOffset = -1;

	do {
		if (desiredLine === line) {
			return lastNewLineOffset + 1 + desiredCol - 1;
		}
		lastNewLineOffset = str.indexOf('\n', lastNewLineOffset + 1);
		line++;
	} while (lastNewLineOffset >= 0);

	return -1;
}


/**
 * Return a set of reachable nodes in `graph` starting from `rootNodes`
 */
function visit(rootNodes: string[], graph: IGraph): INodeSet {
	let result: INodeSet = {},
		queue = rootNodes;

	rootNodes.forEach((node) => {
		result[node] = true;
	});

	while (queue.length > 0) {
		let el = queue.shift();
		let myEdges = graph[el] || [];
		myEdges.forEach((toNode) => {
			if (!result[toNode]) {
				result[toNode] = true;
				queue.push(toNode);
			}
		});
	}

	return result;
}

/**
 * Perform a topological sort on `graph`
 */
function topologicalSort(graph: IGraph): string[] {

	let allNodes: INodeSet = {},
		outgoingEdgeCount: { [node: string]: number; } = {},
		inverseEdges: IGraph = {};

	Object.keys(graph).forEach((fromNode: string) => {
		allNodes[fromNode] = true;
		outgoingEdgeCount[fromNode] = graph[fromNode].length;

		graph[fromNode].forEach((toNode) => {
			allNodes[toNode] = true;
			outgoingEdgeCount[toNode] = outgoingEdgeCount[toNode] || 0;

			inverseEdges[toNode] = inverseEdges[toNode] || [];
			inverseEdges[toNode].push(fromNode);
		});
	});

	// https://en.wikipedia.org/wiki/Topological_sorting
	let S: string[] = [],
		L: string[] = [];

	Object.keys(allNodes).forEach((node: string) => {
		if (outgoingEdgeCount[node] === 0) {
			delete outgoingEdgeCount[node];
			S.push(node);
		}
	});

	while (S.length > 0) {
		// Ensure the exact same order all the time with the same inputs
		S.sort();

		let n: string = S.shift();
		L.push(n);

		let myInverseEdges = inverseEdges[n] || [];
		myInverseEdges.forEach((m: string) => {
			outgoingEdgeCount[m]--;
			if (outgoingEdgeCount[m] === 0) {
				delete outgoingEdgeCount[m];
				S.push(m);
			}
		});
	}

	if (Object.keys(outgoingEdgeCount).length > 0) {
		throw new Error('Cannot do topological sort on cyclic graph, remaining nodes: ' + Object.keys(outgoingEdgeCount));
	}

	return L;
}
