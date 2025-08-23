import { ConfigurationTarget, Disposable, QuickPickItem, Uri } from 'vscode';
import { Resource } from '../../common/types';
import { PythonEnvironment } from '../../pythonEnvironments/info';
import { PythonExtension, ResolvedEnvironment } from '../../api/types';

export interface IPythonPathUpdaterService {
    updatePythonPath(pythonPath: string | undefined): Promise<void>;
}

export const IPythonPathUpdaterServiceFactory = Symbol('IPythonPathUpdaterServiceFactory');
export interface IPythonPathUpdaterServiceFactory {
    getGlobalPythonPathConfigurationService(): IPythonPathUpdaterService;
    getWorkspacePythonPathConfigurationService(wkspace: Uri): IPythonPathUpdaterService;
    getWorkspaceFolderPythonPathConfigurationService(workspaceFolder: Uri): IPythonPathUpdaterService;
}

export const IPythonPathUpdaterServiceManager = Symbol('IPythonPathUpdaterServiceManager');
export interface IPythonPathUpdaterServiceManager {
    updatePythonPath(
        pythonPath: string | undefined,
        configTarget: ConfigurationTarget,
        trigger: 'ui' | 'shebang' | 'load',
        wkspace?: Uri,
    ): Promise<void>;
}

export const IInterpreterSelector = Symbol('IInterpreterSelector');
export interface IInterpreterSelector extends Disposable {
    getRecommendedSuggestion(
        suggestions: IInterpreterQuickPickItem[],
        resource: Resource,
    ): IInterpreterQuickPickItem | undefined;
    /**
     * @deprecated Only exists for old Jupyter integration.
     */
    getAllSuggestions(resource: Resource): Promise<IInterpreterQuickPickItem[]>;
    getSuggestions(resource: Resource, useFullDisplayName?: boolean): IInterpreterQuickPickItem[];
    suggestionToQuickPickItem(
        suggestion: PythonEnvironment,
        workspaceUri?: Uri | undefined,
        useDetailedName?: boolean,
    ): IInterpreterQuickPickItem;
}

export interface IInterpreterQuickPickItem extends QuickPickItem {
    path: string;
    /**
     * The interpreter related to this quickpick item.
     *
     * @type {PythonEnvironment}
     * @memberof IInterpreterQuickPickItem
     */
    interpreter: PythonEnvironment;
}

export interface ISpecialQuickPickItem extends QuickPickItem {
    path?: string;
}

export const IInterpreterComparer = Symbol('IInterpreterComparer');
export interface IInterpreterComparer {
    initialize(resource: Resource): Promise<void>;
    compare(a: PythonEnvironment, b: PythonEnvironment): number;
    getRecommended(interpreters: PythonEnvironment[], resource: Resource): PythonEnvironment | undefined;
}

export interface InterpreterQuickPickParams {
    /**
     * Specify `null` if a placeholder is not required.
     */
    placeholder?: string | null;
    /**
     * Specify `null` if a title is not required.
     */
    title?: string | null;
    /**
     * Specify `true` to skip showing recommended python interpreter.
     */
    skipRecommended?: boolean;

    /**
     * Specify `true` to show back button.
     */
    showBackButton?: boolean;

    /**
     * Show button to create a new environment.
     */
    showCreateEnvironment?: boolean;
}

export const IInterpreterQuickPick = Symbol('IInterpreterQuickPick');
export interface IInterpreterQuickPick {
    getInterpreterViaQuickPick(
        workspace: Resource,
        filter?: (i: PythonEnvironment) => boolean,
        params?: InterpreterQuickPickParams,
    ): Promise<string | undefined>;
}

export const IRecommendedEnvironmentService = Symbol('IRecommendedEnvironmentService');
export interface IRecommendedEnvironmentService {
    registerEnvApi(api: PythonExtension['environments']): void;
    trackUserSelectedEnvironment(environmentPath: string | undefined, uri: Uri | undefined): void;
    getRecommededEnvironment(
        resource: Resource,
    ): Promise<
        | {
              environment: ResolvedEnvironment;
              reason: 'globalUserSelected' | 'workspaceUserSelected' | 'defaultRecommended';
          }
        | undefined
    >;
}
