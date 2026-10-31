/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { Event } from '../../../../base/common/event.js';
import { timeout } from '../../../../base/common/async.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Command } from '../../../../editor/common/languages.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ExtHostContext, ExtHostStatusBarShape, ICommandDto, MainThreadCommandsShape, MainThreadStatusBarShape } from '../../common/extHost.protocol.js';
import { MainThreadStatusBar } from '../../browser/mainThreadStatusBar.js';
import { IExtensionStatusBarItemService, StatusBarUpdateKind } from '../../browser/statusBarExtensionPoint.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { ExtHostStatusBarEntry } from '../../common/extHostStatusBar.js';
import { IExtHostTelemetry } from '../../common/extHostTelemetry.js';
import { SingleProxyRPCProtocol, TestRPCProtocol } from '../common/testRPCProtocol.js';

suite('ExtHostStatusBar command lifetime', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let commands: ExtHostCommands;
	let item: ExtHostStatusBarEntry;
	let displayedCommand: ICommandDto | undefined;

	setup(() => {
		commands = new ExtHostCommands(SingleProxyRPCProtocol(new class extends mock<MainThreadCommandsShape>() {
			override $registerCommand(): void { }
			override $unregisterCommand(): void { }
			override async $fireCommandActivationEvent(): Promise<void> { }
		}), new NullLogService(), new class extends mock<IExtHostTelemetry>() { });
		displayedCommand = undefined;
		item = disposables.add(new ExtHostStatusBarEntry(new class extends mock<MainThreadStatusBarShape>() {
			override $setEntry(...args: Parameters<MainThreadStatusBarShape['$setEntry']>): void {
				displayedCommand = args[7];
			}
			override $disposeEntry(): void { }
		}, commands.converter, new Map(), nullExtensionDescription, 'test.status'));
	});

	test('replacing commands that were never published releases their arguments', () => {
		const converted = sinon.spy(commands.converter, 'toInternal');
		try {
			for (let i = 0; i < 37; ++i) {
				item.command = { title: 'Hidden', command: 'test.action', arguments: [i] };
			}
			assert.deepStrictEqual(converted.returnValues.map(command => commands.converter.fromInternal(command!)?.arguments), [
				...Array(36).fill(undefined), [36]
			]);
		} finally {
			converted.restore();
		}
	});

	for (const replaceBeforeHide of [false, true]) {
		test(`queued clicks survive ${replaceBeforeHide ? 'replacement before hide' : 'hide before replacement'}`, async () => {
			disposables.add(commands.registerCommand(false, 'test.action', argument => argument));
			item.command = { title: 'Old', command: 'test.action', arguments: ['old argument'] };
			item.show();
			await timeout(0);
			const previous = displayedCommand!;
			const rpc = disposables.add(new TestRPCProtocol());
			rpc.set(ExtHostContext.ExtHostCommands, commands);
			const pendingClick = rpc.getProxy(ExtHostContext.ExtHostCommands).$executeContributedCommand(previous.id, ...previous.arguments!);

			if (!replaceBeforeHide) {
				item.hide();
			}
			item.command = { title: 'New', command: 'test.action', arguments: ['new argument'] };
			if (replaceBeforeHide) {
				item.hide();
			}

			assert.strictEqual(await pendingClick, 'old argument');
			item.show();
			await timeout(0);
			assert.deepStrictEqual([
				commands.converter.fromInternal(previous),
				commands.converter.fromInternal(displayedCommand!)?.arguments
			], [undefined, ['new argument']]);
		});
	}

	for (const replaceBeforeHide of [false, true]) {
		test(`a contributed item keeps its published command after ${replaceBeforeHide ? 'replacement before hide' : 'hide before replacement'}`, async () => {
			let rendererCommand: Command | undefined;
			let wasUnset = false;
			const mainThread = disposables.add(new MainThreadStatusBar(SingleProxyRPCProtocol(new class extends mock<ExtHostStatusBarShape>() {
				override $acceptStaticEntries(): void { }
			}), new class extends mock<IExtensionStatusBarItemService>() {
				override readonly onDidChange = Event.None;
				override getEntries() { return []; }
				override setOrUpdateEntry(...args: Parameters<IExtensionStatusBarItemService['setOrUpdateEntry']>) {
					rendererCommand = args[6];
					return StatusBarUpdateKind.DidUpdate;
				}
				override unsetEntry() { wasUnset = true; }
			}));
			const staticItems = new Map([[item.entryId, { entryId: item.entryId, name: 'Static', text: 'Static', priority: 0, alignLeft: true }]]);
			const contributedItem = disposables.add(new ExtHostStatusBarEntry(mainThread, commands.converter, staticItems, nullExtensionDescription, 'test.status'));
			disposables.add(commands.registerCommand(false, 'test.action', argument => argument));
			contributedItem.command = { title: 'Old', command: 'test.action', arguments: ['old argument'] };
			await timeout(0);
			assert.ok(rendererCommand);

			if (!replaceBeforeHide) {
				contributedItem.hide();
			}
			contributedItem.command = { title: 'New', command: 'test.action', arguments: ['new argument'] };
			if (replaceBeforeHide) {
				contributedItem.hide();
			}
			// DidUpdate entries remain in the renderer even after the extension host hides them.
			await timeout(0);
			assert.deepStrictEqual([
				wasUnset,
				await commands.$executeContributedCommand(rendererCommand.id, ...rendererCommand.arguments!)
			], [false, 'old argument']);
		});
	}

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

	test('hidden replacements retain only the published and current arguments', async () => {
		const converted = sinon.spy(commands.converter, 'toInternal');
		try {
			item.command = { title: 'Published', command: 'test.action', arguments: ['published'] };
			item.show();
			await timeout(0);
			item.hide();
			for (let i = 0; i < 37; ++i) {
				item.command = { title: 'Hidden', command: 'test.action', arguments: [i] };
			}
			assert.deepStrictEqual(converted.returnValues.map(command => commands.converter.fromInternal(command!)?.arguments), [
				['published'], ...Array(36).fill(undefined), [36]
			]);
			item.dispose();
			assert.ok(converted.returnValues.every(command => !commands.converter.fromInternal(command!)));
		} finally {
			converted.restore();
		}
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
