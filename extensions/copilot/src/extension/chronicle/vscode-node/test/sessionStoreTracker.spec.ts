/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { GenAiAttr } from '../../../../platform/otel/common/genAiAttributes';
import type { ICompletedSpanData } from '../../../../platform/otel/common/otelService';
import { extractFilePath, extractToolArgs } from '../../common/sessionStoreTracking';

/**
 * These tests verify the span data processing logic used by SessionStoreTracker.
 *
 * The tests focus on:
 * 1. Tool argument extraction from OTel span attributes using the real extractToolArgs helper
 * 2. File path extraction using the real extractFilePath helper
 *
 * Note: Full integration tests of SessionStoreTracker require mocking multiple
 * services (ISessionStore, IOTelService, IChatSessionService, etc.) and are
 * covered by manual testing and telemetry validation.
 */

// Create a minimal mock span for testing
function makeSpan(overrides: Partial<ICompletedSpanData> = {}): ICompletedSpanData {
	return {
		name: 'test',
		traceId: 'trace-1',
		spanId: 'span-1',
		startTime: 0,
		endTime: 1,
		attributes: {},
		events: [],
		status: { code: 0 },
		...overrides,
	};
}

describe('SessionStoreTracker span processing', () => {
	describe('tool argument extraction from OTel attributes', () => {
		it('uses gen_ai.tool.call.arguments attribute (not gen_ai.tool.input)', () => {
			// This test documents the fix for using the correct OTel attribute
			const span = makeSpan({
				attributes: {
					// The correct attribute that OTel uses
					[GenAiAttr.TOOL_CALL_ARGUMENTS]: JSON.stringify({
						filePath: '/src/file.ts',
						content: 'test',
					}),
					// This was incorrectly used before - should be ignored
					'gen_ai.tool.input': JSON.stringify({ wrong: 'data' }),
				},
			});

			const args = extractToolArgs(span);

			expect(args).toEqual({
				filePath: '/src/file.ts',
				content: 'test',
			});
			// Verify we're not reading from the wrong attribute
			expect(args).not.toHaveProperty('wrong');
		});

		it('returns empty object when attribute is missing', () => {
			const span = makeSpan({ attributes: {} });
			expect(extractToolArgs(span)).toEqual({});
		});

		it('returns empty object for malformed JSON', () => {
			const span = makeSpan({
				attributes: {
					[GenAiAttr.TOOL_CALL_ARGUMENTS]: 'not valid json {',
				},
			});
			expect(extractToolArgs(span)).toEqual({});
		});

		it('returns empty object for non-string attribute', () => {
			const span = makeSpan({
				attributes: {
					[GenAiAttr.TOOL_CALL_ARGUMENTS]: 12345 as unknown as string,
				},
			});
			expect(extractToolArgs(span)).toEqual({});
		});
	});

	describe('file path extraction pipeline', () => {
		// These tests verify the full pipeline: span -> extractToolArgs -> extractFilePath

		it('extracts file from replace_string_in_file span', () => {
			const span = makeSpan({
				attributes: {
					[GenAiAttr.TOOL_CALL_ARGUMENTS]: JSON.stringify({
						filePath: '/workspace/src/utils.ts',
						oldString: 'old',
						newString: 'new',
					}),
				},
			});

			const args = extractToolArgs(span);
			const filePath = extractFilePath('replace_string_in_file', args);

			expect(filePath).toBe('/workspace/src/utils.ts');
		});

		it('extracts file from create_file span', () => {
			const span = makeSpan({
				attributes: {
					[GenAiAttr.TOOL_CALL_ARGUMENTS]: JSON.stringify({
						filePath: '/new/module.ts',
						content: 'export {}',
					}),
				},
			});

			const args = extractToolArgs(span);
			const filePath = extractFilePath('create_file', args);

			expect(filePath).toBe('/new/module.ts');
		});

		it('extracts file from apply_patch span using input field', () => {
			const patchInput = '*** Begin Patch\n*** Update File: /lib/helpers.ts\n@@export\n-old\n+new\n*** End Patch';
			const span = makeSpan({
				attributes: {
					[GenAiAttr.TOOL_CALL_ARGUMENTS]: JSON.stringify({ input: patchInput }),
				},
			});

			const args = extractToolArgs(span);
			const filePath = extractFilePath('apply_patch', args);

			expect(filePath).toBe('/lib/helpers.ts');
		});

		it('extracts file from multi_replace_string_in_file span', () => {
			const span = makeSpan({
				attributes: {
					[GenAiAttr.TOOL_CALL_ARGUMENTS]: JSON.stringify({
						explanation: 'fix imports',
						replacements: [
							{ filePath: '/src/a.ts', oldString: 'x', newString: 'y' },
							{ filePath: '/src/b.ts', oldString: 'x', newString: 'y' },
						],
					}),
				},
			});

			const args = extractToolArgs(span);
			const filePath = extractFilePath('multi_replace_string_in_file', args);

			// extractFilePath returns first file from replacements array
			expect(filePath).toBe('/src/a.ts');
		});

		it('returns undefined for non-file tools', () => {
			const span = makeSpan({
				attributes: {
					[GenAiAttr.TOOL_CALL_ARGUMENTS]: JSON.stringify({ command: 'ls -la' }),
				},
			});

			const args = extractToolArgs(span);
			const filePath = extractFilePath('run_in_terminal', args);

			expect(filePath).toBeUndefined();
		});

		it('returns undefined when args are missing filePath', () => {
			const span = makeSpan({
				attributes: {
					[GenAiAttr.TOOL_CALL_ARGUMENTS]: JSON.stringify({ content: 'no path' }),
				},
			});

			const args = extractToolArgs(span);
			const filePath = extractFilePath('create_file', args);

			expect(filePath).toBeUndefined();
		});
	});
});
