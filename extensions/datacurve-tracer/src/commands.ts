import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs';
import { downloadProjectFiles, uploadProjectFiles } from './api/project';
import { gitManager } from './common/git_manager';
import { fileExplorer } from './fileExplorer';
import WorkerFileRecorder from './recorders/workerFileRecorder';
import { ThoughtsTracker } from './tracers/thoughtsTracker';
import {
	createUserIdeaAction,
	createUserSearchAction,
	createFileDidCreateFilesCustomAction,
	createFileDidCreateFolderCustomAction,
	createFileDidDeleteFilesCustomAction,
	createFileDidRenameFilesCustomAction,
} from './utils/typedTracers';

/**
 * Registers all commands for the extension
 * @param context The extension context
 * @param recorder The file recorder instance
 * @param thoughtsTracker The thoughts tracker instance
 */
export function registerCommands(
	context: vscode.ExtensionContext,
	recorder: WorkerFileRecorder,
	thoughtsTracker: ThoughtsTracker,
) {
	// Register datacurve-tracer commands
	registerDataCurveCommands(context, recorder, thoughtsTracker);

	// Register file explorer commands
	registerExplorerCommands(context, recorder, thoughtsTracker);
}

/**
 * Registers all datacurve-tracer commands
 */
function registerDataCurveCommands(
	context: vscode.ExtensionContext,
	recorder: WorkerFileRecorder,
	thoughtsTracker: ThoughtsTracker,
) {
	// Export traces command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'datacurve-tracer.exportTraces',
			async () => {
				const uri = await recorder.export();
				if (uri) {
					vscode.window.showInformationMessage(
						`Traces exported to ${uri.fsPath}`,
					);
				}
			},
		),
	);

	// Record thought command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'datacurve-tracer.recordThought',
			async () => {
				// Prompt the user for a thought description
				const thought = await vscode.window.showInputBox({
					prompt: 'What are you thinking?',
					placeHolder: 'Enter your thought here...',
				});

				if (thought) {
					// Add the thought to the tracker
					thoughtsTracker.addThought(thought);
					vscode.window.showInformationMessage('Thought recorded!');
				}
			},
		),
	);

	// Record plan command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'datacurve-tracer.recordPlan',
			async () => {
				// Prompt the user for an idea description; it's optional
				const idea = await vscode.window.showInputBox({
					prompt: 'Describe your plan',
					placeHolder: 'Enter your plan here...',
				});

				// Use an empty string if undefined
				const ideaText = idea || '';
				if (ideaText) {
					// Record the idea event using the type-safe action creator
					const action = createUserIdeaAction(ideaText);
					await recorder.record(action);

					// Directly signal the ThoughtsTracker
					thoughtsTracker.recordAction(action.action_id);

					// Also add it as a thought
					thoughtsTracker.addThought(ideaText);
				}
			},
		),
	);

	// Record search command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'datacurve-tracer.recordSearch',
			async () => {
				// Prompt the user for an idea description; it's optional
				const searchTerm = await vscode.window.showInputBox({
					prompt: 'enter your search term',
					placeHolder: 'Enter your search term...',
				});

				// Use an empty string if undefined
				const term = searchTerm || '';

				// Record the search event using the type-safe action creator
				const action = createUserSearchAction(term);
				await recorder.record(action);

				// Directly signal the ThoughtsTracker
				thoughtsTracker.recordAction(action.action_id);
			},
		),
	);

	// Clear traces command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'datacurve-tracer.clearTraces',
			async () => {
				await recorder.clearTraces();
				thoughtsTracker.clear();
			},
		),
	);

	// Download challenge files command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'datacurve-tracer.downloadChallengeFiles',
			async () => {
				await downloadProjectFiles(context);
				gitManager.initRepository();
			},
		),
	);

	// Upload challenge files command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'datacurve-tracer.uploadChallengeFiles',
			async (resource?: vscode.Uri) => {
				await uploadProjectFiles(context);
				await recorder.export();
				const diff = await gitManager.getDiff();
			},
		),
	);

	// Login command
	context.subscriptions.push(
		vscode.commands.registerCommand('datacurve-tracer.login', async () => {
			const jwt = await vscode.window.showInputBox({
				prompt: 'Enter your jwt',
				placeHolder: 'jwt',
			});
			if (!jwt) {
				vscode.window.showErrorMessage('JWT is required.');
				return;
			}
			const secrets = context['secrets'];
			await secrets.store('shipd-jwt', jwt as unknown as string);
		}),
	);
}

/**
 * Registers all file explorer commands
 */
function registerExplorerCommands(
	context: vscode.ExtensionContext,
	recorder: WorkerFileRecorder,
	thoughtsTracker: ThoughtsTracker,
) {
	const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!rootPath) {
		return;
	}

	// Refresh command
	context.subscriptions.push(
		vscode.commands.registerCommand('curveExplorer.refresh', () => {
			fileExplorer.refresh();
		}),
	);

	// Open file command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'curveExplorer.openFile',
			(resource: vscode.Uri) => {
				vscode.commands.executeCommand('vscode.open', resource);
			},
		),
	);

	// Get state command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'curveExplorer.getState',
			(activeFilePath?: string) => {
				return fileExplorer.getState(activeFilePath);
			},
		),
	);

	// State changed command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'curveExplorer.stateChanged',
			(state) => {
				const stateChangedEmitter = new vscode.EventEmitter<any>();
				stateChangedEmitter.fire(state);
			},
		),
	);

	// Open in workspace command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'curveExplorer.openInWorkspace',
			async (filePath: string) => {
				if (!filePath) {
					const files = await vscode.workspace.findFiles('**/*.*');
					const items = files.map((file) => ({
						label: path.basename(file.fsPath),
						description: vscode.workspace.asRelativePath(file),
						filePath: file.fsPath,
					}));

					const selected = await vscode.window.showQuickPick(items, {
						placeHolder: 'Select a file to reveal in the explorer',
					});

					if (!selected) {
						return;
					}
					filePath = selected.filePath;
				}

				// Check if this is a valid path within the workspace
				if (!filePath.startsWith(rootPath)) {
					vscode.window.showErrorMessage(
						`File path ${filePath} is not within the current workspace.`,
					);
					return;
				}

				// Expand all parent directories
				fileExplorer.expandPathToFile(filePath);

				// Reveal the file in the explorer view
				const fileUri = vscode.Uri.file(filePath);
				await vscode.commands.executeCommand(
					'curveExplorer.revealInExplorer',
					fileUri,
				);
			},
		),
	);

	// Create file command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'curveExplorer.createFile',
			async (context) => {
				let targetUri: vscode.Uri;

				if (context) {
					targetUri = context.resourceUri;
				} else {
					if (!rootPath) {
						return;
					}
					targetUri = vscode.Uri.file(rootPath);
				}

				const stats = await vscode.workspace.fs.stat(targetUri);
				let parentUri: vscode.Uri;

				if (stats.type === vscode.FileType.Directory) {
					parentUri = targetUri;
				} else {
					parentUri = vscode.Uri.file(path.dirname(targetUri.fsPath));
				}

				const fileName = await vscode.window.showInputBox({
					prompt: 'Enter file name',
					validateInput: (value) => {
						if (value.length === 0) {
							return 'File name cannot be empty';
						}
						if (fs.existsSync(path.join(parentUri.fsPath, value))) {
							return 'File already exists';
						}
						return null;
					},
				});

				if (fileName) {
					const newFileUri = vscode.Uri.file(
						path.join(parentUri.fsPath, fileName),
					);
					vscode.workspace.fs
						.writeFile(newFileUri, new Uint8Array([]))
						.then(() => {
							fileExplorer.refresh();
							const action =
								createFileDidCreateFilesCustomAction(
									newFileUri,
								);
							recorder.record(action);

							// Directly signal the ThoughtsTracker
							thoughtsTracker.recordAction(action.action_id);

							vscode.commands.executeCommand(
								'vscode.open',
								newFileUri,
							);
						});
				}
			},
		),
	);

	// Create folder command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'curveExplorer.createFolder',
			async (context) => {
				let targetUri: vscode.Uri;

				if (context) {
					targetUri = context.resourceUri;
				} else {
					if (!rootPath) {
						return;
					}
					targetUri = vscode.Uri.file(rootPath);
				}

				const stats = await vscode.workspace.fs.stat(targetUri);
				let parentUri: vscode.Uri;

				if (stats.type === vscode.FileType.Directory) {
					parentUri = targetUri;
				} else {
					parentUri = vscode.Uri.file(path.dirname(targetUri.fsPath));
				}

				const folderName = await vscode.window.showInputBox({
					prompt: 'Enter folder name',
					validateInput: (value) => {
						if (value.length === 0) {
							return 'Folder name cannot be empty';
						}
						if (fs.existsSync(path.join(parentUri.fsPath, value))) {
							return 'Folder already exists';
						}
						return null;
					},
				});

				if (folderName) {
					const newFolderUri = vscode.Uri.file(
						path.join(parentUri.fsPath, folderName),
					);
					const action =
						createFileDidCreateFolderCustomAction(newFolderUri);
					recorder.record(action);

					// Directly signal the ThoughtsTracker
					thoughtsTracker.recordAction(action.action_id);

					vscode.workspace.fs
						.createDirectory(newFolderUri)
						.then(() => {
							fileExplorer.refresh();
						});
				}
			},
		),
	);

	// Delete file command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'curveExplorer.deleteFile',
			async (context) => {
				const targetUri = context.resourceUri;
				const stats = await vscode.workspace.fs.stat(targetUri);

				let deleteMsg = 'Are you sure you want to delete this file?';
				let deleteOpts: vscode.MessageOptions = { modal: true };

				if (stats.type === vscode.FileType.Directory) {
					deleteMsg =
						'Are you sure you want to delete this folder and all its contents?';
					deleteOpts = { modal: true };
				}

				const result = await vscode.window.showWarningMessage(
					deleteMsg,
					deleteOpts,
					'Delete',
					'Cancel',
				);

				if (result === 'Delete') {
					try {
						const action =
							createFileDidDeleteFilesCustomAction(targetUri);
						recorder.record(action);

						// Directly signal the ThoughtsTracker
						thoughtsTracker.recordAction(action.action_id);

						if (stats.type === vscode.FileType.Directory) {
							await vscode.workspace.fs.delete(targetUri, {
								recursive: true,
							});
						} else {
							await vscode.workspace.fs.delete(targetUri);
						}
						fileExplorer.refresh();
					} catch (err) {
						vscode.window.showErrorMessage(
							`Failed to delete: ${err}`,
						);
					}
				}
			},
		),
	);

	// Rename file command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'curveExplorer.renameFile',
			async (context) => {
				const targetUri = context.resourceUri;
				const oldName = path.basename(targetUri.fsPath);

				const newName = await vscode.window.showInputBox({
					prompt: 'Enter new name',
					value: oldName,
					validateInput: (value) => {
						if (value.length === 0) {
							return 'Name cannot be empty';
						}

						const parentFolder = path.dirname(targetUri.fsPath);
						const newPath = path.join(parentFolder, value);

						if (
							fs.existsSync(newPath) &&
							newPath !== targetUri.fsPath
						) {
							return 'File or folder with this name already exists';
						}

						return null;
					},
				});

				if (newName && newName !== oldName) {
					const newUri = vscode.Uri.file(
						path.join(path.dirname(targetUri.fsPath), newName),
					);

					try {
						const action = createFileDidRenameFilesCustomAction(
							targetUri,
							newUri,
						);
						recorder.record(action);

						// Directly signal the ThoughtsTracker
						thoughtsTracker.recordAction(action.action_id);

						await vscode.workspace.fs.rename(targetUri, newUri);
						fileExplorer.refresh();
					} catch (err) {
						vscode.window.showErrorMessage(
							`Failed to rename: ${err}`,
						);
					}
				}
			},
		),
	);

	// Copy workspace path
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'curveExplorer.copyWorkspacePath',
			() => {
				vscode.env.clipboard.writeText(
					context.storageUri?.fsPath || '',
				);
			},
		),
	);
}
