/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { webcrypto } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { suite, test } from 'node:test';
import { TextDecoder, TextEncoder } from 'node:util';
import * as vm from 'node:vm';
import * as esbuild from 'esbuild';
import type { RawSourceMap } from 'source-map';
import { bundleMissionControlWebCrypto, missionControlWebCryptoOutDir } from '../missionControlWebCrypto.ts';

suite('Mission Control browser crypto bundle', () => {
	for (const minify of [false, true]) {
		test(`loads without Node globals and preserves ${minify ? 'CDN' : 'local'} maps`, async t => {
			const outDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-sealing-'));
			t.after(() => fs.promises.rm(outDir, { recursive: true, force: true }));
			const neighbor = path.join(outDir, 'neighbor.js');
			const sentinel = '// Preserve neighboring outputs.\n';
			await fs.promises.writeFile(neighbor, sentinel);
			const sourceMapBaseUrl = minify ? `https://example.test/maps/${missionControlWebCryptoOutDir}` : undefined;
			await bundleMissionControlWebCrypto({ outDir, minify, sourceMapBaseUrl });

			const code = await fs.promises.readFile(path.join(outDir, 'missionControlCryptoModule.js'), 'utf8');
			const map: RawSourceMap = JSON.parse(await fs.promises.readFile(path.join(outDir, 'missionControlCryptoModule.js.map'), 'utf8'));
			const transformed = await esbuild.transform(code, { loader: 'js', format: 'iife', globalName: 'sealingCrypto' });
			const context = vm.createContext({ crypto: webcrypto, URL, TextEncoder, TextDecoder });
			vm.runInContext(transformed.code, context);
			const probe = await vm.runInContext(`(async () => {
				const { sodium, hpke } = sealingCrypto;
				await sodium.ready;
				const keys = sodium.crypto_box_keypair();
				const sealed = sodium.crypto_box_seal('test-token', keys.publicKey);
				const suite = new hpke.CipherSuite({ kem: new hpke.DhkemX25519HkdfSha256(), kdf: new hpke.HkdfSha256(), aead: new hpke.Aes256Gcm() });
				const recipientKey = await suite.kem.generateKeyPair();
				const sender = await suite.createSenderContext({ recipientPublicKey: recipientKey.publicKey });
				const ciphertext = await sender.seal(new TextEncoder().encode('test-token'));
				const recipient = await suite.createRecipientContext({ recipientKey, enc: sender.enc });
				return JSON.stringify({
					buffer: typeof Buffer, process: typeof process, require: typeof require,
					sealedBox: sodium.to_string(sodium.crypto_box_seal_open(sealed, keys.publicKey, keys.privateKey)),
					hpke: new TextDecoder().decode(await recipient.open(ciphertext))
				});
			})()`, context);
			assert.deepStrictEqual({
				probe: JSON.parse(probe),
				sourceMappingURL: /\/\/# sourceMappingURL=(?<url>[^\r\n]+)/.exec(code)?.groups?.url,
				hasSources: map.sources.length > 0 && map.sourcesContent?.length === map.sources.length,
				neighbor: await fs.promises.readFile(neighbor, 'utf8'),
			}, {
				probe: { buffer: 'undefined', process: 'undefined', require: 'undefined', sealedBox: 'test-token', hpke: 'test-token' },
				sourceMappingURL: sourceMapBaseUrl ? `${sourceMapBaseUrl}/missionControlCryptoModule.js.map` : 'missionControlCryptoModule.js.map',
				hasSources: true, neighbor: sentinel,
			});

			assert.throws(() => vm.runInNewContext(transformed.code, { URL, TextEncoder, TextDecoder }), /getRandomValues/);
		});
	}
});
