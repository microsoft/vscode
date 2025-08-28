/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IErdosNewFolderService, NewFolderConfiguration, NewFolderStartupPhase, NewFolderTask, FolderTemplate, ERDOS_NEW_FOLDER_CONFIG_STORAGE_KEY } from './erdosNewFolder.js';
import { Event } from '../../../../base/common/event.js';
import { Barrier } from '../../../../base/common/async.js';
import { ILanguageRuntimeMetadata } from '../../languageRuntime/common/languageRuntimeService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { joinPath, relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { localize } from '../../../../nls.js';
// import { IRuntimeSessionService } from '../../runtimeSession/common/runtimeSessionService.js';
// import type { IRuntimeSessionService as IRuntimeSessionServiceType } from '../../runtimeSession/common/runtimeSessionTypes.js';
// import { INotebookEditorService } from '../../../contrib/notebook/browser/services/notebookEditorService.js';
// import { INotebookKernelService } from '../../../contrib/notebook/common/notebookKernelService.js';

export class ErdosNewFolderService extends Disposable implements IErdosNewFolderService {
	declare readonly _serviceBrand: undefined;

	private _newFolderConfig: NewFolderConfiguration | null;

	private _startupPhase: ISettableObservable<NewFolderStartupPhase>;
	onDidChangeNewFolderStartupPhase: Event<NewFolderStartupPhase>;

	private _pendingInitTasks: ISettableObservable<Set<string>>;
	onDidChangePendingInitTasks: Event<Set<string>>;

	private _pendingPostInitTasks: ISettableObservable<Set<string>>;
	onDidChangePostInitTasks: Event<Set<string>>;

	public initTasksComplete: Barrier = new Barrier();

	public postInitTasksComplete: Barrier = new Barrier();

	private _runtimeMetadata: ILanguageRuntimeMetadata | undefined;



	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		// @INotebookEditorService private readonly _notebookEditorService: INotebookEditorService,
		// @INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
		@INotificationService private readonly _notificationService: INotificationService,
		// @IRuntimeSessionService private readonly _runtimeSessionService: IRuntimeSessionServiceType,
		@IStorageService private readonly _storageService: IStorageService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
	) {
		super();

		this._startupPhase = observableValue(
			'new-folder-startup-phase',
			NewFolderStartupPhase.Initializing
		);
		this.onDidChangeNewFolderStartupPhase = Event.fromObservable(
			this._startupPhase
		);
		this._register(
			this.onDidChangeNewFolderStartupPhase((phase) => {
				switch (phase) {
					case NewFolderStartupPhase.RuntimeStartup:
						this.initTasksComplete.open();
						break;
					case NewFolderStartupPhase.PostInitialization:
						this._runPostInitTasks();
						break;
					case NewFolderStartupPhase.Complete:
						this.initTasksComplete.open();
						this.postInitTasksComplete.open();
						break;
					default:
				}
				this._logService.debug(
					`[New folder startup] Phase changed to ${phase}`
				);
			})
		);

		this._newFolderConfig = this._parseNewFolderConfig();

		if (!this.isCurrentWindowNewFolder()) {
			this.initTasksComplete.open();
		} else {
			this._runtimeMetadata = this._newFolderConfig?.runtimeMetadata;
		}

		this._pendingInitTasks = observableValue(
			'new-folder-pending-tasks',
			this._getInitTasks()
		);
		this.onDidChangePendingInitTasks = Event.fromObservable(this._pendingInitTasks);
		this._register(
			this.onDidChangePendingInitTasks((tasks) => {
				this._logService.debug(
					`[New folder startup] Pending tasks changed to: ${JSON.stringify(tasks)}`
				);
				if (tasks.size === 0) {
					this._startupPhase.set(
						NewFolderStartupPhase.RuntimeStartup,
						undefined
					);
				}
			})
		);

		this._pendingPostInitTasks = observableValue(
			'new-folder-post-init-tasks',
			this._getPostInitTasks()
		);
		this.onDidChangePostInitTasks = Event.fromObservable(this._pendingPostInitTasks);
		this._register(
			this.onDidChangePostInitTasks((tasks) => {
				this._logService.debug(
					`[New folder startup] Post-init tasks changed to: ${JSON.stringify(tasks)}`
				);
				if (tasks.size === 0) {
					this._startupPhase.set(
						NewFolderStartupPhase.Complete,
						undefined
					);
				}
			}
			)
		);
	}

	private _parseNewFolderConfig(): NewFolderConfiguration | null {
		const newFolderConfigStr = this._storageService.get(
			ERDOS_NEW_FOLDER_CONFIG_STORAGE_KEY,
			StorageScope.APPLICATION
		);
		if (!newFolderConfigStr) {
			this._logService.debug(
				'No new folder configuration found in storage'
			);
			return null;
		}
		return JSON.parse(newFolderConfigStr) as NewFolderConfiguration;
	}

	private async _newFolderTasks() {
		this._startupPhase.set(
			NewFolderStartupPhase.CreatingFolder,
			undefined
		);
		if (this._newFolderConfig) {
			await this._runExtensionTasks();

			if (this._newFolderConfig.folderTemplate === FolderTemplate.EmptyProject ||
				this._newFolderConfig.folderTemplate === FolderTemplate.JupyterNotebook
			) {
				this._startupPhase.set(NewFolderStartupPhase.Complete, undefined);
			}

		} else {
			this._logService.error(
				'[New folder startup] No new folder configuration found'
			);
			this._notificationService.error(
				'Failed to create new folder. No new folder configuration found.'
			);
			this._startupPhase.set(NewFolderStartupPhase.Complete, undefined);
		}
	}

	private async _runExtensionTasks() {
		if (this.pendingInitTasks.has(NewFolderTask.CreateNewFile)) {
			await this._runCreateNewFile();
		}

		if (this.pendingInitTasks.has(NewFolderTask.Git)) {
			await this._runGitInit();
		}

		if (this.pendingInitTasks.has(NewFolderTask.Python)) {
			await this._runPythonTasks();
		}
		if (this.pendingInitTasks.has(NewFolderTask.Jupyter)) {
			await this._runJupyterTasks();
		}
		if (this.pendingInitTasks.has(NewFolderTask.R)) {
			await this._runRTasks();
		}
	}

	private async _runCreateNewFile() {
		switch (this._newFolderConfig?.folderTemplate) {
			case FolderTemplate.PythonProject:
				await this._commandService.executeCommand('python.createNewFile');
				break;
			case FolderTemplate.RProject:
				await this._commandService.executeCommand('r.createNewFile');
				break;
			case FolderTemplate.JupyterNotebook: {
				const languageId = this._newFolderConfig?.runtimeMetadata?.languageId ?? 'python';
				await this._commandService.executeCommand('ipynb.newUntitledIpynb', languageId);
				break;
			}
			default:
				this._logService.error(
					'Cannot determine new file command for unknown folder template',
					this._newFolderConfig?.folderTemplate
				);
				break;
		}
		this._removePendingInitTask(NewFolderTask.CreateNewFile);
	}

	private async _runPythonTasks() {
		if (this.pendingInitTasks.has(NewFolderTask.PythonEnvironment)) {
			await this._createPythonEnvironment();
		}

		if (this.pendingInitTasks.has(NewFolderTask.CreatePyprojectToml)) {
			await this._createPyprojectToml();
		}

		this._removePendingInitTask(NewFolderTask.Python);
	}

	private async _runJupyterTasks() {
		if (this.pendingInitTasks.has(NewFolderTask.PythonEnvironment)) {
			await this._createPythonEnvironment();
		}

		this._removePendingInitTask(NewFolderTask.Jupyter);
	}

	private async _runRTasks() {
		this._removePendingInitTask(NewFolderTask.R);
	}

	private async _runPostInitTasks() {
		if (this.pendingPostInitTasks.size === 0) {
			this._logService.debug('[New folder startup] No post-init tasks to run.');
			this._startupPhase.set(NewFolderStartupPhase.Complete, undefined);
			return;
		}

		if (this.pendingPostInitTasks.has(NewFolderTask.REnvironment)) {
			await this._runRPostInitTasks();
		}
	}

	private async _runRPostInitTasks() {
		if (this.pendingPostInitTasks.has(NewFolderTask.REnvironment)) {
			await this._createREnvironment();
		}
	}

	private async _runGitInit() {
		if (!this._newFolderConfig) {
			this._logService.error(`[New folder startup] git init - no new folder configuration found`);
			return;
		}

		const folderRoot = URI.from({
			scheme: this._newFolderConfig.folderScheme,
			authority: this._newFolderConfig.folderAuthority,
			path: this._newFolderConfig.folderPath
		});

		await this._commandService.executeCommand('git.init', true)
			.catch((error) => {
				const errorMessage = localize('erdosNewFolderService.gitInitError', 'Error initializing git repository {0}', error);
				this._notificationService.error(errorMessage);
			});
		await this._fileService.createFile(joinPath(folderRoot, 'README.md'), VSBuffer.fromString(`# ${this._newFolderConfig.folderName}`))
			.catch((error) => {
				const errorMessage = localize('erdosNewFolderService.readmeError', 'Error creating readme {0}', error);
				this._notificationService.error(errorMessage);
			});

		this._removePendingInitTask(NewFolderTask.Git);
	}

	private async _createPythonEnvironment() {
		this._removePendingInitTask(NewFolderTask.PythonEnvironment);
	}

	private async _createPyprojectToml() {
		this._removePendingInitTask(NewFolderTask.CreatePyprojectToml);
	}

	private async _createREnvironment() {
		if (this._newFolderConfig?.useRenv) {
			await this._commandService.executeCommand('r.renvInit');
		}
		this._removePendingPostInitTask(NewFolderTask.REnvironment);
	}

	private _removePendingInitTask(task: NewFolderTask) {
		const updatedPendingTasks = new Set(this.pendingInitTasks);
		updatedPendingTasks.delete(task);
		this._pendingInitTasks.set(updatedPendingTasks, undefined);
	}

	private _removePendingPostInitTask(task: NewFolderTask) {
		const updatedPendingTasks = new Set(this.pendingPostInitTasks);
		updatedPendingTasks.delete(task);
		this._pendingPostInitTasks.set(updatedPendingTasks, undefined);
	}

	private _getInitTasks(): Set<NewFolderTask> {
		if (!this._newFolderConfig) {
			return new Set();
		}

		const tasks = new Set<NewFolderTask>();
		switch (this._newFolderConfig.folderTemplate) {
			case FolderTemplate.PythonProject:
				tasks.add(NewFolderTask.Python);
				if (this._newFolderConfig.pythonEnvProviderId) {
					tasks.add(NewFolderTask.PythonEnvironment);
				}
				if (this._newFolderConfig.createPyprojectToml) {
					tasks.add(NewFolderTask.CreatePyprojectToml);
				}
				break;
			case FolderTemplate.JupyterNotebook:
				tasks.add(NewFolderTask.Jupyter);
				if (this._newFolderConfig.pythonEnvProviderId) {
					tasks.add(NewFolderTask.PythonEnvironment);
				}
				break;
			case FolderTemplate.RProject:
				tasks.add(NewFolderTask.R);
				break;
			default:
				this._logService.error(
					'Cannot determine new folder tasks for unknown folder template',
					this._newFolderConfig.folderTemplate
				);
				return new Set();
		}

		if (this._newFolderConfig.initGitRepo) {
			tasks.add(NewFolderTask.Git);
		}

		tasks.add(NewFolderTask.CreateNewFile);

		return tasks;
	}

	private _getPostInitTasks(): Set<NewFolderTask> {
		if (!this._newFolderConfig) {
			return new Set();
		}

		const tasks = new Set<NewFolderTask>();
		if (this._newFolderConfig.useRenv) {
			tasks.add(NewFolderTask.REnvironment);
		}

		return tasks;
	}

	isCurrentWindowNewFolder() {
		if (!this._newFolderConfig) {
			return false;
		}
		const currentFolderPath = this._contextService.getWorkspace().folders[0]?.uri;
		const newFolderPath = URI.from({
			scheme: this._newFolderConfig.folderScheme,
			authority: this._newFolderConfig.folderAuthority,
			path: this._newFolderConfig.folderPath
		});
		const currentWindowIsNewFolder = relativePath(currentFolderPath, newFolderPath) === '';
		this._logService.debug(`[New folder startup] Current window is new folder: ${currentWindowIsNewFolder}`);
		return currentWindowIsNewFolder;
	}

	async initNewFolder() {
		if (!this.isCurrentWindowNewFolder()) {
			return;
		}
		if (this._newFolderConfig) {
			this.clearNewFolderConfig();

			this._startupPhase.set(
				NewFolderStartupPhase.AwaitingTrust,
				undefined
			);

			if (this._workspaceTrustManagementService.isWorkspaceTrusted()) {
				this._newFolderTasks();
			} else {
				this._register(
					this._workspaceTrustManagementService.onDidChangeTrust(
						(trusted) => {
							if (!trusted) {
								return;
							}
							if (
								this.startupPhase ===
								NewFolderStartupPhase.AwaitingTrust
							) {
								this._newFolderTasks();
							}
						}
					)
				);
			}
		} else {
			this._logService.error(
				'[New folder startup] No new folder configuration found'
			);
			this._notificationService.error(
				'Failed to create new folder. No new folder configuration found.'
			);
			this._startupPhase.set(NewFolderStartupPhase.Complete, undefined);
		}
	}

	clearNewFolderConfig() {
		this._storageService.remove(
			ERDOS_NEW_FOLDER_CONFIG_STORAGE_KEY,
			StorageScope.APPLICATION
		);
	}

	storeNewFolderConfig(newfolderConfig: NewFolderConfiguration) {
		this._storageService.store(
			ERDOS_NEW_FOLDER_CONFIG_STORAGE_KEY,
			JSON.stringify(newfolderConfig),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE
		);
	}

	get startupPhase(): NewFolderStartupPhase {
		return this._startupPhase.get();
	}

	get pendingInitTasks(): Set<string> {
		return this._pendingInitTasks.get();
	}

	get pendingPostInitTasks(): Set<string> {
		return this._pendingPostInitTasks.get();
	}

	public get newFolderRuntimeMetadata(): ILanguageRuntimeMetadata | undefined {
		return this._runtimeMetadata;
	}

	// Phase 4 Extensions: Simple project creation methods
	async createNewProject(name: string, location: string, template?: string): Promise<void> {
		this._logService.info(`ErdosNewFolderService: Creating new project '${name}' at '${location}' with template '${template || 'default'}'`);
		
		try {
			const projectUri = URI.file(location).with({ path: `${URI.file(location).path}/${name}` });
			
			// Create the project directory
			await this._fileService.createFolder(projectUri);
			
			// Create basic project structure based on template
			await this.createProjectStructure(projectUri, template);
			
			this._logService.info(`ErdosNewFolderService: Successfully created project '${name}'`);
		} catch (error) {
			this._logService.error(`ErdosNewFolderService: Failed to create project '${name}':`, error);
			throw error;
		}
	}

	async getAvailableTemplates(): Promise<string[]> {
		// Return basic templates for now
		// In the future, this could be extended to read from configuration or extensions
		return [
			'r-project',
			'python-project',
			'data-analysis',
			'empty'
		];
	}

	private async createProjectStructure(projectUri: URI, template?: string): Promise<void> {
		switch (template) {
			case 'r-project':
				await this.createRProjectStructure(projectUri);
				break;
			case 'python-project':
				await this.createPythonProjectStructure(projectUri);
				break;
			case 'data-analysis':
				await this.createDataAnalysisStructure(projectUri);
				break;
			default:
				await this.createEmptyProjectStructure(projectUri);
				break;
		}
	}

	private async createRProjectStructure(projectUri: URI): Promise<void> {
		// Create R project files
		const rprojectContent = `Version: 1.0

RestoreWorkspace: Default
SaveWorkspace: Default
AlwaysSaveHistory: Default

EnableCodeIndexing: Yes
UseSpacesForTab: Yes
NumSpacesForTab: 2
Encoding: UTF-8

RnwWeave: Sweave
LaTeX: pdfLaTeX`;

		await this._fileService.writeFile(
			URI.joinPath(projectUri, `${projectUri.path.split('/').pop()}.Rproj`),
			VSBuffer.fromString(rprojectContent)
		);

		// Create basic R script
		const rScriptContent = `# ${projectUri.path.split('/').pop()} R Project
# Created with Erdos

# Load required libraries
# library(tidyverse)

# Your code here
`;

		await this._fileService.writeFile(
			URI.joinPath(projectUri, 'main.R'),
			VSBuffer.fromString(rScriptContent)
		);
	}

	private async createPythonProjectStructure(projectUri: URI): Promise<void> {
		// Create requirements.txt
		const requirementsContent = `# Python dependencies
pandas>=1.3.0
numpy>=1.21.0
matplotlib>=3.4.0
seaborn>=0.11.0
jupyter>=1.0.0
`;

		await this._fileService.writeFile(
			URI.joinPath(projectUri, 'requirements.txt'),
			VSBuffer.fromString(requirementsContent)
		);

		// Create main.py
		const pythonScriptContent = `"""
${projectUri.path.split('/').pop()} Python Project
Created with Erdos
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

def main():
    """Main function"""
    print("Hello from Erdos!")
    
if __name__ == "__main__":
    main()
`;

		await this._fileService.writeFile(
			URI.joinPath(projectUri, 'main.py'),
			VSBuffer.fromString(pythonScriptContent)
		);
	}

	private async createDataAnalysisStructure(projectUri: URI): Promise<void> {
		// Create data analysis folder structure
		await this._fileService.createFolder(URI.joinPath(projectUri, 'data'));
		await this._fileService.createFolder(URI.joinPath(projectUri, 'scripts'));
		await this._fileService.createFolder(URI.joinPath(projectUri, 'output'));
		await this._fileService.createFolder(URI.joinPath(projectUri, 'docs'));

		// Create README
		const readmeContent = `# ${projectUri.path.split('/').pop()}

Data analysis project created with Erdos.

## Structure

- \`data/\` - Raw and processed data files
- \`scripts/\` - Analysis scripts
- \`output/\` - Generated plots and results
- \`docs/\` - Documentation and reports

## Getting Started

1. Place your data files in the \`data/\` folder
2. Create analysis scripts in the \`scripts/\` folder
3. Run your analysis and save outputs to the \`output/\` folder
`;

		await this._fileService.writeFile(
			URI.joinPath(projectUri, 'README.md'),
			VSBuffer.fromString(readmeContent)
		);
	}

	private async createEmptyProjectStructure(projectUri: URI): Promise<void> {
		// Create a simple README for empty projects
		const readmeContent = `# ${projectUri.path.split('/').pop()}

Project created with Erdos.
`;

		await this._fileService.writeFile(
			URI.joinPath(projectUri, 'README.md'),
			VSBuffer.fromString(readmeContent)
		);
	}
}
