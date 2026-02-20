/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatSessionProviderOptionItem, IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IsolationMode } from './sessionTargetPicker.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';

import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';

export type NewSessionChangeType = 'repoUri' | 'isolationMode' | 'branch' | 'options';

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

	constructor(
		readonly resource: URI,
		defaultRepoUri: URI | undefined,
		private readonly chatSessionsService: IChatSessionsService,
		private readonly logService: ILogService,
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
		this.setOption(REPOSITORY_OPTION_ID, uri.fsPath);
	}

	setIsolationMode(mode: IsolationMode): void {
		if (this._isolationMode !== mode) {
			this._isolationMode = mode;
			this._onDidChange.fire('isolationMode');
			this.setOption(ISOLATION_OPTION_ID, mode);
		}
	}

	setBranch(branch: string | undefined): void {
		if (this._branch !== branch) {
			this._branch = branch;
			this._onDidChange.fire('branch');
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
 * Fires `onDidChange` and notifies the extension service when `repoUri` changes.
 * Ignores `isolationMode` (not relevant for cloud).
 */
export class RemoteNewSession extends Disposable implements INewSession {

	private _repoUri: URI | undefined;
	private _isolationMode: IsolationMode = 'worktree';
	private _modelId: string | undefined;
	private _query: string | undefined;
	private _attachedContext: IChatRequestVariableEntry[] | undefined;

	private readonly _onDidChange = this._register(new Emitter<NewSessionChangeType>());
	readonly onDidChange: Event<NewSessionChangeType> = this._onDidChange.event;

	readonly selectedOptions = new Map<string, IChatSessionProviderOptionItem>();

	get repoUri(): URI | undefined { return this._repoUri; }
	get isolationMode(): IsolationMode { return this._isolationMode; }
	get branch(): string | undefined { return undefined; }
	get modelId(): string | undefined { return this._modelId; }
	get query(): string | undefined { return this._query; }
	get attachedContext(): IChatRequestVariableEntry[] | undefined { return this._attachedContext; }

	constructor(
		readonly resource: URI,
		readonly target: AgentSessionProviders,
		private readonly chatSessionsService: IChatSessionsService,
		private readonly logService: ILogService,
	) {
		super();

		// Listen for extension-driven option group and session option changes
		this._register(this.chatSessionsService.onDidChangeOptionGroups(() => {
			this._onDidChange.fire('options');
		}));
		this._register(this.chatSessionsService.onDidChangeSessionOptions((e: URI | undefined) => {
			if (isEqual(this.resource, e)) {
				this._onDidChange.fire('options');
			}
		}));
	}

	setRepoUri(uri: URI): void {
		this._repoUri = uri;
		this._onDidChange.fire('repoUri');
		this.setOption('repository', uri.fsPath);
	}

	setIsolationMode(_mode: IsolationMode): void {
		// No-op for remote sessions — isolation mode is not relevant
	}

	setBranch(_branch: string | undefined): void {
		// No-op for remote sessions — branch is not relevant
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
		this.chatSessionsService.notifySessionOptionsChange(
			this.resource,
			[{ optionId, value }]
		).catch((err) => this.logService.error(`Failed to notify extension of ${optionId} change:`, err));
	}
}
