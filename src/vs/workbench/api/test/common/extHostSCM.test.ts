/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type * as vscode from 'vscode';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainContext, MainThreadSCMShape, MainThreadTelemetryShape, SCMProviderFeatures } from '../../common/extHost.protocol.js';
import { ArgumentProcessor, ExtHostCommands } from '../../common/extHostCommands.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { ExtHostSCM } from '../../common/extHostSCM.js';
import { TestRPCProtocol } from './testRPCProtocol.js';

suite('ExtHostSCM', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const identifiersEnabled of [false, true]) {
		test(`history identifiers require their own proposal (enabled: ${identifiersEnabled})`, async () => {
			let handle = -1;
			const rpcProtocol = new TestRPCProtocol();
			rpcProtocol.set(MainContext.MainThreadSCM, new class extends mock<MainThreadSCMShape>() {
				override async $registerSourceControl(sourceControlHandle: number): Promise<void> { handle = sourceControlHandle; }
				override async $unregisterSourceControl(): Promise<void> { }
				override async $updateSourceControl(): Promise<void> { }
			});
			rpcProtocol.set(MainContext.MainThreadTelemetry, new class extends mock<MainThreadTelemetryShape>() {
				override $publicLog2(): void { }
			});
			const commands = new class extends mock<ExtHostCommands>() {
				override registerArgumentProcessor(): void { }
			};
			const extHostSCM = new ExtHostSCM(rpcProtocol, commands, {} as ExtHostDocuments, new NullLogService());
			const sourceControl = store.add(extHostSCM.createSourceControl({
				...nullExtensionDescription,
				enabledApiProposals: identifiersEnabled ? ['scmHistoryProvider', 'scmHistoryItemIdentifier'] : ['scmHistoryProvider']
			}, 'test', 'Test', undefined, undefined, undefined, undefined));
			let item: vscode.SourceControlHistoryItem = {
				id: 'snapshot', parentIds: ['parent'], subject: 'Subject', message: 'Message', displayId: 'short',
				identifier: [
					{ text: 'change', color: { id: 'terminal.ansiMagenta' } },
					{ text: '\n\tcommit\u2028', color: { id: 'invalid); color: red' } }
				]
			};
			sourceControl.historyProvider = new class extends mock<vscode.SourceControlHistoryProvider>() {
				override readonly onDidChangeCurrentHistoryItemRefs = Event.None;
				override readonly onDidChangeHistoryItemRefs = Event.None;
				override provideHistoryItems() { return [item]; }
				override resolveHistoryItem() { return item; }
			};
			await rpcProtocol.sync();
			const expected = {
				...item, authorIcon: undefined, references: undefined, tooltip: undefined,
				identifier: identifiersEnabled ? [
					{ text: 'change', color: { id: 'terminal.ansiMagenta' } },
					{ text: '  commit ', color: undefined }
				] : undefined
			};
			assert.deepStrictEqual({
				page: await extHostSCM.$provideHistoryItems(handle, {}, CancellationToken.None),
				resolved: await extHostSCM.$resolveHistoryItem(handle, 'snapshot', CancellationToken.None)
			}, { page: [expected], resolved: expected });

			item = { ...item, identifier: undefined };
			assert.deepStrictEqual(await extHostSCM.$provideHistoryItems(handle, {}, CancellationToken.None), [{ ...expected, identifier: undefined }]);

			// Extensions written in JavaScript can supply malformed parts.
			item = { ...item, identifier: [null, { text: 42 }, { text: '42' }] as unknown as vscode.SourceControlHistoryItemIdentifierPart[] };
			assert.deepStrictEqual(await extHostSCM.$provideHistoryItems(handle, {}, CancellationToken.None), [{
				...expected, identifier: identifiersEnabled ? [{ text: '42', color: undefined }] : undefined
			}]);
		});
	}

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

		const sourceControl = extHostSCM.createSourceControl(extension, 'worktree', 'Git', URI.file('/worktree'), undefined, undefined, undefined);
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
});
