/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IServer} from 'vs/base/parts/ipc/common/ipc';
import {AIAdapter} from './aiAdapter';
import {IAIChannel} from './ai.ipc';

const adapter: { [handle: number]: AIAdapter } = Object.create(null);
let idPool = 0;

export function registerAIChannel(server: IServer) {
	server.registerChannel('ai', <IAIChannel>{
		call(command: string, arg: any): TPromise<any> {
			switch (command) {
				case 'create': {
					let handle = idPool++;
					let {key, eventPrefix, data} = arg;
					adapter[handle] = new AIAdapter(eventPrefix, data, key);
					return TPromise.as(handle);
				}
				case 'log': {
					let {handle, eventName, data} = arg;
					adapter[handle].log(eventName, data);
					return TPromise.as(undefined);
				}
				case 'dispose': {
					let {handle} = arg;
					adapter[handle].dispose();
					delete adapter[handle];
					return TPromise.as(undefined);
				}
			}
		}
	});
}

// It is important to dispose the AI adapter properly because
// only then they flush remaining data.
process.on('SIGTERM', function () {
	let promises: TPromise<any>[] = [];
	for (let handle in adapter) {
		let ai = adapter[handle];
		promises.push(ai.dispose());
	}
	TPromise.join(promises).then(_ => process.exit(0));
});
