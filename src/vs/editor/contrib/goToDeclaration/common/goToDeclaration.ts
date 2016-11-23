/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { IReadOnlyModel } from 'vs/editor/common/editorCommon';
import { CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { DefinitionProviderRegistry, Location } from 'vs/editor/common/modes';
import { asWinJsPromise } from 'vs/base/common/async';
import { Position } from 'vs/editor/common/core/position';

export function getDeclarationsAtPosition(model: IReadOnlyModel, position: Position): TPromise<Location[]> {

	const provider = DefinitionProviderRegistry.ordered(model);

	// get results
	const promises = provider.map((provider, idx) => {
		return asWinJsPromise((token) => {
			return provider.provideDefinition(model, position, token);
		}).then(result => {
			return result;
		}, err => {
			onUnexpectedError(err);
		});
	});

	return TPromise.join(promises).then(allReferences => {
		let result: Location[] = [];
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