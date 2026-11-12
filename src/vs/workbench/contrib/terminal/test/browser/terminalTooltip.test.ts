/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { renderMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import Severity from '../../../../../base/common/severity.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITerminalInstance } from '../../browser/terminal.js';
import { ITerminalStatusList } from '../../browser/terminalStatusList.js';
import { getInstanceHoverInfo } from '../../browser/terminalTooltip.js';

suite('TerminalTooltip', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createInstance(title: string, description: string): ITerminalInstance {
		return new class extends mock<ITerminalInstance>() {
			override readonly title = title;
			override readonly description = description;
			override readonly processId = 42;
			override readonly shellLaunchConfig = { executable: 'pwsh' };
			override readonly injectedArgs = undefined;
			override readonly statusList = new class extends mock<ITerminalStatusList>() {
				override readonly statuses = [{ id: 'ready', severity: Severity.Info, tooltip: '**Ready**' }];
			};
		};
	}

	test('preserves literal labels, progress icons and rich shell and status information', () => {
		const instance = createInstance('Build <main> &amp; [1]', 'Progress $(alert) 42% C:\\project_with_underscores');
		const info = getInstanceHoverInfo(instance, store.add(new InMemoryStorageService()), '::');
		const rendered = store.add(renderMarkdown(info.content));
		const paragraphs = Array.from(rendered.element.querySelectorAll('p'));

		assert.deepStrictEqual({
			label: paragraphs[0]?.textContent?.replace(/\s+/g, ' ').trim(),
			progressIcon: !!paragraphs[0]?.querySelector('.codicon-alert'),
			htmlElement: !!rendered.element.querySelector('main'),
			shell: paragraphs.slice(1, -1).map(paragraph => paragraph.textContent),
			status: paragraphs.at(-1)?.querySelector('strong')?.textContent,
			actions: info.actions.map(action => action.commandId)
		}, {
			label: 'Build <main> &amp; [1] :: Progress 42% C:\\project_with_underscores',
			progressIcon: true,
			htmlElement: false,
			shell: ['Process ID (PID): 42', 'Command line: pwsh'],
			status: 'Ready',
			actions: ['toggleDetailedInfo']
		});
	});

	test('omits the separator when there is no description', () => {
		const info = getInstanceHoverInfo(createInstance('Terminal [1]', ''), store.add(new InMemoryStorageService()), '-');
		const rendered = store.add(renderMarkdown(info.content));

		assert.strictEqual(rendered.element.querySelector('p')?.textContent, 'Terminal [1]');
	});
});
