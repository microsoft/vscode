/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import type { InProcHttpServer } from '../inProcHttpServer';
import { MockHttpServer, createMockDiagnostic, createMockUri } from './testHelpers';

const { mockOnDidChangeDiagnostics, mockGetDiagnostics } = vi.hoisted(() => ({
	mockOnDidChangeDiagnostics: vi.fn(),
	mockGetDiagnostics: vi.fn(),
}));

vi.mock('vscode', () => {
	const DiagnosticSeverity = {
		Error: 0,
		Warning: 1,
		Information: 2,
		Hint: 3,
	};

	return {
		languages: {
			getDiagnostics: mockGetDiagnostics,
			onDidChangeDiagnostics: mockOnDidChangeDiagnostics,
		},
		DiagnosticSeverity,
		Disposable: class Disposable {
			constructor(private readonly callOnDispose: () => void) { }
			dispose() { this.callOnDispose(); }
		},
	};
});

import { registerDiagnosticsChangedNotification } from '../tools/push/diagnosticsChanged';

interface DiagnosticNotificationParams {
	uris: Array<{
		uri: string;
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
	}>;
}

describe('diagnosticsChanged push notification', () => {
	const logger = new TestLogService();
	let httpServer: MockHttpServer;
	let registeredCallback: ((event: { uris: unknown[] }) => void) | null;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		httpServer = new MockHttpServer();
		registeredCallback = null;

		mockOnDidChangeDiagnostics.mockImplementation((callback: (event: { uris: unknown[] }) => void) => {
			registeredCallback = callback;
			return { dispose: () => { } };
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should register a diagnostics change listener', () => {
		const disposables = registerDiagnosticsChangedNotification(logger, httpServer as unknown as InProcHttpServer);

		expect(mockOnDidChangeDiagnostics).toHaveBeenCalled();
		expect(disposables.length).toBeGreaterThan(0);
	});

	it('should broadcast diagnostics_changed notification when diagnostics change', async () => {
		registerDiagnosticsChangedNotification(logger, httpServer as unknown as InProcHttpServer);

		const uri = createMockUri('/test/file.ts');
		const diag = createMockDiagnostic('Test error', 0, 0, 0, 0, 10, 'test-source');

		mockGetDiagnostics.mockReturnValue([diag]);

		registeredCallback!({ uris: [uri] });
		await vi.advanceTimersByTimeAsync(250);

		expect(httpServer.broadcastNotification).toHaveBeenCalledWith(
			'diagnostics_changed',
			expect.objectContaining({
				uris: expect.arrayContaining([
					expect.objectContaining({
						uri: 'file:///test/file.ts',
						diagnostics: expect.arrayContaining([
							expect.objectContaining({
								message: 'Test error',
								severity: 'error',
							}),
						]),
					}),
				]),
			}),
		);
	});

	it('should debounce rapid diagnostic changes', async () => {
		registerDiagnosticsChangedNotification(logger, httpServer as unknown as InProcHttpServer);

		const uri1 = createMockUri('/file1.ts');
		const uri2 = createMockUri('/file2.ts');

		mockGetDiagnostics.mockReturnValue([]);

		registeredCallback!({ uris: [uri1] });
		await vi.advanceTimersByTimeAsync(100);
		registeredCallback!({ uris: [uri2] });
		await vi.advanceTimersByTimeAsync(250);

		// Only the last event fires (debounced)
		expect(httpServer.broadcastNotification).toHaveBeenCalledTimes(1);
	});

	it('should broadcast notification when diagnostics are cleared', async () => {
		registerDiagnosticsChangedNotification(logger, httpServer as unknown as InProcHttpServer);

		const uri = createMockUri('/test/file.ts');
		mockGetDiagnostics.mockReturnValue([]);

		registeredCallback!({ uris: [uri] });
		await vi.advanceTimersByTimeAsync(250);

		expect(httpServer.broadcastNotification).toHaveBeenCalledWith(
			'diagnostics_changed',
			expect.objectContaining({
				uris: expect.arrayContaining([
					expect.objectContaining({
						uri: 'file:///test/file.ts',
						diagnostics: [],
					}),
				]),
			}),
		);
	});

	it('should map severity levels correctly', async () => {
		registerDiagnosticsChangedNotification(logger, httpServer as unknown as InProcHttpServer);

		const uri = createMockUri('/test/file.ts');
		const diagnostics = [
			createMockDiagnostic('Error', 0, 0, 0, 0, 1),
			createMockDiagnostic('Warning', 1, 1, 0, 1, 1),
			createMockDiagnostic('Info', 2, 2, 0, 2, 1),
			createMockDiagnostic('Hint', 3, 3, 0, 3, 1),
		];

		mockGetDiagnostics.mockReturnValue(diagnostics);

		registeredCallback!({ uris: [uri] });
		await vi.advanceTimersByTimeAsync(250);

		const params = httpServer.broadcastNotification.mock.calls[0][1] as unknown as DiagnosticNotificationParams;
		const severities = params.uris[0].diagnostics.map(d => d.severity);

		expect(severities).toContain('error');
		expect(severities).toContain('warning');
		expect(severities).toContain('information');
		expect(severities).toContain('hint');
	});

	it('should include diagnostic range, source, and code in notification', async () => {
		registerDiagnosticsChangedNotification(logger, httpServer as unknown as InProcHttpServer);

		const uri = createMockUri('/test/file.ts');
		const diag = createMockDiagnostic('Structured message', 1, 5, 10, 5, 20, 'test-linter', 'WARN001');

		mockGetDiagnostics.mockReturnValue([diag]);

		registeredCallback!({ uris: [uri] });
		await vi.advanceTimersByTimeAsync(250);

		const params = httpServer.broadcastNotification.mock.calls[0][1] as unknown as DiagnosticNotificationParams;
		const notifiedDiag = params.uris[0].diagnostics[0];

		expect(notifiedDiag.message).toBe('Structured message');
		expect(notifiedDiag.severity).toBe('warning');
		expect(notifiedDiag.source).toBe('test-linter');
		expect(notifiedDiag.code).toBe('WARN001');
		expect(notifiedDiag.range.start.line).toBe(5);
		expect(notifiedDiag.range.start.character).toBe(10);
		expect(notifiedDiag.range.end.line).toBe(5);
		expect(notifiedDiag.range.end.character).toBe(20);
	});

	it('should handle multiple URIs in a single change event', async () => {
		registerDiagnosticsChangedNotification(logger, httpServer as unknown as InProcHttpServer);

		const uri1 = createMockUri('/file1.ts');
		const uri2 = createMockUri('/file2.ts');
		const diag1 = createMockDiagnostic('Error 1', 0, 0, 0, 0, 5);
		const diag2 = createMockDiagnostic('Error 2', 0, 1, 0, 1, 5);

		mockGetDiagnostics.mockImplementation((uri: unknown) => {
			const uriStr = (uri as { toString: () => string }).toString();
			if (uriStr.includes('file1')) {
				return [diag1];
			}
			if (uriStr.includes('file2')) {
				return [diag2];
			}
			return [];
		});

		registeredCallback!({ uris: [uri1, uri2] });
		await vi.advanceTimersByTimeAsync(250);

		const params = httpServer.broadcastNotification.mock.calls[0][1] as unknown as DiagnosticNotificationParams;

		expect(params.uris).toHaveLength(2);
		expect(params.uris.some(u => u.uri === 'file:///file1.ts')).toBe(true);
		expect(params.uris.some(u => u.uri === 'file:///file2.ts')).toBe(true);
	});
});
