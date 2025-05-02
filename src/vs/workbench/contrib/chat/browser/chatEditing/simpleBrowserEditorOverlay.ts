/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/simpleBrowserOverlay.css';
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
import { EditorResourceAccessor, SideBySideEditor } from '../../../../common/editor.js';
import { isEqual, joinPath } from '../../../../../base/common/resources.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IChatWidgetService, showChatView } from '../chat.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { addDisposableListener } from '../../../../../base/browser/dom.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { cleanupOldImages, createFileForMedia } from '../imageUtils.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IChatRequestVariableEntry } from '../../common/chatModel.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';

class SimpleBrowserOverlayWidget {

	private readonly _domNode: HTMLElement;

	private readonly imagesFolder: URI;

	private readonly _showStore = new DisposableStore();

	private _timeout: any | undefined = undefined;

	constructor(
		private readonly _editor: IEditorGroup,
		private readonly _container: HTMLElement,
		@IHostService private readonly _hostService: IHostService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IViewsService private readonly _viewService: IViewsService,
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPreferencesService private readonly _preferencesService: IPreferencesService,
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

		const message = document.createElement('span');
		const startSelectionMessage = localize('elementSelectionMessage', 'Add element to chat');
		message.textContent = startSelectionMessage;
		this._domNode.appendChild(message);

		let cts: CancellationTokenSource;
		const selectButton = this._showStore.add(new Button(this._domNode, { ...defaultButtonStyles, supportIcons: true, title: localize('selectAnElement', 'Click to select an element.') }));
		selectButton.element.className = 'element-selection-start';
		selectButton.label = localize('startSelection', 'Start');

		const cancelButton = this._showStore.add(new Button(this._domNode, { ...defaultButtonStyles, supportIcons: true, title: localize('cancelSelection', 'Click to cancel selection.') }));
		cancelButton.element.className = 'element-selection-cancel hidden';
		cancelButton.label = localize('cancel', 'Cancel');

		const configure = this._showStore.add(new Button(this._domNode, { supportIcons: true, title: localize('chat.configureElements', "Configure Attachments Sent") }));
		configure.icon = Codicon.gear;

		const collapseOverlay = this._showStore.add(new Button(this._domNode, { supportIcons: true, title: localize('chat.hideOverlay', "Collapse Overlay") }));
		collapseOverlay.icon = Codicon.chevronRight;

		const nextSelection = this._showStore.add(new Button(this._domNode, { supportIcons: true, title: localize('chat.nextSelection', "Select Again") }));
		nextSelection.icon = Codicon.close;
		nextSelection.element.classList.add('hidden');

		// shown if the overlay is collapsed
		const expandOverlay = this._showStore.add(new Button(this._domNode, { supportIcons: true, title: localize('chat.expandOverlay', "Expand Overlay") }));
		expandOverlay.icon = Codicon.layout;
		const expandContainer = document.createElement('div');
		expandContainer.className = 'element-expand-container hidden';
		expandContainer.appendChild(expandOverlay.element);
		this._container.appendChild(expandContainer);

		const resetButtons = () => {
			this.hideElement(nextSelection.element);
			this.showElement(selectButton.element);
			this.showElement(collapseOverlay.element);
		};

		const finishedSelecting = () => {
			// stop selection
			this.hideElement(cancelButton.element);
			this.hideElement(collapseOverlay.element);
			this.showElement(nextSelection.element);

			// wait 3 seconds before showing the start button again unless cancelled out.
			this._timeout = setTimeout(() => {
				message.textContent = startSelectionMessage;
				resetButtons();
			}, 3000);
		};

		this._showStore.add(addDisposableListener(selectButton.element, 'click', async () => {
			cts = new CancellationTokenSource();
			this._editor.focus();

			// start selection
			message.textContent = localize('elementSelectionInProgress', 'Selecting element...');
			this.hideElement(selectButton.element);
			this.showElement(cancelButton.element);
			await this.addElementToChat(cts);

			// stop selection
			message.textContent = localize('elementSelectionComplete', 'Element added to chat');
			finishedSelecting();
		}));

		this._showStore.add(addDisposableListener(cancelButton.element, 'click', () => {
			cts.cancel();
			message.textContent = localize('elementCancelMessage', 'Selection canceled');
			finishedSelecting();
		}));

		this._showStore.add(addDisposableListener(collapseOverlay.element, 'click', () => {
			this.hideElement(this._domNode);
			this.showElement(expandContainer);
		}));

		this._showStore.add(addDisposableListener(expandOverlay.element, 'click', () => {
			this.showElement(this._domNode);
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
		const editorContainer = this._container.querySelector('.editor-container') as HTMLDivElement;
		const editorContainerPosition = editorContainer ? editorContainer.getBoundingClientRect() : this._container.getBoundingClientRect();
		const elementData = await this._hostService.getElementData(editorContainerPosition, cts.token);
		if (!elementData) {
			throw new Error('Element data not found');
		}
		const bounds = elementData.bounds;
		const toAttach: IChatRequestVariableEntry[] = [];

		const widget = this._chatWidgetService.lastFocusedWidget ?? await showChatView(this._viewService);
		let value = 'Attached HTML and CSS Context\n\n' + elementData.outerHTML;
		if (this.configurationService.getValue('chat.sendElementsToChat.attachCSS')) {
			value += '\n\n' + elementData.computedStyle;
		}
		toAttach.push({
			id: 'element-' + Date.now(),
			name: this.getDisplayNameFromOuterHTML(elementData.outerHTML),
			fullName: this.getDisplayNameFromOuterHTML(elementData.outerHTML),
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
	}


	getDisplayNameFromOuterHTML(outerHTML: string): string {
		const firstElementMatch = outerHTML.match(/^<(\w+)([^>]*?)>/);
		if (!firstElementMatch) {
			throw new Error('No outer element found');
		}

		const tagName = firstElementMatch[1];
		const idMatch = firstElementMatch[2].match(/\s+id\s*=\s*["']([^"']+)["']/i);
		const id = idMatch ? `#${idMatch[1]}` : '';
		const classMatch = firstElementMatch[2].match(/\s+class\s*=\s*["']([^"']+)["']/i);
		const className = classMatch ? `.${classMatch[1].replace(/\s+/g, '.')}` : '';
		return `${tagName}${id}${className}`;
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
	) {

		if (!this.configurationService.getValue('chat.sendElementsToChat.enabled')) {
			return;
		}

		this._domNode.classList.add('chat-simple-browser-overlay');
		this._domNode.style.position = 'absolute';
		this._domNode.style.bottom = `5px`;
		this._domNode.style.right = `5px`;
		this._domNode.style.zIndex = `100`;

		const widget = instaService.createInstance(SimpleBrowserOverlayWidget, group, container);
		this._domNode.appendChild(widget.getDomNode());
		this._store.add(toDisposable(() => this._domNode.remove()));
		this._store.add(widget);

		const show = () => {
			if (!container.contains(this._domNode)) {
				container.appendChild(this._domNode);
			}
		};

		const hide = () => {
			if (container.contains(this._domNode)) {
				this._domNode.remove();
			}
		};

		const activeEditorSignal = observableSignalFromEvent(this, Event.any(group.onDidActiveEditorChange, group.onDidModelChange));

		const activeUriObs = derivedOpts({ equalsFn: isEqual }, r => {

			activeEditorSignal.read(r); // signal

			const editor = group.activeEditorPane;
			if (editor?.input.editorId === 'mainThreadWebview-simpleBrowser.view') {
				const uri = EditorResourceAccessor.getOriginalUri(editor?.input, { supportSideBySide: SideBySideEditor.PRIMARY });
				return uri;
			}
			return undefined;
		});

		this._store.add(autorun(r => {

			const data = activeUriObs.read(r);

			if (!data) {
				hide();
				return;
			}

			show();
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

		const overlayWidgets = new DisposableMap<IEditorGroup>();

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
