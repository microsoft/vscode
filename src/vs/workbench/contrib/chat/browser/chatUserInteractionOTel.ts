/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { timeout } from '../../../../base/common/async.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ICommandService, CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { chatUserInteractionAttributes, IChatUserInteractionTiming, ReportChatUserInteractionCommand } from '../../../../platform/otel/common/chatUserInteraction.js';
import { isAgentHostSessionResource, isLocalAgentHostTarget, isRemoteAgentHostTarget } from '../common/chatSessionsService.js';

export const IChatUserInteractionOTelService = createDecorator<IChatUserInteractionOTelService>('chatUserInteractionOTelService');

export interface IChatUserInteractionOTelService {
	readonly _serviceBrand: undefined;
	begin(): Pick<IChatUserInteractionTiming, 'rendererId' | 'interactionOrdinal'>;
	report(data: IChatUserInteractionTiming, resource: URI | undefined, sessionType: string | undefined): void;
	flush(): Promise<{ schemaVersion: 1; started: number; completed: number; failed: number }>;
}

export class ChatUserInteractionOTelService implements IChatUserInteractionOTelService {
	declare readonly _serviceBrand: undefined;
	private readonly _rendererId = generateUuid();
	private _started = 0;
	private _completed = 0;
	private _failed = 0;
	private readonly _pending = new Set<Promise<void>>();

	constructor(
		@IAgentHostConnectionsService private readonly _connections: IAgentHostConnectionsService,
		@ICommandService private readonly _commands: ICommandService,
		@ILogService private readonly _logService: ILogService,
	) { }

	begin(): Pick<IChatUserInteractionTiming, 'rendererId' | 'interactionOrdinal'> {
		return { rendererId: this._rendererId, interactionOrdinal: ++this._started };
	}

	report(data: IChatUserInteractionTiming, resource: URI | undefined, sessionType: string | undefined): void {
		this._completed++;
		const pending = this._send(data, resource, sessionType).catch(error => {
			this._failed++;
			this._logService.warn('[ChatTTFP] OTel export failed', error);
		}).finally(() => this._pending.delete(pending));
		this._pending.add(pending);
	}

	private async _send(data: IChatUserInteractionTiming, resource: URI | undefined, sessionType: string | undefined): Promise<void> {
		chatUserInteractionAttributes(data);
		if (resource && isAgentHostSessionResource(resource)) {
			const connection = this._connections.resolveSessionResource(resource)?.connection;
			if (!connection?.reportUserInteraction) {
				throw new Error('No Agent Host user interaction telemetry destination');
			}
			await connection.reportUserInteraction(data);
		} else if (sessionType && isLocalAgentHostTarget(sessionType)) {
			const connection = this._connections.ambientConnection;
			if (!connection.reportUserInteraction) {
				throw new Error('Agent Host user interaction telemetry is unsupported');
			}
			await connection.reportUserInteraction(data);
		} else if (sessionType && isRemoteAgentHostTarget(sessionType)) {
			throw new Error('No remote Agent Host routing identity for user interaction telemetry');
		} else if (!sessionType) {
			throw new Error('No session type for user interaction telemetry');
		} else {
			// Do not activate an extension just to export a UI observation.
			if (CommandsRegistry.getCommand(ReportChatUserInteractionCommand)) {
				await this._commands.executeCommand(ReportChatUserInteractionCommand, data);
			} else {
				this._logService.trace('[ChatTTFP] No extension OTel destination registered');
			}
		}
	}

	async flush(): Promise<{ schemaVersion: 1; started: number; completed: number; failed: number }> {
		const deadline = Date.now() + 10_000;
		while (this._completed < this._started && Date.now() < deadline) {
			await timeout(50);
		}
		if (this._completed < this._started) {
			this._logService.warn('[ChatTTFP] Timed out waiting for active UI observations');
		}
		await Promise.all(this._pending);
		return { schemaVersion: 1, started: this._started, completed: this._completed, failed: this._failed };
	}
}

registerSingleton(IChatUserInteractionOTelService, ChatUserInteractionOTelService, InstantiationType.Delayed);
CommandsRegistry.registerCommand('_chat.flushUserInteractionTelemetry', accessor => accessor.get(IChatUserInteractionOTelService).flush());
