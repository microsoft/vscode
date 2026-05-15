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
import { MainContext, MainThreadSCMShape, MainThreadTelemetryShape } from '../../common/extHost.protocol.js';
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
});
