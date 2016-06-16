/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { EditorInput } from 'vs/workbench/common/editor';
import { IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';

export class ExtensionsInput extends EditorInput {

	static get ID()  { return 'workbench.extensions.input2'; }
	get extension(): IGalleryExtension { return this._extension; }

	constructor(private _extension: IGalleryExtension) {
		super();
	}

	getTypeId(): string {
		return ExtensionsInput.ID;
	}

	getName(): string {
		return this.extension.manifest.displayName;
	}

	matches(other: any): boolean {
		if (!(other instanceof ExtensionsInput)) {
			return false;
		}

		const otherExtensionInput = other as ExtensionsInput;
		return this.extension.id === otherExtensionInput.extension.id;
	}

	resolve(refresh?: boolean): TPromise<any> {
		return TPromise.as(null);
	}
}