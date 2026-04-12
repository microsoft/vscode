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
import './media/simpleBrowserOverlay.css';
import { combinedDisposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derivedOpts, observableFromEvent, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { EditorGroupView } from '../../../../browser/parts/editor/editorGroupView.js';
import { Event } from '../../../../../base/common/event.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IChatWidgetService } from '../chat.js';
import { Button, ButtonWithDropdown } from '../../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { addDisposableListener } from '../../../../../base/browser/dom.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { cleanupOldImages, createFileForMedia } from '../chatImageUtils.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IBrowserElementsService } from '../../../../services/browserElements/browser/browserElementsService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { toAction } from '../../../../../base/common/actions.js';
import { getDisplayNameFromOuterHTML } from '../../../../../platform/browserElements/common/browserElements.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { observableConfigValue, observableContextKey } from '../../../../../platform/observable/common/platformObservableUtils.js';
let SimpleBrowserOverlayWidget = class SimpleBrowserOverlayWidget {
    constructor(_editor, _container, _hostService, _chatWidgetService, fileService, environmentService, logService, configurationService, _preferencesService, _browserElementsService, contextMenuService, telemetryService) {
        this._editor = _editor;
        this._container = _container;
        this._hostService = _hostService;
        this._chatWidgetService = _chatWidgetService;
        this.fileService = fileService;
        this.environmentService = environmentService;
        this.logService = logService;
        this.configurationService = configurationService;
        this._preferencesService = _preferencesService;
        this._browserElementsService = _browserElementsService;
        this.contextMenuService = contextMenuService;
        this.telemetryService = telemetryService;
        this._showStore = new DisposableStore();
        this._timeout = undefined;
        this._activeLocator = undefined;
        this._browserType = undefined;
        this._showStore.add(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('chat.sendElementsToChat.enabled')) {
                if (this.configurationService.getValue('chat.sendElementsToChat.enabled')) {
                    this.showElement(this._domNode);
                }
                else {
                    this.hideElement(this._domNode);
                }
            }
        }));
        this.imagesFolder = joinPath(this.environmentService.workspaceStorageHome, 'vscode-chat-images');
        cleanupOldImages(this.fileService, this.logService, this.imagesFolder);
        this._domNode = document.createElement('div');
        this._domNode.className = 'element-selection-message';
        const mainContent = document.createElement('div');
        mainContent.className = 'element-selection-main-content';
        const message = document.createElement('span');
        const startSelectionMessage = localize('elementSelectionMessage', 'Add element to chat');
        message.textContent = startSelectionMessage;
        mainContent.appendChild(message);
        let cts;
        const actions = [];
        actions.push(toAction({
            id: 'singleSelection',
            label: localize('selectElementDropdown', 'Select an Element'),
            enabled: true,
            run: async () => { await startElementSelection(); }
        }), toAction({
            id: 'continuousSelection',
            label: localize('continuousSelectionDropdown', 'Continuous Selection'),
            enabled: true,
            run: async () => {
                this._editor.focus();
                cts = new CancellationTokenSource();
                // start selection
                message.textContent = localize('elementSelectionInProgress', 'Selecting element...');
                this.hideElement(startButton.element);
                this.showElement(cancelButton.element);
                cancelButton.label = localize('finishSelectionLabel', 'Done');
                while (!cts.token.isCancellationRequested) {
                    try {
                        await this.addElementToChat(cts);
                    }
                    catch (err) {
                        this.logService.error('Failed to select this element.', err);
                        cts.cancel();
                        break;
                    }
                }
                // stop selection
                message.textContent = localize('elementSelectionComplete', 'Element added to chat');
                finishedSelecting();
            }
        }));
        const startButton = this._showStore.add(new ButtonWithDropdown(mainContent, {
            actions: actions,
            addPrimaryActionToDropdown: false,
            contextMenuProvider: this.contextMenuService,
            supportShortLabel: true,
            title: localize('selectAnElement', 'Click to select an element.'),
            supportIcons: true,
            ...defaultButtonStyles
        }));
        startButton.primaryButton.label = localize('startSelection', 'Start');
        startButton.element.classList.add('element-selection-start');
        const cancelButton = this._showStore.add(new Button(mainContent, { ...defaultButtonStyles, supportIcons: true, title: localize('cancelSelection', 'Click to cancel selection.') }));
        cancelButton.element.className = 'element-selection-cancel hidden';
        const cancelButtonLabel = localize('cancelSelectionLabel', 'Cancel');
        cancelButton.label = cancelButtonLabel;
        const configure = this._showStore.add(new Button(mainContent, { supportIcons: true, title: localize('chat.configureElements', "Configure Attachments Sent") }));
        configure.icon = Codicon.gear;
        const collapseOverlay = this._showStore.add(new Button(mainContent, { supportIcons: true, title: localize('chat.hideOverlay', "Collapse Overlay") }));
        collapseOverlay.icon = Codicon.chevronRight;
        const nextSelection = this._showStore.add(new Button(mainContent, { supportIcons: true, title: localize('chat.nextSelection', "Select Again") }));
        nextSelection.icon = Codicon.close;
        nextSelection.element.classList.add('hidden');
        // shown if the overlay is collapsed
        const expandContainer = document.createElement('div');
        expandContainer.className = 'element-expand-container hidden';
        const expandOverlay = this._showStore.add(new Button(expandContainer, { supportIcons: true, title: localize('chat.expandOverlay', "Expand Overlay") }));
        expandOverlay.icon = Codicon.layout;
        this._domNode.appendChild(mainContent);
        this._domNode.appendChild(expandContainer);
        const resetButtons = () => {
            this.hideElement(nextSelection.element);
            this.showElement(startButton.element);
            this.showElement(collapseOverlay.element);
        };
        const finishedSelecting = () => {
            // stop selection
            this.hideElement(cancelButton.element);
            cancelButton.label = cancelButtonLabel;
            this.hideElement(collapseOverlay.element);
            this.showElement(nextSelection.element);
            // wait 3 seconds before showing the start button again unless cancelled out.
            this._timeout = setTimeout(() => {
                message.textContent = startSelectionMessage;
                resetButtons();
            }, 3000);
        };
        const startElementSelection = async () => {
            cts = new CancellationTokenSource();
            this._editor.focus();
            // start selection
            message.textContent = localize('elementSelectionInProgress', 'Selecting element...');
            this.hideElement(startButton.element);
            this.showElement(cancelButton.element);
            await this.addElementToChat(cts);
            // stop selection
            message.textContent = localize('elementSelectionComplete', 'Element added to chat');
            finishedSelecting();
        };
        this._showStore.add(addDisposableListener(startButton.primaryButton.element, 'click', async () => {
            await startElementSelection();
        }));
        this._showStore.add(addDisposableListener(cancelButton.element, 'click', () => {
            cts.cancel();
            message.textContent = localize('elementCancelMessage', 'Selection canceled');
            finishedSelecting();
        }));
        this._showStore.add(addDisposableListener(collapseOverlay.element, 'click', () => {
            this.hideElement(mainContent);
            this.showElement(expandContainer);
        }));
        this._showStore.add(addDisposableListener(expandOverlay.element, 'click', () => {
            this.showElement(mainContent);
            this.hideElement(expandContainer);
        }));
        this._showStore.add(addDisposableListener(nextSelection.element, 'click', () => {
            clearTimeout(this._timeout);
            message.textContent = startSelectionMessage;
            resetButtons();
        }));
        this._showStore.add(addDisposableListener(configure.element, 'click', () => {
            this._preferencesService.openSettings({ jsonEditor: false, query: '@id:chat.sendElementsToChat.enabled,chat.sendElementsToChat.attachCSS,chat.sendElementsToChat.attachImages' });
        }));
    }
    setActiveLocator(locator, browserType) {
        this._activeLocator = locator;
        this._browserType = browserType;
    }
    hideElement(element) {
        if (element.classList.contains('hidden')) {
            return;
        }
        element.classList.add('hidden');
    }
    showElement(element) {
        if (!element.classList.contains('hidden')) {
            return;
        }
        element.classList.remove('hidden');
    }
    async addElementToChat(cts) {
        this.telemetryService.publicLog2('simpleBrowser.addElementToChat.start', {
            browserType: this._browserType
        });
        // eslint-disable-next-line no-restricted-syntax
        const editorContainer = this._container.querySelector('.editor-container');
        const editorContainerPosition = editorContainer ? editorContainer.getBoundingClientRect() : this._container.getBoundingClientRect();
        const elementData = await this._browserElementsService.getElementData({
            x: editorContainerPosition.x,
            y: editorContainerPosition.y + 32.4, // Height of the title bar
            width: editorContainerPosition.width,
            height: editorContainerPosition.height - 32.4,
        }, cts.token, this._activeLocator);
        if (!elementData) {
            throw new Error('Element data not found');
        }
        const bounds = elementData.bounds;
        const toAttach = [];
        const widget = await this._chatWidgetService.revealWidget() ?? this._chatWidgetService.lastFocusedWidget;
        const attachCss = this.configurationService.getValue('chat.sendElementsToChat.attachCSS');
        let value = (attachCss ? 'Attached HTML and CSS Context' : 'Attached HTML Context') + '\n\n' + elementData.outerHTML;
        if (attachCss) {
            value += '\n\n' + elementData.computedStyle;
        }
        const displayName = getDisplayNameFromOuterHTML(elementData.outerHTML);
        toAttach.push({
            id: 'element-' + Date.now(),
            name: displayName,
            fullName: displayName,
            value: value,
            kind: 'element',
            icon: ThemeIcon.fromId(Codicon.layout.id),
            ancestors: elementData.ancestors,
            attributes: elementData.attributes,
            computedStyles: attachCss ? elementData.computedStyles : undefined,
            dimensions: elementData.dimensions,
            innerText: elementData.innerText,
        });
        if (this.configurationService.getValue('chat.sendElementsToChat.attachImages')) {
            // remove container so we don't block anything on screenshot
            this._domNode.style.display = 'none';
            // Wait 1 extra frame to make sure overlay is gone
            await new Promise(resolve => setTimeout(resolve, 100));
            const screenshot = await this._hostService.getScreenshot(bounds);
            if (!screenshot) {
                throw new Error('Screenshot failed');
            }
            const fileReference = await createFileForMedia(this.fileService, this.imagesFolder, screenshot.buffer, 'image/png');
            toAttach.push({
                id: 'element-screenshot-' + Date.now(),
                name: 'Element Screenshot',
                fullName: 'Element Screenshot',
                kind: 'image',
                value: screenshot.buffer,
                references: fileReference ? [{ reference: fileReference, kind: 'reference' }] : [],
            });
            this._domNode.style.display = '';
        }
        widget?.attachmentModel?.addContext(...toAttach);
        this.telemetryService.publicLog2('simpleBrowser.addElementToChat.added', {
            browserType: this._browserType,
            attachCss,
            attachImages: this.configurationService.getValue('chat.sendElementsToChat.attachImages') ?? false
        });
    }
    dispose() {
        this._showStore.dispose();
    }
    getDomNode() {
        return this._domNode;
    }
};
SimpleBrowserOverlayWidget = __decorate([
    __param(2, IHostService),
    __param(3, IChatWidgetService),
    __param(4, IFileService),
    __param(5, IEnvironmentService),
    __param(6, ILogService),
    __param(7, IConfigurationService),
    __param(8, IPreferencesService),
    __param(9, IBrowserElementsService),
    __param(10, IContextMenuService),
    __param(11, ITelemetryService)
], SimpleBrowserOverlayWidget);
let SimpleBrowserOverlayController = class SimpleBrowserOverlayController {
    constructor(container, group, instaService, configurationService, _browserElementsService, contextKeyService) {
        this.configurationService = configurationService;
        this._browserElementsService = _browserElementsService;
        this.contextKeyService = contextKeyService;
        this._store = new DisposableStore();
        this._domNode = document.createElement('div');
        this._domNode.classList.add('chat-simple-browser-overlay');
        this._domNode.style.position = 'absolute';
        this._domNode.style.bottom = `5px`;
        this._domNode.style.right = `5px`;
        this._domNode.style.zIndex = `100`;
        const widget = instaService.createInstance(SimpleBrowserOverlayWidget, group, container);
        this._domNode.appendChild(widget.getDomNode());
        this._store.add(toDisposable(() => this._domNode.remove()));
        this._store.add(widget);
        const connectingWebviewElement = document.createElement('div');
        connectingWebviewElement.className = 'connecting-webview-element';
        let cts = new CancellationTokenSource();
        const show = async (locator, browserType) => {
            widget.setActiveLocator(locator, browserType);
            // Show the connecting indicator while establishing the session
            connectingWebviewElement.textContent = localize('connectingWebviewElement', 'Connecting to webview...');
            if (!container.contains(connectingWebviewElement)) {
                container.appendChild(connectingWebviewElement);
            }
            cts.cancel();
            cts = new CancellationTokenSource();
            try {
                await this._browserElementsService.startDebugSession(cts.token, locator);
            }
            catch (error) {
                connectingWebviewElement.textContent = localize('reopenErrorWebviewElement', 'Please reopen the preview.');
                return;
            }
            if (cts.token.isCancellationRequested) {
                return;
            }
            if (!container.contains(this._domNode)) {
                container.appendChild(this._domNode);
            }
            connectingWebviewElement.remove();
        };
        const hide = () => {
            widget.setActiveLocator(undefined, undefined);
            cts.cancel();
            if (container.contains(this._domNode)) {
                this._domNode.remove();
            }
            connectingWebviewElement.remove();
        };
        const activeEditorSignal = observableSignalFromEvent(this, Event.any(group.onDidActiveEditorChange, group.onDidModelChange));
        const activeIdObs = derivedOpts({}, r => {
            activeEditorSignal.read(r); // signal
            const editor = group.activeEditorPane;
            const isSimpleBrowser = editor?.input.editorId === 'mainThreadWebview-simpleBrowser.view';
            const isLiveServer = editor?.input.editorId === 'mainThreadWebview-browserPreview';
            if (isSimpleBrowser || isLiveServer) {
                const webviewInput = editor.input;
                const browserType = isSimpleBrowser ? 'simpleBrowser' : 'livePreview';
                return { webviewId: webviewInput.webview.container.id, browserType };
            }
            return undefined;
        });
        // Observe chat enabled state and sendElementsToChat configuration
        const chatEnabledObs = observableContextKey(ChatContextKeys.enabled.key, this.contextKeyService);
        const sendElementsEnabledObs = observableConfigValue('chat.sendElementsToChat.enabled', true, this.configurationService);
        this._store.add(autorun(r => {
            const activeEditor = activeIdObs.read(r);
            const isChatEnabled = chatEnabledObs.read(r);
            const isSendElementsEnabled = sendElementsEnabledObs.read(r);
            // Hide if chat is not enabled, sendElementsToChat is not enabled, or no active editor
            if (!isChatEnabled || !isSendElementsEnabled || !activeEditor) {
                hide();
                return;
            }
            show({ webviewId: activeEditor.webviewId }, activeEditor.browserType);
        }));
    }
    dispose() {
        this._store.dispose();
    }
};
SimpleBrowserOverlayController = __decorate([
    __param(2, IInstantiationService),
    __param(3, IConfigurationService),
    __param(4, IBrowserElementsService),
    __param(5, IContextKeyService)
], SimpleBrowserOverlayController);
let SimpleBrowserOverlay = class SimpleBrowserOverlay {
    static { this.ID = 'chat.simpleBrowser.overlay'; }
    constructor(editorGroupsService, instantiationService) {
        this._store = new DisposableStore();
        const editorGroups = observableFromEvent(this, Event.any(editorGroupsService.onDidAddGroup, editorGroupsService.onDidRemoveGroup), () => editorGroupsService.groups);
        const overlayWidgets = this._store.add(new DisposableMap());
        this._store.add(autorun(r => {
            const toDelete = new Set(overlayWidgets.keys());
            const groups = editorGroups.read(r);
            for (const group of groups) {
                if (!(group instanceof EditorGroupView)) {
                    // TODO@jrieken better with https://github.com/microsoft/vscode/tree/ben/layout-group-container
                    continue;
                }
                toDelete.delete(group); // we keep the widget for this group!
                if (!overlayWidgets.has(group)) {
                    const scopedInstaService = instantiationService.createChild(new ServiceCollection([IContextKeyService, group.scopedContextKeyService]));
                    const container = group.element;
                    const ctrl = scopedInstaService.createInstance(SimpleBrowserOverlayController, container, group);
                    overlayWidgets.set(group, combinedDisposable(ctrl, scopedInstaService));
                }
            }
            for (const group of toDelete) {
                overlayWidgets.deleteAndDispose(group);
            }
        }));
    }
    dispose() {
        this._store.dispose();
    }
};
SimpleBrowserOverlay = __decorate([
    __param(0, IEditorGroupsService),
    __param(1, IInstantiationService)
], SimpleBrowserOverlay);
export { SimpleBrowserOverlay };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2ltcGxlQnJvd3NlckVkaXRvck92ZXJsYXkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYXR0YWNobWVudHMvc2ltcGxlQnJvd3NlckVkaXRvck92ZXJsYXkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxrQ0FBa0MsQ0FBQztBQUMxQyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMzSCxPQUFPLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxtQkFBbUIsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ2hJLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRWpELE9BQU8sRUFBZ0Isb0JBQW9CLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdEYsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FB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