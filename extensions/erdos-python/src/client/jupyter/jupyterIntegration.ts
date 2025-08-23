/* eslint-disable comma-dangle */

/* eslint-disable implicit-arrow-linebreak, max-classes-per-file */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable, named } from 'inversify';
import { dirname } from 'path';
import { EventEmitter, Extension, Memento, Uri, workspace, Event } from 'vscode';
import type { SemVer } from 'semver';
import { IContextKeyManager, IWorkspaceService } from '../common/application/types';
import { JUPYTER_EXTENSION_ID, PYLANCE_EXTENSION_ID } from '../common/constants';
import { GLOBAL_MEMENTO, IExtensions, IMemento, Resource } from '../common/types';
import { IEnvironmentActivationService } from '../interpreter/activation/types';
import {
    IInterpreterQuickPickItem,
    IInterpreterSelector,
    IRecommendedEnvironmentService,
} from '../interpreter/configuration/types';
import {
    ICondaService,
    IInterpreterDisplay,
    IInterpreterService,
    IInterpreterStatusbarVisibilityFilter,
} from '../interpreter/contracts';
import { PylanceApi } from '../activation/node/pylanceApi';
import { ExtensionContextKey } from '../common/application/contextKeys';
import { getDebugpyPath } from '../debugger/pythonDebugger';
import type { Environment, EnvironmentPath, PythonExtension } from '../api/types';
import { DisposableBase } from '../common/utils/resourceLifecycle';

type PythonApiForJupyterExtension = {
    /**
     * IEnvironmentActivationService
     */
    getActivatedEnvironmentVariables(
        resource: Resource,
        interpreter: Environment,
        allowExceptions?: boolean,
    ): Promise<NodeJS.ProcessEnv | undefined>;
    getKnownSuggestions(resource: Resource): IInterpreterQuickPickItem[];
    /**
     * @deprecated Use `getKnownSuggestions` and `suggestionToQuickPickItem` instead.
     */
    getSuggestions(resource: Resource): Promise<IInterpreterQuickPickItem[]>;
    /**
     * Returns path to where `debugpy` is. In python extension this is `/python_files/lib/python`.
     */
    getDebuggerPath(): Promise<string>;
    /**
     * Retrieve interpreter path selected for Jupyter server from Python memento storage
     */
    getInterpreterPathSelectedForJupyterServer(): string | undefined;
    /**
     * Registers a visibility filter for the interpreter status bar.
     */
    registerInterpreterStatusFilter(filter: IInterpreterStatusbarVisibilityFilter): void;
    getCondaVersion(): Promise<SemVer | undefined>;
    /**
     * Returns the conda executable.
     */
    getCondaFile(): Promise<string | undefined>;

    /**
     * Call to provide a function that the Python extension can call to request the Python
     * path to use for a particular notebook.
     * @param func : The function that Python should call when requesting the Python path.
     */
    registerJupyterPythonPathFunction(func: (uri: Uri) => Promise<string | undefined>): void;

    /**
     * Returns the preferred environment for the given URI.
     */
    getRecommededEnvironment(
        uri: Uri | undefined,
    ): Promise<
        | {
              environment: EnvironmentPath;
              reason: 'globalUserSelected' | 'workspaceUserSelected' | 'defaultRecommended';
          }
        | undefined
    >;
};

type JupyterExtensionApi = {
    /**
     * Registers python extension specific parts with the jupyter extension
     * @param interpreterService
     */
    registerPythonApi(interpreterService: PythonApiForJupyterExtension): void;
};

@injectable()
export class JupyterExtensionIntegration {
    private jupyterExtension: Extension<JupyterExtensionApi> | undefined;

    private pylanceExtension: Extension<PylanceApi> | undefined;
    private environmentApi: PythonExtension['environments'] | undefined;

    constructor(
        @inject(IExtensions) private readonly extensions: IExtensions,
        @inject(IInterpreterSelector) private readonly interpreterSelector: IInterpreterSelector,
        @inject(IEnvironmentActivationService) private readonly envActivation: IEnvironmentActivationService,
        @inject(IMemento) @named(GLOBAL_MEMENTO) private globalState: Memento,
        @inject(IInterpreterDisplay) private interpreterDisplay: IInterpreterDisplay,
        @inject(IWorkspaceService) private workspaceService: IWorkspaceService,
        @inject(ICondaService) private readonly condaService: ICondaService,
        @inject(IContextKeyManager) private readonly contextManager: IContextKeyManager,
        @inject(IInterpreterService) private interpreterService: IInterpreterService,
        @inject(IRecommendedEnvironmentService) private preferredEnvironmentService: IRecommendedEnvironmentService,
    ) {}
    public registerEnvApi(api: PythonExtension['environments']) {
        this.environmentApi = api;
    }

    public registerApi(jupyterExtensionApi: JupyterExtensionApi): JupyterExtensionApi | undefined {
        this.contextManager.setContext(ExtensionContextKey.IsJupyterInstalled, true);
        if (!this.workspaceService.isTrusted) {
            this.workspaceService.onDidGrantWorkspaceTrust(() => this.registerApi(jupyterExtensionApi));
            return undefined;
        }
        // Forward python parts
        jupyterExtensionApi.registerPythonApi({
            getActivatedEnvironmentVariables: async (
                resource: Resource,
                env: Environment,
                allowExceptions?: boolean,
            ) => {
                const interpreter = await this.interpreterService.getInterpreterDetails(env.path);
                return this.envActivation.getActivatedEnvironmentVariables(resource, interpreter, allowExceptions);
            },
            getSuggestions: async (resource: Resource): Promise<IInterpreterQuickPickItem[]> =>
                this.interpreterSelector.getAllSuggestions(resource),
            getKnownSuggestions: (resource: Resource): IInterpreterQuickPickItem[] =>
                this.interpreterSelector.getSuggestions(resource),
            getDebuggerPath: async () => dirname(await getDebugpyPath()),
            getInterpreterPathSelectedForJupyterServer: () =>
                this.globalState.get<string | undefined>('INTERPRETER_PATH_SELECTED_FOR_JUPYTER_SERVER'),
            registerInterpreterStatusFilter: this.interpreterDisplay.registerVisibilityFilter.bind(
                this.interpreterDisplay,
            ),
            getCondaFile: () => this.condaService.getCondaFile(),
            getCondaVersion: () => this.condaService.getCondaVersion(),
            registerJupyterPythonPathFunction: (func: (uri: Uri) => Promise<string | undefined>) =>
                this.registerJupyterPythonPathFunction(func),
            getRecommededEnvironment: async (uri) => {
                if (!this.environmentApi) {
                    return undefined;
                }
                return this.preferredEnvironmentService.getRecommededEnvironment(uri);
            },
        });
        return undefined;
    }

    public async integrateWithJupyterExtension(): Promise<void> {
        const api = await this.getExtensionApi();
        if (api) {
            this.registerApi(api);
        }
    }

    private async getExtensionApi(): Promise<JupyterExtensionApi | undefined> {
        if (!this.pylanceExtension) {
            const pylanceExtension = this.extensions.getExtension<PylanceApi>(PYLANCE_EXTENSION_ID);

            if (pylanceExtension && !pylanceExtension.isActive) {
                await pylanceExtension.activate();
            }

            this.pylanceExtension = pylanceExtension;
        }

        if (!this.jupyterExtension) {
            const jupyterExtension = this.extensions.getExtension<JupyterExtensionApi>(JUPYTER_EXTENSION_ID);
            if (!jupyterExtension) {
                return undefined;
            }
            await jupyterExtension.activate();
            if (jupyterExtension.isActive) {
                this.jupyterExtension = jupyterExtension;
                return this.jupyterExtension.exports;
            }
        } else {
            return this.jupyterExtension.exports;
        }
        return undefined;
    }

    private getPylanceApi(): PylanceApi | undefined {
        const api = this.pylanceExtension?.exports;
        return api && api.notebook && api.client && api.client.isEnabled() ? api : undefined;
    }

    private registerJupyterPythonPathFunction(func: (uri: Uri) => Promise<string | undefined>) {
        const api = this.getPylanceApi();
        if (api) {
            api.notebook!.registerJupyterPythonPathFunction(func);
        }
    }
}

export interface JupyterPythonEnvironmentApi {
    /**
     * This event is triggered when the environment associated with a Jupyter Notebook or Interactive Window changes.
     * The Uri in the event is the Uri of the Notebook/IW.
     */
    onDidChangePythonEnvironment?: Event<Uri>;
    /**
     * Returns the EnvironmentPath to the Python environment associated with a Jupyter Notebook or Interactive Window.
     * If the Uri is not associated with a Jupyter Notebook or Interactive Window, then this method returns undefined.
     * @param uri
     */
    getPythonEnvironment?(
        uri: Uri,
    ):
        | undefined
        | {
              /**
               * The ID of the environment.
               */
              readonly id: string;
              /**
               * Path to environment folder or path to python executable that uniquely identifies an environment. Environments
               * lacking a python executable are identified by environment folder paths, whereas other envs can be identified
               * using python executable path.
               */
              readonly path: string;
          };
}

@injectable()
export class JupyterExtensionPythonEnvironments extends DisposableBase implements JupyterPythonEnvironmentApi {
    private jupyterExtension?: JupyterPythonEnvironmentApi;

    private readonly _onDidChangePythonEnvironment = this._register(new EventEmitter<Uri>());

    public readonly onDidChangePythonEnvironment = this._onDidChangePythonEnvironment.event;

    constructor(@inject(IExtensions) private readonly extensions: IExtensions) {
        super();
    }

    public getPythonEnvironment(
        uri: Uri,
    ):
        | undefined
        | {
              /**
               * The ID of the environment.
               */
              readonly id: string;
              /**
               * Path to environment folder or path to python executable that uniquely identifies an environment. Environments
               * lacking a python executable are identified by environment folder paths, whereas other envs can be identified
               * using python executable path.
               */
              readonly path: string;
          } {
        if (!isJupyterResource(uri)) {
            return undefined;
        }
        const api = this.getJupyterApi();
        if (api?.getPythonEnvironment) {
            return api.getPythonEnvironment(uri);
        }
        return undefined;
    }

    private getJupyterApi() {
        if (!this.jupyterExtension) {
            const ext = this.extensions.getExtension<JupyterPythonEnvironmentApi>(JUPYTER_EXTENSION_ID);
            if (!ext) {
                return undefined;
            }
            if (!ext.isActive) {
                ext.activate().then(() => {
                    this.hookupOnDidChangePythonEnvironment(ext.exports);
                });
                return undefined;
            }
            this.hookupOnDidChangePythonEnvironment(ext.exports);
        }
        return this.jupyterExtension;
    }

    private hookupOnDidChangePythonEnvironment(api: JupyterPythonEnvironmentApi) {
        this.jupyterExtension = api;
        if (api.onDidChangePythonEnvironment) {
            this._register(
                api.onDidChangePythonEnvironment(
                    this._onDidChangePythonEnvironment.fire,
                    this._onDidChangePythonEnvironment,
                ),
            );
        }
    }
}

function isJupyterResource(resource: Uri): boolean {
    // Jupyter extension only deals with Notebooks and Interactive Windows.
    return (
        resource.fsPath.endsWith('.ipynb') ||
        workspace.notebookDocuments.some((item) => item.uri.toString() === resource.toString())
    );
}
