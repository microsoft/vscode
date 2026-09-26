/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainContext, MainThreadCommandsShape, MainThreadSCMShape, MainThreadTelemetryShape } from '../../common/extHost.protocol.js';
import { ArgumentProcessor, ExtHostCommands } from '../../common/extHostCommands.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { ExtHostSCM } from '../../common/extHostSCM.js';
import { TestRPCProtocol } from './testRPCProtocol.js';

suite('ExtHostSCM', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function createArtifactSourceControl(provider: vscode.SourceControlArtifactProvider) {
		const rpc = new TestRPCProtocol();
		let handle = -1;
		rpc.set(MainContext.MainThreadSCM, new class extends mock<MainThreadSCMShape>() {
			override async $registerSourceControl(value: number): Promise<void> { handle = value; }
			override async $unregisterSourceControl(): Promise<void> { }
			override async $updateSourceControl(): Promise<void> { }
		});
		rpc.set(MainContext.MainThreadTelemetry, new class extends mock<MainThreadTelemetryShape>() {
			override $publicLog2(): void { }
		});
		rpc.set(MainContext.MainThreadCommands, new class extends mock<MainThreadCommandsShape>() {
			override async $registerCommand(): Promise<void> { }
		});
		const log = store.add(new NullLogService());
		const commands = new ExtHostCommands(rpc, log, undefined!);
		const scm = new ExtHostSCM(rpc, commands, {} as ExtHostDocuments, log);
		const sourceControl = store.add(scm.createSourceControl({
			...nullExtensionDescription, enabledApiProposals: ['scmArtifactProvider']
		}, 'test', 'Test', undefined, undefined, undefined, undefined));
		sourceControl.artifactProvider = provider;
		await rpc.sync();
		assert.notStrictEqual(handle, -1);
		return { sourceControl, scm, commands, handle, rpc };
	}

	function artifactProvider(provideArtifacts: vscode.SourceControlArtifactProvider['provideArtifacts']): vscode.SourceControlArtifactProvider {
		return { onDidChangeArtifacts: Event.None, provideArtifactGroups: () => [], provideArtifacts };
	}

	function artifacts(id: string): vscode.SourceControlArtifact[] {
		return [{ id, name: id, command: { command: 'test.artifact', title: 'Open', arguments: [{ id }] } }];
	}

	test('does not cache artifact commands returned after source control disposal', async () => {
		const result = new DeferredPromise<vscode.SourceControlArtifact[]>();
		const { sourceControl, scm, commands, handle } = await createArtifactSourceControl(artifactProvider(() => result.p));
		const pending = scm.$provideArtifacts(handle, 'group', CancellationToken.None);
		sourceControl.dispose();
		await result.complete(artifacts('retired'));
		try {
			assert.strictEqual(await pending, undefined);
			assert.strictEqual(commands.converter.getActualCommand('test.artifact /1'), undefined);
		} finally {
			// Also clean up late stores on the unfixed implementation during the red run.
			sourceControl.dispose();
		}
	});

	test('does not replace live artifact commands with a retired provider result', async () => {
		const result = new DeferredPromise<vscode.SourceControlArtifact[]>();
		const { sourceControl, scm, commands, handle } = await createArtifactSourceControl(artifactProvider(() => result.p));
		const pending = scm.$provideArtifacts(handle, 'group', CancellationToken.None);
		const current = artifacts('current');
		sourceControl.artifactProvider = artifactProvider(() => current);
		const liveResult = await scm.$provideArtifacts(handle, 'group', CancellationToken.None);
		await result.complete(artifacts('retired'));
		assert.strictEqual(await pending, undefined);
		assert.ok(liveResult?.[0].command);
		assert.strictEqual(commands.converter.fromInternal(liveResult[0].command), current[0].command);
	});

	test('does not cache artifact commands after request cancellation', async () => {
		const result = new DeferredPromise<vscode.SourceControlArtifact[]>();
		const { scm, commands, handle } = await createArtifactSourceControl(artifactProvider(() => result.p));
		const cts = store.add(new CancellationTokenSource());
		const pending = scm.$provideArtifacts(handle, 'group', cts.token);
		cts.cancel();
		await result.complete(artifacts('cancelled'));
		assert.strictEqual(await pending, undefined);
		assert.strictEqual(commands.converter.getActualCommand('test.artifact /1'), undefined);
	});

	test('does not allocate an orphan command store when artifact requests reject', async () => {
		const expected = new Error('Expected artifact provider rejection');
		const { scm, handle } = await createArtifactSourceControl(artifactProvider(() => Promise.reject(expected)));
		await assert.rejects(scm.$provideArtifacts(handle, 'group', CancellationToken.None), error => error === expected);
	});

	test('releases replaced artifact commands and retains commands from other groups', async () => {
		let current = artifacts('first');
		const { sourceControl, scm, commands, handle } = await createArtifactSourceControl(artifactProvider(() => current));
		const first = await scm.$provideArtifacts(handle, 'first', CancellationToken.None);
		const second = await scm.$provideArtifacts(handle, 'second', CancellationToken.None);
		assert.ok(first?.[0].command);
		assert.ok(second?.[0].command);
		current = artifacts('replacement');
		const replacement = await scm.$provideArtifacts(handle, 'first', CancellationToken.None);
		assert.ok(replacement?.[0].command);
		assert.strictEqual(commands.converter.fromInternal(first[0].command), undefined);
		assert.ok(commands.converter.fromInternal(second[0].command));
		assert.strictEqual(commands.converter.fromInternal(replacement[0].command), current[0].command);
		sourceControl.dispose();
		assert.strictEqual(commands.converter.fromInternal(second[0].command), undefined);
		assert.strictEqual(commands.converter.fromInternal(replacement[0].command), undefined);
	});

	test('disposed source controls are removed from extension bookkeeping', () => {
		const rpcProtocol = new TestRPCProtocol();
		rpcProtocol.set(MainContext.MainThreadSCM, new class extends mock<MainThreadSCMShape>() {
			override async $registerSourceControl(): Promise<void> { }
			override async $unregisterSourceControl(): Promise<void> { }
		});
		rpcProtocol.set(MainContext.MainThreadTelemetry, new class extends mock<MainThreadTelemetryShape>() {
			override $publicLog2(): void { }
		});

		const commands = new class extends mock<ExtHostCommands>() {
			override registerArgumentProcessor(_processor: ArgumentProcessor): void { }
		};
		const extension = {
			...nullExtensionDescription,
			identifier: new ExtensionIdentifier('vscode.git'),
			name: 'git',
			displayName: 'Git',
			extensionLocation: URI.file('/extension'),
			isBuiltin: true
		};

		const extHostSCM = new ExtHostSCM(
			rpcProtocol,
			commands,
			{} as ExtHostDocuments,
			new NullLogService()
		);

		const sourceControl = extHostSCM.createSourceControl(extension, 'git', 'Git', URI.file('/repo'), undefined, undefined, undefined);
		assert.ok(extHostSCM.getLastInputBox(extension));

		sourceControl.dispose();

		assert.strictEqual(extHostSCM.getLastInputBox(extension), undefined);
	});
});
