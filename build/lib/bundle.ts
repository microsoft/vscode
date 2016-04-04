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
	[moduleId:string]: IBuildModuleInfo;
}

interface ILoaderPlugin {
	write(pluginName:string, moduleName:string, write:ILoaderPluginWriteFunc): void;
	writeFile(pluginName:string, entryPoint:string, req:ILoaderPluginReqFunc, write:(filename:string, contents:string)=>void, config:any): void;
	finishBuild(write:(filename:string, contents:string)=>void): void;
}

interface ILoaderPluginWriteFunc {
	(something:string): void;
	getEntryPoint(): string;
	asModule(moduleId:string, code:string): void;
}

interface ILoaderPluginReqFunc {
	(something:string): void;
	toUrl(something:string): string;
}

export interface IEntryPoint {
	name: string;
	include: string[];
	exclude: string[];
}

interface IEntryPointMap {
	[moduleId:string]: IEntryPoint;
}

interface IGraph {
	[node:string]: string[];
}

interface INodeSet {
	[node:string]: boolean;
}

export interface IFile {
	path: string;
	contents: string;
}

export interface IConcatFile {
	dest: string;
	sources: IFile[];
}

export interface ILoaderConfig {
	isBuild?: boolean;
}

/**
 * Bundle `entryPoints` given config `config`.
 */
export function bundle(entryPoints:IEntryPoint[], config:ILoaderConfig, callback:(err:any, result:IConcatFile[]) => void): void {
	let entryPointsMap:IEntryPointMap = {};
	entryPoints.forEach((module:IEntryPoint) => {
		entryPointsMap[module.name] = module;
	});


	var code = require('fs').readFileSync(path.join(__dirname, '../../src/vs/loader.js'));
	var r: Function = <any> vm.runInThisContext('(function(require, module, exports) { ' + code + '\n});');
	var loaderModule = { exports: {} };
	r.call({}, require, loaderModule, loaderModule.exports);

	var loader:any = loaderModule.exports;
	config.isBuild = true;
	loader.config(config);

	loader(Object.keys(entryPointsMap), () => {
		let modules = <IBuildModuleInfo[]>loader.getBuildInfo();
		callback(null, emitEntryPoints(modules, entryPointsMap));
	}, (err) => callback(err, null));
}

function emitEntryPoints(modules:IBuildModuleInfo[], entryPoints:IEntryPointMap): IConcatFile[] {
	let modulesMap: IBuildModuleInfoMap = {};
	modules.forEach((m:IBuildModuleInfo) => {
		modulesMap[m.id] = m;
	});

	let modulesGraph:IGraph = {};
	modules.forEach((m:IBuildModuleInfo) => {
		modulesGraph[m.id] = m.dependencies;
	});

	let sortedModules = topologicalSort(modulesGraph);

	let result: IConcatFile[] = [];
	let usedPlugins: IPluginMap = {};

	Object.keys(entryPoints).forEach((moduleToBundle:string) => {
		let info = entryPoints[moduleToBundle];
		let rootNodes = [moduleToBundle].concat(info.include || []);
		let allDependencies = visit(rootNodes, modulesGraph);
		let excludes:string[] = ['require', 'exports', 'module'].concat(info.exclude || []);

		excludes.forEach((excludeRoot:string) => {
			let allExcludes = visit([excludeRoot], modulesGraph);
			Object.keys(allExcludes).forEach((exclude:string) => {
				delete allDependencies[exclude];
			});
		});

		let includedModules = sortedModules.filter((module:string) => {
			return allDependencies[module];
		});

		let res = emitEntryPoint(modulesMap, modulesGraph, moduleToBundle, includedModules);

		result = result.concat(res.files);
		for (let pluginName in res.usedPlugins) {
			usedPlugins[pluginName] = usedPlugins[pluginName] || res.usedPlugins[pluginName];
		}
	});

	Object.keys(usedPlugins).forEach((pluginName:string) => {
		let plugin = usedPlugins[pluginName];
		if (typeof plugin.finishBuild === 'function') {
			let write = (filename:string, contents:string) => {
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

	return result;
}

interface IPluginMap {
	[moduleId:string]:ILoaderPlugin;
}

interface IEmitEntryPointResult {
	files: IConcatFile[];
	usedPlugins: IPluginMap;
}

function emitEntryPoint(modulesMap:IBuildModuleInfoMap, deps:IGraph, entryPoint:string, includedModules:string[]): IEmitEntryPointResult {
	let mainResult: IConcatFile = {
			sources: [],
			dest: entryPoint + '.js'
		},
		results: IConcatFile[] = [mainResult];

	let usedPlugins: IPluginMap = {};
	let getLoaderPlugin = (pluginName:string):ILoaderPlugin => {
		if (!usedPlugins[pluginName]) {
			usedPlugins[pluginName] = modulesMap[pluginName].exports;
		}
		return usedPlugins[pluginName];
	};

	includedModules.forEach((c:string) => {
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

	Object.keys(usedPlugins).forEach((pluginName:string) => {
		let plugin = usedPlugins[pluginName];
		if (typeof plugin.writeFile === 'function') {
			let req:ILoaderPluginReqFunc = <any>(() => {
				throw new Error('no-no!');
			});
			req.toUrl = something => something;

			let write = (filename:string, contents:string) => {
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

	return {
		files: results,
		usedPlugins: usedPlugins
	};
}

function readFileAndRemoveBOM(path:string): string {
	var BOM_CHAR_CODE = 65279;
	var contents = fs.readFileSync(path, 'utf8');
	// Remove BOM
	if (contents.charCodeAt(0) === BOM_CHAR_CODE) {
		contents = contents.substring(1);
	}
	return contents;
}

function emitPlugin(entryPoint:string, plugin:ILoaderPlugin, pluginName:string, moduleName:string): IFile {
	let result = '';
	if (typeof plugin.write === 'function') {
		let write: ILoaderPluginWriteFunc = <any>((what) => {
			result += what;
		});
		write.getEntryPoint = () => {
			return entryPoint;
		};
		write.asModule = (moduleId:string, code:string) => {
			code = code.replace(/^define\(/, 'define("'+moduleId+'",');
			result += code;
		};
		plugin.write(pluginName, moduleName, write);
	}
	return {
		path: null,
		contents: result
	};
}

function emitNamedModule(moduleId:string, myDeps:string[], defineCallPosition:IPosition, path:string, contents:string): IFile {

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

function emitShimmedModule(moduleId:string, myDeps:string[], factory:string, path:string, contents:string): IFile {
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
function positionToOffset(str:string, desiredLine:number, desiredCol:number): number {
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
function visit(rootNodes:string[], graph:IGraph):INodeSet {
	let result:INodeSet = {},
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
function topologicalSort(graph:IGraph): string[] {

	let allNodes:INodeSet = {},
		outgoingEdgeCount:{[node:string]:number;} = {},
		inverseEdges:IGraph = {};

	Object.keys(graph).forEach((fromNode:string) => {
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

	Object.keys(allNodes).forEach((node:string) => {
		if (outgoingEdgeCount[node] === 0) {
			delete outgoingEdgeCount[node];
			S.push(node);
		}
	});

	while (S.length > 0) {
		// Ensure the exact same order all the time with the same inputs
		S.sort();

		let n:string = S.shift();
		L.push(n);

		let myInverseEdges = inverseEdges[n] || [];
		myInverseEdges.forEach((m:string) => {
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
