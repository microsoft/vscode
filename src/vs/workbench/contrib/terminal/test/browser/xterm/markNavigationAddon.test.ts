/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IMarker, Terminal } from '@xterm/xterm';
import { strictEqual } from 'assert';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TerminalCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { BufferMarkCapability } from '../../../../../../platform/terminal/common/capabilities/bufferMarkCapability.js';
import { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { TestXtermLogger } from '../../../../../../platform/terminal/test/common/terminalTestHelpers.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { MarkNavigationAddon } from '../../../browser/xterm/markNavigationAddon.js';

class TestBufferMarkCapability extends BufferMarkCapability {
	markerIteratorCalls = 0;

	override markers(): IterableIterator<IMarker> {
		this.markerIteratorCalls++;
		if (this.markerIteratorCalls > 2) {
			throw new Error('Buffer mark iterator was requested repeatedly');
		}
		return super.markers();
	}
}

suite('MarkNavigationAddon', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('should consume buffer mark iterators when navigating', async () => {
		const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
		const terminal: Terminal = store.add(new TerminalCtor({
			allowProposedApi: true,
			cols: 80,
			rows: 30,
			logger: TestXtermLogger
		}));
		const capabilities = store.add(new TerminalCapabilityStore());
		const markCapability = store.add(new TestBufferMarkCapability(terminal));
		markCapability.addMark();
		capabilities.add(TerminalCapability.BufferMarkDetection, markCapability);
		const instantiationService = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService()
		}, store);
		const addon = store.add(instantiationService.createInstance(MarkNavigationAddon, capabilities));
		terminal.loadAddon(addon);

		addon.scrollToNextMark(undefined, undefined, false);

		strictEqual(markCapability.markerIteratorCalls, 2);
	});
});
