/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { ITextModelService } from 'vs/editor/common/services/resolverService';


export interface HtmlInputOptions {
	allowScripts?: boolean;
	allowSvgs?: boolean;
	svgWhiteList?: string[];
}

export function areHtmlInputOptionsEqual(left: HtmlInputOptions, right: HtmlInputOptions) {
	return left.allowScripts === right.allowScripts && left.allowSvgs === right.allowSvgs;
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
