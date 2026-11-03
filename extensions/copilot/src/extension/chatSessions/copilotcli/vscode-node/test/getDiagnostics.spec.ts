/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import { MockMcpServer, parseToolResult, createMockUri, createMockDiagnostic } from './testHelpers';

const { mockGetDiagnostics } = vi.hoisted(() => ({
	mockGetDiagnostics: vi.fn(),
}));

vi.mock('vscode', () => {
	const DiagnosticSeverity = {
		Error: 0,
		Warning: 1,
		Information: 2,
		Hint: 3,
		0: 'Error',
		1: 'Warning',
		2: 'Information',
		3: 'Hint',
	};

	return {
		Uri: {
			parse: (str: string) => ({
				toString: () => str,
				fsPath: str.replace('file://', ''),
				scheme: 'file',
			}),
		},
		languages: {
			getDiagnostics: mockGetDiagnostics,
		},
		DiagnosticSeverity,
	};
});

import { registerGetDiagnosticsTool } from '../tools/getDiagnostics';

interface DiagnosticsFileResult {
	uri: string;
	filePath: string;
	diagnostics: Array<{
		message: string;
		severity: string;
		source?: string;
		code?: string | number;
		range: {
			start: { line: number; character: number };
			end: { line: number; character: number };
		};
	}>;
}

describe('getDiagnostics tool', () => {
	const logger = new TestLogService();
	let server: MockMcpServer;

	beforeEach(() => {
		vi.clearAllMocks();
		server = new MockMcpServer();
		registerGetDiagnosticsTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer, logger);
	});

	it('should register the get_diagnostics tool', () => {
		expect(server.hasToolRegistered('get_diagnostics')).toBe(true);
	});

	it('should return diagnostics for a specific URI', async () => {
		const mockDiag = createMockDiagnostic('Test error', 0, 0, 0, 0, 10, 'test-source', 'TEST001');
		mockGetDiagnostics.mockReturnValue([mockDiag]);

		const handler = server.getToolHandler('get_diagnostics')!;
		const result = parseToolResult<DiagnosticsFileResult[]>(await handler({ uri: 'file:///test/file.ts' }));

		expect(result).toHaveLength(1);
		expect(result[0].uri).toBe('file:///test/file.ts');
		expect(result[0].diagnostics).toHaveLength(1);
	});

	it('should return empty array when no diagnostics exist for URI', async () => {
		mockGetDiagnostics.mockReturnValue([]);

		const handler = server.getToolHandler('get_diagnostics')!;
		const result = parseToolResult<DiagnosticsFileResult[]>(await handler({ uri: 'file:///clean/file.ts' }));

		expect(result).toHaveLength(0);
	});

	it('should return all diagnostics when no URI is provided', async () => {
		const uri1 = createMockUri('/file1.ts');
		const uri2 = createMockUri('/file2.ts');
		const diag1 = createMockDiagnostic('Error in file 1', 0, 0, 0, 0, 5);
		const diag2 = createMockDiagnostic('Warning in file 2', 1, 1, 0, 1, 5);
		mockGetDiagnostics.mockReturnValue([
			[uri1, [diag1]],
			[uri2, [diag2]],
		]);

		const handler = server.getToolHandler('get_diagnostics')!;
		const result = parseToolResult<DiagnosticsFileResult[]>(await handler({}));

		expect(result).toHaveLength(2);
	});

	it('should map severity levels correctly', async () => {
		const diagnostics = [
			createMockDiagnostic('Error', 0, 0, 0, 0, 1),
			createMockDiagnostic('Warning', 1, 1, 0, 1, 1),
			createMockDiagnostic('Information', 2, 2, 0, 2, 1),
			createMockDiagnostic('Hint', 3, 3, 0, 3, 1),
		];
		mockGetDiagnostics.mockReturnValue(diagnostics);

		const handler = server.getToolHandler('get_diagnostics')!;
		const result = parseToolResult<DiagnosticsFileResult[]>(await handler({ uri: 'file:///test.ts' }));

		const severities = result[0].diagnostics.map(d => d.severity);
		expect(severities).toContain('error');
		expect(severities).toContain('warning');
		expect(severities).toContain('information');
		expect(severities).toContain('hint');
	});

	it('should include diagnostic range, source, and code', async () => {
		const mockDiag = createMockDiagnostic('Test error', 0, 5, 10, 5, 20, 'test-linter', 'WARN001');
		mockGetDiagnostics.mockReturnValue([mockDiag]);

		const handler = server.getToolHandler('get_diagnostics')!;
		const result = parseToolResult<DiagnosticsFileResult[]>(await handler({ uri: 'file:///test.ts' }));

		const diag = result[0].diagnostics[0];
		expect(diag.message).toBe('Test error');
		expect(diag.source).toBe('test-linter');
		expect(diag.code).toBe('WARN001');
		expect(diag.range.start.line).toBe(5);
		expect(diag.range.start.character).toBe(10);
		expect(diag.range.end.line).toBe(5);
		expect(diag.range.end.character).toBe(20);
	});

	it('should filter out files with no diagnostics when returning all', async () => {
		const uri1 = createMockUri('/has-diagnostics.ts');
		const uri2 = createMockUri('/no-diagnostics.ts');
		const diag = createMockDiagnostic('Has error', 0, 0, 0, 0, 1);
		mockGetDiagnostics.mockReturnValue([
			[uri1, [diag]],
			[uri2, []],
		]);

		const handler = server.getToolHandler('get_diagnostics')!;
		const result = parseToolResult<DiagnosticsFileResult[]>(await handler({}));

		expect(result).toHaveLength(1);
		expect(result[0].uri).toBe('file:///has-diagnostics.ts');
	});

	it('should handle object-style code in diagnostics', async () => {
		const mockDiag = {
			message: 'Object code error',
			severity: 0,
			range: {
				start: { line: 0, character: 0 },
				end: { line: 0, character: 5 },
			},
			source: 'ts',
			code: { value: 2304, target: 'https://example.com' },
		};
		mockGetDiagnostics.mockReturnValue([mockDiag]);

		const handler = server.getToolHandler('get_diagnostics')!;
		const result = parseToolResult<DiagnosticsFileResult[]>(await handler({ uri: 'file:///test.ts' }));

		expect(result[0].diagnostics[0].code).toBe(2304);
	});
});
