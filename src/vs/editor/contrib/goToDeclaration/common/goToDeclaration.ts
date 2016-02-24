/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {onUnexpectedError} from 'vs/base/common/errors';
import {TPromise} from 'vs/base/common/winjs.base';
import {IModel, IPosition} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {IDeclarationSupport} from 'vs/editor/common/modes';
import {IReference} from 'vs/editor/common/modes';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';

export const DeclarationRegistry = new LanguageFeatureRegistry<IDeclarationSupport>('declarationSupport');

export function getDeclarationsAtPosition(model: IModel, position: IPosition): TPromise<IReference[]> {

	const resource = model.getAssociatedResource();
	const provider = DeclarationRegistry.ordered(model);

	// get results
	const promises = provider.map((provider, idx) => {
		return provider.findDeclaration(resource, position).then(result => {
			return result;
		}, err => {
			onUnexpectedError(err);
		});
	});

	return TPromise.join(promises).then(allReferences => {
		let result: IReference[] = [];
		for (let references of allReferences) {
			if (Array.isArray(references)) {
				result.push(...references);
			} else if (references) {
				result.push(references);
			}
		}
		return result;
	});
}

CommonEditorRegistry.registerDefaultLanguageCommand('_executeDefinitionProvider', getDeclarationsAtPosition);