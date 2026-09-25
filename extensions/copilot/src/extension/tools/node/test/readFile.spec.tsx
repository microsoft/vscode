/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, afterEach, beforeAll, beforeEach, expect, suite, test, vi } from 'vitest';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { ICustomInstructionsService, SkillStorage } from '../../../../platform/customInstructions/common/customInstructionsService';
import { IExtensionsService } from '../../../../platform/extensions/common/extensionsService';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { MockFileSystemService } from '../../../../platform/filesystem/node/test/mockFileSystemService';
import { IRegionContextProviderService, RegionResult } from '../../../../platform/languageContextProvider/common/regionContextProvider';
import { NullTelemetryService } from '../../../../platform/telemetry/common/nullTelemetryService';
import { ITelemetryService, TelemetryEventMeasurements, TelemetryEventProperties } from '../../../../platform/telemetry/common/telemetry';
import { MockCustomInstructionsService } from '../../../../platform/test/common/testCustomInstructionsService';
import { TestExtensionsService } from '../../../../platform/test/common/testExtensionsService';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { createTextDocumentData, IExtHostDocumentData, setDocText } from '../../../../util/common/test/shims/textDocument';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Disposable, DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { MarkdownString, Range } from '../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { ToolName } from '../../common/toolNames';
import { IToolsService } from '../../common/toolsService';
import { GrepResultService, IGrepResultService, MAX_GREP_RESULT_SESSIONS } from '../grepResultService';
import { IReadFileParamsV1, IReadFileParamsV2, ReadFileParams, ReadFileTool } from '../readFileTool';
import { toolResultToString } from './toolTestUtils';

class CapturingTelemetryService extends NullTelemetryService {
	readonly events: { eventName: string; properties?: TelemetryEventProperties; measurements?: TelemetryEventMeasurements }[] = [];
	readonly enhancedEvents: { eventName: string; properties?: TelemetryEventProperties }[] = [];
	readonly internalEvents: { eventName: string; properties?: TelemetryEventProperties }[] = [];

	override sendGHTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void {
		this.events.push({ eventName, properties, measurements });
	}

	override sendEnhancedGHTelemetryEvent(eventName: string, properties?: TelemetryEventProperties): void {
		this.enhancedEvents.push({ eventName, properties });
	}

	override sendInternalMSFTTelemetryEvent(eventName: string, properties?: TelemetryEventProperties): void {
		this.internalEvents.push({ eventName, properties });
	}

	override sendMSFTTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void {
		this.events.push({ eventName, properties, measurements });
	}
}

suite('ReadFile', () => {
	let accessor: ITestingServicesAccessor;

	beforeAll(() => {
		const testDoc = createTextDocumentData(URI.file('/workspace/file.ts'), 'line 1\nline 2\n\nline 4\nline 5', 'ts').document;
		const emptyDoc = createTextDocumentData(URI.file('/workspace/empty.ts'), '', 'ts').document;
		const whitespaceDoc = createTextDocumentData(URI.file('/workspace/whitespace.ts'), ' \t\n', 'ts').document;
		const singleLineDoc = createTextDocumentData(URI.file('/workspace/single.ts'), 'single line', 'ts').document;
		// Create a large document for testing truncation (3000 lines to exceed MAX_LINES_PER_READ)
		const largeContent = Array.from({ length: 3000 }, (_, i) => `line ${i + 1}`).join('\n');
		const largeDoc = createTextDocumentData(URI.file('/workspace/large.ts'), largeContent, 'ts').document;
		// Create a document with long lines to test per-line truncation (each line is 2500 chars)
		const longLine = 'x'.repeat(2500);
		const longLinesContent = `normal line\n${longLine}\nanother normal line\n${longLine}`;
		const longLinesDoc = createTextDocumentData(URI.file('/workspace/longlines.ts'), longLinesContent, 'ts').document;
		const surrogateBoundaryLine = 'x'.repeat(1999) + '\u{1F6E1}' + 'tail';
		const surrogateBoundaryDoc = createTextDocumentData(URI.file('/workspace/surrogate-boundary.ts'), surrogateBoundaryLine, 'ts').document;

		const services = createExtensionUnitTestingServices();
		services.define(IWorkspaceService, new SyncDescriptor(
			TestWorkspaceService,
			[
				[URI.file('/workspace')],
				[testDoc, emptyDoc, whitespaceDoc, singleLineDoc, largeDoc, longLinesDoc, surrogateBoundaryDoc],
			]
		));
		accessor = services.createTestingAccessor();
	});

	afterAll(() => {
		accessor.dispose();
	});

	test('read simple file', async () => {
		const toolsService = accessor.get(IToolsService);

		const input: IReadFileParamsV1 = {
			filePath: '/workspace/file.ts',
			startLine: 2,
			endLine: 6
		};
		const result = await toolsService.invokeTool(ToolName.ReadFile, { input, toolInvocationToken: null as never }, CancellationToken.None);
		expect(await toolResultToString(accessor, result)).toMatchInlineSnapshot(`
			"line 2

			line 4
			line 5"
		`);
	});

	test('read empty file', async () => {
		const toolsService = accessor.get(IToolsService);

		const input: IReadFileParamsV1 = {
			filePath: '/workspace/empty.ts',
			startLine: 2,
			endLine: 6
		};
		const result = await toolsService.invokeTool(ToolName.ReadFile, { input, toolInvocationToken: null as never }, CancellationToken.None);
		expect(await toolResultToString(accessor, result)).toMatchInlineSnapshot(`"(The file \`/workspace/empty.ts\` exists, but is empty)"`);
	});

	test('read whitespace file', async () => {
		const toolsService = accessor.get(IToolsService);

		const input: IReadFileParamsV1 = {
			filePath: '/workspace/whitespace.ts',
			startLine: 2,
			endLine: 6
		};
		const result = await toolsService.invokeTool(ToolName.ReadFile, { input, toolInvocationToken: null as never }, CancellationToken.None);
		expect(await toolResultToString(accessor, result)).toMatchInlineSnapshot(`"(The file \`/workspace/whitespace.ts\` exists, but contains only whitespace)"`);
	});

	suite('IReadFileParamsV2', () => {
		test('read simple file with offset and limit', async () => {
			const toolsService = accessor.get(IToolsService);

			const input: IReadFileParamsV2 = {
				filePath: '/workspace/file.ts',
				offset: 2,
				limit: 4
			};
			const result = await toolsService.invokeTool(ToolName.ReadFile, { input, toolInvocationToken: null as never }, CancellationToken.None);
			expect(await toolResultToString(accessor, result)).toMatchInlineSnapshot(`
				"line 2

				line 4
				line 5"
			`);
		});

		test('read simple file with only offset', async () => {
			const toolsService = accessor.get(IToolsService);

			const input: IReadFileParamsV2 = {
				filePath: '/workspace/file.ts',
				offset: 3
			};
			const result = await toolsService.invokeTool(ToolName.ReadFile, { input, toolInvocationToken: null as never }, CancellationToken.None);
			expect(await toolResultToString(accessor, result)).toMatchInlineSnapshot(`
				"
				line 4
				line 5"
			`);
		});

		test('read simple file without offset or limit', async () => {
			const toolsService = accessor.get(IToolsService);

			const input: IReadFileParamsV2 = {
				filePath: '/workspace/file.ts'
			};
			const result = await toolsService.invokeTool(ToolName.ReadFile, { input, toolInvocationToken: null as never }, CancellationToken.None);
			expect(await toolResultToString(accessor, result)).toMatchInlineSnapshot(`
				"line 1
				line 2

				line 4
				line 5"
			`);
		});

		test('read empty file', async () => {
			const toolsService = accessor.get(IToolsService);

			const input: IReadFileParamsV2 = {
				filePath: '/workspace/empty.ts',
				offset: 1,
				limit: 4
			};
			const result = await toolsService.invokeTool(ToolName.ReadFile, { input, toolInvocationToken: null as never }, CancellationToken.None);
			expect(await toolResultToString(accessor, result)).toMatchInlineSnapshot(`"(The file \`/workspace/empty.ts\` exists, but is empty)"`);
		});

		test('read whitespace file', async () => {
			const toolsService = accessor.get(IToolsService);

			const input: IReadFileParamsV2 = {
				filePath: '/workspace/whitespace.ts',
				offset: 1,
				limit: 2
			};
			const result = await toolsService.invokeTool(ToolName.ReadFile, { input, toolInvocationToken: null as never }, CancellationToken.None);
			expect(await toolResultToString(accessor, result)).toMatchInlineSnapshot(`"(The file \`/workspace/whitespace.ts\` exists, but contains only whitespace)"`);
		});

		test('read file with limit larger than MAX_LINES_PER_READ should truncate', async () => {
			const toolsService = accessor.get(IToolsService);

			const input: IReadFileParamsV2 = {
				filePath: '/workspace/large.ts',
				offset: 1,
				limit: 3000 // This exceeds MAX_LINES_PER_READ (2000)
			};
			const result = await toolsService.invokeTool(ToolName.ReadFile, { input, toolInvocationToken: null as never }, CancellationToken.None);
			// Should be truncated to MAX_LINES_PER_READ (2000) and show truncation message
			const resultString = await toolResultToString(accessor, result);
			expect(resultString).toContain('line 1');
			expect(resultString).toContain('line 2000');
			expect(resultString).toContain('[File content truncated at line 2000. Use read_file with offset/limit parameters to view more.]');
			expect(resultString).not.toContain('line 2001');
		});

		test('long lines are truncated and a notice is appended', async () => {
			const toolsService = accessor.get(IToolsService);

			const input: IReadFileParamsV2 = {
				filePath: '/workspace/longlines.ts'
			};
			const result = await toolsService.invokeTool(ToolName.ReadFile, { input, toolInvocationToken: null as never }, CancellationToken.None);
			const resultString = await toolResultToString(accessor, result);
			expect(resultString).toContain('normal line');
			expect(resultString).toContain('[truncated]');
			expect(resultString).toContain('[One or more long lines were truncated at 2000 characters]');
			// The truncated line should be at most 2000 chars + ' [truncated]' = ~2012 chars, not the full 2500
			const lines = resultString.split('\n');
			const longLines = lines.filter(l => l.includes('x'.repeat(100)));
			for (const l of longLines) {
				expect(l.length).toBeLessThan(2500);
			}
		});

		test('long line truncation does not split surrogate pairs', async () => {
			const toolsService = accessor.get(IToolsService);
			const input: IReadFileParamsV2 = {
				filePath: '/workspace/surrogate-boundary.ts'
			};
			const result = await toolsService.invokeTool(ToolName.ReadFile, { input, toolInvocationToken: null as never }, CancellationToken.None);
			const resultString = await toolResultToString(accessor, result);
			const truncatedLine = resultString.split('\n').find(line => line.endsWith(' [truncated]'));

			expect(truncatedLine).toBe('x'.repeat(1999) + ' [truncated]');
		});

		test('read file with offset beyond file line count should throw error', async () => {
			const toolsService = accessor.get(IToolsService);

			const input: IReadFileParamsV2 = {
				filePath: '/workspace/file.ts',
				offset: 535 // file only has 5 lines
			};
			await expect(toolsService.invokeTool(ToolName.ReadFile, { input, toolInvocationToken: null as never }, CancellationToken.None))
				.rejects.toThrow('Invalid offset 535: file only has 5 lines. Line numbers are 1-indexed.');
		});

		test('read file with offset beyond single-line file should throw error', async () => {
			const toolsService = accessor.get(IToolsService);

			const input: IReadFileParamsV2 = {
				filePath: '/workspace/whitespace.ts', // 2 line file (has a newline)
				offset: 10
			};
			await expect(toolsService.invokeTool(ToolName.ReadFile, { input, toolInvocationToken: null as never }, CancellationToken.None))
				.rejects.toThrow('Invalid offset 10: file only has 2 lines. Line numbers are 1-indexed.');
		});

		test('read file with offset exactly at line count should succeed', async () => {
			const toolsService = accessor.get(IToolsService);

			const input: IReadFileParamsV2 = {
				filePath: '/workspace/file.ts',
				offset: 5, // file has exactly 5 lines
				limit: 1
			};
			const result = await toolsService.invokeTool(ToolName.ReadFile, { input, toolInvocationToken: null as never }, CancellationToken.None);
			const resultString = await toolResultToString(accessor, result);
			expect(resultString).toContain('line 5');
		});

		test('read empty file with offset beyond bounds should throw error', async () => {
			const toolsService = accessor.get(IToolsService);

			const input: IReadFileParamsV2 = {
				filePath: '/workspace/empty.ts',
				offset: 2
			};
			await expect(toolsService.invokeTool(ToolName.ReadFile, { input, toolInvocationToken: null as never }, CancellationToken.None))
				.rejects.toThrow('Invalid offset 2: file only has 1 line. Line numbers are 1-indexed.');
		});

		test('read file with offset 0 should clamp to line 1', async () => {
			const toolsService = accessor.get(IToolsService);

			const input: IReadFileParamsV2 = {
				filePath: '/workspace/file.ts',
				offset: 0,
				limit: 2
			};
			const result = await toolsService.invokeTool(ToolName.ReadFile, { input, toolInvocationToken: null as never }, CancellationToken.None);
			const resultString = await toolResultToString(accessor, result);
			// Should start from line 1 (offset clamped to 1)
			expect(resultString).toContain('line 1');
			expect(resultString).toContain('line 2');
		});

		test('read single-line file with offset beyond bounds should throw error with singular "line"', async () => {
			const toolsService = accessor.get(IToolsService);

			const input: IReadFileParamsV2 = {
				filePath: '/workspace/single.ts',
				offset: 2
			};
			await expect(toolsService.invokeTool(ToolName.ReadFile, { input, toolInvocationToken: null as never }, CancellationToken.None))
				.rejects.toThrow('Invalid offset 2: file only has 1 line. Line numbers are 1-indexed.');
		});

		test('read file with limit of 1', async () => {
			const toolsService = accessor.get(IToolsService);

			const input: IReadFileParamsV2 = {
				filePath: '/workspace/file.ts',
				offset: 2,
				limit: 1
			};
			const result = await toolsService.invokeTool(ToolName.ReadFile, { input, toolInvocationToken: null as never }, CancellationToken.None);
			const resultString = await toolResultToString(accessor, result);
			expect(resultString).toContain('line 2');
			expect(resultString).not.toContain('line 3');
		});

	});

	suite('region adjustments', () => {
		const store = new DisposableStore();
		const fileUri = URI.file('/workspace/region.ts');
		const otherFileUri = URI.file('/workspace/other.ts');
		const firstSession = URI.file('/sessions/first');
		const secondSession = URI.file('/sessions/second');
		const lines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`);
		const content = lines.join('\n');
		const input: IReadFileParamsV1 = { filePath: fileUri.fsPath, startLine: 1, endLine: 10 };
		const independentRequests = [
			{ name: 'file', input: { ...input, filePath: otherFileUri.fsPath } },
			{ name: 'start line', input: { ...input, startLine: 3 } },
			{ name: 'end line', input: { ...input, endLine: 12 } },
		];

		class TestRegionContextProviderService extends Disposable implements IRegionContextProviderService {
			declare readonly _serviceBrand: undefined;
			readonly getRegions = vi.fn<IRegionContextProviderService['getRegions']>().mockResolvedValue(createRegionResult());
		}

		let testAccessor: ITestingServicesAccessor;
		let documentData: IExtHostDocumentData;
		let grepResultService: GrepResultService;
		let regionProvider: TestRegionContextProviderService;
		let telemetry: CapturingTelemetryService;
		let readFileTool: ReadFileTool;

		beforeEach(async () => {
			documentData = createTextDocumentData(fileUri, content, 'typescript');
			const otherDocument = createTextDocumentData(otherFileUri, content, 'typescript');
			const services = store.add(createExtensionUnitTestingServices());
			services.define(IWorkspaceService, new SyncDescriptor(
				TestWorkspaceService,
				[[URI.file('/workspace')], [documentData.document, otherDocument.document]]
			));

			grepResultService = store.add(new GrepResultService());
			regionProvider = store.add(new TestRegionContextProviderService());
			telemetry = new CapturingTelemetryService();
			services.define(IGrepResultService, grepResultService);
			services.define(IRegionContextProviderService, regionProvider);
			services.define(ITelemetryService, telemetry);
			for (const session of [firstSession, secondSession]) {
				for (const uri of [fileUri, otherFileUri]) {
					addGrepResult(session, uri);
				}
			}

			testAccessor = services.createTestingAccessor();
			readFileTool = testAccessor.get(IInstantiationService).createInstance(ReadFileTool);
			await testAccessor.get(IConfigurationService).setConfig(ConfigKey.ReadFileToolAllowLineAdjustments, true);
		});

		afterEach(() => store.clear());
		afterAll(() => store.dispose());

		function createRegionResult(startLine = 3, endLine = 5): RegionResult {
			return {
				regions: [{ kind: 'function', range: { start: startLine, end: endLine } }],
				paths: { smallest: [0] },
			};
		}

		function addGrepResult(session = firstSession, uri = fileUri): void {
			const matchRange = new Range(4, 0, 4, 6);
			grepResultService.addGrepResult(session, 'grep-request', {
				files: [{
					uri,
					matches: [{
						uri,
						previewText: 'line 5',
						ranges: [{ previewRange: matchRange, sourceRange: matchRange }]
					}]
				}]
			});
		}

		function expectedLines(startLine: number, endLine: number): string {
			return lines.slice(startLine - 1, endLine).join('\n');
		}

		async function invoke(params: ReadFileParams = input, chatSessionResource = firstSession, chatRequestId = 'request'): Promise<string> {
			const result = await readFileTool.invoke(
				{ input: params, chatSessionResource, chatRequestId, toolInvocationToken: undefined },
				CancellationToken.None
			);
			return toolResultToString(testAccessor, result);
		}

		function failureReasons() {
			return telemetry.events
				.filter(event => event.eventName === 'readFileRegionAdjustingFailed')
				.map(event => event.properties?.reason);
		}

		test('only trims trailing lines and returns the requested range when the read is repeated in the same chat session', async () => {
			expect({
				firstRead: await invoke(input, firstSession, 'first-request'),
				repeatedRead: await invoke(input, firstSession, 'followup-request'),
				otherSessionRead: await invoke(input, secondSession, 'second-request'),
				thirdRead: await invoke(input, firstSession, 'third-request'),
				regionCalls: regionProvider.getRegions.mock.calls.length,
			}).toEqual({
				firstRead: expectedLines(1, 6),
				repeatedRead: expectedLines(1, 10),
				otherSessionRead: expectedLines(1, 6),
				thirdRead: expectedLines(1, 10),
				regionCalls: 2,
			});
		});

		test('recovers omitted lines on a consecutive read without shortening its end', async () => {
			expect({
				firstRead: await invoke({ ...input, startLine: 4 }),
				continuedRead: await invoke({ ...input, startLine: 11, endLine: 20 }),
				requestedRegions: regionProvider.getRegions.mock.calls.map(call => call[3]),
			}).toEqual({
				firstRead: expectedLines(4, 6),
				continuedRead: expectedLines(7, 20),
				requestedRegions: [{ start: 3, end: 9 }],
			});
		});

		test.each([
			{ name: 'repeated reads', nextInput: input, expectedStart: 1, expectedEnd: 10 },
			{ name: 'consecutive reads', nextInput: { ...input, startLine: 11, endLine: 20 }, expectedStart: 7, expectedEnd: 20 },
		])('preserves $name when individual grep results are evicted', async ({ nextInput, expectedStart, expectedEnd }) => {
			await invoke();
			for (let i = 0; i < 17; i++) {
				addGrepResult();
			}

			expect({
				text: await invoke(nextInput),
				regionCalls: regionProvider.getRegions.mock.calls.length,
			}).toEqual({
				text: expectedLines(expectedStart, expectedEnd),
				regionCalls: 1,
			});
		});

		test('only clears read adjustments for the evicted session', async () => {
			await invoke();
			await invoke(input, secondSession);
			for (let i = 0; i < MAX_GREP_RESULT_SESSIONS - 1; i++) {
				addGrepResult(URI.file(`/sessions/eviction-${i}`));
			}

			const retainedRead = await invoke(input, secondSession);
			const evictedContinuation = await invoke({ ...input, startLine: 11, endLine: 20 });
			addGrepResult();

			expect({
				retainedRead,
				evictedContinuation,
				newRead: await invoke(),
				regionCalls: regionProvider.getRegions.mock.calls.length,
			}).toEqual({
				retainedRead: expectedLines(1, 10),
				evictedContinuation: expectedLines(11, 20),
				newRead: expectedLines(1, 6),
				regionCalls: 3,
			});
		});

		test.each([7, 10, 12])('does not expand a nonconsecutive read starting at line %i', async startLine => {
			await invoke();

			expect({
				text: await invoke({ ...input, startLine, endLine: 20 }),
				regionCalls: regionProvider.getRegions.mock.calls.length,
			}).toEqual({
				text: expectedLines(startLine, 20),
				regionCalls: 1,
			});
		});

		test.each(independentRequests)('tracks requests with a different $name independently', async ({ input: otherInput }) => {
			expect({
				firstRead: await invoke(),
				otherRead: await invoke(otherInput),
				repeatedRead: await invoke(),
				repeatedOtherRead: await invoke(otherInput),
				regionCalls: regionProvider.getRegions.mock.calls.length,
			}).toEqual({
				firstRead: expectedLines(1, 6),
				otherRead: expectedLines(otherInput.startLine, 6),
				repeatedRead: expectedLines(1, 10),
				repeatedOtherRead: expectedLines(otherInput.startLine, otherInput.endLine),
				regionCalls: 2,
			});
		});

		test.each([[5, 7], [7, 5]])('uses the earliest adjusted end across different starts (%i then %i)', async (firstEnd, secondEnd) => {
			regionProvider.getRegions
				.mockResolvedValueOnce(createRegionResult(3, firstEnd))
				.mockResolvedValueOnce(createRegionResult(3, secondEnd));

			expect({
				firstRead: await invoke(),
				secondRead: await invoke({ ...input, startLine: 3 }),
				continuedRead: await invoke({ ...input, startLine: 11, endLine: 20 }),
				regionCalls: regionProvider.getRegions.mock.calls.length,
			}).toEqual({
				firstRead: expectedLines(1, firstEnd + 1),
				secondRead: expectedLines(3, secondEnd + 1),
				continuedRead: expectedLines(7, 20),
				regionCalls: 2,
			});
		});

		test.each([
			{ name: 'an undefined result', result: undefined },
			{ name: 'empty regions', result: { regions: [], paths: { smallest: [] } } },
		])('allows retrying after the provider returns $name', async ({ result }) => {
			regionProvider.getRegions.mockResolvedValueOnce(result);

			expect({
				firstRead: await invoke(),
				retriedRead: await invoke(),
				reasons: failureReasons(),
				regionCalls: regionProvider.getRegions.mock.calls.length,
			}).toEqual({
				firstRead: expectedLines(1, 10),
				retriedRead: expectedLines(1, 6),
				reasons: ['noGrepRegions'],
				regionCalls: 2,
			});
		});

		test.each(independentRequests)('preserves successful adjustments when cancelling a different $name', async ({ input: otherInput }) => {
			await invoke();
			regionProvider.getRegions.mockResolvedValueOnce(undefined);

			expect({
				failedRead: await invoke(otherInput),
				continuedRead: await invoke({ ...input, startLine: 11, endLine: 20 }),
				retriedRead: await invoke(otherInput),
				reasons: failureReasons(),
				regionCalls: regionProvider.getRegions.mock.calls.length,
			}).toEqual({
				failedRead: expectedLines(otherInput.startLine, otherInput.endLine),
				continuedRead: expectedLines(7, 20),
				retriedRead: expectedLines(otherInput.startLine, 6),
				reasons: ['noGrepRegions'],
				regionCalls: 3,
			});
		});

		test('allows retrying after the document changes during region lookup', async () => {
			regionProvider.getRegions.mockImplementationOnce(async () => {
				setDocText(documentData, content);
				return createRegionResult();
			});

			expect({
				firstRead: await invoke(),
				retriedRead: await invoke(),
				reasons: failureReasons(),
				regionCalls: regionProvider.getRegions.mock.calls.length,
			}).toEqual({
				firstRead: expectedLines(1, 10),
				retriedRead: expectedLines(1, 6),
				reasons: ['documentVersionChanged'],
				regionCalls: 2,
			});
		});

		test('allows retrying after the region provider throws', async () => {
			regionProvider.getRegions.mockRejectedValueOnce(new Error('Region lookup failed'));

			expect({
				firstRead: await invoke(),
				retriedRead: await invoke(),
				reasons: failureReasons(),
				regionCalls: regionProvider.getRegions.mock.calls.length,
			}).toEqual({
				firstRead: expectedLines(1, 10),
				retriedRead: expectedLines(1, 6),
				reasons: ['exception'],
				regionCalls: 2,
			});
		});

		test.each([
			{ name: 'before the requested start', endLine: 1 },
			{ name: 'at the requested end', endLine: 9 },
			{ name: 'after the requested end', endLine: 12 },
		])('does not remember an unapplied adjustment ending $name', async ({ endLine }) => {
			regionProvider.getRegions.mockResolvedValueOnce(createRegionResult(0, endLine));
			const requestedInput = { ...input, startLine: 4 };

			expect({
				firstRead: await invoke(requestedInput),
				nextRead: await invoke({ ...input, startLine: 11, endLine: 20 }),
				retriedRead: await invoke(requestedInput),
				regionCalls: regionProvider.getRegions.mock.calls.length,
			}).toEqual({
				firstRead: expectedLines(4, 10),
				nextRead: expectedLines(11, 20),
				retriedRead: expectedLines(4, 6),
				regionCalls: 2,
			});
		});

		test('can shorten to a single requested line and recover the remainder', async () => {
			regionProvider.getRegions.mockResolvedValueOnce(createRegionResult(0, 3));

			expect({
				firstRead: await invoke({ ...input, startLine: 4 }),
				continuedRead: await invoke({ ...input, startLine: 11, endLine: 20 }),
			}).toEqual({
				firstRead: expectedLines(4, 4),
				continuedRead: expectedLines(5, 20),
			});
		});

		test('does not reserve a read before grep results are available', async () => {
			const session = URI.file('/sessions/no-grep');
			const firstRead = await invoke(input, session);
			addGrepResult(session);

			expect({
				firstRead,
				retriedRead: await invoke(input, session),
				reasons: failureReasons(),
				regionCalls: regionProvider.getRegions.mock.calls.length,
			}).toEqual({
				firstRead: expectedLines(1, 10),
				retriedRead: expectedLines(1, 6),
				reasons: ['noGrep'],
				regionCalls: 1,
			});
		});

		test('does not use grep matches outside the requested range', async () => {
			expect({
				text: await invoke({ ...input, startLine: 11, endLine: 20 }),
				reasons: failureReasons(),
				regionCalls: regionProvider.getRegions.mock.calls.length,
			}).toEqual({
				text: expectedLines(11, 20),
				reasons: ['noGrep'],
				regionCalls: 0,
			});
		});

		test('preserves the reservation across duplicate reads during and after region lookup', async () => {
			const started = new DeferredPromise<void>();
			const response = new DeferredPromise<RegionResult>();
			regionProvider.getRegions.mockImplementationOnce(() => {
				void started.complete();
				return response.p;
			});

			const firstRead = invoke();
			await started.p;
			let repeatedRead: string;
			let thirdRead: string;
			try {
				repeatedRead = await invoke();
				thirdRead = await invoke();
			} finally {
				await response.complete(createRegionResult());
				await firstRead;
			}

			expect({
				firstRead: await firstRead,
				repeatedRead,
				thirdRead,
				readAfterCompletion: await invoke(),
				continuedRead: await invoke({ ...input, startLine: 11, endLine: 20 }),
				regionCalls: regionProvider.getRegions.mock.calls.length,
			}).toEqual({
				firstRead: expectedLines(1, 6),
				repeatedRead: expectedLines(1, 10),
				thirdRead: expectedLines(1, 10),
				readAfterCompletion: expectedLines(1, 10),
				continuedRead: expectedLines(7, 20),
				regionCalls: 1,
			});
		});

		test.each([
			{ name: 'fails', result: undefined, firstReadEnd: 10 },
			{ name: 'succeeds', result: createRegionResult(3, 3), firstReadEnd: 4 },
		])('preserves a replacement reservation when an evicted lookup $name', async ({ result, firstReadEnd }) => {
			const started = new DeferredPromise<void>();
			const response = new DeferredPromise<RegionResult | undefined>();
			regionProvider.getRegions.mockImplementationOnce(() => {
				void started.complete();
				return response.p;
			});

			const firstRead = invoke();
			await started.p;
			let replacementRead: string;
			try {
				for (let i = 0; i < MAX_GREP_RESULT_SESSIONS; i++) {
					addGrepResult(URI.file(`/sessions/eviction-${i}`));
				}
				addGrepResult();
				replacementRead = await invoke();
			} finally {
				await response.complete(result);
				await firstRead;
			}

			expect({
				firstRead: await firstRead,
				replacementRead,
				continuedRead: await invoke({ ...input, startLine: 11, endLine: 20 }),
				repeatedRead: await invoke(),
				regionCalls: regionProvider.getRegions.mock.calls.length,
			}).toEqual({
				firstRead: expectedLines(1, firstReadEnd),
				replacementRead: expectedLines(1, 6),
				continuedRead: expectedLines(7, 20),
				repeatedRead: expectedLines(1, 10),
				regionCalls: 2,
			});
		});

		test('handles offset and limit parameters for shortening, continuation and repeated reads', async () => {
			const firstInput: IReadFileParamsV2 = { filePath: fileUri.fsPath, offset: 4, limit: 6 };
			const nextInput: IReadFileParamsV2 = { filePath: fileUri.fsPath, offset: 11, limit: 9 };

			expect({
				firstRead: await invoke(firstInput),
				continuedRead: await invoke(nextInput),
				repeatedRead: await invoke(firstInput),
				equivalentV1Read: await invoke({ ...input, startLine: 4 }),
				regionCalls: regionProvider.getRegions.mock.calls.length,
			}).toEqual({
				firstRead: expectedLines(4, 6),
				continuedRead: expectedLines(7, 20),
				repeatedRead: expectedLines(4, 10),
				equivalentV1Read: expectedLines(4, 10),
				regionCalls: 1,
			});
		});

		test('recognizes a repeated read after normalizing reversed line bounds', async () => {
			expect({
				firstRead: await invoke({ ...input, startLine: 10, endLine: 4 }),
				repeatedRead: await invoke({ ...input, startLine: 4 }),
				regionCalls: regionProvider.getRegions.mock.calls.length,
			}).toEqual({
				firstRead: expectedLines(4, 6),
				repeatedRead: expectedLines(4, 10),
				regionCalls: 1,
			});
		});

		test('reports proposed regions, repeated reads and recovered line counts in telemetry', async () => {
			await invoke(input, firstSession, 'first-request');
			await invoke(input, firstSession, 'repeated-request');
			await invoke({ ...input, startLine: 11, endLine: 20 }, firstSession, 'continued-request');

			expect(telemetry.events.filter(event => event.eventName.startsWith('readFileRegion'))).toEqual([
				{
					eventName: 'readFileRegionAdjusted',
					properties: {
						requestId: 'first-request',
						languageId: 'typescript',
						smallestPath: '[0]',
						largestPath: undefined,
					},
					measurements: { originalLines: 10, adjustedLines: 3, deltaStart: 3, deltaEnd: 4 },
				},
				{
					eventName: 'readFileRegionAdjustingFailed',
					properties: {
						requestId: 'repeated-request',
						reason: 'reReadSameRange',
						languageId: 'typescript',
					},
					measurements: { lines: 10 },
				},
				{
					eventName: 'readFileRegionContinuous',
					properties: {
						requestId: 'continued-request',
						languageId: 'typescript',
					},
					measurements: { deltaStart: 4 },
				},
			]);
		});
	});

	suite('prepareInvocation', () => {
		test('should return "Reading/Read skill" message for skill files', async () => {
			const testDoc = createTextDocumentData(URI.file('/workspace/test.skill.md'), 'skill content', 'markdown').document;

			const services = createExtensionUnitTestingServices();
			services.define(IWorkspaceService, new SyncDescriptor(
				TestWorkspaceService,
				[
					[URI.file('/workspace')],
					[testDoc],
				]
			));

			const mockCustomInstructions = new MockCustomInstructionsService();
			mockCustomInstructions.setSkillFiles([URI.file('/workspace/test.skill.md')]);
			services.define(ICustomInstructionsService, mockCustomInstructions);

			const testAccessor = services.createTestingAccessor();
			const readFileTool = testAccessor.get(IInstantiationService).createInstance(ReadFileTool);

			const input: IReadFileParamsV2 = {
				filePath: '/workspace/test.skill.md'
			};

			const result = await readFileTool.prepareInvocation(
				{ input },
				CancellationToken.None
			);

			expect(result).toBeDefined();
			expect((result!.invocationMessage as MarkdownString).value).toBe('Reading skill [workspace](file:///workspace/test.skill.md?vscodeLinkType%3Dskill)');
			expect((result!.pastTenseMessage as MarkdownString).value).toBe('Read skill [workspace](file:///workspace/test.skill.md?vscodeLinkType%3Dskill)');

			testAccessor.dispose();
		});

		test('should return "Reading/Read" message for non-skill files', async () => {
			const testDoc = createTextDocumentData(URI.file('/workspace/test.ts'), 'code content', 'typescript').document;

			const services = createExtensionUnitTestingServices();
			services.define(IWorkspaceService, new SyncDescriptor(
				TestWorkspaceService,
				[
					[URI.file('/workspace')],
					[testDoc],
				]
			));

			const mockCustomInstructions = new MockCustomInstructionsService();
			// Don't mark this file as a skill file
			services.define(ICustomInstructionsService, mockCustomInstructions);

			const testAccessor = services.createTestingAccessor();
			const readFileTool = testAccessor.get(IInstantiationService).createInstance(ReadFileTool);

			const input: IReadFileParamsV2 = {
				filePath: '/workspace/test.ts'
			};

			const result = await readFileTool.prepareInvocation(
				{ input },
				CancellationToken.None
			);

			expect(result).toBeDefined();
			expect((result!.invocationMessage as MarkdownString).value).toBe('Reading [](file:///workspace/test.ts)');
			expect((result!.pastTenseMessage as MarkdownString).value).toBe('Read [](file:///workspace/test.ts)');

			testAccessor.dispose();
		});

		test('should return "Reading skill/Read skill" message for skill files with line range', async () => {
			const testDoc = createTextDocumentData(URI.file('/workspace/test.skill.md'), 'line 1\nline 2\nline 3\nline 4\nline 5', 'markdown').document;

			const services = createExtensionUnitTestingServices();
			services.define(IWorkspaceService, new SyncDescriptor(
				TestWorkspaceService,
				[
					[URI.file('/workspace')],
					[testDoc],
				]
			));

			const mockCustomInstructions = new MockCustomInstructionsService();
			mockCustomInstructions.setSkillFiles([URI.file('/workspace/test.skill.md')]);
			services.define(ICustomInstructionsService, mockCustomInstructions);

			const testAccessor = services.createTestingAccessor();
			const readFileTool = testAccessor.get(IInstantiationService).createInstance(ReadFileTool);

			const input: IReadFileParamsV2 = {
				filePath: '/workspace/test.skill.md',
				offset: 2,
				limit: 2
			};

			const result = await readFileTool.prepareInvocation(
				{ input },
				CancellationToken.None
			);

			expect(result).toBeDefined();
			// When reading a partial range of a skill file, it should say "Reading skill"
			expect((result!.invocationMessage as MarkdownString).value).toBe('Reading skill [workspace](file:///workspace/test.skill.md?vscodeLinkType%3Dskill#2-2), lines 2 to 4');
			expect((result!.pastTenseMessage as MarkdownString).value).toBe('Read skill [workspace](file:///workspace/test.skill.md?vscodeLinkType%3Dskill#2-2), lines 2 to 4');

			testAccessor.dispose();
		});

		test('should return "Reading/Read skill" message for non-.md skill files', async () => {
			const testDoc = createTextDocumentData(URI.file('/workspace/test.skill'), 'skill content', 'plaintext').document;

			const services = createExtensionUnitTestingServices();
			services.define(IWorkspaceService, new SyncDescriptor(
				TestWorkspaceService,
				[
					[URI.file('/workspace')],
					[testDoc],
				]
			));

			const mockCustomInstructions = new MockCustomInstructionsService();
			mockCustomInstructions.setSkillFiles([URI.file('/workspace/test.skill')]);
			services.define(ICustomInstructionsService, mockCustomInstructions);

			const testAccessor = services.createTestingAccessor();
			const readFileTool = testAccessor.get(IInstantiationService).createInstance(ReadFileTool);

			const input: IReadFileParamsV2 = {
				filePath: '/workspace/test.skill'
			};

			const result = await readFileTool.prepareInvocation(
				{ input },
				CancellationToken.None
			);

			expect(result).toBeDefined();
			// For non-.md skill files, skill name should be in backticks
			expect((result!.invocationMessage as MarkdownString).value).toContain('Reading skill `workspace`: [](file:///workspace/test.skill)');
			expect((result!.pastTenseMessage as MarkdownString).value).toContain('Read skill `workspace`: [](file:///workspace/test.skill)');

			testAccessor.dispose();
		});

		test('should return "Reading/Read skill" message for non-.md skill files with line range', async () => {
			const testDoc = createTextDocumentData(URI.file('/workspace/test.skill'), 'line 1\nline 2\nline 3\nline 4\nline 5', 'plaintext').document;

			const services = createExtensionUnitTestingServices();
			services.define(IWorkspaceService, new SyncDescriptor(
				TestWorkspaceService,
				[
					[URI.file('/workspace')],
					[testDoc],
				]
			));

			const mockCustomInstructions = new MockCustomInstructionsService();
			mockCustomInstructions.setSkillFiles([URI.file('/workspace/test.skill')]);
			services.define(ICustomInstructionsService, mockCustomInstructions);

			const testAccessor = services.createTestingAccessor();
			const readFileTool = testAccessor.get(IInstantiationService).createInstance(ReadFileTool);

			const input: IReadFileParamsV2 = {
				filePath: '/workspace/test.skill',
				offset: 2,
				limit: 2
			};

			const result = await readFileTool.prepareInvocation(
				{ input },
				CancellationToken.None
			);

			expect(result).toBeDefined();
			// For non-.md skill files with range, skill name should be in backticks
			expect((result!.invocationMessage as MarkdownString).value).toContain('Reading skill `workspace`: [](file:///workspace/test.skill#2-2), lines 2 to 4');
			expect((result!.pastTenseMessage as MarkdownString).value).toContain('Read skill `workspace`: [](file:///workspace/test.skill#2-2), lines 2 to 4');

			testAccessor.dispose();
		});

		test('should return "Reading/Read" message for non-skill files with line range', async () => {
			const testDoc = createTextDocumentData(URI.file('/workspace/test.ts'), 'line 1\nline 2\nline 3\nline 4\nline 5', 'typescript').document;

			const services = createExtensionUnitTestingServices();
			services.define(IWorkspaceService, new SyncDescriptor(
				TestWorkspaceService,
				[
					[URI.file('/workspace')],
					[testDoc],
				]
			));

			const mockCustomInstructions = new MockCustomInstructionsService();
			// Don't mark this file as a skill file
			services.define(ICustomInstructionsService, mockCustomInstructions);

			const testAccessor = services.createTestingAccessor();
			const readFileTool = testAccessor.get(IInstantiationService).createInstance(ReadFileTool);

			const input: IReadFileParamsV2 = {
				filePath: '/workspace/test.ts',
				offset: 2,
				limit: 2
			};

			const result = await readFileTool.prepareInvocation(
				{ input },
				CancellationToken.None
			);

			expect(result).toBeDefined();
			// When reading a partial range of a non-skill file, it should say "Reading"
			expect((result!.invocationMessage as MarkdownString).value).toBe('Reading [](file:///workspace/test.ts#2-2), lines 2 to 4');
			expect((result!.pastTenseMessage as MarkdownString).value).toBe('Read [](file:///workspace/test.ts#2-2), lines 2 to 4');

			testAccessor.dispose();
		});
	});

	suite('image files', () => {
		test('throws for image files and points to view_image', async () => {
			const services = createExtensionUnitTestingServices();
			const mockFs = new MockFileSystemService();
			mockFs.mockFile(URI.file('/workspace/photo.jpg'), 'fake-image-bytes');
			services.define(IFileSystemService, mockFs);
			services.define(IWorkspaceService, new SyncDescriptor(
				TestWorkspaceService,
				[[URI.file('/workspace')], []]
			));

			const testAccessor = services.createTestingAccessor();
			const readFileTool = testAccessor.get(IInstantiationService).createInstance(ReadFileTool);

			const input: IReadFileParamsV2 = { filePath: '/workspace/photo.jpg' };
			await expect(readFileTool.invoke(
				{ input, toolInvocationToken: null as never },
				CancellationToken.None
			)).rejects.toThrow('Use view_image instead');

			testAccessor.dispose();
		});

		test('prepareInvocation throws for image files and points to view_image', async () => {
			const services = createExtensionUnitTestingServices();
			const mockFs = new MockFileSystemService();
			mockFs.mockFile(URI.file('/workspace/photo.png'), 'fake-image-bytes');
			services.define(IFileSystemService, mockFs);
			services.define(IWorkspaceService, new SyncDescriptor(
				TestWorkspaceService,
				[[URI.file('/workspace')], []]
			));

			const testAccessor = services.createTestingAccessor();
			const readFileTool = testAccessor.get(IInstantiationService).createInstance(ReadFileTool);

			const input: IReadFileParamsV2 = { filePath: '/workspace/photo.png' };
			await expect(readFileTool.prepareInvocation(
				{ input },
				CancellationToken.None
			)).rejects.toThrow('Use view_image instead');

			testAccessor.dispose();
		});
	});

	suite('binary files', () => {
		function createBinaryMockFs(uri: URI, data: Uint8Array): MockFileSystemService {
			return new class extends MockFileSystemService {
				override async readFile(resource: URI): Promise<Uint8Array> {
					if (resource.toString() === uri.toString()) {
						return data;
					}
					return super.readFile(resource);
				}
			}();
		}

		test('returns hexdump for binary file', async () => {
			const binaryUri = URI.file('/workspace/binary.dat');
			// Data with null bytes triggers binary detection
			const binaryData = new Uint8Array([0x4d, 0x5a, 0x00, 0x03, 0x00, 0x00, 0xff, 0xfe]);
			const mockFs = createBinaryMockFs(binaryUri, binaryData);

			const services = createExtensionUnitTestingServices();
			services.define(IFileSystemService, mockFs);
			services.define(IWorkspaceService, new SyncDescriptor(
				TestWorkspaceService,
				[[URI.file('/workspace')], []]
			));

			const testAccessor = services.createTestingAccessor();
			const readFileTool = testAccessor.get(IInstantiationService).createInstance(ReadFileTool);

			const input: IReadFileParamsV2 = { filePath: '/workspace/binary.dat' };
			const result = await readFileTool.invoke(
				{ input, toolInvocationToken: null as never },
				CancellationToken.None
			);

			const text = await toolResultToString(testAccessor, result);
			// Should contain hex representation
			expect(text).toContain('4d 5a 00 03');
			expect(text).toContain('MZ');

			testAccessor.dispose();
		});

		test('returns hexdump with v1 byte range params', async () => {
			const binaryUri = URI.file('/workspace/binary.dat');
			const binaryData = new Uint8Array(64);
			for (let i = 0; i < 64; i++) {
				binaryData[i] = i;
			}
			// Ensure there's a null byte for detection
			binaryData[0] = 0x00;
			const mockFs = createBinaryMockFs(binaryUri, binaryData);

			const services = createExtensionUnitTestingServices();
			services.define(IFileSystemService, mockFs);
			services.define(IWorkspaceService, new SyncDescriptor(
				TestWorkspaceService,
				[[URI.file('/workspace')], []]
			));

			const testAccessor = services.createTestingAccessor();
			const readFileTool = testAccessor.get(IInstantiationService).createInstance(ReadFileTool);

			const input: IReadFileParamsV1 = { filePath: '/workspace/binary.dat', startLine: 16, endLine: 32 };
			const result = await readFileTool.invoke(
				{ input, toolInvocationToken: null as never },
				CancellationToken.None
			);

			const text = await toolResultToString(testAccessor, result);
			// Should contain hex starting from offset 16
			expect(text).toContain('00000010');

			testAccessor.dispose();
		});

		test('returns hexdump with v2 offset/limit byte params', async () => {
			const binaryUri = URI.file('/workspace/binary.dat');
			const binaryData = new Uint8Array(64);
			for (let i = 0; i < 64; i++) {
				binaryData[i] = i;
			}
			binaryData[0] = 0x00;
			const mockFs = createBinaryMockFs(binaryUri, binaryData);

			const services = createExtensionUnitTestingServices();
			services.define(IFileSystemService, mockFs);
			services.define(IWorkspaceService, new SyncDescriptor(
				TestWorkspaceService,
				[[URI.file('/workspace')], []]
			));

			const testAccessor = services.createTestingAccessor();
			const readFileTool = testAccessor.get(IInstantiationService).createInstance(ReadFileTool);

			const input: IReadFileParamsV2 = { filePath: '/workspace/binary.dat', offset: 16 };
			const result = await readFileTool.invoke(
				{ input, toolInvocationToken: null as never },
				CancellationToken.None
			);

			const text = await toolResultToString(testAccessor, result);
			// Should contain hex starting from byte offset 16
			expect(text).toContain('00000010');

			testAccessor.dispose();
		});

		test('returns hexdump with v2 offset and limit byte params', async () => {
			const binaryUri = URI.file('/workspace/binary.dat');
			const binaryData = new Uint8Array(128);
			for (let i = 0; i < 128; i++) {
				binaryData[i] = i;
			}
			binaryData[0] = 0x00;
			const mockFs = createBinaryMockFs(binaryUri, binaryData);

			const services = createExtensionUnitTestingServices();
			services.define(IFileSystemService, mockFs);
			services.define(IWorkspaceService, new SyncDescriptor(
				TestWorkspaceService,
				[[URI.file('/workspace')], []]
			));

			const testAccessor = services.createTestingAccessor();
			const readFileTool = testAccessor.get(IInstantiationService).createInstance(ReadFileTool);

			const input: IReadFileParamsV2 = { filePath: '/workspace/binary.dat', offset: 16, limit: 16 };
			const result = await readFileTool.invoke(
				{ input, toolInvocationToken: null as never },
				CancellationToken.None
			);

			const text = await toolResultToString(testAccessor, result);
			// Should contain hex starting from byte offset 16
			expect(text).toContain('00000010');
			// Should NOT contain hex from byte offset 32 (limit=16 means only 16 bytes)
			expect(text).not.toContain('00000020');

			testAccessor.dispose();
		});

		test('does not treat text files as binary', async () => {
			const textUri = URI.file('/workspace/text.dat');
			// Pure text content with no null bytes
			const textData = new TextEncoder().encode('Hello, world!\nThis is text.\n');
			const mockFs = createBinaryMockFs(textUri, textData);

			// Also register as a text document so openTextDocument works
			const textDoc = createTextDocumentData(textUri, 'Hello, world!\nThis is text.\n', 'plaintext').document;
			const services = createExtensionUnitTestingServices();
			services.define(IFileSystemService, mockFs);
			services.define(IWorkspaceService, new SyncDescriptor(
				TestWorkspaceService,
				[[URI.file('/workspace')], [textDoc]]
			));

			const testAccessor = services.createTestingAccessor();
			const readFileTool = testAccessor.get(IInstantiationService).createInstance(ReadFileTool);

			const input: IReadFileParamsV2 = { filePath: '/workspace/text.dat' };
			const result = await readFileTool.invoke(
				{ input, toolInvocationToken: null as never },
				CancellationToken.None
			);

			const text = await toolResultToString(testAccessor, result);
			// Should contain the original text, not hex
			expect(text).toContain('Hello, world!');
			expect(text).not.toContain('00000000');

			testAccessor.dispose();
		});
	});

	suite('skill provenance telemetry', () => {
		test('should send separate skillContentRead event with skillStorage=local for workspace skill files', async () => {
			const skillContent = '# My Skill\nDo something useful.';
			const skillUri = URI.file('/workspace/.github/skills/my-skill/SKILL.md');
			const testDoc = createTextDocumentData(skillUri, skillContent, 'markdown').document;

			const services = createExtensionUnitTestingServices();
			services.define(IWorkspaceService, new SyncDescriptor(
				TestWorkspaceService,
				[[URI.file('/workspace')], [testDoc]]
			));

			const mockCustomInstructions = new MockCustomInstructionsService();
			mockCustomInstructions.setSkillFiles([skillUri]);
			services.define(ICustomInstructionsService, mockCustomInstructions);

			const telemetry = new CapturingTelemetryService();
			services.define(ITelemetryService, telemetry);

			const testAccessor = services.createTestingAccessor();
			const readFileTool = testAccessor.get(IInstantiationService).createInstance(ReadFileTool);

			const input: IReadFileParamsV2 = { filePath: skillUri.fsPath };
			await readFileTool.invoke({ input, toolInvocationToken: null as never }, CancellationToken.None);

			const event = telemetry.events.find(e => e.eventName === 'skillContentRead');
			expect(event).toBeDefined();
			expect(event!.properties!.skillStorage).toBe(SkillStorage.Workspace);
			expect(event!.properties!.skillNameHash).not.toBe('');
			expect(event!.properties!.skillExtensionIdHash).toBe('');
			expect(event!.properties!.skillExtensionVersion).toBe('');
			expect(event!.properties!.skillContentHash).not.toBe('');

			const enhanced = telemetry.enhancedEvents.find(e => e.eventName === 'skillContentRead');
			expect(enhanced).toBeDefined();
			expect(enhanced!.properties!.skillName).toBe('my-skill');
			expect(enhanced!.properties!.skillPath).toBe(skillUri.toString());
			expect(enhanced!.properties!.skillExtensionId).toBe('');
			expect(enhanced!.properties!.skillExtensionVersion).toBe('');
			expect(enhanced!.properties!.skillStorage).toBe(SkillStorage.Workspace);
			expect(enhanced!.properties!.skillContentHash).not.toBe('');

			const internal = telemetry.internalEvents.find(e => e.eventName === 'skillContentRead');
			expect(internal).toBeDefined();
			expect(internal!.properties!.skillName).toBe('my-skill');
			expect(internal!.properties!.skillPath).toBe(skillUri.toString());
			expect(internal!.properties!.skillExtensionId).toBe('');
			expect(internal!.properties!.skillStorage).toBe(SkillStorage.Workspace);
			expect(internal!.properties!.skillContentHash).not.toBe('');

			testAccessor.dispose();
		});

		test('should send skillStorage=user for personal skill files', async () => {
			const skillContent = '# Personal Skill';
			// NullNativeEnvService uses /home/testuser as userHome
			const skillUri = URI.file('/home/testuser/.copilot/skills/personal-skill/SKILL.md');
			const testDoc = createTextDocumentData(skillUri, skillContent, 'markdown').document;

			const services = createExtensionUnitTestingServices();
			services.define(IWorkspaceService, new SyncDescriptor(
				TestWorkspaceService,
				[[URI.file('/workspace')], [testDoc]]
			));

			const mockCustomInstructions = new MockCustomInstructionsService();
			mockCustomInstructions.setSkillFiles([skillUri], SkillStorage.Personal);
			services.define(ICustomInstructionsService, mockCustomInstructions);

			const telemetry = new CapturingTelemetryService();
			services.define(ITelemetryService, telemetry);

			const testAccessor = services.createTestingAccessor();
			const readFileTool = testAccessor.get(IInstantiationService).createInstance(ReadFileTool);

			const input: IReadFileParamsV2 = { filePath: skillUri.fsPath };
			await readFileTool.invoke({ input, toolInvocationToken: null as never }, CancellationToken.None);

			const event = telemetry.events.find(e => e.eventName === 'skillContentRead');
			expect(event).toBeDefined();
			expect(event!.properties!.skillStorage).toBe(SkillStorage.Personal);

			testAccessor.dispose();
		});

		test('should send skillStorage=extension with skillExtensionIdHash and skillExtensionVersion', async () => {
			const skillContent = '# Extension Skill';
			const skillUri = URI.file('/extensions/publisher.my-ext/skills/ext-skill/SKILL.md');
			const testDoc = createTextDocumentData(skillUri, skillContent, 'markdown').document;

			const services = createExtensionUnitTestingServices();
			services.define(IWorkspaceService, new SyncDescriptor(
				TestWorkspaceService,
				[[URI.file('/workspace')], [testDoc]]
			));

			const mockCustomInstructions = new MockCustomInstructionsService();
			mockCustomInstructions.setSkillFiles([skillUri]);
			mockCustomInstructions.setExtensionSkillInfos([{
				uri: skillUri,
				skillName: 'ext-skill',
				skillFolderUri: URI.file('/extensions/publisher.my-ext/skills/ext-skill'),
				extensionId: 'publisher.my-ext',
			}]);
			services.define(ICustomInstructionsService, mockCustomInstructions);

			const extensionsService = new TestExtensionsService();
			extensionsService.addExtension({
				id: 'publisher.my-ext',
				packageJSON: { version: '1.2.3' },
			} as any);
			services.define(IExtensionsService, extensionsService);

			const telemetry = new CapturingTelemetryService();
			services.define(ITelemetryService, telemetry);

			const testAccessor = services.createTestingAccessor();
			const readFileTool = testAccessor.get(IInstantiationService).createInstance(ReadFileTool);

			const input: IReadFileParamsV2 = { filePath: skillUri.fsPath };
			await readFileTool.invoke({ input, toolInvocationToken: null as never }, CancellationToken.None);

			const event = telemetry.events.find(e => e.eventName === 'skillContentRead');
			expect(event).toBeDefined();
			expect(event!.properties!.skillStorage).toBe(SkillStorage.Extension);
			expect(event!.properties!.skillExtensionIdHash).not.toBe('');
			expect(event!.properties!.skillExtensionVersion).toBe('1.2.3');
			expect(event!.properties!.skillContentHash).not.toBe('');

			const enhanced = telemetry.enhancedEvents.find(e => e.eventName === 'skillContentRead');
			expect(enhanced).toBeDefined();
			expect(enhanced!.properties!.skillName).toBe('ext-skill');
			expect(enhanced!.properties!.skillPath).toBe(skillUri.toString());
			expect(enhanced!.properties!.skillExtensionId).toBe('publisher.my-ext');
			expect(enhanced!.properties!.skillExtensionVersion).toBe('1.2.3');
			expect(enhanced!.properties!.skillStorage).toBe(SkillStorage.Extension);
			expect(enhanced!.properties!.skillContentHash).not.toBe('');

			const internal = telemetry.internalEvents.find(e => e.eventName === 'skillContentRead');
			expect(internal).toBeDefined();
			expect(internal!.properties!.skillName).toBe('ext-skill');
			expect(internal!.properties!.skillExtensionId).toBe('publisher.my-ext');
			expect(internal!.properties!.skillExtensionVersion).toBe('1.2.3');
			expect(internal!.properties!.skillStorage).toBe(SkillStorage.Extension);
			expect(internal!.properties!.skillContentHash).not.toBe('');

			testAccessor.dispose();
		});

		test('should not send skillContentRead for non-skill files', async () => {
			const telemetry = new CapturingTelemetryService();
			const services = createExtensionUnitTestingServices();
			services.define(ITelemetryService, telemetry);

			const testDoc = createTextDocumentData(URI.file('/workspace/file.ts'), 'line 1\nline 2', 'ts').document;
			services.define(IWorkspaceService, new SyncDescriptor(
				TestWorkspaceService,
				[[URI.file('/workspace')], [testDoc]]
			));

			const testAccessor = services.createTestingAccessor();
			const readFileTool = testAccessor.get(IInstantiationService).createInstance(ReadFileTool);

			const input: IReadFileParamsV2 = { filePath: '/workspace/file.ts' };
			await readFileTool.invoke({ input, toolInvocationToken: null as never }, CancellationToken.None);

			const skillEvent = telemetry.events.find(e => e.eventName === 'skillContentRead');
			expect(skillEvent).toBeUndefined();

			const enhancedSkillEvent = telemetry.enhancedEvents.find(e => e.eventName === 'skillContentRead');
			expect(enhancedSkillEvent).toBeUndefined();

			const internalSkillEvent = telemetry.internalEvents.find(e => e.eventName === 'skillContentRead');
			expect(internalSkillEvent).toBeUndefined();

			// readFileToolInvoked should still fire
			const readEvent = telemetry.events.find(e => e.eventName === 'readFileToolInvoked');
			expect(readEvent).toBeDefined();
			expect(readEvent!.properties!.fileType).toBe('');

			testAccessor.dispose();
		});
	});
});
