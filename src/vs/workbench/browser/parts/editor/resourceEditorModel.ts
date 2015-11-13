/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import errors = require('vs/base/common/errors');
import {MIME_UNKNOWN} from 'vs/base/common/mime';
import types = require('vs/base/common/types');
import {Header, IXHRResponse} from 'vs/base/common/http';
import {EditorModel} from 'vs/workbench/common/editor';
import {BaseTextEditorModel} from 'vs/workbench/browser/parts/editor/textEditorModel';
import URI from 'vs/base/common/uri';
import {IFileService, IContent} from 'vs/platform/files/common/files';
import {IRequestService} from 'vs/platform/request/common/request';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IModelService} from 'vs/editor/common/services/modelService';

/**
 * An editor model whith a readonly content that can be resolved through the provided URL.
 */
export class TextResourceEditorModel extends BaseTextEditorModel {
	private url: string;
	private method: string;
	private headers: any;
	private mime: string;
	private lastModified: number;
	private isMimeEnforced: boolean;
	private resource: URI;

	constructor(
		url: string,
		mime: string,
		method: string,
		headers: any,
		resource: URI,
		@IModeService modeService: IModeService,
		@IModelService modelService: IModelService,
		@IRequestService private requestService: IRequestService,
		@IFileService private fileService: IFileService
	) {
		super(modelService, modeService);

		this.url = url;
		this.mime = mime;
		this.method = method;
		this.headers = headers;
		this.resource = resource;
	}

	/**
	 * Will cause this editor model to use the mime that was given in to the constructor and will
	 * ignore any mime that is returned from downloading the resource from the net. This is useful to enforce a certain mime
	 * to be used for this resource even though it might be served differently.
	 */
	public setMimeEnforced(): void {
		this.isMimeEnforced = !!this.mime; // Only enforce if a mime is set
	}

	/**
	 * When the model is loaded, will return the last modified header value as millies since 1970 for the resource if it is provided.
	 */
	public getLastModified(): number {
		return this.lastModified;
	}

	public load(): TPromise<EditorModel> {

		// We can load file:// URIs through the file service
		let isFileResource: boolean;
		try {
			isFileResource = URI.parse(this.url).scheme === 'file';
		} catch (error) {
			isFileResource = false;
		}

		let loadPromise: TPromise<IXHRResponse | IContent>;
		if (isFileResource) {
			loadPromise = this.fileService.resolveContent(URI.parse(this.url));
		} else {
			loadPromise = this.requestService.makeRequest({ url: this.url, type: this.method, headers: this.headers });
		}

		return loadPromise.then((result) => {
			let mtime: number;
			let mime = this.mime;
			let value: string;

			// Handle XHR
			if (types.isFunction((<IXHRResponse>result).getResponseHeader)) {
				let xhr = <IXHRResponse>result;
				let lastModifiedValue = xhr.getResponseHeader(Header.LAST_MODIFIED);
				if (lastModifiedValue) {
					mtime = new Date(lastModifiedValue).getTime();
				}

				let contentType = xhr.getResponseHeader(Header.X_CONTENT_TYPES) || xhr.getResponseHeader(Header.CONTENT_TYPE);
				if (contentType && contentType.indexOf('; charset') >= 0) {
					contentType = contentType.substring(0, contentType.indexOf(';'));
				}

				if (contentType && contentType !== MIME_UNKNOWN) {
					mime = contentType;
				}

				value = xhr.responseText;
			}

			// Handle IContent
			else {
				let content = <IContent>result;
				mtime = content.mtime;
				mime = content.mime;
				value = content.value;
			}

			// Keep this meta data
			this.lastModified = mtime;

			// Create text editor model if not yet done
			if (!this.textEditorModel) {
				return this.createTextEditorModel(value, !this.isMimeEnforced ? mime : this.mime, this.resource);
			}

			// Otherwise update
			this.updateTextEditorModel(value, !this.isMimeEnforced ? mime : undefined /* do not update mime from previous load */);

			return TPromise.as(this);
		}, (error) => {
			if (error instanceof Error) {
				return TPromise.wrapError<EditorModel>(error);
			}

			return TPromise.wrapError<EditorModel>(new errors.ConnectionError(error));
		});
	}
}

/**
 * An editor model that just represents a URL and mime for a resource that can be loaded.
 */
export class BinaryResourceEditorModel extends EditorModel {
	private name: string;
	private url: string;

	constructor(name: string, url: string) {
		super();

		this.name = name;
		this.url = url;
	}

	/**
	 * The name of the binary resource.
	 */
	public getName(): string {
		return this.name;
	}

	/**
	 * The url of the binary resource.
	 */
	public getUrl(): string {
		return this.url;
	}
}