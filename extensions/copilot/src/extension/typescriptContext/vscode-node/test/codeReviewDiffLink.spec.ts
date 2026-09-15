/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert';

import type * as vscode from 'vscode';
import { suite, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	executeCommand: vi.fn(),
	provider: undefined as vscode.TextDocumentContentProvider | undefined,
	showWarningMessage: vi.fn(),
}));

vi.mock('vscode', async importOriginal => {
	const actual = await importOriginal<typeof import('vscode')>();
	return {
		...actual,
		commands: {
			executeCommand: mocks.executeCommand,
		},
		env: {
			uriScheme: 'vscode-insiders',
		},
		window: {
			showWarningMessage: mocks.showWarningMessage,
		},
		workspace: {
			getConfiguration: () => ({
				get: () => false,
				inspect: () => undefined,
			}),
			openTextDocument: async () => ({ getText: () => 'current modified content' }),
			registerTextDocumentContentProvider: (_scheme: string, provider: vscode.TextDocumentContentProvider) => {
				mocks.provider = provider;
				return { dispose: () => { } };
			},
		},
	};
});

import { IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../../platform/log/common/logService';
import { CodeReviewDiffUriPath, CodeReviewService } from '../codeReviewService';

suite('Code review diff links', () => {
	test('opens immutable full-file snapshots focused on the entity', async () => {
		const originalContent = Array.from({ length: 40 }, (_, index) => `original ${index}`).join('\n');
		const modifiedContent = Array.from({ length: 42 }, (_, index) => `modified ${index}`).join('\n');
		const protocolResult = {
			modified: [{
				kind: 'method',
				path: ['Reader', 'listen'],
				range: { start: 20, end: 30 },
				changes: [{
					classifications: ['algorithmic'],
					changeType: 'changed',
					range: { start: 24, end: 25 },
				}],
			}],
			original: [{
				kind: 'method',
				path: ['Reader', 'listen'],
				range: { start: 18, end: 28 },
				changes: [{
					classifications: ['structural'],
					changeType: 'deleted',
					range: { start: 19, end: 20 },
				}],
			}],
		};
		mocks.executeCommand.mockReset();
		mocks.executeCommand.mockResolvedValueOnce({ type: 'response', body: protocolResult });
		mocks.executeCommand.mockResolvedValueOnce(undefined);

		const configurationService = {
			onDidChangeConfiguration: () => ({ dispose: () => { } }),
			getConfig: () => false,
		} as unknown as IConfigurationService;
		const service = new CodeReviewService({} as ILogService, configurationService);
		try {
			const result = await service.classifyChanges({
				filePath: 'C:\\workspace\\reader.ts',
				modified: {
					content: modifiedContent,
					added: [],
					changed: [{ start: 24, end: 25 }],
				},
				original: {
					content: originalContent,
					deleted: [{ start: 19, end: 20 }],
				},
			});
			assert.ok(result !== undefined);
			const link = result.modified[0].entityLink;
			assert.ok(link !== undefined);
			await service.openDiff(link);

			const diffCall = mocks.executeCommand.mock.calls[1];
			const originalUri = diffCall[1] as vscode.Uri;
			const modifiedUri = diffCall[2] as vscode.Uri;
			assert.deepStrictEqual({
				link: {
					scheme: link.scheme,
					authority: link.authority,
					path: link.path,
				},
				sharedLink: result.original[0].entityLink?.toString(),
				diff: {
					command: diffCall[0],
					original: mocks.provider?.provideTextDocumentContent(originalUri, {} as vscode.CancellationToken),
					modified: mocks.provider?.provideTextDocumentContent(modifiedUri, {} as vscode.CancellationToken),
					title: diffCall[3],
					selectionLine: diffCall[4].selection.start.line,
				},
			}, {
				link: {
					scheme: 'vscode-insiders',
					authority: 'GitHub.copilot-chat',
					path: CodeReviewDiffUriPath,
				},
				sharedLink: link.toString(),
				diff: {
					command: 'vscode.diff',
					original: originalContent,
					modified: modifiedContent,
					title: 'reader.ts — Reader.listen',
					selectionLine: 20,
				},
			});
		} finally {
			service.dispose();
		}
	});
});
