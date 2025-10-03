/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { RuntimeState, ILanguageRuntimeService } from '../../../../services/languageRuntime/common/languageRuntimeService.js';
import { ILanguageRuntimeSession, IRuntimeSessionService } from '../../../../services/runtimeSession/common/runtimeSessionService.js';
import { ShowHelpEvent } from '../../../../services/languageRuntime/common/erdosHelpComm.js';
import { TopicWebviewDisplay } from '../models/helpEntry.js';
import { IHelpEntry } from '../topicViewContract.js';
import { HelpHistoryManager } from './helpHistoryManager.js';
import { HelpProxyManager } from './helpProxyManager.js';
import { HelpClientManager } from './helpClientManager.js';
import { isLocalhost, buildProxyUrl } from '../utils/urlUtils.js';

const HELP_HTML_FILE_PATH = 'vs/workbench/contrib/erdosHelp/browser/resources/help.html';
export const ERDOS_HELP_VIEW_ID = 'workbench.panel.erdosHelp';
export const ERDOS_HELP_SERVICE_ID = 'erdosHelpService';

export interface IHelpRuntime {
	languageId: string;
	languageName: string;
	isActive: boolean;
	base64EncodedIconSvg?: string;
}

export interface IErdosHelpService {
	readonly _serviceBrand: undefined;
	readonly helpEntries: IHelpEntry[];
	readonly currentHelpEntry?: IHelpEntry;
	readonly canNavigateBackward: boolean;
	readonly canNavigateForward: boolean;
	readonly onDidFocusHelp: Event<void>;
	readonly onDidChangeCurrentHelpEntry: Event<IHelpEntry | undefined>;

	initialize(): void;
	openHelpEntryIndex(helpEntryIndex: number): void;
	showHelpTopic(languageId: string, topic: string): Promise<boolean>;
	searchHelpTopics(languageId: string, query: string): Promise<string[]>;
	getHelpClients(): Array<any>;
	getActiveHelpRuntimes(): IHelpRuntime[];
	navigate(fromUrl: string, toUrl: string): void;
	navigateBackward(): void;
	navigateForward(): void;
	find(): void;
	showWelcomePage(): void;
	clearHistory(): void;
}

class HelpService extends Disposable implements IErdosHelpService {
	private _helpHTML = '<!DOCTYPE html><html><body></body></html>';

	private readonly _historyManager: HelpHistoryManager;
	private readonly _proxyManager: HelpProxyManager;
	private readonly _clientManager: HelpClientManager;
	private readonly _sessionListeners = new Map<string, DisposableStore>();

	private readonly _onDidFocusHelpEmitter: Emitter<void>;
	private readonly _onDidChangeCurrentHelpEntryEmitter: Emitter<IHelpEntry | undefined>;

	constructor(
		@ICommandService commandService: ICommandService,
		@IFileService fileService: IFileService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILanguageRuntimeService private readonly _languageRuntimeService: ILanguageRuntimeService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IRuntimeSessionService private readonly _runtimeSessionService: IRuntimeSessionService,
		@IThemeService themeService: IThemeService,
		@IViewsService private readonly _viewsService: IViewsService,
	) {
		super();

		this._onDidFocusHelpEmitter = this._register(new Emitter<void>());
		this._onDidChangeCurrentHelpEntryEmitter = this._register(new Emitter<IHelpEntry | undefined>());

		this._historyManager = new HelpHistoryManager();
		this._proxyManager = new HelpProxyManager(commandService, _instantiationService);
		this._clientManager = new HelpClientManager();

		this.initializeHtmlTemplate(fileService);

		this._register(
			_runtimeSessionService.onDidChangeRuntimeState((event: any) => {
				if (event.new_state === RuntimeState.Ready) {
					this.connectRuntimeSession(event.session_id);
				}
			})
		);

		this._register(
			themeService.onDidColorThemeChange(() => {
				this._proxyManager.applyCurrentTheme();
			})
		);
	}

	declare readonly _serviceBrand: undefined;

	get helpEntries(): IHelpEntry[] {
		return [...this._historyManager.getAllEntries()];
	}

	get currentHelpEntry(): IHelpEntry | undefined {
		return this._historyManager.getActiveEntry();
	}

	get canNavigateBackward(): boolean {
		return this._historyManager.hasBackHistory();
	}

	get canNavigateForward(): boolean {
		return this._historyManager.hasForwardHistory();
	}

	get onDidFocusHelp(): Event<void> {
		return this._onDidFocusHelpEmitter.event;
	}

	get onDidChangeCurrentHelpEntry(): Event<IHelpEntry | undefined> {
		return this._onDidChangeCurrentHelpEntryEmitter.event;
	}

	initialize(): void { }

	openHelpEntryIndex(helpEntryIndex: number): void {
		const entry = this._historyManager.jumpToIndex(helpEntryIndex);
		if (entry) {
			this._onDidChangeCurrentHelpEntryEmitter.fire(entry);
		}
	}

	async showHelpTopic(languageId: string, topic: string): Promise<boolean> {
		const clients = this._clientManager.findClientsByLanguage(languageId);
		if (clients.length === 0) {
			return false;
		}
		// Use the most recently attached client (last in array)
		const client = clients[clients.length - 1];
		return await client.showHelpTopic(topic);
	}

	async searchHelpTopics(languageId: string, query: string): Promise<string[]> {
		const clients = this._clientManager.findClientsByLanguage(languageId);
		if (clients.length === 0) {
			return [];
		}
		return await clients[0].searchHelpTopics(query);
	}

	getHelpClients(): Array<any> {
		return this._clientManager.retrieveAllClients();
	}

	getActiveHelpRuntimes(): IHelpRuntime[] {
		const registeredRuntimes = this._languageRuntimeService.registeredRuntimes;
		const sessions = this._runtimeSessionService.activeSessions;

		const activeSessionsByLanguageId = new Map<string, boolean>();
		for (const session of sessions) {
			const isReady = session.getRuntimeState() === RuntimeState.Ready;
			activeSessionsByLanguageId.set(session.runtimeMetadata.languageId, isReady);
		}

		const runtimesByLanguageId = new Map<string, IHelpRuntime>();

		for (const runtime of registeredRuntimes) {
			const isActive = activeSessionsByLanguageId.get(runtime.languageId) || false;

			const existing = runtimesByLanguageId.get(runtime.languageId);
			if (!existing || (isActive && !existing.isActive)) {
				runtimesByLanguageId.set(runtime.languageId, {
					languageId: runtime.languageId,
					languageName: runtime.languageName,
					isActive: isActive,
					base64EncodedIconSvg: runtime.base64EncodedIconSvg
				});
			}
		}

		const runtimes: IHelpRuntime[] = Array.from(runtimesByLanguageId.values());
		return runtimes.sort((a, b) => a.languageName.localeCompare(b.languageName));
	}

	navigate(fromUrl: string, toUrl: string): void {
		const current = this._historyManager.getActiveEntry();
		if (!current || current.sourceUrl !== fromUrl) {
			return;
		}

		const targetUrl = new URL(toUrl);
		const currentTargetUrl = new URL(current.targetUrl);
		targetUrl.protocol = currentTargetUrl.protocol;
		targetUrl.hostname = currentTargetUrl.hostname;
		targetUrl.port = currentTargetUrl.port;

		const entry = this._instantiationService.createInstance(
			TopicWebviewDisplay,
			this._helpHTML,
			current.languageId,
			current.sessionId,
			current.languageName,
			toUrl,
			targetUrl.toString()
		);

		this._register(entry.onUrlChanged((url: string) => {
			this.navigate(entry.sourceUrl, url);
		}));

		this._register(entry.onBackwardNavigation(() => {
			this.navigateBackward();
		}));

		this._register(entry.onForwardNavigation(() => {
			this.navigateForward();
		}));

		this._historyManager.recordEntry(entry);
		this._onDidChangeCurrentHelpEntryEmitter.fire(entry);
	}

	navigateBackward(): void {
		const entry = this._historyManager.moveBackward();
		if (entry) {
			this._onDidChangeCurrentHelpEntryEmitter.fire(entry);
		}
	}

	navigateForward(): void {
		const entry = this._historyManager.moveForward();
		if (entry) {
			this._onDidChangeCurrentHelpEntryEmitter.fire(entry);
		}
	}

	find(): void {
		this._historyManager.getActiveEntry()?.activateFindWidget();
	}

	clearHistory(): void {
		this._historyManager.removeAll();
		this._onDidChangeCurrentHelpEntryEmitter.fire(undefined);
	}

	async connectRuntimeSession(sessionId: string): Promise<void> {
		const session = this._runtimeSessionService.getSession(sessionId);
		if (!session) {
			return;
		}

		// Dispose old listeners for this session if they exist
		const oldListener = this._sessionListeners.get(sessionId);
		if (oldListener) {
			oldListener.dispose();
		}

		const client = await this._clientManager.registerSession(session);

		// Create a disposable store for this session's listeners
		const store = new DisposableStore();
		
		store.add(
			client.onDidEmitHelpContent((event: any) =>
				this.processHelpContentEvent(session, event)
			)
		);

		store.add(
			client.onDidClose(() => {
				this._historyManager.clearSessionEntries(sessionId);
				this._clientManager.unregisterSession(sessionId);
				this._sessionListeners.delete(sessionId);
			})
		);

		this._sessionListeners.set(sessionId, store);
		this._register(store);
	}

	private async processHelpContentEvent(
		session: ILanguageRuntimeSession,
		event: ShowHelpEvent
	): Promise<void> {
		if (event.kind !== 'url') {
			return;
		}

		const targetUrl = new URL(event.content);

		if (!isLocalhost(targetUrl.hostname)) {
			await this._openerService.open(targetUrl.toString(), { openExternal: true });
			return;
		}

		const proxyOrigin = await this._proxyManager.activateProxyServer(targetUrl.origin);
		if (!proxyOrigin) {
			return;
		}

		const sourceUrl = buildProxyUrl(targetUrl, proxyOrigin);

		await this._viewsService.openView(ERDOS_HELP_VIEW_ID, false);

		const entry = this._instantiationService.createInstance(
			TopicWebviewDisplay,
			this._helpHTML,
			session.runtimeMetadata.languageId,
			session.runtimeMetadata.runtimeId,
			session.runtimeMetadata.languageName,
			sourceUrl,
			targetUrl.toString()
		);

		this._register(entry.onUrlChanged((url: string) => {
			this.navigate(entry.sourceUrl, url);
		}));

		this._register(entry.onBackwardNavigation(() => {
			this.navigateBackward();
		}));

		this._register(entry.onForwardNavigation(() => {
			this.navigateForward();
		}));

		this._historyManager.recordEntry(entry);
		this._onDidChangeCurrentHelpEntryEmitter.fire(entry);

		if (event.focus) {
			this._onDidFocusHelpEmitter.fire();
		}
	}

	showWelcomePage(): void {
		this._onDidChangeCurrentHelpEntryEmitter.fire(undefined);
	}

	private async initializeHtmlTemplate(fileService: IFileService): Promise<void> {
		try {
			const content = await fileService.readFile(
				FileAccess.asFileUri(HELP_HTML_FILE_PATH)
			);
			this._helpHTML = content.value.toString();
		} catch {
			this._helpHTML = '<!DOCTYPE html><html><body>Error loading help</body></html>';
		}
	}
}

export const IErdosHelpService = createDecorator<IErdosHelpService>(ERDOS_HELP_SERVICE_ID);

registerSingleton(IErdosHelpService, HelpService, InstantiationType.Delayed);

