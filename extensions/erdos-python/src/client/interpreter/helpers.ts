import { inject, injectable } from 'inversify';
import { ConfigurationTarget, Uri } from 'vscode';
import { IDocumentManager, IWorkspaceService } from '../common/application/types';
import { FileSystemPaths } from '../common/platform/fs-paths';
import { Resource } from '../common/types';
import { IServiceContainer } from '../ioc/types';
import { PythonEnvSource } from '../pythonEnvironments/base/info';
import { compareSemVerLikeVersions } from '../pythonEnvironments/base/info/pythonVersion';
import { EnvironmentType, getEnvironmentTypeName, PythonEnvironment } from '../pythonEnvironments/info';
import { IComponentAdapter, IInterpreterHelper, WorkspacePythonPath } from './contracts';

export function isInterpreterLocatedInWorkspace(interpreter: PythonEnvironment, activeWorkspaceUri: Uri): boolean {
    const fileSystemPaths = FileSystemPaths.withDefaults();
    const interpreterPath = fileSystemPaths.normCase(interpreter.path);
    const resourcePath = fileSystemPaths.normCase(activeWorkspaceUri.fsPath);
    return interpreterPath.startsWith(resourcePath);
}

/**
 * Build a version-sorted list from the given one, with lowest first.
 */
export function sortInterpreters(interpreters: PythonEnvironment[]): PythonEnvironment[] {
    if (interpreters.length === 0) {
        return [];
    }
    if (interpreters.length === 1) {
        return [interpreters[0]];
    }
    const sorted = interpreters.slice();
    sorted.sort((a, b) => (a.version && b.version ? compareSemVerLikeVersions(a.version, b.version) : 0));
    return sorted;
}

@injectable()
export class InterpreterHelper implements IInterpreterHelper {
    constructor(
        @inject(IServiceContainer) private serviceContainer: IServiceContainer,
        @inject(IComponentAdapter) private readonly pyenvs: IComponentAdapter,
    ) {}

    public getActiveWorkspaceUri(resource: Resource): WorkspacePythonPath | undefined {
        const workspaceService = this.serviceContainer.get<IWorkspaceService>(IWorkspaceService);
        const hasWorkspaceFolders = (workspaceService.workspaceFolders?.length || 0) > 0;
        if (!hasWorkspaceFolders) {
            return;
        }
        if (Array.isArray(workspaceService.workspaceFolders) && workspaceService.workspaceFolders.length === 1) {
            return { folderUri: workspaceService.workspaceFolders[0].uri, configTarget: ConfigurationTarget.Workspace };
        }

        if (resource) {
            const workspaceFolder = workspaceService.getWorkspaceFolder(resource);
            if (workspaceFolder) {
                return { configTarget: ConfigurationTarget.WorkspaceFolder, folderUri: workspaceFolder.uri };
            }
        }
        const documentManager = this.serviceContainer.get<IDocumentManager>(IDocumentManager);

        if (documentManager.activeTextEditor) {
            const workspaceFolder = workspaceService.getWorkspaceFolder(documentManager.activeTextEditor.document.uri);
            if (workspaceFolder) {
                return { configTarget: ConfigurationTarget.WorkspaceFolder, folderUri: workspaceFolder.uri };
            }
        }
    }

    public async getInterpreterInformation(pythonPath: string): Promise<undefined | Partial<PythonEnvironment>> {
        return this.pyenvs.getInterpreterInformation(pythonPath);
    }

    public async getInterpreters({ resource, source }: { resource?: Uri; source?: PythonEnvSource[] } = {}): Promise<
        PythonEnvironment[]
    > {
        const interpreters = await this.pyenvs.getInterpreters(resource, source);
        return sortInterpreters(interpreters);
    }

    public async getInterpreterPath(pythonPath: string): Promise<string> {
        const interpreterInfo: any = await this.getInterpreterInformation(pythonPath);
        if (interpreterInfo) {
            return interpreterInfo.path;
        } else {
            return pythonPath;
        }
    }

    public async isMacDefaultPythonPath(pythonPath: string): Promise<boolean> {
        return this.pyenvs.isMacDefaultPythonPath(pythonPath);
    }

    public getInterpreterTypeDisplayName(interpreterType: EnvironmentType): string {
        return getEnvironmentTypeName(interpreterType);
    }

    public getBestInterpreter(interpreters?: PythonEnvironment[]): PythonEnvironment | undefined {
        if (!Array.isArray(interpreters) || interpreters.length === 0) {
            return;
        }
        const sorted = sortInterpreters(interpreters);
        return sorted[sorted.length - 1];
    }
}
