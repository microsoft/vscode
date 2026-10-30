/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getClientAgentDefinitionId, readClientPluginAgentIdentities, toClientPluginAgentIdentitiesMeta } from '../../common/meta/clientPluginCustomizationMeta.js';
import { CustomizationType } from '../../common/state/sessionState.js';

suite('client plugin agent identity prototype', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const first = getClientAgentDefinitionId(URI.parse('client-source:/first/Reviewer.agent.md'));
	const second = getClientAgentDefinitionId(URI.parse('client-source:/second/Reviewer.agent.md'));
	const read = (value: unknown) => readClientPluginAgentIdentities({
		type: CustomizationType.Plugin, id: 'plugin', uri: 'other-host:/plugin', name: 'Plugin',
		_meta: { 'vscode.agentIdentities': value },
	});

	test('round trips distinct, case-preserving source identities with opaque plugin URIs', () => {
		const identities = { 'agents/first.agent.md': first, 'agents/second.agent.md': second };
		assert.deepStrictEqual({
			roundTrip: read(toClientPluginAgentIdentitiesMeta(identities)['vscode.agentIdentities']),
			distinct: first !== second,
			stable: first === getClientAgentDefinitionId(URI.parse('client-source:/first/Reviewer.agent.md')),
			casePreserved: first !== getClientAgentDefinitionId(URI.parse('client-source:/first/reviewer.agent.md')),
		}, { roundTrip: identities, distinct: true, stable: true, casePreserved: true });
	});

	test('rejects malformed, escaping and ambiguous optional manifests', () => {
		const invalid: unknown[] = [
			undefined, null, [], 'invalid', { 'agents/a.md': 1 }, { 'agents/a.md': 'unscoped' },
			{ '/agents/a.md': first }, { '../a.md': first }, { 'agents/./a.md': first },
			{ 'agents//a.md': first }, { 'agents\\a.md': first }, { 'agents/%2e%2e/a.md': first },
			{ 'file:/a.md': first }, { 'agents/a.md?query': first }, { 'agents/a.md#fragment': first },
			{ 'agents/a.md': first, 'agents/b.md': first },
		];
		assert.deepStrictEqual(invalid.map(read), invalid.map(() => ({})));
	});
});
