/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationEnablementKind, CustomizationLoadStatus, CustomizationType, type AgentCustomization, type ClientPluginCustomization, type Customization } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { getEffectiveAgents, getEffectiveClientAgents } from '../../../../../../platform/agentHost/common/customAgents.js';

function sc(uri: string, children?: AgentCustomization[], enabled = true): Customization {
	return {
		type: CustomizationType.Plugin,
		id: uri,
		uri,
		name: uri,
		...(enabled ? {} : {
			// TODO: Step 2 selects the persisted enablement scope.
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
		}),
		load: { kind: CustomizationLoadStatus.Loaded },
		...(children ? { children } : {}),
	};
}

function agent(uri: string, name: string, description?: string): AgentCustomization {
	return {
		type: CustomizationType.Agent,
		id: uri,
		uri,
		name,
		...(description ? { description } : {}),
	};
}

function clientPlugin(uri: string, enabled = true): ClientPluginCustomization {
	return {
		type: CustomizationType.Plugin,
		id: uri,
		uri,
		name: uri,
		...(enabled ? {} : {
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
		}),
	};
}

suite('getEffectiveAgents', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns an empty list when no customizations contribute agents', () => {
		assert.deepStrictEqual(getEffectiveAgents(undefined), []);
		assert.deepStrictEqual(getEffectiveAgents([sc('plugin://a'), sc('plugin://b', [])]), []);
	});

	test('treats undefined `children` as unknown and empty array as no agents', () => {
		const result = getEffectiveAgents([
			sc('plugin://a', [agent('agent://review', 'review')]),
			sc('plugin://b', []),
		]);
		assert.deepStrictEqual(result, [agent('agent://review', 'review')]);
	});

	test('skips disabled session customizations', () => {
		const result = getEffectiveAgents([
			sc('plugin://a', [agent('agent://a', 'a')], false),
			sc('plugin://b', [agent('agent://b', 'b')]),
		]);
		assert.deepStrictEqual(result, [agent('agent://b', 'b')]);
	});

	test('de-dupes by uri (first-seen wins)', () => {
		const result = getEffectiveAgents([
			sc('plugin://a', [
				agent('agent://shared', 'shared', 'from a'),
				agent('agent://only-a', 'only-a'),
			]),
			sc('plugin://b', [
				agent('agent://shared', 'shared', 'from b'),
				agent('agent://only-b', 'only-b'),
			]),
		]);
		assert.deepStrictEqual(result, [
			agent('agent://only-a', 'only-a'),
			agent('agent://only-b', 'only-b'),
			agent('agent://shared', 'shared', 'from a'),
		]);
	});

	test('sorts by name, breaking ties by uri', () => {
		const result = getEffectiveAgents([
			sc('plugin://a', [
				agent('agent://z', 'beta'),
				agent('agent://x', 'beta'),
				agent('agent://y', 'alpha'),
			]),
		]);
		assert.deepStrictEqual(result.map(a => a.uri), ['agent://y', 'agent://x', 'agent://z']);
	});

	test('filters draft agents by plugin enablement without dropping unmatched agents', () => {
		const disabledPlugin = clientPlugin('file:///plugins/disabled', false);
		const enabledPlugin = clientPlugin('file:///plugins/enabled');
		const draftAgents = [
			agent('file:///plugins/disabled/agents/shared.agent.md', 'disabled'),
			agent('file:///plugins/enabled/agents/enabled.agent.md', 'enabled'),
			agent('file:///workspace/.github/agents/loose.agent.md', 'loose'),
		];

		assert.deepStrictEqual({
			disabled: getEffectiveClientAgents([disabledPlugin, enabledPlugin], draftAgents).map(agent => agent.name),
			reenabled: getEffectiveClientAgents([enabledPlugin], draftAgents).map(agent => agent.name),
		}, {
			disabled: ['enabled', 'loose'],
			reenabled: ['disabled', 'enabled', 'loose'],
		});
	});
});
