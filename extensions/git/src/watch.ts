/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { EventEmitter, Event, Disposable } from 'vscode';
import * as fs from 'fs';

export interface FSEvent {
	eventType: string;
	filename: string;
}

export function watch(path: string): { event: Event<FSEvent>; disposable: Disposable; } {
	const emitter = new EventEmitter<FSEvent>();
	const event = emitter.event;
	const watcher = fs.watch(path, (eventType, filename) => emitter.fire({ eventType, filename }));
	const disposable = new Disposable(() => watcher.close());

	return { event, disposable };
}
