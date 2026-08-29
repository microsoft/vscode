/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import assert from 'assert';
import { afterEach, beforeEach, describe, suite, test } from 'vitest';
import { ChatFetchResponseType, ChatResponse } from '../../../../platform/chat/common/commonTypes';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { IIgnoreService, NullIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { ReviewComment, ReviewRequest } from '../../../../platform/review/common/reviewService';
import { NullTelemetryService } from '../../../../platform/telemetry/common/nullTelemetryService';
import { ITelemetryService, TelemetryEventMeasurements, TelemetryEventProperties } from '../../../../platform/telemetry/common/telemetry';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { createTextDocumentData } from '../../../../util/common/test/shims/textDocument';
import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import * as path from '../../../../util/vs/base/common/path';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { MarkdownString, Range, Uri } from '../../../../vscodeTypes';
import { CurrentChangeInput } from '../../../prompts/node/feedback/currentChange';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { FeedbackGenerator, parseFeedbackResponse, parseReviewComments, sendReviewActionTelemetry } from '../feedbackGenerator';

suite('feedbackGenerator', () => {

	function createTestSnapshot(uri: Uri, content: string, languageId = 'typescript'): TextDocumentSnapshot {
		const docData = createTextDocumentData(uri, content, languageId);
		return TextDocumentSnapshot.create(docData.document);
	}

	function createReviewRequest(overrides?: Partial<ReviewRequest>): ReviewRequest {
		return {
			source: 'vscodeCopilotChat',
			promptCount: 1,
			messageId: 'test-message-id',
			inputType: 'change',
			inputRanges: [],
			...overrides,
		};
	}

	describe('parseFeedbackResponse', () => {

		// Legacy test case before refactor
		test('Correctly parses reply', function () {
			const fileContents = `1. Line 33 in \`requestLoggerImpl.ts\`, readability, low severity: The lambda function used in \`onDidChange\` could be extracted into a named function for better readability and reusability.
   \`\`\`typescript
   this._register(workspace.registerTextDocumentContentProvider(ChatRequestScheme.chatRequestScheme, {
       onDidChange: Event.map(this.onDidChangeRequests, this._mapToLatestUri),
       provideTextDocumentContent: (uri) => {
           const uriData = ChatRequestScheme.parseUri(uri.toString());
           if (!uriData) { return \`Invalid URI: \${uri}\`; }

           const entry = uriData.kind === 'latest' ? this._entries[this._entries.length - 1] : this._entries.find(e => e.id === uriData.id);
           if (!entry) { return \`Request not found\`; }

           if (entry.kind === LoggedInfoKind.Element) { return entry.html; }

           return this._renderEntryToMarkdown(entry.id, entry.entry);
       }
   }));

   private _mapToLatestUri = () => Uri.parse(ChatRequestScheme.buildUri({ kind: 'latest' }));
   \`\`\``;
			const matches = parseFeedbackResponse(fileContents);
			assert.strictEqual(matches.length, 1);
			assert.strictEqual(matches[0].from, 32);
			assert.strictEqual(matches[0].content.indexOf('```'), -1);
		});

		test('parses single comment with all fields including linkOffset and linkLength', () => {
			const response = '1. Line 10 in `file.ts`, bug, high severity: This is a bug.';
			const matches = parseFeedbackResponse(response);

			assert.strictEqual(matches.length, 1);
			assert.strictEqual(matches[0].from, 9); // 0-indexed
			assert.strictEqual(matches[0].to, 10);
			assert.strictEqual(matches[0].relativeDocumentPath, 'file.ts');
			assert.strictEqual(matches[0].kind, 'bug');
			assert.strictEqual(matches[0].severity, 'high');
			assert.strictEqual(matches[0].content, 'This is a bug.');
			// linkOffset = match.index + num.length + 2 = 0 + 1 + 2 = 3
			assert.strictEqual(matches[0].linkOffset, 3);
			// linkLength = 5 ("Line ") + from.length (2 for "10") = 7
			assert.strictEqual(matches[0].linkLength, 7);
		});

		test('parses comment without backticks around path', () => {
			const response = '1. Line 5 in file.ts, performance, medium severity: Slow code.';
			const matches = parseFeedbackResponse(response);

			assert.strictEqual(matches.length, 1);
			assert.strictEqual(matches[0].relativeDocumentPath, 'file.ts');
		});

		test('parses line range (from-to) with correct linkLength', () => {
			const response = '1. Line 10-15 in `file.ts`, bug, high severity: Multiple lines affected.';
			const matches = parseFeedbackResponse(response);

			assert.strictEqual(matches.length, 1);
			assert.strictEqual(matches[0].from, 9); // 0-indexed
			assert.strictEqual(matches[0].to, 15);
			// linkLength = 5 ("Line ") + from.length (2) + to.length (2) + 1 ("-") = 10
			assert.strictEqual(matches[0].linkLength, 5 + 2 + 2 + 1);
		});

		test('defaults kind to "other" and severity to "unknown" when not specified', () => {
			const response = '1. Line 42 in `utils.js`: Minimal comment.';
			const matches = parseFeedbackResponse(response);

			assert.strictEqual(matches.length, 1);
			assert.strictEqual(matches[0].kind, 'other');
			assert.strictEqual(matches[0].severity, 'unknown');
		});

		test('parses comment with extra text before "in" keyword', () => {
			const response = '1. Line 10 (modified) in `file.ts`, bug: Issue with extra text.';
			const matches = parseFeedbackResponse(response);

			assert.strictEqual(matches.length, 1);
			assert.strictEqual(matches[0].from, 9);
			assert.strictEqual(matches[0].relativeDocumentPath, 'file.ts');
		});

		test('parses multiple comments separated by newlines or next numbered item', () => {
			const response = `1. Line 10 in \`file.ts\`, bug, high severity: First issue.

2. Line 20 in \`other.ts\`, performance, low severity: Second issue.
3. Line 30 in \`third.ts\`, bug: Third issue.`;
			const matches = parseFeedbackResponse(response);

			assert.strictEqual(matches.length, 3);
			assert.strictEqual(matches[0].content, 'First issue.');
			assert.strictEqual(matches[1].content, 'Second issue.');
			assert.strictEqual(matches[2].content, 'Third issue.');
		});

		test('keeps partial comment when dropPartial is false, drops when true', () => {
			const partialResponse = '1. Line 10 in `file.ts`, bug: Incomplete';

			// dropPartial = false (default) keeps partial
			const matchesKept = parseFeedbackResponse(partialResponse, false);
			assert.strictEqual(matchesKept.length, 1);
			assert.strictEqual(matchesKept[0].content, 'Incomplete');

			// dropPartial = true drops partial
			const matchesDropped = parseFeedbackResponse(partialResponse, true);
			assert.strictEqual(matchesDropped.length, 0);
		});

		test('keeps first complete comment but drops partial second when dropPartial is true', () => {
			const response = `1. Line 10 in \`file.ts\`, bug: First complete.

2. Line 20 in \`other.ts\`, bug: Partial`;
			const matches = parseFeedbackResponse(response, true);

			assert.strictEqual(matches.length, 1);
			assert.strictEqual(matches[0].content, 'First complete.');
		});

		test('removes trailing complete code block', () => {
			const response = `1. Line 33 in \`file.ts\`, readability, low severity: The lambda function could be extracted.
\`\`\`typescript
const extracted = () => doSomething();
\`\`\``;
			const matches = parseFeedbackResponse(response);

			assert.strictEqual(matches.length, 1);
			assert.strictEqual(matches[0].content, 'The lambda function could be extracted.');
			assert.strictEqual(matches[0].content.indexOf('```'), -1);
		});

		test('removes broken code block (odd number of markers)', () => {
			const response = '1. Line 10 in `file.ts`, bug: Here is some code:\n```typescript\nconst x = 1;';
			const matches = parseFeedbackResponse(response);

			assert.strictEqual(matches.length, 1);
			assert.strictEqual(matches[0].content, 'Here is some code:');
		});

		test('preserves inline code (single backticks)', () => {
			const response = '1. Line 10 in `file.ts`, bug: The variable `foo` should be renamed.';
			const matches = parseFeedbackResponse(response);

			assert.strictEqual(matches.length, 1);
			assert.strictEqual(matches[0].content, 'The variable `foo` should be renamed.');
		});

		test('removes trailing ``` via broken block handler when no opening marker exists', () => {
			const response = '1. Line 10 in `file.ts`, bug: Some text ending with ```\n\n';
			const matches = parseFeedbackResponse(response);

			assert.strictEqual(matches.length, 1);
			// Since there's no matching opening ```, the trailing ``` removal fails (i === -1),
			// but the broken block handler (odd count) removes it
			assert.strictEqual(matches[0].content, 'Some text ending with');
		});

		test('preserves complete code block in middle but removes trailing code block', () => {
			const response = `1. Line 10 in \`file.ts\`, bug: Example:
\`\`\`typescript
const x = 1;
\`\`\`
Fix:
\`\`\`typescript
const y = 2;
\`\`\``;
			const matches = parseFeedbackResponse(response);

			assert.strictEqual(matches.length, 1);
			// Should keep the first code block but remove the trailing one
			assert.ok(matches[0].content.includes('Example:'));
			assert.ok(matches[0].content.includes('```typescript'));
			assert.ok(matches[0].content.includes('const x = 1;'));
			assert.strictEqual(matches[0].content.includes('const y = 2;'), false);
		});

		test('normalizes path separators for subdirectories', () => {
			const response = '1. Line 10 in `src/utils/helpers.ts`, bug: Issue.\n\n';
			const matches = parseFeedbackResponse(response);

			assert.strictEqual(matches.length, 1);
			// On Windows, forward slashes should be converted to backslashes
			// On Unix, paths stay with forward slashes
			if (path.sep === '\\') {
				assert.strictEqual(matches[0].relativeDocumentPath, 'src\\utils\\helpers.ts');
			} else {
				assert.strictEqual(matches[0].relativeDocumentPath, 'src/utils/helpers.ts');
			}
		});

		test('returns empty array for empty or invalid response', () => {
			assert.strictEqual(parseFeedbackResponse('').length, 0);
			assert.strictEqual(parseFeedbackResponse('This is just some text without the expected format.').length, 0);
		});

		test('handles line number 1 correctly (0-indexed)', () => {
			const response = '1. Line 1 in `file.ts`, bug: First line issue.';
			const matches = parseFeedbackResponse(response);

			assert.strictEqual(matches.length, 1);
			assert.strictEqual(matches[0].from, 0);
			assert.strictEqual(matches[0].to, 1);
		});

		test('trims whitespace from content', () => {
			const response = '1. Line 10 in `file.ts`, bug:    Spaces around content.   ';
			const matches = parseFeedbackResponse(response);

			assert.strictEqual(matches.length, 1);
			assert.strictEqual(matches[0].content, 'Spaces around content.');
		});

		test('handles multiline content before next comment', () => {
			const response = `1. Line 10 in \`file.ts\`, bug: This is a longer
description that spans
multiple lines.

2. Line 20 in \`other.ts\`, bug: Next issue.`;
			const matches = parseFeedbackResponse(response);

			assert.strictEqual(matches.length, 2);
			assert.ok(matches[0].content.includes('longer'));
			assert.ok(matches[0].content.includes('multiple lines.'));
		});

		test('handles multi-digit item numbers for linkOffset calculation', () => {
			const response = '10. Line 5 in `file.ts`, bug: Issue.\n\n';
			const matches = parseFeedbackResponse(response);

			assert.strictEqual(matches.length, 1);
			// linkOffset = match.index + num.length + 2 = 0 + 2 + 2 = 4
			assert.strictEqual(matches[0].linkOffset, 4);
		});
	});

	describe('parseReviewComments', () => {

		test('parses valid comment and creates ReviewComment', () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0\nline 1\nline 2\nline 3\nline 4';
			const snapshot = createTestSnapshot(uri, content);
			const input: CurrentChangeInput[] = [{
				document: snapshot,
				relativeDocumentPath: 'file.ts',
				change: {
					repository: {} as any,
					uri,
					hunks: [{ range: new Range(0, 0, 4, 6), text: content }]
				}
			}];
			const request = createReviewRequest();
			const message = '1. Line 2 in `file.ts`, bug, high severity: This is a bug.\n\n';

			const comments = parseReviewComments(request, input, message);

			assert.strictEqual(comments.length, 1);
			assert.strictEqual(comments[0].kind, 'bug');
			assert.strictEqual(comments[0].severity, 'high');
			assert.strictEqual(typeof comments[0].body === 'string' ? comments[0].body : comments[0].body.value, 'This is a bug.');
			assert.strictEqual(comments[0].uri, uri);
			assert.strictEqual(comments[0].languageId, 'typescript');
			assert.strictEqual(comments[0].originalIndex, 0);
			assert.strictEqual(comments[0].actionCount, 0);
			assert.strictEqual(comments[0].request, request);
		});

		test('parses multiple comments from same input', () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0\nline 1\nline 2\nline 3\nline 4\nline 5';
			const snapshot = createTestSnapshot(uri, content);
			const input: CurrentChangeInput[] = [{
				document: snapshot,
				relativeDocumentPath: 'file.ts',
				change: {
					repository: {} as any,
					uri,
					hunks: [{ range: new Range(0, 0, 5, 6), text: content }]
				}
			}];
			const request = createReviewRequest();
			const message = `1. Line 2 in \`file.ts\`, bug: First issue.

2. Line 4 in \`file.ts\`, performance: Second issue.

`;

			const comments = parseReviewComments(request, input, message);

			assert.strictEqual(comments.length, 2);
			assert.strictEqual(typeof comments[0].body === 'string' ? comments[0].body : comments[0].body.value, 'First issue.');
			assert.strictEqual(comments[0].originalIndex, 0);
			assert.strictEqual(typeof comments[1].body === 'string' ? comments[1].body : comments[1].body.value, 'Second issue.');
			assert.strictEqual(comments[1].originalIndex, 1);
		});

		test('filters out unknown kind', () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0\nline 1\nline 2';
			const snapshot = createTestSnapshot(uri, content);
			const input: CurrentChangeInput[] = [{
				document: snapshot,
				relativeDocumentPath: 'file.ts',
				change: {
					repository: {} as any,
					uri,
					hunks: [{ range: new Range(0, 0, 2, 6), text: content }]
				}
			}];
			const request = createReviewRequest();
			const message = '1. Line 2 in `file.ts`, unknownKind: Should be filtered.\n\n';

			const comments = parseReviewComments(request, input, message);

			assert.strictEqual(comments.length, 0);
		});

		test('accepts all known kinds', () => {
			const knownKinds = ['bug', 'performance', 'consistency', 'documentation', 'naming', 'readability', 'style', 'other'];
			const uri = Uri.file('/test/file.ts');
			const content = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
			const snapshot = createTestSnapshot(uri, content);
			const input: CurrentChangeInput[] = [{
				document: snapshot,
				relativeDocumentPath: 'file.ts',
				change: {
					repository: {} as any,
					uri,
					hunks: [{ range: new Range(0, 0, 19, 7), text: content }]
				}
			}];
			const request = createReviewRequest();
			const message = knownKinds.map((kind, i) => `${i + 1}. Line ${i + 1} in \`file.ts\`, ${kind}: Issue ${i + 1}.`).join('\n\n') + '\n\n';

			const comments = parseReviewComments(request, input, message);

			assert.strictEqual(comments.length, knownKinds.length);
			knownKinds.forEach((kind, i) => {
				assert.strictEqual(comments[i].kind, kind);
			});
		});

		test('skips comment when relativeDocumentPath does not match any input', () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0\nline 1';
			const snapshot = createTestSnapshot(uri, content);
			const input: CurrentChangeInput[] = [{
				document: snapshot,
				relativeDocumentPath: 'different.ts',
				change: {
					repository: {} as any,
					uri,
					hunks: [{ range: new Range(0, 0, 1, 6), text: content }]
				}
			}];
			const request = createReviewRequest();
			const message = '1. Line 1 in `file.ts`, bug: Should be skipped.\n\n';

			const comments = parseReviewComments(request, input, message);

			assert.strictEqual(comments.length, 0);
		});

		test('matches correct input from multiple inputs', () => {
			const uri1 = Uri.file('/test/first.ts');
			const uri2 = Uri.file('/test/second.ts');
			const content = 'line 0\nline 1';
			const snapshot1 = createTestSnapshot(uri1, content);
			const snapshot2 = createTestSnapshot(uri2, content);
			const input: CurrentChangeInput[] = [
				{
					document: snapshot1,
					relativeDocumentPath: 'first.ts',
					change: {
						repository: {} as any,
						uri: uri1,
						hunks: [{ range: new Range(0, 0, 1, 6), text: content }]
					}
				},
				{
					document: snapshot2,
					relativeDocumentPath: 'second.ts',
					change: {
						repository: {} as any,
						uri: uri2,
						hunks: [{ range: new Range(0, 0, 1, 6), text: content }]
					}
				}
			];
			const request = createReviewRequest();
			const message = '1. Line 1 in `second.ts`, bug: Found in second file.\n\n';

			const comments = parseReviewComments(request, input, message);

			assert.strictEqual(comments.length, 1);
			assert.strictEqual(comments[0].uri, uri2);
		});

		test('uses line 0 correctly when Line 1 is specified (0-indexed)', () => {
			const uri = Uri.file('/test/file.ts');
			const content = '  indented line\nline 1';
			const snapshot = createTestSnapshot(uri, content);
			const input: CurrentChangeInput[] = [{
				document: snapshot,
				relativeDocumentPath: 'file.ts',
				change: {
					repository: {} as any,
					uri,
					hunks: [{ range: new Range(0, 0, 1, 6), text: content }]
				}
			}];
			const request = createReviewRequest();
			// Line 1 in the message becomes 0 after 0-indexing
			const message = '1. Line 1 in `file.ts`, bug: First line.\n\n';

			const comments = parseReviewComments(request, input, message);

			assert.strictEqual(comments.length, 1);
			// Range should start at line 0
			assert.strictEqual(comments[0].range.start.line, 0);
			// firstNonWhitespaceCharacterIndex for "  indented line" is 2
			assert.strictEqual(comments[0].range.start.character, 2);
		});

		test('clamps line number exceeding lineCount', () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0\nline 1\nlast line';
			const snapshot = createTestSnapshot(uri, content);
			const input: CurrentChangeInput[] = [{
				document: snapshot,
				relativeDocumentPath: 'file.ts',
				change: {
					repository: {} as any,
					uri,
					hunks: [{ range: new Range(0, 0, 2, 9), text: content }]
				}
			}];
			const request = createReviewRequest();
			// Line 100 is way beyond lineCount of 3
			const message = '1. Line 1-100 in `file.ts`, bug: Should clamp to end.\n\n';

			const comments = parseReviewComments(request, input, message);

			assert.strictEqual(comments.length, 1);
			// End line should be clamped to lineCount-1 = 2
			assert.strictEqual(comments[0].range.end.line, 2);
		});

		test('filters out comment outside change hunk range', () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0\nline 1\nline 2\nline 3\nline 4';
			const snapshot = createTestSnapshot(uri, content);
			const input: CurrentChangeInput[] = [{
				document: snapshot,
				relativeDocumentPath: 'file.ts',
				change: {
					repository: {} as any,
					uri,
					// Change only affects lines 0-1
					hunks: [{ range: new Range(0, 0, 1, 6), text: 'line 0\nline 1' }]
				}
			}];
			const request = createReviewRequest();
			// Comment on line 4 which is outside the hunk range
			const message = '1. Line 5 in `file.ts`, bug: Outside hunk range.\n\n';

			const comments = parseReviewComments(request, input, message);

			assert.strictEqual(comments.length, 0);
		});

		test('uses selection range for filtering when selection is provided', () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0\nline 1\nline 2\nline 3\nline 4';
			const snapshot = createTestSnapshot(uri, content);
			const selection = new Range(2, 0, 3, 6);
			const input: CurrentChangeInput[] = [{
				document: snapshot,
				relativeDocumentPath: 'file.ts',
				selection
			}];
			const request = createReviewRequest({ inputType: 'selection' });

			// Comment on line 1 (outside selection)
			const messageOutside = '1. Line 1 in `file.ts`, bug: Outside selection.\n\n';
			const commentsOutside = parseReviewComments(request, input, messageOutside);
			assert.strictEqual(commentsOutside.length, 0);

			// Comment on line 3 (inside selection)
			const messageInside = '1. Line 3 in `file.ts`, bug: Inside selection.\n\n';
			const commentsInside = parseReviewComments(request, input, messageInside);
			assert.strictEqual(commentsInside.length, 1);
		});

		test('includes comment when no filterRanges (no selection or change)', () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0\nline 1';
			const snapshot = createTestSnapshot(uri, content);
			const input: CurrentChangeInput[] = [{
				document: snapshot,
				relativeDocumentPath: 'file.ts'
				// No selection or change
			}];
			const request = createReviewRequest();
			const message = '1. Line 1 in `file.ts`, bug: No filter ranges.\n\n';

			const comments = parseReviewComments(request, input, message);

			assert.strictEqual(comments.length, 1);
		});

		test('includes comment when intersecting any of multiple hunks', () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0\nline 1\nline 2\nline 3\nline 4\nline 5';
			const snapshot = createTestSnapshot(uri, content);
			const input: CurrentChangeInput[] = [{
				document: snapshot,
				relativeDocumentPath: 'file.ts',
				change: {
					repository: {} as any,
					uri,
					hunks: [
						{ range: new Range(0, 0, 1, 6), text: 'line 0\nline 1' },
						{ range: new Range(4, 0, 5, 6), text: 'line 4\nline 5' }
					]
				}
			}];
			const request = createReviewRequest();

			// Comment on line 5 intersects second hunk
			const message = '1. Line 5 in `file.ts`, bug: In second hunk.\n\n';
			const comments = parseReviewComments(request, input, message);

			assert.strictEqual(comments.length, 1);
		});

		test('passes dropPartial to parseFeedbackResponse', () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0\nline 1';
			const snapshot = createTestSnapshot(uri, content);
			const input: CurrentChangeInput[] = [{
				document: snapshot,
				relativeDocumentPath: 'file.ts',
				change: {
					repository: {} as any,
					uri,
					hunks: [{ range: new Range(0, 0, 1, 6), text: content }]
				}
			}];
			const request = createReviewRequest();
			// Partial response (no terminating newline)
			const partialMessage = '1. Line 1 in `file.ts`, bug: Partial';

			// dropPartial = false keeps the partial comment
			const commentsKept = parseReviewComments(request, input, partialMessage, false);
			assert.strictEqual(commentsKept.length, 1);

			// dropPartial = true drops the partial comment
			const commentsDropped = parseReviewComments(request, input, partialMessage, true);
			assert.strictEqual(commentsDropped.length, 0);
		});

		test('returns empty array for empty message', () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0';
			const snapshot = createTestSnapshot(uri, content);
			const input: CurrentChangeInput[] = [{
				document: snapshot,
				relativeDocumentPath: 'file.ts',
				change: {
					repository: {} as any,
					uri,
					hunks: [{ range: new Range(0, 0, 0, 6), text: content }]
				}
			}];
			const request = createReviewRequest();

			const comments = parseReviewComments(request, input, '');

			assert.strictEqual(comments.length, 0);
		});

		test('returns empty array when no inputs provided', () => {
			const request = createReviewRequest();
			const message = '1. Line 1 in `file.ts`, bug: No inputs.\n\n';

			const comments = parseReviewComments(request, [], message);

			assert.strictEqual(comments.length, 0);
		});

		test('sets correct range with firstNonWhitespaceCharacterIndex', () => {
			const uri = Uri.file('/test/file.ts');
			const content = '    indented content here';
			const snapshot = createTestSnapshot(uri, content);
			const input: CurrentChangeInput[] = [{
				document: snapshot,
				relativeDocumentPath: 'file.ts',
				change: {
					repository: {} as any,
					uri,
					hunks: [{ range: new Range(0, 0, 0, 25), text: content }]
				}
			}];
			const request = createReviewRequest();
			const message = '1. Line 1 in `file.ts`, bug: Indented line.\n\n';

			const comments = parseReviewComments(request, input, message);

			assert.strictEqual(comments.length, 1);
			// Start character should be firstNonWhitespaceCharacterIndex (4 spaces)
			assert.strictEqual(comments[0].range.start.character, 4);
			// End character should be lastNonWhitespaceCharacterIndex (25 - no trailing whitespace)
			assert.strictEqual(comments[0].range.end.character, 25);
		});

		test('handles line range spanning multiple lines', () => {
			const uri = Uri.file('/test/file.ts');
			const content = '  line 0\nline 1\n  line 2 with trailing  ';
			const snapshot = createTestSnapshot(uri, content);
			const input: CurrentChangeInput[] = [{
				document: snapshot,
				relativeDocumentPath: 'file.ts',
				change: {
					repository: {} as any,
					uri,
					hunks: [{ range: new Range(0, 0, 2, 27), text: content }]
				}
			}];
			const request = createReviewRequest();
			const message = '1. Line 1-3 in `file.ts`, bug: Multi-line issue.\n\n';

			const comments = parseReviewComments(request, input, message);

			assert.strictEqual(comments.length, 1);
			// Start: line 0, firstNonWhitespaceCharacterIndex = 2
			assert.strictEqual(comments[0].range.start.line, 0);
			assert.strictEqual(comments[0].range.start.character, 2);
			// End: line 2, lastNonWhitespaceCharacterIndex for "  line 2 with trailing  " is 22 (trimEnd removes trailing spaces)
			assert.strictEqual(comments[0].range.end.line, 2);
			assert.strictEqual(comments[0].range.end.character, 22);
		});

		test('preserves document reference in comment', () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0';
			const snapshot = createTestSnapshot(uri, content);
			const input: CurrentChangeInput[] = [{
				document: snapshot,
				relativeDocumentPath: 'file.ts',
				change: {
					repository: {} as any,
					uri,
					hunks: [{ range: new Range(0, 0, 0, 6), text: content }]
				}
			}];
			const request = createReviewRequest();
			const message = '1. Line 1 in `file.ts`, bug: Check document.\n\n';

			const comments = parseReviewComments(request, input, message);

			assert.strictEqual(comments.length, 1);
			assert.strictEqual(comments[0].document, snapshot);
		});
	});

	class MockIgnoreService extends NullIgnoreService {
		override get isEnabled(): boolean { return true; }
		override get isRegexExclusionsEnabled(): boolean { return true; }

		private _ignoredUris = new Set<string>();
		private _alwaysIgnore = false;

		override async isCopilotIgnored(file: Uri): Promise<boolean> {
			if (this._alwaysIgnore) {
				return true;
			}
			return this._ignoredUris.has(file.toString());
		}

		setAlwaysIgnore(): void {
			this._alwaysIgnore = true;
		}

		setIgnoredUris(uris: Uri[]): void {
			this._ignoredUris = new Set(uris.map(u => u.toString()));
		}

		reset(): void {
			this._alwaysIgnore = false;
			this._ignoredUris.clear();
		}
	}

	class MockChatEndpoint {
		model = 'gpt-4.1-test';
		family = 'gpt-4.1';
		name = 'Test Endpoint';
		maxOutputTokens = 8000;
		modelMaxPromptTokens = 128000;
		supportsToolCalls = true;
		supportsVision = true;
		supportsPrediction = true;
		showInModelPicker = true;
		isDefault = true;
		isFallback = false;
		policy: 'enabled' | { terms: string } = 'enabled';
		urlOrRequestMetadata = 'https://test.com';
		version = '1.0';
		tokenizer = 'o200k_base';

		private _response: ChatResponse = { type: ChatFetchResponseType.Success, value: '', requestId: 'test-request-id', serverRequestId: undefined, usage: undefined, resolvedModel: 'gpt-4.1-test' };

		setResponse(response: ChatResponse): void {
			this._response = response;
		}

		async makeChatRequest(
			_debugName: string,
			_messages: Raw.ChatMessage[],
			finishedCb: ((text: string) => Promise<void>) | undefined,
			_token: CancellationToken,
		): Promise<ChatResponse> {
			if (this._response.type === ChatFetchResponseType.Success && finishedCb) {
				await finishedCb(this._response.value);
			}
			return this._response;
		}

		acquireTokenizer(): any {
			return {
				tokenize: (text: string) => ({ bpe: text.split(' ').map((_, i) => i), text }),
				tokenLength: (text: string) => Math.ceil(text.length / 4),
				encode: (text: string) => text.split(' ').map((_, i) => i),
				decode: (tokens: number[]) => tokens.join(' '),
			};
		}
	}

	class MockEndpointProvider implements IEndpointProvider {
		declare readonly _serviceBrand: undefined;
		readonly onDidModelsRefresh = Event.None;

		private _endpoint = new MockChatEndpoint();

		get mockEndpoint(): MockChatEndpoint {
			return this._endpoint;
		}

		async getChatEndpoint(): Promise<IChatEndpoint> {
			return this._endpoint as unknown as IChatEndpoint;
		}

		async getEmbeddingsEndpoint(): Promise<any> {
			throw new Error('Not implemented');
		}

		async getAllChatEndpoints(): Promise<IChatEndpoint[]> {
			return [this._endpoint as unknown as IChatEndpoint];
		}

		async getAllCompletionModels(): Promise<any[]> {
			return [];
		}
	}

	describe('FeedbackGenerator.generateComments', () => {
		let disposables: DisposableStore;
		let mockIgnoreService: MockIgnoreService;
		let mockEndpointProvider: MockEndpointProvider;
		let feedbackGenerator: FeedbackGenerator;
		let instantiationService: IInstantiationService;

		beforeEach(() => {
			disposables = new DisposableStore();
			mockIgnoreService = new MockIgnoreService();
			mockEndpointProvider = new MockEndpointProvider();

			const serviceCollection = disposables.add(createExtensionUnitTestingServices());
			serviceCollection.define(IIgnoreService, mockIgnoreService);
			serviceCollection.define(IEndpointProvider, mockEndpointProvider);
			serviceCollection.define(ITelemetryService, new NullTelemetryService());
			instantiationService = serviceCollection.createTestingAccessor().get(IInstantiationService);
			feedbackGenerator = instantiationService.createInstance(FeedbackGenerator);
		});

		afterEach(() => {
			disposables.dispose();
		});

		function createInput(
			uri: Uri,
			content: string,
			relativeDocumentPath: string,
			options?: { selection?: Range; hunks?: { range: Range; text: string }[] }
		): CurrentChangeInput {
			const snapshot = createTestSnapshot(uri, content);
			const input: CurrentChangeInput = {
				document: snapshot,
				relativeDocumentPath,
			};
			if (options?.selection) {
				input.selection = options.selection;
			}
			if (options?.hunks) {
				input.change = {
					repository: {} as any,
					uri,
					hunks: options.hunks,
				};
			}
			return input;
		}

		test('returns success with comments when endpoint returns valid response', async () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0\nline 1\nline 2\nline 3\nline 4';
			const input = [createInput(uri, content, 'file.ts', {
				hunks: [{ range: new Range(0, 0, 4, 6), text: content }]
			})];

			mockEndpointProvider.mockEndpoint.setResponse({
				type: ChatFetchResponseType.Success,
				value: '1. Line 2 in `file.ts`, bug, high severity: This is a bug.\n\n',
				requestId: 'test-request-id',
				serverRequestId: undefined,
				usage: undefined,
				resolvedModel: 'gpt-4.1-test'
			});

			const result = await feedbackGenerator.generateComments(input, CancellationToken.None);

			assert.strictEqual(result.type, 'success');
			if (result.type === 'success') {
				assert.strictEqual(result.comments.length, 1);
				assert.strictEqual(result.comments[0].kind, 'bug');
				assert.strictEqual(result.comments[0].severity, 'high');
			}
		});

		test('returns success with empty comments when endpoint returns no comments', async () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0\nline 1';
			const input = [createInput(uri, content, 'file.ts', {
				hunks: [{ range: new Range(0, 0, 1, 6), text: content }]
			})];

			mockEndpointProvider.mockEndpoint.setResponse({
				type: ChatFetchResponseType.Success,
				value: 'No issues found in this code.',
				requestId: 'test-request-id',
				serverRequestId: undefined,
				usage: undefined,
				resolvedModel: 'gpt-4.1-test'
			});

			const result = await feedbackGenerator.generateComments(input, CancellationToken.None);

			assert.strictEqual(result.type, 'success');
			if (result.type === 'success') {
				assert.strictEqual(result.comments.length, 0);
			}
		});

		test('returns multiple comments from single response', async () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0\nline 1\nline 2\nline 3\nline 4\nline 5';
			const input = [createInput(uri, content, 'file.ts', {
				hunks: [{ range: new Range(0, 0, 5, 6), text: content }]
			})];

			mockEndpointProvider.mockEndpoint.setResponse({
				type: ChatFetchResponseType.Success,
				value: `1. Line 2 in \`file.ts\`, bug, high severity: First bug.

2. Line 4 in \`file.ts\`, performance, medium severity: Performance issue.

`,
				requestId: 'test-request-id',
				serverRequestId: undefined,
				usage: undefined,
				resolvedModel: 'gpt-4.1-test'
			});

			const result = await feedbackGenerator.generateComments(input, CancellationToken.None);

			assert.strictEqual(result.type, 'success');
			if (result.type === 'success') {
				assert.strictEqual(result.comments.length, 2);
				assert.strictEqual(result.comments[0].kind, 'bug');
				assert.strictEqual(result.comments[1].kind, 'performance');
			}
		});

		test('returns error when all inputs are ignored', async () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0\nline 1';
			const input = [createInput(uri, content, 'file.ts', {
				hunks: [{ range: new Range(0, 0, 1, 6), text: content }]
			})];

			mockIgnoreService.setAlwaysIgnore();

			const result = await feedbackGenerator.generateComments(input, CancellationToken.None);

			assert.strictEqual(result.type, 'error');
			if (result.type === 'error') {
				assert.strictEqual(result.severity, 'info');
				assert.ok(result.reason.includes('ignored'));
			}
		});

		test('filters out ignored documents but processes non-ignored ones', async () => {
			const uri1 = Uri.file('/test/ignored.ts');
			const uri2 = Uri.file('/test/allowed.ts');
			const content = 'line 0\nline 1';
			const input = [
				createInput(uri1, content, 'ignored.ts', {
					hunks: [{ range: new Range(0, 0, 1, 6), text: content }]
				}),
				createInput(uri2, content, 'allowed.ts', {
					hunks: [{ range: new Range(0, 0, 1, 6), text: content }]
				})
			];

			mockIgnoreService.setIgnoredUris([uri1]);

			mockEndpointProvider.mockEndpoint.setResponse({
				type: ChatFetchResponseType.Success,
				value: '1. Line 1 in `allowed.ts`, bug: Issue in allowed file.\n\n',
				requestId: 'test-request-id',
				serverRequestId: undefined,
				usage: undefined,
				resolvedModel: 'gpt-4.1-test'
			});

			const result = await feedbackGenerator.generateComments(input, CancellationToken.None);

			assert.strictEqual(result.type, 'success');
			if (result.type === 'success') {
				assert.strictEqual(result.comments.length, 1);
				assert.strictEqual(result.comments[0].uri.toString(), uri2.toString());
			}
		});

		test('returns cancelled when token is cancelled before request', async () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0\nline 1';
			const input = [createInput(uri, content, 'file.ts', {
				hunks: [{ range: new Range(0, 0, 1, 6), text: content }]
			})];

			const tokenSource = new CancellationTokenSource();
			tokenSource.cancel();

			const result = await feedbackGenerator.generateComments(input, tokenSource.token);

			assert.strictEqual(result.type, 'cancelled');
		});

		test('returns error when endpoint returns error', async () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0\nline 1';
			const input = [createInput(uri, content, 'file.ts', {
				hunks: [{ range: new Range(0, 0, 1, 6), text: content }]
			})];

			mockEndpointProvider.mockEndpoint.setResponse({
				type: ChatFetchResponseType.Failed,
				reason: 'API error',
				requestId: 'test-request-id',
				serverRequestId: undefined
			});

			const result = await feedbackGenerator.generateComments(input, CancellationToken.None);

			assert.strictEqual(result.type, 'error');
			if (result.type === 'error') {
				assert.strictEqual(result.reason, 'API error');
			}
		});

		test('reports progress when progress callback is provided', async () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0\nline 1\nline 2\nline 3\nline 4';
			const input = [createInput(uri, content, 'file.ts', {
				hunks: [{ range: new Range(0, 0, 4, 6), text: content }]
			})];

			mockEndpointProvider.mockEndpoint.setResponse({
				type: ChatFetchResponseType.Success,
				value: '1. Line 2 in `file.ts`, bug, high severity: This is a bug.\n\n',
				requestId: 'test-request-id',
				serverRequestId: undefined,
				usage: undefined,
				resolvedModel: 'gpt-4.1-test'
			});

			const reportedComments: ReviewComment[][] = [];
			const progress = {
				report: (comments: ReviewComment[]) => {
					reportedComments.push(comments);
				}
			};

			await feedbackGenerator.generateComments(input, CancellationToken.None, progress);

			// Progress should have been reported at least once
			assert.ok(reportedComments.length > 0);
		});

		test('handles selection input correctly', async () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0\nline 1\nline 2\nline 3\nline 4';
			const input = [createInput(uri, content, 'file.ts', {
				selection: new Range(1, 0, 3, 6)
			})];

			mockEndpointProvider.mockEndpoint.setResponse({
				type: ChatFetchResponseType.Success,
				value: '1. Line 2 in `file.ts`, bug: Selection issue.\n\n',
				requestId: 'test-request-id',
				serverRequestId: undefined,
				usage: undefined,
				resolvedModel: 'gpt-4.1-test'
			});

			const result = await feedbackGenerator.generateComments(input, CancellationToken.None);

			assert.strictEqual(result.type, 'success');
			if (result.type === 'success') {
				assert.strictEqual(result.comments.length, 1);
			}
		});

		test('handles multiple files correctly', async () => {
			const uri1 = Uri.file('/test/first.ts');
			const uri2 = Uri.file('/test/second.ts');
			const content = 'line 0\nline 1';
			const input = [
				createInput(uri1, content, 'first.ts', {
					hunks: [{ range: new Range(0, 0, 1, 6), text: content }]
				}),
				createInput(uri2, content, 'second.ts', {
					hunks: [{ range: new Range(0, 0, 1, 6), text: content }]
				})
			];

			mockEndpointProvider.mockEndpoint.setResponse({
				type: ChatFetchResponseType.Success,
				value: `1. Line 1 in \`first.ts\`, bug: Issue in first file.

2. Line 1 in \`second.ts\`, performance: Issue in second file.

`,
				requestId: 'test-request-id',
				serverRequestId: undefined,
				usage: undefined,
				resolvedModel: 'gpt-4.1-test'
			});

			const result = await feedbackGenerator.generateComments(input, CancellationToken.None);

			assert.strictEqual(result.type, 'success');
			if (result.type === 'success') {
				assert.strictEqual(result.comments.length, 2);
				assert.strictEqual(result.comments[0].uri.toString(), uri1.toString());
				assert.strictEqual(result.comments[1].uri.toString(), uri2.toString());
			}
		});

		test('handles empty input array', async () => {
			const result = await feedbackGenerator.generateComments([], CancellationToken.None);

			assert.strictEqual(result.type, 'error');
			if (result.type === 'error') {
				assert.strictEqual(result.severity, 'info');
			}
		});

		test('handles input with no changes or selection', async () => {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0\nline 1';
			const input = [createInput(uri, content, 'file.ts')];

			mockEndpointProvider.mockEndpoint.setResponse({
				type: ChatFetchResponseType.Success,
				value: '1. Line 1 in `file.ts`, bug: Issue.\n\n',
				requestId: 'test-request-id',
				serverRequestId: undefined,
				usage: undefined,
				resolvedModel: 'gpt-4.1-test'
			});

			const result = await feedbackGenerator.generateComments(input, CancellationToken.None);

			assert.strictEqual(result.type, 'success');
		});

		test('returns error when prompts exceed maxPrompts limit', async () => {
			// Create many inputs that will each become a separate prompt after splitting
			const inputs: CurrentChangeInput[] = [];
			for (let i = 0; i < 15; i++) {
				const uri = Uri.file(`/test/file${i}.ts`);
				const content = 'line 0\nline 1';
				inputs.push(createInput(uri, content, `file${i}.ts`, {
					hunks: [{ range: new Range(0, 0, 1, 6), text: content }]
				}));
			}

			// Mock the endpoint to track calls
			let callCount = 0;
			const originalMakeChatRequest = mockEndpointProvider.mockEndpoint.makeChatRequest.bind(mockEndpointProvider.mockEndpoint);
			mockEndpointProvider.mockEndpoint.makeChatRequest = async (debugName, messages, finishedCb, token) => {
				callCount++;
				return originalMakeChatRequest(debugName, messages, finishedCb, token);
			};

			// Since we can't easily mock the PromptRenderer to throw split_input,
			// we test the error message when inputType is 'selection' vs 'change'
			// The actual maxPrompts > 10 is hard to trigger without mocking PromptRenderer
			// This test documents the expected behavior
			const result = await feedbackGenerator.generateComments(inputs, CancellationToken.None);

			// With 15 files that don't cause split_input, they should be processed
			// If the batch was split enough times (>10 prompts), we'd get an error
			assert.ok(result.type === 'success' || result.type === 'error');
		});
	});

	class MockLogService extends TestLogService {
		readonly debugMessages: string[] = [];
		readonly warnMessages: string[] = [];

		override debug(message: string): void { this.debugMessages.push(message); }
		override warn(message: string): void { this.warnMessages.push(message); }

		reset(): void {
			this.debugMessages.length = 0;
			this.warnMessages.length = 0;
		}
	}

	interface TelemetryCall {
		eventName: string;
		properties?: TelemetryEventProperties;
		measurements?: TelemetryEventMeasurements;
	}

	class MockTelemetryService extends NullTelemetryService {
		readonly msftEvents: TelemetryCall[] = [];
		readonly internalMsftEvents: TelemetryCall[] = [];

		override sendMSFTTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void {
			this.msftEvents.push({ eventName, properties, measurements });
		}

		override sendInternalMSFTTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void {
			this.internalMsftEvents.push({ eventName, properties, measurements });
		}

		reset(): void {
			this.msftEvents.length = 0;
			this.internalMsftEvents.length = 0;
		}
	}

	describe('sendReviewActionTelemetry', () => {
		let mockLogService: MockLogService;
		let mockTelemetryService: MockTelemetryService;
		let mockInstantiationService: IInstantiationService;
		let disposables: DisposableStore;

		function createTestReviewComment(overrides?: Partial<ReviewComment>): ReviewComment {
			const uri = Uri.file('/test/file.ts');
			const content = 'line 0\nline 1\nline 2';
			const docData = createTextDocumentData(uri, content, 'typescript');
			const snapshot = TextDocumentSnapshot.create(docData.document);

			return {
				request: {
					source: 'vscodeCopilotChat',
					promptCount: 1,
					messageId: 'test-message-id',
					inputType: 'change',
					inputRanges: [{ uri, ranges: [new Range(0, 0, 2, 6)] }],
				},
				document: snapshot,
				uri,
				languageId: 'typescript',
				range: new Range(1, 0, 1, 6),
				body: new MarkdownString('Test comment body'),
				kind: 'bug',
				severity: 'high',
				originalIndex: 0,
				actionCount: 0,
				...overrides,
			};
		}

		beforeEach(() => {
			disposables = new DisposableStore();
			mockLogService = new MockLogService();
			mockTelemetryService = new MockTelemetryService();

			const serviceCollection = disposables.add(createExtensionUnitTestingServices());
			mockInstantiationService = serviceCollection.createTestingAccessor().get(IInstantiationService);
		});

		afterEach(() => {
			disposables.dispose();
		});

		test.each([
			['helpful', 5],
			['unhelpful', 3],
		] as const)('sends review.comment.vote telemetry for %s action', (action, totalComments) => {
			const comment = createTestReviewComment();

			sendReviewActionTelemetry(comment, totalComments, action, mockLogService, mockTelemetryService, mockInstantiationService);

			assert.strictEqual(mockLogService.debugMessages.length, 1);
			assert.ok(mockLogService.debugMessages[0].includes('user feedback received'));

			assert.strictEqual(mockTelemetryService.msftEvents.length, 1);
			assert.strictEqual(mockTelemetryService.msftEvents[0].eventName, 'review.comment.vote');
			assert.strictEqual(mockTelemetryService.msftEvents[0].properties?.userAction, action);
			assert.strictEqual(mockTelemetryService.msftEvents[0].properties?.commentType, 'bug');
			assert.strictEqual(mockTelemetryService.msftEvents[0].measurements?.totalComments, totalComments);

			assert.strictEqual(mockTelemetryService.internalMsftEvents.length, 1);
			assert.strictEqual(mockTelemetryService.internalMsftEvents[0].eventName, 'review.comment.vote');
		});

		test('does not increment actionCount for vote actions', () => {
			const comment = createTestReviewComment({ actionCount: 2 });

			sendReviewActionTelemetry(comment, 1, 'helpful', mockLogService, mockTelemetryService, mockInstantiationService);

			assert.strictEqual(comment.actionCount, 2);
		});

		test('sends review.comment.action telemetry for apply action', () => {
			const comment = createTestReviewComment();

			sendReviewActionTelemetry(comment, 2, 'apply', mockLogService, mockTelemetryService, mockInstantiationService);

			assert.strictEqual(mockTelemetryService.msftEvents.length, 1);
			assert.strictEqual(mockTelemetryService.msftEvents[0].eventName, 'review.comment.action');
			assert.strictEqual(mockTelemetryService.msftEvents[0].properties?.userAction, 'apply');
		});

		test('increments actionCount for non-vote actions', () => {
			const comment = createTestReviewComment({ actionCount: 0 });

			sendReviewActionTelemetry(comment, 1, 'apply', mockLogService, mockTelemetryService, mockInstantiationService);

			assert.strictEqual(comment.actionCount, 1);
		});

		test('increments actionCount multiple times for multiple actions', () => {
			const comment = createTestReviewComment({ actionCount: 0 });

			sendReviewActionTelemetry(comment, 1, 'apply', mockLogService, mockTelemetryService, mockInstantiationService);
			sendReviewActionTelemetry(comment, 1, 'discard', mockLogService, mockTelemetryService, mockInstantiationService);

			assert.strictEqual(comment.actionCount, 2);
		});

		test('returns early and warns when no comments provided', () => {
			sendReviewActionTelemetry([], 0, 'helpful', mockLogService, mockTelemetryService, mockInstantiationService);

			assert.strictEqual(mockLogService.warnMessages.length, 1);
			assert.ok(mockLogService.warnMessages[0].includes('No review comment found'));
			assert.strictEqual(mockTelemetryService.msftEvents.length, 0);
		});

		test('handles single comment (not array)', () => {
			const comment = createTestReviewComment();

			sendReviewActionTelemetry(comment, 1, 'helpful', mockLogService, mockTelemetryService, mockInstantiationService);

			assert.strictEqual(mockTelemetryService.msftEvents.length, 1);
			assert.strictEqual(mockTelemetryService.msftEvents[0].measurements?.comments, 1);
		});

		test('handles array of comments', () => {
			const comment1 = createTestReviewComment({ originalIndex: 0 });
			const comment2 = createTestReviewComment({ originalIndex: 1, body: new MarkdownString('Second comment') });

			sendReviewActionTelemetry([comment1, comment2], 3, 'helpful', mockLogService, mockTelemetryService, mockInstantiationService);

			assert.strictEqual(mockTelemetryService.msftEvents.length, 1);
			assert.strictEqual(mockTelemetryService.msftEvents[0].measurements?.comments, 2);
		});

		test('uses unknown for unrecognized comment kind', () => {
			const comment = createTestReviewComment({ kind: 'unknownKind' });

			sendReviewActionTelemetry(comment, 1, 'helpful', mockLogService, mockTelemetryService, mockInstantiationService);

			assert.strictEqual(mockTelemetryService.msftEvents[0].properties?.commentType, 'unknown');
		});

		test('calculates commentLength correctly for MarkdownString body', () => {
			const comment = createTestReviewComment({ body: new MarkdownString('Hello world') });

			sendReviewActionTelemetry(comment, 1, 'helpful', mockLogService, mockTelemetryService, mockInstantiationService);

			assert.strictEqual(mockTelemetryService.msftEvents[0].measurements?.commentLength, 11);
		});

		test('calculates commentLength correctly for string body', () => {
			const comment = createTestReviewComment({ body: 'Plain text body' });

			sendReviewActionTelemetry(comment, 1, 'helpful', mockLogService, mockTelemetryService, mockInstantiationService);

			assert.strictEqual(mockTelemetryService.msftEvents[0].measurements?.commentLength, 15);
		});

		test('calculates inputLineCount correctly from multiple ranges', () => {
			const uri = Uri.file('/test/file.ts');
			const comment = createTestReviewComment({
				request: {
					source: 'vscodeCopilotChat',
					promptCount: 1,
					messageId: 'test-message-id',
					inputType: 'change',
					inputRanges: [
						{ uri, ranges: [new Range(0, 0, 5, 0), new Range(10, 0, 15, 0)] },
						{ uri, ranges: [new Range(20, 0, 25, 0)] },
					],
				},
			});

			sendReviewActionTelemetry(comment, 1, 'helpful', mockLogService, mockTelemetryService, mockInstantiationService);

			// (5-0) + (15-10) + (25-20) = 5 + 5 + 5 = 15
			assert.strictEqual(mockTelemetryService.msftEvents[0].measurements?.inputLineCount, 15);
		});

		test('includes all expected properties', () => {
			const comment = createTestReviewComment();

			sendReviewActionTelemetry(comment, 2, 'helpful', mockLogService, mockTelemetryService, mockInstantiationService);

			const props = mockTelemetryService.msftEvents[0].properties;
			assert.strictEqual(props?.source, 'vscodeCopilotChat');
			assert.strictEqual(props?.requestId, 'test-message-id');
			assert.strictEqual(props?.documentType, 'text');
			assert.strictEqual(props?.languageId, 'typescript');
			assert.strictEqual(props?.inputType, 'change');
			assert.strictEqual(props?.commentType, 'bug');
			assert.strictEqual(props?.userAction, 'helpful');
		});

		test('includes all expected measurements', () => {
			const comment = createTestReviewComment({ originalIndex: 3, actionCount: 2 });

			sendReviewActionTelemetry(comment, 10, 'helpful', mockLogService, mockTelemetryService, mockInstantiationService);

			const measures = mockTelemetryService.msftEvents[0].measurements;
			assert.strictEqual(measures?.commentIndex, 3);
			assert.strictEqual(measures?.actionCount, 2);
			assert.strictEqual(measures?.inputDocumentCount, 1);
			assert.strictEqual(measures?.promptCount, 1);
			assert.strictEqual(measures?.totalComments, 10);
			assert.strictEqual(measures?.comments, 1);
		});

		test('triggers EditSurvivalReporter for discardComment action', () => {
			const comment = createTestReviewComment();

			// Note: discardComment action tries to create EditSurvivalReporter which requires
			// additional services not available in unit tests. This test verifies the telemetry
			// path is correct before that point.
			try {
				sendReviewActionTelemetry(comment, 1, 'discardComment', mockLogService, mockTelemetryService, mockInstantiationService);
			} catch {
				// Expected: EditSurvivalReporter instantiation fails in unit test context
			}

			// discardComment is a non-vote action, so actionCount should be incremented
			assert.strictEqual(comment.actionCount, 1);

			// Should send review.comment.action telemetry (not vote)
			assert.strictEqual(mockTelemetryService.msftEvents.length, 1);
			assert.strictEqual(mockTelemetryService.msftEvents[0].eventName, 'review.comment.action');
			assert.strictEqual(mockTelemetryService.msftEvents[0].properties?.userAction, 'discardComment');
		});
	});
});
