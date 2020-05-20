/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';
import { URI } from 'vs/base/common/uri';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IFileService, FileSystemProviderCapabilities } from 'vs/platform/files/common/files';
import { binarySearch } from 'vs/base/common/arrays';
import { ExtUri, IExtUri, normalizePath } from 'vs/base/common/resources';

export class UriIdentityService implements IUriIdentityService {

	_serviceBrand: undefined;

	readonly extUri: IExtUri;
	private _canonicalUris: URI[] = []; // use SkipList or BinaryTree instead of array...

	constructor(@IFileService private readonly _fileService: IFileService) {

		// assume path casing matters unless the file system provider spec'ed the opposite
		const ignorePathCasing = (uri: URI): boolean => {

			// perf@jrieken cache this information
			if (this._fileService.canHandleResource(uri)) {
				return !this._fileService.hasCapability(uri, FileSystemProviderCapabilities.PathCaseSensitive);
			}

			// this defaults to false which is a good default for
			// * virtual documents
			// * in-memory uris
			// * all kind of "private" schemes
			return false;
		};
		this.extUri = new ExtUri(ignorePathCasing);
	}

	asCanonicalUri(uri: URI): URI {

		// todo@jrieken there is more to it than just comparing
		// * ASYNC!?
		// * windows 8.3-filenames
		// * substr-drives...
		// * sym links?
		// * fetch real casing?

		// (1) normalize URI
		if (this._fileService.canHandleResource(uri)) {
			uri = normalizePath(uri);
		}

		// (2) find the uri in its canonical form or use this uri to define it
		// perf@jrieken
		// * using a SkipList or BinaryTree for faster insertion
		const idx = binarySearch(this._canonicalUris, uri, (a, b) => this.extUri.compare(a, b, true));
		if (idx >= 0) {
			return this._canonicalUris[idx].with({ fragment: uri.fragment });
		}

		// using slice/concat is faster than splice
		const before = this._canonicalUris.slice(0, ~idx);
		const after = this._canonicalUris.slice(~idx);
		this._canonicalUris = before.concat(uri.with({ fragment: null }), after);
		return uri;
	}
}

registerSingleton(IUriIdentityService, UriIdentityService, true);
