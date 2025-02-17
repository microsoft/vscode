"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function log(...args) {
    console.log(`[${new Date().toLocaleTimeString('en', { hour12: false })}]`, '[distro]', ...args);
}
function main() {
    const quality = process.env['VSCODE_QUALITY'];
    if (!quality) {
        throw new Error('Missing VSCODE_QUALITY, skipping mixin');
    }
    log(`Mixing in distro quality...`);
    const basePath = `.build/distro/mixin/${quality}`;
    for (const name of fs_1.default.readdirSync(basePath)) {
        const distroPath = path_1.default.join(basePath, name);
        const ossPath = path_1.default.relative(basePath, distroPath);
        if (ossPath === 'product.json') {
            const distro = JSON.parse(fs_1.default.readFileSync(distroPath, 'utf8'));
            const oss = JSON.parse(fs_1.default.readFileSync(ossPath, 'utf8'));
            let builtInExtensions = oss.builtInExtensions;
            if (Array.isArray(distro.builtInExtensions)) {
                log('Overwriting built-in extensions:', distro.builtInExtensions.map(e => e.name));
                builtInExtensions = distro.builtInExtensions;
            }
            else if (distro.builtInExtensions) {
                const include = distro.builtInExtensions['include'] ?? [];
                const exclude = distro.builtInExtensions['exclude'] ?? [];
                log('OSS built-in extensions:', builtInExtensions.map(e => e.name));
                log('Including built-in extensions:', include.map(e => e.name));
                log('Excluding built-in extensions:', exclude);
                builtInExtensions = builtInExtensions.filter(ext => !include.find(e => e.name === ext.name) && !exclude.find(name => name === ext.name));
                builtInExtensions = [...builtInExtensions, ...include];
                log('Final built-in extensions:', builtInExtensions.map(e => e.name));
            }
            else {
                log('Inheriting OSS built-in extensions', builtInExtensions.map(e => e.name));
            }
            const result = { webBuiltInExtensions: oss.webBuiltInExtensions, ...distro, builtInExtensions };
            fs_1.default.writeFileSync(ossPath, JSON.stringify(result, null, '\t'), 'utf8');
        }
        else {
            fs_1.default.cpSync(distroPath, ossPath, { force: true, recursive: true });
        }
        log(distroPath, '✔︎');
    }
}
main();
//# sourceMappingURL=mixin-quality.js.map