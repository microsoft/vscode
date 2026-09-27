/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ICommandDto, MainThreadCommandsShape, MainThreadStatusBarShape } from '../../common/extHost.protocol.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { ExtHostStatusBarEntry } from '../../common/extHostStatusBar.js';
import { IExtHostTelemetry } from '../../common/extHostTelemetry.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('ExtHostStatusBar command lifetime', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let commands: ExtHostCommands;
	let item: ExtHostStatusBarEntry;
	let displayedCommand: ICommandDto | undefined;

	setup(() => {
		commands = new ExtHostCommands(SingleProxyRPCProtocol(new class extends mock<MainThreadCommandsShape>() {
			override $registerCommand(): void { }
			override $unregisterCommand(): void { }
		}), new NullLogService(), new class extends mock<IExtHostTelemetry>() { });
		displayedCommand = undefined;
		item = disposables.add(new ExtHostStatusBarEntry(new class extends mock<MainThreadStatusBarShape>() {
			override $setEntry(...args: Parameters<MainThreadStatusBarShape['$setEntry']>): void {
				displayedCommand = args[7];
			}
			override $disposeEntry(): void { }
		}, commands.converter, new Map(), nullExtensionDescription, 'test.status'));
	});

	test('replacing a hidden command releases its previous arguments', async () => {
		item.command = { title: 'Old', command: 'test.action', arguments: ['old argument'] };
		item.show();
		await timeout(0);
		const previous = displayedCommand!;
		item.hide();
		item.command = { title: 'New', command: 'test.action', arguments: ['new argument'] };
		assert.strictEqual(commands.converter.fromInternal(previous), undefined);
	});

	test('hiding before a scheduled update releases superseded arguments', async () => {
		item.command = { title: 'Old', command: 'test.action', arguments: ['old argument'] };
		item.show();
		await timeout(0);
		const previous = displayedCommand!;
		item.command = { title: 'New', command: 'test.action', arguments: ['new argument'] };
		item.hide();
		assert.strictEqual(commands.converter.fromInternal(previous), undefined);
	});

	test('visible replacement keeps the previous command until the UI update', async () => {
		const oldCommand = { title: 'Old', command: 'test.action', arguments: ['old argument'] };
		const newCommand = { title: 'New', command: 'test.action', arguments: ['new argument'] };
		item.command = oldCommand;
		item.show();
		await timeout(0);
		const previous = displayedCommand!;
		item.command = newCommand;
		assert.strictEqual(commands.converter.fromInternal(previous), oldCommand);
		await timeout(0);
		assert.deepStrictEqual([
			commands.converter.fromInternal(previous),
			commands.converter.fromInternal(displayedCommand!)
		], [undefined, newCommand]);
	});

	test('showing after hidden replacements preserves the latest arguments', async () => {
		item.command = { title: 'Old', command: 'test.action', arguments: ['old argument'] };
		const latest = { title: 'Latest', command: 'test.action', arguments: ['latest argument'] };
		item.command = latest;
		item.show();
		item.hide();
		item.show();
		await timeout(0);
		assert.strictEqual(commands.converter.fromInternal(displayedCommand!), latest);
	});

	test('disposing a hidden item releases its current arguments', async () => {
		item.command = { title: 'Current', command: 'test.action', arguments: ['current argument'] };
		item.show();
		await timeout(0);
		const current = displayedCommand!;
		item.hide();
		item.dispose();
		assert.strictEqual(commands.converter.fromInternal(current), undefined);
	});
});
