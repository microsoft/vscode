/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { AgentHostPty } from './agentHostPty.js';
import { ITerminalInstance, ITerminalLocationOptions, ITerminalService } from './terminal.js';

export interface IAgentHostTerminalCreateOptions {
	/** Human-readable terminal name. */
	readonly name?: string;
	/** Initial working directory. */
	readonly cwd?: URI;
	/** Terminal location (panel, editor, split, etc.). */
	readonly location?: ITerminalLocationOptions;
}

export const IAgentHostTerminalService = createDecorator<IAgentHostTerminalService>('agentHostTerminalService');

export interface IAgentHostTerminalService {
	readonly _serviceBrand: undefined;

	/**
	 * Creates a new interactive terminal on the given agent host connection.
	 * The terminal is user-visible (not a feature terminal) and appears in
	 * the terminal panel.
	 */
	createTerminal(connection: IAgentConnection, options?: IAgentHostTerminalCreateOptions): Promise<ITerminalInstance>;

	/**
	 * Attaches to an existing server-side terminal (e.g. one created by a
	 * tool) by subscribing to its state without creating a new process.
	 * The resulting ITerminalInstance is a hidden feature terminal suitable
	 * for mirroring live output in the chat UI.
	 *
	 * Deduplicates by terminalUri — calling twice with the same URI returns
	 * the same instance.
	 */
	reviveTerminal(connection: IAgentConnection, terminalUri: URI): Promise<ITerminalInstance>;
}

export class AgentHostTerminalService extends Disposable implements IAgentHostTerminalService {
	declare readonly _serviceBrand: undefined;

	/** Revived terminal instances, keyed by terminal URI string. */
	private readonly _revivedInstances = new Map<string, ITerminalInstance>();

	constructor(
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();
	}

	async createTerminal(connection: IAgentConnection, options?: IAgentHostTerminalCreateOptions): Promise<ITerminalInstance> {
		const terminalUri = URI.from({ scheme: 'agenthost-terminal', path: `/${generateUuid()}` });
		const name = options?.name ?? localize('agentHostTerminal.default', "Agent Host Terminal");

		return this._terminalService.createTerminal({
			config: {
				customPtyImplementation: (id, cols, rows) => {
					const pty = new AgentHostPty(id, connection, terminalUri, {
						name,
						cwd: options?.cwd,
					});
					if (cols > 0 && rows > 0) {
						pty.resize(cols, rows);
					}
					return pty;
				},
				name,
				icon: { id: 'remote' },
				isFeatureTerminal: false,
			},
			location: options?.location,
		});
	}

	async reviveTerminal(connection: IAgentConnection, terminalUri: URI): Promise<ITerminalInstance> {
		const key = terminalUri.toString();
		const existing = this._revivedInstances.get(key);
		if (existing) {
			return existing;
		}

		const instance = await this._terminalService.createTerminal({
			config: {
				customPtyImplementation: (id, cols, rows) => {
					const pty = new AgentHostPty(id, connection, terminalUri, {
						attachOnly: true,
					});
					if (cols > 0 && rows > 0) {
						pty.resize(cols, rows);
					}
					return pty;
				},
				name: localize('agentHostTerminal.tool', "Agent Host Terminal"),
				isFeatureTerminal: true,
			},
		});

		this._revivedInstances.set(key, instance);
		this._register(instance.onDisposed(() => this._revivedInstances.delete(key)));

		return instance;
	}
}
