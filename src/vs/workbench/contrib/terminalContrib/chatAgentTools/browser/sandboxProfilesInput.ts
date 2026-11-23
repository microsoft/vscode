/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { deepClone, equals } from '../../../../../base/common/objects.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { assignHostSandboxProfile, readHostSandboxProfile } from '../../../../../platform/agentHost/common/sandboxProfiles.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IModalEditorOptions, IModalEditorOptionsProvider } from '../../../../../platform/editor/common/editor.js';
import { AgentNetworkDomainSettingId as Network } from '../../../../../platform/networkFilter/common/settings.js';
import { ISandboxProfile, readSandboxProfiles, watchSandboxProfiles, writeSandboxProfiles } from '../../../../../platform/sandbox/common/sandboxProfiles.js';
import { AgentSandboxSettingId as Sandbox, normalizeAgentSandboxEnabledValue } from '../../../../../platform/sandbox/common/settings.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
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

/**
 * Edits this machine's sandbox profile library. Assigning profiles to hosts happens
 * in Remote Environments; saving a profile updates the connected hosts it is assigned to.
 */
export class SandboxProfilesInput extends EditorInput implements IModalEditorOptionsProvider {
	static readonly ID = 'workbench.input.sandboxProfiles';
	override readonly resource = undefined;
	override get typeId() { return SandboxProfilesInput.ID; }
	override get capabilities() { return EditorInputCapabilities.Singleton | EditorInputCapabilities.RequiresModal; }
	getModalEditorOptions(): IModalEditorOptions {
		return { compactHeader: true, canMoveToEditorArea: false };
	}
	override getName() { return localize('title', "Sandbox Profiles"); }
	override matches(other: EditorInput | IUntypedEditorInput) { return other instanceof SandboxProfilesInput; }

	private readonly _onDidSelect = this._register(new Emitter<void>());
	readonly onDidSelect = this._onDidSelect.event;
	private _initial!: ISandboxProfile;
	draft!: ISandboxProfile;
	existing = false;
	/** Saved profiles open read-only until the user chooses Edit; new profiles open editable. */
	editing = false;
	private _dirty = false;
	/** Text of JSON fields that don't parse or validate, so it survives re-rendering and blocks saving. */
	private readonly _invalidText = new Map<string, string>();

	constructor(
		@IStorageService private readonly _storage: IStorageService,
		@IConfigurationService private readonly _config: IConfigurationService,
		@IAgentHostConnectionsService private readonly _connections: IAgentHostConnectionsService,
	) {
		super();
		watchSandboxProfiles(this._storage, this._store, () => this._onDidChangeLibrary());
		this.select(this.profiles[0]);
	}

	get profiles(): ISandboxProfile[] {
		return readSandboxProfiles(this._storage);
	}

	/** Shows changes made in another window without discarding an edit in progress. */
	private _onDidChangeLibrary(): void {
		if (this.editing) {
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
			for (const { fields } of sandboxProfileGroups) {
				for (const [key] of fields) {
					settings[key] = key === Sandbox.AgentSandboxEnabled
						? normalizeAgentSandboxEnabledValue(this._config.getValue(key))
						: this._config.getValue(key);
				}
			}
			profile = { id: generateUuid(), name: this._nextName(), settings };
		}
		this._initial = profile;
		this.draft = deepClone(profile);
		this._invalidText.clear();
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
		const dirty = this._invalidText.size > 0 || !equals(this._initial, this.draft);
		if (dirty !== this._dirty) {
			this._dirty = dirty;
			this._onDidChangeDirty.fire();
		}
	}

	/** The unsaved invalid text of a JSON field, if any. */
	invalidText(key: string): string | undefined {
		return this._invalidText.get(key);
	}

	/** Records a JSON field's text while it is invalid; `undefined` clears it once the field is valid again. */
	setInvalidText(key: string, text: string | undefined): void {
		if (text === undefined) {
			this._invalidText.delete(key);
		} else {
			this._invalidText.set(key, text);
		}
		this.changed();
	}

	/** Why the draft can't be saved, including problems outside the name field. */
	get saveError(): string | undefined {
		if (this.existing && !this.profiles.some(profile => profile.id === this.draft.id)) {
			return localize('deletedElsewhere', "This profile was deleted in another window. Discard your changes, or create a new profile.");
		}
		if (this._invalidText.size) {
			return localize('fixJsonBeforeSave', "Fix the JSON errors before saving.");
		}
		return this.validationMessage;
	}

	override isDirty(): boolean { return this._dirty; }

	get validationMessage(): string | undefined {
		const name = this.draft.name.trim();
		if (!name || name.length > 80) {
			return localize('nameRequired', "Enter a profile name between 1 and 80 characters.");
		}
		if (this.profiles.some(p => p.id !== this.draft.id && p.name.toLowerCase() === name.toLowerCase())) {
			return localize('duplicate', "A profile with that name already exists.");
		}
		return undefined;
	}

	/** Saves the draft to the library and updates the connected hosts it is assigned to. */
	override async save(): Promise<this> {
		const message = this.saveError;
		if (message) {
			throw new Error(message);
		}
		const profile = { ...this.draft, name: this.draft.name.trim() };
		const profiles = this.profiles;
		const index = profiles.findIndex(p => p.id === profile.id);
		if (index === -1) {
			profiles.push(profile);
		} else {
			profiles[index] = profile;
		}
		writeSandboxProfiles(this._storage, profiles);
		for (const { connection } of this._connections.connections) {
			if (connection && readHostSandboxProfile(connection)?.id === profile.id) {
				assignHostSandboxProfile(connection, profile);
			}
		}
		this.select(profile);
		return this;
	}

	override async revert(): Promise<void> {
		this.select(this.existing ? this.profiles.find(p => p.id === this.draft.id) : this.profiles[0]);
	}

	/** Names of the connected remote environments the profile is assigned to. Disconnected hosts can't be checked. */
	hostsUsingProfile(id: string): string[] {
		return this._connections.connections
			.filter(({ connection, isAmbient }) => connection && !isAmbient && readHostSandboxProfile(connection)?.id === id)
			.map(({ name }) => name);
	}

	/** Removes the profile from this machine unless a connected host uses it. Disconnected hosts keep their own copy. */
	deleteProfile(id: string): boolean {
		if (this.hostsUsingProfile(id).length) {
			return false;
		}
		const remaining = this.profiles.filter(p => p.id !== id);
		writeSandboxProfiles(this._storage, remaining);
		if (id === this.draft.id) {
			this.select(remaining[0]);
		} else {
			this._onDidSelect.fire();
		}
		return true;
	}
}