/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { coalesce } from 'vs/base/common/arrays';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { IReadOnlyModel } from 'vs/editor/common/editorCommon';
import { CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { Hover, HoverProviderRegistry } from 'vs/editor/common/modes';
import { asWinJsPromise } from 'vs/base/common/async';
import { Position } from 'vs/editor/common/core/position';

export function getHover(model: IReadOnlyModel, position: Position): TPromise<Hover[]> {

	const supports = HoverProviderRegistry.ordered(model);
	const values: Hover[] = [];

	const promises = supports.map((support, idx) => {
		return asWinJsPromise((token) => {
			return support.provideHover(model, position, token);
		}).then((result) => {
			if (result) {
				let hasRange = (typeof result.range !== 'undefined');
				let hasHtmlContent = (typeof result.contents !== 'undefined' && result.contents && result.contents.length > 0);
				if (hasRange && hasHtmlContent) {
					values[idx] = result;
				}
			}
		}, err => {
			onUnexpectedExternalError(err);
		});
	});

	return TPromise.join(promises).then(() => coalesce(values));
}

CommonEditorRegistry.registerDefaultLanguageCommand('_executeHoverProvider', getHover);