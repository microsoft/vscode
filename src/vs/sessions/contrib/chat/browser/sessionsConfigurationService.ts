/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableSignal, observableValue } from '../../../../base/common/observable.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IActiveSessionItem, ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';

const SESSIONS_CONFIG_RELATIVE = '.vscode/sessions.json';

export interface ISessionScript {
	readonly name: string;
	readonly command: string;
}

function isISessionScript(s: unknown): s is ISessionScript {
	return typeof s === 'object' && s !== null &&
		typeof (s as ISessionScript).name === 'string' &&
		typeof (s as ISessionScript).command === 'string';
}

export interface ISessionsConfigurationService {
	readonly _serviceBrand: undefined;

	/**
	 * Observable list of scripts for the active session.
	 * Automatically reloads when the active session changes or the file is modified.
	 */
	getScripts(session: IActiveSessionItem): IObservable<readonly ISessionScript[]>;

	/** Append a script to the session's config file. */
	addScript(script: ISessionScript, session: IActiveSessionItem): Promise<void>;

	/** Remove a script from the session's config file. */
	removeScript(script: ISessionScript, session: IActiveSessionItem): Promise<void>;
}

export const ISessionsConfigurationService = createDecorator<ISessionsConfigurationService>('sessionsConfigurationService');

export class SessionsConfigurationService extends Disposable implements ISessionsConfigurationService {

	declare readonly _serviceBrand: undefined;

	private readonly _scripts = observableValue<readonly ISessionScript[]>(this, []);
	private readonly _refreshSignal = observableSignal(this);

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ISessionsManagementService private readonly _activeSessionService: ISessionsManagementService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// Watch active session changes + file changes, load scripts reactively
		this._register(autorun(reader => {
			const activeSession = this._activeSessionService.activeSession.read(reader);
			this._refreshSignal.read(reader);

			if (!activeSession) {
				this._scripts.set([], undefined);
				return;
			}

			const configUri = this._getConfigFileUri(activeSession);
			if (!configUri) {
				this._scripts.set([], undefined);
				return;
			}

			// Watch the file for external changes
			reader.store.add(this._fileService.watch(configUri));
			reader.store.add(this._fileService.onDidFilesChange(e => {
				if (e.contains(configUri)) {
					this._refreshSignal.trigger(undefined);
				}
			}));

			// Read the file (async, updates _scripts when done)
			this._readScripts(configUri).then(
				scripts => this._scripts.set(scripts, undefined),
				() => this._scripts.set([], undefined),
			);
		}));
	}

	getScripts(_session: IActiveSessionItem): IObservable<readonly ISessionScript[]> {
		return this._scripts;
	}

	async addScript(script: ISessionScript, session: IActiveSessionItem): Promise<void> {
		const uri = this._getConfigFileUri(session);
		if (!uri) {
			return;
		}

		const current = await this._readScripts(uri);
		const updated = [...current, script];
		await this._writeScripts(uri, updated, session);
	}

	async removeScript(script: ISessionScript, session: IActiveSessionItem): Promise<void> {
		const uri = this._getConfigFileUri(session);
		if (!uri) {
			return;
		}

		const current = await this._readScripts(uri);
		const updated = current.filter(s => s.name !== script.name || s.command !== script.command);
		await this._writeScripts(uri, updated, session);
	}

	private _getConfigFileUri(session: IActiveSessionItem): URI | undefined {
		const root = session.worktree ?? session.repository;
		if (!root) {
			return undefined;
		}
		return joinPath(root, SESSIONS_CONFIG_RELATIVE);
	}

	private async _readScripts(uri: URI): Promise<readonly ISessionScript[]> {
		try {
			const content = await this._fileService.readFile(uri);
			const parsed = JSON.parse(content.value.toString());
			if (parsed && Array.isArray(parsed.scripts)) {
				return parsed.scripts.filter(isISessionScript);
			}
		} catch {
			// File doesn't exist or is malformed - return empty
		}
		return [];
	}

	private async _writeScripts(uri: URI, scripts: readonly ISessionScript[], session: IActiveSessionItem): Promise<void> {
		const data = JSON.stringify({ scripts }, null, '\t');
		await this._fileService.writeFile(uri, VSBuffer.fromString(data));
		this._logService.trace(`[SessionsConfigurationService] Wrote ${scripts.length} script(s) to ${uri.toString()}`);

		await this._activeSessionService.commitWorktreeFiles(session, [uri]);
		this._refreshSignal.trigger(undefined);
	}
}
