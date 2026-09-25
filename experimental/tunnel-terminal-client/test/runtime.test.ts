/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SshAlgorithms } from '@microsoft/dev-tunnels-ssh';
import { ensureSupportedRuntime } from '../src/runtime.js';

test('accepts Node 22 and 24 maintenance releases and rejects unvalidated runtime majors', () => {
	for (const version of ['22.13.0', '22.23.2', '24.21.0']) {
		assert.doesNotThrow(() => ensureSupportedRuntime(version));
	}
	for (const version of ['20.19.0', '23.0.0', '26.0.0']) {
		assert.throws(() => ensureSupportedRuntime(version), /supports Node\.js 22\.x and 24\.x/);
	}
});

for (const name of ['rsaWithSha256', 'rsaWithSha512']) {
	test(`${name}: imported public and private keys preserve identity and reject tampered signatures`, async t => {
		ensureSupportedRuntime();
		const algorithm = SshAlgorithms.publicKey[name];
		assert.ok(algorithm);
		const original = algorithm.createKeyPair();
		t.after(() => original.dispose());
		const imported = algorithm.createKeyPair();
		t.after(() => imported.dispose());
		const publicParameters = algorithm.createKeyPair();
		t.after(() => publicParameters.dispose());
		const privateParameters = algorithm.createKeyPair();
		t.after(() => privateParameters.dispose());

		await original.generate();
		const bytes = await original.getPublicKeyBytes();
		assert.ok(bytes);
		await imported.setPublicKeyBytes(bytes);
		await publicParameters.importParameters(await imported.exportParameters());
		await privateParameters.importParameters(await original.exportParameters());
		const data = Buffer.from('tunnel host key verification');
		const signer = algorithm.createSigner(privateParameters);
		t.after(() => signer.dispose());
		const signature = await signer.sign(data);
		const tamperedSignature = Buffer.from(signature);
		tamperedSignature[0] ^= 1;
		const results = [];
		for (const key of [imported, publicParameters, privateParameters]) {
			const verifier = algorithm.createVerifier(key);
			t.after(() => verifier.dispose());
			const roundtrip = await key.getPublicKeyBytes();
			results.push({
				keyUnchanged: roundtrip !== null && bytes.equals(roundtrip),
				valid: await verifier.verify(data, signature),
				changedData: await verifier.verify(Buffer.from('tampered'), signature),
				changedSignature: await verifier.verify(data, tamperedSignature),
			});
		}
		assert.deepEqual(results, Array.from({ length: 3 }, () => ({
			keyUnchanged: true, valid: true, changedData: false, changedSignature: false,
		})));
	});
}
