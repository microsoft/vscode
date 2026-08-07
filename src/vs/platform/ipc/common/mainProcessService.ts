/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IPCServer, IServerChannel, StaticRouter } from '../../../base/parts/ipc/common/ipc.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IRemoteService } from './services.js';

export const IMainProcessService = createDecorator<IMainProcessService>('mainProcessService');

export interface IMainProcessService extends IRemoteService { }

/**
 * An implementation of `IMainProcessService` that leverages `IPCServer`.
 */
export class MainProcessService implements IMainProcessService {

	declare readonly _serviceBrand: undefined;

	constructor(
		private server: IPCServer,
		private router: StaticRouter
	) { }

	getChannel(channelName: string): IChannel {
		return this.server.getChannel(channelName, this.router);
	}

	registerChannel(channelName: string, channel: IServerChannel<string>): void {
		// Güvenlik Kontrolü: Kanal adının boş veya geçersiz karakterler içerip içermediğini denetle
		if (!channelName || typeof channelName !== 'string' || channelName.trim() === '') {
			throw new Error('Geçersiz veya boş kanal ismi tespit edildi.');
		}

		// Optional: A specific prefix or rule requirement can be added.
		// if (!channelName.startsWith('vscode:')) {
		// 	throw new Error(`Unauthorized channel registration attempt: ${channelName}`);
		// }

		this.server.registerChannel(channelName, channel);
	}
}
