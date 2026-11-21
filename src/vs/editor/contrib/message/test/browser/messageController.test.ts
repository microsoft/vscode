/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { MessageController } from '../../browser/messageController.js';

suite('MessageController', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('applies the editor markdownImages option to Markdown messages', () => {
		withTestCodeEditor('text', { markdownImages: { allowedOrigins: ['https://allowed.example'] } }, (editor, _viewModel, instantiationService) => {
			instantiationService.stub(IOpenerService, {});
			const controller = editor.registerAndInstantiateContribution(MessageController.ID, MessageController);
			controller.showMessage(new MarkdownString('![blocked](https://attacker.example/x.png) ![allowed](https://allowed.example/y.png)'), { lineNumber: 1, column: 1 });

			const widget = (controller as unknown as { _messageWidget: { value?: { getDomNode(): HTMLElement } } })._messageWidget.value;
			const sources = [...widget!.getDomNode().querySelectorAll('img')].map(img => img.getAttribute('src'));
			assert.deepStrictEqual(sources, [null, 'https://allowed.example/y.png']);
			controller.closeMessage();
		});
	});
});
