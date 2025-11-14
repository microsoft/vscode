/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { pickRemoteSource } from './remoteSource';
import { l10n, workspace, window, Uri, ProgressLocation, commands } from 'vscode';
import { RepositoryCache, RepositoryCacheInfo } from './repositoryCache';
import TelemetryReporter from '@vscode/extension-telemetry';
import { Model } from './model';

type ApiPostCloneAction = 'none';
enum PostCloneAction { Open, OpenNewWindow, AddToWorkspace, None }

export interface CloneOptions {
	parentPath?: string;
	ref?: string;
	recursive?: boolean;
	postCloneAction?: ApiPostCloneAction;
}

export class CloneManager {
	constructor(private readonly model: Model,
		private readonly telemetryReporter: TelemetryReporter,
		private readonly repositoryCache: RepositoryCache) { }

	async clone(url?: string, options: CloneOptions = {}) {
		if (!url || typeof url !== 'string') {
			url = await pickRemoteSource({
				providerLabel: provider => l10n.t('Clone from {0}', provider.name),
				urlLabel: l10n.t('Clone from URL')
			});
		}

		if (!url) {
			/* __GDPR__
				"clone" : {
					"owner": "lszomoru",
					"outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The outcome of the git operation" }
				}
			*/
			this.telemetryReporter.sendTelemetryEvent('clone', { outcome: 'no_URL' });
			return;
		}

		url = url.trim().replace(/^git\s+clone\s+/, '');

		const cachedRepository = this.repositoryCache.get(url);
		if (cachedRepository && (cachedRepository.length > 0)) {
			return this.tryOpenExistingRepository(cachedRepository, url, options.postCloneAction, options.parentPath, options.ref);
		}
		return this.cloneRepository(url, options.parentPath, options);
	}

	private async cloneRepository(url: string, parentPath?: string, options: { recursive?: boolean; ref?: string; postCloneAction?: ApiPostCloneAction } = {}): Promise<string | undefined> {
		if (!parentPath) {
			const config = workspace.getConfiguration('git');
			let defaultCloneDirectory = config.get<string>('defaultCloneDirectory') || os.homedir();
			defaultCloneDirectory = defaultCloneDirectory.replace(/^~/, os.homedir());

			const uris = await window.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				defaultUri: Uri.file(defaultCloneDirectory),
				title: l10n.t('Choose a folder to clone {0} into', url),
				openLabel: l10n.t('Select as Repository Destination')
			});

			if (!uris || uris.length === 0) {
				/* __GDPR__
					"clone" : {
						"owner": "lszomoru",
						"outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The outcome of the git operation" }
					}
				*/
				this.telemetryReporter.sendTelemetryEvent('clone', { outcome: 'no_directory' });
				return;
			}

			const uri = uris[0];
			parentPath = uri.fsPath;
		}

		try {
			const opts = {
				location: ProgressLocation.Notification,
				title: l10n.t('Cloning git repository "{0}"...', url),
				cancellable: true
			};

			const repositoryPath = await window.withProgress(
				opts,
				(progress, token) => this.model.git.clone(url!, { parentPath: parentPath!, progress, recursive: options.recursive, ref: options.ref }, token)
			);

			await this.doPostCloneAction(repositoryPath, options.postCloneAction);

			return repositoryPath;
		} catch (err) {
			if (/already exists and is not an empty directory/.test(err && err.stderr || '')) {
				/* __GDPR__
					"clone" : {
						"owner": "lszomoru",
						"outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The outcome of the git operation" }
					}
				*/
				this.telemetryReporter.sendTelemetryEvent('clone', { outcome: 'directory_not_empty' });
			} else if (/Cancelled/i.test(err && (err.message || err.stderr || ''))) {
				return;
			} else {
				/* __GDPR__
					"clone" : {
						"owner": "lszomoru",
						"outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The outcome of the git operation" }
					}
				*/
				this.telemetryReporter.sendTelemetryEvent('clone', { outcome: 'error' });
			}

			throw err;
		}
	}

	private async doPostCloneAction(target: string, postCloneAction?: ApiPostCloneAction): Promise<void> {
		const config = workspace.getConfiguration('git');
		const openAfterClone = config.get<'always' | 'alwaysNewWindow' | 'whenNoFolderOpen' | 'prompt'>('openAfterClone');

		let action: PostCloneAction | undefined = undefined;

		if (postCloneAction && postCloneAction === 'none') {
			action = PostCloneAction.None;
		} else {
			if (openAfterClone === 'always') {
				action = PostCloneAction.Open;
			} else if (openAfterClone === 'alwaysNewWindow') {
				action = PostCloneAction.OpenNewWindow;
			} else if (openAfterClone === 'whenNoFolderOpen' && !workspace.workspaceFolders) {
				action = PostCloneAction.Open;
			}
		}

		if (action === undefined) {
			let message = l10n.t('Would you like to open the repository?');
			const open = l10n.t('Open');
			const openNewWindow = l10n.t('Open in New Window');
			const choices = [open, openNewWindow];

			const addToWorkspace = l10n.t('Add to Workspace');
			if (workspace.workspaceFolders) {
				message = l10n.t('Would you like to open the repository, or add it to the current workspace?');
				choices.push(addToWorkspace);
			}

			const result = await window.showInformationMessage(message, { modal: true }, ...choices);

			action = result === open ? PostCloneAction.Open
				: result === openNewWindow ? PostCloneAction.OpenNewWindow
					: result === addToWorkspace ? PostCloneAction.AddToWorkspace : undefined;
		}

		/* __GDPR__
			"clone" : {
				"owner": "lszomoru",
				"outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The outcome of the git operation" },
				"openFolder": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Indicates whether the folder is opened following the clone operation" }
			}
		*/
		this.telemetryReporter.sendTelemetryEvent('clone', { outcome: 'success' }, { openFolder: action === PostCloneAction.Open || action === PostCloneAction.OpenNewWindow ? 1 : 0 });

		const uri = Uri.file(target);

		if (action === PostCloneAction.Open) {
			commands.executeCommand('vscode.openFolder', uri, { forceReuseWindow: true });
		} else if (action === PostCloneAction.AddToWorkspace) {
			workspace.updateWorkspaceFolders(workspace.workspaceFolders!.length, 0, { uri });
		} else if (action === PostCloneAction.OpenNewWindow) {
			commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
		}
	}

	private async chooseExistingRepository(url: string, existingCachedRepositories: RepositoryCacheInfo[], ref: string | undefined, parentPath?: string, postCloneAction?: ApiPostCloneAction): Promise<string | undefined> {
		try {
			const items: { label: string; description?: string; item?: RepositoryCacheInfo }[] = existingCachedRepositories.map(knownFolder => {
				const isWorkspace = knownFolder.workspacePath.endsWith('.code-workspace');
				const label = isWorkspace ? l10n.t('Workspace: {0}', path.basename(knownFolder.workspacePath, '.code-workspace')) : path.basename(knownFolder.workspacePath);
				return { label, description: knownFolder.workspacePath, item: knownFolder };
			});
			const cloneAgain = { label: l10n.t('Clone again') };
			items.push(cloneAgain);
			const placeHolder = l10n.t('Open Existing Repository Clone');
			const pick = await window.showQuickPick(items, { placeHolder, canPickMany: false });
			if (pick === cloneAgain) {
				return (await this.cloneRepository(url, parentPath, { ref, postCloneAction })) ?? undefined;
			}
			if (!pick?.item) {
				return undefined;
			}
			return pick.item.workspacePath;
		} catch {
			return undefined;
		}
	}

	private async tryOpenExistingRepository(cachedRepository: RepositoryCacheInfo[], url: string, postCloneAction?: ApiPostCloneAction, parentPath?: string, ref?: string): Promise<string | undefined> {
		// Gather existing folders/workspace files (ignore ones that no longer exist)
		const existingCachedRepositories: RepositoryCacheInfo[] = (await Promise.all<RepositoryCacheInfo | undefined>(cachedRepository.map(async folder => {
			const stat = await fs.promises.stat(folder.workspacePath).catch(() => undefined);
			if (stat) {
				return folder;
			}
			return undefined;
		}
		))).filter<RepositoryCacheInfo>((folder): folder is RepositoryCacheInfo => folder !== undefined);

		if (!existingCachedRepositories.length) {
			// fallback to clone
			return (await this.cloneRepository(url, parentPath, { ref, postCloneAction }) ?? undefined);
		}

		// First, find the cached repo that exists in the current workspace
		const matchingInCurrentWorkspace = existingCachedRepositories?.find(cachedRepo => {
			return workspace.workspaceFolders?.some(workspaceFolder => workspaceFolder.uri.fsPath === cachedRepo.workspacePath);
		});

		if (matchingInCurrentWorkspace) {
			return matchingInCurrentWorkspace.workspacePath;
		}

		let repoForWorkspace: string | undefined = (existingCachedRepositories.length === 1 ? existingCachedRepositories[0].workspacePath : undefined);
		if (!repoForWorkspace) {
			repoForWorkspace = await this.chooseExistingRepository(url, existingCachedRepositories, ref, parentPath, postCloneAction);
		}
		if (repoForWorkspace) {
			await this.doPostCloneAction(repoForWorkspace, postCloneAction);
			return repoForWorkspace;
		}
		return;
	}
}
