/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IShellLaunchConfig } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalGroup, ITerminalGroupService, ITerminalInstance } from '../../browser/terminal.js';
import { TerminalTabsAccessibilityProvider } from '../../browser/terminalTabsList.js';

function createInstance(instanceId: number, title: string, hostLabel?: string): ITerminalInstance {
	return new class extends mock<ITerminalInstance>() {
		override readonly instanceId = instanceId;
		override readonly title = title;
		override readonly shellLaunchConfig: IShellLaunchConfig = { hostLabel };
	};
}

suite('TerminalTabsAccessibilityProvider', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('labels name the remote host a terminal runs on', () => {
		const local = createInstance(1, 'zsh');
		const remote = createInstance(2, 'bash', 'devbox');
		const split = [createInstance(3, 'node', 'devbox'), createInstance(4, 'zsh')];
		const provider = new TerminalTabsAccessibilityProvider(new class extends mock<ITerminalGroupService>() {
			override getGroupForInstance(instance: ITerminalInstance): ITerminalGroup {
				const terminalInstances = split.includes(instance) ? split : [instance];
				return new class extends mock<ITerminalGroup>() {
					override readonly terminalInstances = terminalInstances;
				};
			}
		});

		assert.deepStrictEqual([local, remote, ...split].map(instance => provider.getAriaLabel(instance)), [
			'Terminal 1 zsh',
			'Terminal 2 bash on devbox',
			'Terminal 3 node on devbox, split 1 of 2',
			'Terminal 4 zsh, split 2 of 2',
		]);
	});
});
