/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { deepClone, equals } from '../../../../../base/common/objects.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { assignHostSandboxProfile, readHostSandboxProfile, readSandboxProfileAssignments, rememberSandboxProfileAssignment } from '../../../../../platform/agentHost/common/sandboxProfiles.js';
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
 * Edits this machine's sandbox profile library like the Profiles editor: New Profile creates
 * and saves a profile from the current sandbox settings, and valid changes are saved
 * automatically. Assigning profiles to hosts happens in Remote Environments; saving a
 * profile updates the connected hosts it is assigned to.
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
	/** Fires when the editor must render the selected profile again. */
	readonly onDidSelect = this._onDidSelect.event;
	private readonly _onDidChangeProfiles = this._register(new Emitter<void>());
	/** Fires when the library changes but the selected profile and its edits stay, so only the list changes. */
	readonly onDidChangeProfiles = this._onDidChangeProfiles.event;
	private _initial: ISandboxProfile | undefined;
	/** The selected profile with the user's changes; `undefined` when the library is empty. */
	draft: ISandboxProfile | undefined;
	private _dirty = false;
	/** Text of JSON fields that don't parse or validate, so it survives re-rendering and blocks saving. */
	private readonly _invalidText = new Map<string, string>();
	/** Saves valid changes shortly after they are made, with the Profiles editor's delay. */
	private readonly _autoSave = this._register(new RunOnceScheduler(() => {
		if (!this.saveError) {
			this._write();
		}
	}, 500));

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
		const draft = this.draft;
		if (!draft) {
			if (this.profiles.length) {
				this.select(this.profiles[0]);
				return;
			}
		} else {
			const saved = this.profiles.find(profile => profile.id === draft.id);
			if (!saved) {
				// Deleted in another window: its edits can't be saved anymore.
				this._autoSave.cancel();
				this.select(this.profiles[0]);
				return;
			}
			if (equals(saved, this._normalizedDraft())) {
				this._initial = saved;
				this.changed();
			} else if (!this._hasChanges) {
				this.select(saved);
				return;
			}
		}
		this.changed();
		this._onDidChangeProfiles.fire();
	}

	/** Selects a saved profile, or nothing. Pending valid changes to the current profile are saved first. */
	select(profile: ISandboxProfile | undefined): void {
		this._autoSave.flush();
		this._initial = profile;
		this.draft = profile && deepClone(profile);
		this._invalidText.clear();
		this.changed();
		this._onDidSelect.fire();
	}

	/** Creates and saves a profile from the current sandbox settings, and selects it. */
	createProfile(): ISandboxProfile {
		this._autoSave.flush();
		const profile: ISandboxProfile = { id: generateUuid(), name: this._nextName(), settings: this._currentSettings() };
		writeSandboxProfiles(this._storage, [...this.profiles, profile]);
		this.select(profile);
		return profile;
	}

	/** The sandbox values from the Settings editor. */
	private _currentSettings(): ISandboxProfile['settings'] {
		const settings: ISandboxProfile['settings'] = {};
		for (const { fields } of sandboxProfileGroups) {
			for (const [key] of fields) {
				settings[key] = key === Sandbox.AgentSandboxEnabled
					? normalizeAgentSandboxEnabledValue(this._config.getValue(key))
					: this._config.getValue(key);
			}
		}
		return settings;
	}

	/** Saves pending valid changes now, for example before another profile is selected. */
	flush(): void {
		this._autoSave.flush();
	}

	private _nextName(): string {
		const names = new Set(this.profiles.map(profile => profile.name.toLowerCase()));
		let index = 1;
		while (names.has(`sandbox_profile_${index}`)) {
			index++;
		}
		return `sandbox_profile_${index}`;
	}

	private get _hasChanges(): boolean {
		return !!this.draft && (this._invalidText.size > 0 || !equals(this._initial, this._normalizedDraft()));
	}

	private _normalizedDraft(): ISandboxProfile | undefined {
		return this.draft && { ...deepClone(this.draft), name: this.draft.name.trim() };
	}

	/** Call after changing the draft. Valid changes are saved automatically; only changes that can't be saved are dirty. */
	changed(): void {
		const hasChanges = this._hasChanges;
		const autoSave = hasChanges && !this.saveError;
		if (autoSave) {
			this._autoSave.schedule();
		} else {
			this._autoSave.cancel();
		}
		const dirty = hasChanges && !autoSave;
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
		const draft = this.draft;
		if (draft && !this.profiles.some(profile => profile.id === draft.id)) {
			return localize('deletedElsewhere', "This profile was deleted in another window. Discard your changes, or create a new profile.");
		}
		if (this._invalidText.size) {
			return localize('fixJsonBeforeSave', "Fix the JSON errors before saving.");
		}
		return this.validationMessage;
	}

	override isDirty(): boolean { return this._dirty; }

	get validationMessage(): string | undefined {
		const draft = this.draft;
		if (!draft) {
			return undefined;
		}
		const name = draft.name.trim();
		if (!name || name.length > 80) {
			return localize('nameRequired', "Enter a profile name between 1 and 80 characters.");
		}
		if (this.profiles.some(p => p.id !== draft.id && p.name.toLowerCase() === name.toLowerCase())) {
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
		this._autoSave.cancel();
		this._write();
		return this;
	}

	private _write(): void {
		const profile = this._normalizedDraft();
		if (!profile) {
			return;
		}
		const profiles = this.profiles;
		const index = profiles.findIndex(p => p.id === profile.id);
		if (index === -1) {
			profiles.push(profile);
		} else {
			profiles[index] = profile;
		}
		// Keep the controls as they are, so saving doesn't interrupt typing.
		this._initial = profile;
		writeSandboxProfiles(this._storage, profiles);
		for (const { connection } of this._connections.connections) {
			if (connection && readHostSandboxProfile(connection)?.id === profile.id) {
				assignHostSandboxProfile(connection, profile);
			}
		}
		this.changed();
		this._onDidChangeProfiles.fire();
	}

	/** Discards changes that can't be saved, and shows the saved profile again. */
	override async revert(): Promise<void> {
		this._autoSave.cancel();
		const id = this.draft?.id;
		this.select(this.profiles.find(p => p.id === id) ?? this.profiles[0]);
	}

	override dispose(): void {
		this._autoSave.flush();
		super.dispose();
	}

	/** Names of the remote environments the profile is assigned to, including a disconnected host's last-known assignment. */
	hostsUsingProfile(id: string): string[] {
		for (const { address, name, connection, isAmbient } of this._connections.connections) {
			if (address && connection && !isAmbient) {
				rememberSandboxProfileAssignment(this._storage, address, name, readHostSandboxProfile(connection));
			}
		}
		return readSandboxProfileAssignments(this._storage).filter(assignment => assignment.profile.id === id).map(assignment => assignment.name);
	}

	/** Removes the profile from this machine unless a remote environment is known to use it. */
	deleteProfile(id: string): boolean {
		if (this.hostsUsingProfile(id).length) {
			return false;
		}
		if (id === this.draft?.id) {
			this._autoSave.cancel();
			this._initial = this.draft = undefined;
		}
		const remaining = this.profiles.filter(p => p.id !== id);
		writeSandboxProfiles(this._storage, remaining);
		if (!this.draft) {
			this.select(remaining[0]);
		} else {
			this._onDidChangeProfiles.fire();
		}
		return true;
	}
}
