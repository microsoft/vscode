/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asWinJsPromise, first } from 'vs/base/common/async';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { registerDefaultLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { Position } from 'vs/editor/common/core/position';
import { ITextModel } from 'vs/editor/common/model';
import { SignatureHelp, SignatureHelpProviderRegistry } from 'vs/editor/common/modes';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const Context = {
	Visible: new RawContextKey<boolean>('parameterHintsVisible', false),
	MultipleSignatures: new RawContextKey<boolean>('parameterHintsMultipleSignatures', false),
};

export function provideSignatureHelp(model: ITextModel, position: Position): TPromise<SignatureHelp> {

	const supports = SignatureHelpProviderRegistry.ordered(model);

	return first(supports.map(support => () => {
		return asWinJsPromise(token => support.provideSignatureHelp(model, position, token))
			.then(undefined, onUnexpectedExternalError);
	}));
}

registerDefaultLanguageCommand('_executeSignatureHelpProvider', provideSignatureHelp);
