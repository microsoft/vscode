/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { EditorInput } from 'vs/workbench/common/editor';

// TODO@joao: layer breaker
import { IExtension, ExtensionsModel } from '../electron-browser/extensionsModel';

export class ExtensionsInput extends EditorInput {

	static get ID()  { return 'workbench.extensions.input2'; }
	get model(): ExtensionsModel { return this._model; }
	get extension(): IExtension { return this._extension; }

	constructor(private _model: ExtensionsModel, private _extension: IExtension) {
		super();
	}

	getTypeId(): string {
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

		// TODO@joao is this correct?
		return this.extension === otherExtensionInput.extension;
	}

	resolve(refresh?: boolean): TPromise<any> {
		return TPromise.as(null);
	}
}