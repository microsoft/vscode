/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableFromEvent, IObservable } from '../../../../base/common/observable.js';
import { joinPath } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IActiveSessionItem, ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';

export const agentSessionsRunScriptsSettingId = 'agentSessions.runScripts';

export type ScriptStorageTarget = 'user' | 'workspace';

export interface ISessionScript {
	readonly name: string;
	readonly command: string;
	readonly commandWindows?: string;
	readonly commandLinux?: string;
	readonly commandMacOS?: string;
}

function isISessionScript(s: unknown): s is ISessionScript {
	return typeof s === 'object' && s !== null &&
		typeof (s as ISessionScript).name === 'string' &&
		typeof (s as ISessionScript).command === 'string';
}

function parseScripts(value: unknown): readonly ISessionScript[] {
	if (Array.isArray(value)) {
		return value.filter(isISessionScript);
	}
	return [];
}

export interface ISessionsConfigurationService {
	readonly _serviceBrand: undefined;

	/**
	 * Observable list of scripts from user and workspace configuration merged.
	 * Automatically updates when the setting changes.
	 */
	getScripts(session: IActiveSessionItem): IObservable<readonly ISessionScript[]>;

	/** Append a script to the configuration at the given target scope. */
	addScript(script: ISessionScript, session: IActiveSessionItem, target: ScriptStorageTarget): Promise<void>;

	/** Remove a script from the configuration (checks workspace first, then user). */
	removeScript(script: ISessionScript, session: IActiveSessionItem): Promise<void>;
}

export const ISessionsConfigurationService = createDecorator<ISessionsConfigurationService>('sessionsConfigurationService');

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'agentSessions',
	title: localize('agentSessionsConfigurationTitle', "Agent Sessions"),
	type: 'object',
	properties: {
		[agentSessionsRunScriptsSettingId]: {
			type: 'array',
			description: localize('agentSessions.runScripts', "Configures the scripts available in the Run Action dropdown."),
			items: {
				type: 'object',
				properties: {
					name: {
						type: 'string',
						description: localize('agentSessions.runScripts.name', "Display name for the script."),
					},
					command: {
						type: 'string',
						description: localize('agentSessions.runScripts.command', "The default command to run in the terminal."),
					},
					commandWindows: {
						type: 'string',
						description: localize('agentSessions.runScripts.commandWindows', "Command override for Windows."),
					},
					commandLinux: {
						type: 'string',
						description: localize('agentSessions.runScripts.commandLinux', "Command override for Linux."),
					},
					commandMacOS: {
						type: 'string',
						description: localize('agentSessions.runScripts.commandMacOS', "Command override for macOS."),
					},
				},
				required: ['name', 'command'],
			},
			default: [],
		},
	},
});

export class SessionsConfigurationService extends Disposable implements ISessionsConfigurationService {

	declare readonly _serviceBrand: undefined;

	private readonly _scripts: IObservable<readonly ISessionScript[]>;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
	) {
		super();

		this._scripts = observableFromEvent(
			this,
			this._configurationService.onDidChangeConfiguration,
			() => this._readAllScripts(),
		);
	}

	getScripts(_session: IActiveSessionItem): IObservable<readonly ISessionScript[]> {
		return this._scripts;
	}

	async addScript(script: ISessionScript, session: IActiveSessionItem, target: ScriptStorageTarget): Promise<void> {
		const configTarget = target === 'user' ? ConfigurationTarget.USER_LOCAL : ConfigurationTarget.WORKSPACE;
		const current = this._readScriptsForTarget(target);
		const updated = [...current, script];
		await this._configurationService.updateValue(agentSessionsRunScriptsSettingId, updated, configTarget);

		if (target === 'workspace') {
			await this._commitSettingsFile(session);
		}
	}

	async removeScript(script: ISessionScript, session: IActiveSessionItem): Promise<void> {
		const matches = (s: ISessionScript) => s.name === script.name && s.command === script.command;

		// Try workspace first
		const workspaceScripts = this._readScriptsForTarget('workspace');
		if (workspaceScripts.some(matches)) {
			const updated = workspaceScripts.filter(s => !matches(s));
			await this._configurationService.updateValue(
				agentSessionsRunScriptsSettingId,
				updated.length ? updated : undefined,
				ConfigurationTarget.WORKSPACE,
			);
			await this._commitSettingsFile(session);
			return;
		}

		// Fall back to user
		const userScripts = this._readScriptsForTarget('user');
		const updated = userScripts.filter(s => !matches(s));
		await this._configurationService.updateValue(
			agentSessionsRunScriptsSettingId,
			updated.length ? updated : undefined,
			ConfigurationTarget.USER_LOCAL,
		);
	}

	private _readScriptsForTarget(target: ScriptStorageTarget): readonly ISessionScript[] {
		const inspected = this._configurationService.inspect<unknown[]>(agentSessionsRunScriptsSettingId);
		const value = target === 'user' ? inspected.userLocalValue : inspected.workspaceValue;
		return parseScripts(value);
	}

	private _readAllScripts(): readonly ISessionScript[] {
		const inspected = this._configurationService.inspect<unknown[]>(agentSessionsRunScriptsSettingId);
		const userScripts = parseScripts(inspected.userLocalValue);
		const workspaceScripts = parseScripts(inspected.workspaceValue);
		return [...userScripts, ...workspaceScripts];
	}

	private async _commitSettingsFile(session: IActiveSessionItem): Promise<void> {
		const worktree = session.worktree;
		if (!worktree) {
			return;
		}
		const settingsUri = joinPath(worktree, '.vscode/settings.json');
		await this._sessionsManagementService.commitWorktreeFiles(session, [settingsUri]);
	}
}
