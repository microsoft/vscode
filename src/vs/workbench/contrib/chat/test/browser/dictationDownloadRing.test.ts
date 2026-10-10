/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatSpeechToTextService } from '../../browser/speechToText/chatSpeechToTextService.js';
import { DictationDownloadRing } from '../../browser/speechToText/dictationDownloadRing.js';

suite('DictationDownloadRing', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('creates its SVG elements in the main realm for an auxiliary window', () => {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		store.add(toDisposable(() => iframe.remove()));

		const auxiliaryDocument = iframe.contentDocument!;
		const container = document.createElement('div');
		auxiliaryDocument.body.appendChild(container);
		const service = new class extends mock<IChatSpeechToTextService>() {
			override readonly onDidChangeModelDownloadProgress = Event.None;
			override readonly modelDownloadProgress = 0.5;
		};

		store.add(new DictationDownloadRing(container, service));
		const ring = container.querySelector('svg');

		assert.deepStrictEqual({
			ownerDocument: ring?.ownerDocument === auxiliaryDocument,
			mainRealmSvg: ring instanceof SVGSVGElement,
			circles: ring?.querySelectorAll('circle').length,
		}, {
			ownerDocument: true,
			mainRealmSvg: true,
			circles: 2,
		});
	});
});
