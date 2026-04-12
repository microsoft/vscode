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
var TrustedUriActionsColumnRenderer_1, TrustedUriPathColumnRenderer_1, TrustedUriHostColumnRenderer_1, WorkspaceTrustEditor_1;
import { $, addDisposableListener, addStandardDisposableListener, append, clearNode, EventHelper, EventType, isAncestorOfActiveElement } from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { ButtonBar } from '../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { debounce } from '../../../../base/common/decorators.js';
import { Emitter } from '../../../../base/common/event.js';
import { normalizeDriveLetter } from '../../../../base/common/labels.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { parseLinkedText } from '../../../../base/common/linkedText.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchTable } from '../../../../platform/list/browser/listService.js';
import { Link } from '../../../../platform/opener/browser/link.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { isVirtualResource, isVirtualWorkspace } from '../../../../platform/workspace/common/virtualWorkspace.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { asCssVariable, buttonBackground, buttonSecondaryBackground, editorErrorForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { IWorkspaceContextService, toWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { debugIconStartForeground } from '../../debug/browser/debugColors.js';
import { IExtensionsWorkbenchService, LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID } from '../../extensions/common/extensions.js';
import { APPLICATION_SCOPES, IWorkbenchConfigurationService } from '../../../services/configuration/common/configuration.js';
import { IExtensionManifestPropertiesService } from '../../../services/extensions/common/extensionManifestPropertiesService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { getExtensionDependencies } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { posix, win32 } from '../../../../base/common/path.js';
import { hasDriveLetter, toSlashes } from '../../../../base/common/extpath.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { basename, dirname } from '../../../../base/common/resources.js';
export const shieldIcon = registerIcon('workspace-trust-banner', Codicon.shield, localize('shieldIcon', 'Icon for workspace trust ion the banner.'));
const checkListIcon = registerIcon('workspace-trust-editor-check', Codicon.check, localize('checkListIcon', 'Icon for the checkmark in the workspace trust editor.'));
const xListIcon = registerIcon('workspace-trust-editor-cross', Codicon.x, localize('xListIcon', 'Icon for the cross in the workspace trust editor.'));
const folderPickerIcon = registerIcon('workspace-trust-editor-folder-picker', Codicon.folder, localize('folderPickerIcon', 'Icon for the pick folder icon in the workspace trust editor.'));
const editIcon = registerIcon('workspace-trust-editor-edit-folder', Codicon.edit, localize('editIcon', 'Icon for the edit folder icon in the workspace trust editor.'));
const removeIcon = registerIcon('workspace-trust-editor-remove-folder', Codicon.close, localize('removeIcon', 'Icon for the remove folder icon in the workspace trust editor.'));
let WorkspaceTrustedUrisTable = class WorkspaceTrustedUrisTable extends Disposable {
    constructor(container, instantiationService, workspaceService, workspaceTrustManagementService, uriService, labelService, fileDialogService) {
        super();
        this.container = container;
        this.instantiationService = instantiationService;
        this.workspaceService = workspaceService;
        this.workspaceTrustManagementService = workspaceTrustManagementService;
        this.uriService = uriService;
        this.labelService = labelService;
        this.fileDialogService = fileDialogService;
        this._onDidAcceptEdit = this._register(new Emitter());
        this.onDidAcceptEdit = this._onDidAcceptEdit.event;
        this._onDidRejectEdit = this._register(new Emitter());
        this.onDidRejectEdit = this._onDidRejectEdit.event;
        this._onEdit = this._register(new Emitter());
        this.onEdit = this._onEdit.event;
        this._onDelete = this._register(new Emitter());
        this.onDelete = this._onDelete.event;
        this.descriptionElement = container.appendChild($('.workspace-trusted-folders-description'));
        const tableElement = container.appendChild($('.trusted-uris-table'));
        const addButtonBarElement = container.appendChild($('.trusted-uris-button-bar'));
        this.table = this.instantiationService.createInstance(WorkbenchTable, 'WorkspaceTrust', tableElement, new TrustedUriTableVirtualDelegate(), [
            {
                label: localize('hostColumnLabel', "Host"),
                tooltip: '',
                weight: 1,
                templateId: TrustedUriHostColumnRenderer.TEMPLATE_ID,
                project(row) { return row; }
            },
            {
                label: localize('pathColumnLabel', "Path"),
                tooltip: '',
                weight: 8,
                templateId: TrustedUriPathColumnRenderer.TEMPLATE_ID,
                project(row) { return row; }
            },
            {
                label: '',
                tooltip: '',
                weight: 1,
                minimumWidth: 75,
                maximumWidth: 75,
                templateId: TrustedUriActionsColumnRenderer.TEMPLATE_ID,
                project(row) { return row; }
            },
        ], [
            this.instantiationService.createInstance(TrustedUriHostColumnRenderer),
            this.instantiationService.createInstance(TrustedUriPathColumnRenderer, this),
            this.instantiationService.createInstance(TrustedUriActionsColumnRenderer, this, this.currentWorkspaceUri),
        ], {
            horizontalScrolling: false,
            alwaysConsumeMouseWheel: false,
            openOnSingleClick: false,
            multipleSelectionSupport: false,
            accessibilityProvider: {
                getAriaLabel: (item) => {
                    const hostLabel = getHostLabel(this.labelService, item);
                    if (hostLabel === undefined || hostLabel.length === 0) {
                        return localize('trustedFolderAriaLabel', "{0}, trusted", this.labelService.getUriLabel(item.uri));
                    }
                    return localize('trustedFolderWithHostAriaLabel', "{0} on {1}, trusted", this.labelService.getUriLabel(item.uri), hostLabel);
                },
                getWidgetAriaLabel: () => localize('trustedFoldersAndWorkspaces', "Trusted Folders & Workspaces")
            },
            identityProvider: {
                getId(element) {
                    return element.uri.toString();
                },
            }
        });
        this._register(this.table.onDidOpen(item => {
            // default prevented when input box is double clicked #125052
            if (item && item.element && !item.browserEvent?.defaultPrevented) {
                this.edit(item.element, true);
            }
        }));
        const buttonBar = this._register(new ButtonBar(addButtonBarElement));
        const addButton = this._register(buttonBar.addButton({ title: localize('addButton', "Add Folder"), ...defaultButtonStyles }));
        addButton.label = localize('addButton', "Add Folder");
        this._register(addButton.onDidClick(async () => {
            const uri = await this.fileDialogService.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                defaultUri: this.currentWorkspaceUri,
                openLabel: localize('trustUri', "Trust Folder"),
                title: localize('selectTrustedUri', "Select Folder To Trust")
            });
            if (uri) {
                this.workspaceTrustManagementService.setUrisTrust(uri, true);
            }
        }));
        this._register(this.workspaceTrustManagementService.onDidChangeTrustedFolders(() => {
            this.updateTable();
        }));
    }
    getIndexOfTrustedUriEntry(item) {
        const index = this.trustedUriEntries.indexOf(item);
        if (index === -1) {
            for (let i = 0; i < this.trustedUriEntries.length; i++) {
                if (this.trustedUriEntries[i].uri === item.uri) {
                    return i;
                }
            }
        }
        return index;
    }
    selectTrustedUriEntry(item, focus = true) {
        const index = this.getIndexOfTrustedUriEntry(item);
        if (index !== -1) {
            if (focus) {
                this.table.domFocus();
                this.table.setFocus([index]);
            }
            this.table.setSelection([index]);
        }
    }
    get currentWorkspaceUri() {
        return this.workspaceService.getWorkspace().folders[0]?.uri || URI.file('/');
    }
    get trustedUriEntries() {
        const currentWorkspace = this.workspaceService.getWorkspace();
        const currentWorkspaceUris = currentWorkspace.folders.map(folder => folder.uri);
        if (currentWorkspace.configuration) {
            currentWorkspaceUris.push(currentWorkspace.configuration);
        }
        const entries = this.workspaceTrustManagementService.getTrustedUris().map(uri => {
            let relatedToCurrentWorkspace = false;
            for (const workspaceUri of currentWorkspaceUris) {
                relatedToCurrentWorkspace = relatedToCurrentWorkspace || this.uriService.extUri.isEqualOrParent(workspaceUri, uri);
            }
            return {
                uri,
                parentOfWorkspaceItem: relatedToCurrentWorkspace
            };
        });
        // Sort entries
        const sortedEntries = entries.sort((a, b) => {
            if (a.uri.scheme !== b.uri.scheme) {
                if (a.uri.scheme === Schemas.file) {
                    return -1;
                }
                if (b.uri.scheme === Schemas.file) {
                    return 1;
                }
            }
            const aIsWorkspace = a.uri.path.endsWith('.code-workspace');
            const bIsWorkspace = b.uri.path.endsWith('.code-workspace');
            if (aIsWorkspace !== bIsWorkspace) {
                if (aIsWorkspace) {
                    return 1;
                }
                if (bIsWorkspace) {
                    return -1;
                }
            }
            return a.uri.fsPath.localeCompare(b.uri.fsPath);
        });
        return sortedEntries;
    }
    layout() {
        this.table.layout((this.trustedUriEntries.length * TrustedUriTableVirtualDelegate.ROW_HEIGHT) + TrustedUriTableVirtualDelegate.HEADER_ROW_HEIGHT, undefined);
    }
    updateTable() {
        const entries = this.trustedUriEntries;
        this.container.classList.toggle('empty', entries.length === 0);
        this.descriptionElement.innerText = entries.length ?
            localize('trustedFoldersDescription', "You trust the following folders, their subfolders, and workspace files.") :
            localize('noTrustedFoldersDescriptions', "You haven't trusted any folders or workspace files yet.");
        this.table.splice(0, Number.POSITIVE_INFINITY, this.trustedUriEntries);
        this.layout();
    }
    validateUri(path, item) {
        if (!item) {
            return null;
        }
        if (item.uri.scheme === 'vscode-vfs') {
            const segments = path.split(posix.sep).filter(s => s.length);
            if (segments.length === 0 && path.startsWith(posix.sep)) {
                return {
                    type: 2 /* MessageType.WARNING */,
                    content: localize({ key: 'trustAll', comment: ['The {0} will be a host name where repositories are hosted.'] }, "You will trust all repositories on {0}.", getHostLabel(this.labelService, item))
                };
            }
            if (segments.length === 1) {
                return {
                    type: 2 /* MessageType.WARNING */,
                    content: localize({ key: 'trustOrg', comment: ['The {0} will be an organization or user name.', 'The {1} will be a host name where repositories are hosted.'] }, "You will trust all repositories and forks under '{0}' on {1}.", segments[0], getHostLabel(this.labelService, item))
                };
            }
            if (segments.length > 2) {
                return {
                    type: 3 /* MessageType.ERROR */,
                    content: localize('invalidTrust', "You cannot trust individual folders within a repository.", path)
                };
            }
        }
        return null;
    }
    acceptEdit(item, uri) {
        const trustedFolders = this.workspaceTrustManagementService.getTrustedUris();
        const index = trustedFolders.findIndex(u => this.uriService.extUri.isEqual(u, item.uri));
        if (index >= trustedFolders.length || index === -1) {
            trustedFolders.push(uri);
        }
        else {
            trustedFolders[index] = uri;
        }
        this.workspaceTrustManagementService.setTrustedUris(trustedFolders);
        this._onDidAcceptEdit.fire(item);
    }
    rejectEdit(item) {
        this._onDidRejectEdit.fire(item);
    }
    async delete(item) {
        this.table.focusNext();
        await this.workspaceTrustManagementService.setUrisTrust([item.uri], false);
        if (this.table.getFocus().length === 0) {
            this.table.focusLast();
        }
        this._onDelete.fire(item);
        this.table.domFocus();
    }
    async edit(item, usePickerIfPossible) {
        const canUseOpenDialog = item.uri.scheme === Schemas.file ||
            (item.uri.scheme === this.currentWorkspaceUri.scheme &&
                this.uriService.extUri.isEqualAuthority(this.currentWorkspaceUri.authority, item.uri.authority) &&
                !isVirtualResource(item.uri));
        if (canUseOpenDialog && usePickerIfPossible) {
            const uri = await this.fileDialogService.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                defaultUri: item.uri,
                openLabel: localize('trustUri', "Trust Folder"),
                title: localize('selectTrustedUri', "Select Folder To Trust")
            });
            if (uri) {
                this.acceptEdit(item, uri[0]);
            }
            else {
                this.rejectEdit(item);
            }
        }
        else {
            this.selectTrustedUriEntry(item);
            this._onEdit.fire(item);
        }
    }
};
WorkspaceTrustedUrisTable = __decorate([
    __param(1, IInstantiationService),
    __param(2, IWorkspaceContextService),
    __param(3, IWorkspaceTrustManagementService),
    __param(4, IUriIdentityService),
    __param(5, ILabelService),
    __param(6, IFileDialogService)
], WorkspaceTrustedUrisTable);
class TrustedUriTableVirtualDelegate {
    constructor() {
        this.headerRowHeight = TrustedUriTableVirtualDelegate.HEADER_ROW_HEIGHT;
    }
    static { this.HEADER_ROW_HEIGHT = 30; }
    static { this.ROW_HEIGHT = 24; }
    getHeight(item) {
        return TrustedUriTableVirtualDelegate.ROW_HEIGHT;
    }
}
let TrustedUriActionsColumnRenderer = class TrustedUriActionsColumnRenderer {
    static { TrustedUriActionsColumnRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'actions'; }
    constructor(table, currentWorkspaceUri, uriService) {
        this.table = table;
        this.currentWorkspaceUri = currentWorkspaceUri;
        this.uriService = uriService;
        this.templateId = TrustedUriActionsColumnRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const element = container.appendChild($('.actions'));
        const actionBar = new ActionBar(element);
        return { actionBar };
    }
    renderElement(item, index, templateData) {
        templateData.actionBar.clear();
        const canUseOpenDialog = item.uri.scheme === Schemas.file ||
            (item.uri.scheme === this.currentWorkspaceUri.scheme &&
                this.uriService.extUri.isEqualAuthority(this.currentWorkspaceUri.authority, item.uri.authority) &&
                !isVirtualResource(item.uri));
        const actions = [];
        if (canUseOpenDialog) {
            actions.push(this.createPickerAction(item));
        }
        actions.push(this.createEditAction(item));
        actions.push(this.createDeleteAction(item));
        templateData.actionBar.push(actions, { icon: true });
    }
    createEditAction(item) {
        return {
            label: '',
            class: ThemeIcon.asClassName(editIcon),
            enabled: true,
            id: 'editTrustedUri',
            tooltip: localize('editTrustedUri', "Edit Path"),
            run: () => {
                this.table.edit(item, false);
            }
        };
    }
    createPickerAction(item) {
        return {
            label: '',
            class: ThemeIcon.asClassName(folderPickerIcon),
            enabled: true,
            id: 'pickerTrustedUri',
            tooltip: localize('pickerTrustedUri', "Open File Picker"),
            run: () => {
                this.table.edit(item, true);
            }
        };
    }
    createDeleteAction(item) {
        return {
            label: '',
            class: ThemeIcon.asClassName(removeIcon),
            enabled: true,
            id: 'deleteTrustedUri',
            tooltip: localize('deleteTrustedUri', "Delete Path"),
            run: async () => {
                await this.table.delete(item);
            }
        };
    }
    disposeTemplate(templateData) {
        templateData.actionBar.dispose();
    }
};
TrustedUriActionsColumnRenderer = TrustedUriActionsColumnRenderer_1 = __decorate([
    __param(2, IUriIdentityService)
], TrustedUriActionsColumnRenderer);
let TrustedUriPathColumnRenderer = class TrustedUriPathColumnRenderer {
    static { TrustedUriPathColumnRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'path'; }
    constructor(table, contextViewService) {
        this.table = table;
        this.contextViewService = contextViewService;
        this.templateId = TrustedUriPathColumnRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const element = container.appendChild($('.path'));
        const pathLabel = element.appendChild($('div.path-label'));
        const pathInput = new InputBox(element, this.contextViewService, {
            validationOptions: {
                validation: value => this.table.validateUri(value, this.currentItem)
            },
            inputBoxStyles: defaultInputBoxStyles
        });
        const disposables = new DisposableStore();
        const renderDisposables = disposables.add(new DisposableStore());
        return {
            element,
            pathLabel,
            pathInput,
            disposables,
            renderDisposables
        };
    }
    renderElement(item, index, templateData) {
        templateData.renderDisposables.clear();
        this.currentItem = item;
        templateData.renderDisposables.add(this.table.onEdit(async (e) => {
            if (item === e) {
                templateData.element.classList.add('input-mode');
                templateData.pathInput.focus();
                templateData.pathInput.select();
                templateData.element.parentElement.style.paddingLeft = '0px';
            }
        }));
        // stop double click action from re-rendering the element on the table #125052
        templateData.renderDisposables.add(addDisposableListener(templateData.pathInput.element, EventType.DBLCLICK, e => {
            EventHelper.stop(e);
        }));
        const hideInputBox = () => {
            templateData.element.classList.remove('input-mode');
            templateData.element.parentElement.style.paddingLeft = '5px';
        };
        const accept = () => {
            hideInputBox();
            const pathToUse = templateData.pathInput.value;
            const uri = hasDriveLetter(pathToUse) ? item.uri.with({ path: posix.sep + toSlashes(pathToUse) }) : item.uri.with({ path: pathToUse });
            templateData.pathLabel.innerText = this.formatPath(uri);
            if (uri) {
                this.table.acceptEdit(item, uri);
            }
        };
        const reject = () => {
            hideInputBox();
            templateData.pathInput.value = stringValue;
            this.table.rejectEdit(item);
        };
        templateData.renderDisposables.add(addStandardDisposableListener(templateData.pathInput.inputElement, EventType.KEY_DOWN, e => {
            let handled = false;
            if (e.equals(3 /* KeyCode.Enter */)) {
                accept();
                handled = true;
            }
            else if (e.equals(9 /* KeyCode.Escape */)) {
                reject();
                handled = true;
            }
            if (handled) {
                e.preventDefault();
                e.stopPropagation();
            }
        }));
        templateData.renderDisposables.add((addDisposableListener(templateData.pathInput.inputElement, EventType.BLUR, () => {
            reject();
        })));
        const stringValue = this.formatPath(item.uri);
        templateData.pathInput.value = stringValue;
        templateData.pathLabel.innerText = stringValue;
        templateData.element.classList.toggle('current-workspace-parent', item.parentOfWorkspaceItem);
    }
    disposeTemplate(templateData) {
        templateData.disposables.dispose();
        templateData.renderDisposables.dispose();
    }
    formatPath(uri) {
        if (uri.scheme === Schemas.file) {
            return normalizeDriveLetter(uri.fsPath);
        }
        // If the path is not a file uri, but points to a windows remote, we should create windows fs path
        // e.g. /c:/user/directory => C:\user\directory
        if (uri.path.startsWith(posix.sep)) {
            const pathWithoutLeadingSeparator = uri.path.substring(1);
            const isWindowsPath = hasDriveLetter(pathWithoutLeadingSeparator, true);
            if (isWindowsPath) {
                return normalizeDriveLetter(win32.normalize(pathWithoutLeadingSeparator), true);
            }
        }
        return uri.path;
    }
};
TrustedUriPathColumnRenderer = TrustedUriPathColumnRenderer_1 = __decorate([
    __param(1, IContextViewService)
], TrustedUriPathColumnRenderer);
function getHostLabel(labelService, item) {
    return item.uri.authority ? labelService.getHostLabel(item.uri.scheme, item.uri.authority) : localize('localAuthority', "Local");
}
let TrustedUriHostColumnRenderer = class TrustedUriHostColumnRenderer {
    static { TrustedUriHostColumnRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'host'; }
    constructor(labelService) {
        this.labelService = labelService;
        this.templateId = TrustedUriHostColumnRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const disposables = new DisposableStore();
        const renderDisposables = disposables.add(new DisposableStore());
        const element = container.appendChild($('.host'));
        const hostContainer = element.appendChild($('div.host-label'));
        const buttonBarContainer = element.appendChild($('div.button-bar'));
        return {
            element,
            hostContainer,
            buttonBarContainer,
            disposables,
            renderDisposables
        };
    }
    renderElement(item, index, templateData) {
        templateData.renderDisposables.clear();
        templateData.renderDisposables.add({ dispose: () => { clearNode(templateData.buttonBarContainer); } });
        templateData.hostContainer.innerText = getHostLabel(this.labelService, item);
        templateData.element.classList.toggle('current-workspace-parent', item.parentOfWorkspaceItem);
        templateData.hostContainer.style.display = '';
        templateData.buttonBarContainer.style.display = 'none';
    }
    disposeTemplate(templateData) {
        templateData.disposables.dispose();
    }
};
TrustedUriHostColumnRenderer = TrustedUriHostColumnRenderer_1 = __decorate([
    __param(0, ILabelService)
], TrustedUriHostColumnRenderer);
let WorkspaceTrustEditor = class WorkspaceTrustEditor extends EditorPane {
    static { WorkspaceTrustEditor_1 = this; }
    static { this.ID = 'workbench.editor.workspaceTrust'; }
    constructor(group, telemetryService, themeService, storageService, workspaceService, extensionWorkbenchService, extensionManifestPropertiesService, instantiationService, workspaceTrustManagementService, configurationService, extensionEnablementService, productService, keybindingService) {
        super(WorkspaceTrustEditor_1.ID, group, telemetryService, themeService, storageService);
        this.workspaceService = workspaceService;
        this.extensionWorkbenchService = extensionWorkbenchService;
        this.extensionManifestPropertiesService = extensionManifestPropertiesService;
        this.instantiationService = instantiationService;
        this.workspaceTrustManagementService = workspaceTrustManagementService;
        this.configurationService = configurationService;
        this.extensionEnablementService = extensionEnablementService;
        this.productService = productService;
        this.keybindingService = keybindingService;
        this.rendering = false;
        this.rerenderDisposables = this._register(new DisposableStore());
        this.layoutParticipants = [];
    }
    createEditor(parent) {
        this.rootElement = append(parent, $('.workspace-trust-editor', { tabindex: '0' }));
        this.createHeaderElement(this.rootElement);
        const scrollableContent = $('.workspace-trust-editor-body');
        this.bodyScrollBar = this._register(new DomScrollableElement(scrollableContent, {
            horizontal: 2 /* ScrollbarVisibility.Hidden */,
            vertical: 1 /* ScrollbarVisibility.Auto */,
        }));
        append(this.rootElement, this.bodyScrollBar.getDomNode());
        this.createAffectedFeaturesElement(scrollableContent);
        this.createConfigurationElement(scrollableContent);
        this.rootElement.style.setProperty('--workspace-trust-selected-color', asCssVariable(buttonBackground));
        this.rootElement.style.setProperty('--workspace-trust-unselected-color', asCssVariable(buttonSecondaryBackground));
        this.rootElement.style.setProperty('--workspace-trust-check-color', asCssVariable(debugIconStartForeground));
        this.rootElement.style.setProperty('--workspace-trust-x-color', asCssVariable(editorErrorForeground));
        // Navigate page with keyboard
        this._register(addDisposableListener(this.rootElement, EventType.KEY_DOWN, e => {
            const event = new StandardKeyboardEvent(e);
            if (event.equals(16 /* KeyCode.UpArrow */) || event.equals(18 /* KeyCode.DownArrow */)) {
                const navOrder = [this.headerContainer, this.trustedContainer, this.untrustedContainer, this.configurationContainer];
                const currentIndex = navOrder.findIndex(element => {
                    return isAncestorOfActiveElement(element);
                });
                let newIndex = currentIndex;
                if (event.equals(18 /* KeyCode.DownArrow */)) {
                    newIndex++;
                }
                else if (event.equals(16 /* KeyCode.UpArrow */)) {
                    newIndex = Math.max(0, newIndex);
                    newIndex--;
                }
                newIndex += navOrder.length;
                newIndex %= navOrder.length;
                navOrder[newIndex].focus();
            }
            else if (event.equals(9 /* KeyCode.Escape */)) {
                this.rootElement.focus();
            }
            else if (event.equals(2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */)) {
                if (this.workspaceTrustManagementService.canSetWorkspaceTrust()) {
                    this.workspaceTrustManagementService.setWorkspaceTrust(!this.workspaceTrustManagementService.isWorkspaceTrusted());
                }
            }
            else if (event.equals(2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */)) {
                if (this.workspaceTrustManagementService.canSetParentFolderTrust()) {
                    this.workspaceTrustManagementService.setParentFolderTrust(true);
                }
            }
        }));
    }
    focus() {
        super.focus();
        this.rootElement.focus();
    }
    async setInput(input, options, context, token) {
        await super.setInput(input, options, context, token);
        if (token.isCancellationRequested) {
            return;
        }
        await this.workspaceTrustManagementService.workspaceTrustInitialized;
        this.registerListeners();
        await this.render();
    }
    registerListeners() {
        this._register(this.extensionWorkbenchService.onChange(() => this.render()));
        this._register(this.configurationService.onDidChangeRestrictedSettings(() => this.render()));
        this._register(this.workspaceTrustManagementService.onDidChangeTrust(() => this.render()));
        this._register(this.workspaceTrustManagementService.onDidChangeTrustedFolders(() => this.render()));
    }
    getHeaderContainerClass(trusted) {
        if (trusted) {
            return 'workspace-trust-header workspace-trust-trusted';
        }
        return 'workspace-trust-header workspace-trust-untrusted';
    }
    getHeaderTitleText(trusted) {
        if (trusted) {
            if (this.workspaceTrustManagementService.isWorkspaceTrustForced()) {
                return localize('trustedUnsettableWindow', "This window is trusted");
            }
            switch (this.workspaceService.getWorkbenchState()) {
                case 1 /* WorkbenchState.EMPTY */:
                    return localize('trustedHeaderWindow', "You trust this window");
                case 2 /* WorkbenchState.FOLDER */:
                    return localize('trustedHeaderFolder', "You trust this folder");
                case 3 /* WorkbenchState.WORKSPACE */:
                    return localize('trustedHeaderWorkspace', "You trust this workspace");
            }
        }
        return localize('untrustedHeader', "You are in Restricted Mode");
    }
    getHeaderTitleIconClassNames(trusted) {
        return ThemeIcon.asClassNameArray(shieldIcon);
    }
    getFeaturesHeaderText(trusted) {
        let title = '';
        let subTitle = '';
        switch (this.workspaceService.getWorkbenchState()) {
            case 1 /* WorkbenchState.EMPTY */: {
                title = trusted ? localize('trustedWindow', "In a Trusted Window") : localize('untrustedWorkspace', "In Restricted Mode");
                subTitle = trusted ? localize('trustedWindowSubtitle', "You trust the authors of the files in the current window. All features are enabled:") :
                    localize('untrustedWindowSubtitle', "You do not trust the authors of the files in the current window. The following features are disabled:");
                break;
            }
            case 2 /* WorkbenchState.FOLDER */: {
                title = trusted ? localize('trustedFolder', "In a Trusted Folder") : localize('untrustedWorkspace', "In Restricted Mode");
                subTitle = trusted ? localize('trustedFolderSubtitle', "You trust the authors of the files in the current folder. All features are enabled:") :
                    localize('untrustedFolderSubtitle', "You do not trust the authors of the files in the current folder. The following features are disabled:");
                break;
            }
            case 3 /* WorkbenchState.WORKSPACE */: {
                title = trusted ? localize('trustedWorkspace', "In a Trusted Workspace") : localize('untrustedWorkspace', "In Restricted Mode");
                subTitle = trusted ? localize('trustedWorkspaceSubtitle', "You trust the authors of the files in the current workspace. All features are enabled:") :
                    localize('untrustedWorkspaceSubtitle', "You do not trust the authors of the files in the current workspace. The following features are disabled:");
                break;
            }
        }
        return [title, subTitle];
    }
    async render() {
        if (this.rendering) {
            return;
        }
        this.rendering = true;
        this.rerenderDisposables.clear();
        const isWorkspaceTrusted = this.workspaceTrustManagementService.isWorkspaceTrusted();
        this.rootElement.classList.toggle('trusted', isWorkspaceTrusted);
        this.rootElement.classList.toggle('untrusted', !isWorkspaceTrusted);
        // Header Section
        this.headerTitleText.innerText = this.getHeaderTitleText(isWorkspaceTrusted);
        this.headerTitleIcon.className = 'workspace-trust-title-icon';
        this.headerTitleIcon.classList.add(...this.getHeaderTitleIconClassNames(isWorkspaceTrusted));
        this.headerDescription.innerText = '';
        const headerDescriptionText = append(this.headerDescription, $('div'));
        headerDescriptionText.innerText = isWorkspaceTrusted ?
            localize('trustedDescription', "All features are enabled because trust has been granted to the workspace.") :
            localize('untrustedDescription', "{0} is in a restricted mode intended for safe code browsing.", this.productService.nameShort);
        const headerDescriptionActions = append(this.headerDescription, $('div'));
        const headerDescriptionActionsText = localize({ key: 'workspaceTrustEditorHeaderActions', comment: ['Please ensure the markdown link syntax is not broken up with whitespace [text block](link block)'] }, "[Configure your settings]({0}) or [learn more](https://aka.ms/vscode-workspace-trust).", `command:workbench.trust.configure`);
        for (const node of parseLinkedText(headerDescriptionActionsText).nodes) {
            if (typeof node === 'string') {
                append(headerDescriptionActions, document.createTextNode(node));
            }
            else {
                this.rerenderDisposables.add(this.instantiationService.createInstance(Link, headerDescriptionActions, { ...node, tabIndex: -1 }, {}));
            }
        }
        this.headerContainer.className = this.getHeaderContainerClass(isWorkspaceTrusted);
        this.rootElement.setAttribute('aria-label', `${localize('root element label', "Manage Workspace Trust")}:  ${this.headerContainer.innerText}`);
        // Settings
        const restrictedSettings = this.configurationService.restrictedSettings;
        const configurationRegistry = Registry.as(Extensions.Configuration);
        const settingsRequiringTrustedWorkspaceCount = restrictedSettings.default.filter(key => {
            const property = configurationRegistry.getConfigurationProperties()[key];
            // cannot be configured in workspace
            if (property.scope && (APPLICATION_SCOPES.includes(property.scope) || property.scope === 2 /* ConfigurationScope.MACHINE */)) {
                return false;
            }
            // If deprecated include only those configured in the workspace
            if (property.deprecationMessage || property.markdownDeprecationMessage) {
                if (restrictedSettings.workspace?.includes(key)) {
                    return true;
                }
                if (restrictedSettings.workspaceFolder) {
                    for (const workspaceFolderSettings of restrictedSettings.workspaceFolder.values()) {
                        if (workspaceFolderSettings.includes(key)) {
                            return true;
                        }
                    }
                }
                return false;
            }
            return true;
        }).length;
        // Features List
        this.renderAffectedFeatures(settingsRequiringTrustedWorkspaceCount, this.getExtensionCount());
        // Configuration Tree
        this.workspaceTrustedUrisTable.updateTable();
        this.bodyScrollBar.getDomNode().style.height = `calc(100% - ${this.headerContainer.clientHeight}px)`;
        this.bodyScrollBar.scanDomNode();
        this.rendering = false;
    }
    getExtensionCount() {
        const set = new Set();
        const inVirtualWorkspace = isVirtualWorkspace(this.workspaceService.getWorkspace());
        const localExtensions = this.extensionWorkbenchService.local.filter(ext => ext.local).map(ext => ext.local);
        for (const extension of localExtensions) {
            const enablementState = this.extensionEnablementService.getEnablementState(extension);
            if (enablementState !== 12 /* EnablementState.EnabledGlobally */ && enablementState !== 13 /* EnablementState.EnabledWorkspace */ &&
                enablementState !== 0 /* EnablementState.DisabledByTrustRequirement */ && enablementState !== 8 /* EnablementState.DisabledByExtensionDependency */) {
                continue;
            }
            if (inVirtualWorkspace && this.extensionManifestPropertiesService.getExtensionVirtualWorkspaceSupportType(extension.manifest) === false) {
                continue;
            }
            if (this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(extension.manifest) !== true) {
                set.add(extension.identifier.id);
                continue;
            }
            const dependencies = getExtensionDependencies(localExtensions, extension);
            if (dependencies.some(ext => this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(ext.manifest) === false)) {
                set.add(extension.identifier.id);
            }
        }
        return set.size;
    }
    createHeaderElement(parent) {
        this.headerContainer = append(parent, $('.workspace-trust-header', { tabIndex: '0' }));
        this.headerTitleContainer = append(this.headerContainer, $('.workspace-trust-title'));
        this.headerTitleIcon = append(this.headerTitleContainer, $('.workspace-trust-title-icon'));
        this.headerTitleText = append(this.headerTitleContainer, $('.workspace-trust-title-text'));
        this.headerDescription = append(this.headerContainer, $('.workspace-trust-description'));
    }
    createConfigurationElement(parent) {
        this.configurationContainer = append(parent, $('.workspace-trust-settings', { tabIndex: '0' }));
        const configurationTitle = append(this.configurationContainer, $('.workspace-trusted-folders-title'));
        configurationTitle.innerText = localize('trustedFoldersAndWorkspaces', "Trusted Folders & Workspaces");
        this.workspaceTrustedUrisTable = this._register(this.instantiationService.createInstance(WorkspaceTrustedUrisTable, this.configurationContainer));
    }
    createAffectedFeaturesElement(parent) {
        this.affectedFeaturesContainer = append(parent, $('.workspace-trust-features'));
        this.trustedContainer = append(this.affectedFeaturesContainer, $('.workspace-trust-limitations.trusted', { tabIndex: '0' }));
        this.untrustedContainer = append(this.affectedFeaturesContainer, $('.workspace-trust-limitations.untrusted', { tabIndex: '0' }));
    }
    async renderAffectedFeatures(numSettings, numExtensions) {
        clearNode(this.trustedContainer);
        clearNode(this.untrustedContainer);
        // Trusted features
        const [trustedTitle, trustedSubTitle] = this.getFeaturesHeaderText(true);
        this.renderLimitationsHeaderElement(this.trustedContainer, trustedTitle, trustedSubTitle);
        const trustedContainerItems = this.workspaceService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */ ?
            [
                localize('trustedTasks', "Tasks are allowed to run"),
                localize('trustedDebugging', "Debugging is enabled"),
                localize('trustedExtensions', "All enabled extensions are activated")
            ] :
            [
                localize('trustedTasks', "Tasks are allowed to run"),
                localize('trustedDebugging', "Debugging is enabled"),
                localize('trustedSettings', "All workspace settings are applied"),
                localize('trustedExtensions', "All enabled extensions are activated")
            ];
        this.renderLimitationsListElement(this.trustedContainer, trustedContainerItems, ThemeIcon.asClassNameArray(checkListIcon));
        // Restricted Mode features
        const [untrustedTitle, untrustedSubTitle] = this.getFeaturesHeaderText(false);
        this.renderLimitationsHeaderElement(this.untrustedContainer, untrustedTitle, untrustedSubTitle);
        const untrustedContainerItems = this.workspaceService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */ ?
            [
                localize('untrustedTasks', "Tasks are not allowed to run"),
                localize('untrustedDebugging', "Debugging is disabled"),
                fixBadLocalizedLinks(localize({ key: 'untrustedExtensions', comment: ['Please ensure the markdown link syntax is not broken up with whitespace [text block](link block)'] }, "[{0} extensions]({1}) are disabled or have limited functionality", numExtensions, `command:${LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID}`))
            ] :
            [
                localize('untrustedTasks', "Tasks are not allowed to run"),
                localize('untrustedDebugging', "Debugging is disabled"),
                fixBadLocalizedLinks(numSettings ? localize({ key: 'untrustedSettings', comment: ['Please ensure the markdown link syntax is not broken up with whitespace [text block](link block)'] }, "[{0} workspace settings]({1}) are not applied", numSettings, 'command:settings.filterUntrusted') : localize('no untrustedSettings', "Workspace settings requiring trust are not applied")),
                fixBadLocalizedLinks(localize({ key: 'untrustedExtensions', comment: ['Please ensure the markdown link syntax is not broken up with whitespace [text block](link block)'] }, "[{0} extensions]({1}) are disabled or have limited functionality", numExtensions, `command:${LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID}`))
            ];
        this.renderLimitationsListElement(this.untrustedContainer, untrustedContainerItems, ThemeIcon.asClassNameArray(xListIcon));
        if (this.workspaceTrustManagementService.isWorkspaceTrusted()) {
            if (this.workspaceTrustManagementService.canSetWorkspaceTrust()) {
                this.addDontTrustButtonToElement(this.untrustedContainer);
            }
            else {
                this.addTrustedTextToElement(this.untrustedContainer);
            }
        }
        else {
            if (this.workspaceTrustManagementService.canSetWorkspaceTrust()) {
                this.addTrustButtonToElement(this.trustedContainer);
            }
        }
    }
    createButtonRow(parent, buttonInfo, enabled) {
        const buttonRow = append(parent, $('.workspace-trust-buttons-row'));
        const buttonContainer = append(buttonRow, $('.workspace-trust-buttons'));
        const buttonBar = this.rerenderDisposables.add(new ButtonBar(buttonContainer));
        for (const { action, keybinding } of buttonInfo) {
            const button = buttonBar.addButtonWithDescription(defaultButtonStyles);
            button.label = action.label;
            button.enabled = enabled !== undefined ? enabled : action.enabled;
            button.description = keybinding.getLabel();
            button.element.ariaLabel = action.label + ', ' + localize('keyboardShortcut', "Keyboard Shortcut: {0}", keybinding.getAriaLabel());
            this.rerenderDisposables.add(button.onDidClick(e => {
                if (e) {
                    EventHelper.stop(e, true);
                }
                action.run();
            }));
        }
    }
    addTrustButtonToElement(parent) {
        const trustAction = this.rerenderDisposables.add(new Action('workspace.trust.button.action.grant', localize('trustButton', "Trust"), undefined, true, async () => {
            await this.workspaceTrustManagementService.setWorkspaceTrust(true);
        }));
        const trustActions = [{ action: trustAction, keybinding: this.keybindingService.resolveUserBinding(isMacintosh ? 'Cmd+Enter' : 'Ctrl+Enter')[0] }];
        if (this.workspaceTrustManagementService.canSetParentFolderTrust()) {
            const workspaceIdentifier = toWorkspaceIdentifier(this.workspaceService.getWorkspace());
            const name = basename(dirname(workspaceIdentifier.uri));
            const trustMessageElement = append(parent, $('.trust-message-box'));
            trustMessageElement.innerText = localize('trustMessage', "Trust the authors of all files in the current folder or its parent '{0}'.", name);
            const trustParentAction = this.rerenderDisposables.add(new Action('workspace.trust.button.action.grantParent', localize('trustParentButton', "Trust Parent"), undefined, true, async () => {
                await this.workspaceTrustManagementService.setParentFolderTrust(true);
            }));
            trustActions.push({ action: trustParentAction, keybinding: this.keybindingService.resolveUserBinding(isMacintosh ? 'Cmd+Shift+Enter' : 'Ctrl+Shift+Enter')[0] });
        }
        this.createButtonRow(parent, trustActions);
    }
    addDontTrustButtonToElement(parent) {
        this.createButtonRow(parent, [{
                action: this.rerenderDisposables.add(new Action('workspace.trust.button.action.deny', localize('dontTrustButton', "Don't Trust"), undefined, true, async () => {
                    await this.workspaceTrustManagementService.setWorkspaceTrust(false);
                })),
                keybinding: this.keybindingService.resolveUserBinding(isMacintosh ? 'Cmd+Enter' : 'Ctrl+Enter')[0]
            }]);
    }
    addTrustedTextToElement(parent) {
        if (this.workspaceService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */) {
            return;
        }
        const textElement = append(parent, $('.workspace-trust-untrusted-description'));
        if (!this.workspaceTrustManagementService.isWorkspaceTrustForced()) {
            textElement.innerText = this.workspaceService.getWorkbenchState() === 3 /* WorkbenchState.WORKSPACE */ ? localize('untrustedWorkspaceReason', "This workspace is trusted via the bolded entries in the trusted folders below.") : localize('untrustedFolderReason', "This folder is trusted via the bolded entries in the trusted folders below.");
        }
        else {
            textElement.innerText = localize('trustedForcedReason', "This window is trusted by nature of the workspace that is opened.");
        }
    }
    renderLimitationsHeaderElement(parent, headerText, subtitleText) {
        const limitationsHeaderContainer = append(parent, $('.workspace-trust-limitations-header'));
        const titleElement = append(limitationsHeaderContainer, $('.workspace-trust-limitations-title'));
        const textElement = append(titleElement, $('.workspace-trust-limitations-title-text'));
        const subtitleElement = append(limitationsHeaderContainer, $('.workspace-trust-limitations-subtitle'));
        textElement.innerText = headerText;
        subtitleElement.innerText = subtitleText;
    }
    renderLimitationsListElement(parent, limitations, iconClassNames) {
        const listContainer = append(parent, $('.workspace-trust-limitations-list-container'));
        const limitationsList = append(listContainer, $('ul'));
        for (const limitation of limitations) {
            const limitationListItem = append(limitationsList, $('li'));
            const icon = append(limitationListItem, $('.list-item-icon'));
            const text = append(limitationListItem, $('.list-item-text'));
            icon.classList.add(...iconClassNames);
            const linkedText = parseLinkedText(limitation);
            for (const node of linkedText.nodes) {
                if (typeof node === 'string') {
                    append(text, document.createTextNode(node));
                }
                else {
                    this.rerenderDisposables.add(this.instantiationService.createInstance(Link, text, { ...node, tabIndex: -1 }, {}));
                }
            }
        }
    }
    layout(dimension) {
        if (!this.isVisible()) {
            return;
        }
        this.workspaceTrustedUrisTable.layout();
        this.layoutParticipants.forEach(participant => {
            participant.layout();
        });
        this.bodyScrollBar.scanDomNode();
    }
};
__decorate([
    debounce(100)
], WorkspaceTrustEditor.prototype, "render", null);
WorkspaceTrustEditor = WorkspaceTrustEditor_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IThemeService),
    __param(3, IStorageService),
    __param(4, IWorkspaceContextService),
    __param(5, IExtensionsWorkbenchService),
    __param(6, IExtensionManifestPropertiesService),
    __param(7, IInstantiationService),
    __param(8, IWorkspaceTrustManagementService),
    __param(9, IWorkbenchConfigurationService),
    __param(10, IWorkbenchExtensionEnablementService),
    __param(11, IProductService),
    __param(12, IKeybindingService)
], WorkspaceTrustEditor);
export { WorkspaceTrustEditor };
// Highly scoped fix for #126614
function fixBadLocalizedLinks(badString) {
    const regex = /(.*)\[(.+)\]\s*\((.+)\)(.*)/; // markdown link match with spaces
    return badString.replace(regex, '$1[$2]($3)$4');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlVHJ1c3RFZGl0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi93b3Jrc3BhY2UvYnJvd3Nlci93b3Jrc3BhY2VUcnVzdEVkaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLENBQUMsRUFBRSxxQkFBcUIsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFhLFdBQVcsRUFBRSxTQUFTLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMzTCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDL0UsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3pFLE9BQU8sRUFBWSxRQUFRLEVBQWUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUVsRyxPQUFPLEVBQUUsTUFBTSxFQUFXLE1BQU0sb0NBQW9DLENBQUM7QUFFckUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFFbEUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDekUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDeEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRTdELE9BQU8sRUFBRSxHQUFHLEVBQUUs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