/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { MutableDisposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { deepClone, equals } from '../../../../../base/common/objects.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import type { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { sandboxSettingIdToAgentHostKey, type ISandboxConfigValue, type ISandboxProfileValue } from '../../../../../platform/agentHost/common/sandboxConfigSchema.js';
import { readHostSandboxProfiles, updateHostSandboxProfiles, watchHostSandboxProfiles } from '../../../../../platform/agentHost/common/sandboxProfiles.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IModalEditorOptions, IModalEditorOptionsProvider } from '../../../../../platform/editor/common/editor.js';
import { AgentNetworkDomainSettingId as Network } from '../../../../../platform/networkFilter/common/settings.js';
import { AgentSandboxSettingId as Sandbox, IAgentSandboxUserConfiguredPaths, normalizeAgentSandboxEnabledValue } from '../../../../../platform/sandbox/common/settings.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';

export const sandboxProfileGroups = [
	{
		title: localize('sandboxGroup', "Sandbox"), fields: [
			[Sandbox.AgentSandboxEnabled, localize('enabled', "Enabled")],
			[Sandbox.AgentSandboxAllowUnsandboxedCommands, localize('bypass', "Allow Sandbox Bypass")],
			[Sandbox.AgentSandboxMcpServers, localize('mcpServers', "Sandbox MCP Servers")],
			[Sandbox.AgentSandboxLspServers, localize('lspServers', "Sandbox LSP Servers")],
		]
	},
	{
		title: localize('networkGroup', "Network"), fields: [
			[Sandbox.AgentSandboxAllowNetwork, localize('outbound', "Allow Outbound Connections")],
			[Network.AllowedNetworkDomains, localize('allowed', "Allowed Domains")],
			[Network.DeniedNetworkDomains, localize('denied', "Denied Domains")],
			[Sandbox.AgentSandboxAllowLocalNetwork, localize('localNetwork', "Allow Local Network")],
		]
	},
	{
		title: localize('fileSystemGroup', "File System"), fields: [
			[Sandbox.AgentSandboxAllowDevToolAccess, localize('devTools', "Allow Dev Tool Access")],
			[Sandbox.AgentSandboxUserConfiguredPaths, localize('paths', "User-Configured Paths")],
		]
	},
	{
		title: localize('credentialsGroup', "Credentials"), fields: [
			[Sandbox.AgentSandboxAuthenticateGit, localize('git', "Authenticate git")],
			[Sandbox.AgentSandboxAuthenticateGh, localize('gh', "Authenticate gh")],
		]
	},
] as const;

/** A sandbox profile as the editor edits it: values keyed by VS Code sandbox setting ID. */
export interface ISandboxProfile {
	id: string;
	name: string;
	settings: Record<string, boolean | string | string[] | IAgentSandboxUserConfiguredPaths>;
}

const editableSettingIds: readonly string[] = sandboxProfileGroups.flatMap(({ fields }) => fields.map(([key]) => key));

function toHostProfile(profile: ISandboxProfile): ISandboxProfileValue {
	const sandbox: Record<string, unknown> = {};
	for (const [setting, value] of Object.entries(profile.settings)) {
		const key = sandboxSettingIdToAgentHostKey[setting];
		if (key && value !== undefined) {
			sandbox[key] = value;
		}
	}
	return { name: profile.name, sandbox: sandbox as ISandboxConfigValue };
}

function fromHostProfile(id: string, profile: ISandboxProfileValue): ISandboxProfile {
	const settings: ISandboxProfile['settings'] = {};
	const sandbox = profile.sandbox as Record<string, ISandboxProfile['settings'][string] | undefined>;
	for (const setting of editableSettingIds) {
		const value = sandbox[sandboxSettingIdToAgentHostKey[setting]];
		if (value !== undefined) {
			settings[setting] = value;
		}
	}
	return { id, name: profile.name, settings };
}

/**
 * Edits the sandbox profiles stored on one agent host. Every client connected
 * to that host sees the same profiles and can change them; the last write wins.
 */
export class SandboxProfilesInput extends EditorInput implements IModalEditorOptionsProvider {
	static readonly ID = 'workbench.input.sandboxProfiles';
	override readonly resource = undefined;
	override get typeId() { return SandboxProfilesInput.ID; }
	override get capabilities() { return EditorInputCapabilities.Singleton | EditorInputCapabilities.RequiresModal; }
	getModalEditorOptions(): IModalEditorOptions {
		return { compactHeader: true, canMoveToEditorArea: false };
	}
	override getName() {
		return localize('title', "Sandbox Profiles: {0}", this.hostName);
	}
	override matches(other: EditorInput | IUntypedEditorInput) { return other instanceof SandboxProfilesInput && other.authority === this.authority; }

	private readonly _onDidSelect = this._register(new Emitter<void>());
	readonly onDidSelect = this._onDidSelect.event;
	private readonly _hostListener = this._register(new MutableDisposable<DisposableStore>());
	private _connection: IAgentConnection | undefined;
	private _initial!: ISandboxProfile;
	draft!: ISandboxProfile;
	existing = false;
	/** Saved profiles open read-only until the user chooses Edit; new profiles open editable. */
	editing = false;
	private _dirty = false;

	constructor(
		/** The agent host connection authority whose profiles this input edits. */
		readonly authority: string,
		@IAgentHostConnectionsService private readonly _connections: IAgentHostConnectionsService,
		@IConfigurationService private readonly _config: IConfigurationService,
	) {
		super();
		this._register(this._connections.onDidChangeConnections(() => this._attach()));
		this._attach();
		this.select(this.profiles[0]);
	}

	get hostName(): string {
		return this._connections.connections.find(info => info.authority === this.authority)?.name ?? this.authority;
	}

	/** Whether the host is connected and supports sandbox profiles. */
	get available(): boolean {
		return !!this._connection && !!readHostSandboxProfiles(this._connection);
	}

	get profiles(): ISandboxProfile[] {
		const host = this._connection && readHostSandboxProfiles(this._connection);
		return host ? Object.entries(host.profiles).map(([id, profile]) => fromHostProfile(id, profile)) : [];
	}

	/** The profile new sessions on this host use, or `undefined` for the host's default sandbox values. */
	get active(): string | undefined {
		return this._connection && readHostSandboxProfiles(this._connection)?.active;
	}

	setActive(id: string | undefined): void {
		if (this._connection && this.available) {
			updateHostSandboxProfiles(this._connection, { active: id });
		}
	}

	private _attach(): void {
		const connection = this._connections.getConnectionByAuthority(this.authority);
		if (connection === this._connection) {
			return;
		}
		this._connection = connection;
		const store = new DisposableStore();
		if (connection) {
			watchHostSandboxProfiles(connection, store, () => this._onDidChangeHost());
		}
		this._hostListener.value = store;
		this._onDidChangeHost();
	}

	/** Shows changes made by other clients without discarding an edit in progress. */
	private _onDidChangeHost(): void {
		if (!this._initial || this.editing) {
			this._onDidSelect.fire();
			return;
		}
		const saved = this.profiles.find(profile => profile.id === this.draft.id);
		if (!equals(saved, this._initial)) {
			this.select(saved ?? this.profiles[0]);
		} else {
			this._onDidSelect.fire();
		}
	}

	select(profile?: ISandboxProfile): void {
		this.existing = !!profile;
		this.editing = !profile;
		if (!profile) {
			const settings: ISandboxProfile['settings'] = {};
			for (const key of editableSettingIds) {
				settings[key] = key === Sandbox.AgentSandboxEnabled
					? normalizeAgentSandboxEnabledValue(this._config.getValue(key))
					: this._config.getValue(key);
			}
			profile = { id: generateUuid(), name: this._nextName(), settings };
		}
		this._initial = profile;
		this.draft = deepClone(profile);
		this.changed();
		this._onDidSelect.fire();
	}

	/** Makes the selected saved profile editable. */
	edit(): void {
		if (this.existing && !this.editing) {
			this.editing = true;
			this._onDidSelect.fire();
		}
	}

	private _nextName(): string {
		const names = new Set(this.profiles.map(profile => profile.name.toLowerCase()));
		let index = 1;
		while (names.has(`sandbox_profile_${index}`)) {
			index++;
		}
		return `sandbox_profile_${index}`;
	}

	changed(): void {
		const dirty = !equals(this._initial, this.draft);
		if (dirty !== this._dirty) {
			this._dirty = dirty;
			this._onDidChangeDirty.fire();
		}
	}

	override isDirty(): boolean { return this._dirty; }

	get validationMessage(): string | undefined {
		if (!this.available) {
			return localize('unavailable', "Connect to {0} to change its sandbox profiles.", this.hostName);
		}
		const name = this.draft.name.trim();
		if (!name || name.length > 80) {
			return localize('nameRequired', "Enter a profile name between 1 and 80 characters.");
		}
		if (this.profiles.some(p => p.id !== this.draft.id && p.name.toLowerCase() === name.toLowerCase())) {
			return localize('duplicate', "A profile with that name already exists.");
		}
		return undefined;
	}

	override async save(): Promise<this> {
		const message = this.validationMessage;
		if (message) {
			throw new Error(message);
		}
		const profile = { ...this.draft, name: this.draft.name.trim() };
		const profiles = this.profiles.filter(p => p.id !== profile.id);
		profiles.push(profile);
		this._write(profiles);
		this.select(profile);
		return this;
	}

	override async revert(): Promise<void> {
		this.select(this.existing ? this.profiles.find(p => p.id === this.draft.id) : this.profiles[0]);
	}

	deleteProfile(id: string): void {
		const remaining = this.profiles.filter(p => p.id !== id);
		// Deleting the active profile also clears it, so new sessions do not silently fall back.
		this._write(remaining, this.active === id);
		if (id === this.draft.id) {
			this.select(remaining[0]);
		} else {
			this._onDidSelect.fire();
		}
	}

	private _write(profiles: readonly ISandboxProfile[], clearActive = false): void {
		if (!this._connection) {
			return;
		}
		const hostProfiles: Record<string, ISandboxProfileValue> = {};
		for (const profile of profiles) {
			hostProfiles[profile.id] = toHostProfile(profile);
		}
		updateHostSandboxProfiles(this._connection, clearActive ? { profiles: hostProfiles, active: undefined } : { profiles: hostProfiles });
	}
}