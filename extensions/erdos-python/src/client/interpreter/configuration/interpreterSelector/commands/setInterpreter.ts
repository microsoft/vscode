// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
/* eslint-disable import/no-duplicates */

'use strict';

import { inject, injectable } from 'inversify';
import { cloneDeep } from 'lodash';
import * as path from 'path';
import {
    l10n,
    QuickInputButton,
    QuickInputButtons,
    QuickPick,
    QuickPickItem,
    QuickPickItemKind,
    ThemeIcon,
} from 'vscode';
import { IApplicationShell, ICommandManager, IWorkspaceService } from '../../../../common/application/types';
import { Commands, Octicons, ThemeIcons } from '../../../../common/constants';
import { isParentPath } from '../../../../common/platform/fs-paths';
import { IPlatformService } from '../../../../common/platform/types';
import { IConfigurationService, IPathUtils, Resource } from '../../../../common/types';
// eslint-disable-next-line import/no-duplicates
import { Common, InterpreterQuickPickList } from '../../../../common/utils/localize';
import { noop } from '../../../../common/utils/misc';
import {
    IMultiStepInput,
    IMultiStepInputFactory,
    InputFlowAction,
    InputStep,
    IQuickPickParameters,
    QuickInputButtonSetup,
} from '../../../../common/utils/multiStepInput';
import { SystemVariables } from '../../../../common/variables/systemVariables';
import { TriggerRefreshOptions } from '../../../../pythonEnvironments/base/locator';
import { EnvironmentType, PythonEnvironment } from '../../../../pythonEnvironments/info';
import { captureTelemetry, sendTelemetryEvent } from '../../../../telemetry';
import { EventName } from '../../../../telemetry/constants';
import { IInterpreterService, PythonEnvironmentsChangedEvent } from '../../../contracts';
import { isProblematicCondaEnvironment } from '../../environmentTypeComparer';
import {
    IInterpreterQuickPick,
    IInterpreterQuickPickItem,
    IInterpreterSelector,
    InterpreterQuickPickParams,
    IPythonPathUpdaterServiceManager,
    ISpecialQuickPickItem,
} from '../../types';
import { BaseInterpreterSelectorCommand } from './base';
// eslint-disable-next-line import/order
import * as fs from 'fs-extra';
import { CreateEnv } from '../../../../common/utils/localize';
import { IPythonRuntimeManager } from '../../../../erdos/manager';
import { showErrorMessage } from '../../../../common/vscodeApis/windowApis';
import { traceError } from '../../../../logging';
import { shouldIncludeInterpreter } from '../../../../erdos/interpreterSettings';
import { isVersionSupported } from '../../environmentTypeComparer';
import { untildify } from '../../../../common/helpers';
import { useEnvExtension } from '../../../../envExt/api.internal';
import { setInterpreterLegacy } from '../../../../envExt/api.legacy';
import { CreateEnvironmentResult } from '../../../../pythonEnvironments/creation/proposed.createEnvApis';

export type InterpreterStateArgs = { path?: string; workspace: Resource };
export type QuickPickType = IInterpreterQuickPickItem | ISpecialQuickPickItem | QuickPickItem;

function isInterpreterQuickPickItem(item: QuickPickType): item is IInterpreterQuickPickItem {
    return 'interpreter' in item;
}

function isSpecialQuickPickItem(item: QuickPickType): item is ISpecialQuickPickItem {
    return 'alwaysShow' in item;
}

function isSeparatorItem(item: QuickPickType): item is QuickPickItem {
    return 'kind' in item && item.kind === QuickPickItemKind.Separator;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace EnvGroups {
    export const Workspace = InterpreterQuickPickList.workspaceGroupName;
    export const Conda = 'Conda';
    export const Global = InterpreterQuickPickList.globalGroupName;
    export const VirtualEnv = 'VirtualEnv';
    export const PipEnv = 'PipEnv';
    export const Pyenv = 'Pyenv';
    export const Venv = 'Venv';
    export const Poetry = 'Poetry';
    export const Hatch = 'Hatch';
    export const Pixi = 'Pixi';
    export const Uv = 'Uv';
    export const Unsupported = 'Unsupported';
    export const VirtualEnvWrapper = 'VirtualEnvWrapper';
    export const ActiveState = 'ActiveState';
    export const Recommended = Common.recommended;
}

@injectable()
export class SetInterpreterCommand extends BaseInterpreterSelectorCommand implements IInterpreterQuickPick {
    private readonly createEnvironmentSuggestion: QuickPickItem = {
        label: `${Octicons.Add} ${InterpreterQuickPickList.create.label}`,
        alwaysShow: true,
    };

    private readonly manualEntrySuggestion: ISpecialQuickPickItem = {
        label: `${Octicons.Folder} ${InterpreterQuickPickList.enterPath.label}`,
        alwaysShow: true,
    };

    private readonly refreshButton = {
        iconPath: new ThemeIcon(ThemeIcons.Refresh),
        tooltip: InterpreterQuickPickList.refreshInterpreterList,
    };

    private readonly noPythonInstalled: ISpecialQuickPickItem = {
        label: `${Octicons.Error} ${InterpreterQuickPickList.noPythonInstalled}`,
        detail: InterpreterQuickPickList.clickForInstructions,
        alwaysShow: true,
    };

    private wasNoPythonInstalledItemClicked = false;

    private readonly tipToReloadWindow: ISpecialQuickPickItem = {
        label: `${Octicons.Lightbulb} Reload the window if you installed Python but don't see it`,
        detail: `Click to run \`Developer: Reload Window\` command`,
        alwaysShow: true,
    };

    constructor(
        @inject(IApplicationShell) applicationShell: IApplicationShell,
        @inject(IPathUtils) pathUtils: IPathUtils,
        @inject(IPythonPathUpdaterServiceManager)
        pythonPathUpdaterService: IPythonPathUpdaterServiceManager,
        @inject(IConfigurationService) configurationService: IConfigurationService,
        @inject(ICommandManager) commandManager: ICommandManager,
        @inject(IMultiStepInputFactory) private readonly multiStepFactory: IMultiStepInputFactory,
        @inject(IPlatformService) private readonly platformService: IPlatformService,
        @inject(IInterpreterSelector) private readonly interpreterSelector: IInterpreterSelector,
        @inject(IWorkspaceService) workspaceService: IWorkspaceService,
        @inject(IInterpreterService) private readonly interpreterService: IInterpreterService,
        @inject(IPythonRuntimeManager) private readonly pythonRuntimeManager: IPythonRuntimeManager,
    ) {
        super(
            pythonPathUpdaterService,
            commandManager,
            applicationShell,
            workspaceService,
            pathUtils,
            configurationService,
        );
    }

    public async activate(): Promise<void> {
        this.disposables.push(
            this.commandManager.registerCommand(Commands.Set_Interpreter, this.setInterpreter.bind(this)),
        );
    }

    public async _pickInterpreter(
        input: IMultiStepInput<InterpreterStateArgs>,
        state: InterpreterStateArgs,
        filter?: (i: PythonEnvironment) => boolean,
        params?: InterpreterQuickPickParams,
    ): Promise<void | InputStep<InterpreterStateArgs>> {
        // If the list is refreshing, it's crucial to maintain sorting order at all
        // times so that the visible items do not change.
        const preserveOrderWhenFiltering = !!this.interpreterService.refreshPromise;
        const suggestions = this._getItems(state.workspace, filter, params);
        state.path = undefined;
        const currentInterpreterPathDisplay = this.pathUtils.getDisplayName(
            this.configurationService.getSettings(state.workspace).pythonPath,
            state.workspace ? state.workspace.fsPath : undefined,
        );
        const placeholder =
            params?.placeholder === null
                ? undefined
                : params?.placeholder ?? l10n.t('Selected Interpreter: {0}', currentInterpreterPathDisplay);
        const title =
            params?.title === null ? undefined : params?.title ?? InterpreterQuickPickList.browsePath.openButtonLabel;
        const buttons: QuickInputButtonSetup[] = [
            {
                button: this.refreshButton,
                callback: (quickpickInput) => {
                    this.refreshCallback(quickpickInput, { isButton: true, showBackButton: params?.showBackButton });
                },
            },
        ];
        if (params?.showBackButton) {
            buttons.push({
                button: QuickInputButtons.Back,
                callback: () => {
                    // Do nothing. This is handled as a promise rejection in the quickpick.
                },
            });
        }

        const selection = await input.showQuickPick<QuickPickType, IQuickPickParameters<QuickPickType>>({
            placeholder,
            items: suggestions,
            sortByLabel: !preserveOrderWhenFiltering,
            keepScrollPosition: true,
            activeItem: (quickPick) => this.getActiveItem(state.workspace, quickPick), // Use a promise here to ensure quickpick is initialized synchronously.
            matchOnDetail: true,
            matchOnDescription: true,
            title,
            customButtonSetups: buttons,
            initialize: (quickPick) => {
                // Note discovery is no longer guranteed to be auto-triggered on extension load, so trigger it when
                if (this.interpreterService.getInterpreters().length === 0) {
                    this.refreshCallback(quickPick, { showBackButton: params?.showBackButton });
                } else {
                    this.refreshCallback(quickPick, {
                        ifNotTriggerredAlready: true,
                        showBackButton: params?.showBackButton,
                    });
                }
            },
            onChangeItem: {
                event: this.interpreterService.onDidChangeInterpreters,
                // It's essential that each callback is handled synchronously, as result of the previous
                // callback influences the input for the next one. Input here is the quickpick itself.
                callback: (event: PythonEnvironmentsChangedEvent, quickPick) => {
                    if (this.interpreterService.refreshPromise) {
                        quickPick.busy = true;
                        this.interpreterService.refreshPromise.then(() => {
                            // Items are in the final state as all previous callbacks have finished executing.
                            quickPick.busy = false;
                            // Ensure we set a recommended item after refresh has finished.
                            this.updateQuickPickItems(quickPick, {}, state.workspace, filter, params);
                        });
                    }
                    this.updateQuickPickItems(quickPick, event, state.workspace, filter, params);
                },
            },
        });

        if (selection === undefined) {
            sendTelemetryEvent(EventName.SELECT_INTERPRETER_SELECTED, undefined, { action: 'escape' });
        } else if (selection.label === this.manualEntrySuggestion.label) {
            sendTelemetryEvent(EventName.SELECT_INTERPRETER_ENTER_OR_FIND);
            return this._enterOrBrowseInterpreterPath.bind(this);
        } else if (selection.label === this.createEnvironmentSuggestion.label) {
            const createdEnv = (await Promise.resolve(
                this.commandManager.executeCommand(Commands.Create_Environment, {
                    showBackButton: false,
                    selectEnvironment: true,
                }),
            ).catch(noop)) as CreateEnvironmentResult | undefined;
            state.path = createdEnv?.path;
        } else if (selection.label === this.noPythonInstalled.label) {
            this.commandManager.executeCommand(Commands.InstallPython).then(noop, noop);
            this.wasNoPythonInstalledItemClicked = true;
        } else if (selection.label === this.tipToReloadWindow.label) {
            this.commandManager.executeCommand('workbench.action.reloadWindow').then(noop, noop);
        } else {
            sendTelemetryEvent(EventName.SELECT_INTERPRETER_SELECTED, undefined, { action: 'selected' });
            state.path = (selection as IInterpreterQuickPickItem).path;
        }
        return undefined;
    }

    public _getItems(
        resource: Resource,
        filter: ((i: PythonEnvironment) => boolean) | undefined,
        params?: InterpreterQuickPickParams,
    ): QuickPickType[] {
        const suggestions: QuickPickType[] = [];
        if (params?.showCreateEnvironment) {
            suggestions.push(this.createEnvironmentSuggestion, { label: '', kind: QuickPickItemKind.Separator });
        }

        suggestions.push(this.manualEntrySuggestion, { label: '', kind: QuickPickItemKind.Separator });

        const defaultInterpreterPathSuggestion = this.getDefaultInterpreterPathSuggestion(resource);
        if (defaultInterpreterPathSuggestion) {
            suggestions.push(defaultInterpreterPathSuggestion);
        }
        const interpreterSuggestions = this.getSuggestions(resource, filterWrapper(filter), params);
        this.finalizeItems(interpreterSuggestions, resource, params);
        suggestions.push(...interpreterSuggestions);
        return suggestions;
    }

    private getSuggestions(
        resource: Resource,
        filter: ((i: PythonEnvironment) => boolean) | undefined,
        params?: InterpreterQuickPickParams,
    ): QuickPickType[] {
        const workspaceFolder = this.workspaceService.getWorkspaceFolder(resource);
        const items = this.interpreterSelector
            .getSuggestions(resource, !!this.interpreterService.refreshPromise)
            .filter((i) => !filter || filter(i.interpreter));
        if (this.interpreterService.refreshPromise) {
            // We cannot put items in groups while the list is loading as group of an item can change.
            return items;
        }
        const itemsWithFullName = this.interpreterSelector
            .getSuggestions(resource, true)
            .filter((i) => !filter || filter(i.interpreter));
        let recommended: IInterpreterQuickPickItem | undefined;
        if (!params?.skipRecommended) {
            recommended = this.interpreterSelector.getRecommendedSuggestion(
                itemsWithFullName,
                this.workspaceService.getWorkspaceFolder(resource)?.uri,
            );
        }
        if (recommended && items[0].interpreter.id === recommended.interpreter.id) {
            items.shift();
        }
        return getGroupedQuickPickItems(items, recommended, workspaceFolder?.uri.fsPath);
    }

    private async getActiveItem(resource: Resource, quickPick: QuickPick<QuickPickType>) {
        const interpreter = await this.interpreterService.getActiveInterpreter(resource);
        const suggestions = quickPick.items;
        const activeInterpreterItem = suggestions.find(
            (i) => isInterpreterQuickPickItem(i) && i.interpreter.id === interpreter?.id,
        );
        if (activeInterpreterItem) {
            return activeInterpreterItem;
        }
        const firstInterpreterSuggestion = suggestions.find(
            (s) => isInterpreterQuickPickItem(s) && isVersionSupported(s.interpreter.version),
        );
        if (firstInterpreterSuggestion) {
            return firstInterpreterSuggestion;
        }
        const noPythonInstalledItem = suggestions.find(
            (i) => isSpecialQuickPickItem(i) && i.label === this.noPythonInstalled.label,
        );
        return noPythonInstalledItem ?? suggestions[0];
    }

    private getDefaultInterpreterPathSuggestion(resource: Resource): ISpecialQuickPickItem | undefined {
        const config = this.workspaceService.getConfiguration('python', resource);
        const systemVariables = new SystemVariables(resource, undefined, this.workspaceService);
        const defaultInterpreterPathValue = systemVariables.resolveAny(config.get<string>('defaultInterpreterPath'));
        if (defaultInterpreterPathValue && defaultInterpreterPathValue !== 'python') {
            return {
                label: `${Octicons.Gear} ${InterpreterQuickPickList.defaultInterpreterPath.label}`,
                description: this.pathUtils.getDisplayName(
                    defaultInterpreterPathValue,
                    resource ? resource.fsPath : undefined,
                ),
                path: defaultInterpreterPathValue,
                alwaysShow: true,
            };
        }
        return undefined;
    }

    /**
     * Updates quickpick using the change event received.
     */
    private updateQuickPickItems(
        quickPick: QuickPick<QuickPickType>,
        event: PythonEnvironmentsChangedEvent,
        resource: Resource,
        filter: ((i: PythonEnvironment) => boolean) | undefined,
        params?: InterpreterQuickPickParams,
    ) {
        // Active items are reset once we replace the current list with updated items, so save it.
        const activeItemBeforeUpdate = quickPick.activeItems.length > 0 ? quickPick.activeItems[0] : undefined;
        quickPick.items = this.getUpdatedItems(quickPick.items, event, resource, filter, params);
        // Ensure we maintain the same active item as before.
        const activeItem = activeItemBeforeUpdate
            ? quickPick.items.find((item) => {
                  if (isInterpreterQuickPickItem(item) && isInterpreterQuickPickItem(activeItemBeforeUpdate)) {
                      return item.interpreter.id === activeItemBeforeUpdate.interpreter.id;
                  }
                  if (isSpecialQuickPickItem(item) && isSpecialQuickPickItem(activeItemBeforeUpdate)) {
                      // 'label' is a constant here instead of 'path'.
                      return item.label === activeItemBeforeUpdate.label;
                  }
                  return false;
              })
            : undefined;
        if (activeItem) {
            quickPick.activeItems = [activeItem];
        }
    }

    /**
     * Prepare updated items to replace the quickpick list with.
     */
    private getUpdatedItems(
        items: readonly QuickPickType[],
        event: PythonEnvironmentsChangedEvent,
        resource: Resource,
        filter: ((i: PythonEnvironment) => boolean) | undefined,
        params?: InterpreterQuickPickParams,
    ): QuickPickType[] {
        const updatedItems = [...items.values()];
        const areItemsGrouped = items.find((item) => isSeparatorItem(item));
        const env = event.old ?? event.new;
        if (filterWrapper(filter) && event.new && !filterWrapper(filter)(event.new)) {
            event.new = undefined; // Remove envs we're not looking for from the list.
        }
        let envIndex = -1;
        if (env) {
            envIndex = updatedItems.findIndex(
                (item) => isInterpreterQuickPickItem(item) && item.interpreter.id === env.id,
            );
        }
        if (event.new) {
            const newSuggestion = this.interpreterSelector.suggestionToQuickPickItem(
                event.new,
                resource,
                !areItemsGrouped,
            );
            if (envIndex === -1) {
                const noPyIndex = updatedItems.findIndex(
                    (item) => isSpecialQuickPickItem(item) && item.label === this.noPythonInstalled.label,
                );
                if (noPyIndex !== -1) {
                    updatedItems.splice(noPyIndex, 1);
                }
                const tryReloadIndex = updatedItems.findIndex(
                    (item) => isSpecialQuickPickItem(item) && item.label === this.tipToReloadWindow.label,
                );
                if (tryReloadIndex !== -1) {
                    updatedItems.splice(tryReloadIndex, 1);
                }
                if (areItemsGrouped) {
                    addSeparatorIfApplicable(
                        updatedItems,
                        newSuggestion,
                        this.workspaceService.getWorkspaceFolder(resource)?.uri.fsPath,
                    );
                }
                updatedItems.push(newSuggestion);
            } else {
                updatedItems[envIndex] = newSuggestion;
            }
        }
        if (envIndex !== -1 && event.new === undefined) {
            updatedItems.splice(envIndex, 1);
        }
        this.finalizeItems(updatedItems, resource, params);
        return updatedItems;
    }

    private finalizeItems(items: QuickPickType[], resource: Resource, params?: InterpreterQuickPickParams) {
        const interpreterSuggestions = this.interpreterSelector.getSuggestions(resource, true);
        const r = this.interpreterService.refreshPromise;
        if (!r) {
            if (interpreterSuggestions.length) {
                if (!params?.skipRecommended) {
                    this.setRecommendedItem(interpreterSuggestions, items, resource);
                }
                // Add warning label to certain environments
                items.forEach((item, i) => {
                    if (isInterpreterQuickPickItem(item) && isProblematicCondaEnvironment(item.interpreter)) {
                        if (!items[i].label.includes(Octicons.Warning)) {
                            items[i].label = `${Octicons.Warning} ${items[i].label}`;
                            items[i].tooltip = InterpreterQuickPickList.condaEnvWithoutPythonTooltip;
                        }
                    }
                    if (isInterpreterQuickPickItem(item) && !isVersionSupported(item.interpreter.version)) {
                        if (!items[i].label.includes(Octicons.Warning)) {
                            items[i].label = `${Octicons.Warning} ${items[i].label}`;
                            items[i].tooltip = InterpreterQuickPickList.unsupportedVersionTooltip;
                        }
                    }
                });
            } else {
                if (!items.some((i) => isSpecialQuickPickItem(i) && i.label === this.noPythonInstalled.label)) {
                    items.push(this.noPythonInstalled);
                }
                if (
                    this.wasNoPythonInstalledItemClicked &&
                    !items.some((i) => isSpecialQuickPickItem(i) && i.label === this.tipToReloadWindow.label)
                ) {
                    items.push(this.tipToReloadWindow);
                }
            }
        }
    }

    private setRecommendedItem(
        interpreterSuggestions: IInterpreterQuickPickItem[],
        items: QuickPickType[],
        resource: Resource,
    ) {
        const suggestion = this.interpreterSelector.getRecommendedSuggestion(
            interpreterSuggestions,
            this.workspaceService.getWorkspaceFolder(resource)?.uri,
        );
        if (!suggestion) {
            return;
        }
        const areItemsGrouped = items.find((item) => isSeparatorItem(item) && item.label === EnvGroups.Recommended);
        const recommended = cloneDeep(suggestion);
        recommended.description = areItemsGrouped
            ? // No need to add a tag as "Recommended" group already exists.
              recommended.description
            : `${recommended.description ?? ''} - ${Common.recommended}`;
        const index = items.findIndex(
            (item) => isInterpreterQuickPickItem(item) && item.interpreter.id === recommended.interpreter.id,
        );
        if (index !== -1) {
            items[index] = recommended;
        }
    }

    private refreshCallback(
        input: QuickPick<QuickPickItem>,
        options?: TriggerRefreshOptions & { isButton?: boolean; showBackButton?: boolean },
    ) {
        input.buttons = this.getButtons(options);

        this.interpreterService
            .triggerRefresh(undefined, options)
            .finally(() => {
                input.buttons = this.getButtons({ isButton: false, showBackButton: options?.showBackButton });
            })
            .ignoreErrors();
        if (this.interpreterService.refreshPromise) {
            input.busy = true;
            this.interpreterService.refreshPromise.then(() => {
                input.busy = false;
            });
        }
    }

    private getButtons(options?: { isButton?: boolean; showBackButton?: boolean }): QuickInputButton[] {
        const buttons: QuickInputButton[] = [];
        if (options?.showBackButton) {
            buttons.push(QuickInputButtons.Back);
        }
        if (options?.isButton) {
            buttons.push({
                iconPath: new ThemeIcon(ThemeIcons.SpinningLoader),
                tooltip: InterpreterQuickPickList.refreshingInterpreterList,
            });
        } else {
            buttons.push(this.refreshButton);
        }
        return buttons;
    }

    @captureTelemetry(EventName.SELECT_INTERPRETER_ENTER_BUTTON)
    public async _enterOrBrowseInterpreterPath(
        input: IMultiStepInput<InterpreterStateArgs>,
        state: InterpreterStateArgs,
    ): Promise<void | InputStep<InterpreterStateArgs>> {
        const items: QuickPickItem[] = [
            {
                label: InterpreterQuickPickList.browsePath.label,
                detail: InterpreterQuickPickList.browsePath.detail,
            },
        ];

        const selection = await input.showQuickPick({
            placeholder: InterpreterQuickPickList.enterPath.placeholder,
            items,
            acceptFilterBoxTextAsSelection: true,
        });

        if (typeof selection === 'string') {
            // User entered text in the filter box to enter path to python, store it
            sendTelemetryEvent(EventName.SELECT_INTERPRETER_ENTER_CHOICE, undefined, { choice: 'enter' });
            state.path = untildify(selection);
            if (!fs.existsSync(state.path)) {
                showErrorMessage(`${CreateEnv.pathDoesntExist} ${state.path}`);
            }
            this.sendInterpreterEntryTelemetry(selection, state.workspace);
        } else if (selection && selection.label === InterpreterQuickPickList.browsePath.label) {
            sendTelemetryEvent(EventName.SELECT_INTERPRETER_ENTER_CHOICE, undefined, { choice: 'browse' });
            const filtersKey = 'Executables';
            const filtersObject: { [name: string]: string[] } = {};
            filtersObject[filtersKey] = ['exe'];
            const uris = await this.applicationShell.showOpenDialog({
                filters: this.platformService.isWindows ? filtersObject : undefined,
                openLabel: InterpreterQuickPickList.browsePath.openButtonLabel,
                canSelectMany: false,
                title: InterpreterQuickPickList.browsePath.title,
            });
            if (uris && uris.length > 0) {
                state.path = uris[0].fsPath;
                this.sendInterpreterEntryTelemetry(state.path!, state.workspace);
            } else {
                return Promise.reject(InputFlowAction.resume);
            }
        }
        return Promise.resolve();
    }

    /**
     * @returns true when an interpreter was set, undefined if the user cancelled the quickpick.
     */
    @captureTelemetry(EventName.SELECT_INTERPRETER)
    public async setInterpreter(options?: {
        hideCreateVenv?: boolean;
        showBackButton?: boolean;
    }): Promise<SelectEnvironmentResult | undefined> {
        const targetConfig = await this.getConfigTargets();
        if (!targetConfig) {
            return;
        }
        const { configTarget } = targetConfig[0];
        const wkspace = targetConfig[0].folderUri;
        const interpreterState: InterpreterStateArgs = { path: undefined, workspace: wkspace };
        const multiStep = this.multiStepFactory.create<InterpreterStateArgs>();
        try {
            await multiStep.run(
                (input, s) =>
                    this._pickInterpreter(input, s, undefined, {
                        showCreateEnvironment: !options?.hideCreateVenv,
                        showBackButton: options?.showBackButton,
                    }),
                interpreterState,
            );
        } catch (ex) {
            if (ex === InputFlowAction.back) {
                // User clicked back button, so we need to return this action.
                return { action: 'Back' };
            }
            if (ex === InputFlowAction.cancel) {
                // User clicked cancel button, so we need to return this action.
                return { action: 'Cancel' };
            }
        }
        if (interpreterState.path !== undefined) {
            // User may choose to have an empty string stored, so variable `interpreterState.path` may be
            // an empty string, in which case we should update.
            // Having the value `undefined` means user cancelled the quickpick, so we update nothing in that case.
            await this.pythonPathUpdaterService.updatePythonPath(interpreterState.path, configTarget, 'ui', wkspace);
            this.pythonRuntimeManager
                .selectLanguageRuntimeFromPath(interpreterState.path)
                .catch((error: any) => traceError(`Failed to select language runtime from path: ${error}`));
            this.commandManager.executeCommand(Commands.Focus_Erdos_Console);
            if (useEnvExtension()) {
                await setInterpreterLegacy(interpreterState.path, wkspace);
            }
            return { path: interpreterState.path };
        }
    }

    public async getInterpreterViaQuickPick(
        workspace: Resource,
        filter: ((i: PythonEnvironment) => boolean) | undefined,
        params?: InterpreterQuickPickParams,
    ): Promise<string | undefined> {
        const interpreterState: InterpreterStateArgs = { path: undefined, workspace };
        const multiStep = this.multiStepFactory.create<InterpreterStateArgs>();
        await multiStep.run((input, s) => this._pickInterpreter(input, s, filter, params), interpreterState);
        return interpreterState.path;
    }

    /**
     * Check if the interpreter that was entered exists in the list of suggestions.
     * If it does, it means that it had already been discovered,
     * and we didn't do a good job of surfacing it.
     *
     * @param selection Intepreter path that was either entered manually or picked by browsing through the filesystem.
     */
    // eslint-disable-next-line class-methods-use-this
    private sendInterpreterEntryTelemetry(selection: string, workspace: Resource): void {
        const suggestions = this._getItems(workspace, undefined);
        let interpreterPath = path.normalize(untildify(selection));

        if (!path.isAbsolute(interpreterPath)) {
            interpreterPath = path.resolve(workspace?.fsPath || '', selection);
        }

        const expandedPaths = suggestions.map((s) => {
            const suggestionPath = isInterpreterQuickPickItem(s) ? s.interpreter.path : '';
            let expandedPath = path.normalize(untildify(suggestionPath));

            if (!path.isAbsolute(suggestionPath)) {
                expandedPath = path.resolve(workspace?.fsPath || '', suggestionPath);
            }

            return expandedPath;
        });

        const discovered = expandedPaths.includes(interpreterPath);

        sendTelemetryEvent(EventName.SELECT_INTERPRETER_ENTERED_EXISTS, undefined, { discovered });

        return undefined;
    }
}

function getGroupedQuickPickItems(
    items: IInterpreterQuickPickItem[],
    recommended: IInterpreterQuickPickItem | undefined,
    workspacePath?: string,
): QuickPickType[] {
    const updatedItems: QuickPickType[] = [];
    if (recommended) {
        updatedItems.push({ label: EnvGroups.Recommended, kind: QuickPickItemKind.Separator }, recommended);
    }
    let previousGroup = EnvGroups.Recommended;
    for (const item of items) {
        previousGroup = addSeparatorIfApplicable(updatedItems, item, workspacePath, previousGroup);
        updatedItems.push(item);
    }
    return updatedItems;
}

function addSeparatorIfApplicable(
    items: QuickPickType[],
    newItem: IInterpreterQuickPickItem,
    workspacePath?: string,
    previousGroup?: string | undefined,
) {
    if (!previousGroup) {
        const lastItem = items.length ? items[items.length - 1] : undefined;
        previousGroup =
            lastItem && isInterpreterQuickPickItem(lastItem) ? getGroup(lastItem, workspacePath) : undefined;
    }
    const currentGroup = getGroup(newItem, workspacePath);
    if (!previousGroup || currentGroup !== previousGroup) {
        const separatorItem: QuickPickItem = { label: currentGroup, kind: QuickPickItemKind.Separator };
        items.push(separatorItem);
        previousGroup = currentGroup;
    }
    return previousGroup;
}

function getGroup(item: IInterpreterQuickPickItem, workspacePath?: string) {
    if (!isVersionSupported(item.interpreter.version)) {
        return EnvGroups.Unsupported;
    }
    if (workspacePath && isParentPath(item.path, workspacePath)) {
        return EnvGroups.Workspace;
    }
    switch (item.interpreter.envType) {
        case EnvironmentType.Custom:
            return EnvGroups.Global;
        case EnvironmentType.Global:
        case EnvironmentType.System:
        case EnvironmentType.Unknown:
        case EnvironmentType.MicrosoftStore:
            return EnvGroups.Global;
        default:
            return EnvGroups[item.interpreter.envType];
    }
}

function filterWrapper(filter: ((i: PythonEnvironment) => boolean) | undefined) {
    return (i: PythonEnvironment) => (filter ? filter(i) : true) && shouldIncludeInterpreter(i.path);
}

export type SelectEnvironmentResult = {
    /**
     * Path to the executable python in the environment
     */
    readonly path?: string;
    /*
     * User action that resulted in exit from the create environment flow.
     */
    readonly action?: 'Back' | 'Cancel';
};
