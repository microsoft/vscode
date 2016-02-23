/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {localize} from 'vs/nls';
import {sequence} from 'vs/base/common/async';
import {illegalArgument} from 'vs/base/common/errors';
import {TPromise} from 'vs/base/common/winjs.base';
import {IModel, IPosition} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {IRenameResult, IRenameSupport} from 'vs/editor/common/modes';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';

export const RenameRegistry = new LanguageFeatureRegistry<IRenameSupport>('renameSupport');

export function rename(model: IModel, position: IPosition, newName: string): TPromise<IRenameResult> {

	const supports = RenameRegistry.ordered(model);
	const resource = model.getAssociatedResource();
	const rejects: string[] = [];
	let hasResult = false;

	const factory = supports.map(support => {
		return () => {
			if (!hasResult) {
				return support.rename(resource, position, newName).then(result => {
					if (!result) {
						// ignore
					} else if (!result.rejectReason) {
						hasResult = true;
						return result;
					} else {
						rejects.push(result.rejectReason);
					}
				});
			}
		};
	});

	return sequence(factory).then(values => {
		let result = values[0];
		if (rejects.length > 0) {
			return <IRenameResult>{
				currentName: undefined,
				edits: undefined,
				rejectReason: rejects.join('\n')
			};
		} else if (!result) {
			return <IRenameResult>{
				currentName: undefined,
				edits: undefined,
				rejectReason: localize('no result', "No result.")
			};
		} else {
			return result;
		}
	});
}

CommonEditorRegistry.registerDefaultLanguageCommand('_executeDocumentRenameProvider', function(model, position, args) {
	let {newName} = args;
	if (typeof newName !== 'string') {
		throw illegalArgument('newName');
	}
	return rename(model, position, newName);
});