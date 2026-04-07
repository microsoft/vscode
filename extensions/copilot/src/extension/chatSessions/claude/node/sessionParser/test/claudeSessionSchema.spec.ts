/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import {
	ContentBlock,
	ImageBlock,
	toAnthropicImageMediaType,
	vAssistantMessageEntry,
	vChainNodeFields,
	vImageBlock,
	vIsoTimestamp,
	vQueueOperationEntry,
	vSummaryEntry,
	vUserMessageEntry,
	vUuid,
} from '../claudeSessionSchema';

describe('claudeSessionSchema', () => {
	// ========================================================================
	// Primitive Validators
	// ========================================================================

	describe('vIsoTimestamp', () => {
		const validator = vIsoTimestamp();

		it('should accept valid ISO timestamps', () => {
			const timestamps = [
				'2026-01-31T00:34:50.025Z',
				'2026-01-31T00:34:50Z',
				'2026-01-31T00:34:50.123456Z',
				'2026-01-31T00:34:50+00:00',
				'2026-01-31T00:34:50-05:00',
			];

			for (const ts of timestamps) {
				const result = validator.validate(ts);
				expect(result.error).toBeUndefined();
				expect(result.content).toBe(ts);
			}
		});

		it('should reject invalid timestamps', () => {
			const invalid = [
				'2026-01-31',
				'00:34:50',
				'not a timestamp',
				123456789,
				null,
				undefined,
			];

			for (const val of invalid) {
				const result = validator.validate(val);
				expect(result.error).toBeDefined();
			}
		});
	});

	describe('vUuid', () => {
		const validator = vUuid();

		it('should accept valid UUIDs with lenient validator', () => {
			const uuids = [
				'6762c0b9-ee55-42cc-8998-180da7f37462',
				'8d4dcda5-3984-42c4-9b9e-d57f64a924dc',
				'ABCD1234-5678-90AB-CDEF-1234567890AB',
				'any-string-is-ok',
				'a139fcf', // agent ID format
			];

			for (const uuid of uuids) {
				const result = validator.validate(uuid);
				expect(result.error).toBeUndefined();
				expect(result.content).toBe(uuid);
			}
		});

		it('should reject non-strings and empty strings', () => {
			const invalid = [
				'',
				123,
				null,
				undefined,
			];

			for (const val of invalid) {
				const result = validator.validate(val);
				expect(result.error).toBeDefined();
			}
		});
	});

	// ========================================================================
	// Entry Type Validators
	// ========================================================================

	describe('vQueueOperationEntry', () => {
		const validator = vQueueOperationEntry;

		it('should validate queue operation entries', () => {
			const entry = {
				type: 'queue-operation',
				operation: 'dequeue',
				timestamp: '2026-01-31T00:34:50.025Z',
				sessionId: '6762c0b9-ee55-42cc-8998-180da7f37462',
			};

			const result = validator.validate(entry);
			expect(result.error).toBeUndefined();
			expect(result.content).toEqual(entry);
		});

		it('should reject invalid queue operations', () => {
			const invalid = {
				type: 'queue-operation',
				operation: 'invalid-op',
				timestamp: '2026-01-31T00:34:50.025Z',
				sessionId: '6762c0b9-ee55-42cc-8998-180da7f37462',
			};

			const result = validator.validate(invalid);
			expect(result.error).toBeDefined();
		});
	});

	describe('vUserMessageEntry', () => {
		const validator = vUserMessageEntry;

		it('should validate user message with string content', () => {
			const entry = {
				parentUuid: null,
				isSidechain: false,
				userType: 'external',
				cwd: '/Users/test/project',
				sessionId: '6762c0b9-ee55-42cc-8998-180da7f37462',
				version: '2.1.5',
				gitBranch: 'main',
				slug: 'test-session',
				type: 'user',
				message: {
					role: 'user',
					content: 'Hello, Claude!',
				},
				uuid: '8d4dcda5-3984-42c4-9b9e-d57f64a924dc',
				timestamp: '2026-01-31T00:34:50.049Z',
			};

			const result = validator.validate(entry);
			expect(result.error).toBeUndefined();
			expect(result.content?.uuid).toBe(entry.uuid);
			expect(result.content?.type).toBe('user');
		});

		it('should validate user message with tool result content', () => {
			const entry = {
				parentUuid: 'e8ee0e3d-16e4-4d9a-848d-83f44455177f',
				isSidechain: false,
				userType: 'external',
				cwd: '/Users/test/project',
				sessionId: '6762c0b9-ee55-42cc-8998-180da7f37462',
				version: '2.1.5',
				gitBranch: 'main',
				slug: 'test-session',
				type: 'user',
				message: {
					role: 'user',
					content: [
						{
							type: 'tool_result',
							content: 'File contents here',
							is_error: false,
							tool_use_id: 'toolu_01NSgUsqzqDUKrS2oKjXrgEC',
						},
					],
				},
				uuid: 'b8f8ef99-7fc8-4672-aaba-260da4e3cc9f',
				timestamp: '2026-01-31T00:35:43.115Z',
				toolUseResult: 'Success',
				sourceToolAssistantUUID: 'e8ee0e3d-16e4-4d9a-848d-83f44455177f',
			};

			const result = validator.validate(entry);
			expect(result.error).toBeUndefined();
			expect(result.content?.uuid).toBe(entry.uuid);
		});

		it('should reject user message without required fields', () => {
			const invalid = {
				type: 'user',
				// Missing uuid, sessionId, timestamp, message
			};

			const result = validator.validate(invalid);
			expect(result.error).toBeDefined();
		});

		it('should validate user message with image content block and preserve source data', () => {
			const entry = {
				parentUuid: null,
				isSidechain: false,
				userType: 'external',
				cwd: '/Users/test/project',
				sessionId: '6762c0b9-ee55-42cc-8998-180da7f37462',
				version: '2.1.5',
				type: 'user',
				message: {
					role: 'user',
					content: [
						{
							type: 'image',
							source: {
								type: 'base64',
								media_type: 'image/png',
								data: 'iVBORw0KGgo=',
							},
						},
						{
							type: 'text',
							text: 'What is in this image?',
						},
					],
				},
				uuid: '8d4dcda5-3984-42c4-9b9e-d57f64a924dc',
				timestamp: '2026-01-31T00:34:50.049Z',
			};

			const result = validator.validate(entry);
			expect(result.error).toBeUndefined();
			expect(result.content?.uuid).toBe(entry.uuid);

			// Verify image source data is preserved through validation
			const content = result.content?.message.content;
			expect(Array.isArray(content)).toBe(true);
			const imageBlock = (content as ContentBlock[]).find((b): b is ImageBlock => b.type === 'image');
			expect(imageBlock).toBeDefined();
			expect(imageBlock!.source).toEqual({
				type: 'base64',
				media_type: 'image/png',
				data: 'iVBORw0KGgo=',
			});
		});
		it('should preserve isCompactSummary field when present', () => {
			const entry = {
				parentUuid: 'compact-boundary-uuid',
				isSidechain: false,
				type: 'user',
				message: {
					role: 'user',
					content: 'Summary of prior conversation...',
				},
				uuid: '8d4dcda5-3984-42c4-9b9e-d57f64a924dc',
				sessionId: '6762c0b9-ee55-42cc-8998-180da7f37462',
				timestamp: '2026-01-31T00:34:50.049Z',
				isCompactSummary: true,
			};

			const result = validator.validate(entry);
			expect(result.error).toBeUndefined();
			expect(result.content?.isCompactSummary).toBe(true);
		});

		it('should leave isCompactSummary undefined when not present', () => {
			const entry = {
				parentUuid: null,
				isSidechain: false,
				type: 'user',
				message: { role: 'user', content: 'Normal message' },
				uuid: '8d4dcda5-3984-42c4-9b9e-d57f64a924dc',
				sessionId: '6762c0b9-ee55-42cc-8998-180da7f37462',
				timestamp: '2026-01-31T00:34:50.049Z',
			};

			const result = validator.validate(entry);
			expect(result.error).toBeUndefined();
			expect(result.content?.isCompactSummary).toBeUndefined();
		});
	});

	describe('vAssistantMessageEntry', () => {
		const validator = vAssistantMessageEntry;

		it('should validate assistant message with text content', () => {
			const entry = {
				parentUuid: '8d4dcda5-3984-42c4-9b9e-d57f64a924dc',
				isSidechain: false,
				userType: 'external',
				cwd: '/Users/test/project',
				sessionId: '6762c0b9-ee55-42cc-8998-180da7f37462',
				version: '2.1.5',
				gitBranch: 'main',
				slug: 'test-session',
				type: 'assistant',
				message: {
					role: 'assistant',
					content: [
						{
							type: 'text',
							text: 'Hello! How can I help you?',
						},
					],
					id: 'msg_01QZbFH3Rf2fSjUw9sDRakwH',
					model: 'claude-opus-4-5-20251101',
					type: 'message',
					stop_reason: 'end_turn',
					stop_sequence: null,
					usage: {
						cache_creation: {
							ephemeral_1h_input_tokens: 0,
							ephemeral_5m_input_tokens: 3328,
						},
						cache_creation_input_tokens: 3328,
						cache_read_input_tokens: 19083,
						input_tokens: 8,
						output_tokens: 360,
					},
				},
				uuid: 'cc74a117-72ce-4ea6-8d01-4401e60ddfeb',
				timestamp: '2026-01-31T00:35:43.061Z',
			};

			const result = validator.validate(entry);
			expect(result.error).toBeUndefined();
			expect(result.content?.uuid).toBe(entry.uuid);
			expect(result.content?.type).toBe('assistant');
		});

		it('should validate assistant message with thinking block', () => {
			const entry = {
				parentUuid: 'test-parent-uuid-1234-5678-1234567890ab',
				isSidechain: true,
				type: 'assistant',
				message: {
					role: 'assistant',
					content: [
						{
							type: 'thinking',
							signature: 'EpECCkYICxgC...',
							thinking: 'The user is asking...',
						},
					],
					id: 'msg_01Au8b3kwPEGT4Cj6KHiBJda',
					model: 'claude-haiku-4-5-20251001',
					type: 'message',
					stop_reason: null,
					stop_sequence: null,
					usage: {
						cache_creation: {
							ephemeral_1h_input_tokens: 0,
							ephemeral_5m_input_tokens: 11606,
						},
						cache_creation_input_tokens: 11606,
						cache_read_input_tokens: 0,
						input_tokens: 10,
						output_tokens: 3,
					},
				},
				uuid: 'cc74a117-72ce-4ea6-8d01-4401e60ddabc',
				sessionId: '6762c0b9-ee55-42cc-8998-180da7f37462',
				timestamp: '2026-01-31T00:36:00.000Z',
				agentId: 'a139fcf',
			};

			const result = validator.validate(entry);
			expect(result.error).toBeUndefined();
			expect(result.content?.agentId).toBe('a139fcf');
		});

		it('should validate assistant message with tool use', () => {
			const entry = {
				parentUuid: '8d4dcda5-3984-42c4-9b9e-d57f64a924dc',
				isSidechain: false,
				type: 'assistant',
				message: {
					role: 'assistant',
					content: [
						{
							type: 'tool_use',
							id: 'toolu_01NSgUsqzqDUKrS2oKjXrgEC',
							name: 'Read',
							input: { file_path: '/path/to/file.ts' },
							caller: { type: 'direct' },
						},
					],
					id: 'msg_01QZbFH3Rf2fSjUw9sDRakwH',
					model: 'claude-opus-4-5-20251101',
					type: 'message',
					stop_reason: 'tool_use',
					stop_sequence: null,
				},
				uuid: 'e8ee0e3d-16e4-4d9a-848d-83f44455177f',
				sessionId: '6762c0b9-ee55-42cc-8998-180da7f37462',
				timestamp: '2026-01-31T00:35:30.000Z',
			};

			const result = validator.validate(entry);
			expect(result.error).toBeUndefined();
		});
	});

	describe('vImageBlock', () => {
		const validator = vImageBlock;

		it('should validate base64 image blocks and preserve source', () => {
			const block = {
				type: 'image',
				source: {
					type: 'base64',
					media_type: 'image/png',
					data: 'iVBORw0KGgo=',
				},
			};

			const result = validator.validate(block);
			expect(result.error).toBeUndefined();
			expect(result.content).toEqual(block);
		});

		it('should validate URL image blocks', () => {
			const block = {
				type: 'image',
				source: {
					type: 'url',
					url: 'https://example.com/image.png',
				},
			};

			const result = validator.validate(block);
			expect(result.error).toBeUndefined();
			expect(result.content?.source).toEqual(block.source);
		});

		it('should reject non-image blocks', () => {
			const result = validator.validate({ type: 'text', text: 'hello' });
			expect(result.error).toBeDefined();
		});

		it('should reject image block with null source', () => {
			const result = validator.validate({ type: 'image', source: null });
			expect(result.error).toBeDefined();
		});

		it('should reject image block with non-object source', () => {
			const result = validator.validate({ type: 'image', source: 'not-an-object' });
			expect(result.error).toBeDefined();
		});

		it('should reject image block with missing source', () => {
			const result = validator.validate({ type: 'image' });
			expect(result.error).toBeDefined();
		});

		it('should reject base64 source missing data field', () => {
			const result = validator.validate({
				type: 'image',
				source: { type: 'base64', media_type: 'image/png' },
			});
			expect(result.error).toBeDefined();
		});

		it('should reject base64 source missing media_type field', () => {
			const result = validator.validate({
				type: 'image',
				source: { type: 'base64', data: 'iVBORw0KGgo=' },
			});
			expect(result.error).toBeDefined();
		});

		it('should reject base64 source with unsupported media_type', () => {
			const result = validator.validate({
				type: 'image',
				source: { type: 'base64', media_type: 'image/bmp', data: 'abc=' },
			});
			expect(result.error).toBeDefined();
		});

		it('should reject url source missing url field', () => {
			const result = validator.validate({
				type: 'image',
				source: { type: 'url' },
			});
			expect(result.error).toBeDefined();
		});

		it('should reject source with unknown type', () => {
			const result = validator.validate({
				type: 'image',
				source: { type: 'file', path: '/tmp/img.png' },
			});
			expect(result.error).toBeDefined();
		});
	});

	describe('toAnthropicImageMediaType', () => {
		it('should return the media type for supported MIME types', () => {
			expect(toAnthropicImageMediaType('image/jpeg')).toBe('image/jpeg');
			expect(toAnthropicImageMediaType('image/png')).toBe('image/png');
			expect(toAnthropicImageMediaType('image/gif')).toBe('image/gif');
			expect(toAnthropicImageMediaType('image/webp')).toBe('image/webp');
		});

		it('should normalize image/jpg to image/jpeg', () => {
			expect(toAnthropicImageMediaType('image/jpg')).toBe('image/jpeg');
		});

		it('should be case-insensitive', () => {
			expect(toAnthropicImageMediaType('IMAGE/PNG')).toBe('image/png');
			expect(toAnthropicImageMediaType('Image/Jpeg')).toBe('image/jpeg');
		});

		it('should return undefined for unsupported MIME types', () => {
			expect(toAnthropicImageMediaType('image/bmp')).toBeUndefined();
			expect(toAnthropicImageMediaType('image/svg+xml')).toBeUndefined();
			expect(toAnthropicImageMediaType('text/plain')).toBeUndefined();
		});
	});

	describe('vSummaryEntry', () => {
		const validator = vSummaryEntry;

		it('should validate summary entries', () => {
			const entry = {
				type: 'summary',
				summary: 'Implementing dark mode feature',
				leafUuid: '8d4dcda5-3984-42c4-9b9e-d57f64a924dc',
			};

			const result = validator.validate(entry);
			expect(result.error).toBeUndefined();
			expect(result.content).toEqual(entry);
		});

		it('should reject summary without leafUuid', () => {
			const invalid = {
				type: 'summary',
				summary: 'Test summary',
			};

			const result = validator.validate(invalid);
			expect(result.error).toBeDefined();
		});
	});

	// ========================================================================
	// vChainNodeFields
	// ========================================================================

	describe('vChainNodeFields', () => {
		const validator = vChainNodeFields;

		it('should extract uuid and parentUuid from a user message entry', () => {
			const entry = {
				type: 'user',
				uuid: 'uuid-1',
				parentUuid: 'uuid-0',
				sessionId: 'session-1',
				timestamp: '2026-01-31T00:34:50.049Z',
				message: { role: 'user', content: 'Hello' },
			};

			const result = validator.validate(entry);
			expect(result.error).toBeUndefined();
			expect(result.content?.uuid).toBe('uuid-1');
			expect(result.content?.parentUuid).toBe('uuid-0');
			expect(result.content?.logicalParentUuid).toBeUndefined();
		});

		it('should extract logicalParentUuid from compact boundary entries', () => {
			const entry = {
				type: 'system',
				subtype: 'compact_boundary',
				uuid: 'compact-uuid',
				parentUuid: null,
				logicalParentUuid: 'pre-compact-uuid',
				isSidechain: false,
			};

			const result = validator.validate(entry);
			expect(result.error).toBeUndefined();
			expect(result.content?.uuid).toBe('compact-uuid');
			expect(result.content?.parentUuid).toBeNull();
			expect(result.content?.logicalParentUuid).toBe('pre-compact-uuid');
		});

		it('should handle entries with null parentUuid', () => {
			const entry = {
				uuid: 'uuid-1',
				parentUuid: null,
			};

			const result = validator.validate(entry);
			expect(result.error).toBeUndefined();
			expect(result.content?.parentUuid).toBeNull();
		});

		it('should reject entries without a uuid', () => {
			const entry = {
				type: 'queue-operation',
				operation: 'dequeue',
				timestamp: '2026-01-31T00:34:50.025Z',
				sessionId: 'session-1',
			};

			const result = validator.validate(entry);
			expect(result.error).toBeDefined();
		});

		it('should extract from progress/stop_hook entries', () => {
			const entry = {
				uuid: 'progress-uuid',
				parentUuid: 'msg-uuid',
				type: 'progress',
				data: { type: 'agent_progress' },
			};

			const result = validator.validate(entry);
			expect(result.error).toBeUndefined();
			expect(result.content?.uuid).toBe('progress-uuid');
			expect(result.content?.parentUuid).toBe('msg-uuid');
		});
	});

});

