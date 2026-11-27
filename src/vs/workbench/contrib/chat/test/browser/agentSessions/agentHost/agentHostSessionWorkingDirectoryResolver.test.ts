/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { AgentHostSessionWorkingDirectoryResolver } from '../../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';

suite('AgentHostSessionWorkingDirectoryResolver', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves working directory for single resolver', () => {
		const resolver = new AgentHostSessionWorkingDirectoryResolver();
		const sessionUri = URI.parse('agent-host-copilotcli:/session-1');
		const dir = URI.file('/workspace/project');

		disposables.add(resolver.registerResolver('agent-host-copilotcli', () => dir, () => true));

		assert.strictEqual(resolver.resolve(sessionUri)?.toString(), dir.toString());
		assert.strictEqual(resolver.resolveRequested(sessionUri)?.toString(), dir.toString());
		assert.strictEqual(resolver.isNewSession(sessionUri), true);
	});

	test('supports multiple resolvers for the same session type and cascades undefined', () => {
		const resolver = new AgentHostSessionWorkingDirectoryResolver();
		const sessionUri = URI.parse('agent-host-copilotcli:/session-1');
		const dir = URI.file('/workspace/project');

		// First resolver provides working directory and reports new session
		disposables.add(resolver.registerResolver('agent-host-copilotcli', () => dir, () => true));
		// Second resolver (e.g. session list contribution) returns undefined directory and false for isNewSession
		disposables.add(resolver.registerResolver('agent-host-copilotcli', () => undefined, () => false));

		assert.strictEqual(resolver.resolve(sessionUri)?.toString(), dir.toString());
		assert.strictEqual(resolver.resolveRequested(sessionUri)?.toString(), dir.toString());
		assert.strictEqual(resolver.isNewSession(sessionUri), true);
	});

	test('reports isNewSession true if any registered resolver reports true', () => {
		const resolver = new AgentHostSessionWorkingDirectoryResolver();
		const sessionUri = URI.parse('agent-host-copilotcli:/session-1');

		// Controller says false (not in pending new session list store)
		disposables.add(resolver.registerResolver('agent-host-copilotcli', () => undefined, () => false));
		// Provider says true (session status is Untitled)
		disposables.add(resolver.registerResolver('agent-host-copilotcli', () => undefined, () => true));

		assert.strictEqual(resolver.isNewSession(sessionUri), true);
	});

	test('reports isNewSession false if all registered resolvers report false', () => {
		const resolver = new AgentHostSessionWorkingDirectoryResolver();
		const sessionUri = URI.parse('agent-host-copilotcli:/session-1');

		disposables.add(resolver.registerResolver('agent-host-copilotcli', () => undefined, () => false));
		disposables.add(resolver.registerResolver('agent-host-copilotcli', () => undefined, () => false));

		assert.strictEqual(resolver.isNewSession(sessionUri), false);
	});

	test('cascades through undefined to find working directory URI from secondary resolver', () => {
		const resolver = new AgentHostSessionWorkingDirectoryResolver();
		const sessionUri = URI.parse('agent-host-copilotcli:/session-1');
		const dir = URI.file('/workspace/secondary');

		// First resolver returns undefined
		disposables.add(resolver.registerResolver('agent-host-copilotcli', () => undefined));
		// Second resolver returns URI
		disposables.add(resolver.registerResolver('agent-host-copilotcli', () => dir));

		assert.strictEqual(resolver.resolve(sessionUri)?.toString(), dir.toString());
		assert.strictEqual(resolver.resolveRequested(sessionUri)?.toString(), dir.toString());
	});

	test('preserves explicit null when no resolver returns a URI', () => {
		const resolver = new AgentHostSessionWorkingDirectoryResolver();
		const sessionUri = URI.parse('agent-host-remote:/session-1');

		// Undefined from provider (no folder in remote session)
		disposables.add(resolver.registerResolver('agent-host-remote', () => undefined));
		// Null from remote chat contribution (let host choose directory)
		disposables.add(resolver.registerResolver('agent-host-remote', () => null));

		assert.strictEqual(resolver.resolve(sessionUri), undefined);
		assert.strictEqual(resolver.resolveRequested(sessionUri), null);
	});

	test('concrete URI takes precedence over explicit null', () => {
		const resolver = new AgentHostSessionWorkingDirectoryResolver();
		const sessionUri = URI.parse('agent-host-remote:/session-1');
		const dir = URI.file('/remote/workspace');

		// First returns null
		disposables.add(resolver.registerResolver('agent-host-remote', () => null));
		// Second has concrete workspace folder
		disposables.add(resolver.registerResolver('agent-host-remote', () => dir));

		assert.strictEqual(resolver.resolve(sessionUri)?.toString(), dir.toString());
		assert.strictEqual(resolver.resolveRequested(sessionUri)?.toString(), dir.toString());
	});

	test('unregisters resolver on dispose', () => {
		const resolver = new AgentHostSessionWorkingDirectoryResolver();
		const sessionUri = URI.parse('agent-host-copilotcli:/session-1');
		const dir1 = URI.file('/workspace/1');
		const dir2 = URI.file('/workspace/2');

		const reg1 = resolver.registerResolver('agent-host-copilotcli', () => dir1, () => true);
		const reg2 = resolver.registerResolver('agent-host-copilotcli', () => dir2, () => false);

		assert.strictEqual(resolver.resolve(sessionUri)?.toString(), dir1.toString());

		reg1.dispose();

		assert.strictEqual(resolver.resolve(sessionUri)?.toString(), dir2.toString());
		assert.strictEqual(resolver.isNewSession(sessionUri), false);

		reg2.dispose();

		assert.strictEqual(resolver.resolve(sessionUri), undefined);
		assert.strictEqual(resolver.resolveRequested(sessionUri), undefined);
		assert.strictEqual(resolver.isNewSession(sessionUri), false);
	});
});
