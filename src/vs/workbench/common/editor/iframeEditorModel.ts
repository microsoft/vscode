/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {EditorModel} from 'vs/workbench/common/editor';

export interface IFrameContents {
	head: string;
	body: string;
	tail: string;
}

/**
 * An editor model that represents the resolved state for an iframe editor input. After the model has been
 * resolved it knows which URL or content to pass to the iframe editor. If a URL is being used, this will
 * be set as the iframe's URL. Otherwise the contents will be set directly into the iframe. In that case
 * the contents have to ensure that e.g. a base URL is set so that relative links or images can be resolved.
 */
export class IFrameEditorModel extends EditorModel {
	private _resource: URI;

	private url: string;
	private head: string;
	private body: string;
	private tail: string;

	constructor(resource:URI) {
		super();

		this._resource = resource;
	}

	public get resource(): URI {
		return this._resource;
	}

	public setUrl(url: string): void {
		this.url = url;
	}

	public getUrl(): string {
		return this.url;
	}

	public hasUrl(): boolean {
		return !!this.url;
	}

	public setContents(head: string, body: string, tail: string): void {
		this.head = head;
		this.body = body;
		this.tail = tail;
	}

	public getContents(): IFrameContents {
		return {
			head: this.head,
			body: this.body,
			tail: this.tail
		};
	}

	public hasContents(): boolean {
		return !!this.head || !!this.body || !!this.tail;
	}
}