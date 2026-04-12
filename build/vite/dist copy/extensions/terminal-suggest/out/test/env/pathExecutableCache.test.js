"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const node_assert_1 = require("node:assert");
const pathExecutableCache_1 = require("../../env/pathExecutableCache");
const executable_1 = require("../../helpers/executable");
suite('PathExecutableCache', () => {
    test('cache should return empty for empty PATH', async () => {
        const cache = new pathExecutableCache_1.PathExecutableCache();
        const result = await cache.getExecutablesInPath({ PATH: '' });
        (0, node_assert_1.strictEqual)(Array.from(result.completionResources).length, 0);
        (0, node_assert_1.strictEqual)(Array.from(result.labels).length, 0);
    });
    test('results are the same on successive calls', async () => {
        const cache = new pathExecutableCache_1.PathExecutableCache();
        const env = { PATH: process.env.PATH };
        const result = await cache.getExecutablesInPath(env);
        const result2 = await cache.getExecutablesInPath(env);
        (0, node_assert_1.deepStrictEqual)(result.labels, result2.labels);
    });
    test('refresh clears the cache', async () => {
        const cache = new pathExecutableCache_1.PathExecutableCache();
        const env = { PATH: process.env.PATH };
        const result = await cache.getExecutablesInPath(env);
        cache.refresh();
        const result2 = await cache.getExecutablesInPath(env);
        (0, node_assert_1.strictEqual)(result !== result2, true);
    });
    if (process.platform !== 'win32') {
        test('cache should include executables found via symbolic links', async () => {
            const path = require('path');
            // Always use the source fixture directory to ensure symlinks are present
            const fixtureDir = path.resolve(__dirname.replace(/out[\/].*$/, 'src/test/env'), '../fixtures/symlink-test');
            const env = { PATH: fixtureDir };
            const cache = new pathExecutableCache_1.PathExecutableCache();
            const result = await cache.getExecutablesInPath(env);
            cache.refresh();
            const labels = Array.from(result.labels);
            (0, node_assert_1.strictEqual)(labels.includes('real-executable.sh'), true);
            (0, node_assert_1.strictEqual)(labels.includes('symlink-executable.sh'), true);
            (0, node_assert_1.strictEqual)(result?.completionResources?.size, 2);
            const completionResources = result.completionResources;
            let realDocRaw = undefined;
            let symlinkDocRaw = undefined;
            for (const resource of completionResources) {
                if (resource.label === 'real-executable.sh') {
                    realDocRaw = resource.documentation;
                }
                else if (resource.label === 'symlink-executable.sh') {
                    symlinkDocRaw = resource.documentation;
                }
            }
            const realDoc = typeof realDocRaw === 'string' ? realDocRaw : (realDocRaw && Object.hasOwn(realDocRaw, 'value') ? realDocRaw.value : undefined);
            const symlinkDoc = typeof symlinkDocRaw === 'string' ? symlinkDocRaw : (symlinkDocRaw && Object.hasOwn(symlinkDocRaw, 'value') ? symlinkDocRaw.value : undefined);
            const realPath = path.join(fixtureDir, 'real-executable.sh');
            const symlinkPath = path.join(fixtureDir, 'symlink-executable.sh');
            (0, node_assert_1.strictEqual)(realDoc, realPath);
            (0, node_assert_1.strictEqual)(symlinkDoc, `${symlinkPath} -> ${realPath}`);
        });
    }
    if (process.platform === 'win32') {
        suite('WindowsExecutableExtensionsCache', () => {
            test('returns default extensions when not configured', () => {
                const cache = new executable_1.WindowsExecutableExtensionsCache();
                const extensions = cache.getExtensions();
                for (const ext of executable_1.windowsDefaultExecutableExtensions) {
                    (0, node_assert_1.strictEqual)(extensions.has(ext), true, `expected default extension ${ext}`);
                }
            });
            test('honors configured additions and removals', () => {
                const cache = new executable_1.WindowsExecutableExtensionsCache({
                    '.added': true,
                    '.bat': false
                });
                const extensions = cache.getExtensions();
                (0, node_assert_1.strictEqual)(extensions.has('.added'), true);
                (0, node_assert_1.strictEqual)(extensions.has('.bat'), false);
                (0, node_assert_1.strictEqual)(extensions.has('.exe'), true);
            });
            test('recomputes only after update is called', () => {
                const cache = new executable_1.WindowsExecutableExtensionsCache({ '.one': true });
                const first = cache.getExtensions();
                const second = cache.getExtensions();
                (0, node_assert_1.strictEqual)(first, second, 'expected cached set to be reused');
                cache.update({ '.two': true });
                const third = cache.getExtensions();
                (0, node_assert_1.strictEqual)(third.has('.two'), true);
                (0, node_assert_1.strictEqual)(third.has('.one'), false);
                (0, node_assert_1.strictEqual)(third === first, false, 'expected cache to recompute after update');
            });
        });
    }
});
//# sourceMappingURL=pathExecutableCache.test.js.map