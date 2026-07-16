/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { encodeRawPcm16Base64 } from '../../../browser/speechToText/dictationAudioCapture.js';
import { AudioCaptureLeaseService } from '../../../browser/voiceClient/audioCaptureLeaseService.js';

suite('Dictation audio capture', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('encodes signed little-endian PCM16', () => {
		const encoded = encodeRawPcm16Base64(new Float32Array([-1, 0, 1]), mainWindow);
		const binary = mainWindow.atob(encoded);

		assert.deepStrictEqual([...binary].map(character => character.charCodeAt(0)), [0, 128, 0, 0, 255, 127]);
	});

	test('allows only one audio owner', () => {
		const service = new AudioCaptureLeaseService();
		const first = store.add(service.acquire('dictation')!);

		assert.deepStrictEqual({
			first: !!first,
			competing: service.acquire('voice-mode'),
		}, {
			first: true,
			competing: undefined,
		});

		first.dispose();
		store.add(service.acquire('voice-mode')!);
	});
});
