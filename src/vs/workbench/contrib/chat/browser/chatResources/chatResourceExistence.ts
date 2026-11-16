/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';

/** The services that tell what provides a chat resource's scheme. */
export interface IChatResourceProviders {
	readonly fileService: IFileService;
	readonly textModelService: ITextModelService;
	readonly extensionService: IExtensionService;
}

/**
 * What provides a resource's scheme: a file system provider, which can tell whether the resource exists, or a text content
 * provider, which cannot, so its resources are assumed to exist. Without either, the chat cannot show the resource.
 */
export type ChatResourceProviderKind = 'fileSystem' | 'textContent' | undefined;

export function getChatResourceProviderKind(resource: URI, providers: IChatResourceProviders): ChatResourceProviderKind {
	return providers.fileService.hasProvider(resource) ? 'fileSystem'
		: providers.textModelService.canHandleResource(resource) ? 'textContent'
			: undefined;
}

/** Whether a resource exists (see {@link ChatResourceProviderKind}), following changes to it until `store` is disposed. */
export function observeChatResourceExists(providers: IChatResourceProviders, resource: URI, store: DisposableStore): IObservable<boolean> {
	const { fileService, extensionService } = providers;
	const exists = observableValue<boolean>('chatResourceExists', false);
	let version = 0;
	const refresh = async () => {
		const current = ++version;
		let result = false;
		try {
			await fileService.activateProvider(resource.scheme);
			const kind = getChatResourceProviderKind(resource, providers);
			result = kind === 'fileSystem' ? await fileService.exists(resource) : kind === 'textContent';
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
	// Text content providers register without an event, when their extension activates.
	store.add(extensionService.onDidChangeExtensionsStatus(() => {
		if (!fileService.hasProvider(resource)) {
			void refresh();
		}
	}));
	watch();
	store.add(toDisposable(() => version++));
	void refresh();
	return exists;
}