/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { assertType } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { IPosition, Position } from '../../../common/core/position.js';
import { LanguageFeatureRegistry } from '../../../common/languageFeatureRegistry.js';
import * as languages from '../../../common/languages.js';
import { ITextModel } from '../../../common/model.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { ITextModelService } from '../../../common/services/resolverService.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

export const Context = {
	Visible: new RawContextKey<boolean>('parameterHintsVisible', false),
	MultipleSignatures: new RawContextKey<boolean>('parameterHintsMultipleSignatures', false),
};

export async function provideSignatureHelp(
	registry: LanguageFeatureRegistry<languages.SignatureHelpProvider>,
	model: ITextModel,
	position: Position,
	context: languages.SignatureHelpContext,
	token: CancellationToken
): Promise<languages.SignatureHelpResult | undefined> {

	const supports = registry.ordered(model);

	for (const support of supports) {
		try {
			const result = await support.provideSignatureHelp(model, position, token, context);
			if (result) {
				return result;
			}
		} catch (err) {
			onUnexpectedExternalError(err);
		}
	}
	return undefined;
}

CommandsRegistry.registerCommand('_executeSignatureHelpProvider', async (accessor, ...args: [URI, IPosition, string?]) => {
	const [uri, position, triggerCharacter] = args;
	assertType(URI.isUri(uri));
	assertType(Position.isIPosition(position));
	assertType(typeof triggerCharacter === 'string' || !triggerCharacter);

	const languageFeaturesService = accessor.get(ILanguageFeaturesService);

	const ref = await accessor.get(ITextModelService).createModelReference(uri);
	try {

		const result = await provideSignatureHelp(languageFeaturesService.signatureHelpProvider, ref.object.textEditorModel, Position.lift(position), {
			triggerKind: languages.SignatureHelpTriggerKind.Invoke,
			isRetrigger: false,
			triggerCharacter,
		}, CancellationToken.None);

		if (!result) {
			return undefined;
		}

		setTimeout(() => result.dispose(), 0);
		return result.value;

	} finally {
		ref.dispose();
	}
});
