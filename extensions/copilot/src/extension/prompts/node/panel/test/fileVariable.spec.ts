/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type JSONTree, OutputMode, Raw } from '@vscode/prompt-tsx';
import { beforeAll, describe, expect, test } from 'vitest';
import { IEndpointProvider } from '../../../../../platform/endpoint/common/endpointProvider';
import { IFileSystemService } from '../../../../../platform/filesystem/common/fileSystemService';
import { MockFileSystemService } from '../../../../../platform/filesystem/node/test/mockFileSystemService';
import type { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { TestWorkspaceService } from '../../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { createTextDocumentData } from '../../../../../util/common/test/shims/textDocument';
import { ITokenizer, TokenizerType } from '../../../../../util/common/tokenizer';
import { Event } from '../../../../../util/vs/base/common/event';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { Uri } from '../../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { PromptRenderer, renderPromptElementJSON } from '../../base/promptRenderer';
import { FileVariable } from '../fileVariable';

// PromptNodeType enum values from @vscode/prompt-tsx (const enum values are erased at runtime)
const PromptNodeType = {
	Piece: 1,
	Text: 2,
} as const;

function jsonTreeToString(node: JSONTree.PromptNodeJSON): string {
	if (node.type === PromptNodeType.Text) {
		return (node as JSONTree.TextJSON).text;
	} else if (node.type === PromptNodeType.Piece) {
		return (node as JSONTree.PieceJSON).children.map(jsonTreeToString).join('');
	}
	return '';
}

function hasDocumentContentPart(messages: Raw.ChatMessage[]): boolean {
	return messages.some(msg =>
		msg.content.some(part => part.type === Raw.ChatCompletionContentPartKind.Document)
	);
}

function createMockEndpoint(overrides: { family?: string; supportsVision?: boolean; model?: string } = {}): IChatEndpoint {
	return {
		family: overrides.family ?? 'gpt-4.1',
		model: overrides.model ?? 'gpt-4.1',
		supportsVision: overrides.supportsVision ?? true,
		modelMaxPromptTokens: 128000,
		maxOutputTokens: 4096,
		name: 'test-model',
		version: '1.0',
		modelProvider: 'test',
		supportsToolCalls: true,
		supportsPrediction: false,
		showInModelPicker: false,
		isFallback: false,
		tokenizer: TokenizerType.O200K,
		urlOrRequestMetadata: '',
		acquireTokenizer: (): ITokenizer => ({
			mode: OutputMode.Raw,
			tokenLength: async () => 0,
			countMessageTokens: async () => 0,
			countMessagesTokens: async () => 0,
			countToolTokens: async () => 0,
		}),
	} as IChatEndpoint;
}

class MockEndpointProvider implements IEndpointProvider {
	declare readonly _serviceBrand: undefined;
	constructor(private readonly endpoint: IChatEndpoint) { }
	readonly onDidModelsRefresh = Event.None;
	async getChatEndpoint(): Promise<IChatEndpoint> { return this.endpoint; }
	async getEmbeddingsEndpoint(): Promise<never> { throw new Error('not implemented'); }
	async getAllChatEndpoints(): Promise<IChatEndpoint[]> { return [this.endpoint]; }
	async getAllCompletionModels(): Promise<never[]> { return []; }
}

describe('FileVariable', () => {
	let accessor: ITestingServicesAccessor;

	beforeAll(() => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		accessor = testingServiceCollection.createTestingAccessor();
	});

	test('does not include unknown untitled file', async () => {
		const result = await renderPromptElementJSON(
			accessor.get(IInstantiationService),
			FileVariable,
			{
				variableName: '',
				variableValue: Uri.parse('untitled:Untitled-1'),
			});
		expect(jsonTreeToString(result.node)).toMatchSnapshot();
	});

	test('does include known untitled file', async () => {
		const untitledUri = Uri.parse('untitled:Untitled-1');
		const untitledDoc = createTextDocumentData(untitledUri, 'test!', 'python').document;

		const testingServiceCollection = createExtensionUnitTestingServices();
		testingServiceCollection.define(IWorkspaceService, new TestWorkspaceService(undefined, [untitledDoc]));

		accessor = testingServiceCollection.createTestingAccessor();

		const result = await renderPromptElementJSON(
			accessor.get(IInstantiationService),
			FileVariable,
			{
				variableName: '',
				variableValue: Uri.parse('untitled:Untitled-1'),
			});
		expect(jsonTreeToString(result.node)).toMatchSnapshot();
	});

	test('omits file contents when omitContents is true', async () => {
		const untitledUri = Uri.parse('untitled:Untitled-1');
		const untitledDoc = createTextDocumentData(untitledUri, 'file contents that should be omitted', 'python').document;

		const testingServiceCollection = createExtensionUnitTestingServices();
		testingServiceCollection.define(IWorkspaceService, new TestWorkspaceService(undefined, [untitledDoc]));

		accessor = testingServiceCollection.createTestingAccessor();

		const result = await renderPromptElementJSON(
			accessor.get(IInstantiationService),
			FileVariable,
			{
				variableName: 'myfile',
				variableValue: Uri.parse('untitled:Untitled-1'),
				omitContents: true,
			});
		expect(jsonTreeToString(result.node)).toMatchSnapshot();
	});
});

describe('FileVariable PDF support', () => {

	// Valid PDF magic bytes: %PDF (\x25\x50\x44\x46) followed by version
	const VALID_PDF_CONTENT = '%PDF-1.4\n1 0 obj\n<</Type /Catalog>>\nendobj';
	const INVALID_PDF_CONTENT = 'This is not a PDF file at all';

	function createPdfTestServices(options: { family: string; supportsVision: boolean }) {
		const testingServiceCollection = createExtensionUnitTestingServices();
		const mockEndpoint = createMockEndpoint({
			family: options.family,
			supportsVision: options.supportsVision,
			model: `${options.family}-test`,
		});
		testingServiceCollection.define(IEndpointProvider, new MockEndpointProvider(mockEndpoint));
		return { testingServiceCollection, mockEndpoint };
	}

	test('renders PDF document for Anthropic model with vision', async () => {
		const { testingServiceCollection, mockEndpoint } = createPdfTestServices({ family: 'claude-3.5-sonnet', supportsVision: true });
		const mockFs = new MockFileSystemService();
		const pdfUri = Uri.parse('file:///workspace/doc.pdf');
		mockFs.mockFile(pdfUri, VALID_PDF_CONTENT);
		testingServiceCollection.define(IFileSystemService, mockFs);

		const accessor = testingServiceCollection.createTestingAccessor();
		const renderer = PromptRenderer.create(
			accessor.get(IInstantiationService),
			mockEndpoint,
			FileVariable,
			{
				variableName: 'doc',
				variableValue: pdfUri,
			});
		const { messages } = await renderer.render();

		// Should contain a Document content part in the rendered messages
		expect(hasDocumentContentPart(messages)).toBe(true);
	});

	test('shows omitted reference for non-Anthropic model', async () => {
		const { testingServiceCollection, mockEndpoint } = createPdfTestServices({ family: 'gpt-4.1', supportsVision: true });
		const mockFs = new MockFileSystemService();
		const pdfUri = Uri.parse('file:///workspace/doc.pdf');
		mockFs.mockFile(pdfUri, VALID_PDF_CONTENT);
		testingServiceCollection.define(IFileSystemService, mockFs);

		const accessor = testingServiceCollection.createTestingAccessor();
		const renderer = PromptRenderer.create(
			accessor.get(IInstantiationService),
			mockEndpoint,
			FileVariable,
			{
				variableName: 'doc',
				variableValue: pdfUri,
			});
		const { messages } = await renderer.render();

		// Non-Anthropic model should not produce a Document content part
		expect(hasDocumentContentPart(messages)).toBe(false);
	});

	test('shows omitted reference for model without vision', async () => {
		const { testingServiceCollection, mockEndpoint } = createPdfTestServices({ family: 'claude-3.5-sonnet', supportsVision: false });
		const mockFs = new MockFileSystemService();
		const pdfUri = Uri.parse('file:///workspace/doc.pdf');
		mockFs.mockFile(pdfUri, VALID_PDF_CONTENT);
		testingServiceCollection.define(IFileSystemService, mockFs);

		const accessor = testingServiceCollection.createTestingAccessor();
		const renderer = PromptRenderer.create(
			accessor.get(IInstantiationService),
			mockEndpoint,
			FileVariable,
			{
				variableName: 'doc',
				variableValue: pdfUri,
			});
		const { messages } = await renderer.render();

		// Model without vision should not produce a Document content part
		expect(hasDocumentContentPart(messages)).toBe(false);
	});

	test('shows omitted reference for invalid PDF (bad magic bytes)', async () => {
		const { testingServiceCollection, mockEndpoint } = createPdfTestServices({ family: 'claude-3.5-sonnet', supportsVision: true });
		const mockFs = new MockFileSystemService();
		const pdfUri = Uri.parse('file:///workspace/fake.pdf');
		mockFs.mockFile(pdfUri, INVALID_PDF_CONTENT);
		testingServiceCollection.define(IFileSystemService, mockFs);

		const accessor = testingServiceCollection.createTestingAccessor();
		const renderer = PromptRenderer.create(
			accessor.get(IInstantiationService),
			mockEndpoint,
			FileVariable,
			{
				variableName: 'fake',
				variableValue: pdfUri,
			});
		const { messages } = await renderer.render();

		// Invalid PDF should not produce a Document content part
		expect(hasDocumentContentPart(messages)).toBe(false);
	});

	test('shows omitted reference when file read fails', async () => {
		const { testingServiceCollection, mockEndpoint } = createPdfTestServices({ family: 'claude-3.5-sonnet', supportsVision: true });
		const mockFs = new MockFileSystemService();
		const pdfUri = Uri.parse('file:///workspace/missing.pdf');
		mockFs.mockError(pdfUri, new Error('ENOENT'));
		testingServiceCollection.define(IFileSystemService, mockFs);

		const accessor = testingServiceCollection.createTestingAccessor();
		const renderer = PromptRenderer.create(
			accessor.get(IInstantiationService),
			mockEndpoint,
			FileVariable,
			{
				variableName: 'missing',
				variableValue: pdfUri,
			});
		const { messages } = await renderer.render();

		// File read error should not produce a Document content part
		expect(hasDocumentContentPart(messages)).toBe(false);
	});

	test('returns empty for unsupported model when omitReferences is true', async () => {
		const { testingServiceCollection, mockEndpoint } = createPdfTestServices({ family: 'gpt-4.1', supportsVision: true });
		const mockFs = new MockFileSystemService();
		const pdfUri = Uri.parse('file:///workspace/doc.pdf');
		mockFs.mockFile(pdfUri, VALID_PDF_CONTENT);
		testingServiceCollection.define(IFileSystemService, mockFs);

		const accessor = testingServiceCollection.createTestingAccessor();
		const renderer = PromptRenderer.create(
			accessor.get(IInstantiationService),
			mockEndpoint,
			FileVariable,
			{
				variableName: 'doc',
				variableValue: pdfUri,
				omitReferences: true,
			});
		const { messages } = await renderer.render();

		// Unsupported model with omitReferences should not produce a Document content part
		expect(hasDocumentContentPart(messages)).toBe(false);
	});
});