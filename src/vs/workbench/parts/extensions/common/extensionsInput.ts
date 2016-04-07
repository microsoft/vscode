/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import { IEditorInput } from 'vs/platform/editor/common/editor';

export class ExtensionsInput extends EventEmitter implements IEditorInput {

	getId(): string {
		return 'workbench.extensions.input';
	}

	getName(): string {
		return localize('extension', 'Extensions');
	}

	matches(other: any): boolean {
		return other instanceof ExtensionsInput;
	}
}