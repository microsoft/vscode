/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/simpleBrowserOverlay.css';
import { combinedDisposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derivedOpts, observableFromEvent, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
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
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IChatRequestVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IBrowserElementsService } from '../../../../services/browserElements/browser/browserElementsService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IAction, toAction } from '../../../../../base/common/actions.js';
import { WebviewInput } from '../../../webviewPanel/browser/webviewEditorInput.js';
import { IBrowserTargetLocator, getDisplayNameFromOuterHTML } from '../../../../../platform/browserElements/common/browserElements.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { observableConfigValue, observableContextKey } from '../../../../../platform/observable/common/platformObservableUtils.js';

type BrowserType = 'simpleBrowser' | 'livePreview';

class SimpleBrowserOverlayWidget {

	private readonly _domNode: HTMLElement;

	private readonly imagesFolder: URI;

	private readonly _showStore = new DisposableStore();

	private _timeout: Timeout | undefined = undefined;

	private _activeLocator: IBrowserTargetLocator | undefined = undefined;

	private _browserType: BrowserType | undefined = undefined;

	constructor(
		private readonly _editor: IEditorGroup,
		private readonly _container: HTMLElement,
		@IHostService private readonly _hostService: IHostService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPreferencesService private readonly _preferencesService: IPreferencesService,
		@IBrowserElementsService private readonly _browserElementsService: IBrowserElementsService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		this._showStore.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('chat.sendElementsToChat.enabled')) {
				if (this.configurationService.getValue('chat.sendElementsToChat.enabled')) {
					this.showElement(this._domNode);
				} else {
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

		let cts: CancellationTokenSource;
		const actions: IAction[] = [];
		actions.push(
			toAction({
				id: 'singleSelection',
				label: localize('selectElementDropdown', 'Select an Element'),
				enabled: true,
				run: async () => { await startElementSelection(); }
			}),
			toAction({
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
						} catch (err) {
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

	setActiveLocator(locator: IBrowserTargetLocator | undefined, browserType: BrowserType | undefined) {
		this._activeLocator = locator;
		this._browserType = browserType;
	}

	hideElement(element: HTMLElement) {
		if (element.classList.contains('hidden')) {
			return;
		}
		element.classList.add('hidden');
	}

	showElement(element: HTMLElement) {
		if (!element.classList.contains('hidden')) {
			return;
		}
		element.classList.remove('hidden');
	}

	async addElementToChat(cts: CancellationTokenSource) {
		type SimpleBrowserAddElementToChatStartEvent = {
			browserType: string;
		};

		type SimpleBrowserAddElementToChatStartClassification = {
			browserType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of browser extension: simpleBrowser or livePreview.' };
			owner: 'kycutler';
			comment: 'The user initiated an Add Element to Chat action in Simple Browser overlay.';
		};

		this.telemetryService.publicLog2<SimpleBrowserAddElementToChatStartEvent, SimpleBrowserAddElementToChatStartClassification>('simpleBrowser.addElementToChat.start', {
			browserType: this._browserType!
		});

		// eslint-disable-next-line no-restricted-syntax
		const editorContainer = this._container.querySelector('.editor-container') as HTMLDivElement;
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
		const toAttach: IChatRequestVariableEntry[] = [];

		const widget = await this._chatWidgetService.revealWidget() ?? this._chatWidgetService.lastFocusedWidget;
		const attachCss = this.configurationService.getValue<boolean>('chat.sendElementsToChat.attachCSS');
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

		type SimpleBrowserAddElementToChatAddedEvent = {
			browserType: string;
			attachCss: boolean;
			attachImages: boolean;
		};

		type SimpleBrowserAddElementToChatAddedClassification = {
			browserType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of browser extension: simpleBrowser or livePreview.' };
			attachCss: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether chat.sendElementsToChat.attachCSS was enabled.' };
			attachImages: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether chat.sendElementsToChat.attachImages was enabled.' };
			owner: 'kycutler';
			comment: 'An element was successfully added to chat from Simple Browser overlay.';
		};

		this.telemetryService.publicLog2<SimpleBrowserAddElementToChatAddedEvent, SimpleBrowserAddElementToChatAddedClassification>('simpleBrowser.addElementToChat.added', {
			browserType: this._browserType!,
			attachCss,
			attachImages: this.configurationService.getValue<boolean>('chat.sendElementsToChat.attachImages') ?? false
		});
	}

	dispose() {
		this._showStore.dispose();
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}
}

class SimpleBrowserOverlayController {

	private readonly _store = new DisposableStore();

	private readonly _domNode = document.createElement('div');

	constructor(
		container: HTMLElement,
		group: IEditorGroup,
		@IInstantiationService instaService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IBrowserElementsService private readonly _browserElementsService: IBrowserElementsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {

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
		const show = async (locator: IBrowserTargetLocator, browserType: BrowserType) => {
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
			} catch (error) {
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
				const webviewInput = editor.input as WebviewInput;
				const browserType: BrowserType = isSimpleBrowser ? 'simpleBrowser' : 'livePreview';
				return { webviewId: webviewInput.webview.container.id, browserType };
			}
			return undefined;
		});

		// Observe chat enabled state and sendElementsToChat configuration
		const chatEnabledObs = observableContextKey<boolean>(ChatContextKeys.enabled.key, this.contextKeyService);
		const sendElementsEnabledObs = observableConfigValue<boolean>('chat.sendElementsToChat.enabled', true, this.configurationService);

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

	dispose(): void {
		this._store.dispose();
	}
}

export class SimpleBrowserOverlay implements IWorkbenchContribution {

	static readonly ID = 'chat.simpleBrowser.overlay';

	private readonly _store = new DisposableStore();

	constructor(
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		const editorGroups = observableFromEvent(
			this,
			Event.any(editorGroupsService.onDidAddGroup, editorGroupsService.onDidRemoveGroup),
			() => editorGroupsService.groups
		);

		const overlayWidgets = this._store.add(new DisposableMap<IEditorGroup>());

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

					const scopedInstaService = instantiationService.createChild(
						new ServiceCollection([IContextKeyService, group.scopedContextKeyService])
					);

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

	dispose(): void {
		this._store.dispose();
	}
}
