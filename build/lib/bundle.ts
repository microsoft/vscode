/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import vm from 'vm';

interface IPosition {
	line: number;
	col: number;
}

interface IBuildModuleInfo {
	id: string;
	path: string;
	defineLocation: IPosition | null;
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

export interface IExtraFile {
	path: string;
	amdModuleId?: string;
}

export interface IEntryPoint {
	name: string;
	include?: string[];
	exclude?: string[];
	/** @deprecated unsupported by ESM */
	prepend?: IExtraFile[];
	dest?: string;
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
	path: string | null;
	contents: string;
}

export interface IConcatFile {
	dest: string;
	sources: IFile[];
}

export interface IBundleData {
	graph: IGraph;
	bundles: { [moduleId: string]: string[] };
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
	paths?: { [path: string]: any };
	/*
	 * Normally, during a build, no module factories are invoked. This can be used
	 * to forcefully execute a module's factory.
	 */
	buildForceInvokeFactory: {
		[moduleId: string]: boolean;
	};
}

/**
 * Bundle `entryPoints` given config `config`.
 */
export function bundle(entryPoints: IEntryPoint[], config: ILoaderConfig, callback: (err: any, result: IBundleResult | null) => void): void {
	const entryPointsMap: IEntryPointMap = {};
	entryPoints.forEach((module: IEntryPoint) => {
		if (entryPointsMap[module.name]) {
			throw new Error(`Cannot have two entry points with the same name '${module.name}'`);
		}
		entryPointsMap[module.name] = module;
	});

	const allMentionedModulesMap: { [modules: string]: boolean } = {};
	entryPoints.forEach((module: IEntryPoint) => {
		allMentionedModulesMap[module.name] = true;
		module.include?.forEach(function (includedModule) {
			allMentionedModulesMap[includedModule] = true;
		});
		module.exclude?.forEach(function (excludedModule) {
			allMentionedModulesMap[excludedModule] = true;
		});
	});


	const code = require('fs').readFileSync(path.join(__dirname, '../../src/vs/loader.js'));
	const r: Function = <any>vm.runInThisContext('(function(require, module, exports) { ' + code + '\n});');
	const loaderModule = { exports: {} };
	r.call({}, require, loaderModule, loaderModule.exports);

	const loader: any = loaderModule.exports;
	config.isBuild = true;
	config.paths = config.paths || {};
	if (!config.paths['vs/css']) {
		config.paths['vs/css'] = 'out-build/vs/css.build';
	}
	config.buildForceInvokeFactory = config.buildForceInvokeFactory || {};
	config.buildForceInvokeFactory['vs/css'] = true;
	loader.config(config);

	loader(['require'], (localRequire: any) => {
		const resolvePath = (entry: IExtraFile) => {
			let r = localRequire.toUrl(entry.path);
			if (!r.endsWith('.js')) {
				r += '.js';
			}
			// avoid packaging the build version of plugins:
			r = r.replace('vs/css.build.js', 'vs/css.js');
			return { path: r, amdModuleId: entry.amdModuleId };
		};
		for (const moduleId in entryPointsMap) {
			const entryPoint = entryPointsMap[moduleId];
			if (entryPoint.prepend) {
				entryPoint.prepend = entryPoint.prepend.map(resolvePath);
			}
		}
	});

	loader(Object.keys(allMentionedModulesMap), () => {
		const modules = <IBuildModuleInfo[]>loader.getBuildInfo();
		const partialResult = emitEntryPoints(modules, entryPointsMap);
		const cssInlinedResources = loader('vs/css').getInlinedResources();
		callback(null, {
			files: partialResult.files,
			cssInlinedResources: cssInlinedResources,
			bundleData: partialResult.bundleData
		});
	}, (err: any) => callback(err, null));
}

function emitEntryPoints(modules: IBuildModuleInfo[], entryPoints: IEntryPointMap): IPartialBundleResult {
	const modulesMap: IBuildModuleInfoMap = {};
	modules.forEach((m: IBuildModuleInfo) => {
		modulesMap[m.id] = m;
	});

	const modulesGraph: IGraph = {};
	modules.forEach((m: IBuildModuleInfo) => {
		modulesGraph[m.id] = m.dependencies;
	});

	const sortedModules = topologicalSort(modulesGraph);

	let result: IConcatFile[] = [];
	const usedPlugins: IPluginMap = {};
	const bundleData: IBundleData = {
		graph: modulesGraph,
		bundles: {}
	};

	Object.keys(entryPoints).forEach((moduleToBundle: string) => {
		const info = entryPoints[moduleToBundle];
		const rootNodes = [moduleToBundle].concat(info.include || []);
		const allDependencies = visit(rootNodes, modulesGraph);
		const excludes: string[] = ['require', 'exports', 'module'].concat(info.exclude || []);

		excludes.forEach((excludeRoot: string) => {
			const allExcludes = visit([excludeRoot], modulesGraph);
			Object.keys(allExcludes).forEach((exclude: string) => {
				delete allDependencies[exclude];
			});
		});

		const includedModules = sortedModules.filter((module: string) => {
			return allDependencies[module];
		});

		bundleData.bundles[moduleToBundle] = includedModules;

		const res = emitEntryPoint(
			modulesMap,
			modulesGraph,
			moduleToBundle,
			includedModules,
			info.prepend || [],
			info.dest
		);

		result = result.concat(res.files);
		for (const pluginName in res.usedPlugins) {
			usedPlugins[pluginName] = usedPlugins[pluginName] || res.usedPlugins[pluginName];
		}
	});

	Object.keys(usedPlugins).forEach((pluginName: string) => {
		const plugin = usedPlugins[pluginName];
		if (typeof plugin.finishBuild === 'function') {
			const write = (filename: string, contents: string) => {
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
		// TODO@TS 2.1.2
		files: extractStrings(removeAllDuplicateTSBoilerplate(result)),
		bundleData: bundleData
	};
}

function extractStrings(destFiles: IConcatFile[]): IConcatFile[] {
	const parseDefineCall = (moduleMatch: string, depsMatch: string) => {
		const module = moduleMatch.replace(/^"|"$/g, '');
		let deps = depsMatch.split(',');
		deps = deps.map((dep) => {
			dep = dep.trim();
			dep = dep.replace(/^"|"$/g, '');
			dep = dep.replace(/^'|'$/g, '');
			let prefix: string | null = null;
			let _path: string | null = null;
			const pieces = dep.split('!');
			if (pieces.length > 1) {
				prefix = pieces[0] + '!';
				_path = pieces[1];
			} else {
				prefix = '';
				_path = pieces[0];
			}

			if (/^\.\//.test(_path) || /^\.\.\//.test(_path)) {
				const res = path.join(path.dirname(module), _path).replace(/\\/g, '/');
				return prefix + res;
			}
			return prefix + _path;
		});
		return {
			module: module,
			deps: deps
		};
	};

	destFiles.forEach((destFile) => {
		if (!/\.js$/.test(destFile.dest)) {
			return;
		}
		if (/\.nls\.js$/.test(destFile.dest)) {
			return;
		}

		// Do one pass to record the usage counts for each module id
		const useCounts: { [moduleId: string]: number } = {};
		destFile.sources.forEach((source) => {
			const matches = source.contents.match(/define\(("[^"]+"),\s*\[(((, )?("|')[^"']+("|'))+)\]/);
			if (!matches) {
				return;
			}

			const defineCall = parseDefineCall(matches[1], matches[2]);
			useCounts[defineCall.module] = (useCounts[defineCall.module] || 0) + 1;
			defineCall.deps.forEach((dep) => {
				useCounts[dep] = (useCounts[dep] || 0) + 1;
			});
		});

		const sortedByUseModules = Object.keys(useCounts);
		sortedByUseModules.sort((a, b) => {
			return useCounts[b] - useCounts[a];
		});

		const replacementMap: { [moduleId: string]: number } = {};
		sortedByUseModules.forEach((module, index) => {
			replacementMap[module] = index;
		});

		destFile.sources.forEach((source) => {
			source.contents = source.contents.replace(/define\(("[^"]+"),\s*\[(((, )?("|')[^"']+("|'))+)\]/, (_, moduleMatch, depsMatch) => {
				const defineCall = parseDefineCall(moduleMatch, depsMatch);
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

function removeAllDuplicateTSBoilerplate(destFiles: IConcatFile[]): IConcatFile[] {
	destFiles.forEach((destFile) => {
		const SEEN_BOILERPLATE: boolean[] = [];
		destFile.sources.forEach((source) => {
			source.contents = removeDuplicateTSBoilerplate(source.contents, SEEN_BOILERPLATE);
		});
	});

	return destFiles;
}

export function removeAllTSBoilerplate(source: string) {
	const seen = new Array<boolean>(BOILERPLATE.length).fill(true, 0, BOILERPLATE.length);
	return removeDuplicateTSBoilerplate(source, seen);
}

// Taken from typescript compiler => emitFiles
const BOILERPLATE = [
	{ start: /^var __extends/, end: /^}\)\(\);$/ },
	{ start: /^var __assign/, end: /^};$/ },
	{ start: /^var __decorate/, end: /^};$/ },
	{ start: /^var __metadata/, end: /^};$/ },
	{ start: /^var __param/, end: /^};$/ },
	{ start: /^var __awaiter/, end: /^};$/ },
	{ start: /^var __generator/, end: /^};$/ },
	{ start: /^var __createBinding/, end: /^}\)\);$/ },
	{ start: /^var __setModuleDefault/, end: /^}\);$/ },
	{ start: /^var __importStar/, end: /^};$/ },
	{ start: /^var __addDisposableResource/, end: /^};$/ },
	{ start: /^var __disposeResources/, end: /^}\);$/ },
];

function removeDuplicateTSBoilerplate(source: string, SEEN_BOILERPLATE: boolean[] = []): string {
	const lines = source.split(/\r\n|\n|\r/);
	const newLines: string[] = [];
	let IS_REMOVING_BOILERPLATE = false, END_BOILERPLATE: RegExp;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (IS_REMOVING_BOILERPLATE) {
			newLines.push('');
			if (END_BOILERPLATE!.test(line)) {
				IS_REMOVING_BOILERPLATE = false;
			}
		} else {
			for (let j = 0; j < BOILERPLATE.length; j++) {
				const boilerplate = BOILERPLATE[j];
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
	return newLines.join('\n');
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
	prepend: IExtraFile[],
	dest: string | undefined
): IEmitEntryPointResult {
	if (!dest) {
		dest = entryPoint + '.js';
	}
	const mainResult: IConcatFile = {
		sources: [],
		dest: dest
	},
		results: IConcatFile[] = [mainResult];

	const usedPlugins: IPluginMap = {};
	const getLoaderPlugin = (pluginName: string): ILoaderPlugin => {
		if (!usedPlugins[pluginName]) {
			usedPlugins[pluginName] = modulesMap[pluginName].exports;
		}
		return usedPlugins[pluginName];
	};

	includedModules.forEach((c: string) => {
		const bangIndex = c.indexOf('!');

		if (bangIndex >= 0) {
			const pluginName = c.substr(0, bangIndex);
			const plugin = getLoaderPlugin(pluginName);
			mainResult.sources.push(emitPlugin(entryPoint, plugin, pluginName, c.substr(bangIndex + 1)));
			return;
		}

		const module = modulesMap[c];

		if (module.path === 'empty:') {
			return;
		}

		const contents = readFileAndRemoveBOM(module.path);

		if (module.shim) {
			mainResult.sources.push(emitShimmedModule(c, deps[c], module.shim, module.path, contents));
		} else if (module.defineLocation) {
			mainResult.sources.push(emitNamedModule(c, module.defineLocation, module.path, contents));
		} else {
			const moduleCopy = {
				id: module.id,
				path: module.path,
				defineLocation: module.defineLocation,
				dependencies: module.dependencies
			};
			throw new Error(`Cannot bundle module '${module.id}' for entry point '${entryPoint}' because it has no shim and it lacks a defineLocation: ${JSON.stringify(moduleCopy)}`);
		}
	});

	Object.keys(usedPlugins).forEach((pluginName: string) => {
		const plugin = usedPlugins[pluginName];
		if (typeof plugin.writeFile === 'function') {
			const req: ILoaderPluginReqFunc = <any>(() => {
				throw new Error('no-no!');
			});
			req.toUrl = something => something;

			const write = (filename: string, contents: string) => {
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

	const toIFile = (entry: IExtraFile): IFile => {
		let contents = readFileAndRemoveBOM(entry.path);
		if (entry.amdModuleId) {
			contents = contents.replace(/^define\(/m, `define("${entry.amdModuleId}",`);
		}
		return {
			path: entry.path,
			contents: contents
		};
	};

	const toPrepend = (prepend || []).map(toIFile);

	mainResult.sources = toPrepend.concat(mainResult.sources);

	return {
		files: results,
		usedPlugins: usedPlugins
	};
}

function readFileAndRemoveBOM(path: string): string {
	const BOM_CHAR_CODE = 65279;
	let contents = fs.readFileSync(path, 'utf8');
	// Remove BOM
	if (contents.charCodeAt(0) === BOM_CHAR_CODE) {
		contents = contents.substring(1);
	}
	return contents;
}

function emitPlugin(entryPoint: string, plugin: ILoaderPlugin, pluginName: string, moduleName: string): IFile {
	let result = '';
	if (typeof plugin.write === 'function') {
		const write: ILoaderPluginWriteFunc = <any>((what: string) => {
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

function emitNamedModule(moduleId: string, defineCallPosition: IPosition, path: string, contents: string): IFile {

	// `defineCallPosition` is the position in code: |define()
	const defineCallOffset = positionToOffset(contents, defineCallPosition.line, defineCallPosition.col);

	// `parensOffset` is the position in code: define|()
	const parensOffset = contents.indexOf('(', defineCallOffset);

	const insertStr = '"' + moduleId + '", ';

	return {
		path: path,
		contents: contents.substr(0, parensOffset + 1) + insertStr + contents.substr(parensOffset + 1)
	};
}

function emitShimmedModule(moduleId: string, myDeps: string[], factory: string, path: string, contents: string): IFile {
	const strDeps = (myDeps.length > 0 ? '"' + myDeps.join('", "') + '"' : '');
	const strDefine = 'define("' + moduleId + '", [' + strDeps + '], ' + factory + ');';
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

	let line = 1;
	let lastNewLineOffset = -1;

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
	const result: INodeSet = {};
	const queue = rootNodes;

	rootNodes.forEach((node) => {
		result[node] = true;
	});

	while (queue.length > 0) {
		const el = queue.shift();
		const myEdges = graph[el!] || [];
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

	const allNodes: INodeSet = {},
		outgoingEdgeCount: { [node: string]: number } = {},
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
	const S: string[] = [],
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

		const n: string = S.shift()!;
		L.push(n);

		const myInverseEdges = inverseEdges[n] || [];
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
