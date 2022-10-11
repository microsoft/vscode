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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const gulp_json_editor_1 = __importDefault(require("gulp-json-editor"));
const buffer = require('gulp-buffer');
const gulp_filter_1 = __importDefault(require("gulp-filter"));
const es = __importStar(require("event-stream"));
const vfs = __importStar(require("vinyl-fs"));
const fancy_log_1 = __importDefault(require("fancy-log"));
const ansiColors = __importStar(require("ansi-colors"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
async function mixinClient(quality) {
    const productJsonFilter = (0, gulp_filter_1.default)(f => f.relative === 'product.json', { restore: true });
    (0, fancy_log_1.default)(ansiColors.blue('[mixin]'), `Mixing in client:`);
    return new Promise((c, e) => {
        vfs
            .src(`quality/${quality}/**`, { base: `quality/${quality}` })
            .pipe((0, gulp_filter_1.default)(f => !f.isDirectory()))
            .pipe((0, gulp_filter_1.default)(f => f.relative !== 'product.server.json'))
            .pipe(productJsonFilter)
            .pipe(buffer())
            .pipe((0, gulp_json_editor_1.default)((o) => {
            const originalProduct = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'product.json'), 'utf8'));
            let builtInExtensions = originalProduct.builtInExtensions;
            if (Array.isArray(o.builtInExtensions)) {
                (0, fancy_log_1.default)(ansiColors.blue('[mixin]'), 'Overwriting built-in extensions:', o.builtInExtensions.map(e => e.name));
                builtInExtensions = o.builtInExtensions;
            }
            else if (o.builtInExtensions) {
                const include = o.builtInExtensions['include'] || [];
                const exclude = o.builtInExtensions['exclude'] || [];
                (0, fancy_log_1.default)(ansiColors.blue('[mixin]'), 'OSS built-in extensions:', builtInExtensions.map(e => e.name));
                (0, fancy_log_1.default)(ansiColors.blue('[mixin]'), 'Including built-in extensions:', include.map(e => e.name));
                (0, fancy_log_1.default)(ansiColors.blue('[mixin]'), 'Excluding built-in extensions:', exclude);
                builtInExtensions = builtInExtensions.filter(ext => !include.find(e => e.name === ext.name) && !exclude.find(name => name === ext.name));
                builtInExtensions = [...builtInExtensions, ...include];
                (0, fancy_log_1.default)(ansiColors.blue('[mixin]'), 'Final built-in extensions:', builtInExtensions.map(e => e.name));
            }
            else {
                (0, fancy_log_1.default)(ansiColors.blue('[mixin]'), 'Inheriting OSS built-in extensions', builtInExtensions.map(e => e.name));
            }
            return { webBuiltInExtensions: originalProduct.webBuiltInExtensions, ...o, builtInExtensions };
        }))
            .pipe(productJsonFilter.restore)
            .pipe(es.mapSync((f) => {
            (0, fancy_log_1.default)(ansiColors.blue('[mixin]'), f.relative, ansiColors.green('✔︎'));
            return f;
        }))
            .pipe(vfs.dest('.'))
            .on('end', () => c())
            .on('error', (err) => e(err));
    });
}
function mixinServer(quality) {
    const serverProductJsonPath = `quality/${quality}/product.server.json`;
    if (!fs.existsSync(serverProductJsonPath)) {
        (0, fancy_log_1.default)(ansiColors.blue('[mixin]'), `Server product not found`, serverProductJsonPath);
        return;
    }
    (0, fancy_log_1.default)(ansiColors.blue('[mixin]'), `Mixing in server:`);
    const originalProduct = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'product.json'), 'utf8'));
    const serverProductJson = JSON.parse(fs.readFileSync(serverProductJsonPath, 'utf8'));
    fs.writeFileSync('product.json', JSON.stringify({ ...originalProduct, ...serverProductJson }, undefined, '\t'));
    (0, fancy_log_1.default)(ansiColors.blue('[mixin]'), 'product.json', ansiColors.green('✔︎'));
}
function main() {
    const quality = process.env['VSCODE_QUALITY'];
    if (!quality) {
        console.log('Missing VSCODE_QUALITY, skipping mixin');
        return;
    }
    if (process.argv[2] === '--server') {
        mixinServer(quality);
    }
    else {
        mixinClient(quality).catch(err => {
            console.error(err);
            process.exit(1);
        });
    }
}
main();
