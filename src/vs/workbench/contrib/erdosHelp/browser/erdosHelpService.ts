/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { FileAccess } from '../../../../base/common/network.js';
import { join } from '../../../../base/common/path.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';

import { ILogService } from '../../../../platform/log/common/log.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { isLocalhost } from './utils.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService, OpenExternalOptions } from '../../../../platform/opener/common/opener.js';
import { WebviewThemeDataProvider } from '../../webview/browser/themeing.js';
import { HelpEntry, IHelpEntry } from './helpEntry.js';
import { ShowHelpEvent } from '../../../services/languageRuntime/common/erdosHelpComm.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { HelpClientInstance } from '../../../services/languageRuntime/common/languageRuntimeHelpClient.js';
import { RuntimeState } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { ILanguageRuntimeSession, IRuntimeSessionService, RuntimeClientType } from '../../../services/runtimeSession/common/runtimeSessionService.js';

const HELP_HTML_FILE_PATH = 'vs/workbench/contrib/erdosHelp/browser/resources/help.html';

export const ERDOS_HELP_VIEW_ID = 'workbench.panel.erdosHelp';

export const ERDOS_HELP_SERVICE_ID = 'erdosHelpService';

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
	navigate(fromUrl: string, toUrl: string): void;
	navigateBackward(): void;
	navigateForward(): void;
	find(): void;
	clearHistory(): void;
	showWelcomePage(): void;
}

class ErdosHelpService extends Disposable implements IErdosHelpService {
	private _helpHTML = '<!DOCTYPE html><html><body></body></html>';

	private _helpEntries: HelpEntry[] = [];

	private _helpEntryEventListeners: IDisposable[] = [];

	private _helpEntryIndex = -1;

	private _proxyServerStylesHaveBeenSet = false;

	private readonly _proxyServers = new Map<string, string>();

	private readonly _helpClients = new Map<string, HelpClientInstance>();

	private readonly _onDidFocusHelpEmitter = this._register(new Emitter<void>);

	private readonly _onDidChangeCurrentHelpEntryEmitter =
		this._register(new Emitter<IHelpEntry | undefined>);

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@IFileService private readonly _fileService: IFileService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IRuntimeSessionService private readonly _runtimeSessionService: IRuntimeSessionService,
		@IThemeService private readonly _themeService: IThemeService,
		@IViewsService private readonly _viewsService: IViewsService,

	) {
		super();

		this._fileService.readFile(FileAccess.asFileUri(HELP_HTML_FILE_PATH))
			.then(fileContent => {
				this._helpHTML = fileContent.value.toString();
			}).catch(error => {
				this._helpHTML = notFoundHelper(error, HELP_HTML_FILE_PATH);
			});

		this._register(this._themeService.onDidColorThemeChange(async _colorTheme => {
			await this.setProxyServerStyles();
		}));

		this._register(
			this._runtimeSessionService.onDidChangeRuntimeState(languageRuntimeStateEvent => {
				if (languageRuntimeStateEvent.new_state === RuntimeState.Ready) {
					this.attachRuntime(languageRuntimeStateEvent.session_id);
				}
			})
		);
	}

	showHelpTopic(languageId: string, topic: string): Promise<boolean> {
		const clients = this._helpClients.values();
		for (const client of clients) {
			if (client.languageId === languageId) {
				return client.showHelpTopic(topic);
			}
		}
		this._logService.warn(`Can't show help for ${topic}: ` +
			`no runtime for language ${languageId} is active.`);
		return Promise.resolve(false);
	}

	searchHelpTopics(languageId: string, query: string): Promise<string[]> {
		this._logService.debug(`ErdosHelpService.searchHelpTopics: Searching ${languageId} for query="${query}"`);
		
		const clients = this._helpClients.values();
		const clientsArray = Array.from(clients);
		this._logService.debug(`ErdosHelpService.searchHelpTopics: Found ${clientsArray.length} help clients`, clientsArray.map(c => c.languageId));
		
		for (const client of clientsArray) {
			if (client.languageId === languageId) {
				this._logService.debug(`ErdosHelpService.searchHelpTopics: Found matching client for ${languageId}, calling searchHelpTopics`);
				return client.searchHelpTopics(query);
			}
		}
		
		this._logService.warn(`ErdosHelpService.searchHelpTopics: Can't search help topics for query ${query}: ` +
			`no runtime for language ${languageId} is active.`);
		return Promise.resolve([]);
	}

	private disposeHelpEntryEventListeners(): void {
		this._helpEntryEventListeners.forEach(disposable => disposable.dispose());
		this._helpEntryEventListeners = [];
	}

	public override dispose(): void {
		this.disposeHelpEntryEventListeners();
		this._helpEntries.forEach(helpEntry => helpEntry.dispose());

		super.dispose();
	}

	declare readonly _serviceBrand: undefined;

	public get helpEntries(): IHelpEntry[] {
		return this._helpEntries;
	}

	get currentHelpEntry(): IHelpEntry {
		return this._helpEntries[this._helpEntryIndex];
	}

	get canNavigateBackward() {
		return this._helpEntryIndex > 0;
	}

	get canNavigateForward() {
		return this._helpEntryIndex < this._helpEntries.length - 1;
	}

	readonly onDidFocusHelp = this._onDidFocusHelpEmitter.event;

	readonly onDidChangeCurrentHelpEntry = this._onDidChangeCurrentHelpEntryEmitter.event;

	initialize() {
	}

	openHelpEntryIndex(helpEntryIndex: number) {
		if (helpEntryIndex < 0 || helpEntryIndex > this._helpEntries.length - 1) {
			this._logService.error(`ErdosHelpService help entry index ${helpEntryIndex} is out of range.`);
			return;
		}

		this._helpEntryIndex = helpEntryIndex;
		this._onDidChangeCurrentHelpEntryEmitter.fire(this._helpEntries[this._helpEntryIndex]);
	}

	navigate(fromUrl: string, toUrl: string) {
		const currentHelpEntry = this._helpEntries[this._helpEntryIndex];
		if (currentHelpEntry && currentHelpEntry.sourceUrl === fromUrl) {
			const currentTargetUrl = new URL(currentHelpEntry.targetUrl);
			const targetUrl = new URL(toUrl);
			targetUrl.protocol = currentTargetUrl.protocol;
			targetUrl.hostname = currentTargetUrl.hostname;
			targetUrl.port = currentTargetUrl.port;

			const helpEntry = this._instantiationService.createInstance(HelpEntry,
				this._helpHTML,
				currentHelpEntry.languageId,
				currentHelpEntry.sessionId,
				currentHelpEntry.languageName,
				toUrl,
				targetUrl.toString()
			);

			this._helpEntryEventListeners.push(helpEntry.onDidNavigate((url: string) => {
				this.navigate(helpEntry.sourceUrl, url);
			}));

			this._helpEntryEventListeners.push(helpEntry.onDidNavigateBackward(() => {
				this.navigateBackward();
			}));

			this._helpEntryEventListeners.push(helpEntry.onDidNavigateForward(() => {
				this.navigateForward();
			}));

			this.addHelpEntry(helpEntry);
		}
	}

	navigateBackward() {
		if (this._helpEntryIndex > 0) {
			this._onDidChangeCurrentHelpEntryEmitter.fire(this._helpEntries[--this._helpEntryIndex]);
		}
	}

	navigateForward() {
		if (this._helpEntryIndex < this._helpEntries.length - 1) {
			this._onDidChangeCurrentHelpEntryEmitter.fire(this._helpEntries[++this._helpEntryIndex]);
		}
	}

	find() {
		this.currentHelpEntry.showFind();
	}

	clearHistory() {
		this.disposeHelpEntryEventListeners();
		this._helpEntries.forEach(entry => entry.dispose());
		this._helpEntries = [];
		this._helpEntryIndex = -1;
		this._onDidChangeCurrentHelpEntryEmitter.fire(undefined);
	}

	showWelcomePage() {
		this._onDidChangeCurrentHelpEntryEmitter.fire(undefined);
	}

	private async setProxyServerStyles() {
		const webviewThemeDataProvider = this._instantiationService.createInstance(
			WebviewThemeDataProvider
		);
		const { styles } = webviewThemeDataProvider.getWebviewThemeData();
		webviewThemeDataProvider.dispose();

		try {
			await this._commandService.executeCommand(
				'erdosProxy.setHelpProxyServerStyles',
				styles
			);

			this._proxyServerStylesHaveBeenSet = true;
		} catch (error) {
			this._logService.error('ErdosHelpService could not set the proxy server styles');
			this._logService.error(error);
		}
	}

	private addHelpEntry(helpEntry: HelpEntry) {
		if (this._helpEntries[this._helpEntryIndex]?.sourceUrl === helpEntry.sourceUrl) {
			return;
		}

		const deletedHelpEntries = [
			...this._helpEntries.splice(
				this._helpEntryIndex + 1,
				Infinity,
				helpEntry
			),
			...this._helpEntries.splice(
				0,
				this._helpEntries.length - 10
			)
		];

		deletedHelpEntries.forEach(deletedHelpEntry => deletedHelpEntry.dispose());

		this._helpEntryIndex = this._helpEntries.length - 1;

		this._onDidChangeCurrentHelpEntryEmitter.fire(this._helpEntries[this._helpEntryIndex]);
	}

	private deleteLanguageRuntimeHelpEntries(sessionId: string) {
		const helpEntriesToDelete = this._helpEntries.filter(helpEntryToCheck =>
			helpEntryToCheck.sessionId === sessionId
		);

		if (!helpEntriesToDelete.length) {
			return;
		}

		const currentHelpEntry = this._helpEntryIndex === -1 ?
			undefined :
			this._helpEntries[this._helpEntryIndex];

		this._helpEntries = this._helpEntries.filter(helpEntryToCheck =>
			helpEntryToCheck.sessionId !== sessionId
		);

		if (currentHelpEntry) {
			this._helpEntryIndex = currentHelpEntry.sessionId === sessionId ?
				-1 :
				this._helpEntries.indexOf(currentHelpEntry);
			this._onDidChangeCurrentHelpEntryEmitter.fire(this._helpEntries[this._helpEntryIndex]);
		}

		helpEntriesToDelete.forEach(deletedHelpEntry => deletedHelpEntry.dispose());

		const cleanupTargetOrigins = helpEntriesToDelete.map(helpEntry =>
			new URL(helpEntry.targetUrl).origin
		);

		const activeTargetOrigins = this._helpEntries.map(helpEntry =>
			new URL(helpEntry.targetUrl).origin
		);

		cleanupTargetOrigins.forEach(targetOrigin => {
			if (!activeTargetOrigins.includes(targetOrigin)) {
				this._commandService.executeCommand<boolean>(
					'erdosProxy.stopProxyServer',
					targetOrigin
				);
			}
		});
	}

	async attachRuntime(sessionId: string) {
		const session = this._runtimeSessionService.getSession(sessionId);
		if (!session) {
			this._logService.error(`ErdosHelpService could not attach to session ${sessionId}.`);
			return;
		}
		
		try {
			const existingClients = await session.listClients(RuntimeClientType.Help);

			if (existingClients.length > 1) {
				const clientIds = existingClients.map(client => client.getClientId()).join(', ');
				this._logService.warn(
					`Session ${session.dynState.sessionName} has multiple help clients: ` +
					`${clientIds}`);
			}

			const client = existingClients.length > 0 ?
				existingClients[0] :
				await session.createClient(RuntimeClientType.Help, {});

			const languageId = session.runtimeMetadata.languageId;
			const helpClient = new HelpClientInstance(client, languageId);
			this.attachClientInstance(session, helpClient);

		} catch (error) {
			this._logService.error(
				`ErdosHelpService could not create client for session ${sessionId}: ` +
				`${error}`);
		}
	}

	attachClientInstance(session: ILanguageRuntimeSession, client: HelpClientInstance) {
		const sessionId = session.sessionId;

		if (this._helpClients.has(sessionId)) {
			this._logService.warn(`
			ErdosHelpService already has a client for session ${sessionId}; ` +
				`it will be replaced.`);
			const oldClient = this._helpClients.get(sessionId);
			if (oldClient) {
				oldClient.dispose();
			}
		}

		this._register(client);
		this._helpClients.set(sessionId, client);

		this._register(client.onDidEmitHelpContent(helpContent => {
			this.handleShowHelpEvent(session, helpContent);
		}));

		this._register(client.onDidClose(() => {
			this.deleteLanguageRuntimeHelpEntries(sessionId);
			this._helpClients.delete(sessionId);
		}));
	}

	private async handleShowHelpEvent(
		session: ILanguageRuntimeSession,
		showHelpEvent: ShowHelpEvent) {

		if (showHelpEvent.kind !== 'url') {
			this._logService.error(`ErdosHelpService does not support help event kind ${showHelpEvent.kind}.`);
			return;
		}

		const targetUrl = new URL(showHelpEvent.content);

		this._logService.info(`ErdosHelpService language runtime server sent show help event for: ${targetUrl.toString()}`);

		if (!isLocalhost(targetUrl.hostname)) {
			try {
				await this._openerService.open(targetUrl.toString(), {
					openExternal: true
				} satisfies OpenExternalOptions);
			} catch {
				this._notificationService.error(localize(
					'erdosHelpServiceOpenFailed',
					"The Erdos help service was unable to open '{0}'.", targetUrl.toString()
				));
			}

			return;
		}

		let proxyServerOrigin = this._proxyServers.get(targetUrl.origin);
		if (!proxyServerOrigin) {
			if (!this._proxyServerStylesHaveBeenSet) {
				await this.setProxyServerStyles();
			}

			try {
				proxyServerOrigin = await this._commandService.executeCommand<string>(
					'erdosProxy.startHelpProxyServer',
					targetUrl.origin
				);
			} catch (error) {
				this._logService.error(`ErdosHelpService could not start the proxy server for ${targetUrl.origin}.`);
				this._logService.error(error);
			}

			if (!proxyServerOrigin) {
				this._notificationService.error(localize(
					'erdosHelpServiceUnavailable',
					"The Erdos help service is unavailable."
				));
				return;
			}

			this._proxyServers.set(targetUrl.origin, proxyServerOrigin);
		}

		const sourceUrl = new URL(targetUrl);
		const proxyServerOriginUrl = new URL(proxyServerOrigin);
		sourceUrl.protocol = proxyServerOriginUrl.protocol;
		sourceUrl.hostname = proxyServerOriginUrl.hostname;
		sourceUrl.port = proxyServerOriginUrl.port;
		sourceUrl.pathname = join(proxyServerOriginUrl.pathname, targetUrl.pathname);

		if (!session) {
			this._notificationService.error(localize(
				'erdosHelpServiceInternalError',
				"The Erdos help service experienced an unexpected error."
			));
			return;
		}

		await this._viewsService.openView(ERDOS_HELP_VIEW_ID, false);

		const helpEntry = this._instantiationService.createInstance(HelpEntry,
			this._helpHTML,
			session.runtimeMetadata.languageId,
			session.runtimeMetadata.runtimeId,
			session.runtimeMetadata.languageName,
			sourceUrl.toString(),
			targetUrl.toString()
		);

		this._helpEntryEventListeners.push(helpEntry.onDidNavigate((url: string) => {
			this.navigate(helpEntry.sourceUrl, url);
		}));

		this.addHelpEntry(helpEntry);

		if (showHelpEvent.focus) {
			this._onDidFocusHelpEmitter.fire();
		}
	}
}

const notFoundHelper = (error: any, path: string) => `<!DOCTYPE html><html><body><h1>Error Loading Help</h1><p>Cannot read ${path}:</p><p>${error}</body></html>`;

export const IErdosHelpService = createDecorator<IErdosHelpService>(ERDOS_HELP_SERVICE_ID);

registerSingleton(IErdosHelpService, ErdosHelpService, InstantiationType.Delayed);
