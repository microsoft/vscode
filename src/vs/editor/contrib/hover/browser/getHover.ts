/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { registerModelAndPositionCommand } from 'vs/editor/browser/editorExtensions';
import { Position } from 'vs/editor/common/core/position';
import { ITextModel } from 'vs/editor/common/model';
import { HoverProvider, Hover, DisposableHover } from 'vs/editor/common/languages';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { AsyncIterableObject } from 'vs/base/common/async';

export class HoverProviderResult<THover = Hover> {
	constructor(
		public readonly provider: HoverProvider,
		public readonly hover: THover,
		public readonly ordinal: number
	) { }

	convertDisposableHoverToHover(this: HoverProviderResult<DisposableHover>): HoverProviderResult<Hover> {
		return new HoverProviderResult(this.provider, convertDisposableHoverToHover(this.hover), this.ordinal);
	}
}

/**
 * Does not throw or return a rejected promise (returns undefined instead).
 */
async function executeProvider(provider: HoverProvider, ordinal: number, model: ITextModel, position: Position, token: CancellationToken): Promise<HoverProviderResult<DisposableHover> | undefined> {
	const result = await Promise
		.resolve(provider.provideHover(model, position, token))
		.catch(onUnexpectedExternalError);
	if (!result || !isValid(result)) {
		result?.dispose();
		return undefined;
	}

	return new HoverProviderResult(provider, result, ordinal);
}

export function fetchDisposableHovers(registry: LanguageFeatureRegistry<HoverProvider>, model: ITextModel, position: Position, token: CancellationToken): AsyncIterableObject<HoverProviderResult<DisposableHover>> {
	const providers = registry.ordered(model);
	const promises = providers.map((provider, index) => executeProvider(provider, index, model, position, token));
	return AsyncIterableObject.fromPromises(promises).coalesce();
}

export function getHovers(registry: LanguageFeatureRegistry<HoverProvider>, model: ITextModel, position: Position, token: CancellationToken): AsyncIterableObject<HoverProviderResult> {
	return fetchDisposableHovers(registry, model, position, token)
		.map(item => item.convertDisposableHoverToHover());
}

export function getHoversPromise(registry: LanguageFeatureRegistry<HoverProvider>, model: ITextModel, position: Position, token: CancellationToken): Promise<Hover[]> {
	return getHovers(registry, model, position, token).map(item => item.hover).toPromise();
}

registerModelAndPositionCommand('_executeHoverProvider', (accessor, model, position): Promise<Hover[]> => {
	const languageFeaturesService = accessor.get(ILanguageFeaturesService);
	return getHoversPromise(languageFeaturesService.hoverProvider, model, position, CancellationToken.None);
});

function isValid(result: DisposableHover) {
	const hasRange = (typeof result.range !== 'undefined');
	const hasHtmlContent = typeof result.contents !== 'undefined' && result.contents && result.contents.length > 0;
	return hasRange && hasHtmlContent;
}

function convertDisposableHoverToHover(disposableHover: DisposableHover): Hover {
	const hover: Hover = {
		contents: disposableHover.contents,
		range: disposableHover.range,
		canIncreaseVerbosity: disposableHover.canIncreaseVerbosity,
		canDecreaseVerbosity: disposableHover.canDecreaseVerbosity,
	};
	disposableHover.dispose();
	return hover;
}

