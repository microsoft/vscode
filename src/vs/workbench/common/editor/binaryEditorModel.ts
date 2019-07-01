/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorModel } from 'vs/workbench/common/editor';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { Schemas } from 'vs/base/common/network';
import { DataUri } from 'vs/base/common/resources';

/**
 * An editor model that just represents a resource that can be loaded.
 */
export class BinaryEditorModel extends EditorModel {
	private size: number;
	private etag: string | undefined;
	private readonly mime: string;

	constructor(
		private readonly resource: URI,
		private readonly name: string,
		@IFileService private readonly fileService: IFileService
	) {
		super();

		this.resource = resource;
		this.name = name;

		if (resource.scheme === Schemas.data) {
			const metadata = DataUri.parseMetaData(resource);
			if (metadata.has(DataUri.META_DATA_SIZE)) {
				this.size = Number(metadata.get(DataUri.META_DATA_SIZE));
			}

			this.mime = metadata.get(DataUri.META_DATA_MIME)!;
		}
	}

	/**
	 * The name of the binary resource.
	 */
	getName(): string {
		return this.name;
	}

	/**
	 * The resource of the binary resource.
	 */
	getResource(): URI {
		return this.resource;
	}

	/**
	 * The size of the binary resource if known.
	 */
	getSize(): number {
		return this.size;
	}

	/**
	 * The mime of the binary resource if known.
	 */
	getMime(): string {
		return this.mime;
	}

	/**
	 * The etag of the binary resource if known.
	 */
	getETag(): string | undefined {
		return this.etag;
	}

	async load(): Promise<BinaryEditorModel> {

		// Make sure to resolve up to date stat for file resources
		if (this.fileService.canHandleResource(this.resource)) {
			const stat = await this.fileService.resolve(this.resource, { resolveMetadata: true });
			this.etag = stat.etag;
			if (typeof stat.size === 'number') {
				this.size = stat.size;
			}
		}

		return this;
	}
}
