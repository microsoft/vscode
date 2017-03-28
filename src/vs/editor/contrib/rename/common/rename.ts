/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { sequence, asWinJsPromise } from 'vs/base/common/async';
import { illegalArgument, onUnexpectedExternalError } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { IReadOnlyModel } from 'vs/editor/common/editorCommon';
import { CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { WorkspaceEdit, RenameProviderRegistry } from 'vs/editor/common/modes';
import { Position } from 'vs/editor/common/core/position';

export function rename(model: IReadOnlyModel, position: Position, newName: string): TPromise<WorkspaceEdit> {

	const supports = RenameProviderRegistry.ordered(model);
	const rejects: string[] = [];
	let hasResult = false;

	const factory = supports.map(support => {
		return () => {
			if (!hasResult) {
				return asWinJsPromise((token) => {
					return support.provideRenameEdits(model, position, newName, token);
				}).then(result => {
					if (!result) {
						// ignore
					} else if (!result.rejectReason) {
						hasResult = true;
						return result;
					} else {
						rejects.push(result.rejectReason);
					}
					return undefined;
				}, err => {
					onUnexpectedExternalError(err);
					return TPromise.wrapError<WorkspaceEdit>('provider failed');
				});
			}
			return undefined;
		};
	});

	return sequence(factory).then((values): WorkspaceEdit => {
		let result = values[0];
		if (rejects.length > 0) {
			return {
				edits: undefined,
				rejectReason: rejects.join('\n')
			};
		} else if (!result) {
			return {
				edits: undefined,
				rejectReason: localize('no result', "No result.")
			};
		} else {
			return result;
		}
	});
}

CommonEditorRegistry.registerDefaultLanguageCommand('_executeDocumentRenameProvider', function (model, position, args) {
	let {newName} = args;
	if (typeof newName !== 'string') {
		throw illegalArgument('newName');
	}
	return rename(model, position, newName);
});
