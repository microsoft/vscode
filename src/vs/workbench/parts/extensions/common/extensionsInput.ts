/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { EditorInput } from 'vs/workbench/common/editor';

export class ExtensionsInput extends EditorInput {

	getId(): string {
		return 'workbench.extensions.input';
	}

	getName(): string {
		return localize('extension', 'Extensions');
	}

	matches(other: any): boolean {
		return other instanceof ExtensionsInput;
	}

	resolve(refresh?: boolean): TPromise<any> {
		return TPromise.as(null);
	}
}