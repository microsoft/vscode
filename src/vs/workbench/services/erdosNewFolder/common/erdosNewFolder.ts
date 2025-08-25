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