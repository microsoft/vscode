/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
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
	ensureNoDisposablesAreLeakedInTestSuite();

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

	test('active repository name is forwarded to the main thread', () => {
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
	});
});
