/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { webcrypto } from 'crypto';
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test } from 'node:test';
import * as vm from 'vm';
import type { RawSourceMap } from 'source-map';
import { bundleDevTunnelsWeb, devTunnelsWebOutDir } from '../devTunnelsWeb.ts';

suite('Dev Tunnels browser bundle', () => {
	for (const minify of [false, true]) {
		test(`initializes without Node globals and preserves scoped output and ${minify ? 'CDN' : 'local'} maps`, async t => {
			const outDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-sdk-maps-'));
			t.after(() => fs.promises.rm(outDir, { recursive: true, force: true }));
			const neighbor = path.join(outDir, 'neighbor.js');
			const sentinel = '// An unrelated output must remain byte-for-byte.\r\n';
			await fs.promises.writeFile(neighbor, sentinel);
			const sourceMapBaseUrl = minify ? `https://example.test/sourcemaps/commit/core/${devTunnelsWebOutDir}` : undefined;

			await bundleDevTunnelsWeb({ outDir, minify, sourceMapBaseUrl });

			const code = await fs.promises.readFile(path.join(outDir, 'devTunnelsModule.js'), 'utf8');
			const map: RawSourceMap = JSON.parse(await fs.promises.readFile(path.join(outDir, 'devTunnelsModule.js.map'), 'utf8'));
			// Run the bundle like a browser would: with web globals only, and no `process`, `Buffer` or `require`.
			const script = await esbuild.transform(code, { loader: 'js', format: 'iife', globalName: 'devTunnels', target: 'es2024' });
			const context = vm.createContext({ crypto: webcrypto, TextEncoder, TextDecoder, atob, btoa, queueMicrotask, setTimeout, clearTimeout });
			vm.runInContext('globalThis.self = globalThis;', context);
			vm.runInContext(script.code, context);
			assert.deepStrictEqual({
				nodeGlobals: vm.runInContext('[typeof process, typeof Buffer, typeof require].join(",")', context),
				exports: vm.runInContext('Object.keys(devTunnels).sort().join(",")', context),
				sourceMappingURL: /\/\/# sourceMappingURL=(?<url>[^\r\n]+)/.exec(code)?.groups?.url,
				hasSources: map.sources.length > 0 && map.sourcesContent?.length === map.sources.length,
				neighbor: await fs.promises.readFile(neighbor, 'utf8'),
			}, {
				nodeGlobals: 'undefined,undefined,undefined',
				exports: 'ManagementApiVersions,TunnelAccessScopes,TunnelManagementHttpClient,TunnelRelayTunnelClient',
				sourceMappingURL: sourceMapBaseUrl ? `${sourceMapBaseUrl}/devTunnelsModule.js.map` : 'devTunnelsModule.js.map',
				hasSources: true,
				neighbor: sentinel,
			});
		});
	}
});
