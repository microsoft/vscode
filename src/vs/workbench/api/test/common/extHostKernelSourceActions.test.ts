/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { INotebookKernelSourceAction } from '../../../contrib/notebook/common/notebookCommon.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainThreadNotebookKernelsShape } from '../../common/extHost.protocol.js';
import { CommandsConverter, ExtHostCommands } from '../../common/extHostCommands.js';
import { IExtHostInitDataService } from '../../common/extHostInitDataService.js';
import { ExtHostNotebookController } from '../../common/extHostNotebook.js';
import { ExtHostNotebookKernels } from '../../common/extHostNotebookKernels.js';
import { Disposable } from '../../common/extHostTypes.js';
import { SingleProxyRPCProtocol } from './testRPCProtocol.js';

suite('Extension host kernel source action commands', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let service: ExtHostNotebookKernels;
	let converter: CommandsConverter;
	let handle: number;

	setup(() => {
		const commands = new class extends mock<ExtHostCommands>() {
			override readonly converter = new CommandsConverter(this, () => undefined, new NullLogService());
			override registerCommand(): Disposable { return store.add(new Disposable(() => { })); }
			override registerApiCommand(): Disposable { return this.registerCommand(); }
		};
		converter = commands.converter;
		service = new ExtHostNotebookKernels(SingleProxyRPCProtocol(new class extends mock<MainThreadNotebookKernelsShape>() {
			override async $addKernelSourceActionProvider(value: number): Promise<void> { handle = value; }
			override $removeKernelSourceActionProvider(): void { }
		}), new class extends mock<IExtHostInitDataService>() { }, new class extends mock<ExtHostNotebookController>() { }, commands, new NullLogService());
	});

	function action(label: string): vscode.NotebookKernelSourceAction {
		return { label, command: { title: label, command: 'test.kernel', arguments: [{ label }] } };
	}

	function resolve(action: INotebookKernelSourceAction): vscode.Command | undefined {
		assert.ok(action.command && typeof action.command !== 'string');
		return converter.fromInternal(action.command);
	}

	test('releases previous commands when replacement actions arrive', async () => {
		let next = action('first');
		store.add(service.registerKernelSourceActionProvider(nullExtensionDescription, 'test', { provideNotebookKernelSourceActions: () => [next] }));
		const first = await service.$provideKernelSourceActions(handle, CancellationToken.None);
		next = action('second');
		const second = await service.$provideKernelSourceActions(handle, CancellationToken.None);
		assert.deepStrictEqual([resolve(first[0]), resolve(second[0])], [undefined, next.command]);
	});

	test('preserves current commands while a refresh is pending', async () => {
		const current = action('current');
		let next: vscode.NotebookKernelSourceAction[] | Promise<vscode.NotebookKernelSourceAction[]> = [current];
		store.add(service.registerKernelSourceActionProvider(nullExtensionDescription, 'test', { provideNotebookKernelSourceActions: () => next }));
		const first = await service.$provideKernelSourceActions(handle, CancellationToken.None);
		const pending = new DeferredPromise<vscode.NotebookKernelSourceAction[]>();
		next = pending.p;
		const request = service.$provideKernelSourceActions(handle, CancellationToken.None);
		assert.strictEqual(resolve(first[0]), current.command);
		await pending.complete([]);
		await request;
		assert.strictEqual(resolve(first[0]), undefined);
	});

	test('releases commands when the provider is unregistered', async () => {
		const registration = store.add(service.registerKernelSourceActionProvider(nullExtensionDescription, 'test', { provideNotebookKernelSourceActions: () => [action('current')] }));
		const actions = await service.$provideKernelSourceActions(handle, CancellationToken.None);
		registration.dispose();
		assert.strictEqual(resolve(actions[0]), undefined);
	});

	test('ignores results arriving after provider disposal', async () => {
		const pending = new DeferredPromise<vscode.NotebookKernelSourceAction[]>();
		const registration = store.add(service.registerKernelSourceActionProvider(nullExtensionDescription, 'test', { provideNotebookKernelSourceActions: () => pending.p }));
		const request = service.$provideKernelSourceActions(handle, CancellationToken.None);
		registration.dispose();
		await pending.complete([action('late')]);
		assert.deepStrictEqual(await request, []);
	});

	test('ignores an older response after a newer request completes', async () => {
		const pending = new DeferredPromise<vscode.NotebookKernelSourceAction[]>();
		let next: vscode.NotebookKernelSourceAction[] | Promise<vscode.NotebookKernelSourceAction[]> = pending.p;
		store.add(service.registerKernelSourceActionProvider(nullExtensionDescription, 'test', { provideNotebookKernelSourceActions: () => next }));
		const older = service.$provideKernelSourceActions(handle, CancellationToken.None);
		const latest = action('latest');
		next = [latest];
		const actions = await service.$provideKernelSourceActions(handle, CancellationToken.None);
		await pending.complete([action('old')]);
		assert.deepStrictEqual([await older, resolve(actions[0])], [[], latest.command]);
	});

	test('does not replace current commands with a canceled response', async () => {
		const current = action('current');
		let next: vscode.NotebookKernelSourceAction[] | Promise<vscode.NotebookKernelSourceAction[]> = [current];
		store.add(service.registerKernelSourceActionProvider(nullExtensionDescription, 'test', { provideNotebookKernelSourceActions: () => next }));
		const actions = await service.$provideKernelSourceActions(handle, CancellationToken.None);
		const pending = new DeferredPromise<vscode.NotebookKernelSourceAction[]>();
		next = pending.p;
		const token = store.add(new CancellationTokenSource());
		const request = service.$provideKernelSourceActions(handle, token.token);
		token.cancel();
		await pending.complete([action('canceled')]);
		assert.deepStrictEqual([await request, resolve(actions[0])], [[], current.command]);
	});
});
