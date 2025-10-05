/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILanguageRuntimeSession, RuntimeClientType } from '../../../../services/runtimeSession/common/runtimeSessionService.js';
import { HelpClientInstance } from '../../../../services/languageRuntime/common/languageRuntimeHelpClient.js';

export class HelpClientManager {
	private _clients = new Map<string, HelpClientInstance>();

	async registerSession(session: ILanguageRuntimeSession): Promise<HelpClientInstance> {
		const sessionId = session.sessionId;

		if (this._clients.has(sessionId)) {
			this._clients.get(sessionId)!.dispose();
		}

		const existingClients = await session.listClients(RuntimeClientType.Help);
		// Use the most recently created client (last in array) for consistency
		const client = existingClients.length > 0 ?
			existingClients[existingClients.length - 1] :
			await session.createClient(RuntimeClientType.Help, {});

	const helpClient = new HelpClientInstance(client, session.runtimeMetadata.languageId, sessionId);
		this._clients.set(sessionId, helpClient);

		return helpClient;
	}

	unregisterSession(sessionId: string): void {
		const client = this._clients.get(sessionId);
		if (client) {
			client.dispose();
			this._clients.delete(sessionId);
		}
	}

	findClientsByLanguage(languageId: string): HelpClientInstance[] {
		return Array.from(this._clients.values())
			.filter(c => c.languageId === languageId);
	}

	retrieveAllClients(): HelpClientInstance[] {
		return Array.from(this._clients.values());
	}

	dispose(): void {
		this._clients.forEach(c => c.dispose());
		this._clients.clear();
	}
}


