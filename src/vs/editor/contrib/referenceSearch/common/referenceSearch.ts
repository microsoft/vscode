/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { IReadOnlyModel } from 'vs/editor/common/editorCommon';
import { CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { Location, ReferenceProviderRegistry } from 'vs/editor/common/modes';
import { asWinJsPromise } from 'vs/base/common/async';
import { Position } from 'vs/editor/common/core/position';

export function provideReferences(model: IReadOnlyModel, position: Position, progress: (locations: Location[]) => void): TPromise<Location[]> {

	// collect references from all providers
	const promises = ReferenceProviderRegistry.ordered(model).map(provider => {
		return asWinJsPromise((token) => {
			return provider.provideReferences(model, position, { includeDeclaration: true }, token, progress);
		}).then(result => {
			if (Array.isArray(result)) {
				return <Location[]>result;
			}
			return undefined;
		}, err => {
			onUnexpectedExternalError(err);
		});
	});

	return TPromise.join(promises).then(references => {
		let result: Location[] = [];
		for (let ref of references) {
			if (ref) {
				result.push(...ref);
			}
		}
		return result;
	});
}

CommonEditorRegistry.registerDefaultLanguageCommand('_executeReferenceProvider', provideReferences);