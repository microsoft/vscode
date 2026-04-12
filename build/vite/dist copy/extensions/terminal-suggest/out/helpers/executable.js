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
exports.WindowsExecutableExtensionsCache = exports.windowsDefaultExecutableExtensions = void 0;
exports.isExecutable = isExecutable;
exports.isExecutableUnix = isExecutableUnix;
const os_1 = require("./os");
const fs = __importStar(require("fs/promises"));
function isExecutable(filePath, windowsExecutableExtensions) {
    if ((0, os_1.osIsWindows)()) {
        const extensions = windowsExecutableExtensions ?? defaultWindowsExecutableExtensionsSet;
        return hasWindowsExecutableExtension(filePath, extensions);
    }
    return isExecutableUnix(filePath);
}
async function isExecutableUnix(filePath) {
    try {
        const stats = await fs.stat(filePath);
        // On macOS/Linux, check if the executable bit is set
        return (stats.mode & 0o100) !== 0;
    }
    catch (error) {
        // If the file does not exist or cannot be accessed, it's not executable
        return false;
    }
}
exports.windowsDefaultExecutableExtensions = [
    '.exe', // Executable file
    '.bat', // Batch file
    '.cmd', // Command script
    '.com', // Command file
    '.msi', // Windows Installer package
    '.ps1', // PowerShell script
    '.vbs', // VBScript file
    '.js', // JScript file
    '.jar', // Java Archive (requires Java runtime)
    '.py', // Python script (requires Python interpreter)
    '.rb', // Ruby script (requires Ruby interpreter)
    '.pl', // Perl script (requires Perl interpreter)
    '.sh', // Shell script (via WSL or third-party tools)
];
const defaultWindowsExecutableExtensionsSet = new Set();
for (const ext of exports.windowsDefaultExecutableExtensions) {
    defaultWindowsExecutableExtensionsSet.add(ext);
}
class WindowsExecutableExtensionsCache {
    _rawConfig;
    _cachedExtensions;
    constructor(rawConfig) {
        this._rawConfig = rawConfig;
    }
    update(rawConfig) {
        this._rawConfig = rawConfig;
        this._cachedExtensions = undefined;
    }
    getExtensions() {
        if (!this._cachedExtensions) {
            this._cachedExtensions = resolveWindowsExecutableExtensions(this._rawConfig);
        }
        return this._cachedExtensions;
    }
}
exports.WindowsExecutableExtensionsCache = WindowsExecutableExtensionsCache;
function hasWindowsExecutableExtension(filePath, extensions) {
    const fileName = filePath.slice(Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/')) + 1);
    for (const ext of extensions) {
        if (fileName.endsWith(ext)) {
            return true;
        }
    }
    return false;
}
function resolveWindowsExecutableExtensions(configuredWindowsExecutableExtensions) {
    const extensions = new Set();
    const configured = configuredWindowsExecutableExtensions ?? {};
    const excluded = new Set();
    for (const [ext, value] of Object.entries(configured)) {
        if (value !== true) {
            excluded.add(ext);
        }
    }
    for (const ext of exports.windowsDefaultExecutableExtensions) {
        if (!excluded.has(ext)) {
            extensions.add(ext);
        }
    }
    for (const [ext, value] of Object.entries(configured)) {
        if (value === true) {
            extensions.add(ext);
        }
    }
    return extensions;
}
//# sourceMappingURL=executable.js.map