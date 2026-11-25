/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainContext, MainThreadCommandsShape, MainThreadSCMShape, MainThreadTelemetryShape, SCMGroupFeatures, SCMProviderFeatures, SCMRawResourceSplices } from '../../common/extHost.protocol.js';
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
		}, 'test', 'Test', undefined, undefined, undefined));
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
		// Also clean up late stores on the unfixed implementation during the red run.
		store.add(toDisposable(() => sourceControl.dispose()));
		assert.strictEqual(await pending, undefined);
		assert.strictEqual(commands.converter.getActualCommand('test.artifact /1'), undefined);
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

		const sourceControl = extHostSCM.createSourceControl(extension, 'git', 'Git', URI.file('/repo'), undefined, undefined);
		assert.ok(extHostSCM.getLastInputBox(extension));

		sourceControl.dispose();

		assert.strictEqual(extHostSCM.getLastInputBox(extension), undefined);
	});

	test('active repository name is forwarded to the main thread', async () => {
		const registrations: number[] = [];
		const updates: { handle: number; features: SCMProviderFeatures }[] = [];
		const rpcProtocol = new TestRPCProtocol();
		rpcProtocol.set(MainContext.MainThreadSCM, new class extends mock<MainThreadSCMShape>() {
			override async $registerSourceControl(handle: number): Promise<void> {
				registrations.push(handle);
			}
			override async $updateSourceControl(handle: number, features: SCMProviderFeatures): Promise<void> {
				updates.push({ handle, features });
			}
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
			isBuiltin: true,
			enabledApiProposals: ['scmProviderOptions']
		};

		const extHostSCM = new ExtHostSCM(
			rpcProtocol,
			commands,
			{} as ExtHostDocuments,
			new NullLogService()
		);

		const sourceControl = extHostSCM.createSourceControl(extension, 'worktree', 'Git', URI.file('/worktree'), undefined, undefined);
		sourceControl.activeRepositoryName = 'repo';
		sourceControl.activeRepositoryName = 'repo';
		sourceControl.activeRepositoryName = undefined;
		await rpcProtocol.sync();

		assert.deepStrictEqual({
			activeRepositoryName: sourceControl.activeRepositoryName,
			updates: updates.map(update => ({
				sourceControl: registrations.indexOf(update.handle),
				activeRepositoryName: update.features.activeRepositoryName
			}))
		}, {
			activeRepositoryName: undefined,
			updates: [
				{ sourceControl: 0, activeRepositoryName: 'repo' },
				{ sourceControl: 0, activeRepositoryName: null }
			]
		});

		sourceControl.dispose();
		await rpcProtocol.sync();
	});

	test('a disposed source control is unregistered without unregistering its resource groups one by one first', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const calls: string[] = [];
		const rpcProtocol = new TestRPCProtocol();
		rpcProtocol.set(MainContext.MainThreadSCM, new class extends mock<MainThreadSCMShape>() {
			override async $registerSourceControl(): Promise<void> { }
			override async $registerGroups(): Promise<void> { }
			override async $unregisterGroup(): Promise<void> { calls.push('unregister group'); }
			override async $unregisterSourceControl(): Promise<void> { calls.push('unregister source control'); }
		});
		rpcProtocol.set(MainContext.MainThreadTelemetry, new class extends mock<MainThreadTelemetryShape>() {
			override $publicLog2(): void { }
		});

		const commands = new class extends mock<ExtHostCommands>() {
			override registerArgumentProcessor(_processor: ArgumentProcessor): void { }
		};
		const extHostSCM = new ExtHostSCM(rpcProtocol, commands, {} as ExtHostDocuments, new NullLogService());

		const sourceControl = extHostSCM.createSourceControl(nullExtensionDescription, 'git', 'Git', URI.file('/repo'), undefined, undefined);
		const removed = sourceControl.createResourceGroup('removed', 'Removed');
		sourceControl.createResourceGroup('kept', 'Kept');
		await timeout(200);

		removed.dispose();
		sourceControl.dispose();
		await rpcProtocol.sync();

		assert.deepStrictEqual(calls, ['unregister group', 'unregister source control']);
	}));

	test('resource groups created with resource states are added at once, and the resource states that groups get in their first 100 ms follow at the end of those 100 ms', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const calls: string[] = [];
		const groupIds = new Map<number, string>();
		const describeStates = (splices: SCMRawResourceSplices[]) => splices.map(([handle, groupSplices]) => `${groupIds.get(handle)}: ${groupSplices.reduce((count, [, , resources]) => count + resources.length, 0)}`).join(', ');
		const rpcProtocol = new TestRPCProtocol();
		rpcProtocol.set(MainContext.MainThreadSCM, new class extends mock<MainThreadSCMShape>() {
			override async $registerSourceControl(): Promise<void> { }
			override async $registerGroups(_handle: number, groups: [number, string, string, SCMGroupFeatures, boolean][], splices: SCMRawResourceSplices[]): Promise<void> {
				groups.forEach(([handle, id]) => groupIds.set(handle, id));
				calls.push(`${Date.now()} ms: add ${groups.map(([, id]) => id).join(', ')} with ${describeStates(splices)}`);
			}
			override async $spliceResourceStates(_handle: number, splices: SCMRawResourceSplices[]): Promise<void> {
				calls.push(`${Date.now()} ms: splice ${describeStates(splices)}`);
			}
			override async $unregisterSourceControl(): Promise<void> { }
		});
		rpcProtocol.set(MainContext.MainThreadTelemetry, new class extends mock<MainThreadTelemetryShape>() {
			override $publicLog2(): void { }
		});

		const commands = new class extends mock<ExtHostCommands>() {
			override registerArgumentProcessor(_processor: ArgumentProcessor): void { }
		};
		const extHostSCM = new ExtHostSCM(rpcProtocol, commands, {} as ExtHostDocuments, new NullLogService());

		// A source control shown again from a known state, and one opened before its first status
		const shown = extHostSCM.createSourceControl(nullExtensionDescription, 'git', 'Git', URI.file('/shown'), undefined, undefined);
		const known = shown.createResourceGroup('known', 'Known');
		const refreshed = shown.createResourceGroup('refreshed', 'Refreshed');
		known.resourceStates = [{ resourceUri: URI.file('/shown/a.txt') }];
		const opened = extHostSCM.createSourceControl(nullExtensionDescription, 'git', 'Git', URI.file('/opened'), undefined, undefined);
		const empty = opened.createResourceGroup('empty', 'Empty');
		// A group created with resource states after the check of an empty group of the same source control has run
		const extended = extHostSCM.createSourceControl(nullExtensionDescription, 'git', 'Git', URI.file('/extended'), undefined, undefined);
		extended.createResourceGroup('first', 'First');
		await Promise.resolve();
		extended.createResourceGroup('second', 'Second').resourceStates = [{ resourceUri: URI.file('/extended/d.txt') }];
		await timeout(50);
		refreshed.resourceStates = [{ resourceUri: URI.file('/shown/b.txt') }];
		empty.resourceStates = [{ resourceUri: URI.file('/opened/c.txt') }];
		await timeout(200);

		assert.deepStrictEqual(calls, [
			'0 ms: add known, refreshed with known: 1',
			'0 ms: add first, second with second: 1',
			'100 ms: splice refreshed: 1',
			'100 ms: add empty with empty: 1'
		]);

		shown.dispose();
		opened.dispose();
		extended.dispose();
		await rpcProtocol.sync();
	}));
});
