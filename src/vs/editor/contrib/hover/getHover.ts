/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { registerModelAndPositionCommand } from 'vs/editor/browser/editorExtensions';
import { Position } from 'vs/editor/common/core/position';
import { ITextModel } from 'vs/editor/common/model';
import { Hover, HoverProvider, HoverProviderRegistry } from 'vs/editor/common/modes';
import { AsyncIterableSource, AsyncIterableWriter } from 'vs/editor/contrib/hover/asyncIterableSource';

async function executeProvider(provider: HoverProvider, model: ITextModel, position: Position, token: CancellationToken, writer: AsyncIterableWriter<Hover>): Promise<void> {
	try {
		const result = await Promise.resolve(provider.provideHover(model, position, token));
		if (result && isValid(result)) {
			writer.writeOne(result);
		}
	} catch (err) {
		onUnexpectedExternalError(err);
	}
}

export function getHover(model: ITextModel, position: Position, token: CancellationToken): AsyncIterable<Hover> {
	return new AsyncIterableSource<Hover>(async (writer) => {
		const providers = HoverProviderRegistry.ordered(model);
		const promises = providers.map((provider) => executeProvider(provider, model, position, token, writer));
		await Promise.all(promises);
	});
}

registerModelAndPositionCommand('_executeHoverProvider', (model, position) => AsyncIterableSource.toPromise(getHover(model, position, CancellationToken.None)));

function isValid(result: Hover) {
	const hasRange = (typeof result.range !== 'undefined');
	const hasHtmlContent = typeof result.contents !== 'undefined' && result.contents && result.contents.length > 0;
	return hasRange && hasHtmlContent;
}
