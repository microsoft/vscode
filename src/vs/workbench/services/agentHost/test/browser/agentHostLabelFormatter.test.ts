/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AGENT_HOST_LABEL_FORMATTER, agentHostLabelFormatter, LOCAL_AGENT_HOST_AUTHORITY, toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { LabelService } from '../../../label/common/labelService.js';
import { TestEnvironmentService, TestLifecycleService, TestPathService, TestRemoteAgentService } from '../../../../test/browser/workbenchTestServices.js';
import { TestContextService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';

suite('AgentHost label formatter', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createLabelService(): LabelService {
		const labelService = disposables.add(new LabelService(
			TestEnvironmentService,
			new TestContextService(),
			new TestPathService(URI.file('/Users/test')),
			new TestRemoteAgentService(),
			disposables.add(new TestStorageService()),
			disposables.add(new TestLifecycleService())
		));
		disposables.add(labelService.registerFormatter(AGENT_HOST_LABEL_FORMATTER));
		return labelService;
	}

	test('a Windows host renders paths natively, so they match the `file:` side of a diff', () => {
		const labelService = createLabelService();
		disposables.add(labelService.registerFormatter(agentHostLabelFormatter(LOCAL_AGENT_HOST_AUTHORITY, OperatingSystem.Windows)));

		// Agent host URIs carry a lower-cased drive letter because they
		// round-trip through `URI.toString()` on the way to the client
		const wrapped = toAgentHostUri(URI.from({ scheme: 'session-db', path: '/c:/Code/repo/src/app.ts' }), LOCAL_AGENT_HOST_AUTHORITY);

		assert.strictEqual(labelService.getUriLabel(wrapped), 'C:\\Code\\repo\\src\\app.ts');
	});

	test('a POSIX host renders paths natively', () => {
		const labelService = createLabelService();
		disposables.add(labelService.registerFormatter(agentHostLabelFormatter(LOCAL_AGENT_HOST_AUTHORITY, OperatingSystem.Linux)));

		const wrapped = toAgentHostUri(URI.from({ scheme: 'session-db', path: '/home/user/repo/src/app.ts' }), LOCAL_AGENT_HOST_AUTHORITY);

		assert.strictEqual(labelService.getUriLabel(wrapped), '/home/user/repo/src/app.ts');
	});

	test('a host of unknown operating system renders the path losslessly', () => {
		const labelService = createLabelService();

		// `/c:/…` is a valid POSIX path too, so without knowing the host's
		// operating system neither form may be rewritten
		const windowsUri = toAgentHostUri(URI.from({ scheme: 'session-db', path: '/c:/Code/repo/src/app.ts' }), 'remotehost');
		const posixUri = toAgentHostUri(URI.from({ scheme: 'session-db', path: '/home/user/repo/src/app.ts' }), 'remotehost');

		assert.deepStrictEqual({
			windows: labelService.getUriLabel(windowsUri),
			posix: labelService.getUriLabel(posixUri),
		}, {
			windows: '/c:/Code/repo/src/app.ts',
			posix: '/home/user/repo/src/app.ts',
		});
	});
});
