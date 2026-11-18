/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeBase64 } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { hasReadableCustomizationContent, isAgentBuiltinCustomizationUri } from '../../common/agentHostCustomizationUri.js';
import { parseModelRouter } from '../../common/modelRouter.js';
import { buildCopilotBuiltinSkillsContainer, CopilotBuiltinSkillResourceProvider, createCopilotSkillProvider } from '../../node/copilot/copilotBuiltinSkills.js';
import { AhpErrorCodes, ContentEncoding } from '../../common/state/sessionProtocol.js';

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

	test('publishes the skill as a readable, read-only built-in', () => {
		const container = buildCopilotBuiltinSkillsContainer();
		const child = container.children![0];
		const uri = URI.parse(child.uri);
		assert.deepStrictEqual({
			name: child.name,
			builtin: isAgentBuiltinCustomizationUri(uri),
			readable: hasReadableCustomizationContent(uri),
			writable: container.writable,
		}, { name: 'troubleshoot', builtin: true, readable: true, writable: false });
	});

	test('reads the published built-in source templates and historical message URIs', async () => {
		const provider = new CopilotBuiltinSkillResourceProvider();
		const skills = buildCopilotBuiltinSkillsContainer(true).children!;
		const results = await Promise.all(skills.map(async skill => {
			const uri = URI.parse(skill.uri);
			const source = await provider.read(uri, ContentEncoding.Utf8);
			const encoded = await provider.read(uri, ContentEncoding.Base64);
			const historical = await provider.read(URI.parse(`agent-builtin:/skill/${skill.name}`), ContentEncoding.Utf8);
			return {
				name: skill.name,
				contentType: source.contentType,
				header: source.data.startsWith('> Built-in skill source.'),
				template: source.data.includes(skill.name === 'troubleshoot' ? '{{COPILOT_SESSION_LOG_CONTEXT}}' : '{{COPILOT_MODEL_ROUTERS}}'),
				encodingsMatch: decodeBase64(encoded.data).toString() === source.data,
				historicalMatches: historical.data === source.data,
			};
		}));
		assert.deepStrictEqual(results, ['troubleshoot', 'model-router'].map(name => ({
			name, contentType: 'text/markdown', header: true, template: true, encodingsMatch: true, historicalMatches: true,
		})));
	});

	test('rejects unknown built-in skill resources', async () => {
		const provider = new CopilotBuiltinSkillResourceProvider();
		for (const resource of ['agent-builtin-skill:/unknown/SKILL.md', 'agent-builtin:/skill/review', 'agent-builtin-skill://other/troubleshoot/SKILL.md']) {
			await assert.rejects(provider.read(URI.parse(resource), ContentEncoding.Utf8), { code: AhpErrorCodes.NotFound });
		}
	});

	test('offers the model-router skill only while model routers are on', async () => {
		let enabled = false;
		const provider = createCopilotSkillProvider('sdk-id', URI.file('/copilot-home'), () => enabled);
		const options = { signal: new AbortController().signal };
		const snapshot = async () => ({
			listed: (await provider.listSkills(options)).map(skill => skill.name),
			readable: (await provider.readSkill('model-router', options))?.includes('check_model_router') ?? false,
		});
		const off = await snapshot();
		enabled = true;
		assert.deepStrictEqual({
			off,
			on: await snapshot(),
			container: [buildCopilotBuiltinSkillsContainer(false), buildCopilotBuiltinSkillsContainer(true)].map(container => container.children!.map(child => child.name)),
		}, {
			off: { listed: ['troubleshoot'], readable: false },
			on: { listed: ['troubleshoot', 'model-router'], readable: true },
			container: [['troubleshoot'], ['troubleshoot', 'model-router']],
		});
	});

	test('the model-router skill\'s example is a valid router', async () => {
		const content = await createCopilotSkillProvider('sdk-id', URI.file('/copilot-home'), () => true).readSkill('model-router', { signal: new AbortController().signal });
		const example = /```yaml\n([\s\S]*?)\n```/.exec(content ?? '')?.[1];
		assert.deepStrictEqual(parseModelRouter(example ?? '', 'daily-driver.model-router.yaml').diagnostics, []);
	});

	test('the model-router skill names the host\'s own router and session folders', async () => {
		const content = await createCopilotSkillProvider('sdk-id', URI.file('/copilot-home'), () => true).readSkill('model-router', { signal: new AbortController().signal }) ?? '';
		assert.deepStrictEqual({
			routers: content.includes(URI.file('/copilot-home/model-routers').fsPath),
			sessions: content.includes(`${URI.file('/copilot-home/session-state').fsPath}/*/events.jsonl`),
			unresolved: content.includes('{{'),
		}, { routers: true, sessions: true, unresolved: false });
	});
});
