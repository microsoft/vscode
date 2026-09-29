/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import type { ChatRequestModeInstructions } from 'vscode';
import { getModeNameForTelemetry } from '../telemetry';

suite('getModeNameForTelemetry', () => {
	function modeInstructions(props: Partial<ChatRequestModeInstructions>): ChatRequestModeInstructions {
		return { name: 'Mode', content: '', ...props } as ChatRequestModeInstructions;
	}

	test('returns undefined when no mode instructions are present', () => {
		assert.strictEqual(getModeNameForTelemetry(undefined), undefined);
	});

	test('returns lowercased name for built-in modes', () => {
		assert.strictEqual(getModeNameForTelemetry(modeInstructions({ name: 'Agent', isBuiltin: true })), 'agent');
		assert.strictEqual(getModeNameForTelemetry(modeInstructions({ name: 'Ask', isBuiltin: true })), 'ask');
		assert.strictEqual(getModeNameForTelemetry(modeInstructions({ name: 'Edit', isBuiltin: true })), 'edit');
	});

	test('reports the Plan custom-provider agent under its own name', () => {
		assert.strictEqual(getModeNameForTelemetry(modeInstructions({ name: 'Plan', isBuiltin: false })), 'plan');
	});

	test('reports other custom agents as custom', () => {
		assert.strictEqual(getModeNameForTelemetry(modeInstructions({ name: 'my-agent', isBuiltin: false })), 'custom');
	});
});
