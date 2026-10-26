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
import { agentHostCryptoOutDir, bundleAgentHostCrypto } from '../agentHostCrypto.ts';

type CryptoModule = Pick<typeof import('@hpke/core'), 'CipherSuite' | 'DhkemX25519HkdfSha256' | 'HkdfSha256' | 'Aes256Gcm'> & { sodium: typeof import('libsodium-wrappers').default };

suite('Agent host browser crypto bundle', () => {
	for (const minify of [false, true]) {
		test(`runs without Node globals and preserves ${minify ? 'CDN' : 'local'} source maps`, { timeout: 30_000 }, async t => {
			const outDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-agent-crypto-'));
			t.after(() => fs.promises.rm(outDir, { recursive: true, force: true }));
			const neighbor = path.join(outDir, 'neighbor.js');
			await fs.promises.writeFile(neighbor, 'unchanged');
			const sourceMapBaseUrl = minify ? `https://example.test/maps/${agentHostCryptoOutDir}` : undefined;
			await bundleAgentHostCrypto({ outDir, minify, sourceMapBaseUrl });
			const code = await fs.promises.readFile(path.join(outDir, 'agentHostCryptoModule.js'), 'utf8');
			const map: RawSourceMap = JSON.parse(await fs.promises.readFile(path.join(outDir, 'agentHostCryptoModule.js.map'), 'utf8'));
			const script = await esbuild.transform(code, { format: 'iife', globalName: 'agentHostCrypto', target: 'es2024' });
			const context = vm.createContext({
				crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, atob, btoa, setTimeout, clearTimeout,
			});
			const implementation = vm.runInContext(`${script.code}\nagentHostCrypto;`, context) as CryptoModule;
			await implementation.sodium.ready;
			const pair = implementation.sodium.crypto_box_keypair();
			const plaintext = new TextEncoder().encode('browser-credential');
			const box = implementation.sodium.crypto_box_seal(plaintext, pair.publicKey);
			const opened = implementation.sodium.crypto_box_seal_open(box, pair.publicKey, pair.privateKey);
			const kem = new implementation.DhkemX25519HkdfSha256();
			const hpke = new implementation.CipherSuite({
				kem,
				kdf: new implementation.HkdfSha256(),
				aead: new implementation.Aes256Gcm(),
			});
			const keys = await kem.generateKeyPair();
			const sender = await hpke.createSenderContext({ recipientPublicKey: keys.publicKey });
			const ciphertext = await sender.seal(plaintext);
			const recipient = await hpke.createRecipientContext({ recipientKey: keys.privateKey, enc: sender.enc });
			assert.deepStrictEqual({
				nodeGlobals: vm.runInContext('[typeof process, typeof Buffer, typeof require].join(",")', context),
				sodium: new TextDecoder().decode(opened),
				hpke: new TextDecoder().decode(await recipient.open(ciphertext)),
				sourceMappingURL: /\/\/# sourceMappingURL=(?<url>[^\r\n]+)/.exec(code)?.groups?.url,
				hasSources: map.sources.length > 0 && map.sourcesContent?.length === map.sources.length,
				neighbor: await fs.promises.readFile(neighbor, 'utf8'),
			}, {
				nodeGlobals: 'undefined,undefined,undefined',
				sodium: 'browser-credential',
				hpke: 'browser-credential',
				sourceMappingURL: sourceMapBaseUrl ? `${sourceMapBaseUrl}/agentHostCryptoModule.js.map` : 'agentHostCryptoModule.js.map',
				hasSources: true,
				neighbor: 'unchanged',
			});
		});
	}
});
