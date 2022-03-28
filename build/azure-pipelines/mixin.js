/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const json = require("gulp-json-editor");
const buffer = require('gulp-buffer');
const filter = require("gulp-filter");
const es = require("event-stream");
const vfs = require("vinyl-fs");
const fancyLog = require("fancy-log");
const ansiColors = require("ansi-colors");
const fs = require("fs");
const path = require("path");
async function mixinClient(quality) {
    const productJsonFilter = filter(f => f.relative === 'product.json', { restore: true });
    fancyLog(ansiColors.blue('[mixin]'), `Mixing in client:`);
    return new Promise((c, e) => {
        vfs
            .src(`quality/${quality}/**`, { base: `quality/${quality}` })
            .pipe(filter(f => !f.isDirectory()))
            .pipe(filter(f => f.relative !== 'product.server.json'))
            .pipe(productJsonFilter)
            .pipe(buffer())
            .pipe(json((o) => {
            const originalProduct = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'product.json'), 'utf8'));
            let builtInExtensions = originalProduct.builtInExtensions;
            if (Array.isArray(o.builtInExtensions)) {
                fancyLog(ansiColors.blue('[mixin]'), 'Overwriting built-in extensions:', o.builtInExtensions.map(e => e.name));
                builtInExtensions = o.builtInExtensions;
            }
            else if (o.builtInExtensions) {
                const include = o.builtInExtensions['include'] || [];
                const exclude = o.builtInExtensions['exclude'] || [];
                fancyLog(ansiColors.blue('[mixin]'), 'OSS built-in extensions:', builtInExtensions.map(e => e.name));
                fancyLog(ansiColors.blue('[mixin]'), 'Including built-in extensions:', include.map(e => e.name));
                fancyLog(ansiColors.blue('[mixin]'), 'Excluding built-in extensions:', exclude);
                builtInExtensions = builtInExtensions.filter(ext => !include.find(e => e.name === ext.name) && !exclude.find(name => name === ext.name));
                builtInExtensions = [...builtInExtensions, ...include];
                fancyLog(ansiColors.blue('[mixin]'), 'Final built-in extensions:', builtInExtensions.map(e => e.name));
            }
            else {
                fancyLog(ansiColors.blue('[mixin]'), 'Inheriting OSS built-in extensions', builtInExtensions.map(e => e.name));
            }
            return { webBuiltInExtensions: originalProduct.webBuiltInExtensions, ...o, builtInExtensions };
        }))
            .pipe(productJsonFilter.restore)
            .pipe(es.mapSync((f) => {
            fancyLog(ansiColors.blue('[mixin]'), f.relative, ansiColors.green('✔︎'));
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
        fancyLog(ansiColors.blue('[mixin]'), `Server product not found`, serverProductJsonPath);
        return;
    }
    fancyLog(ansiColors.blue('[mixin]'), `Mixing in server:`);
    const originalProduct = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'product.json'), 'utf8'));
    const serverProductJson = JSON.parse(fs.readFileSync(serverProductJsonPath, 'utf8'));
    fs.writeFileSync('product.json', JSON.stringify({ ...originalProduct, ...serverProductJson }, undefined, '\t'));
    fancyLog(ansiColors.blue('[mixin]'), 'product.json', ansiColors.green('✔︎'));
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
