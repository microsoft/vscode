/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { EditorInput } from 'vs/workbench/common/editor';
import { IExtension } from 'vs/workbench/parts/extensions/common/extensions';
import { extensionEquals } from 'vs/workbench/parts/extensions/common/extensionsUtil';

export class ExtensionsInput extends EditorInput {

	static get ID()  { return 'workbench.extensions.input2'; }
	get extension(): IExtension { return this._extension; }

	constructor(private _extension: IExtension) {
		super();
	}

	getId(): string {
		return ExtensionsInput.ID;
	}

	getName(): string {
		return this.extension.displayName;
	}

	matches(other: any): boolean {
		if (!(other instanceof ExtensionsInput)) {
			return false;
		}

		const otherExtensionInput = other as ExtensionsInput;
		return extensionEquals(this.extension, otherExtensionInput.extension);
	}

	resolve(refresh?: boolean): TPromise<any> {
		return TPromise.as(null);
	}
}