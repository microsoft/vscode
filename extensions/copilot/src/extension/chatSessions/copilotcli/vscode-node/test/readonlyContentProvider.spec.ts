/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
	Uri: {
		file: (path: string) => ({
			scheme: 'file',
			path,
			fsPath: path,
			toString: () => `file://${path}`,
		}),
		from: (components: { scheme: string; path: string; query: string }) => ({
			scheme: components.scheme,
			path: components.path,
			query: components.query,
			toString: () => `${components.scheme}:${components.path}?${components.query}`,
		}),
	},
	workspace: {
		registerTextDocumentContentProvider: vi.fn(() => ({ dispose: () => { } })),
	},
}));

import type { Uri } from 'vscode';
import { ReadonlyContentProvider, createReadonlyUri } from '../readonlyContentProvider';

/** Creates a mock URI using the same factory as the source code */
function mockUri(path: string, query: string): Uri {
	return createReadonlyUri(path, query);
}

describe('ReadonlyContentProvider', () => {
	let provider: ReadonlyContentProvider;

	beforeEach(() => {
		provider = new ReadonlyContentProvider();
	});

	it('should store and retrieve content by URI', () => {
		const uri = mockUri('/test/file.ts', 'version=1');
		provider.setContent(uri, 'Hello World');

		const content = provider.provideTextDocumentContent(uri);

		expect(content).toBe('Hello World');
	});

	it('should return empty string for unknown URIs', () => {
		const content = provider.provideTextDocumentContent(mockUri('/unknown/file.ts', 'version=1'));

		expect(content).toBe('');
	});

	it('should clear content', () => {
		const uri = mockUri('/test/file.ts', 'version=1');
		provider.setContent(uri, 'Hello World');
		provider.clearContent(uri);

		const content = provider.provideTextDocumentContent(uri);

		expect(content).toBe('');
	});

	it('should overwrite existing content', () => {
		const uri = mockUri('/test/file.ts', 'v=1');
		provider.setContent(uri, 'First content');
		provider.setContent(uri, 'Updated content');

		const content = provider.provideTextDocumentContent(uri);

		expect(content).toBe('Updated content');
	});

	it('should distinguish URIs by query parameter', () => {
		const originalUri = mockUri('/test/file.ts', 'original');
		const modifiedUri = mockUri('/test/file.ts', 'modified');

		provider.setContent(originalUri, 'Original');
		provider.setContent(modifiedUri, 'Modified');

		expect(provider.provideTextDocumentContent(originalUri)).toBe('Original');
		expect(provider.provideTextDocumentContent(modifiedUri)).toBe('Modified');
	});

	it('should register as a text document content provider', async () => {
		const disposable = provider.register();

		const vscodeModule = await import('vscode');
		expect(vscodeModule.workspace.registerTextDocumentContentProvider).toHaveBeenCalled();
		expect(disposable).toBeDefined();
	});

	it('should handle URIs with special characters in path', () => {
		const uri = mockUri('/test/file with spaces.ts', 'version=1');
		provider.setContent(uri, 'Special content');

		const content = provider.provideTextDocumentContent(uri);

		expect(content).toBe('Special content');
	});

	it('should handle empty content', () => {
		const uri = mockUri('/test/empty.ts', 'v=1');
		provider.setContent(uri, '');

		const content = provider.provideTextDocumentContent(uri);

		expect(content).toBe('');
	});

	it('should handle multiple different files', () => {
		const uri1 = mockUri('/file1.ts', 'v=1');
		const uri2 = mockUri('/file2.ts', 'v=1');
		const uri3 = mockUri('/file3.ts', 'v=1');

		provider.setContent(uri1, 'Content 1');
		provider.setContent(uri2, 'Content 2');
		provider.setContent(uri3, 'Content 3');

		expect(provider.provideTextDocumentContent(uri1)).toBe('Content 1');
		expect(provider.provideTextDocumentContent(uri2)).toBe('Content 2');
		expect(provider.provideTextDocumentContent(uri3)).toBe('Content 3');
	});
});
