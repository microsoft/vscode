/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import URI from 'vs/base/common/uri';
import { ITextModelService } from 'vs/editor/common/services/resolverService';


export interface HtmlInputOptions {
	enableJavaScript?: boolean;
}

export class HtmlInput extends ResourceEditorInput {
	constructor(
		name: string,
		description: string,
		resource: URI,
		public readonly options: HtmlInputOptions,
		@ITextModelService textModelResolverService: ITextModelService
	) {
		super(name, description, resource, textModelResolverService);
	}
}
