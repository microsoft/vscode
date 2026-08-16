/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IRenderedMarkdown, renderAsPlaintext } from '../../../../../../../base/browser/markdownRenderer.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { IMarkdownString, MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatSystemNotificationContentPart } from '../../../../browser/widget/chatContentParts/chatSystemNotificationContentPart.js';

suite('ChatSystemNotificationContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders persistent checked notification content', () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const renderer: IMarkdownRenderer = {
			render: (markdown: IMarkdownString): IRenderedMarkdown => {
				const element = mainWindow.document.createElement('div');
				element.textContent = renderAsPlaintext(markdown);
				return { element, dispose: () => { } };
			},
		};
		const part = disposables.add(instantiationService.createInstance(
			ChatSystemNotificationContentPart,
			{ kind: 'systemNotification', content: new MarkdownString('Background command completed') },
			renderer,
		));

		assert.deepStrictEqual({
			text: part.domNode.textContent,
			hasCheck: !!part.domNode.querySelector('.codicon-check'),
			sameContent: part.hasSameContent({ kind: 'systemNotification', content: new MarkdownString('Background command completed') }),
			differentContent: part.hasSameContent({ kind: 'systemNotification', content: new MarkdownString('Different') }),
		}, {
			text: 'Background command completed',
			hasCheck: true,
			sameContent: true,
			differentContent: false,
		});
	});
});
