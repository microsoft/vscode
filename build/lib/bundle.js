"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.bundle = void 0;
const fs = require("fs");
const path = require("path");
const vm = require("vm");
/**
 * Bundle `entryPoints` given config `config`.
 */
function bundle(entryPoints, config, callback) {
    const entryPointsMap = {};
    entryPoints.forEach((module) => {
        if (entryPointsMap[module.name]) {
            throw new Error(`Cannot have two entry points with the same name '${module.name}'`);
        }
        entryPointsMap[module.name] = module;
    });
    const allMentionedModulesMap = {};
    entryPoints.forEach((module) => {
        allMentionedModulesMap[module.name] = true;
        module.include?.forEach(function (includedModule) {
            allMentionedModulesMap[includedModule] = true;
        });
        module.exclude?.forEach(function (excludedModule) {
            allMentionedModulesMap[excludedModule] = true;
        });
    });
    const code = require('fs').readFileSync(path.join(__dirname, '../../src/vs/loader.js'));
    const r = vm.runInThisContext('(function(require, module, exports) { ' + code + '\n});');
    const loaderModule = { exports: {} };
    r.call({}, require, loaderModule, loaderModule.exports);
    const loader = loaderModule.exports;
    config.isBuild = true;
    config.paths = config.paths || {};
    if (!config.paths['vs/nls']) {
        config.paths['vs/nls'] = 'out-build/vs/nls.build';
    }
    if (!config.paths['vs/css']) {
        config.paths['vs/css'] = 'out-build/vs/css.build';
    }
    config.buildForceInvokeFactory = config.buildForceInvokeFactory || {};
    config.buildForceInvokeFactory['vs/nls'] = true;
    config.buildForceInvokeFactory['vs/css'] = true;
    loader.config(config);
    loader(['require'], (localRequire) => {
        const resolvePath = (entry) => {
            let r = localRequire.toUrl(entry.path);
            if (!r.endsWith('.js')) {
                r += '.js';
            }
            // avoid packaging the build version of plugins:
            r = r.replace('vs/nls.build.js', 'vs/nls.js');
            r = r.replace('vs/css.build.js', 'vs/css.js');
            return { path: r, amdModuleId: entry.amdModuleId };
        };
        for (const moduleId in entryPointsMap) {
            const entryPoint = entryPointsMap[moduleId];
            if (entryPoint.append) {
                entryPoint.append = entryPoint.append.map(resolvePath);
            }
            if (entryPoint.prepend) {
                entryPoint.prepend = entryPoint.prepend.map(resolvePath);
            }
        }
    });
    loader(Object.keys(allMentionedModulesMap), () => {
        const modules = loader.getBuildInfo();
        const partialResult = emitEntryPoints(modules, entryPointsMap);
        const cssInlinedResources = loader('vs/css').getInlinedResources();
        callback(null, {
            files: partialResult.files,
            cssInlinedResources: cssInlinedResources,
            bundleData: partialResult.bundleData
        });
    }, (err) => callback(err, null));
}
exports.bundle = bundle;
function emitEntryPoints(modules, entryPoints) {
    const modulesMap = {};
    modules.forEach((m) => {
        modulesMap[m.id] = m;
    });
    const modulesGraph = {};
    modules.forEach((m) => {
        modulesGraph[m.id] = m.dependencies;
    });
    const sortedModules = topologicalSort(modulesGraph);
    let result = [];
    const usedPlugins = {};
    const bundleData = {
        graph: modulesGraph,
        bundles: {}
    };
    Object.keys(entryPoints).forEach((moduleToBundle) => {
        const info = entryPoints[moduleToBundle];
        const rootNodes = [moduleToBundle].concat(info.include || []);
        const allDependencies = visit(rootNodes, modulesGraph);
        const excludes = ['require', 'exports', 'module'].concat(info.exclude || []);
        excludes.forEach((excludeRoot) => {
            const allExcludes = visit([excludeRoot], modulesGraph);
            Object.keys(allExcludes).forEach((exclude) => {
                delete allDependencies[exclude];
            });
        });
        const includedModules = sortedModules.filter((module) => {
            return allDependencies[module];
        });
        bundleData.bundles[moduleToBundle] = includedModules;
        const res = emitEntryPoint(modulesMap, modulesGraph, moduleToBundle, includedModules, info.prepend || [], info.append || [], info.dest);
        result = result.concat(res.files);
        for (const pluginName in res.usedPlugins) {
            usedPlugins[pluginName] = usedPlugins[pluginName] || res.usedPlugins[pluginName];
        }
    });
    Object.keys(usedPlugins).forEach((pluginName) => {
        const plugin = usedPlugins[pluginName];
        if (typeof plugin.finishBuild === 'function') {
            const write = (filename, contents) => {
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
        files: extractStrings(removeDuplicateTSBoilerplate(result)),
        bundleData: bundleData
    };
}
function extractStrings(destFiles) {
    const parseDefineCall = (moduleMatch, depsMatch) => {
        const module = moduleMatch.replace(/^"|"$/g, '');
        let deps = depsMatch.split(',');
        deps = deps.map((dep) => {
            dep = dep.trim();
            dep = dep.replace(/^"|"$/g, '');
            dep = dep.replace(/^'|'$/g, '');
            let prefix = null;
            let _path = null;
            const pieces = dep.split('!');
            if (pieces.length > 1) {
                prefix = pieces[0] + '!';
                _path = pieces[1];
            }
            else {
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
        const useCounts = {};
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
        const replacementMap = {};
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
function removeDuplicateTSBoilerplate(destFiles) {
    // Taken from typescript compiler => emitFiles
    const BOILERPLATE = [
        { start: /^var __extends/, end: /^}\)\(\);$/ },
        { start: /^var __assign/, end: /^};$/ },
        { start: /^var __decorate/, end: /^};$/ },
        { start: /^var __metadata/, end: /^};$/ },
        { start: /^var __param/, end: /^};$/ },
        { start: /^var __awaiter/, end: /^};$/ },
        { start: /^var __generator/, end: /^};$/ },
    ];
    destFiles.forEach((destFile) => {
        const SEEN_BOILERPLATE = [];
        destFile.sources.forEach((source) => {
            const lines = source.contents.split(/\r\n|\n|\r/);
            const newLines = [];
            let IS_REMOVING_BOILERPLATE = false, END_BOILERPLATE;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (IS_REMOVING_BOILERPLATE) {
                    newLines.push('');
                    if (END_BOILERPLATE.test(line)) {
                        IS_REMOVING_BOILERPLATE = false;
                    }
                }
                else {
                    for (let j = 0; j < BOILERPLATE.length; j++) {
                        const boilerplate = BOILERPLATE[j];
                        if (boilerplate.start.test(line)) {
                            if (SEEN_BOILERPLATE[j]) {
                                IS_REMOVING_BOILERPLATE = true;
                                END_BOILERPLATE = boilerplate.end;
                            }
                            else {
                                SEEN_BOILERPLATE[j] = true;
                            }
                        }
                    }
                    if (IS_REMOVING_BOILERPLATE) {
                        newLines.push('');
                    }
                    else {
                        newLines.push(line);
                    }
                }
            }
            source.contents = newLines.join('\n');
        });
    });
    return destFiles;
}
function emitEntryPoint(modulesMap, deps, entryPoint, includedModules, prepend, append, dest) {
    if (!dest) {
        dest = entryPoint + '.js';
    }
    const mainResult = {
        sources: [],
        dest: dest
    }, results = [mainResult];
    const usedPlugins = {};
    const getLoaderPlugin = (pluginName) => {
        if (!usedPlugins[pluginName]) {
            usedPlugins[pluginName] = modulesMap[pluginName].exports;
        }
        return usedPlugins[pluginName];
    };
    includedModules.forEach((c) => {
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
        }
        else if (module.defineLocation) {
            mainResult.sources.push(emitNamedModule(c, module.defineLocation, module.path, contents));
        }
        else {
            const moduleCopy = {
                id: module.id,
                path: module.path,
                defineLocation: module.defineLocation,
                dependencies: module.dependencies
            };
            throw new Error(`Cannot bundle module '${module.id}' for entry point '${entryPoint}' because it has no shim and it lacks a defineLocation: ${JSON.stringify(moduleCopy)}`);
        }
    });
    Object.keys(usedPlugins).forEach((pluginName) => {
        const plugin = usedPlugins[pluginName];
        if (typeof plugin.writeFile === 'function') {
            const req = (() => {
                throw new Error('no-no!');
            });
            req.toUrl = something => something;
            const write = (filename, contents) => {
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
    const toIFile = (entry) => {
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
    const toAppend = (append || []).map(toIFile);
    mainResult.sources = toPrepend.concat(mainResult.sources).concat(toAppend);
    return {
        files: results,
        usedPlugins: usedPlugins
    };
}
function readFileAndRemoveBOM(path) {
    const BOM_CHAR_CODE = 65279;
    let contents = fs.readFileSync(path, 'utf8');
    // Remove BOM
    if (contents.charCodeAt(0) === BOM_CHAR_CODE) {
        contents = contents.substring(1);
    }
    return contents;
}
function emitPlugin(entryPoint, plugin, pluginName, moduleName) {
    let result = '';
    if (typeof plugin.write === 'function') {
        const write = ((what) => {
            result += what;
        });
        write.getEntryPoint = () => {
            return entryPoint;
        };
        write.asModule = (moduleId, code) => {
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
function emitNamedModule(moduleId, defineCallPosition, path, contents) {
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
function emitShimmedModule(moduleId, myDeps, factory, path, contents) {
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
function positionToOffset(str, desiredLine, desiredCol) {
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
function visit(rootNodes, graph) {
    const result = {};
    const queue = rootNodes;
    rootNodes.forEach((node) => {
        result[node] = true;
    });
    while (queue.length > 0) {
        const el = queue.shift();
        const myEdges = graph[el] || [];
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
function topologicalSort(graph) {
    const allNodes = {}, outgoingEdgeCount = {}, inverseEdges = {};
    Object.keys(graph).forEach((fromNode) => {
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
    const S = [], L = [];
    Object.keys(allNodes).forEach((node) => {
        if (outgoingEdgeCount[node] === 0) {
            delete outgoingEdgeCount[node];
            S.push(node);
        }
    });
    while (S.length > 0) {
        // Ensure the exact same order all the time with the same inputs
        S.sort();
        const n = S.shift();
        L.push(n);
        const myInverseEdges = inverseEdges[n] || [];
        myInverseEdges.forEach((m) => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVuZGxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYnVuZGxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7O0FBRWhHLHlCQUF5QjtBQUN6Qiw2QkFBNkI7QUFDN0IseUJBQXlCO0FBcUd6Qjs7R0FFRztBQUNILFNBQWdCLE1BQU0sQ0FBQyxXQUEwQixFQUFFLE1BQXFCLEVBQUUsUUFBMEQ7SUFDbkksTUFBTSxjQUFjLEdBQW1CLEVBQUUsQ0FBQztJQUMxQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBbUIsRUFBRSxFQUFFO1FBQzNDLElBQUksY0FBYyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ2pDLE1BQU0sSUFBSSxLQUFLLENBQUMsb0RBQW9ELE1BQU0sQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO1FBQ3JGLENBQUM7UUFDRCxjQUFjLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLE1BQU0sQ0FBQztJQUN0QyxDQUFDLENBQUMsQ0FBQztJQUVILE1BQU0sc0JBQXNCLEdBQW1DLEVBQUUsQ0FBQztJQUNsRSxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBbUIsRUFBRSxFQUFFO1FBQzNDLHNCQUFzQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUM7UUFDM0MsTUFBTSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsVUFBVSxjQUFjO1lBQy9DLHNCQUFzQixDQUFDLGNBQWMsQ0FBQyxHQUFHLElBQUksQ0FBQztRQUMvQyxDQUFDLENBQUMsQ0FBQztRQUNILE1BQU0sQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLFVBQVUsY0FBYztZQUMvQyxzQkFBc0IsQ0FBQyxjQUFjLENBQUMsR0FBRyxJQUFJLENBQUM7UUFDL0MsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUdILE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMs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