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
import { EMBEDDED_EDITOR_WINDOW_CHANGED_CHANNEL, IEmbeddedWindowBounds } from '../../platform/window/common/window.js';
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
	 * Shows an editor window for the folders of the session, and remembers to show it whenever the session is selected.
	 * Returns `false` when the session has no folders to open in the Agents window.
	 */
	show(session: ISession, chat?: IChat): Promise<boolean>;

	/**
	 * Shows the session again in place of its editor window, and forgets to show the editor window for it.
	 */
	hide(): Promise<void>;
}

/** Parts of the Agents window that the editor window covers while it shows. */
const COVERED_PARTS = [Parts.SESSIONS_PART, Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART, Parts.PANEL_PART, Parts.CUSTOM_VIEW_GRID_PART];

const SESSIONS_WITH_EDITOR_STORAGE_KEY = 'sessions.embeddedEditor.sessions';

/**
 * Remembers which sessions show their editor window, and decides what selecting a session shows.
 */
export class EmbeddedEditorSessionMemory {

	/** The sessions that show their editor window whenever they are selected. */
	private readonly sessions: Set<string>;

	/** The session whose editor window shows, or is about to. */
	private shownSessionId: string | undefined;

	/** Whether the editor window hides because another session is selected, so the session it showed for keeps it. */
	private hidingForSessionChange = false;

	private selectedSessionId: string | undefined;
	private restorePending = false;

	constructor(private readonly storageService: IStorageService) {
		this.sessions = new Set(this.read());
	}

	/**
	 * What to show now that `session` is selected, or its folders changed.
	 */
	select(session: ISession | undefined, hasFolders: boolean): 'show' | 'hide' | undefined {
		const sessionChanged = session?.sessionId !== this.selectedSessionId;
		if (!sessionChanged && !this.restorePending) {
			return undefined;
		}
		this.selectedSessionId = session?.sessionId;

		const remembered = !!session && this.isRemembered(session);

		// The folders of a restored session can arrive after the session
		this.restorePending = remembered && !hasFolders;
		if (remembered && hasFolders) {
			return this.shownSessionId === session.sessionId ? undefined : 'show';
		}

		if (sessionChanged && this.shownSessionId !== undefined) {
			this.hidingForSessionChange = true;
			this.shownSessionId = undefined;
			return 'hide';
		}

		return undefined;
	}

	willShow(sessionId: string): void {
		this.shownSessionId = sessionId;
		this.hidingForSessionChange = false;
		this.remember(sessionId);
	}

	didFailToShow(sessionId: string): void {
		this.forget(sessionId);
		if (this.shownSessionId === sessionId) {
			this.shownSessionId = undefined;
		}
	}

	/** The user asks to show the session instead of its editor window. */
	willHide(): void {
		if (this.shownSessionId) {
			this.forget(this.shownSessionId);
		}
	}

	/** The editor window no longer shows, which unless another session was selected, the user asked for. */
	didHide(): void {
		if (!this.hidingForSessionChange && this.shownSessionId) {
			this.forget(this.shownSessionId);
		}
		this.hidingForSessionChange = false;
		this.shownSessionId = undefined;
	}

	/** Whether the session shows its editor window, also when it was remembered under an earlier identity. */
	private isRemembered(session: ISession): boolean {
		if (this.sessions.has(session.sessionId)) {
			return true;
		}

		const previous = session.previousIdentities?.find(identity => this.sessions.has(identity.sessionId));
		if (!previous) {
			return false;
		}

		this.sessions.delete(previous.sessionId);
		this.remember(session.sessionId);
		return true;
	}

	private remember(sessionId: string): void {
		if (!this.sessions.has(sessionId)) {
			this.sessions.add(sessionId);
			this.store();
		}
	}

	private forget(sessionId: string): void {
		if (this.sessions.delete(sessionId)) {
			this.store();
		}
	}

	private read(): string[] {
		try {
			const value = JSON.parse(this.storageService.get(SESSIONS_WITH_EDITOR_STORAGE_KEY, StorageScope.WORKSPACE, '[]'));
			return Array.isArray(value) ? value.filter((sessionId): sessionId is string => typeof sessionId === 'string') : [];
		} catch {
			return [];
		}
	}

	private store(): void {
		if (this.sessions.size === 0) {
			this.storageService.remove(SESSIONS_WITH_EDITOR_STORAGE_KEY, StorageScope.WORKSPACE);
		} else {
			this.storageService.store(SESSIONS_WITH_EDITOR_STORAGE_KEY, JSON.stringify([...this.sessions]), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}
}

class EmbeddedEditorService extends Disposable implements IEmbeddedEditorService {

	declare readonly _serviceBrand: undefined;

	private readonly visibleWindowId = observableValue<number | undefined>(this, undefined);
	readonly visible = derived(this, reader => this.visibleWindowId.read(reader) !== undefined);

	private readonly memory: EmbeddedEditorSessionMemory;
	private readonly targetResolver: EditorWindowTargetResolver;

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
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.memory = new EmbeddedEditorSessionMemory(storageService);
		this.targetResolver = instantiationService.createInstance(EditorWindowTargetResolver);

		const onDidChangeEmbeddedEditorWindow = (_event: unknown, windowId: unknown) => {
			const visibleWindowId = typeof windowId === 'number' ? windowId : undefined;
			if (visibleWindowId === undefined) {
				this.memory.didHide();
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

		// Selecting a session shows its editor window if it had one, else its content
		this._register(autorun(reader => {
			if (!sessionsService.initialRestoreComplete.read(reader) || !this.enabled) {
				return;
			}

			const pane = sessionsService.activePane.read(reader);
			const session = pane?.session.read(reader);
			const chat = pane?.chat.read(reader);
			const hasFolders = !!(chat ?? session?.mainChat.read(reader))?.workspace.read(reader)?.folders.length;
			switch (this.memory.select(session, hasFolders)) {
				case 'show':
					if (session) {
						void this.doShow(session, chat, false);
					}
					break;
				case 'hide':
					void this.nativeHostService.hideEmbeddedEditorWindow();
					break;
			}
		}));
	}

	show(session: ISession, chat?: IChat): Promise<boolean> {
		return this.doShow(session, chat, true);
	}

	private async doShow(session: ISession, chat: IChat | undefined, userRequested: boolean): Promise<boolean> {
		const target = this.targetResolver.resolve(session, chat, { notify: userRequested });
		if (target.kind !== 'folders') {
			return false;
		}

		const bounds = this.computeBounds();
		if (!bounds) {
			this.logService.warn('[EmbeddedEditor] the Agents window has no room to show an editor window');
			return true;
		}

		this.memory.willShow(session.sessionId);
		try {
			await this.nativeHostService.showEmbeddedEditorWindow(target.folders, { chatSessionToOpen: target.chatSessionToOpen, bounds });
		} catch (error) {
			this.memory.didFailToShow(session.sessionId);
			if (userRequested) {
				throw error;
			}
			this.logService.error('[EmbeddedEditor] could not restore the editor window of a session', error);
		}
		return true;
	}

	async hide(): Promise<void> {
		this.memory.willHide();
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
			description: localize('editorInAgentsWindow', "Controls whether Open in Editor shows the editor for a session's folders inside the Agents window, next to the sessions list, instead of in a window of its own. Open in Editor again, or selecting another session, shows the session again."),
		}
	}
});
