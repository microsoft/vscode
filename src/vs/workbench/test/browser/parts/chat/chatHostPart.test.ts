/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import '../../../../browser/parts/chat/media/chatHostPart.css';

suite('ChatHostPart', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('draws no frame of its own, so that its chats look as in a chat window', () => {
		const frameOf = (workbenchClasses: string[]) => {
			const workbench = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
			workbench.classList.add('monaco-workbench', ...workbenchClasses);
			const part = workbench.appendChild(mainWindow.document.createElement('div'));
			part.classList.add('part', 'chat');
			const style = mainWindow.getComputedStyle(part);
			const frame = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
			workbench.remove();
			return frame;
		};

		assert.deepStrictEqual({ docked: frameOf([]), floating: frameOf(['floating-panels']) }, {
			docked: ['0px', '0px', '0px', '0px'],
			floating: ['0px', '0px', '0px', '0px'],
		});
	});
});
