/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Disposable, DisposableMap, IDisposable, IReference, toDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { getMediaOrTextMime } from '../../../base/common/mime.js';
import { FileAccess } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IBrowserResourceService } from '../common/browserResourceService.js';
import { IFileService } from '../common/files.js';
export { IBrowserResourceService } from '../common/browserResourceService.js';

interface IObjectUrlEntry {
	readonly value: Promise<URI>;
	references: number;
}

/** Bridges explicitly registered filesystems to desktop/web resource transports or scoped object URLs. */
export class BrowserResourceService extends Disposable implements IBrowserResourceService {
	declare readonly _serviceBrand: undefined;

	private readonly schemes = new Set<string>();
	private readonly registrations = this._register(new DisposableMap<string>());
	private readonly resources = new Map<string, URI>();
	private readonly resourceIds = new ResourceMap<string>();
	private readonly objectUrls = new ResourceMap<IObjectUrlEntry>();

	constructor(
		private readonly resourceUriProvider: ((resourceId: string, resource: URI) => URI) | undefined,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
		this._register(toDisposable(() => {
			for (const entry of this.objectUrls.values()) {
				void entry.value.then(uri => URL.revokeObjectURL(uri.toString(true)), () => { /* No URL was created. */ });
			}
			this.objectUrls.clear();
			this.resources.clear();
			this.resourceIds.clear();
		}));
	}

	registerScheme(scheme: string): IDisposable {
		if (this.schemes.has(scheme)) {
			throw new Error(`Browser resource scheme already registered: ${scheme}`);
		}
		const registration = FileAccess.registerBrowserUriProvider(scheme, {
			uriToBrowserUri: this.resourceUriProvider ? resource => this.createResourceUri(resource) : undefined,
			resolve: resource => this.resolve(resource)!,
		});
		this.schemes.add(scheme);
		this.registrations.set(scheme, toDisposable(() => {
			registration.dispose();
			this.schemes.delete(scheme);
			for (const [resource, id] of this.resourceIds) {
				if (resource.scheme === scheme) {
					this.resourceIds.delete(resource);
					this.resources.delete(id);
				}
			}
		}));
		return toDisposable(() => this.registrations.deleteAndDispose(scheme));
	}

	private createResourceUri(resource: URI): URI {
		let id = this.resourceIds.get(resource);
		if (!id) {
			id = generateUuid();
			this.resourceIds.set(resource, id);
			this.resources.set(id, resource);
		}
		return this.resourceUriProvider!(id, resource);
	}

	async read(resourceId: string): Promise<{ content: VSBuffer; mimeType: string | undefined } | undefined> {
		const resource = this.resources.get(resourceId);
		if (!resource || !this.schemes.has(resource.scheme)) {
			return undefined;
		}
		const content = await this.fileService.readFile(resource);
		return { content: content.value, mimeType: getMediaOrTextMime(resource.path) };
	}

	resolve(resource: URI): Promise<IReference<URI>> | undefined {
		if (!this.schemes.has(resource.scheme)) {
			return undefined;
		}
		if (this.resourceUriProvider) {
			return Promise.resolve({ object: this.createResourceUri(resource), dispose: () => { } });
		}
		return this.acquireObjectUrl(resource);
	}

	private async acquireObjectUrl(resource: URI): Promise<IReference<URI>> {
		let entry = this.objectUrls.get(resource);
		if (!entry) {
			entry = { value: this.createObjectUrl(resource), references: 0 };
			this.objectUrls.set(resource, entry);
		}
		entry.references++;
		const current = entry;
		const release = toDisposable(() => {
			current.references--;
			// A synchronous rerender can acquire the same resource before its previous URL is released.
			queueMicrotask(() => {
				if (current.references === 0 && this.objectUrls.get(resource) === current) {
					this.objectUrls.delete(resource);
					void current.value.then(uri => URL.revokeObjectURL(uri.toString(true)), () => { /* No URL was created. */ });
				}
			});
		});
		try {
			return { object: await current.value, dispose: () => release.dispose() };
		} catch (error) {
			release.dispose();
			throw error;
		}
	}

	private async createObjectUrl(resource: URI): Promise<URI> {
		const content = await this.fileService.readFile(resource);
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		return URI.parse(URL.createObjectURL(new Blob([content.value.buffer as Uint8Array<ArrayBuffer>], { type: getMediaOrTextMime(resource.path) })));
	}
}
