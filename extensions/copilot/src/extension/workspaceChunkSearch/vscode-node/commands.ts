/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { t } from '@vscode/l10n';
import * as vscode from 'vscode';
import { TriggerRemoteIndexingError } from '../../../platform/workspaceChunkSearch/node/codeSearch/codeSearchRepo';
import { IWorkspaceChunkSearchService } from '../../../platform/workspaceChunkSearch/node/workspaceChunkSearchService';
import { TelemetryCorrelationId } from '../../../util/common/telemetryCorrelationId';
import { DisposableStore, IDisposable } from '../../../util/vs/base/common/lifecycle';
import { ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';

export const buildRemoteIndexCommandId = 'github.copilot.buildRemoteWorkspaceIndex';
export const deleteExternalIngestWorkspaceIndexCommandId = 'github.copilot.deleteExternalIngestWorkspaceIndex';

export function register(accessor: ServicesAccessor): IDisposable {
	const workspaceChunkSearch = accessor.get(IWorkspaceChunkSearchService);

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
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: 'Collecting codebase index diagnostics...\n' });
		const editor = await vscode.window.showTextDocument(document);

		const cts = new vscode.CancellationTokenSource();
		const closeListener = vscode.workspace.onDidCloseTextDocument(closedDoc => {
			if (closedDoc === document) {
				cts.cancel();
			}
		});

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Window,
			title: t`Collecting codebase index diagnostics...`,
			cancellable: false,
		}, async () => {
			let pendingText = '';
			let updateTimer: ReturnType<typeof setTimeout> | undefined;

			const flush = async () => {
				updateTimer = undefined;
				if (!pendingText) {
					return;
				}
				const text = pendingText;
				pendingText = '';
				await editor.edit(edit => {
					edit.insert(document.positionAt(document.getText().length), text);
				});
			};

			// Clear the initial placeholder
			await editor.edit(edit => {
				const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
				edit.replace(fullRange, '');
			});

			for await (const chunk of workspaceChunkSearch.getDiagnosticsDump()) {
				if (cts.token.isCancellationRequested) {
					break;
				}
				pendingText += chunk;
				if (!updateTimer) {
					updateTimer = setTimeout(flush, 1000);
				}
			}

			if (updateTimer) {
				clearTimeout(updateTimer);
			}
			if (!cts.token.isCancellationRequested) {
				await flush();
			}
		});

		closeListener.dispose();
		cts.dispose();
	}));

	return disposableStore;
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