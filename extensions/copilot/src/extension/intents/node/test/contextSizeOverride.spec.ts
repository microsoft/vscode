/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatRequest } from 'vscode';
import { describe, expect, test } from 'vitest';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { applyContextSizeOverride } from '../agentIntent';

describe('applyContextSizeOverride', () => {
	function createEndpoint(modelMaxPromptTokens: number, defaultContextMax?: number, longContext?: { inputPrice: number }): { endpoint: IChatEndpoint; clonedWith: number[] } {
		const clonedWith: number[] = [];
		const endpoint = {
			modelMaxPromptTokens,
			tokenPricing: defaultContextMax === undefined ? undefined : { default: { contextMax: defaultContextMax }, longContext },
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

	test('does not clamp when context size is unset or non-numeric and the model has no default tier', () => {
		const { endpoint, clonedWith } = createEndpoint(400_000);
		expect(applyContextSizeOverride(endpoint, createRequest(undefined))).toBe(endpoint);
		expect(applyContextSizeOverride(endpoint, createRequest('big'))).toBe(endpoint);
		expect(clonedWith).toEqual([]);
	});

	test('falls back to the default context-max tier when no selection is present and there is a surcharge', () => {
		const { endpoint, clonedWith } = createEndpoint(1_000_000, 200_000, { inputPrice: 6 });
		expect(applyContextSizeOverride(endpoint, createRequest(undefined)).modelMaxPromptTokens).toBe(200_000);
		expect(applyContextSizeOverride(endpoint, createRequest('big')).modelMaxPromptTokens).toBe(200_000);
		expect(clonedWith).toEqual([200_000, 200_000]);
	});

	test('an explicit selection wins over the default tier fallback', () => {
		const { endpoint, clonedWith } = createEndpoint(1_000_000, 200_000, { inputPrice: 6 });
		expect(applyContextSizeOverride(endpoint, createRequest(500_000)).modelMaxPromptTokens).toBe(500_000);
		expect(clonedWith).toEqual([500_000]);
	});

	test('falls back to the default context-max tier when long context has no surcharge (setting disabled)', () => {
		const { endpoint, clonedWith } = createEndpoint(1_000_000, 200_000);
		expect(applyContextSizeOverride(endpoint, createRequest(undefined)).modelMaxPromptTokens).toBe(200_000);
		expect(applyContextSizeOverride(endpoint, createRequest('big')).modelMaxPromptTokens).toBe(200_000);
		expect(clonedWith).toEqual([200_000, 200_000]);
	});

	test('does not clamp when long context has no surcharge and the user prefers long context', () => {
		const { endpoint, clonedWith } = createEndpoint(1_000_000, 200_000);
		expect(applyContextSizeOverride(endpoint, createRequest(undefined), true)).toBe(endpoint);
		expect(applyContextSizeOverride(endpoint, createRequest('big'), true)).toBe(endpoint);
		expect(clonedWith).toEqual([]);
	});

	test('an explicit selection is still respected when the user prefers long context', () => {
		const { endpoint, clonedWith } = createEndpoint(1_000_000, 200_000);
		expect(applyContextSizeOverride(endpoint, createRequest(200_000), true).modelMaxPromptTokens).toBe(200_000);
		expect(clonedWith).toEqual([200_000]);
	});

	test('does not clamp when the default tier equals or exceeds the model window', () => {
		const { endpoint, clonedWith } = createEndpoint(200_000, 200_000);
		expect(applyContextSizeOverride(endpoint, createRequest(undefined))).toBe(endpoint);
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
