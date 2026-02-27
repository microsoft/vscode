/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// With pnpm workspaces + node-linker=hoisted, the typescript package in
// extensions/node_modules/typescript is hoisted to the root node_modules.
// We skip the trimming here because:
// 1. With hoisted mode, modifying would affect the shared copy
// 2. The trimming is a size optimization relevant only for shipping, which
//    is handled during the build/packaging phase, not at install time.
console.log('extensions/postinstall.mjs: Skipping TypeScript trimming (pnpm workspace mode).');
