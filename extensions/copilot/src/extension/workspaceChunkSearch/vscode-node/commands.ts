/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { t } from '@vscode/l10n';
import * as vscode from 'vscode';
import { TriggerRemoteIndexingError } from '../../../platform/workspaceChunkSearch/node/codeSearch/codeSearchRepo';
import { IWorkspaceChunkSearchService } from '../../../platform/workspaceChunkSearch/node/workspaceChunkSearchService';
import { IWorkspaceFileIndex } from '../../../platform/workspaceChunkSearch/node/workspaceFileIndex';
import { TelemetryCorrelationId } from '../../../util/common/telemetryCorrelationId';
import { DisposableStore, IDisposable } from '../../../util/vs/base/common/lifecycle';
import { ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';

export const buildRemoteIndexCommandId = 'github.copilot.buildRemoteWorkspaceIndex';
export const deleteExternalIngestWorkspaceIndexCommandId = 'github.copilot.deleteExternalIngestWorkspaceIndex';

export function register(accessor: ServicesAccessor): IDisposable {
	const workspaceChunkSearch = accessor.get(IWorkspaceChunkSearchService);
	const workspaceFileIndex = accessor.get(IWorkspaceFileIndex);

	const disposableStore = new DisposableStore();

	disposableStore.add(vscode.commands.registerCommand(buildRemoteIndexCommandId, onlyRunOneAtATime(async () => {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Window,
			title: t`Building codebase semantic index`,
		}, async (progress, token) => {
			const triggerResult = await workspaceChunkSearch.triggerIndexing(
				'manual',
				(message) => progress.report({ message }),
				new TelemetryCorrelationId('BuildRemoteIndexCommand'),
				token
			);

			if (triggerResult.isError()) {
				if (triggerResult.err.id !== TriggerRemoteIndexingError.alreadyIndexed.id) {
					vscode.window.showWarningMessage(t`Could not build codebase semantic index. ` + '\n\n' + triggerResult.err.userMessage);
					return;
				}
			}

			vscode.window.showInformationMessage(t`Codebase semantic index ready to use.`);
		});
	})));

	disposableStore.add(vscode.commands.registerCommand(deleteExternalIngestWorkspaceIndexCommandId, onlyRunOneAtATime(async () => {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Window,
			title: t`Deleting external ingest index...`,
		}, async () => {
			await workspaceChunkSearch.deleteExternalIngestWorkspaceIndex();
			vscode.window.showInformationMessage(t`External ingest index deleted.`);
		});
	})));

	disposableStore.add(vscode.commands.registerCommand('github.copilot.debug.collectWorkspaceIndexDiagnostics', async () => {
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Window,
			title: t`Collecting codebase index diagnostics...`,
		}, async () => {
			const document = await vscode.workspace.openTextDocument({ language: 'markdown' });
			const editor = await vscode.window.showTextDocument(document);

			await appendText(editor, '# Codebase Index Diagnostics\n');
			await appendText(editor, 'Tracked file count: ' + workspaceFileIndex.fileCount + '\n\n');

			await appendText(editor, '## All tracked files\n');
			const fileEntries = Array.from(workspaceFileIndex.values());
			const stepSize = 500;
			for (let i = 0; i < fileEntries.length; i += stepSize) {
				if (editor.document.isClosed) {
					return;
				}

				const files = fileEntries.slice(i, i + stepSize);
				if (files.length) {
					await appendText(editor, files.map(file => `- ${file.uri.fsPath}`).join('\n') + '\n');
				}
			}
		});
	}));

	return disposableStore;
}

async function appendText(editor: vscode.TextEditor, string: string) {
	await editor.edit(builder => {
		builder.insert(editor.document.lineAt(editor.document.lineCount - 1).range.end, string);
	});
}

function onlyRunOneAtATime<T>(taskFactory: () => Promise<T>): () => Promise<T> {
	let runningTask: Promise<T> | undefined;

	return async (): Promise<T> => {
		if (runningTask) {
			return runningTask;
		}

		const task = taskFactory();
		runningTask = task;

		try {
			return await task;
		} finally {
			runningTask = undefined;
		}
	};
}