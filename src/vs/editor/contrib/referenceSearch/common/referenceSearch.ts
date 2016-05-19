/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {onUnexpectedError} from 'vs/base/common/errors';
import {TPromise} from 'vs/base/common/winjs.base';
import {IReadOnlyModel, IPosition} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {Location, ReferenceSearchRegistry} from 'vs/editor/common/modes';

export function findReferences(model: IReadOnlyModel, position: IPosition): TPromise<Location[]> {

	// collect references from all providers
	const promises = ReferenceSearchRegistry.ordered(model).map(provider => {
		return provider.findReferences(model.getAssociatedResource(), position, true).then(result => {
			if (Array.isArray(result)) {
				return <Location[]> result;
			}
		}, err => {
			onUnexpectedError(err);
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

CommonEditorRegistry.registerDefaultLanguageCommand('_executeReferenceProvider', findReferences);