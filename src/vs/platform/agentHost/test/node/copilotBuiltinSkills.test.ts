/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { hasReadableCustomizationContent, isAgentBuiltinCustomizationUri } from '../../common/agentHostCustomizationUri.js';
import { buildCopilotBuiltinSkillsContainer, createCopilotSkillProvider } from '../../node/copilot/copilotBuiltinSkills.js';

suite('Copilot builtin troubleshoot skill', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('supplies the exact host home and SDK conversation for concurrent reads', async () => {
		const home = URI.file('/custom home/"quoted"/$&');
		const providers = ['owner-sdk-id', 'peer-sdk-id'].map(id => createCopilotSkillProvider(id, home));
		const options = { signal: new AbortController().signal };
		await Promise.all(providers.map(provider => provider.listSkills(options)));
		const contents = await Promise.all(providers.map(provider => provider.readSkill('troubleshoot', options)));
		assert.deepStrictEqual(contents.map((content, index) => ({
			current: content?.includes(JSON.stringify(URI.joinPath(home, 'session-state', index === 0 ? 'owner-sdk-id' : 'peer-sdk-id', 'events.jsonl').fsPath)),
			root: content?.includes(JSON.stringify(URI.joinPath(home, 'session-state').fsPath)),
			unresolved: content?.includes('{{COPILOT_SESSION_LOG_CONTEXT}}'),
			xdg: content?.includes('XDG_STATE_HOME'),
		})), Array.from({ length: 2 }, () => ({ current: true, root: true, unresolved: false, xdg: false })));
	});

	test('unknown skills and cancelled reads do not return content', async () => {
		const provider = createCopilotSkillProvider('sdk-id', URI.file('/copilot-home'));
		const controller = new AbortController();
		const reason = new Error('Cancelled');
		controller.abort(reason);
		assert.strictEqual(await provider.readSkill('other', { signal: new AbortController().signal }), undefined);
		await assert.rejects(async () => provider.readSkill('troubleshoot', { signal: controller.signal }), reason);
	});

	test('publishes the skill as a discovery-only built-in without exposing its source', () => {
		const container = buildCopilotBuiltinSkillsContainer();
		const child = container.children![0];
		const uri = URI.parse(child.uri);
		assert.deepStrictEqual({
			name: child.name,
			builtin: isAgentBuiltinCustomizationUri(uri),
			readable: hasReadableCustomizationContent(uri),
			writable: container.writable,
		}, { name: 'troubleshoot', builtin: true, readable: false, writable: false });
	});
});
