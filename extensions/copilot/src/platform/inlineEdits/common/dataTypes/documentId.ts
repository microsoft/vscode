/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CachedFunction } from '../../../../util/vs/base/common/cache';
import { basename, extname } from '../../../../util/vs/base/common/path';
import { URI } from '../../../../util/vs/base/common/uri';

/**
 * Refers to a document, independent of its content or a point in time.
 * Two document ids are equal if they are triple-equal.
*/
export class DocumentId {
	private static readonly _cache = new CachedFunction({ getCacheKey: JSON.stringify }, (arg: { uri: string }) => new DocumentId(arg.uri));
	public static create(uri: string): DocumentId {
		return DocumentId._cache.get({ uri });
	}

	private readonly _uri = URI.parse(this.uri);

	private constructor(
		public readonly uri: string,
	) {
	}

	public get path(): string {
		return this._uri.path;
	}

	public get fragment(): string {
		return this._uri.fragment;
	}

	public toString(): string {
		return this.uri;
	}

	public get baseName(): string {
		return basename(this.uri);
	}

	public get extension(): string {
		return extname(this.uri);
	}

	public toUri(): URI {
		return this._uri;
	}
}

export type SerializedDocumentId = string;
