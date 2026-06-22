/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { CopilotToken } from '../../../../platform/authentication/common/copilotToken';
import { byokKnownModelToAPIInfo, BYOKModelCapabilities, isClientBYOKAllowed, resolveModelInfo } from '../byokProvider';

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

describe('isClientBYOKAllowed', () => {
	function mockToken(props: { isInternal?: boolean; isIndividual?: boolean; isClientBYOKEnabled?: boolean }): Omit<CopilotToken, 'token'> {
		return {
			isInternal: props.isInternal ?? false,
			isIndividual: props.isIndividual ?? false,
			isClientBYOKEnabled: () => props.isClientBYOKEnabled ?? false,
		} as unknown as Omit<CopilotToken, 'token'>;
	}

	it('allows BYOK when there is no GitHub session (truly signed-out)', () => {
		expect(isClientBYOKAllowed(false, undefined)).toBe(true);
	});

	it('denies BYOK when signed-in but the Copilot token is unavailable (e.g. EnterpriseManagedError)', () => {
		expect(isClientBYOKAllowed(true, undefined)).toBe(false);
	});

	it('allows BYOK for internal users', () => {
		expect(isClientBYOKAllowed(true, mockToken({ isInternal: true }))).toBe(true);
	});

	it('allows BYOK for individual users', () => {
		expect(isClientBYOKAllowed(true, mockToken({ isIndividual: true }))).toBe(true);
	});

	it('allows BYOK when the token explicitly enables it (e.g. enterprise org opt-in)', () => {
		expect(isClientBYOKAllowed(true, mockToken({ isClientBYOKEnabled: true }))).toBe(true);
	});

	it('denies BYOK for signed-in managed users when no policy flag is set', () => {
		expect(isClientBYOKAllowed(true, mockToken({}))).toBe(false);
	});
});
