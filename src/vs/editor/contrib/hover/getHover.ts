/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { ITextModel } from 'vs/editor/common/model';
import { registerDefaultLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { Hover, HoverProviderRegistry } from 'vs/editor/common/modes';
import { Position } from 'vs/editor/common/core/position';
import { CancellationToken } from 'vs/base/common/cancellation';

export function getHover(model: ITextModel, position: Position, token: CancellationToken): Promise<Hover[]> {

	const supports = HoverProviderRegistry.ordered(model);
	const values: Hover[] = [];

	const promises = supports.map((support, idx) => {
		return Promise.resolve(support.provideHover(model, position, token)).then((result) => {
			if (!result) {
				return;
			}

			const hasRange = (typeof result.range !== 'undefined');
			const hasHtmlContent = typeof result.contents !== 'undefined' && result.contents && result.contents.length > 0;
			if (hasRange && hasHtmlContent) {
				values[idx] = result;
			}
		}, err => {
			onUnexpectedExternalError(err);
		});
	});

	return Promise.all(promises).then(() => coalesce(values));
}

registerDefaultLanguageCommand('_executeHoverProvider', (model, position) => getHover(model, position, CancellationToken.None));
