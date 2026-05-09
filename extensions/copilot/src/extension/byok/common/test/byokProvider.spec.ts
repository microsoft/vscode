/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { byokKnownModelToAPIInfo, BYOKModelCapabilities, resolveModelInfo } from '../byokProvider';

describe('byokKnownModelToAPIInfo', () => {
	const baseCapabilities: BYOKModelCapabilities = {
		name: 'TestModel',
		maxInputTokens: 1000,
		maxOutputTokens: 100,
		toolCalling: true,
		vision: false,
	};

	it('forwards editTools into capabilities so VS Code core can populate editToolsHint', () => {
		const info = byokKnownModelToAPIInfo('TestProvider', 'm1', {
			...baseCapabilities,
			editTools: ['apply-patch'],
		});

		expect(info.capabilities).toMatchObject({
			toolCalling: true,
			imageInput: false,
			editTools: ['apply-patch'],
		});
	});

	it('forwards a restricted list of editTools verbatim', () => {
		const info = byokKnownModelToAPIInfo('TestProvider', 'm1', {
			...baseCapabilities,
			editTools: ['find-replace', 'multi-find-replace'],
		});

		expect(info.capabilities.editTools).toEqual(['find-replace', 'multi-find-replace']);
	});

	it('omits editTools when not configured', () => {
		const info = byokKnownModelToAPIInfo('TestProvider', 'm1', baseCapabilities);

		expect(info.capabilities.editTools).toBeUndefined();
	});
});

describe('resolveModelInfo', () => {
	const baseCapabilities: BYOKModelCapabilities = {
		name: 'TestModel',
		maxInputTokens: 1000,
		maxOutputTokens: 100,
		toolCalling: true,
		vision: false,
	};

	it('propagates supportsReasoningEffort and reasoningEffortFormat from BYOK capabilities into chat-endpoint inputs', () => {
		const info = resolveModelInfo('m1', 'TestProvider', undefined, {
			...baseCapabilities,
			supportsReasoningEffort: ['low', 'medium', 'high'],
			reasoningEffortFormat: 'responses',
		});

		expect(info.capabilities.supports.reasoning_effort).toEqual(['low', 'medium', 'high']);
		expect(info.reasoningEffortFormat).toBe('responses');
	});

	it('omits the reasoning effort capability when the model does not declare it', () => {
		const info = resolveModelInfo('m1', 'TestProvider', undefined, baseCapabilities);

		expect(info.capabilities.supports.reasoning_effort).toBeUndefined();
		expect(info.reasoningEffortFormat).toBeUndefined();
	});
});
