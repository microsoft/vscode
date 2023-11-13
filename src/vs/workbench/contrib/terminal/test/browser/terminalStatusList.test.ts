/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { Codicon } from 'vs/base/common/codicons';
import Severity from 'vs/base/common/severity';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { spinningLoading } from 'vs/platform/theme/common/iconRegistry';
import { ThemeIcon } from 'vs/base/common/themables';
import { TerminalStatusList } from 'vs/workbench/contrib/terminal/browser/terminalStatusList';
import { ITerminalStatus } from 'vs/workbench/contrib/terminal/common/terminal';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { DisposableStore } from 'vs/base/common/lifecycle';

function statusesEqual(list: TerminalStatusList, expected: [string, Severity][]) {
	deepStrictEqual(list.statuses.map(e => [e.id, e.severity]), expected);
}

suite('Workbench - TerminalStatusList', () => {
	let store: DisposableStore;
	let list: TerminalStatusList;
	let configService: TestConfigurationService;

	setup(() => {
		store = new DisposableStore();
		configService = new TestConfigurationService();
		list = store.add(new TerminalStatusList(configService));
	});

	teardown(() => store.dispose());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('primary', () => {
		strictEqual(list.primary?.id, undefined);
		list.add({ id: 'info1', severity: Severity.Info });
		strictEqual(list.primary?.id, 'info1');
		list.add({ id: 'warning1', severity: Severity.Warning });
		strictEqual(list.primary?.id, 'warning1');
		list.add({ id: 'info2', severity: Severity.Info });
		strictEqual(list.primary?.id, 'warning1');
		list.add({ id: 'warning2', severity: Severity.Warning });
		strictEqual(list.primary?.id, 'warning2');
		list.add({ id: 'info3', severity: Severity.Info });
		strictEqual(list.primary?.id, 'warning2');
		list.add({ id: 'error1', severity: Severity.Error });
		strictEqual(list.primary?.id, 'error1');
		list.add({ id: 'warning3', severity: Severity.Warning });
		strictEqual(list.primary?.id, 'error1');
		list.add({ id: 'error2', severity: Severity.Error });
		strictEqual(list.primary?.id, 'error2');
		list.remove('error1');
		strictEqual(list.primary?.id, 'error2');
		list.remove('error2');
		strictEqual(list.primary?.id, 'warning3');
	});

	test('statuses', () => {
		strictEqual(list.statuses.length, 0);
		list.add({ id: 'info', severity: Severity.Info });
		list.add({ id: 'warning', severity: Severity.Warning });
		list.add({ id: 'error', severity: Severity.Error });
		strictEqual(list.statuses.length, 3);
		statusesEqual(list, [
			['info', Severity.Info],
			['warning', Severity.Warning],
			['error', Severity.Error],
		]);
		list.remove('info');
		list.remove('warning');
		list.remove('error');
		strictEqual(list.statuses.length, 0);
	});

	test('onDidAddStatus', async () => {
		const result = await new Promise<ITerminalStatus>(r => {
			store.add(list.onDidAddStatus(r));
			list.add({ id: 'test', severity: Severity.Info });
		});
		deepStrictEqual(result, { id: 'test', severity: Severity.Info });
	});

	test('onDidRemoveStatus', async () => {
		const result = await new Promise<ITerminalStatus>(r => {
			store.add(list.onDidRemoveStatus(r));
			list.add({ id: 'test', severity: Severity.Info });
			list.remove('test');
		});
		deepStrictEqual(result, { id: 'test', severity: Severity.Info });
	});

	test('onDidChangePrimaryStatus', async () => {
		const result = await new Promise<ITerminalStatus | undefined>(r => {
			store.add(list.onDidChangePrimaryStatus(r));
			list.add({ id: 'test', severity: Severity.Info });
		});
		deepStrictEqual(result, { id: 'test', severity: Severity.Info });
	});

	test('primary is not updated to status without an icon', async () => {
		list.add({ id: 'test', severity: Severity.Info, icon: Codicon.check });
		list.add({ id: 'warning', severity: Severity.Warning });
		deepStrictEqual(list.primary, { id: 'test', severity: Severity.Info, icon: Codicon.check });
	});

	test('add', () => {
		statusesEqual(list, []);
		list.add({ id: 'info', severity: Severity.Info });
		statusesEqual(list, [
			['info', Severity.Info]
		]);
		list.add({ id: 'warning', severity: Severity.Warning });
		statusesEqual(list, [
			['info', Severity.Info],
			['warning', Severity.Warning]
		]);
		list.add({ id: 'error', severity: Severity.Error });
		statusesEqual(list, [
			['info', Severity.Info],
			['warning', Severity.Warning],
			['error', Severity.Error]
		]);
	});

	test('add should remove animation', () => {
		statusesEqual(list, []);
		list.add({ id: 'info', severity: Severity.Info, icon: spinningLoading });
		statusesEqual(list, [
			['info', Severity.Info]
		]);
		strictEqual(list.statuses[0].icon!.id, Codicon.play.id, 'loading~spin should be converted to play');
		list.add({ id: 'warning', severity: Severity.Warning, icon: ThemeIcon.modify(Codicon.zap, 'spin') });
		statusesEqual(list, [
			['info', Severity.Info],
			['warning', Severity.Warning]
		]);
		strictEqual(list.statuses[1].icon!.id, Codicon.zap.id, 'zap~spin should have animation removed only');
	});

	test('add should fire onDidRemoveStatus if same status id with a different object reference was added', () => {
		const eventCalls: string[] = [];
		store.add(list.onDidAddStatus(() => eventCalls.push('add')));
		store.add(list.onDidRemoveStatus(() => eventCalls.push('remove')));
		list.add({ id: 'test', severity: Severity.Info });
		list.add({ id: 'test', severity: Severity.Info });
		deepStrictEqual(eventCalls, [
			'add',
			'remove',
			'add'
		]);
	});

	test('remove', () => {
		list.add({ id: 'info', severity: Severity.Info });
		list.add({ id: 'warning', severity: Severity.Warning });
		list.add({ id: 'error', severity: Severity.Error });
		statusesEqual(list, [
			['info', Severity.Info],
			['warning', Severity.Warning],
			['error', Severity.Error]
		]);
		list.remove('warning');
		statusesEqual(list, [
			['info', Severity.Info],
			['error', Severity.Error]
		]);
		list.remove('info');
		statusesEqual(list, [
			['error', Severity.Error]
		]);
		list.remove('error');
		statusesEqual(list, []);
	});

	test('toggle', () => {
		const status = { id: 'info', severity: Severity.Info };
		list.toggle(status, true);
		statusesEqual(list, [
			['info', Severity.Info]
		]);
		list.toggle(status, false);
		statusesEqual(list, []);
	});
});
