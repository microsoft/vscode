/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IAIChannel} from './ai.ipc';
import {TPromise} from 'vs/base/common/winjs.base';
import {connect} from 'vs/base/parts/ipc/node/ipc.net';

export interface IAIAdapter {
	log(eventName: string, data?: any): void;
	dispose(): void;
}

export function createAIAdapter(key: string, eventPrefix: string, data: { [key: string]: any }): IAIAdapter {

	let beforeReadyMessages: { type: string; args: any }[] = [];
	let handle: number = undefined;
	let channel: IAIChannel = {
		call(type: string, args: any): TPromise<any> {
			beforeReadyMessages.push({ type, args });
			return TPromise.as(void 0);
		}
	};

	connect(process.env['VSCODE_SHARED_IPC_HOOK']).then(client => client.getChannel<IAIChannel>('ai')).then(actualChannel => {

		return actualChannel.call('create', { key, eventPrefix, data }).then(actualHandle => {
			// channel has been created, store handle etc,
			// and flush all early messages
			handle = actualHandle;
			channel = actualChannel;
			for (let m of beforeReadyMessages) {
				let {type, args} = m;
				args.handle = handle;
				channel.call(type, args);
			}
			beforeReadyMessages.length = 0;
		});
	});

	return <IAIAdapter>{
		log(eventName: string, data?: any) {
			channel.call('log', { handle, eventName, data });
		},
		dispose() {
			channel.call('dispose', { handle });
		}
	};

}
