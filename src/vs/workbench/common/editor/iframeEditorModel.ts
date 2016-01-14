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
 * resolved it knows which content to pass to the iframe editor. The contents will be set directly into the
 * iframe. The contents have to ensure that e.g. a base URL is set so that relative links or images can be
 * resolved.
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
}