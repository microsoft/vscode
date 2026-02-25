/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem, IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IsolationMode } from './sessionTargetPicker.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';

import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';

export type NewSessionChangeType = 'repoUri' | 'isolationMode' | 'branch' | 'options' | 'disabled';

/**
 * Represents a resolved option group with its current selected value.
 */
export interface ISessionOptionGroup {
	readonly group: IChatSessionProviderOptionGroup;
	readonly value: IChatSessionProviderOptionItem | undefined;
}

/**
 * A new session represents a session being configured before the first
 * request is sent. It holds the user's selections (repoUri, isolationMode)
 * and fires a single event when any property changes.
 */
export interface INewSession extends IDisposable {
	readonly resource: URI;
	readonly target: AgentSessionProviders;
	readonly repoUri: URI | undefined;
	readonly isolationMode: IsolationMode;
	readonly branch: string | undefined;
	readonly modelId: string | undefined;
	readonly query: string | undefined;
	readonly attachedContext: IChatRequestVariableEntry[] | undefined;
	readonly selectedOptions: ReadonlyMap<string, IChatSessionProviderOptionItem>;
	readonly disabled: boolean;
	readonly onDidChange: Event<NewSessionChangeType>;
	setRepoUri(uri: URI): void;
	setIsolationMode(mode: IsolationMode): void;
	setBranch(branch: string | undefined): void;
	setModelId(modelId: string | undefined): void;
	setQuery(query: string): void;
	setAttachedContext(context: IChatRequestVariableEntry[] | undefined): void;
	setOption(optionId: string, value: IChatSessionProviderOptionItem | string): void;
}

const REPOSITORY_OPTION_ID = 'repository';
const BRANCH_OPTION_ID = 'branch';
const ISOLATION_OPTION_ID = 'isolation';

/**
 * Local new session for Background agent sessions.
 * Fires `onDidChange` for both `repoUri` and `isolationMode` changes.
 * Notifies the extension service with session options for each property change.
 */
export class LocalNewSession extends Disposable implements INewSession {

	private _repoUri: URI | undefined;
	private _isolationMode: IsolationMode = 'worktree';
	private _branch: string | undefined;
	private _modelId: string | undefined;
	private _query: string | undefined;
	private _attachedContext: IChatRequestVariableEntry[] | undefined;

	private readonly _onDidChange = this._register(new Emitter<NewSessionChangeType>());
	readonly onDidChange: Event<NewSessionChangeType> = this._onDidChange.event;

	readonly target = AgentSessionProviders.Background;
	readonly selectedOptions = new Map<string, IChatSessionProviderOptionItem>();

	get repoUri(): URI | undefined { return this._repoUri; }
	get isolationMode(): IsolationMode { return this._isolationMode; }
	get branch(): string | undefined { return this._branch; }
	get modelId(): string | undefined { return this._modelId; }
	get query(): string | undefined { return this._query; }
	get attachedContext(): IChatRequestVariableEntry[] | undefined { return this._attachedContext; }
	get disabled(): boolean {
		if (!this._repoUri) {
			return true;
		}
		if (this._isolationMode === 'worktree' && !this._branch) {
			return true;
		}
		return false;
	}

	constructor(
		readonly resource: URI,
		defaultRepoUri: URI | undefined,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		if (defaultRepoUri) {
			this._repoUri = defaultRepoUri;
			this.setOption(REPOSITORY_OPTION_ID, defaultRepoUri.fsPath);
		}
	}

	setRepoUri(uri: URI): void {
		this._repoUri = uri;
		this._isolationMode = 'workspace';
		this._branch = undefined;
		this._onDidChange.fire('repoUri');
		this._onDidChange.fire('disabled');
		this.setOption(REPOSITORY_OPTION_ID, uri.fsPath);
	}

	setIsolationMode(mode: IsolationMode): void {
		if (this._isolationMode !== mode) {
			this._isolationMode = mode;
			this._onDidChange.fire('isolationMode');
			this._onDidChange.fire('disabled');
			this.setOption(ISOLATION_OPTION_ID, mode);
		}
	}

	setBranch(branch: string | undefined): void {
		if (this._branch !== branch) {
			this._branch = branch;
			this._onDidChange.fire('branch');
			this._onDidChange.fire('disabled');
			this.setOption(BRANCH_OPTION_ID, branch ?? '');
		}
	}

	setModelId(modelId: string | undefined): void {
		this._modelId = modelId;
	}

	setQuery(query: string): void {
		this._query = query;
	}

	setAttachedContext(context: IChatRequestVariableEntry[] | undefined): void {
		this._attachedContext = context;
	}

	setOption(optionId: string, value: IChatSessionProviderOptionItem | string): void {
		if (typeof value === 'string') {
			this.selectedOptions.set(optionId, { id: value, name: value });
		} else {
			this.selectedOptions.set(optionId, value);
		}
		this.chatSessionsService.notifySessionOptionsChange(
			this.resource,
			[{ optionId, value }]
		).catch((err) => this.logService.error(`Failed to notify session option ${optionId} change:`, err));
	}
}

/**
 * Remote new session for Cloud agent sessions.
 * Manages extension-driven option groups (models, etc.) and their values.
 * Fires events for option group changes.
 */
export class RemoteNewSession extends Disposable implements INewSession {

	private _repoUri: URI | undefined;
	private _modelId: string | undefined;
	private _query: string | undefined;
	private _attachedContext: IChatRequestVariableEntry[] | undefined;

	private readonly _onDidChange = this._register(new Emitter<NewSessionChangeType>());
	readonly onDidChange: Event<NewSessionChangeType> = this._onDidChange.event;

	private readonly _onDidChangeOptionGroups = this._register(new Emitter<void>());
	readonly onDidChangeOptionGroups: Event<void> = this._onDidChangeOptionGroups.event;

	readonly selectedOptions = new Map<string, IChatSessionProviderOptionItem>();

	get repoUri(): URI | undefined { return this._repoUri; }
	get isolationMode(): IsolationMode { return 'worktree'; }
	get branch(): string | undefined { return undefined; }
	get modelId(): string | undefined { return this._modelId; }
	get query(): string | undefined { return this._query; }
	get attachedContext(): IChatRequestVariableEntry[] | undefined { return this._attachedContext; }
	get disabled(): boolean {
		return !this._repoUri && !this.selectedOptions.has('repositories');
	}

	private readonly _whenClauseKeys = new Set<string>();

	constructor(
		readonly resource: URI,
		readonly target: AgentSessionProviders,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._updateWhenClauseKeys();

		this._register(this.chatSessionsService.onDidChangeOptionGroups(() => {
			this._updateWhenClauseKeys();
			this._onDidChangeOptionGroups.fire();
			this._onDidChange.fire('options');
		}));
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (this._whenClauseKeys.size > 0 && e.affectsSome(this._whenClauseKeys)) {
				this._onDidChangeOptionGroups.fire();
			}
		}));
	}

	setRepoUri(uri: URI): void {
		this._repoUri = uri;
		this._onDidChange.fire('repoUri');
		this._onDidChange.fire('disabled');
		this.setOption('repository', uri.fsPath);
	}

	setIsolationMode(_mode: IsolationMode): void {
		// No-op for remote sessions
	}

	setBranch(_branch: string | undefined): void {
		// No-op for remote sessions
	}

	setModelId(modelId: string | undefined): void {
		this._modelId = modelId;
	}

	setQuery(query: string): void {
		this._query = query;
	}

	setAttachedContext(context: IChatRequestVariableEntry[] | undefined): void {
		this._attachedContext = context;
	}

	setOption(optionId: string, value: IChatSessionProviderOptionItem | string): void {
		if (typeof value !== 'string') {
			this.selectedOptions.set(optionId, value);
		}
		this._onDidChange.fire('options');
		this._onDidChange.fire('disabled');
		this.chatSessionsService.notifySessionOptionsChange(
			this.resource,
			[{ optionId, value }]
		).catch((err) => this.logService.error(`Failed to notify extension of ${optionId} change:`, err));
	}

	// --- Option group accessors ---

	getModelOptionGroup(): ISessionOptionGroup | undefined {
		const groups = this._getOptionGroups();
		if (!groups) {
			return undefined;
		}
		const group = groups.find(g => isModelOptionGroup(g));
		if (!group) {
			return undefined;
		}
		return { group, value: this._getValueForGroup(group) };
	}

	getOtherOptionGroups(): ISessionOptionGroup[] {
		const groups = this._getOptionGroups();
		if (!groups) {
			return [];
		}
		return groups
			.filter(g => !isModelOptionGroup(g) && !isRepositoriesOptionGroup(g) && this._isOptionGroupVisible(g))
			.map(g => ({ group: g, value: this._getValueForGroup(g) }));
	}

	getOptionValue(groupId: string): IChatSessionProviderOptionItem | undefined {
		return this.selectedOptions.get(groupId);
	}

	setOptionValue(groupId: string, value: IChatSessionProviderOptionItem): void {
		this.setOption(groupId, value);
	}

	// --- Internals ---

	private _getOptionGroups(): IChatSessionProviderOptionGroup[] | undefined {
		return this.chatSessionsService.getOptionGroupsForSessionType(this.target);
	}

	private _isOptionGroupVisible(group: IChatSessionProviderOptionGroup): boolean {
		if (!group.when) {
			return true;
		}
		const expr = ContextKeyExpr.deserialize(group.when);
		return !expr || this.contextKeyService.contextMatchesRules(expr);
	}

	private _updateWhenClauseKeys(): void {
		this._whenClauseKeys.clear();
		const groups = this._getOptionGroups();
		if (!groups) {
			return;
		}
		for (const group of groups) {
			if (group.when) {
				const expr = ContextKeyExpr.deserialize(group.when);
				if (expr) {
					for (const key of expr.keys()) {
						this._whenClauseKeys.add(key);
					}
				}
			}
		}
	}

	private _getValueForGroup(group: IChatSessionProviderOptionGroup): IChatSessionProviderOptionItem | undefined {
		const selected = this.selectedOptions.get(group.id);
		if (selected) {
			return selected;
		}
		// Check for extension-set session option
		const sessionOption = this.chatSessionsService.getSessionOption(this.resource, group.id);
		if (sessionOption && typeof sessionOption !== 'string') {
			return sessionOption;
		}
		if (typeof sessionOption === 'string') {
			const item = group.items.find(i => i.id === sessionOption.trim());
			if (item) {
				return item;
			}
		}
		// Default to first item marked as default, or first item
		return group.items.find(i => i.default === true) ?? group.items[0];
	}
}

function isModelOptionGroup(group: IChatSessionProviderOptionGroup): boolean {
	if (group.id === 'models') {
		return true;
	}
	const nameLower = group.name.toLowerCase();
	return nameLower === 'model' || nameLower === 'models';
}

function isRepositoriesOptionGroup(group: IChatSessionProviderOptionGroup): boolean {
	return group.id === 'repositories';
}
