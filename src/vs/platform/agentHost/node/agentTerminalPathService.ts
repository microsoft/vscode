/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { combineAgentTerminalPaths, emptyAgentTerminalPath, type IAgentTerminalPath } from '../common/agentTerminalPath.js';

export const IAgentTerminalPathService = createDecorator<IAgentTerminalPathService>('agentTerminalPathService');

/**
 * The `PATH` directories agent terminals get from the extensions of all
 * connected local clients. Each client owns its contribution until it
 * replaces it or disconnects.
 */
export interface IAgentTerminalPathService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	readonly path: IAgentTerminalPath;
	setClientPath(clientId: string, path: IAgentTerminalPath): void;
	removeClient(clientId: string): void;
}

export class AgentTerminalPathService extends Disposable implements IAgentTerminalPathService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _pathByClient = new Map<string, IAgentTerminalPath>();
	private _path = emptyAgentTerminalPath;

	get path(): IAgentTerminalPath {
		return this._path;
	}

	setClientPath(clientId: string, path: IAgentTerminalPath): void {
		if (path.prepend.length === 0 && path.append.length === 0) {
			this._pathByClient.delete(clientId);
		} else {
			this._pathByClient.set(clientId, path);
		}
		this._update();
	}

	removeClient(clientId: string): void {
		if (this._pathByClient.delete(clientId)) {
			this._update();
		}
	}

	private _update(): void {
		const path = combineAgentTerminalPaths(this._pathByClient.values());
		if (!equals(this._path, path)) {
			this._path = path;
			this._onDidChange.fire();
		}
	}
}
