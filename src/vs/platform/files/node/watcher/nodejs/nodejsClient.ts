/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IFileChange } from '../../../common/files.js';
import { ILogMessage, AbstractNonRecursiveWatcherClient, INonRecursiveWatcher } from '../../../common/watcher.js';
import { NodeJSWatcher } from './nodejsWatcher.js';

export class NodeJSWatcherClient extends AbstractNonRecursiveWatcherClient {

	constructor(
		onFileChanges: (changes: IFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean
	) {
		super(onFileChanges, onLogMessage, verboseLogging);

		this.init();
	}

	protected override createWatcher(disposables: DisposableStore): INonRecursiveWatcher {
		return disposables.add(new NodeJSWatcher(undefined /* no recursive watching support here */)) satisfies INonRecursiveWatcher;
	}
}
