/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';

/**
 * Whether a resource exists, following changes to it until `store` is disposed.
 * @param existsWithoutProvider Whether a resource that no file system provides counts as existing, because nothing can tell
 * whether it exists.
 */
export function observeChatResourceExists(fileService: IFileService, resource: URI, store: DisposableStore, existsWithoutProvider: boolean): IObservable<boolean> {
	const exists = observableValue<boolean>('chatResourceExists', false);
	let version = 0;
	const refresh = async () => {
		const current = ++version;
		let result = false;
		try {
			await fileService.activateProvider(resource.scheme);
			result = fileService.hasProvider(resource) ? await fileService.exists(resource) : existsWithoutProvider;
		} catch {
			result = false;
		}
		if (current === version && !store.isDisposed) {
			exists.set(result, undefined);
		}
	};
	const watcher = store.add(new MutableDisposable());
	const watch = () => watcher.value = fileService.hasProvider(resource) ? fileService.watch(resource) : undefined;
	store.add(fileService.onDidFilesChange(e => {
		if (e.affects(resource)) {
			void refresh();
		}
	}));
	// A provider that registers late, such as an extension's, only reports changes to resources watched through it.
	store.add(fileService.onDidChangeFileSystemProviderRegistrations(e => {
		if (e.scheme === resource.scheme) {
			watch();
			void refresh();
		}
	}));
	watch();
	store.add(toDisposable(() => version++));
	void refresh();
	return exists;
}
