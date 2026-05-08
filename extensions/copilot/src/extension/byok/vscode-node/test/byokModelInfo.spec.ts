/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { BYOKModelCapabilities } from '../../common/byokProvider';
import { byokKnownModelToAPIInfoWithEffort } from '../byokModelInfo';

describe('byokKnownModelToAPIInfoWithEffort', () => {
	const baseCapabilities: BYOKModelCapabilities = {
		name: 'TestModel',
		maxInputTokens: 1000,
		maxOutputTokens: 100,
		toolCalling: true,
		vision: false,
	};

	it('omits the configurationSchema when the model does not declare reasoning effort levels', () => {
		const info = byokKnownModelToAPIInfoWithEffort('TestProvider', 'm1', baseCapabilities);

		expect((info as { configurationSchema?: unknown }).configurationSchema).toBeUndefined();
	});

	it('builds a Thinking Effort picker with non-Claude default `medium` for non-Claude families', () => {
		const info = byokKnownModelToAPIInfoWithEffort('TestProvider', 'gpt-5', {
			...baseCapabilities,
			supportsReasoningEffort: ['minimal', 'low', 'medium', 'high'],
		});

		expect(info).toMatchObject({
			id: 'gpt-5',
			configurationSchema: {
				properties: {
					reasoningEffort: {
						type: 'string',
						enum: ['minimal', 'low', 'medium', 'high'],
						default: 'medium',
						group: 'navigation',
					},
				},
			},
		});
	});

	it('uses Claude-family default `high` when the family begins with `claude`', () => {
		const info = byokKnownModelToAPIInfoWithEffort('TestProvider', 'claude-sonnet-4', {
			...baseCapabilities,
			supportsReasoningEffort: ['low', 'medium', 'high'],
		});

		expect((info as { configurationSchema?: { properties: { reasoningEffort: { default?: string } } } }).configurationSchema?.properties.reasoningEffort.default).toBe('high');
	});

	it('falls back to no default when the preferred level is not in the supported list', () => {
		const info = byokKnownModelToAPIInfoWithEffort('TestProvider', 'grok-4', {
			...baseCapabilities,
			supportsReasoningEffort: ['low', 'high'],
		});

		expect((info as { configurationSchema?: { properties: { reasoningEffort: { default?: string } } } }).configurationSchema?.properties.reasoningEffort.default).toBeUndefined();
	});
});
