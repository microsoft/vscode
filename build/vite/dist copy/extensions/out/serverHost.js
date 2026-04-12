"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSys = createSys;
const sync_api_client_1 = require("@vscode/sync-api-client");
const browser_1 = require("@vscode/sync-api-common/browser");
const path_1 = require("path");
const pathMapper_1 = require("./pathMapper");
const args_1 = require("./util/args");
function createServerHost(ts, logger, apiClient, args, watchManager, pathMapper, enabledExperimentalTypeAcquisition, exit) {
    const currentDirectory = '/';
    const fs = apiClient?.vscode.workspace.fileSystem;
    // Internals
    const combinePaths = ts.combinePaths;
    const byteOrderMarkIndicator = '\uFEFF';
    const matchFiles = ts.matchFiles;
    const generateDjb2Hash = ts.generateDjb2Hash;
    // Legacy web
    const memoize = ts.memoize;
    const ensureTrailingDirectorySeparator = ts.ensureTrailingDirectorySeparator;
    const getDirectoryPath = ts.getDirectoryPath;
    const directorySeparator = ts.directorySeparator;
    const executingFilePath = (0, args_1.findArgument)(args, '--executingFilePath') || location + '';
    const getExecutingDirectoryPath = memoize(() => memoize(() => ensureTrailingDirectorySeparator(getDirectoryPath(executingFilePath))));
    const getWebPath = (path) => path.startsWith(directorySeparator) ? path.replace(directorySeparator, getExecutingDirectoryPath()) : undefined;
    const textDecoder = new TextDecoder();
    const textEncoder = new TextEncoder();
    return {
        watchFile: watchManager.watchFile.bind(watchManager),
        watchDirectory: watchManager.watchDirectory.bind(watchManager),
        setTimeout(callback, ms, ...args) {
            return setTimeout(callback, ms, ...args);
        },
        clearTimeout(timeoutId) {
            clearTimeout(timeoutId);
        },
        setImmediate(callback, ...args) {
            return this.setTimeout(callback, 0, ...args);
        },
        clearImmediate(timeoutId) {
            this.clearTimeout(timeoutId);
        },
        importPlugin: async (root, moduleName) => {
            const packageRoot = combinePaths(root, moduleName);
            let packageJson;
            try {
                const packageJsonResponse = await fetch(combinePaths(packageRoot, 'package.json'));
                packageJson = await packageJsonResponse.json();
            }
            catch (e) {
                return { module: undefined, error: new Error(`Could not load plugin. Could not load 'package.json'.`) };
            }
            const browser = packageJson.browser;
            if (!browser) {
                return { module: undefined, error: new Error(`Could not load plugin. No 'browser' field found in package.json.`) };
            }
            const scriptPath = combinePaths(packageRoot, browser);
            try {
                // This file isn't bundled so we really do want a dynamic import here
                // eslint-disable-next-line no-restricted-syntax
                const { default: module } = await Promise.resolve(`${scriptPath}`).then(s => __importStar(require(s)));
                return { module, error: undefined };
            }
            catch (e) {
                return { module: undefined, error: e };
            }
        },
        args: Array.from(args),
        newLine: '\n',
        useCaseSensitiveFileNames: true,
        write: s => {
            apiClient?.vscode.terminal.write(s);
        },
        writeOutputIsTTY() {
            return true;
        },
        readFile(path) {
            logger.logVerbose('fs.readFile', { path });
            if (!fs) {
                const webPath = getWebPath(path);
                if (webPath) {
                    const request = new XMLHttpRequest();
                    request.open('GET', webPath, /* asynchronous */ false);
                    request.send();
                    return request.status === 200 ? request.responseText : undefined;
                }
                else {
                    return undefined;
                }
            }
            let uri;
            try {
                uri = pathMapper.toResource(path);
            }
            catch (e) {
                return undefined;
            }
            let contents;
            try {
                // We need to slice the bytes since we can't pass a shared array to text decoder
                contents = fs.readFile(uri);
            }
            catch (error) {
                if (!enabledExperimentalTypeAcquisition) {
                    return undefined;
                }
                try {
                    contents = fs.readFile((0, pathMapper_1.mapUri)(uri, 'vscode-node-modules'));
                }
                catch (e) {
                    return undefined;
                }
            }
            return textDecoder.decode(contents.slice());
        },
        getFileSize(path) {
            logger.logVerbose('fs.getFileSize', { path });
            if (!fs) {
                throw new Error('not supported');
            }
            const uri = pathMapper.toResource(path);
            let ret = 0;
            try {
                ret = fs.stat(uri).size;
            }
            catch (_error) {
                if (enabledExperimentalTypeAcquisition) {
                    try {
                        ret = fs.stat((0, pathMapper_1.mapUri)(uri, 'vscode-node-modules')).size;
                    }
                    catch (_error) {
                    }
                }
            }
            return ret;
        },
        writeFile(path, data, writeByteOrderMark) {
            logger.logVerbose('fs.writeFile', { path });
            if (!fs) {
                throw new Error('not supported');
            }
            if (writeByteOrderMark) {
                data = byteOrderMarkIndicator + data;
            }
            let uri;
            try {
                uri = pathMapper.toResource(path);
            }
            catch (e) {
                return;
            }
            const encoded = textEncoder.encode(data);
            try {
                fs.writeFile(uri, encoded);
                const name = (0, path_1.basename)(uri.path);
                if (uri.scheme !== 'vscode-global-typings' && (name === 'package.json' || name === 'package-lock.json' || name === 'package-lock.kdl')) {
                    fs.writeFile((0, pathMapper_1.mapUri)(uri, 'vscode-node-modules'), encoded);
                }
            }
            catch (error) {
                console.error('fs.writeFile', { path, error });
            }
        },
        resolvePath(path) {
            return path;
        },
        fileExists(path) {
            logger.logVerbose('fs.fileExists', { path });
            if (!fs) {
                const webPath = getWebPath(path);
                if (!webPath) {
                    return false;
                }
                const request = new XMLHttpRequest();
                request.open('HEAD', webPath, /* asynchronous */ false);
                request.send();
                return request.status === 200;
            }
            let uri;
            try {
                uri = pathMapper.toResource(path);
            }
            catch (e) {
                return false;
            }
            let ret = false;
            try {
                ret = fs.stat(uri).type === sync_api_client_1.FileType.File;
            }
            catch (_error) {
                if (enabledExperimentalTypeAcquisition) {
                    try {
                        ret = fs.stat((0, pathMapper_1.mapUri)(uri, 'vscode-node-modules')).type === sync_api_client_1.FileType.File;
                    }
                    catch (_error) {
                    }
                }
            }
            return ret;
        },
        directoryExists(path) {
            logger.logVerbose('fs.directoryExists', { path });
            if (!fs) {
                return false;
            }
            let uri;
            try {
                uri = pathMapper.toResource(path);
            }
            catch (_error) {
                return false;
            }
            let stat = undefined;
            try {
                stat = fs.stat(uri);
            }
            catch (_error) {
                if (enabledExperimentalTypeAcquisition) {
                    try {
                        stat = fs.stat((0, pathMapper_1.mapUri)(uri, 'vscode-node-modules'));
                    }
                    catch (_error) {
                    }
                }
            }
            if (stat) {
                if (path.startsWith('/https') && !path.endsWith('.d.ts')) {
                    // TODO: Hack, https 'file system' can't actually tell what is a file vs directory
                    return stat.type === sync_api_client_1.FileType.File || stat.type === sync_api_client_1.FileType.Directory;
                }
                return stat.type === sync_api_client_1.FileType.Directory;
            }
            else {
                return false;
            }
        },
        createDirectory(path) {
            logger.logVerbose('fs.createDirectory', { path });
            if (!fs) {
                throw new Error('not supported');
            }
            try {
                fs.createDirectory(pathMapper.toResource(path));
            }
            catch (error) {
                logger.logNormal('Error fs.createDirectory', { path, error: error + '' });
            }
        },
        getExecutingFilePath() {
            return currentDirectory;
        },
        getCurrentDirectory() {
            return currentDirectory;
        },
        getDirectories(path) {
            logger.logVerbose('fs.getDirectories', { path });
            return getAccessibleFileSystemEntries(path).directories.slice();
        },
        readDirectory(path, extensions, excludes, includes, depth) {
            logger.logVerbose('fs.readDirectory', { path });
            return matchFiles(path, extensions, excludes, includes, /*useCaseSensitiveFileNames*/ true, currentDirectory, depth, getAccessibleFileSystemEntries, realpath);
        },
        getModifiedTime(path) {
            logger.logVerbose('fs.getModifiedTime', { path });
            if (!fs) {
                throw new Error('not supported');
            }
            const uri = pathMapper.toResource(path);
            let s = undefined;
            try {
                s = fs.stat(uri);
            }
            catch (_e) {
                if (enabledExperimentalTypeAcquisition) {
                    try {
                        s = fs.stat((0, pathMapper_1.mapUri)(uri, 'vscode-node-modules'));
                    }
                    catch (_e) {
                    }
                }
            }
            return s && new Date(s.mtime);
        },
        deleteFile(path) {
            logger.logVerbose('fs.deleteFile', { path });
            if (!fs) {
                throw new Error('not supported');
            }
            try {
                fs.delete(pathMapper.toResource(path));
            }
            catch (error) {
                logger.logNormal('Error fs.deleteFile', { path, error: error + '' });
            }
        },
        createHash: generateDjb2Hash,
        /** This must be cryptographically secure.
            The browser implementation, crypto.subtle.digest, is async so not possible to call from tsserver. */
        createSHA256Hash: undefined,
        exit: exit,
        realpath,
        base64decode: input => Buffer.from(input, 'base64').toString('utf8'),
        base64encode: input => Buffer.from(input).toString('base64'),
    };
    // For module resolution only. `node_modules` is also automatically mapped
    // as if all node_modules-like paths are symlinked.
    function realpath(path) {
        if (path.startsWith('/^/')) {
            // In memory file. No mapping needed
            return path;
        }
        const isNm = (0, pathMapper_1.looksLikeNodeModules)(path)
            && !path.startsWith('/vscode-global-typings/')
            // Handle the case where a local folder has been opened in VS Code
            // In these cases we do not want to use the mapped node_module
            && !path.startsWith('/file/');
        // skip paths without .. or ./ or /
        if (!isNm && !path.match(/\.\.|\/\.|\.\//)) {
            return path;
        }
        let uri;
        try {
            uri = pathMapper.toResource(path);
        }
        catch {
            return path;
        }
        if (isNm) {
            uri = (0, pathMapper_1.mapUri)(uri, 'vscode-node-modules');
        }
        const out = [uri.scheme];
        if (uri.authority) {
            out.push(uri.authority);
        }
        for (const part of uri.path.split('/')) {
            switch (part) {
                case '':
                case '.':
                    break;
                case '..':
                    //delete if there is something there to delete
                    out.pop();
                    break;
                default:
                    out.push(part);
            }
        }
        return '/' + out.join('/');
    }
    function getAccessibleFileSystemEntries(path) {
        if (!fs) {
            throw new Error('not supported');
        }
        const uri = pathMapper.toResource(path || '.');
        let entries = [];
        const files = [];
        const directories = [];
        try {
            entries = fs.readDirectory(uri);
        }
        catch (_e) {
            try {
                entries = fs.readDirectory((0, pathMapper_1.mapUri)(uri, 'vscode-node-modules'));
            }
            catch (_e) {
            }
        }
        for (const [entry, type] of entries) {
            // This is necessary because on some file system node fails to exclude
            // '.' and '..'. See https://github.com/nodejs/node/issues/4002
            if (entry === '.' || entry === '..') {
                continue;
            }
            if (type === sync_api_client_1.FileType.File) {
                files.push(entry);
            }
            else if (type === sync_api_client_1.FileType.Directory) {
                directories.push(entry);
            }
        }
        files.sort();
        directories.sort();
        return { files, directories };
    }
}
async function createSys(ts, args, fsPort, logger, watchManager, pathMapper, onExit) {
    if ((0, args_1.hasArgument)(args, '--enableProjectWideIntelliSenseOnWeb')) {
        const enabledExperimentalTypeAcquisition = (0, args_1.hasArgument)(args, '--experimentalTypeAcquisition');
        const connection = new browser_1.ClientConnection(fsPort);
        await connection.serviceReady();
        const apiClient = new sync_api_client_1.ApiClient(connection);
        const fs = apiClient.vscode.workspace.fileSystem;
        const sys = createServerHost(ts, logger, apiClient, args, watchManager, pathMapper, enabledExperimentalTypeAcquisition, onExit);
        return { sys, fs };
    }
    else {
        return { sys: createServerHost(ts, logger, undefined, args, watchManager, pathMapper, false, onExit) };
    }
}
//# sourceMappingURL=serverHost.js.map