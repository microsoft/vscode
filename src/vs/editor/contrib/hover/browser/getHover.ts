/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableObject } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { registerModelAndPositionCommand } from 'vs/editor/browser/editorExtensions';
import { Position } from 'vs/editor/common/core/position';
import { ITextModel } from 'vs/editor/common/model';
import { Hover, HoverContext, HoverProvider } from 'vs/editor/common/languages';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';

export class HoverProviderResult {
	constructor(
		public readonly provider: HoverProvider,
		public readonly hover: Hover,
		public readonly ordinal: number
	) { }
}

async function executeProvider(provider: HoverProvider, ordinal: number, model: ITextModel, position: Position, context: HoverContext | undefined, token: CancellationToken): Promise<HoverProviderResult | undefined> {
	try {
		const result = await Promise.resolve(provider.provideHover(model, position, token, context));
		if (result && isValid(result)) {
			return new HoverProviderResult(provider, result, ordinal);
		}
	} catch (err) {
		onUnexpectedExternalError(err);
	}
	return undefined;
}

export function getHover(registry: LanguageFeatureRegistry<HoverProvider>, model: ITextModel, position: Position, context: HoverContext | undefined, token: CancellationToken): AsyncIterableObject<HoverProviderResult> {
	const providers = registry.ordered(model);
	const promises = providers.map((provider, index) => executeProvider(provider, index, model, position, context, token));
	return AsyncIterableObject.fromPromises(promises).coalesce();
}

export function getHoverPromise(registry: LanguageFeatureRegistry<HoverProvider>, model: ITextModel, position: Position, context: HoverContext | undefined, token: CancellationToken): Promise<Hover[]> {
	return getHover(registry, model, position, context, token).map(item => item.hover).toPromise();
}

registerModelAndPositionCommand('_executeHoverProvider', async (accessor, model, position, context) => {
	const languageFeaturesService = accessor.get(ILanguageFeaturesService);
	const hovers = await getHoverPromise(languageFeaturesService.hoverProvider, model, position, context, CancellationToken.None);
	const result = hovers.map(h => cloneHover(h));
	hovers.forEach(hover => hover.dispose());
	return result;
});

function isValid(result: Hover) {
	const hasRange = (typeof result.range !== 'undefined');
	const hasHtmlContent = typeof result.contents !== 'undefined' && result.contents && result.contents.length > 0;
	return hasRange && hasHtmlContent;
}

function cloneHover(h: Hover): Hover {
	return {
		id: h.id,
		contents: h.contents,
		range: h.range,
		canIncreaseVerbosity: h.canIncreaseVerbosity,
		canDecreaseVerbosity: h.canDecreaseVerbosity,
		dispose: () => { }
	};
}
