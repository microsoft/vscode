/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IDisposable} from 'vs/base/common/lifecycle';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';
import {IRange} from 'vs/editor/common/editorCommon';
import URI from 'vs/base/common/uri';

/**
 * Interface used to navigate to types by value.
 */
export interface ITypeBearing {
	containerName: string;
	name: string;
	parameters: string;
	type: string;
	range: IRange;
	resourceUri: URI;
}

export interface INavigateTypesSupport {
	getNavigateToItems:(search: string)=>TPromise<ITypeBearing[]>;
}


export namespace NavigateTypesSupportRegistry {

	const _supports: INavigateTypesSupport[] = [];

	export function register(support:INavigateTypesSupport):IDisposable {

		if (support) {
			_supports.push(support);
		}

		return {
			dispose() {
				if (support) {
					let idx = _supports.indexOf(support);
					if (idx >= 0) {
						_supports.splice(idx, 1);
						support = undefined;
					}
				}
			}
		}
	}

	// export function has(): boolean {
	// 	return _supports.length > 0;
	// }

	export function getAll(): INavigateTypesSupport[] {
		return _supports.slice(0);
	}
}
