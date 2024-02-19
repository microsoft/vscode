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
import { Hover, HoverProvider, ProviderResult } from 'vs/editor/common/languages';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';

export class HoverProviderResult {
	constructor(
		public readonly provider: HoverProvider,
		public readonly hover: Hover,
		public readonly ordinal: number
	) { }
}

async function executeProvider(provider: HoverProvider, ordinal: number, model: ITextModel, position: Position, showExtendedHover: boolean, token: CancellationToken): Promise<HoverProviderResult | undefined> {
	try {
		let provideHoverFunc: (model: ITextModel, position: Position, token: CancellationToken) => ProviderResult<Hover>;
		if (showExtendedHover && typeof provider['provideExtendedHover'] === 'function') {
			provideHoverFunc = provider.provideExtendedHover;
		} else {
			provideHoverFunc = provider.provideHover;
		}
		const result = await Promise.resolve(provideHoverFunc(model, position, token));
		if (result && isValid(result)) {
			return new HoverProviderResult(provider, result, ordinal);
		}
	} catch (err) {
		onUnexpectedExternalError(err);
	}
	return undefined;
}

export function getHover(registry: LanguageFeatureRegistry<HoverProvider>, model: ITextModel, position: Position, showExtendedHover: boolean, token: CancellationToken): AsyncIterableObject<HoverProviderResult> {
	const providers = registry.ordered(model);
	const promises = providers.map((provider, index) => executeProvider(provider, index, model, position, showExtendedHover, token));
	return AsyncIterableObject.fromPromises(promises).coalesce();
}

export function getHoverPromise(registry: LanguageFeatureRegistry<HoverProvider>, model: ITextModel, position: Position, showExtendedHover: boolean, token: CancellationToken): Promise<Hover[]> {
	return getHover(registry, model, position, showExtendedHover, token).map(item => item.hover).toPromise();
}

registerHoverCommand('_executeHoverProvider', false);

registerHoverCommand('_executeExtendedHoverProvider', true);

function registerHoverCommand(command: string, showExtendedHover: boolean) {
	registerModelAndPositionCommand(command, (accessor, model, position) => {
		const languageFeaturesService = accessor.get(ILanguageFeaturesService);
		return getHoverPromise(languageFeaturesService.hoverProvider, model, position, showExtendedHover, CancellationToken.None);
	});
}

function isValid(result: Hover) {
	const hasRange = (typeof result.range !== 'undefined');
	const hasHtmlContent = typeof result.contents !== 'undefined' && result.contents && result.contents.length > 0;
	return hasRange && hasHtmlContent;
}
