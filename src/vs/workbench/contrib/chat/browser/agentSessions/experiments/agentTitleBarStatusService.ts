/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';

//#region Agent Status Mode

export enum AgentStatusMode {
	/** Default mode showing workspace name + session stats */
	Default = 'default',
	/** Session ready mode showing session title + Enter button (before entering projection) */
	SessionReady = 'sessionReady',
	/** Session mode showing session title + Esc button (inside projection) */
	Session = 'session',
}

export interface IAgentStatusSessionInfo {
	readonly sessionResource: URI;
	readonly title: string;
}

//#endregion

//#region Agent Status Service Interface

export interface IAgentTitleBarStatusService {
	readonly _serviceBrand: undefined;

	/**
	 * The current mode of the agent status widget.
	 */
	readonly mode: AgentStatusMode;

	/**
	 * The current session info when in session mode, undefined otherwise.
	 */
	readonly sessionInfo: IAgentStatusSessionInfo | undefined;

	/**
	 * Event fired when the control mode changes.
	 */
	readonly onDidChangeMode: Event<AgentStatusMode>;

	/**
	 * Event fired when the session info changes (including when entering/exiting session mode).
	 */
	readonly onDidChangeSessionInfo: Event<IAgentStatusSessionInfo | undefined>;

	/**
	 * Enter session mode, showing the session title and escape button.
	 * Used by Agent Session Projection when entering a focused session view.
	 */
	enterSessionMode(sessionResource: URI, title: string): void;

	/**
	 * Enter session ready mode, showing the session title and enter button.
	 * Used when viewing a projection-capable session that can be entered.
	 */
	enterSessionReadyMode(sessionResource: URI, title: string): void;

	/**
	 * Exit session ready mode, returning to the default mode.
	 * Called when the session is no longer visible or valid for projection.
	 */
	exitSessionReadyMode(): void;

	/**
	 * Exit session mode, returning to the default mode with workspace name and stats.
	 * Used by Agent Session Projection when exiting a focused session view.
	 */
	exitSessionMode(): void;

	/**
	 * Update the session title while in session mode.
	 */
	updateSessionTitle(title: string): void;
}

export const IAgentTitleBarStatusService = createDecorator<IAgentTitleBarStatusService>('agentTitleBarStatusService');

//#endregion

//#region Agent Status Service Implementation

export class AgentTitleBarStatusService extends Disposable implements IAgentTitleBarStatusService {

	declare readonly _serviceBrand: undefined;

	private _mode: AgentStatusMode = AgentStatusMode.Default;
	get mode(): AgentStatusMode { return this._mode; }

	private _sessionInfo: IAgentStatusSessionInfo | undefined;
	get sessionInfo(): IAgentStatusSessionInfo | undefined { return this._sessionInfo; }

	private readonly _onDidChangeMode = this._register(new Emitter<AgentStatusMode>());
	readonly onDidChangeMode = this._onDidChangeMode.event;

	private readonly _onDidChangeSessionInfo = this._register(new Emitter<IAgentStatusSessionInfo | undefined>());
	readonly onDidChangeSessionInfo = this._onDidChangeSessionInfo.event;

	enterSessionMode(sessionResource: URI, title: string): void {
		const newInfo: IAgentStatusSessionInfo = { sessionResource, title };
		const modeChanged = this._mode !== AgentStatusMode.Session;

		this._mode = AgentStatusMode.Session;
		this._sessionInfo = newInfo;

		if (modeChanged) {
			this._onDidChangeMode.fire(this._mode);
		}
		this._onDidChangeSessionInfo.fire(this._sessionInfo);
	}

	enterSessionReadyMode(sessionResource: URI, title: string): void {
		const newInfo: IAgentStatusSessionInfo = { sessionResource, title };
		const modeChanged = this._mode !== AgentStatusMode.SessionReady;

		this._mode = AgentStatusMode.SessionReady;
		this._sessionInfo = newInfo;

		if (modeChanged) {
			this._onDidChangeMode.fire(this._mode);
		}
		this._onDidChangeSessionInfo.fire(this._sessionInfo);
	}

	exitSessionReadyMode(): void {
		// Only exit if we're in SessionReady mode (don't exit from Session mode)
		if (this._mode !== AgentStatusMode.SessionReady) {
			return;
		}

		this._mode = AgentStatusMode.Default;
		this._sessionInfo = undefined;

		this._onDidChangeMode.fire(this._mode);
		this._onDidChangeSessionInfo.fire(undefined);
	}

	exitSessionMode(): void {
		if (this._mode === AgentStatusMode.Default) {
			return;
		}

		this._mode = AgentStatusMode.Default;
		this._sessionInfo = undefined;

		this._onDidChangeMode.fire(this._mode);
		this._onDidChangeSessionInfo.fire(undefined);
	}

	updateSessionTitle(title: string): void {
		if (this._mode !== AgentStatusMode.Session || !this._sessionInfo) {
			return;
		}

		this._sessionInfo = { ...this._sessionInfo, title };
		this._onDidChangeSessionInfo.fire(this._sessionInfo);
	}
}

//#endregion
