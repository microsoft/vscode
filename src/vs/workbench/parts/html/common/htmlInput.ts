/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {ResourceEditorInput} from 'vs/workbench/common/editor/resourceEditorInput';

export class HtmlInput extends ResourceEditorInput {

	// just a marker class

	getResource(): URI {
		return this.resource;
	}
}
