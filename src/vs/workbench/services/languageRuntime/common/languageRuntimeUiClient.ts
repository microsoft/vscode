/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IRuntimeClientInstance, RuntimeClientState } from './languageRuntimeClientInstance.js';
import { BusyEvent, ClearConsoleEvent, UiFrontendEvent, OpenEditorEvent, OpenWorkspaceEvent, PromptStateEvent, ShowMessageEvent, WorkingDirectoryEvent, ShowUrlEvent, SetEditorSelectionsEvent, ShowHtmlFileEvent, OpenWithSystemEvent, ClearWebviewPreloadsEvent } from './erdosUiComm.js';
import { ErdosUiCommInstance } from './erdosUiCommInstance.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { isWeb } from '../../../../base/common/platform.js';
import { PlotRenderSettings } from './erdosPlotComm.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';

export const ERDOS_PREVIEW_PLOTS_IN_VIEWER = 'erdos.viewer.interactivePlotsInViewer';

export enum UiMessageTypeInput {
}

export interface IUiClientMessageInput {
	msg_type: UiMessageTypeInput;
}

export enum UiMessageTypeOutput {
	Event = 'event',
}

export interface IUiClientMessageOutput {
	msg_type: UiMessageTypeOutput;
}

export interface IRuntimeClientEvent {
	name: UiFrontendEvent;
	data: any;
}

export interface IUiClientMessageOutputEvent
	extends IUiClientMessageOutput, IRuntimeClientEvent {
}

export interface IShowHtmlUriEvent {
	uri: URI;
	event: ShowHtmlFileEvent;
}

export class UiClientInstance extends Disposable {
	private _comm: ErdosUiCommInstance;

	onDidBusy: Event<BusyEvent>;
	onDidClearConsole: Event<ClearConsoleEvent>;
	onDidSetEditorSelections: Event<SetEditorSelectionsEvent>;
	onDidOpenEditor: Event<OpenEditorEvent>;
	onDidOpenWorkspace: Event<OpenWorkspaceEvent>;
	onDidShowMessage: Event<ShowMessageEvent>;
	onDidPromptState: Event<PromptStateEvent>;
	onDidWorkingDirectory: Event<WorkingDirectoryEvent>;
	onDidShowUrl: Event<ShowUrlEvent>;
	onDidShowHtmlFile: Event<IShowHtmlUriEvent>;
	onDidOpenWithSystem: Event<OpenWithSystemEvent>;
	onDidClearWebviewPreloads: Event<ClearWebviewPreloadsEvent>;

	private readonly _onDidShowUrlEmitter = this._register(new Emitter<ShowUrlEvent>());
	private readonly _onDidShowHtmlFileEmitter = this._register(new Emitter<IShowHtmlUriEvent>());

	constructor(
		private readonly _client: IRuntimeClientInstance<any, any>,
		private readonly _logService: ILogService,
		private readonly _openerService: IOpenerService,
		private readonly _environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		this._register(this._client);

		this._comm = this._register(new ErdosUiCommInstance(this._client));
		this.onDidBusy = this._comm.onDidBusy;
		this.onDidClearConsole = this._comm.onDidClearConsole;
		this.onDidSetEditorSelections = this._comm.onDidSetEditorSelections;
		this.onDidOpenEditor = this._comm.onDidOpenEditor;
		this.onDidOpenWorkspace = this._comm.onDidOpenWorkspace;
		this.onDidShowMessage = this._comm.onDidShowMessage;
		this.onDidPromptState = this._comm.onDidPromptState;
		this.onDidWorkingDirectory = this._comm.onDidWorkingDirectory;
		this.onDidShowUrl = this._onDidShowUrlEmitter.event;
		this.onDidShowHtmlFile = this._onDidShowHtmlFileEmitter.event;
		this.onDidOpenWithSystem = this._comm.onDidOpenWithSystem;
		this.onDidClearWebviewPreloads = this._comm.onDidClearWebviewPreloads;

		this._register(this._comm.onDidShowUrl(async (e: ShowUrlEvent) => {
			try {
				let uri = URI.parse(e.url);

				if (uri.scheme === 'file') {
					const uriPath = uri.path.toLowerCase();
					if (uriPath.endsWith('/') ||
						uriPath.endsWith('.html') ||
						uriPath.endsWith('.htm')) {
						this.openHtmlFile(e.url);
					}
					return;
				}

				try {
					const allowTunneling = !!this._environmentService.remoteAuthority;
					const resolvedUri = await this._openerService.resolveExternalUri(uri, {
						allowTunneling,
					});
					uri = resolvedUri.resolved;
				} catch {
				}
				const resolvedEvent: ShowUrlEvent = {
					url: uri.toString(),
				};
				this._onDidShowUrlEmitter.fire(resolvedEvent);
			} catch {
				this._onDidShowUrlEmitter.fire(e);
			}
		}));

		this._register(this._comm.onDidShowHtmlFile(async (e: ShowHtmlFileEvent) => {
			try {
				const uri = await this.handleHtmlFile(e.path);

				if (isWeb) {
					e.is_plot = false;
				} else if (e.is_plot) {
				}

				const resolvedEvent: IShowHtmlUriEvent = {
					uri,
					event: e,
				};

				this._onDidShowHtmlFileEmitter.fire(resolvedEvent);
			} catch (error) {
				this._logService.error(`Failed to show HTML file ${e.path}: ${error}`);
			}
		}));
	}

	public register<T extends IDisposable>(o: T): T {
		return this._register(o);
	}

	private async openHtmlFile(url: string): Promise<void> {
		const resolved = await this.handleHtmlFile(url);

		this._openerService.open(resolved.toString(), {
			openExternal: true,
		});
	}

	private async handleHtmlFile(targetPath: string): Promise<URI> {
		let uri = URI.parse(targetPath);
		const uriScheme = uri.scheme;

		if (uriScheme === 'http' || uriScheme === 'https') {
			try {
				const allowTunneling = !!this._environmentService.remoteAuthority;
				const resolvedUri = await this._openerService.resolveExternalUri(uri, {
					allowTunneling,
				});
				uri = resolvedUri.resolved;
			} catch {
			}
			return uri;
		} else {
			if (uriScheme === 'file') {
				return uri;
			} else {
				return URI.file(targetPath);
			}
		}
	}

	public getClientId(): string {
		return this._client.getClientId();
	}

	public getClientState(): RuntimeClientState {
		return this._client.clientState.get();
	}

	public async didChangePlotsRenderSettings(settings: PlotRenderSettings): Promise<void> {
		await this._comm.didChangePlotsRenderSettings(settings);
	}
}
