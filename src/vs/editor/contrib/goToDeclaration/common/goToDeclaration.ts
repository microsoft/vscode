/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {onUnexpectedError} from 'vs/base/common/errors';
import {IModel, IPosition} from 'vs/editor/common/editorCommon';
import {IDeclarationSupport} from 'vs/editor/common/modes';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';
import {IReference} from 'vs/editor/common/modes';

export const DeclarationRegistry = new LanguageFeatureRegistry<IDeclarationSupport>('declarationSupport');

export function getDeclarationsAtPosition(model: IModel, position: IPosition): TPromise<IReference[]> {

	const promises: TPromise<any>[] = [];
	const resource = model.getAssociatedResource();
	const provider = DeclarationRegistry.ordered(model);
	const references: (IReference[]| IReference)[] = Array<(IReference[]| IReference)>(provider.length);

	// get results
	provider.map((provider, idx) => {
		let promise = provider.findDeclaration(resource, position);
		promises.push(promise.then(result => {
			references[idx] = result;
		}, err => {
			onUnexpectedError(err);
		}));
	});

	return TPromise.join(promises).then(() => {
		let result: IReference[] = [];
		for (let item of references) {
			if (Array.isArray(item)) {
				result.push(...item)
			} else if(item) {
				result.push(item);
			}
		}

		return result;
	});
}