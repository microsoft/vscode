/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Barrier } from '../../../../base/common/async.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILanguageRuntimeMetadata } from '../../languageRuntime/common/languageRuntimeService.js';

export const ERDOS_NEW_FOLDER_CONFIG_STORAGE_KEY = 'erdos.newFolderConfig';

export const ERDOS_NEW_FOLDER_SERVICE_ID = 'erdosNewFolderService';

export const IErdosNewFolderService = createDecorator<IErdosNewFolderService>(ERDOS_NEW_FOLDER_SERVICE_ID);

export enum NewFolderStartupPhase {
	Initializing = 'initializing',
	AwaitingTrust = 'awaitingTrust',
	CreatingFolder = 'creatingFolder',
	RuntimeStartup = 'runtimeStartup',
	PostInitialization = 'postInitialization',
	Complete = 'complete',
}

export enum FolderTemplate {
	PythonProject = 'Python Project',
	RProject = 'R Project',
	JupyterNotebook = 'Jupyter Notebook',
	EmptyProject = 'Empty Project'
}

export enum NewFolderTask {
	Python = 'python',
	R = 'r',
	Jupyter = 'jupyter',
	Git = 'git',
	PythonEnvironment = 'pythonEnvironment',
	REnvironment = 'rEnvironment',
	CreateNewFile = 'createNewFile',
	CreatePyprojectToml = 'createPyprojectToml',
}

export interface NewFolderConfiguration {
	readonly folderScheme: string;
	readonly folderAuthority: string;
	readonly runtimeMetadata: ILanguageRuntimeMetadata | undefined;
	readonly folderTemplate: string;
	readonly folderPath: string;
	readonly folderName: string;
	readonly initGitRepo: boolean;
	readonly createPyprojectToml: boolean | undefined;
	readonly pythonEnvProviderId: string | undefined;
	readonly pythonEnvProviderName: string | undefined;
	readonly installIpykernel: boolean | undefined;
	readonly condaPythonVersion: string | undefined;
	readonly uvPythonVersion: string | undefined;
	readonly useRenv: boolean | undefined;
}

export interface IErdosNewFolderService {
	readonly _serviceBrand: undefined;

	onDidChangeNewFolderStartupPhase: Event<NewFolderStartupPhase>;

	readonly startupPhase: NewFolderStartupPhase;

	onDidChangePendingInitTasks: Event<Set<string>>;

	onDidChangePostInitTasks: Event<Set<string>>;

	readonly pendingInitTasks: Set<string>;

	readonly pendingPostInitTasks: Set<string>;

	clearNewFolderConfig(): void;

	initNewFolder(): Promise<void>;

	isCurrentWindowNewFolder(): boolean;

	initTasksComplete: Barrier;

	postInitTasksComplete: Barrier;

	readonly newFolderRuntimeMetadata: ILanguageRuntimeMetadata | undefined;

	storeNewFolderConfig(newFolderConfig: NewFolderConfiguration): void;

	// Phase 4 Extensions: Additional project creation methods
	/**
	 * Creates a new project folder with the specified configuration.
	 * This is a simpler alternative to the full new folder workflow.
	 * @param name The name of the project
	 * @param location The location where to create the project
	 * @param template Optional project template to use
	 */
	createNewProject(name: string, location: string, template?: string): Promise<void>;

	/**
	 * Gets available project templates for simple project creation.
	 * This complements the existing FolderTemplate enum with additional options.
	 */
	getAvailableTemplates(): Promise<string[]>;
}

export type CreateEnvironmentResult = {
	readonly path?: string;
	readonly error?: Error;
	readonly metadata?: ILanguageRuntimeMetadata;
};

export type CreatePyprojectTomlResult = { success: true; path: string } | { success: false; error: string };

export enum LanguageIds {
	Python = 'python',
	R = 'r'
}
