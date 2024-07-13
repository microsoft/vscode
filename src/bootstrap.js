/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

// TODO@bpasero this file can no longer be used from a non-node.js context and thus should
// move into bootstrap-node.js and remaining usages (if any) in browser context be replaced.

// ESM-uncomment-begin
// import * as path from 'path';
// import { createRequire } from 'node:module';
// import { fileURLToPath } from 'url';
//
// const require = createRequire(import.meta.url);
// const module = { exports: {} };
// const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ESM-uncomment-end

// Simple module style to support node.js and browser environments
(function (factory) {

    // Node.js
    if (typeof module === 'object' && typeof module.exports === 'object') {
        module.exports = factory();
    }

    // Browser
    else {
        // @ts-ignore
        globalThis.MonacoBootstrap = factory();
    }
}(function () {
    const Module = typeof require === 'function' ? require('module') : undefined;
    const path = typeof require === 'function' ? require('path') : undefined;

    //#region global bootstrapping

    // Increase number of stack frames (from 10, https://github.com/v8/v8/wiki/Stack-Trace-API)
    Error.stackTraceLimit = 100;

    // Handle SIGPIPE in Node.js
    if (typeof process !== 'undefined' && !process.env['VSCODE_HANDLES_SIGPIPE']) {
        let didLogAboutSIGPIPE = false;
        process.on('SIGPIPE', () => {
            if (!didLogAboutSIGPIPE) {
                didLogAboutSIGPIPE = true;
                console.error(new Error(`Unexpected SIGPIPE`));
            }
        });
    }

    //#endregion

    //#region Add support for using node_modules.asar

    /**
     * Enable ASAR support for Node.js modules
     */
    function enableASARSupport() {
        if (!path || !Module || typeof process === 'undefined') {
            console.warn('enableASARSupport() is only available in node.js environments');
            return;
        }

        const NODE_MODULES_PATH = path.join(__dirname, '../node_modules');
        const NODE_MODULES_ASAR_PATH = `${NODE_MODULES_PATH}.asar`;

        // @ts-ignore
        const originalResolveLookupPaths = Module._resolveLookupPaths;

        // Override module lookup paths to include .asar archives
        // @ts-ignore
        Module._resolveLookupPaths = function (request, parent) {
            const paths = originalResolveLookupPaths(request, parent);
            if (Array.isArray(paths)) {
                for (let i = 0, len = paths.length; i < len; i++) {
                    if (paths[i] === NODE_MODULES_PATH) {
                        paths.splice(i, 0, NODE_MODULES_ASAR_PATH);
                        break;
                    }
                }
            }

            return paths;
        };
    }

    //#endregion

    //#region URI helpers

    /**
     * Convert a file system path to a file URI
     * @param {string} path - The file system path
     * @param {{ isWindows?: boolean, scheme?: string, fallbackAuthority?: string }} config - Configuration options
     * @returns {string} The file URI
     */
    function fileUriFromPath(path, config) {
        // Normalize backslashes to slashes and ensure the path begins with a '/'
        let pathName = path.replace(/\\/g, '/');
        if (pathName.length > 0 && pathName.charAt(0) !== '/') {
            pathName = `/${pathName}`;
        }

        /** @type {string} */
        let uri;

        // Handle UNC paths for Windows
        if (config.isWindows && pathName.startsWith('//')) {
            uri = encodeURI(`${config.scheme || 'file'}:${pathName}`);
        }
        // Add the provided authority if specified
        else {
            uri = encodeURI(`${config.scheme || 'file'}://${config.fallbackAuthority || ''}${pathName}`);
        }

        // Replace '#' with '%23' to escape the character
        return uri.replace(/#/g, '%23');
    }

    //#endregion

    return {
        enableASARSupport,
        fileUriFromPath
    };
}));

// ESM-uncomment-begin
// export const enableASARSupport = module.exports.enableASARSupport;
// export const fileUriFromPath = module.exports.fileUriFromPath;
// ESM-uncomment-end
