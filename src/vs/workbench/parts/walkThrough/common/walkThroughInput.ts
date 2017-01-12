/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';

export class WalkThroughInput extends ResourceEditorInput {

	// just a marker class
	constructor(
		name: string,
		description: string,
		resource: URI,
		public readonly onReady: (container: HTMLElement) => void,
		@ITextModelResolverService textModelResolverService: ITextModelResolverService
	) {
		super(name, description, resource, textModelResolverService);
	}

	getResource(): URI {
		return this.resource;
	}
}
