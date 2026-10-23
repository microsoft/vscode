/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import type { InProcHttpServer } from '../inProcHttpServer';
import { MockHttpServer, createMockEditor } from './testHelpers';

const { mockOnDidChangeTextEditorSelection, mockActiveTextEditor } = vi.hoisted(() => ({
	mockOnDidChangeTextEditorSelection: vi.fn(),
	mockActiveTextEditor: { value: null as unknown },
}));

vi.mock('vscode', () => ({
	window: {
		get activeTextEditor() { return mockActiveTextEditor.value; },
		onDidChangeTextEditorSelection: mockOnDidChangeTextEditorSelection,
	},
	Disposable: class Disposable {
		constructor(private readonly callOnDispose: () => void) { }
		dispose() { this.callOnDispose(); }
	},
}));

import { SelectionState } from '../tools/getSelection';
import { registerSelectionChangedNotification } from '../tools/push/selectionChanged';

describe('selectionChanged push notification', () => {
	const logger = new TestLogService();
	let selectionState: SelectionState;
	let httpServer: MockHttpServer;
	let registeredCallback: ((event: unknown) => void) | null;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		selectionState = new SelectionState();
		httpServer = new MockHttpServer();
		registeredCallback = null;
		mockActiveTextEditor.value = null;

		mockOnDidChangeTextEditorSelection.mockImplementation((callback: (event: unknown) => void) => {
			registeredCallback = callback;
			return { dispose: () => { } };
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should register a selection change listener', () => {
		const disposables = registerSelectionChangedNotification(logger, httpServer as unknown as InProcHttpServer, selectionState);

		expect(mockOnDidChangeTextEditorSelection).toHaveBeenCalled();
		expect(disposables.length).toBeGreaterThan(0);
	});

	it('should broadcast selection_changed notification on selection change', async () => {
		registerSelectionChangedNotification(logger, httpServer as unknown as InProcHttpServer, selectionState);

		const mockEditor = createMockEditor('/test/file.ts', 'Hello World', 0, 0, 0, 5);
		registeredCallback!({ textEditor: mockEditor });

		await vi.advanceTimersByTimeAsync(250);

		expect(httpServer.broadcastNotification).toHaveBeenCalledWith(
			'selection_changed',
			expect.objectContaining({
				text: 'Hello',
				filePath: '/test/file.ts',
			}),
		);
	});

	it('should debounce rapid selection changes', async () => {
		registerSelectionChangedNotification(logger, httpServer as unknown as InProcHttpServer, selectionState);

		const editor1 = createMockEditor('/test/file.ts', 'Hello World', 0, 0, 0, 3);
		const editor2 = createMockEditor('/test/file.ts', 'Hello World', 0, 0, 0, 5);

		registeredCallback!({ textEditor: editor1 });
		await vi.advanceTimersByTimeAsync(100);
		registeredCallback!({ textEditor: editor2 });
		await vi.advanceTimersByTimeAsync(250);

		// Only the last change should be broadcast
		expect(httpServer.broadcastNotification).toHaveBeenCalledTimes(1);
		expect(httpServer.broadcastNotification).toHaveBeenCalledWith(
			'selection_changed',
			expect.objectContaining({ text: 'Hello' }),
		);
	});

	it('should update selection state on change', async () => {
		registerSelectionChangedNotification(logger, httpServer as unknown as InProcHttpServer, selectionState);

		const mockEditor = createMockEditor('/test/file.ts', 'Hello World', 0, 6, 0, 11);
		registeredCallback!({ textEditor: mockEditor });

		await vi.advanceTimersByTimeAsync(250);

		expect(selectionState.latest).not.toBe(null);
		expect(selectionState.latest!.text).toBe('World');
		expect(selectionState.latest!.filePath).toBe('/test/file.ts');
	});

	it('should handle empty selection (cursor position)', async () => {
		registerSelectionChangedNotification(logger, httpServer as unknown as InProcHttpServer, selectionState);

		const mockEditor = createMockEditor('/test/file.ts', 'Hello World', 0, 5, 0, 5);
		registeredCallback!({ textEditor: mockEditor });

		await vi.advanceTimersByTimeAsync(250);

		expect(httpServer.broadcastNotification).toHaveBeenCalledWith(
			'selection_changed',
			expect.objectContaining({
				text: '',
				selection: expect.objectContaining({ isEmpty: true }),
			}),
		);
	});

	it('should include file path information in notification', async () => {
		registerSelectionChangedNotification(logger, httpServer as unknown as InProcHttpServer, selectionState);

		const mockEditor = createMockEditor('/src/main.ts', 'const x = 1;', 0, 0, 0, 5);
		registeredCallback!({ textEditor: mockEditor });

		await vi.advanceTimersByTimeAsync(250);

		expect(httpServer.broadcastNotification).toHaveBeenCalledWith(
			'selection_changed',
			expect.objectContaining({
				filePath: '/src/main.ts',
				fileUrl: 'file:///src/main.ts',
			}),
		);
	});

	it('should initialize with current selection if active editor exists', () => {
		mockActiveTextEditor.value = createMockEditor('/test/initial.ts', 'Initial content', 0, 0, 0, 7);

		registerSelectionChangedNotification(logger, httpServer as unknown as InProcHttpServer, selectionState);

		expect(selectionState.latest).not.toBe(null);
		expect(selectionState.latest!.text).toBe('Initial');
	});
});
