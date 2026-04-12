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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findPreferredPM = findPreferredPM;
const findWorkspaceRoot = require("../node_modules/find-yarn-workspace-root");
const find_up_1 = __importDefault(require("find-up"));
const path = __importStar(require("path"));
const which_pm_1 = __importDefault(require("which-pm"));
const vscode_1 = require("vscode");
async function pathExists(filePath) {
    try {
        await vscode_1.workspace.fs.stat(vscode_1.Uri.file(filePath));
    }
    catch {
        return false;
    }
    return true;
}
async function isBunPreferred(pkgPath) {
    if (await pathExists(path.join(pkgPath, 'bun.lockb'))) {
        return { isPreferred: true, hasLockfile: true };
    }
    if (await pathExists(path.join(pkgPath, 'bun.lock'))) {
        return { isPreferred: true, hasLockfile: true };
    }
    return { isPreferred: false, hasLockfile: false };
}
async function isPNPMPreferred(pkgPath) {
    if (await pathExists(path.join(pkgPath, 'pnpm-lock.yaml'))) {
        return { isPreferred: true, hasLockfile: true };
    }
    if (await pathExists(path.join(pkgPath, 'shrinkwrap.yaml'))) {
        return { isPreferred: true, hasLockfile: true };
    }
    if (await (0, find_up_1.default)('pnpm-lock.yaml', { cwd: pkgPath })) {
        return { isPreferred: true, hasLockfile: true };
    }
    return { isPreferred: false, hasLockfile: false };
}
async function isYarnPreferred(pkgPath) {
    if (await pathExists(path.join(pkgPath, 'yarn.lock'))) {
        return { isPreferred: true, hasLockfile: true };
    }
    try {
        if (typeof findWorkspaceRoot(pkgPath) === 'string') {
            return { isPreferred: true, hasLockfile: false };
        }
    }
    catch (err) { }
    return { isPreferred: false, hasLockfile: false };
}
async function isNPMPreferred(pkgPath) {
    const lockfileExists = await pathExists(path.join(pkgPath, 'package-lock.json'));
    return { isPreferred: lockfileExists, hasLockfile: lockfileExists };
}
async function findPreferredPM(pkgPath) {
    const detectedPackageManagerNames = [];
    const detectedPackageManagerProperties = [];
    const npmPreferred = await isNPMPreferred(pkgPath);
    if (npmPreferred.isPreferred) {
        detectedPackageManagerNames.push('npm');
        detectedPackageManagerProperties.push(npmPreferred);
    }
    const pnpmPreferred = await isPNPMPreferred(pkgPath);
    if (pnpmPreferred.isPreferred) {
        detectedPackageManagerNames.push('pnpm');
        detectedPackageManagerProperties.push(pnpmPreferred);
    }
    const yarnPreferred = await isYarnPreferred(pkgPath);
    if (yarnPreferred.isPreferred) {
        detectedPackageManagerNames.push('yarn');
        detectedPackageManagerProperties.push(yarnPreferred);
    }
    const bunPreferred = await isBunPreferred(pkgPath);
    if (bunPreferred.isPreferred) {
        detectedPackageManagerNames.push('bun');
        detectedPackageManagerProperties.push(bunPreferred);
    }
    const pmUsedForInstallation = await (0, which_pm_1.default)(pkgPath);
    if (pmUsedForInstallation && !detectedPackageManagerNames.includes(pmUsedForInstallation.name)) {
        detectedPackageManagerNames.push(pmUsedForInstallation.name);
        detectedPackageManagerProperties.push({ isPreferred: true, hasLockfile: false });
    }
    let lockfilesCount = 0;
    detectedPackageManagerProperties.forEach(detected => lockfilesCount += detected.hasLockfile ? 1 : 0);
    return {
        name: detectedPackageManagerNames[0] || 'npm',
        multipleLockFilesDetected: lockfilesCount > 1
    };
}
//# sourceMappingURL=preferred-pm.js.map