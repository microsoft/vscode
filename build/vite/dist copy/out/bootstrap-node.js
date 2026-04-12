/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const isWindows = process.platform === 'win32';
// increase number of stack frames(from 10, https://github.com/v8/v8/wiki/Stack-Trace-API)
Error.stackTraceLimit = 100;
if (!process.env['VSCODE_HANDLES_SIGPIPE']) {
    // Workaround for Electron not installing a handler to ignore SIGPIPE
    // (https://github.com/electron/electron/issues/13254)
    let didLogAboutSIGPIPE = false;
    process.on('SIGPIPE', () => {
        // See https://github.com/microsoft/vscode-remote-release/issues/6543
        // In certain situations, the console itself can be in a broken pipe state
        // so logging SIGPIPE to the console will cause an infinite async loop
        if (!didLogAboutSIGPIPE) {
            didLogAboutSIGPIPE = true;
            console.error(new Error(`Unexpected SIGPIPE`));
        }
    });
}
// Setup current working directory in all our node & electron processes
// - Windows: call `process.chdir()` to always set application folder as cwd
// -  all OS: store the `process.cwd()` inside `VSCODE_CWD` for consistent lookups
function setupCurrentWorkingDirectory() {
    try {
        // Store the `process.cwd()` inside `VSCODE_CWD`
        // for consistent lookups, but make sure to only
        // do this once unless defined already from e.g.
        // a parent process.
        if (typeof process.env['VSCODE_CWD'] !== 'string') {
            process.env['VSCODE_CWD'] = process.cwd();
        }
        // Windows: always set application folder as current working dir
        if (process.platform === 'win32') {
            process.chdir(path.dirname(process.execPath));
        }
    }
    catch (err) {
        console.error(err);
    }
}
setupCurrentWorkingDirectory();
/**
 * Add support for redirecting the loading of node modules
 *
 * Note: only applies when running out of sources.
 */
export function devInjectNodeModuleLookupPath(injectPath) {
    if (!process.env['VSCODE_DEV']) {
        return; // only applies running out of sources
    }
    if (!injectPath) {
        throw new Error('Missing injectPath');
    }
    // register a loader hook
    const Module = require('node:module');
    Module.register('./bootstrap-import.js', { parentURL: import.meta.url, data: injectPath });
}
export function removeGlobalNodeJsModuleLookupPaths() {
    if (typeof process?.versions?.electron === 'string') {
        return; // Electron disables global search paths in https://github.com/electron/electron/blob/3186c2f0efa92d275dc3d57b5a14a60ed3846b0e/shell/common/node_bindings.cc#L653
    }
    const Module = require('module');
    const globalPaths = Module.globalPaths;
    const originalResolveLookupPaths = Module._resolveLookupPaths;
    Module._resolveLookupPaths = function (moduleName, parent) {
        const paths = originalResolveLookupPaths(moduleName, parent);
        if (Array.isArray(paths)) {
            let commonSuffixLength = 0;
            while (commonSuffixLength < paths.length && paths[paths.length - 1 - commonSuffixLength] === globalPaths[globalPaths.length - 1 - commonSuffixLength]) {
                commonSuffixLength++;
            }
            return paths.slice(0, paths.length - commonSuffixLength);
        }
        return paths;
    };
    const originalNodeModulePaths = Module._nodeModulePaths;
    Module._nodeModulePaths = function (from) {
        let paths = originalNodeModulePaths(from);
        if (!isWindows) {
            return paths;
        }
        // On Windows, remove drive(s) and users' home directory from search paths,
        // UNLESS 'from' is explicitly set to one of those.
        const isDrive = (p) => p.length >= 3 && p.endsWith(':\\');
        if (!isDrive(from)) {
            paths = paths.filter(p => !isDrive(path.dirname(p)));
        }
        if (process.env.HOMEDRIVE && process.env.HOMEPATH) {
            const userDir = path.dirname(path.join(process.env.HOMEDRIVE, process.env.HOMEPATH));
            const isUsersDir = (p) => path.relative(p, userDir).length === 0;
            // Check if 'from' is the same as 'userDir'
            if (!isUsersDir(from)) {
                paths = paths.filter(p => !isUsersDir(path.dirname(p)));
            }
        }
        return paths;
    };
}
/**
 * Helper to enable portable mode.
 */
export function configurePortable(product) {
    const appRoot = path.dirname(import.meta.dirname);
    function getApplicationPath() {
        if (process.env['VSCODE_DEV']) {
            return appRoot;
        }
        if (process.platform === 'darwin') {
            return path.dirname(path.dirname(path.dirname(appRoot)));
        }
        // appRoot = ..\Microsoft VS Code Insiders\<version>\resources\app
        if (process.platform === 'win32' && product.win32VersionedUpdate) {
            return path.dirname(path.dirname(path.dirname(appRoot)));
        }
        return path.dirname(path.dirname(appRoot));
    }
    function getPortableDataPath() {
        if (process.env['VSCODE_PORTABLE']) {
            return process.env['VSCODE_PORTABLE'];
        }
        if (process.platform === 'win32' || process.platform === 'linux') {
            return path.join(getApplicationPath(), 'data');
        }
        const portableDataName = product.portable || `${product.applicationName}-portable-data`;
        return path.join(path.dirname(getApplicationPath()), portableDataName);
    }
    const portableDataPath = getPortableDataPath();
    const isPortable = !('target' in product) && fs.existsSync(portableDataPath);
    const portableTempPath = path.join(portableDataPath, 'tmp');
    const isTempPortable = isPortable && fs.existsSync(portableTempPath);
    if (isPortable) {
        process.env['VSCODE_PORTABLE'] = portableDataPath;
    }
    else {
        delete process.env['VSCODE_PORTABLE'];
    }
    if (isTempPortable) {
        if (process.platform === 'win32') {
            process.env['TMP'] = portableTempPath;
            process.env['TEMP'] = portableTempPath;
        }
        else {
            process.env['TMPDIR'] = portableTempPath;
        }
    }
    return {
        portableDataPath,
        isPortable
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYm9vdHN0cmFwLW5vZGUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJib290c3RyYXAtbm9kZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssSUFBSSxNQUFNLFdBQVcsQ0FBQztBQUNsQyxPQUFPLEtBQUssRUFBRSxNQUFNLFNBQVMsQ0FBQztBQUM5QixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBRzVDLE1BQU0sT0FBTyxHQUFHLGFBQWEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQy9DLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxRQUFRLEtBQUssT0FBTyxDQUFDO0FBRS9DLDBGQUEwRjtBQUMxRixLQUFLLENBQUMsZUFBZSxHQUFHLEdBQUcsQ0FBQztBQUU1QixJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFLENBQUM7SUFDNUMscUVBQXFFO0lBQ3JFLHNEQUFzRDtJQUN0RCxJQUFJLGtCQUFrQixHQUFHLEtBQUssQ0FBQztJQUMvQixPQUFPLENBQUMsRUFBRSxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUU7UUFDMUIscUVBQXFFO1FBQ3JFLDBFQUEwRTtRQUMxRSxzRUFBc0U7UUFDdEUsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7WUFDekIsa0JBQWtCLEdBQUcsSUFBSSxDQUFDO1lBQzFCLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQ2hELENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCx1RUFBdUU7QUFDdkUsNEVBQTRFO0FBQzVFLGtGQUFrRjtBQUNsRixTQUFTLDRCQUE0QjtJQUNwQyxJQUFJLENBQUM7UUFFSixnREFBZ0Q7UUFDaEQs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