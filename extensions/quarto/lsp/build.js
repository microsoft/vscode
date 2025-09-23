"use strict";
/*
 * build.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */
Object.defineProperty(exports, "__esModule", { value: true });
const build_1 = require("build");
const args = process.argv;
const dev = args[2] === "dev";
const nodeSqlLiteWasm = './node_modules/node-sqlite3-wasm/dist/*.wasm';
(0, build_1.runBuild)({
    entryPoints: ['./src/index.ts'],
    outfile: '../out/lsp/lsp.js',
    assets: [
        { from: [nodeSqlLiteWasm], to: '../out/lsp/' },
        { from: ['./run.js'], to: '../out/lsp' },
        { from: ['../packages/editor-server/src/resources/**'], to: '../out/lsp/resources/' },
        { from: ['../packages/quarto-core/src/resources/**'], to: '../out/lsp/resources/' }
    ],
    minify: !dev,
    dev
});
