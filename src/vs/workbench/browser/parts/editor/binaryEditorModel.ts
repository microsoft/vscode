/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {EditorModel} from 'vs/workbench/common/editor';
import URI from 'vs/base/common/uri';

/**
 * An editor model that just represents a URL and mime for a resource that can be loaded.
 */
export class BinaryEditorModel extends EditorModel {
	private name: string;
	private resource: URI;

	constructor(resource: URI, name: string) {
		super();

		this.name = name;
		this.resource = resource;
	}

	/**
	 * The name of the binary resource.
	 */
	public getName(): string {
		return this.name;
	}

	/**
	 * The resource of the binary resource.
	 */
	public getResource(): URI {
		return this.resource;
	}
}