/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatRequest } from 'vscode';
import { describe, expect, test } from 'vitest';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { applyContextSizeOverride } from '../agentIntent';

describe('applyContextSizeOverride', () => {
	function createEndpoint(modelMaxPromptTokens: number): { endpoint: IChatEndpoint; clonedWith: number[] } {
		const clonedWith: number[] = [];
		const endpoint = {
			modelMaxPromptTokens,
			cloneWithTokenOverride(tokens: number): IChatEndpoint {
				clonedWith.push(tokens);
				return createEndpoint(tokens).endpoint;
			},
		} as unknown as IChatEndpoint;
		return { endpoint, clonedWith };
	}

	function createRequest(contextSize?: unknown): ChatRequest {
		return { modelConfiguration: contextSize === undefined ? undefined : { contextSize } } as unknown as ChatRequest;
	}

	test('clamps to the picked size when below the model window (default tier)', () => {
		const { endpoint, clonedWith } = createEndpoint(400_000);
		const result = applyContextSizeOverride(endpoint, createRequest(272_000));
		expect(clonedWith).toEqual([272_000]);
		expect(result.modelMaxPromptTokens).toBe(272_000);
	});

	test('leaves the endpoint untouched on the full tier (selection >= model window)', () => {
		const { endpoint, clonedWith } = createEndpoint(400_000);
		expect(applyContextSizeOverride(endpoint, createRequest(400_000))).toBe(endpoint);
		expect(applyContextSizeOverride(endpoint, createRequest(500_000))).toBe(endpoint);
		expect(clonedWith).toEqual([]);
	});

	test('does not clamp when context size is unset or non-numeric', () => {
		const { endpoint, clonedWith } = createEndpoint(400_000);
		expect(applyContextSizeOverride(endpoint, createRequest(undefined))).toBe(endpoint);
		expect(applyContextSizeOverride(endpoint, createRequest('big'))).toBe(endpoint);
		expect(clonedWith).toEqual([]);
	});

	test('does not clamp for non-positive or non-finite selections', () => {
		const { endpoint, clonedWith } = createEndpoint(400_000);
		expect(applyContextSizeOverride(endpoint, createRequest(0))).toBe(endpoint);
		expect(applyContextSizeOverride(endpoint, createRequest(-1))).toBe(endpoint);
		expect(applyContextSizeOverride(endpoint, createRequest(Number.NaN))).toBe(endpoint);
		expect(applyContextSizeOverride(endpoint, createRequest(Number.POSITIVE_INFINITY))).toBe(endpoint);
		expect(clonedWith).toEqual([]);
	});
});
