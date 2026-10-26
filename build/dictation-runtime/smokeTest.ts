/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { FoundryLocalManager, type IModel, type LiveAudioTranscriptionSession } from 'foundry-local-sdk';

test('downloads a cold-cache dictation model and transcribes the requested language', { timeout: 600_000 }, async t => {
	const audioPath = process.env.VSCODE_DICTATION_TEST_AUDIO;
	const language = process.env.VSCODE_DICTATION_TEST_LANGUAGE;
	const expectedText = process.env.VSCODE_DICTATION_TEST_EXPECTED_TEXT;
	assert.ok(audioPath && language && expectedText, 'Set VSCODE_DICTATION_TEST_AUDIO, VSCODE_DICTATION_TEST_LANGUAGE, and VSCODE_DICTATION_TEST_EXPECTED_TEXT. See build/dictation-runtime/README.md.');
	const audio = fs.readFileSync(audioPath);
	assert.ok(audio.length > 0 && audio.length % 2 === 0, 'Audio must be nonempty, raw mono 16 kHz signed 16-bit PCM.');
	assert.notStrictEqual(audio.toString('ascii', 0, 4), 'RIFF', 'Convert WAV input to raw PCM first.');

	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dictation-smoke-'));
	t.diagnostic(`Temporary cache: ${directory}`);
	const resources: { manager?: FoundryLocalManager; model?: IModel; session?: LiveAudioTranscriptionSession } = {};
	t.after(async () => {
		try {
			await resources.session?.dispose();
		} finally {
			try {
				await resources.model?.unload();
			} finally {
				resources.manager?.dispose();
				fs.rmSync(directory, { recursive: true, force: true });
			}
		}
	});
	const manager = await FoundryLocalManager.createAsync({
		appName: 'vscode-dictation',
		modelCacheDir: path.join(directory, 'models'),
		appDataDir: path.join(directory, 'data'),
		logsDir: path.join(directory, 'logs'),
		logLevel: 'warn',
		...(process.env.VSCODE_DICTATION_TEST_LIBRARY_PATH ? { libraryPath: process.env.VSCODE_DICTATION_TEST_LIBRARY_PATH } : {}),
	});
	resources.manager = manager;
	const model = await manager.catalog.getModel('nemotron-3.5-asr-streaming-0.6b');
	assert.strictEqual(model.isCached, false, 'The test must exercise an empty model cache.');
	await model.download();
	assert.strictEqual(model.isCached, true, 'The model download must complete.');
	await model.load();
	resources.model = model;

	const client = model.createAudioClient();
	client.settings.language = language;
	const session = client.createLiveTranscriptionSession();
	resources.session = session;
	session.settings.sampleRate = 16000;
	session.settings.channels = 1;
	session.settings.bitsPerSample = 16;
	session.settings.language = language;
	await session.start();

	let transcript = '';
	const consume = (async () => {
		for await (const result of session.getStream()) {
			if (result.is_final) {
				transcript = result.content.map(content => content.transcript ?? content.text ?? '').join('');
			}
		}
	})();
	// Observe a stream failure immediately, while still propagating it below.
	consume.catch(() => {});
	for (let offset = 0; offset < audio.length; offset += 3200) {
		await session.append(audio.subarray(offset, offset + 3200));
	}
	await session.stop();
	await consume;

	t.diagnostic(`${language}: ${transcript}`);
	assert.ok(transcript.toLowerCase().includes(expectedText.toLowerCase()), `Expected "${expectedText}" in the final ${language} transcript: "${transcript}"`);
	assert.doesNotMatch(transcript, /<en-US>/, 'The model must not leak its English language token.');
});
