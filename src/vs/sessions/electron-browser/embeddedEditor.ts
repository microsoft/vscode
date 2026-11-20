/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/embeddedEditor.css';
import { getZoomFactor, onDidChangeZoomLevel } from '../../base/browser/browser.js';
import { $, DisposableResizeObserver, scheduleAtNextAnimationFrame } from '../../base/browser/dom.js';
import { mainWindow } from '../../base/browser/window.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../base/common/lifecycle.js';
import { autorun, derived, IObservable, ISettableObservable, observableValue } from '../../base/common/observable.js';
import { Event } from '../../base/common/event.js';
import { equals } from '../../base/common/arrays.js';
import { URI } from '../../base/common/uri.js';
import { ipcRenderer } from '../../base/parts/sandbox/electron-browser/globals.js';
import { localize } from '../../nls.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../platform/configuration/common/configurationRegistry.js';
import { IContextKeyService, RawContextKey } from '../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../platform/dialogs/common/dialogs.js';
import { InstantiationType, registerSingleton } from '../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../platform/log/common/log.js';
import { INativeHostService } from '../../platform/native/common/native.js';
import { IQuickInputService } from '../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../platform/storage/common/storage.js';
import { EMBEDDED_EDITOR_WINDOW_CHANGED_CHANNEL, IEmbeddedWindowBounds, IFolderToOpen } from '../../platform/window/common/window.js';
import { ILifecycleService } from '../../workbench/services/lifecycle/common/lifecycle.js';
import { ISessionsService } from '../../workbench/contrib/sessions/browser/sessionsService.js';
import { IWorkbenchLayoutService, Parts } from '../../workbench/services/layout/browser/layoutService.js';
import { IChat, ISession } from '../../workbench/services/sessions/common/session.js';
import { IWorkbenchContribution } from '../../workbench/common/contributions.js';
import { EditorWindowTargetResolver } from './editorWindowTarget.js';

export const EMBEDDED_EDITOR_SETTING = 'sessions.experimental.editorInAgentsWindow';

export const EmbeddedEditorVisibleContext = new RawContextKey<boolean>('sessions.embeddedEditorVisible', false, localize('embeddedEditorVisible', "Whether an editor window is shown inside the Agents window"));

export const IEmbeddedEditorService = createDecorator<IEmbeddedEditorService>('sessionsEmbeddedEditorService');

/**
 * Shows an editor window for a session's folders inside the Agents window, to the right of the
 * sessions list, in place of the session content.
 */
export interface IEmbeddedEditorService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether "Open in Editor" shows the editor inside the Agents window rather than in a window of its own.
	 */
	readonly enabled: boolean;

	readonly visible: IObservable<boolean>;

	/**
	 * Shows an editor window for the folders of the session, with its chat in the chat view of the editor window.
	 * While it shows, selecting another chat shows that chat there, and a restart shows the editor window again.
	 * Returns `false` when the session has no folders to open in the Agents window.
	 */
	show(session: ISession, chat?: IChat): Promise<boolean>;

	/**
	 * Shows the sessions again in place of the editor window.
	 */
	hide(): Promise<void>;
}

/** Parts of the Agents window that the editor window covers while it shows. */
const COVERED_PARTS = [Parts.SESSIONS_PART, Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART, Parts.PANEL_PART, Parts.CUSTOM_VIEW_GRID_PART];

const EMBEDDED_EDITOR_STORAGE_KEY = 'sessions.embeddedEditor.folders';

/**
 * What an editor window in the Agents window shows: the folders it opens, and the repositories they are worktrees of.
 */
export interface IEmbeddedEditorContent {
	readonly folders: readonly IFolderToOpen[];
	readonly repositories: readonly string[];
}

/**
 * Whether selecting a session that shows `next` switches the editor window from `shown` to its folders: the
 * session works in another worktree of the same repositories.
 */
export function shouldSwitchEditorFolders(shown: IEmbeddedEditorContent | undefined, next: IEmbeddedEditorContent): boolean {
	const folderKeys = (content: IEmbeddedEditorContent) => content.folders.map(folder => folder.folderUri.toString());
	return !!shown && shown.repositories.length > 0 && equals(shown.repositories, next.repositories) && !equals(folderKeys(shown), folderKeys(next));
}

/**
 * Remembers what the editor window that the Agents window shows opens, so that a restart shows it again.
 */
export class EmbeddedEditorMemory {

	constructor(private readonly storageService: IStorageService) { }

	get content(): IEmbeddedEditorContent | undefined {
		try {
			const value = JSON.parse(this.storageService.get(EMBEDDED_EDITOR_STORAGE_KEY, StorageScope.WORKSPACE, 'null'));
			const folders: unknown[] = Array.isArray(value?.folders) ? value.folders : [];
			const content = {
				folders: folders
					.filter((folder): folder is { folderUri: string; label?: string } => typeof (folder as { folderUri?: unknown })?.folderUri === 'string')
					.map(folder => ({ folderUri: URI.parse(folder.folderUri), label: typeof folder.label === 'string' ? folder.label : undefined })),
				repositories: Array.isArray(value?.repositories) ? value.repositories.filter((repository: unknown): repository is string => typeof repository === 'string') : [],
			};
			return content.folders.length ? content : undefined;
		} catch {
			return undefined;
		}
	}

	remember(content: IEmbeddedEditorContent): void {
		const value = {
			folders: content.folders.map(folder => ({ folderUri: folder.folderUri.toString(), label: folder.label })),
			repositories: content.repositories,
		};
		this.storageService.store(EMBEDDED_EDITOR_STORAGE_KEY, JSON.stringify(value), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	forget(): void {
		this.storageService.remove(EMBEDDED_EDITOR_STORAGE_KEY, StorageScope.WORKSPACE);
	}
}

class EmbeddedEditorService extends Disposable implements IEmbeddedEditorService {

	declare readonly _serviceBrand: undefined;

	private readonly visibleWindowId = observableValue<number | undefined>(this, undefined);
	readonly visible = derived(this, reader => this.visibleWindowId.read(reader) !== undefined);

	private readonly memory: EmbeddedEditorMemory;
	private readonly targetResolver: EditorWindowTargetResolver;

	/** The chat that the editor window shows in its chat view, as handed to it from here. */
	private handedChat: string | undefined;

	/** What the editor window shows, or is about to. */
	private shown: IEmbeddedEditorContent | undefined;

	get enabled(): boolean {
		return this.configurationService.getValue<boolean>(EMBEDDED_EDITOR_SETTING) === true;
	}

	constructor(
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsService sessionsService: ISessionsService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IDialogService private readonly dialogService: IDialogService,
		@IStorageService storageService: IStorageService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.memory = new EmbeddedEditorMemory(storageService);
		this.targetResolver = instantiationService.createInstance(EditorWindowTargetResolver);

		const onDidChangeEmbeddedEditorWindow = (_event: unknown, windowId: unknown) => {
			const visibleWindowId = typeof windowId === 'number' ? windowId : undefined;

			// Left or closed by the user, rather than closed with this window
			if (visibleWindowId === undefined && !lifecycleService.willShutdown) {
				this.memory.forget();
				this.handedChat = undefined;
				this.shown = undefined;
			}
			this.visibleWindowId.set(visibleWindowId, undefined);
		};
		ipcRenderer.on(EMBEDDED_EDITOR_WINDOW_CHANGED_CHANNEL, onDidChangeEmbeddedEditorWindow);
		this._register(toDisposable(() => ipcRenderer.removeListener(EMBEDDED_EDITOR_WINDOW_CHANGED_CHANNEL, onDidChangeEmbeddedEditorWindow)));

		const visibleContext = EmbeddedEditorVisibleContext.bindTo(contextKeyService);
		this._register(autorun(reader => visibleContext.set(this.visible.read(reader))));

		this._register(autorun(reader => {
			const windowId = this.visibleWindowId.read(reader);
			if (windowId !== undefined) {
				this.whileVisible(windowId, reader.store);
			}
		}));

		const activeChat = derived(this, reader => {
			const pane = sessionsService.activePane.read(reader);
			const session = pane?.session.read(reader);
			return session ? { session, chat: pane?.chat.read(reader) } : undefined;
		});

		// The editor window of the last run shows again
		let restored = false;
		this._register(autorun(reader => {
			if (restored || !sessionsService.initialRestoreComplete.read(reader) || !this.enabled) {
				return;
			}
			restored = true;

			const content = this.memory.content;
			if (content) {
				const active = activeChat.read(undefined);
				const chatSessionToOpen = active && this.targetResolver.resolveChatSession(active.session, active.chat, { notify: false });
				void this.showContent(content, chatSessionToOpen).catch(error => {
					this.memory.forget();
					this.logService.error('[EmbeddedEditor] could not restore the editor window', error);
				});
			}
		}));

		// While the editor window shows, selecting a chat shows it in the chat view of the editor window, and the
		// editor window switches to the worktree of the chat when it works in another worktree of the same repository
		this._register(autorun(reader => {
			const active = activeChat.read(reader);
			if (!active || this.visibleWindowId.read(reader) === undefined) {
				return;
			}

			// The folders of a chat can arrive after the chat
			(active.chat ?? active.session.mainChat.read(reader)).workspace.read(reader);
			const target = this.targetResolver.resolve(active.session, active.chat, { notify: false });
			if (target.kind === 'folders' && shouldSwitchEditorFolders(this.shown, target)) {
				void this.showContent(target, target.chatSessionToOpen).catch(error => this.logService.error('[EmbeddedEditor] could not switch the editor window to the worktree of the chat', error));
				return;
			}

			const chatSessionToOpen = this.targetResolver.resolveChatSession(active.session, active.chat, { notify: false });
			if (chatSessionToOpen && chatSessionToOpen.toString() !== this.handedChat) {
				this.handedChat = chatSessionToOpen.toString();
				void this.nativeHostService.openChatInEmbeddedEditorWindow(chatSessionToOpen);
			}
		}));
	}

	async show(session: ISession, chat?: IChat): Promise<boolean> {
		const target = this.targetResolver.resolve(session, chat);
		if (target.kind !== 'folders') {
			return false;
		}

		await this.showContent(target, target.chatSessionToOpen);
		return true;
	}

	private async showContent(content: IEmbeddedEditorContent, chatSessionToOpen: URI | undefined): Promise<void> {
		const bounds = this.computeBounds();
		if (!bounds) {
			this.logService.warn('[EmbeddedEditor] the Agents window has no room to show an editor window');
			return;
		}

		this.shown = { folders: content.folders, repositories: content.repositories };
		this.memory.remember(this.shown);
		this.handedChat = chatSessionToOpen?.toString();
		await this.nativeHostService.showEmbeddedEditorWindow([...content.folders], { chatSessionToOpen, bounds });
	}

	async hide(): Promise<void> {
		this.memory.forget();
		await this.nativeHostService.hideEmbeddedEditorWindow();
	}

	private whileVisible(windowId: number, store: DisposableStore): void {

		// Hide what the editor window covers, so that it is out of reach of keyboard and screen reader navigation
		const mainContainer = this.layoutService.mainContainer;
		mainContainer.classList.add('embedded-editor-visible');
		store.add(toDisposable(() => mainContainer.classList.remove('embedded-editor-visible')));
		for (const container of COVERED_PARTS.map(part => this.layoutService.getContainer(mainWindow, part))) {
			container?.classList.add('embedded-editor-covered');
			store.add(toDisposable(() => container?.classList.remove('embedded-editor-covered')));
		}

		// Follow the layout of the Agents window
		const pendingLayout = store.add(new MutableDisposable());
		const occluded = observableValue<boolean>(this, false);
		const layout = () => {
			pendingLayout.value ??= scheduleAtNextAnimationFrame(mainWindow, () => {
				pendingLayout.clear();
				const bounds = this.computeBounds(occluded.get());
				if (bounds) {
					void this.nativeHostService.layoutEmbeddedEditorWindow(bounds);
				}
			});
		};
		const resizeObserver = store.add(new DisposableResizeObserver('sessions.embeddedEditor', layout, mainWindow));
		store.add(resizeObserver.observe(this.layoutService.mainContainer));
		const sidebarContainer = this.layoutService.getContainer(mainWindow, Parts.SIDEBAR_PART);
		if (sidebarContainer) {
			store.add(resizeObserver.observe(sidebarContainer));
		}
		store.add(this.layoutService.onDidLayoutMainContainer(layout));
		store.add(this.layoutService.onDidChangePartVisibility(layout));
		store.add(onDidChangeZoomLevel(layout));
		store.add(autorun(reader => {
			occluded.read(reader);
			layout();
		}));

		// The editor window renders above this window's content, so content of this window that shows
		// over it, such as the quick input and dialogs, is shown over a picture of the editor window
		this.occludeWhile(windowId, store, occluded, this.quickInputService.onShow, this.quickInputService.onHide);
		this.occludeWhile(windowId, store, occluded, this.dialogService.onWillShowDialog, this.dialogService.onDidShowDialog);
	}

	private occludeWhile(windowId: number, store: DisposableStore, occluded: ISettableObservable<boolean>, onShow: Event<void>, onHide: Event<void>): void {
		const picture = store.add(new MutableDisposable());
		let generation = 0;
		store.add(onShow(async () => {
			const current = ++generation;
			const bounds = this.computeBounds();
			const screenshot = bounds && await this.nativeHostService.getScreenshot(undefined, { targetWindowId: windowId });
			if (current !== generation || !bounds || store.isDisposed) {
				return;
			}

			const disposables = new DisposableStore();
			if (screenshot) {
				const url = URL.createObjectURL(new Blob([screenshot.buffer.slice()], { type: 'image/jpeg' }));
				disposables.add(toDisposable(() => URL.revokeObjectURL(url)));
				const image = $<HTMLImageElement>('img.embedded-editor-picture');
				image.src = url;
				image.alt = '';
				image.style.left = `${bounds.x}px`;
				image.style.top = `${bounds.y}px`;
				image.style.width = `${bounds.width}px`;
				image.style.height = `${bounds.height}px`;
				image.style.borderRadius = `${bounds.cornerRadius}px`;
				this.layoutService.mainContainer.appendChild(image);
				disposables.add(toDisposable(() => image.remove()));
			}
			occluded.set(true, undefined);
			disposables.add(toDisposable(() => occluded.set(false, undefined)));
			picture.value = disposables;
		}));
		store.add(onHide(() => {
			generation++;
			picture.clear();
		}));
	}

	/**
	 * The area to the right of the sessions list and below the title bar, in CSS pixels.
	 */
	private computeBounds(occluded?: boolean): IEmbeddedWindowBounds | undefined {
		const mainContainer = this.layoutService.mainContainer;
		const containerRect = mainContainer.getBoundingClientRect();
		const titleBarRect = this.layoutService.getContainer(mainWindow, Parts.TITLEBAR_PART)?.getBoundingClientRect();
		const sidebarRect = this.layoutService.isVisible(Parts.SIDEBAR_PART, mainWindow) ? this.layoutService.getContainer(mainWindow, Parts.SIDEBAR_PART)?.getBoundingClientRect() : undefined;

		// The workbench grid keeps the outer gap at the right and bottom edges of the window
		const gap = parseFloat(mainWindow.getComputedStyle(mainContainer).getPropertyValue('--agents-outer-panel-gap')) || 0;
		const left = (sidebarRect ? sidebarRect.right : containerRect.left) + gap;
		const top = titleBarRect && titleBarRect.height > 0 ? titleBarRect.bottom : containerRect.top + gap;
		const width = containerRect.right - gap - left;
		const height = containerRect.bottom - gap - top;
		if (width <= 0 || height <= 0) {
			return undefined;
		}

		const sessionsContainer = this.layoutService.getContainer(mainWindow, Parts.SESSIONS_PART);
		const cornerRadius = sessionsContainer ? parseFloat(mainWindow.getComputedStyle(sessionsContainer).borderTopLeftRadius) || 0 : 0;

		return { x: left, y: top, width, height, zoomFactor: getZoomFactor(mainWindow), cornerRadius, occluded };
	}
}

registerSingleton(IEmbeddedEditorService, EmbeddedEditorService, InstantiationType.Delayed);

/**
 * Starts the service with the window, so that the selected session shows the editor window it had.
 */
export class EmbeddedEditorRestoreContribution implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.embeddedEditorRestore';

	constructor(@IEmbeddedEditorService _embeddedEditorService: IEmbeddedEditorService) { }
}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[EMBEDDED_EDITOR_SETTING]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			description: localize('editorInAgentsWindow', "Controls whether Open in Editor shows the editor for a session's folders inside the Agents window, next to the sessions list, instead of in a window of its own. While the editor shows, selecting a session shows its chat in the chat view of the editor. Back to Agents shows the sessions again."),
		}
	}
});
