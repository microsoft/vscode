/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { hasReadableCustomizationContent, isAgentBuiltinCustomizationUri } from '../../common/agentHostCustomizationUri.js';
import type { IAgentModelInfo } from '../../common/agent.js';
import { matchModelReference, parseModelRouter, resolveModelRouter } from '../../common/modelRouter.js';
import { ReasoningEffortConfigKey } from '../../common/reasoningEffort.js';
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

	test('the model-router skill\'s examples are valid routers whose every model, fallbacks included, is found', async () => {
		const content = await createCopilotSkillProvider('sdk-id', URI.file('/copilot-home'), () => true).readSkill('model-router', { signal: new AbortController().signal }) ?? '';
		const models = ['claude-opus-5.5', 'claude-sonnet-5.5', 'claude-haiku-5.5', 'gpt-6.1-sol'].map((id): IAgentModelInfo => ({
			provider: 'copilotcli', id, name: id, supportsVision: true,
			configSchema: { type: 'object', properties: { [ReasoningEffortConfigKey]: { type: 'string', title: 'Effort', enum: ['low', 'medium', 'high'] } } },
		}));
		const checked = [...content.matchAll(/```yaml\n(?<example>[\s\S]*?)\n```/g)].map(match => {
			const parsed = parseModelRouter(match.groups?.example ?? '', 'daily-driver.model-router.yaml');
			const resolved = parsed.router ? resolveModelRouter(parsed.router, models) : undefined;
			return {
				diagnostics: [...parsed.diagnostics, ...resolved?.diagnostics ?? []].map(diagnostic => diagnostic.message),
				models: resolved?.routes.map(route => route.model.id),
				// Resolving stops at a route's first model that is available, so each entry is looked up on its own.
				entries: parsed.router?.routes.map(route => route.models.map(reference => {
					const found = matchModelReference(models, reference);
					return found?.kind === 'model' ? found.model.id : found?.kind;
				})),
			};
		});
		assert.deepStrictEqual(checked, [
			{ diagnostics: [], models: ['claude-opus-5.5', 'claude-haiku-5.5', 'gpt-6.1-sol'], entries: [['claude-opus-5.5', 'claude-sonnet-5.5'], ['claude-haiku-5.5'], ['gpt-6.1-sol']] },
			{ diagnostics: [], models: ['claude-opus-5.5', 'claude-opus-5.5', 'claude-haiku-5.5'], entries: [['claude-opus-5.5'], ['claude-opus-5.5'], ['claude-haiku-5.5']] },
		]);
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
