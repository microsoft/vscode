/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, test } from 'vitest';
import { LogEntry } from '../../../../../platform/workspaceRecorder/common/workspaceLog';
import { FeedbackFile, NesFeedbackSubmitter } from '../nesFeedbackSubmitter';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';

/**
 * Creates a minimal test instance of NesFeedbackSubmitter for testing private methods.
 * We use a subclass to expose private methods for testing.
 */
class TestableNesFeedbackSubmitter extends NesFeedbackSubmitter {
	constructor() {
		// Create minimal mock implementations
		const mockAuthService = {
			_serviceBrand: undefined,
			isMinimalMode: false,
			onDidAuthenticationChange: { dispose: () => { } },
			onDidAccessTokenChange: { dispose: () => { } },
			onDidAdoAuthenticationChange: { dispose: () => { } },
			anyGitHubSession: undefined,
			permissiveGitHubSession: undefined,
			getGitHubSession: async () => undefined,
			getCopilotToken: async () => undefined,
			copilotToken: undefined,
			resetCopilotToken: () => { },
			speculativeDecodingEndpointToken: undefined,
			getAdoAccessTokenBase64: async () => undefined
		};

		const mockFetcherService = {
			_serviceBrand: undefined,
			fetch: async () => new Response(),
			getUserAgentLibrary: () => 'test-agent'
		};

		super(new TestLogService(), mockAuthService as any, mockFetcherService as any);
	}

	// Expose private methods for testing
	public testExtractDocumentPathsFromRecordings(files: FeedbackFile[]): string[] {
		return (this as any)._extractDocumentPathsFromRecordings(files);
	}

	public testFilterRecordingsByExcludedPaths(files: FeedbackFile[], excludedPaths: string[]): FeedbackFile[] {
		// Compute nextUserEditPaths for the test (mimics what submitFromFolder does)
		const nextUserEditPaths = new Map<string, string | undefined>();
		for (const file of files) {
			if (file.name.endsWith('.recording.w.json')) {
				try {
					const recording = JSON.parse(file.content) as { nextUserEdit?: { relativePath: string } };
					nextUserEditPaths.set(file.name, recording.nextUserEdit?.relativePath);
				} catch {
					nextUserEditPaths.set(file.name, undefined);
				}
			}
		}
		return (this as any)._filterRecordingsByExcludedPaths(files, excludedPaths, nextUserEditPaths);
	}

	public testFilterSingleRecording(file: FeedbackFile, excludedPathSet: Set<string>): FeedbackFile {
		return (this as any)._filterSingleRecording(file, excludedPathSet);
	}
}

describe('NesFeedbackSubmitter', () => {
	let submitter: TestableNesFeedbackSubmitter;

	beforeEach(() => {
		submitter = new TestableNesFeedbackSubmitter();
	});

	describe('extractDocumentPathsFromRecordings', () => {
		test('should extract unique document paths from recording files', () => {
			const files: FeedbackFile[] = [
				{
					name: 'capture-1.recording.w.json',
					content: JSON.stringify({
						log: [
							{ kind: 'header', documentType: 'workspaceRecording@1.0', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
							{ kind: 'documentEncountered', id: 1, relativePath: 'src/index.ts', time: 0 },
							{ kind: 'documentEncountered', id: 2, relativePath: 'src/utils.ts', time: 0 },
						] satisfies LogEntry[]
					})
				},
				{
					name: 'capture-2.recording.w.json',
					content: JSON.stringify({
						log: [
							{ kind: 'header', documentType: 'workspaceRecording@1.0', repoRootUri: 'file:///repo', time: 0, uuid: 'test2' },
							{ kind: 'documentEncountered', id: 1, relativePath: 'src/index.ts', time: 0 },
							{ kind: 'documentEncountered', id: 2, relativePath: 'src/other.ts', time: 0 },
						] satisfies LogEntry[]
					})
				}
			];

			const result = submitter.testExtractDocumentPathsFromRecordings(files);

			expect(result).toEqual(['src/index.ts', 'src/other.ts', 'src/utils.ts']);
		});

		test('should skip metadata files', () => {
			const files: FeedbackFile[] = [
				{
					name: 'capture-1.recording.w.json',
					content: JSON.stringify({
						log: [
							{ kind: 'header', documentType: 'workspaceRecording@1.0', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
							{ kind: 'documentEncountered', id: 1, relativePath: 'src/index.ts', time: 0 },
						] satisfies LogEntry[]
					})
				},
				{
					name: 'capture-1.metadata.json',
					content: JSON.stringify({
						captureTimestamp: '2025-01-01T00:00:00Z',
						trigger: 'manual'
					})
				}
			];

			const result = submitter.testExtractDocumentPathsFromRecordings(files);

			expect(result).toEqual(['src/index.ts']);
		});

		test('should handle files with invalid JSON gracefully', () => {
			const files: FeedbackFile[] = [
				{
					name: 'capture-1.recording.w.json',
					content: 'invalid json {'
				},
				{
					name: 'capture-2.recording.w.json',
					content: JSON.stringify({
						log: [
							{ kind: 'header', documentType: 'workspaceRecording@1.0', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
							{ kind: 'documentEncountered', id: 1, relativePath: 'src/valid.ts', time: 0 },
						] satisfies LogEntry[]
					})
				}
			];

			const result = submitter.testExtractDocumentPathsFromRecordings(files);

			expect(result).toEqual(['src/valid.ts']);
		});

		test('should return empty array for files without log entries', () => {
			const files: FeedbackFile[] = [
				{
					name: 'capture-1.recording.w.json',
					content: JSON.stringify({ someOtherData: true })
				}
			];

			const result = submitter.testExtractDocumentPathsFromRecordings(files);

			expect(result).toEqual([]);
		});

		test('should return sorted paths', () => {
			const files: FeedbackFile[] = [
				{
					name: 'capture-1.recording.w.json',
					content: JSON.stringify({
						log: [
							{ kind: 'header', documentType: 'workspaceRecording@1.0', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
							{ kind: 'documentEncountered', id: 1, relativePath: 'z-file.ts', time: 0 },
							{ kind: 'documentEncountered', id: 2, relativePath: 'a-file.ts', time: 0 },
							{ kind: 'documentEncountered', id: 3, relativePath: 'm-file.ts', time: 0 },
						] satisfies LogEntry[]
					})
				}
			];

			const result = submitter.testExtractDocumentPathsFromRecordings(files);

			expect(result).toEqual(['a-file.ts', 'm-file.ts', 'z-file.ts']);
		});
	});

	describe('filterRecordingsByExcludedPaths', () => {
		test('should return files unchanged when no paths are excluded', () => {
			const files: FeedbackFile[] = [
				{
					name: 'capture-1.recording.w.json',
					content: JSON.stringify({
						log: [
							{ kind: 'header', documentType: 'workspaceRecording@1.0', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
							{ kind: 'documentEncountered', id: 1, relativePath: 'src/keep.ts', time: 0 },
							{ kind: 'documentEncountered', id: 2, relativePath: 'src/also-keep.ts', time: 0 },
							{ kind: 'changed', id: 1, edit: [], v: 1, time: 1 },
							{ kind: 'changed', id: 2, edit: [], v: 1, time: 2 },
						] satisfies LogEntry[]
					})
				}
			];

			const result = submitter.testFilterRecordingsByExcludedPaths(files, []);

			// Should return exact same array reference (fast path)
			expect(result).toBe(files);
		});

		test('should filter out excluded documents from recordings', () => {
			const files: FeedbackFile[] = [
				{
					name: 'capture-1.recording.w.json',
					content: JSON.stringify({
						log: [
							{ kind: 'header', documentType: 'workspaceRecording@1.0', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
							{ kind: 'documentEncountered', id: 1, relativePath: 'src/keep.ts', time: 0 },
							{ kind: 'documentEncountered', id: 2, relativePath: 'src/exclude.ts', time: 0 },
							{ kind: 'changed', id: 1, edit: [], v: 1, time: 1 },
							{ kind: 'changed', id: 2, edit: [], v: 1, time: 2 },
						] satisfies LogEntry[],
						nextUserEdit: { relativePath: 'src/keep.ts', edit: [] }
					})
				}
			];

			const result = submitter.testFilterRecordingsByExcludedPaths(files, ['src/exclude.ts']);

			const parsed = JSON.parse(result[0].content);
			expect(parsed.log).toHaveLength(3); // header + documentEncountered + changed for id 1

			const documentPaths = parsed.log
				.filter((e: LogEntry) => e.kind === 'documentEncountered')
				.map((e: any) => e.relativePath);
			expect(documentPaths).toEqual(['src/keep.ts']);
		});

		test('should pass through metadata files when their recording has nextUserEdit', () => {
			const metadataContent = JSON.stringify({
				captureTimestamp: '2025-01-01T00:00:00Z',
				trigger: 'manual',
				durationMs: 5000
			});

			const files: FeedbackFile[] = [
				{
					name: 'capture-1.recording.w.json',
					content: JSON.stringify({
						log: [
							{ kind: 'header', documentType: 'workspaceRecording@1.0', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
							{ kind: 'documentEncountered', id: 1, relativePath: 'src/file.ts', time: 0 },
						] satisfies LogEntry[],
						nextUserEdit: { relativePath: 'src/file.ts', edit: [] }
					})
				},
				{
					name: 'capture-1.metadata.json',
					content: metadataContent
				}
			];

			const result = submitter.testFilterRecordingsByExcludedPaths(files, []);

			expect(result).toHaveLength(2);
			expect(result.find(f => f.name === 'capture-1.metadata.json')?.content).toBe(metadataContent);
		});

		test('should skip recording and metadata when nextUserEdit is excluded', () => {
			const files: FeedbackFile[] = [
				{
					name: 'capture-1.recording.w.json',
					content: JSON.stringify({
						log: [
							{ kind: 'header', documentType: 'workspaceRecording@1.0', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
							{ kind: 'documentEncountered', id: 1, relativePath: 'src/keep.ts', time: 0 },
							{ kind: 'documentEncountered', id: 2, relativePath: 'src/exclude.ts', time: 0 },
						] satisfies LogEntry[],
						nextUserEdit: {
							relativePath: 'src/exclude.ts',
							edit: []
						}
					})
				},
				{
					name: 'capture-1.metadata.json',
					content: JSON.stringify({ captureTimestamp: '2025-01-01T00:00:00Z' })
				}
			];

			const result = submitter.testFilterRecordingsByExcludedPaths(files, ['src/exclude.ts']);

			// Both recording and metadata should be skipped
			expect(result).toHaveLength(0);
		});

		test('should preserve nextUserEdit if its file is not excluded', () => {
			const files: FeedbackFile[] = [
				{
					name: 'capture-1.recording.w.json',
					content: JSON.stringify({
						log: [
							{ kind: 'header', documentType: 'workspaceRecording@1.0', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
							{ kind: 'documentEncountered', id: 1, relativePath: 'src/keep.ts', time: 0 },
						] satisfies LogEntry[],
						nextUserEdit: {
							relativePath: 'src/keep.ts',
							edit: [{ offset: 0, oldLength: 0, newText: 'hello' }]
						}
					})
				},
				{
					name: 'capture-1.metadata.json',
					content: JSON.stringify({ captureTimestamp: '2025-01-01T00:00:00Z' })
				}
			];

			const result = submitter.testFilterRecordingsByExcludedPaths(files, []);

			expect(result).toHaveLength(2);
			const recording = result.find(f => f.name === 'capture-1.recording.w.json');
			const parsed = JSON.parse(recording!.content);
			expect(parsed.nextUserEdit).toBeDefined();
			expect(parsed.nextUserEdit.relativePath).toBe('src/keep.ts');
		});

		test('should skip recording without nextUserEdit entirely', () => {
			const files: FeedbackFile[] = [
				{
					name: 'capture-1.recording.w.json',
					content: JSON.stringify({
						log: [
							{ kind: 'header', documentType: 'workspaceRecording@1.0', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
							{ kind: 'documentEncountered', id: 1, relativePath: 'src/file.ts', time: 0 },
						] satisfies LogEntry[]
						// No nextUserEdit
					})
				},
				{
					name: 'capture-1.metadata.json',
					content: JSON.stringify({ captureTimestamp: '2025-01-01T00:00:00Z' })
				},
				{
					name: 'capture-2.recording.w.json',
					content: JSON.stringify({
						log: [
							{ kind: 'header', documentType: 'workspaceRecording@1.0', repoRootUri: 'file:///repo', time: 0, uuid: 'test2' },
							{ kind: 'documentEncountered', id: 1, relativePath: 'src/other.ts', time: 0 },
						] satisfies LogEntry[],
						nextUserEdit: { relativePath: 'src/other.ts', edit: [] }
					})
				},
				{
					name: 'capture-2.metadata.json',
					content: JSON.stringify({ captureTimestamp: '2025-01-01T00:00:01Z' })
				}
			];

			const result = submitter.testFilterRecordingsByExcludedPaths(files, ['src/file.ts']);

			// Only capture-2 should be included (both recording and metadata)
			expect(result).toHaveLength(2);
			expect(result.map(f => f.name).sort()).toEqual(['capture-2.metadata.json', 'capture-2.recording.w.json']);
		});

		test('should always preserve header entries in included recordings', () => {
			const files: FeedbackFile[] = [
				{
					name: 'capture-1.recording.w.json',
					content: JSON.stringify({
						log: [
							{ kind: 'header', documentType: 'workspaceRecording@1.0', repoRootUri: 'file:///repo', time: 0, uuid: 'test-uuid' },
							{ kind: 'documentEncountered', id: 1, relativePath: 'src/exclude.ts', time: 0 },
							{ kind: 'documentEncountered', id: 2, relativePath: 'src/keep.ts', time: 0 },
						] satisfies LogEntry[],
						nextUserEdit: { relativePath: 'src/keep.ts', edit: [] }
					})
				}
			];

			const result = submitter.testFilterRecordingsByExcludedPaths(files, ['src/exclude.ts']);

			expect(result).toHaveLength(1);
			const parsed = JSON.parse(result[0].content);
			expect(parsed.log).toHaveLength(2); // header + documentEncountered for keep.ts
			expect(parsed.log[0].kind).toBe('header');
			expect(parsed.log[0].uuid).toBe('test-uuid');
		});

		test('should skip files with invalid JSON (no parseable nextUserEdit)', () => {
			const invalidContent = 'not valid json {{{';
			const files: FeedbackFile[] = [
				{
					name: 'capture-1.recording.w.json',
					content: invalidContent
				}
			];

			const result = submitter.testFilterRecordingsByExcludedPaths(files, ['anything']);

			// Files with invalid JSON are skipped because nextUserEdit cannot be determined
			expect(result).toHaveLength(0);
		});
	});

	describe('filterSingleRecording', () => {
		test('should filter all event types for excluded documents', () => {
			const file: FeedbackFile = {
				name: 'test.recording.w.json',
				content: JSON.stringify({
					log: [
						{ kind: 'header', documentType: 'workspaceRecording@1.0', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
						{ kind: 'documentEncountered', id: 1, relativePath: 'src/keep.ts', time: 0 },
						{ kind: 'documentEncountered', id: 2, relativePath: 'src/exclude.ts', time: 0 },
						{ kind: 'setContent', id: 1, v: 1, content: 'keep content', time: 1 },
						{ kind: 'setContent', id: 2, v: 1, content: 'exclude content', time: 2 },
						{ kind: 'changed', id: 1, edit: [], v: 1, time: 3 },
						{ kind: 'changed', id: 2, edit: [], v: 1, time: 4 },
						{ kind: 'selectionChanged', id: 1, selection: [[0, 0]], time: 5 },
						{ kind: 'selectionChanged', id: 2, selection: [[0, 0]], time: 6 },
					] satisfies LogEntry[],
					nextUserEdit: { relativePath: 'src/keep.ts', edit: [] }
				})
			};

			const result = submitter.testFilterSingleRecording(file, new Set(['src/exclude.ts']));

			const parsed = JSON.parse(result.content);

			// Should have: header, documentEncountered(1), setContent(1), changed(1), selectionChanged(1)
			expect(parsed.log).toHaveLength(5);

			// Verify no entries for id 2
			const entriesWithId2 = parsed.log.filter((e: any) => e.id === 2);
			expect(entriesWithId2).toHaveLength(0);

			// Verify all entries for id 1 are present
			const entriesWithId1 = parsed.log.filter((e: any) => e.id === 1);
			expect(entriesWithId1).toHaveLength(4);

			// nextUserEdit should be preserved
			expect(parsed.nextUserEdit).toBeDefined();
			expect(parsed.nextUserEdit.relativePath).toBe('src/keep.ts');
		});

		test('should return original file if no log property', () => {
			const file: FeedbackFile = {
				name: 'test.recording.w.json',
				content: JSON.stringify({ someOtherProperty: 'value' })
			};

			const result = submitter.testFilterSingleRecording(file, new Set(['anything']));

			expect(result).toBe(file);
		});

		test('should preserve entries without id property', () => {
			const file: FeedbackFile = {
				name: 'test.recording.w.json',
				content: JSON.stringify({
					log: [
						{ kind: 'header', documentType: 'workspaceRecording@1.0', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
						{ kind: 'meta', data: { customKey: 'customValue' } },
						{ kind: 'bookmark', time: 100 },
						{ kind: 'documentEncountered', id: 1, relativePath: 'src/excluded.ts', time: 0 },
					] satisfies LogEntry[],
					nextUserEdit: { relativePath: 'src/other.ts', edit: [] }
				})
			};

			const result = submitter.testFilterSingleRecording(file, new Set(['src/excluded.ts']));

			const parsed = JSON.parse(result.content);

			// Should have header, meta, bookmark (but not documentEncountered)
			expect(parsed.log).toHaveLength(3);
			expect(parsed.log.map((e: any) => e.kind)).toEqual(['header', 'meta', 'bookmark']);
			// nextUserEdit is preserved (its path is not excluded)
			expect(parsed.nextUserEdit).toBeDefined();
		});

		test('should preserve nextUserEdit (caller is responsible for checking exclusion)', () => {
			// Note: _filterSingleRecording assumes the caller already verified nextUserEdit is not excluded.
			// The filtering of recordings with excluded nextUserEdit happens in _filterRecordingsByExcludedPaths.
			const file: FeedbackFile = {
				name: 'test.recording.w.json',
				content: JSON.stringify({
					log: [
						{ kind: 'header', documentType: 'workspaceRecording@1.0', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
						{ kind: 'documentEncountered', id: 1, relativePath: 'src/keep.ts', time: 0 },
						{ kind: 'documentEncountered', id: 2, relativePath: 'src/exclude.ts', time: 0 },
					] satisfies LogEntry[],
					nextUserEdit: { relativePath: 'src/keep.ts', edit: [] }
				})
			};

			const result = submitter.testFilterSingleRecording(file, new Set(['src/exclude.ts']));

			const parsed = JSON.parse(result.content);
			// nextUserEdit is preserved (filtering happens at a higher level)
			expect(parsed.nextUserEdit).toBeDefined();
			expect(parsed.nextUserEdit.relativePath).toBe('src/keep.ts');
			// But the excluded document is filtered out
			const docPaths = parsed.log
				.filter((e: any) => e.kind === 'documentEncountered')
				.map((e: any) => e.relativePath);
			expect(docPaths).toEqual(['src/keep.ts']);
		});
	});

	describe('performance', () => {
		test('should filter large recordings efficiently', () => {
			// Generate a large recording with 10,000 log entries across 100 documents
			const documentCount = 100;
			const entriesPerDocument = 100; // Total: 10,000 entries
			const log: LogEntry[] = [
				{ kind: 'header', documentType: 'workspaceRecording@1.0', repoRootUri: 'file:///repo', time: 0, uuid: 'perf-test' }
			];

			// Add document encounters and their events
			for (let docId = 1; docId <= documentCount; docId++) {
				log.push({ kind: 'documentEncountered', id: docId, relativePath: `src/file${docId}.ts`, time: docId });

				// Add multiple events per document
				for (let i = 0; i < entriesPerDocument - 1; i++) {
					const time = docId * 1000 + i;
					if (i % 3 === 0) {
						log.push({ kind: 'changed', id: docId, edit: [[i, i + 1, 'x']], v: i + 1, time });
					} else if (i % 3 === 1) {
						log.push({ kind: 'setContent', id: docId, v: i + 1, content: `content ${i}`, time });
					} else {
						log.push({ kind: 'selectionChanged', id: docId, selection: [[i, i + 1]], time });
					}
				}
			}

			const largeFile: FeedbackFile = {
				name: 'large-capture.recording.w.json',
				// nextUserEdit points to an even file so it won't be excluded
				content: JSON.stringify({ log, nextUserEdit: { relativePath: 'src/file2.ts', edit: [] } })
			};

			// Exclude half the documents (odd-numbered files)
			const excludedPaths = Array.from({ length: documentCount / 2 }, (_, i) => `src/file${i * 2 + 1}.ts`);

			// Measure filtering time
			const startTime = performance.now();
			const result = submitter.testFilterRecordingsByExcludedPaths([largeFile], excludedPaths);
			const endTime = performance.now();
			const durationMs = endTime - startTime;

			// Verify correctness - recording should be included since nextUserEdit is not excluded
			expect(result).toHaveLength(1);
			const parsed = JSON.parse(result[0].content);
			const remainingDocCount = parsed.log.filter((e: any) => e.kind === 'documentEncountered').length;
			expect(remainingDocCount).toBe(documentCount / 2);

			// Performance assertion: should complete within 100ms even for large files
			// This threshold is conservative to avoid flaky tests on slower CI machines
			expect(durationMs).toBeLessThan(100);
		});

	});
});
