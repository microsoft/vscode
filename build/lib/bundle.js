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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVuZGxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYnVuZGxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7O0FBRWhHLHlCQUF5QjtBQUN6Qiw2QkFBNkI7QUFDN0IseUJBQXlCO0FBcUd6Qjs7R0FFRztBQUNILFNBQWdCLE1BQU0sQ0FBQyxXQUEwQixFQUFFLE1BQXFCLEVBQUUsUUFBMEQ7SUFDbkksTUFBTSxjQUFjLEdBQW1CLEVBQUUsQ0FBQztJQUMxQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBbUIsRUFBRSxFQUFFO1FBQzNDLElBQUksY0FBYyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUNoQyxNQUFNLElBQUksS0FBSyxDQUFDLG9EQUFvRCxNQUFNLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQztTQUNwRjtRQUNELGNBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsTUFBTSxDQUFDO0lBQ3RDLENBQUMsQ0FBQyxDQUFDO0lBRUgsTUFBTSxzQkFBc0IsR0FBbUMsRUFBRSxDQUFDO0lBQ2xFLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFtQixFQUFFLEVBQUU7UUFDM0Msc0JBQXNCLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQztRQUMzQyxNQUFNLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxVQUFVLGNBQWM7WUFDL0Msc0JBQXNCLENBQUMsY0FBYyxDQUFDLEdBQUcsSUFBSSxDQUFDO1FBQy9DLENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsVUFBVSxjQUFjO1lBQy9DLHNCQUFzQixDQUFDLGNBQWMsQ0FBQyxHQUFHLElBQUksQ0FBQztRQUMvQyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBR0gsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLFlBQVks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