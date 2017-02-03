/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");
/**
 * Bundle `entryPoints` given config `config`.
 */
function bundle(entryPoints, config, callback) {
    var entryPointsMap = {};
    entryPoints.forEach(function (module) {
        entryPointsMap[module.name] = module;
    });
    var allMentionedModulesMap = {};
    entryPoints.forEach(function (module) {
        allMentionedModulesMap[module.name] = true;
        (module.include || []).forEach(function (includedModule) {
            allMentionedModulesMap[includedModule] = true;
        });
        (module.exclude || []).forEach(function (excludedModule) {
            allMentionedModulesMap[excludedModule] = true;
        });
    });
    var code = require('fs').readFileSync(path.join(__dirname, '../../src/vs/loader.js'));
    var r = vm.runInThisContext('(function(require, module, exports) { ' + code + '\n});');
    var loaderModule = { exports: {} };
    r.call({}, require, loaderModule, loaderModule.exports);
    var loader = loaderModule.exports;
    config.isBuild = true;
    loader.config(config);
    loader(['require'], function (localRequire) {
        var resolvePath = function (path) {
            var r = localRequire.toUrl(path);
            if (!/\.js/.test(r)) {
                return r + '.js';
            }
            return r;
        };
        for (var moduleId in entryPointsMap) {
            var entryPoint = entryPointsMap[moduleId];
            if (entryPoint.append) {
                entryPoint.append = entryPoint.append.map(resolvePath);
            }
            if (entryPoint.prepend) {
                entryPoint.prepend = entryPoint.prepend.map(resolvePath);
            }
        }
    });
    loader(Object.keys(allMentionedModulesMap), function () {
        var modules = loader.getBuildInfo();
        var partialResult = emitEntryPoints(modules, entryPointsMap);
        var cssInlinedResources = loader('vs/css').getInlinedResources();
        callback(null, {
            files: partialResult.files,
            cssInlinedResources: cssInlinedResources,
            bundleData: partialResult.bundleData
        });
    }, function (err) { return callback(err, null); });
}
exports.bundle = bundle;
function emitEntryPoints(modules, entryPoints) {
    var modulesMap = {};
    modules.forEach(function (m) {
        modulesMap[m.id] = m;
    });
    var modulesGraph = {};
    modules.forEach(function (m) {
        modulesGraph[m.id] = m.dependencies;
    });
    var sortedModules = topologicalSort(modulesGraph);
    var result = [];
    var usedPlugins = {};
    var bundleData = {
        graph: modulesGraph,
        bundles: {}
    };
    Object.keys(entryPoints).forEach(function (moduleToBundle) {
        var info = entryPoints[moduleToBundle];
        var rootNodes = [moduleToBundle].concat(info.include || []);
        var allDependencies = visit(rootNodes, modulesGraph);
        var excludes = ['require', 'exports', 'module'].concat(info.exclude || []);
        excludes.forEach(function (excludeRoot) {
            var allExcludes = visit([excludeRoot], modulesGraph);
            Object.keys(allExcludes).forEach(function (exclude) {
                delete allDependencies[exclude];
            });
        });
        var includedModules = sortedModules.filter(function (module) {
            return allDependencies[module];
        });
        bundleData.bundles[moduleToBundle] = includedModules;
        var res = emitEntryPoint(modulesMap, modulesGraph, moduleToBundle, includedModules, info.prepend, info.append, info.dest);
        result = result.concat(res.files);
        for (var pluginName in res.usedPlugins) {
            usedPlugins[pluginName] = usedPlugins[pluginName] || res.usedPlugins[pluginName];
        }
    });
    Object.keys(usedPlugins).forEach(function (pluginName) {
        var plugin = usedPlugins[pluginName];
        if (typeof plugin.finishBuild === 'function') {
            var write = function (filename, contents) {
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
function extractStrings(destFiles) {
    var parseDefineCall = function (moduleMatch, depsMatch) {
        var module = moduleMatch.replace(/^"|"$/g, '');
        var deps = depsMatch.split(',');
        deps = deps.map(function (dep) {
            dep = dep.trim();
            dep = dep.replace(/^"|"$/g, '');
            dep = dep.replace(/^'|'$/g, '');
            var prefix = null;
            var _path = null;
            var pieces = dep.split('!');
            if (pieces.length > 1) {
                prefix = pieces[0] + '!';
                _path = pieces[1];
            }
            else {
                prefix = '';
                _path = pieces[0];
            }
            if (/^\.\//.test(_path) || /^\.\.\//.test(_path)) {
                var res = path.join(path.dirname(module), _path).replace(/\\/g, '/');
                return prefix + res;
            }
            return prefix + _path;
        });
        return {
            module: module,
            deps: deps
        };
    };
    destFiles.forEach(function (destFile, index) {
        if (!/\.js$/.test(destFile.dest)) {
            return;
        }
        if (/\.nls\.js$/.test(destFile.dest)) {
            return;
        }
        // Do one pass to record the usage counts for each module id
        var useCounts = {};
        destFile.sources.forEach(function (source) {
            var matches = source.contents.match(/define\(("[^"]+"),\s*\[(((, )?("|')[^"']+("|'))+)\]/);
            if (!matches) {
                return;
            }
            var defineCall = parseDefineCall(matches[1], matches[2]);
            useCounts[defineCall.module] = (useCounts[defineCall.module] || 0) + 1;
            defineCall.deps.forEach(function (dep) {
                useCounts[dep] = (useCounts[dep] || 0) + 1;
            });
        });
        var sortedByUseModules = Object.keys(useCounts);
        sortedByUseModules.sort(function (a, b) {
            return useCounts[b] - useCounts[a];
        });
        var replacementMap = {};
        sortedByUseModules.forEach(function (module, index) {
            replacementMap[module] = index;
        });
        destFile.sources.forEach(function (source) {
            source.contents = source.contents.replace(/define\(("[^"]+"),\s*\[(((, )?("|')[^"']+("|'))+)\]/, function (_, moduleMatch, depsMatch) {
                var defineCall = parseDefineCall(moduleMatch, depsMatch);
                return "define(__m[" + replacementMap[defineCall.module] + "/*" + defineCall.module + "*/], __M([" + defineCall.deps.map(function (dep) { return replacementMap[dep] + '/*' + dep + '*/'; }).join(',') + "])";
            });
        });
        destFile.sources.unshift({
            path: null,
            contents: [
                '(function() {',
                "var __m = " + JSON.stringify(sortedByUseModules) + ";",
                "var __M = function(deps) {",
                "  var result = [];",
                "  for (var i = 0, len = deps.length; i < len; i++) {",
                "    result[i] = __m[deps[i]];",
                "  }",
                "  return result;",
                "};"
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
    var BOILERPLATE = [
        { start: /^var __extends/, end: /^};$/ },
        { start: /^var __assign/, end: /^};$/ },
        { start: /^var __decorate/, end: /^};$/ },
        { start: /^var __metadata/, end: /^};$/ },
        { start: /^var __param/, end: /^};$/ },
        { start: /^var __awaiter/, end: /^};$/ },
    ];
    destFiles.forEach(function (destFile) {
        var SEEN_BOILERPLATE = [];
        destFile.sources.forEach(function (source) {
            var lines = source.contents.split(/\r\n|\n|\r/);
            var newLines = [];
            var IS_REMOVING_BOILERPLATE = false, END_BOILERPLATE;
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (IS_REMOVING_BOILERPLATE) {
                    newLines.push('');
                    if (END_BOILERPLATE.test(line)) {
                        IS_REMOVING_BOILERPLATE = false;
                    }
                }
                else {
                    for (var j = 0; j < BOILERPLATE.length; j++) {
                        var boilerplate = BOILERPLATE[j];
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
    var mainResult = {
        sources: [],
        dest: dest
    }, results = [mainResult];
    var usedPlugins = {};
    var getLoaderPlugin = function (pluginName) {
        if (!usedPlugins[pluginName]) {
            usedPlugins[pluginName] = modulesMap[pluginName].exports;
        }
        return usedPlugins[pluginName];
    };
    includedModules.forEach(function (c) {
        var bangIndex = c.indexOf('!');
        if (bangIndex >= 0) {
            var pluginName = c.substr(0, bangIndex);
            var plugin = getLoaderPlugin(pluginName);
            mainResult.sources.push(emitPlugin(entryPoint, plugin, pluginName, c.substr(bangIndex + 1)));
            return;
        }
        var module = modulesMap[c];
        if (module.path === 'empty:') {
            return;
        }
        var contents = readFileAndRemoveBOM(module.path);
        if (module.shim) {
            mainResult.sources.push(emitShimmedModule(c, deps[c], module.shim, module.path, contents));
        }
        else {
            mainResult.sources.push(emitNamedModule(c, deps[c], module.defineLocation, module.path, contents));
        }
    });
    Object.keys(usedPlugins).forEach(function (pluginName) {
        var plugin = usedPlugins[pluginName];
        if (typeof plugin.writeFile === 'function') {
            var req = (function () {
                throw new Error('no-no!');
            });
            req.toUrl = function (something) { return something; };
            var write = function (filename, contents) {
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
    var toIFile = function (path) {
        var contents = readFileAndRemoveBOM(path);
        return {
            path: path,
            contents: contents
        };
    };
    var toPrepend = (prepend || []).map(toIFile);
    var toAppend = (append || []).map(toIFile);
    mainResult.sources = toPrepend.concat(mainResult.sources).concat(toAppend);
    return {
        files: results,
        usedPlugins: usedPlugins
    };
}
function readFileAndRemoveBOM(path) {
    var BOM_CHAR_CODE = 65279;
    var contents = fs.readFileSync(path, 'utf8');
    // Remove BOM
    if (contents.charCodeAt(0) === BOM_CHAR_CODE) {
        contents = contents.substring(1);
    }
    return contents;
}
function emitPlugin(entryPoint, plugin, pluginName, moduleName) {
    var result = '';
    if (typeof plugin.write === 'function') {
        var write = (function (what) {
            result += what;
        });
        write.getEntryPoint = function () {
            return entryPoint;
        };
        write.asModule = function (moduleId, code) {
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
function emitNamedModule(moduleId, myDeps, defineCallPosition, path, contents) {
    // `defineCallPosition` is the position in code: |define()
    var defineCallOffset = positionToOffset(contents, defineCallPosition.line, defineCallPosition.col);
    // `parensOffset` is the position in code: define|()
    var parensOffset = contents.indexOf('(', defineCallOffset);
    var insertStr = '"' + moduleId + '", ';
    return {
        path: path,
        contents: contents.substr(0, parensOffset + 1) + insertStr + contents.substr(parensOffset + 1)
    };
}
function emitShimmedModule(moduleId, myDeps, factory, path, contents) {
    var strDeps = (myDeps.length > 0 ? '"' + myDeps.join('", "') + '"' : '');
    var strDefine = 'define("' + moduleId + '", [' + strDeps + '], ' + factory + ');';
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
    var line = 1, lastNewLineOffset = -1;
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
    var result = {}, queue = rootNodes;
    rootNodes.forEach(function (node) {
        result[node] = true;
    });
    while (queue.length > 0) {
        var el = queue.shift();
        var myEdges = graph[el] || [];
        myEdges.forEach(function (toNode) {
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
    var allNodes = {}, outgoingEdgeCount = {}, inverseEdges = {};
    Object.keys(graph).forEach(function (fromNode) {
        allNodes[fromNode] = true;
        outgoingEdgeCount[fromNode] = graph[fromNode].length;
        graph[fromNode].forEach(function (toNode) {
            allNodes[toNode] = true;
            outgoingEdgeCount[toNode] = outgoingEdgeCount[toNode] || 0;
            inverseEdges[toNode] = inverseEdges[toNode] || [];
            inverseEdges[toNode].push(fromNode);
        });
    });
    // https://en.wikipedia.org/wiki/Topological_sorting
    var S = [], L = [];
    Object.keys(allNodes).forEach(function (node) {
        if (outgoingEdgeCount[node] === 0) {
            delete outgoingEdgeCount[node];
            S.push(node);
        }
    });
    while (S.length > 0) {
        // Ensure the exact same order all the time with the same inputs
        S.sort();
        var n = S.shift();
        L.push(n);
        var myInverseEdges = inverseEdges[n] || [];
        myInverseEdges.forEach(function (m) {
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
