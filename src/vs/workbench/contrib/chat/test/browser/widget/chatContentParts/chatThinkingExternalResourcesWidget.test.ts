/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ChatThinkingExternalResourceWidget } from '../../../../browser/widget/chatContentParts/chatThinkingExternalResourcesWidget.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';

suite('ChatThinkingExternalResourceWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('deduplicates identical images from different tool calls', () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const widget = disposables.add(instantiationService.createInstance(ChatThinkingExternalResourceWidget));
		const imageBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);

		widget.setToolInvocationParts('terminal', [{
			kind: 'data',
			value: imageBytes,
			mimeType: 'image/png',
			uri: URI.parse('test://terminal/image.png'),
		}]);
		widget.setToolInvocationParts('viewImage', [{
			kind: 'data',
			value: imageBytes.slice(),
			mimeType: 'image/png',
			uri: URI.parse('test://view-image/image.png'),
		}]);

		const identicalImageCount = widget.domNode.querySelectorAll('.chat-attached-context-attachment').length;

		widget.setToolInvocationParts('differentImage', [{
			kind: 'data',
			value: new Uint8Array([0x89, 0x50, 0x4E, 0x48]),
			mimeType: 'image/png',
			uri: URI.parse('test://different/image.png'),
		}]);

		assert.deepStrictEqual({
			identicalImageCount,
			differentImageCount: widget.domNode.querySelectorAll('.chat-attached-context-attachment').length,
		}, {
			identicalImageCount: 1,
			differentImageCount: 2,
		});

		disposables.dispose();
	});
});
