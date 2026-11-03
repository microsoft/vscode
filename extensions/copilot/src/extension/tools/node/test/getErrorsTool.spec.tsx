/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, expect, suite, test } from 'vitest';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { MockFileSystemService } from '../../../../platform/filesystem/node/test/mockFileSystemService';
import { ILanguageDiagnosticsService } from '../../../../platform/languages/common/languageDiagnosticsService';
import { TestLanguageDiagnosticsService } from '../../../../platform/languages/common/testLanguageDiagnosticsService';
import { IPromptPathRepresentationService } from '../../../../platform/prompts/common/promptPathRepresentationService';
import { ITestingServicesAccessor, TestingServiceCollection } from '../../../../platform/test/node/services';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { createTextDocumentData } from '../../../../util/common/test/shims/textDocument';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { URI } from '../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { DiagnosticSeverity, Range } from '../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { GetErrorsTool } from '../getErrorsTool';
import { toolResultToString } from './toolTestUtils';

// Test the GetErrorsTool functionality
suite('GetErrorsTool - Tool Invocation', () => {
	let accessor: ITestingServicesAccessor;
	let collection: TestingServiceCollection;
	let diagnosticsService: TestLanguageDiagnosticsService;
	let fileSystemService: MockFileSystemService;
	let tool: GetErrorsTool;

	const workspaceFolder = URI.file('/test/workspace');
	const srcFolder = URI.file('/test/workspace/src');
	const tsFile1 = URI.file('/test/workspace/src/file1.ts');
	const tsFile2 = URI.file('/test/workspace/src/file2.ts');
	const jsFile = URI.file('/test/workspace/lib/file.js');
	const noErrorFile = URI.file('/test/workspace/src/noErrorFile.ts');
	const eslintErrorFile = URI.file('/test/workspace/eslint/eslint_unexpected_constant_condition_1.ts');
	const emptyLineErrorFile = URI.file('/test/workspace/emptyLineError.ts');

	beforeEach(() => {
		collection = createExtensionUnitTestingServices();

		// Set up test documents
		const tsDoc1 = createTextDocumentData(tsFile1, 'function test() {\n  const x = 1;\n  return x;\n}', 'ts').document;
		const tsDoc2 = createTextDocumentData(tsFile2, 'interface User {\n  name: string;\n  age: number;\n}', 'ts').document;
		const jsDoc = createTextDocumentData(jsFile, 'function legacy() {\n  var y = 2;\n  return y;\n}', 'js').document;
		const noErrorDoc = createTextDocumentData(noErrorFile, '', 'ts').document;
		const eslintErrorDoc = createTextDocumentData(eslintErrorFile, 'if (true) {\n  console.log("This is a constant condition");\n}', 'ts').document;
		// File with a trailing empty line where the error is reported
		const emptyLineErrorDoc = createTextDocumentData(emptyLineErrorFile, 'codeunit 50100 MyCU {\n  procedure Foo() {\n\n', 'ts').document;

		collection.define(IWorkspaceService, new SyncDescriptor(TestWorkspaceService, [[workspaceFolder], [tsDoc1, tsDoc2, jsDoc, noErrorDoc, eslintErrorDoc, emptyLineErrorDoc]]));

		// Set up diagnostics service
		diagnosticsService = new TestLanguageDiagnosticsService();
		collection.define(ILanguageDiagnosticsService, diagnosticsService);

		// Set up file system service to mock directories
		fileSystemService = new MockFileSystemService();
		fileSystemService.mockDirectory(srcFolder, []);
		collection.define(IFileSystemService, fileSystemService);

		accessor = collection.createTestingAccessor();

		// Create the tool instance
		tool = accessor.get(IInstantiationService).createInstance(GetErrorsTool);

		// Add test diagnostics
		diagnosticsService.setDiagnostics(tsFile1, [
			{
				message: 'Variable is declared but never used',
				range: new Range(1, 8, 1, 9),
				severity: DiagnosticSeverity.Warning
			},
			{
				message: 'Missing return type annotation',
				range: new Range(0, 9, 0, 13),
				severity: DiagnosticSeverity.Error
			}
		]);

		diagnosticsService.setDiagnostics(tsFile2, [
			{
				message: 'Interface should be exported',
				range: new Range(0, 0, 0, 9),
				severity: DiagnosticSeverity.Information // Should be filtered out
			},
			{
				message: 'Property age should be optional',
				range: new Range(2, 2, 2, 5),
				severity: DiagnosticSeverity.Warning
			}
		]);

		diagnosticsService.setDiagnostics(jsFile, [
			{
				message: 'Use const instead of var',
				range: new Range(1, 2, 1, 5),
				severity: DiagnosticSeverity.Warning
			}
		]);

		diagnosticsService.setDiagnostics(eslintErrorFile, [
			{
				message: 'Unexpected constant condition.',
				range: new Range(1, 4, 1, 4),
				severity: DiagnosticSeverity.Error
			}
		]);

		diagnosticsService.setDiagnostics(emptyLineErrorFile, [
			{
				message: 'Syntax error, \'}\' expected.',
				range: new Range(2, 0, 2, 0),
				severity: DiagnosticSeverity.Error
			}
		]);
	});

	afterEach(() => {
		accessor.dispose();
	});

	test('getDiagnostics - returns empty when no paths provided', () => {
		// Test getting all diagnostics
		const allDiagnostics = tool.getDiagnostics([]);
		expect(allDiagnostics).toEqual([]);
	});

	test('getDiagnostics - filters by file path', () => {
		// Test with specific file path
		const results = tool.getDiagnostics([{ uri: tsFile1, range: undefined }]);

		expect(results).toEqual([
			{ uri: tsFile1, diagnostics: diagnosticsService.getDiagnostics(tsFile1).filter(d => d.severity <= DiagnosticSeverity.Warning) } // Should only include Warning and Error
		]);
	});

	test('getDiagnostics - filters by folder path', () => {
		// Test with folder path
		const srcFolder = URI.file('/test/workspace/src');
		const results = tool.getDiagnostics([{ uri: srcFolder, range: undefined }]);

		// Should find diagnostics for files in the src folder
		expect(results).toEqual([
			{ uri: tsFile1, diagnostics: diagnosticsService.getDiagnostics(tsFile1).filter(d => d.severity <= DiagnosticSeverity.Warning), inputUri: srcFolder },
			{ uri: tsFile2, diagnostics: diagnosticsService.getDiagnostics(tsFile2).filter(d => d.severity <= DiagnosticSeverity.Warning), inputUri: srcFolder }
		]);
	});

	test('getDiagnostics - filters by range', () => {
		// Test with specific range that only covers line 1
		const range = new Range(1, 0, 1, 10);
		const results = tool.getDiagnostics([{ uri: tsFile1, range }]);

		expect(results).toEqual([
			{ uri: tsFile1, diagnostics: diagnosticsService.getDiagnostics(tsFile1).filter(d => d.severity <= DiagnosticSeverity.Warning && d.range.intersection(range)) }
		]);
	});

	test('getDiagnostics - file with no diagnostics returns empty diagnostics array', () => {
		const noErrorFile = URI.file('/test/workspace/src/noErrorFile.ts');
		const results = tool.getDiagnostics([{ uri: noErrorFile, range: undefined }]);

		expect(results).toEqual([
			{ uri: noErrorFile, diagnostics: [] }
		]);
	});

	test('getDiagnostics - folder path excludes files with only Info and Hint diagnostics', () => {
		// Create a file with only Info and Hint diagnostics
		const infoHintOnlyFile = URI.file('/test/workspace/src/infoHintOnly.ts');
		diagnosticsService.setDiagnostics(infoHintOnlyFile, [
			{
				message: 'This is just informational',
				range: new Range(0, 0, 0, 5),
				severity: DiagnosticSeverity.Information
			},
			{
				message: 'This is a hint',
				range: new Range(1, 0, 1, 5),
				severity: DiagnosticSeverity.Hint
			}
		]);

		// Request diagnostics for the src folder
		const srcFolder = URI.file('/test/workspace/src');
		const results = tool.getDiagnostics([{ uri: srcFolder, range: undefined }]);

		// Should only include tsFile1 and tsFile2, not infoHintOnlyFile (which has no Warning/Error)
		expect(results).toEqual([
			{ uri: tsFile1, diagnostics: diagnosticsService.getDiagnostics(tsFile1).filter(d => d.severity <= DiagnosticSeverity.Warning), inputUri: srcFolder },
			{ uri: tsFile2, diagnostics: diagnosticsService.getDiagnostics(tsFile2).filter(d => d.severity <= DiagnosticSeverity.Warning), inputUri: srcFolder }
		]);
	});

	// Tool invocation tests
	test('Tool invocation - with no filePaths aggregates all diagnostics and formats workspace message', async () => {
		const result = await tool.invoke({ input: {}, toolInvocationToken: null! }, CancellationToken.None);
		const msg = await toolResultToString(accessor, result);
		expect(msg).toMatchSnapshot();
	});

	test('Tool invocation - with single filePath limits diagnostics and message to that file', async () => {
		const pathRep = accessor.get(IPromptPathRepresentationService);
		const filePath = pathRep.getFilePath(tsFile1);
		const result = await tool.invoke({ input: { filePaths: [filePath] }, toolInvocationToken: null! }, CancellationToken.None);
		const msg = await toolResultToString(accessor, result);
		expect(msg).toMatchSnapshot();
	});

	test('Tool invocation - with folder path includes diagnostics from contained files', async () => {
		const pathRep = accessor.get(IPromptPathRepresentationService);
		const srcFolderUri = URI.file('/test/workspace/src');
		const srcFolderPath = pathRep.getFilePath(srcFolderUri);
		const result = await tool.invoke({ input: { filePaths: [srcFolderPath] }, toolInvocationToken: null! }, CancellationToken.None);
		const msg = await toolResultToString(accessor, result);
		expect(msg).toMatchSnapshot();
	});

	test('Tool invocation - with filePath and range filters diagnostics to that range', async () => {
		const pathRep = accessor.get(IPromptPathRepresentationService);
		const filePath = pathRep.getFilePath(tsFile1);
		// Range only covering the second line (line index 1) -> should include the warning at line 1 but not the error at line 0 if it doesn't intersect
		const range = new Range(1, 0, 1, 50);
		const result = await tool.invoke({
			input: {
				filePaths: [filePath],
				ranges: [[range.start.line, range.start.character, range.end.line, range.end.character]]
			},
			toolInvocationToken: null!
		}, CancellationToken.None);

		const msg = await toolResultToString(accessor, result);
		expect(msg).toMatchSnapshot();
	});

	test('Tool invocation - filePath with no diagnostics still has a <errors> entry', async () => {
		const pathRep = accessor.get(IPromptPathRepresentationService);
		const filePath = pathRep.getFilePath(noErrorFile);
		const result = await tool.invoke({ input: { filePaths: [filePath] }, toolInvocationToken: null! }, CancellationToken.None);
		const msg = await toolResultToString(accessor, result);
		expect(msg).toMatchSnapshot();
	});

	test('Tool invocation - filePath with range has a <compileError> entry', async () => {
		const pathRep = accessor.get(IPromptPathRepresentationService);
		const filePath = pathRep.getFilePath(eslintErrorFile);
		const result = await tool.invoke({ input: { filePaths: [filePath], ranges: [[1, 4, 1, 4]] }, toolInvocationToken: null! }, CancellationToken.None);
		const msg = await toolResultToString(accessor, result);
		expect(msg).toMatchSnapshot();
	});

	test('Tool invocation - diagnostic on empty line is still reported', async () => {
		const pathRep = accessor.get(IPromptPathRepresentationService);
		const filePath = pathRep.getFilePath(emptyLineErrorFile);
		const result = await tool.invoke({ input: { filePaths: [filePath] }, toolInvocationToken: null! }, CancellationToken.None);
		const msg = await toolResultToString(accessor, result);
		expect(msg).toMatchSnapshot();
	});
});