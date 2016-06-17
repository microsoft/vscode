/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { EditorInput } from 'vs/workbench/common/editor';
import { IExtension, IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';

export class ExtensionsInput extends EditorInput {

	static get ID()  { return 'workbench.extensions.input2'; }
	get extension(): IExtension | IGalleryExtension { return this._extension; }

	constructor(private _extension: IExtension | IGalleryExtension) {
		super();
	}

	getTypeId(): string {
		return ExtensionsInput.ID;
	}

	getName(): string {
		const local = this.extension as IExtension;
		const gallery = this.extension as IGalleryExtension;

		if (local.path) {
			return local.manifest.displayName || local.manifest.name;
		} else {
			return gallery.displayName || gallery.name;
		}
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