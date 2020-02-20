/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { EditorInput } from 'vs/workbench/common/editor';
import { IExtension } from 'vs/workbench/contrib/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';

export class ExtensionsInput extends EditorInput {

	static readonly ID = 'workbench.extensions.input2';
	get extension(): IExtension { return this._extension; }

	get resource() {
		return URI.from({
			scheme: 'extension',
			path: this.extension.identifier.id
		});
	}

	constructor(
		private readonly _extension: IExtension
	) {
		super();
	}

	getTypeId(): string {
		return ExtensionsInput.ID;
	}

	getName(): string {
		return localize('extensionsInputName', "Extension: {0}", this.extension.displayName);
	}

	matches(other: unknown): boolean {
		if (super.matches(other) === true) {
			return true;
		}

		if (!(other instanceof ExtensionsInput)) {
			return false;
		}

		const otherExtensionInput = other as ExtensionsInput;

		// TODO@joao is this correct?
		return this.extension === otherExtensionInput.extension;
	}

	resolve(): Promise<any> {
		return Promise.resolve(null);
	}

	supportsSplitEditor(): boolean {
		return false;
	}
}
