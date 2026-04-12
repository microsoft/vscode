/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { groupBy } from '../../../../../base/common/arrays.js';
import { createCancelablePromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { uppercaseFirstLetter } from '../../../../../base/common/strings.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { JUPYTER_EXTENSION_ID, KERNEL_RECOMMENDATIONS } from '../notebookBrowser.js';
import { executingStateIcon, selectKernelIcon } from '../notebookIcons.js';
import { INotebookKernelHistoryService, INotebookKernelService } from '../../common/notebookKernelService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { URI } from '../../../../../base/common/uri.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { SELECT_KERNEL_ID } from '../controller/coreActions.js';
import { IExtensionManagementServerService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { areSameExtensions } from '../../../../../platform/extensionManagement/common/extensionManagementUtil.js';
function isKernelPick(item) {
    return 'kernel' in item;
}
function isGroupedKernelsPick(item) {
    return 'kernels' in item;
}
function isSourcePick(item) {
    return 'action' in item;
}
function isInstallExtensionPick(item) {
    return item.id === 'installSuggested' && 'extensionIds' in item;
}
function isSearchMarketplacePick(item) {
    return item.id === 'install';
}
function isKernelSourceQuickPickItem(item) {
    return 'command' in item;
}
function supportAutoRun(item) {
    return 'autoRun' in item && !!item.autoRun;
}
const KERNEL_PICKER_UPDATE_DEBOUNCE = 200;
function toKernelQuickPick(kernel, selected) {
    const res = {
        kernel,
        picked: kernel.id === selected?.id,
        label: kernel.label,
        description: kernel.description,
        detail: kernel.detail
    };
    if (kernel.id === selected?.id) {
        if (!res.description) {
            res.description = localize('current1', "Currently Selected");
        }
        else {
            res.description = localize('current2', "{0} - Currently Selected", res.description);
        }
    }
    return res;
}
class KernelPickerStrategyBase {
    constructor(_notebookKernelService, _productService, _quickInputService, _labelService, _logService, _extensionWorkbenchService, _extensionService, _commandService, _extensionManagementServerService) {
        this._notebookKernelService = _notebookKernelService;
        this._productService = _productService;
        this._quickInputService = _quickInputService;
        this._labelService = _labelService;
        this._logService = _logService;
        this._extensionWorkbenchService = _extensionWorkbenchService;
        this._extensionService = _extensionService;
        this._commandService = _commandService;
        this._extensionManagementServerService = _extensionManagementServerService;
    }
    async showQuickPick(editor, wantedId, skipAutoRun) {
        const notebook = editor.textModel;
        const scopedContextKeyService = editor.scopedContextKeyService;
        const matchResult = this._getMatchingResult(notebook);
        const { selected, all } = matchResult;
        let newKernel;
        if (wantedId) {
            for (const candidate of all) {
                if (candidate.id === wantedId) {
                    newKernel = candidate;
                    break;
                }
            }
            if (!newKernel) {
                this._logService.warn(`wanted kernel DOES NOT EXIST, wanted: ${wantedId}, all: ${all.map(k => k.id)}`);
                return false;
            }
        }
        if (newKernel) {
            this._selecteKernel(notebook, newKernel);
            return true;
        }
        const localDisposableStore = new DisposableStore();
        const quickPick = localDisposableStore.add(this._quickInputService.createQuickPick({ useSeparators: true }));
        const quickPickItems = this._getKernelPickerQuickPickItems(notebook, matchResult, this._notebookKernelService, scopedContextKeyService);
        if (quickPickItems.length === 1 && supportAutoRun(quickPickItems[0]) && !skipAutoRun) {
            const picked = await this._handleQuickPick(editor, quickPickItems[0], quickPickItems);
            localDisposableStore.dispose();
            return picked;
        }
        quickPick.items = quickPickItems;
        quickPick.canSelectMany = false;
        quickPick.placeholder = selected
            ? localize('prompt.placeholder.change', "Change kernel for '{0}'", this._labelService.getUriLabel(notebook.uri, { relative: true }))
            : localize('prompt.placeholder.select', "Select kernel for '{0}'", this._labelService.getUriLabel(notebook.uri, { relative: true }));
        quickPick.busy = this._notebookKernelService.getKernelDetectionTasks(notebook).length > 0;
        const kernelDetectionTaskListener = this._notebookKernelService.onDidChangeKernelDetectionTasks(() => {
            quickPick.busy = this._notebookKernelService.getKernelDetectionTasks(notebook).length > 0;
        });
        // run extension recommendataion task if quickPickItems is empty
        const extensionRecommendataionPromise = quickPickItems.length === 0
            ? createCancelablePromise(token => this._showInstallKernelExtensionRecommendation(notebook, quickPick, this._extensionWorkbenchService, token))
            : undefined;
        const kernelChangeEventListener = Event.debounce(Event.any(this._notebookKernelService.onDidChangeSourceActions, this._notebookKernelService.onDidAddKernel, this._notebookKernelService.onDidRemoveKernel, this._notebookKernelService.onDidChangeNotebookAffinity), (last, _current) => last, KERNEL_PICKER_UPDATE_DEBOUNCE)(async () => {
            // reset quick pick progress
            quickPick.busy = false;
            extensionRecommendataionPromise?.cancel();
            const currentActiveItems = quickPick.activeItems;
            const matchResult = this._getMatchingResult(notebook);
            const quickPickItems = this._getKernelPickerQuickPickItems(notebook, matchResult, this._notebookKernelService, scopedContextKeyService);
            quickPick.keepScrollPosition = true;
            // recalcuate active items
            const activeItems = [];
            for (const item of currentActiveItems) {
                if (isKernelPick(item)) {
                    const kernelId = item.kernel.id;
                    const sameItem = quickPickItems.find(pi => isKernelPick(pi) && pi.kernel.id === kernelId);
                    if (sameItem) {
                        activeItems.push(sameItem);
                    }
                }
                else if (isSourcePick(item)) {
                    const sameItem = quickPickItems.find(pi => isSourcePick(pi) && pi.action.action.id === item.action.action.id);
                    if (sameItem) {
                        activeItems.push(sameItem);
                    }
                }
            }
            quickPick.items = quickPickItems;
            quickPick.activeItems = activeItems;
        }, this);
        const pick = await new Promise((resolve, reject) => {
            localDisposableStore.add(quickPick.onDidAccept(() => {
                const item = quickPick.selectedItems[0];
                if (item) {
                    resolve({ selected: item, items: quickPick.items });
                }
                else {
                    resolve({ selected: undefined, items: quickPick.items });
                }
                quickPick.hide();
            }));
            localDisposableStore.add(quickPick.onDidHide(() => {
                kernelDetectionTaskListener.dispose();
                kernelChangeEventListener.dispose();
                quickPick.dispose();
                resolve({ selected: undefined, items: quickPick.items });
            }));
            quickPick.show();
        });
        localDisposableStore.dispose();
        if (pick.selected) {
            return await this._handleQuickPick(editor, pick.selected, pick.items);
        }
        return false;
    }
    _getMatchingResult(notebook) {
        return this._notebookKernelService.getMatchingKernel(notebook);
    }
    async _handleQuickPick(editor, pick, quickPickItems) {
        if (isKernelPick(pick)) {
            const newKernel = pick.kernel;
            this._selecteKernel(editor.textModel, newKernel);
            return true;
        }
        // actions
        if (isSearchMarketplacePick(pick)) {
            await this._showKernelExtension(this._extensionWorkbenchService, this._extensionService, this._extensionManagementServerService, editor.textModel.viewType, []);
            // suggestedExtension must be defined for this option to be shown, but still check to make TS happy
        }
        else if (isInstallExtensionPick(pick)) {
            await this._showKernelExtension(this._extensionWorkbenchService, this._extensionService, this._extensionManagementServerService, editor.textModel.viewType, pick.extensionIds, this._productService.quality !== 'stable');
        }
        else if (isSourcePick(pick)) {
            // selected explicilty, it should trigger the execution?
            pick.action.runAction();
        }
        return true;
    }
    _selecteKernel(notebook, kernel) {
        this._notebookKernelService.selectKernelForNotebook(kernel, notebook);
    }
    async _showKernelExtension(extensionWorkbenchService, extensionService, extensionManagementServerService, viewType, extIds, isInsiders) {
        // If extension id is provided attempt to install the extension as the user has requested the suggested ones be installed
        const extensionsToInstall = [];
        const extensionsToInstallOnRemote = [];
        const extensionsToEnable = [];
        for (const extId of extIds) {
            const extension = (await extensionWorkbenchService.getExtensions([{ id: extId }], CancellationToken.None))[0];
            if (extension.enablementState === 10 /* EnablementState.DisabledGlobally */ || extension.enablementState === 11 /* EnablementState.DisabledWorkspace */ || extension.enablementState === 2 /* EnablementState.DisabledByEnvironment */) {
                extensionsToEnable.push(extension);
            }
            else if (!extensionWorkbenchService.installed.some(e => areSameExtensions(e.identifier, extension.identifier))) {
                // Install this extension only if it hasn't already been installed.
                const canInstall = await extensionWorkbenchService.canInstall(extension);
                if (canInstall === true) {
                    extensionsToInstall.push(extension);
                }
            }
            else if (extensionManagementServerService.remoteExtensionManagementServer) {
                // already installed, check if it should be installed on remote since we are not getting any kernels or kernel providers.
                if (extensionWorkbenchService.installed.some(e => areSameExtensions(e.identifier, extension.identifier) && e.server === extensionManagementServerService.remoteExtensionManagementServer)) {
                    // extension exists on remote server. should not happen
                    continue;
                }
                else {
                    // extension doesn't exist on remote server
                    const canInstall = await extensionWorkbenchService.canInstall(extension);
                    if (canInstall) {
                        extensionsToInstallOnRemote.push(extension);
                    }
                }
            }
        }
        if (extensionsToInstall.length || extensionsToEnable.length || extensionsToInstallOnRemote.length) {
            await Promise.all([...extensionsToInstall.map(async (extension) => {
                    await extensionWorkbenchService.install(extension, {
                        installPreReleaseVersion: isInsiders ?? false,
                        context: { skipWalkthrough: true },
                    }, 15 /* ProgressLocation.Notification */);
                }), ...extensionsToEnable.map(async (extension) => {
                    switch (extension.enablementState) {
                        case 11 /* EnablementState.DisabledWorkspace */:
                            await extensionWorkbenchService.setEnablement([extension], 13 /* EnablementState.EnabledWorkspace */);
                            return;
                        case 10 /* EnablementState.DisabledGlobally */:
                            await extensionWorkbenchService.setEnablement([extension], 12 /* EnablementState.EnabledGlobally */);
                            return;
                        case 2 /* EnablementState.DisabledByEnvironment */:
                            await extensionWorkbenchService.setEnablement([extension], 3 /* EnablementState.EnabledByEnvironment */);
                            return;
                        default:
                            break;
                    }
                }), ...extensionsToInstallOnRemote.map(async (extension) => {
                    await extensionWorkbenchService.installInServer(extension, this._extensionManagementServerService.remoteExtensionManagementServer);
                })]);
            await extensionService.activateByEvent(`onNotebook:${viewType}`);
            return;
        }
        const pascalCased = viewType.split(/[^a-z0-9]/ig).map(uppercaseFirstLetter).join('');
        await extensionWorkbenchService.openSearch(`@tag:notebookKernel${pascalCased}`);
    }
    async _showInstallKernelExtensionRecommendation(notebookTextModel, quickPick, extensionWorkbenchService, token) {
        quickPick.busy = true;
        const newQuickPickItems = await this._getKernelRecommendationsQuickPickItems(notebookTextModel, extensionWorkbenchService);
        quickPick.busy = false;
        if (token.isCancellationRequested) {
            return;
        }
        if (newQuickPickItems && quickPick.items.length === 0) {
            quickPick.items = newQuickPickItems;
        }
    }
    async _getKernelRecommendationsQuickPickItems(notebookTextModel, extensionWorkbenchService) {
        const quickPickItems = [];
        const language = this.getSuggestedLanguage(notebookTextModel);
        const suggestedExtension = language ? this.getSuggestedKernelFromLanguage(notebookTextModel.viewType, language) : undefined;
        if (suggestedExtension) {
            await extensionWorkbenchService.queryLocal();
            const extensions = extensionWorkbenchService.installed.filter(e => (e.enablementState === 3 /* EnablementState.EnabledByEnvironment */ || e.enablementState === 12 /* EnablementState.EnabledGlobally */ || e.enablementState === 13 /* EnablementState.EnabledWorkspace */)
                && suggestedExtension.extensionIds.includes(e.identifier.id));
            if (extensions.length === suggestedExtension.extensionIds.length) {
                // it's installed but might be detecting kernels
                return undefined;
            }
            // We have a suggested kernel, show an option to install it
            quickPickItems.push({
                id: 'installSuggested',
                description: suggestedExtension.displayName ?? suggestedExtension.extensionIds.join(', '),
                label: `$(${Codicon.lightbulb.id}) ` + localize('installSuggestedKernel', 'Install/Enable suggested extensions'),
                extensionIds: suggestedExtension.extensionIds
            });
        }
        // there is no kernel, show the install from marketplace
        quickPickItems.push({
            id: 'install',
            label: localize('searchForKernels', "Browse marketplace for kernel extensions"),
        });
        return quickPickItems;
    }
    /**
     * Examine the most common language in the notebook
     * @param notebookTextModel The notebook text model
     * @returns What the suggested language is for the notebook. Used for kernal installing
     */
    getSuggestedLanguage(notebookTextModel) {
        const metaData = notebookTextModel.metadata;
        const language_info = metaData?.metadata?.language_info;
        let suggestedKernelLanguage = language_info?.name;
        // TODO how do we suggest multi language notebooks?
        if (!suggestedKernelLanguage) {
            const cellLanguages = notebookTextModel.cells.map(cell => cell.language).filter(language => language !== 'markdown');
            // Check if cell languages is all the same
            if (cellLanguages.length > 1) {
                const firstLanguage = cellLanguages[0];
                if (cellLanguages.every(language => language === firstLanguage)) {
                    suggestedKernelLanguage = firstLanguage;
                }
            }
        }
        return suggestedKernelLanguage;
    }
    /**
     * Given a language and notebook view type suggest a kernel for installation
     * @param language The language to find a suggested kernel extension for
     * @returns A recommednation object for the recommended extension, else undefined
     */
    getSuggestedKernelFromLanguage(viewType, language) {
        const recommendation = KERNEL_RECOMMENDATIONS.get(viewType)?.get(language);
        return recommendation;
    }
}
let KernelPickerMRUStrategy = class KernelPickerMRUStrategy extends KernelPickerStrategyBase {
    constructor(_notebookKernelService, _productService, _quickInputService, _labelService, _logService, _extensionWorkbenchService, _extensionService, _extensionManagementServerService, _commandService, _notebookKernelHistoryService, _openerService) {
        super(_notebookKernelService, _productService, _quickInputService, _labelService, _logService, _extensionWorkbenchService, _extensionService, _commandService, _extensionManagementServerService);
        this._notebookKernelHistoryService = _notebookKernelHistoryService;
        this._openerService = _openerService;
    }
    _getKernelPickerQuickPickItems(notebookTextModel, matchResult, notebookKernelService, scopedContextKeyService) {
        const quickPickItems = [];
        if (matchResult.selected) {
            const kernelItem = toKernelQuickPick(matchResult.selected, matchResult.selected);
            quickPickItems.push(kernelItem);
        }
        matchResult.suggestions.filter(kernel => kernel.id !== matchResult.selected?.id).map(kernel => toKernelQuickPick(kernel, matchResult.selected))
            .forEach(kernel => {
            quickPickItems.push(kernel);
        });
        const shouldAutoRun = quickPickItems.length === 0;
        if (quickPickItems.length > 0) {
            quickPickItems.push({
                type: 'separator'
            });
        }
        // select another kernel quick pick
        quickPickItems.push({
            id: 'selectAnother',
            label: localize('selectAnotherKernel.more', "Select Another Kernel..."),
            autoRun: shouldAutoRun
        });
        return quickPickItems;
    }
    _selecteKernel(notebook, kernel) {
        const currentInfo = this._notebookKernelService.getMatchingKernel(notebook);
        if (currentInfo.selected) {
            // there is already a selected kernel
            this._notebookKernelHistoryService.addMostRecentKernel(currentInfo.selected);
        }
        super._selecteKernel(notebook, kernel);
        this._notebookKernelHistoryService.addMostRecentKernel(kernel);
    }
    _getMatchingResult(notebook) {
        const { selected, all } = this._notebookKernelHistoryService.getKernels(notebook);
        const matchingResult = this._notebookKernelService.getMatchingKernel(notebook);
        return {
            selected: selected,
            all: matchingResult.all,
            suggestions: all,
            hidden: []
        };
    }
    async _handleQuickPick(editor, pick, items) {
        if (pick.id === 'selectAnother') {
            return this.displaySelectAnotherQuickPick(editor, items.length === 1 && items[0] === pick);
        }
        return super._handleQuickPick(editor, pick, items);
    }
    async displaySelectAnotherQuickPick(editor, kernelListEmpty) {
        const notebook = editor.textModel;
        const disposables = new DisposableStore();
        const quickPick = disposables.add(this._quickInputService.createQuickPick({ useSeparators: true }));
        const quickPickItem = await new Promise(resolve => {
            // select from kernel sources
            quickPick.title = kernelListEmpty ? localize('select', "Select Kernel") : localize('selectAnotherKernel', "Select Another Kernel");
            quickPick.placeholder = localize('selectKernel.placeholder', "Type to choose a kernel source");
            quickPick.busy = true;
            quickPick.buttons = [this._quickInputService.backButton];
            quickPick.show();
            disposables.add(quickPick.onDidTriggerButton(button => {
                if (button === this._quickInputService.backButton) {
                    resolve(button);
                }
            }));
            disposables.add(quickPick.onDidTriggerItemButton(async (e) => {
                if (isKernelSourceQuickPickItem(e.item) && e.item.documentation !== undefined) {
                    const uri = URI.isUri(e.item.documentation) ? URI.parse(e.item.documentation) : await this._commandService.executeCommand(e.item.documentation);
                    if (uri) {
                        void this._openerService.open(uri, { openExternal: true });
                    }
                }
            }));
            disposables.add(quickPick.onDidAccept(async () => {
                resolve(quickPick.selectedItems[0]);
            }));
            disposables.add(quickPick.onDidHide(() => {
                resolve(undefined);
            }));
            this._calculdateKernelSources(editor).then(quickPickItems => {
                quickPick.items = quickPickItems;
                if (quickPick.items.length > 0) {
                    quickPick.busy = false;
                }
            });
            disposables.add(Event.debounce(Event.any(this._notebookKernelService.onDidChangeSourceActions, this._notebookKernelService.onDidAddKernel, this._notebookKernelService.onDidRemoveKernel), (last, _current) => last, KERNEL_PICKER_UPDATE_DEBOUNCE)(async () => {
                quickPick.busy = true;
                const quickPickItems = await this._calculdateKernelSources(editor);
                quickPick.items = quickPickItems;
                quickPick.busy = false;
            }));
        });
        quickPick.hide();
        disposables.dispose();
        if (quickPickItem === this._quickInputService.backButton) {
            return this.showQuickPick(editor, undefined, true);
        }
        if (quickPickItem) {
            const selectedKernelPickItem = quickPickItem;
            if (isKernelSourceQuickPickItem(selectedKernelPickItem)) {
                try {
                    const selectedKernelId = await this._executeCommand(notebook, selectedKernelPickItem.command);
                    if (selectedKernelId) {
                        const { all } = await this._getMatchingResult(notebook);
                        const kernel = all.find(kernel => kernel.id === `ms-toolsai.jupyter/${selectedKernelId}`);
                        if (kernel) {
                            await this._selecteKernel(notebook, kernel);
                            return true;
                        }
                        return true;
                    }
                    else {
                        return this.displaySelectAnotherQuickPick(editor, false);
                    }
                }
                catch (ex) {
                    return false;
                }
            }
            else if (isKernelPick(selectedKernelPickItem)) {
                await this._selecteKernel(notebook, selectedKernelPickItem.kernel);
                return true;
            }
            else if (isGroupedKernelsPick(selectedKernelPickItem)) {
                await this._selectOneKernel(notebook, selectedKernelPickItem.label, selectedKernelPickItem.kernels);
                return true;
            }
            else if (isSourcePick(selectedKernelPickItem)) {
                // selected explicilty, it should trigger the execution?
                try {
                    await selectedKernelPickItem.action.runAction();
                    return true;
                }
                catch (ex) {
                    return false;
                }
            }
            else if (isSearchMarketplacePick(selectedKernelPickItem)) {
                await this._showKernelExtension(this._extensionWorkbenchService, this._extensionService, this._extensionManagementServerService, editor.textModel.viewType, []);
                return true;
            }
            else if (isInstallExtensionPick(selectedKernelPickItem)) {
                await this._showKernelExtension(this._extensionWorkbenchService, this._extensionService, this._extensionManagementServerService, editor.textModel.viewType, selectedKernelPickItem.extensionIds, this._productService.quality !== 'stable');
                return this.displaySelectAnotherQuickPick(editor, false);
            }
        }
        return false;
    }
    async _calculdateKernelSources(editor) {
        const notebook = editor.textModel;
        const sourceActionCommands = this._notebookKernelService.getSourceActions(notebook, editor.scopedContextKeyService);
        const actions = await this._notebookKernelService.getKernelSourceActions2(notebook);
        const matchResult = this._getMatchingResult(notebook);
        if (sourceActionCommands.length === 0 && matchResult.all.length === 0 && actions.length === 0) {
            return await this._getKernelRecommendationsQuickPickItems(notebook, this._extensionWorkbenchService) ?? [];
        }
        const others = matchResult.all.filter(item => item.extension.value !== JUPYTER_EXTENSION_ID);
        const quickPickItems = [];
        // group controllers by extension
        for (const group of groupBy(others, (a, b) => a.extension.value === b.extension.value ? 0 : 1)) {
            const extension = this._extensionService.extensions.find(extension => extension.identifier.value === group[0].extension.value);
            const source = extension?.displayName ?? extension?.description ?? group[0].extension.value;
            if (group.length > 1) {
                quickPickItems.push({
                    label: source,
                    kernels: group
                });
            }
            else {
                quickPickItems.push({
                    label: group[0].label,
                    kernel: group[0]
                });
            }
        }
        const validActions = actions.filter(action => action.command);
        quickPickItems.push(...validActions.map(action => {
            const buttons = action.documentation ? [{
                    iconClass: ThemeIcon.asClassName(Codicon.info),
                    tooltip: localize('learnMoreTooltip', 'Learn More'),
                }] : [];
            return {
                id: typeof action.command === 'string' ? action.command : action.command.id,
                label: action.label,
                description: action.description,
                command: action.command,
                documentation: action.documentation,
                buttons
            };
        }));
        for (const sourceAction of sourceActionCommands) {
            const res = {
                action: sourceAction,
                picked: false,
                label: sourceAction.action.label,
                tooltip: sourceAction.action.tooltip
            };
            quickPickItems.push(res);
        }
        return quickPickItems;
    }
    async _selectOneKernel(notebook, source, kernels) {
        const quickPickItems = kernels.map(kernel => toKernelQuickPick(kernel, undefined));
        const localDisposableStore = new DisposableStore();
        const quickPick = localDisposableStore.add(this._quickInputService.createQuickPick({ useSeparators: true }));
        quickPick.items = quickPickItems;
        quickPick.canSelectMany = false;
        quickPick.title = localize('selectKernelFromExtension', "Select Kernel from {0}", source);
        localDisposableStore.add(quickPick.onDidAccept(async () => {
            if (quickPick.selectedItems && quickPick.selectedItems.length > 0 && isKernelPick(quickPick.selectedItems[0])) {
                await this._selecteKernel(notebook, quickPick.selectedItems[0].kernel);
            }
            quickPick.hide();
            quickPick.dispose();
        }));
        localDisposableStore.add(quickPick.onDidHide(() => {
            localDisposableStore.dispose();
        }));
        quickPick.show();
    }
    async _executeCommand(notebook, command) {
        const id = typeof command === 'string' ? command : command.id;
        const args = typeof command === 'string' ? [] : command.arguments ?? [];
        if (typeof command === 'string' || !command.arguments || !Array.isArray(command.arguments) || command.arguments.length === 0) {
            args.unshift({
                uri: notebook.uri,
                $mid: 14 /* MarshalledId.NotebookActionContext */
            });
        }
        if (typeof command === 'string') {
            return this._commandService.executeCommand(id);
        }
        else {
            return this._commandService.executeCommand(id, ...args);
        }
    }
    static updateKernelStatusAction(notebook, action, notebookKernelService, notebookKernelHistoryService) {
        const detectionTasks = notebookKernelService.getKernelDetectionTasks(notebook);
        if (detectionTasks.length) {
            const info = notebookKernelService.getMatchingKernel(notebook);
            action.enabled = true;
            action.class = ThemeIcon.asClassName(ThemeIcon.modify(executingStateIcon, 'spin'));
            if (info.selected) {
                action.label = info.selected.label;
                const kernelInfo = info.selected.description ?? info.selected.detail;
                action.tooltip = kernelInfo
                    ? localize('kernels.selectedKernelAndKernelDetectionRunning', "Selected Kernel: {0} (Kernel Detection Tasks Running)", kernelInfo)
                    : localize('kernels.detecting', "Detecting Kernels");
            }
            else {
                action.label = localize('kernels.detecting', "Detecting Kernels");
            }
            return;
        }
        const runningActions = notebookKernelService.getRunningSourceActions(notebook);
        const updateActionFromSourceAction = (sourceAction, running) => {
            const sAction = sourceAction.action;
            action.class = running ? ThemeIcon.asClassName(ThemeIcon.modify(executingStateIcon, 'spin')) : ThemeIcon.asClassName(selectKernelIcon);
            action.label = sAction.label;
            action.enabled = true;
        };
        if (runningActions.length) {
            return updateActionFromSourceAction(runningActions[0] /** TODO handle multiple actions state */, true);
        }
        const { selected } = notebookKernelHistoryService.getKernels(notebook);
        if (selected) {
            action.label = selected.label;
            action.class = ThemeIcon.asClassName(selectKernelIcon);
            action.tooltip = selected.description ?? selected.detail ?? '';
        }
        else {
            action.label = localize('select', "Select Kernel");
            action.class = ThemeIcon.asClassName(selectKernelIcon);
            action.tooltip = '';
        }
    }
    static async resolveKernel(notebook, notebookKernelService, notebookKernelHistoryService, commandService) {
        const alreadySelected = notebookKernelHistoryService.getKernels(notebook);
        if (alreadySelected.selected) {
            return alreadySelected.selected;
        }
        await commandService.executeCommand(SELECT_KERNEL_ID);
        const { selected } = notebookKernelHistoryService.getKernels(notebook);
        return selected;
    }
};
KernelPickerMRUStrategy = __decorate([
    __param(0, INotebookKernelService),
    __param(1, IProductService),
    __param(2, IQuickInputService),
    __param(3, ILabelService),
    __param(4, ILogService),
    __param(5, IExtensionsWorkbenchService),
    __param(6, IExtensionService),
    __param(7, IExtensionManagementServerService),
    __param(8, ICommandService),
    __param(9, INotebookKernelHistoryService),
    __param(10, IOpenerService)
], KernelPickerMRUStrategy);
export { KernelPickerMRUStrategy };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tLZXJuZWxRdWlja1BpY2tTdHJhdGVneS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlld1BhcnRzL25vdGVib29rS2VybmVsUXVpY2tQaWNrU3RyYXRlZ3kudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRTFFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRTdFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFFdEYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFFM0YsT0FBTyxFQUFxQixrQkFBa0IsRUFBOEMsTUFBTSx5REFBeUQsQ0FBQztBQUM1SixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEUsT0FBTyxFQUFjLDJCQUEyQixFQUFFLE1BQU0s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