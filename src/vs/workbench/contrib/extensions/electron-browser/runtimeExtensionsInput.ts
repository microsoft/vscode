/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { EditorInput } from 'vs/workbench/common/editor';

export class RuntimeExtensionsInput extends EditorInput {

	static readonly ID = 'workbench.runtimeExtensions.input';

	readonly resource = URI.from({
		scheme: 'runtime-extensions',
		path: 'default'
	});

	getTypeId(): string {
		return RuntimeExtensionsInput.ID;
	}

	getName(): string {
		return nls.localize('extensionsInputName', "Running Extensions");
	}

	matches(other: unknown): boolean {
		if (!(other instanceof RuntimeExtensionsInput)) {
			return false;
		}
		return true;
	}

	resolve(): Promise<any> {
		return Promise.resolve(null);
	}

	supportsSplitEditor(): boolean {
		return false;
	}
}
