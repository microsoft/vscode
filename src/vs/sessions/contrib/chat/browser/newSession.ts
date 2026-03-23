/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IsolationMode } from './sessionTargetPicker.js';
import { SessionWorkspace } from '../../sessions/common/sessionWorkspace.js';
import { AgentSessionTarget } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatMode } from '../../../../workbench/contrib/chat/common/chatModes.js';

export type NewSessionChangeType = 'repoUri' | 'isolationMode' | 'branch' | 'options' | 'disabled' | 'agent';

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
/**
 * Describes which pickers should be visible for a new session.
 * Each property defaults to false if omitted.
 */
export interface INewSessionPickerVisibility {
	readonly localModel?: boolean;
	readonly cloudModel?: boolean;
	readonly mode?: boolean;
	readonly permission?: boolean;
	readonly isolation?: boolean;
	readonly branch?: boolean;
	/** Whether the session has extension-driven toolbar option groups. */
	readonly hasToolbarOptionGroups?: boolean;
}

export interface INewSession extends IDisposable {
	readonly resource: URI;
	readonly target: AgentSessionTarget;
	readonly project: SessionWorkspace | undefined;
	readonly isolationMode: IsolationMode | undefined;
	readonly branch: string | undefined;
	readonly modelId: string | undefined;
	readonly mode: IChatMode | undefined;
	readonly query: string | undefined;
	readonly attachedContext: IChatRequestVariableEntry[] | undefined;
	readonly selectedOptions: ReadonlyMap<string, IChatSessionProviderOptionItem>;
	readonly disabled: boolean;
	/** Describes which pickers the widget should show for this session. */
	readonly pickerVisibility: INewSessionPickerVisibility;
	readonly onDidChange: Event<NewSessionChangeType>;
	/** Fires when extension-driven option groups change. Only present when {@link INewSessionPickerVisibility.hasToolbarOptionGroups} is true. */
	readonly onDidChangeOptionGroups?: Event<void>;
	setProject(project: SessionWorkspace): void;
	setIsolationMode(mode: IsolationMode): void;
	setBranch(branch: string | undefined): void;
	setModelId(modelId: string | undefined): void;
	setMode(mode: IChatMode | undefined): void;
	setQuery(query: string): void;
	setAttachedContext(context: IChatRequestVariableEntry[] | undefined): void;
	setOption(optionId: string, value: IChatSessionProviderOptionItem | string): void;
	/** Returns the model option group for cloud sessions. Only present when {@link INewSessionPickerVisibility.cloudModel} is true. */
	getModelOptionGroup?(): ISessionOptionGroup | undefined;
	/** Returns extension-driven option groups. Only present when {@link INewSessionPickerVisibility.hasToolbarOptionGroups} is true. */
	getOtherOptionGroups?(): ISessionOptionGroup[];
}

/**
 * New session for agent host sessions (local or remote agent host processes).
 * Agent host sessions use local model and mode pickers but don't need
 * isolation mode, branch selection, or cloud option groups.
 */
export class AgentHostNewSession extends Disposable implements INewSession {

	private _project: SessionWorkspace | undefined;
	private _modelId: string | undefined;
	private _mode: IChatMode | undefined;
	private _query: string | undefined;
	private _attachedContext: IChatRequestVariableEntry[] | undefined;

	private readonly _onDidChange = this._register(new Emitter<NewSessionChangeType>());
	readonly onDidChange: Event<NewSessionChangeType> = this._onDidChange.event;

	readonly selectedOptions = new Map<string, IChatSessionProviderOptionItem>();
	readonly pickerVisibility: INewSessionPickerVisibility = {
		localModel: true,
		mode: true,
	};

	get project(): SessionWorkspace | undefined { return this._project; }
	get isolationMode(): undefined { return undefined; }
	get branch(): undefined { return undefined; }
	get modelId(): string | undefined { return this._modelId; }
	get mode(): IChatMode | undefined { return this._mode; }
	get query(): string | undefined { return this._query; }
	get attachedContext(): IChatRequestVariableEntry[] | undefined { return this._attachedContext; }
	get disabled(): boolean { return false; }

	constructor(
		readonly resource: URI,
		readonly target: AgentSessionTarget,
	) {
		super();
	}

	setProject(project: SessionWorkspace): void {
		this._project = project;
		this._onDidChange.fire('repoUri');
	}

	setIsolationMode(_mode: IsolationMode): void {
		// No-op for agent host sessions
	}

	setBranch(_branch: string | undefined): void {
		// No-op for agent host sessions
	}

	setModelId(modelId: string | undefined): void {
		this._modelId = modelId;
	}

	setMode(mode: IChatMode | undefined): void {
		if (this._mode?.id !== mode?.id) {
			this._mode = mode;
			this._onDidChange.fire('agent');
		}
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
	}
}
