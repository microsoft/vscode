/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { copilotAccountContextKey, readCopilotAccountContext } from '../../common/copilotAccountContext.js';
import { copilotAccountOperationMeta, readCopilotAccountOperation } from '../../common/meta/copilotAccountOperation.js';
import type { RootState } from '../../common/state/sessionState.js';

suite('Copilot account context schema', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const choice = { service: 'm365', resource: 'https://resource.example', selectionId: 'opaque-selection', host: 'https://host.example', accountName: 'provider-account', displayName: 'Display only' };
	const root = (value: unknown): RootState => ({ agents: [], config: { schema: { type: 'object', properties: {} }, values: { [copilotAccountContextKey]: value } } });

	test('validates authoritative readiness and ignores unrelated metadata', () => {
		const state = { kind: 'ready', entraAccountId: 'entra', discoveryId: 'flow', choice, derivedFrom: 'opaque-base' };
		assert.deepStrictEqual(readCopilotAccountContext(root({ ...state, token: 'must-not-be-read' })), state);
	});

	test('does not derive readiness from malformed or partial state', () => {
		const invalid = [
			undefined, null, [], {}, { kind: 'ready' }, { kind: 'noServices' },
			{ kind: 'ready', entraAccountId: 'entra', discoveryId: 'flow', choice },
			{ kind: 'choiceRequired', entraAccountId: 'entra', discoveryId: 'flow', choices: [choice] },
			{ kind: 'activating', entraAccountId: 'entra', discoveryId: 'flow', choice: { ...choice, service: 'unknown' } },
		];
		assert.deepStrictEqual(invalid.map(value => readCopilotAccountContext(root(value))), invalid.map(() => undefined));
	});

	test('uses a typed explicit selection intent, not the credential resource count', () => {
		assert.deepStrictEqual([
			readCopilotAccountOperation({}),
			readCopilotAccountOperation({ _meta: { 'vscode.copilot.accountOperation': { kind: 'select', selectionId: 'opaque' } } }),
			readCopilotAccountOperation({ _meta: copilotAccountOperationMeta({ kind: 'select', discoveryId: 'flow', selectionId: 'opaque' }) }),
		], [undefined, undefined, { kind: 'select', discoveryId: 'flow', selectionId: 'opaque' }]);
	});
});
