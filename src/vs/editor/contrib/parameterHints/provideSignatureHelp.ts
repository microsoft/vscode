/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { first2 } from 'vs/base/common/async';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { registerDefaultLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { Position } from 'vs/editor/common/core/position';
import { ITextModel } from 'vs/editor/common/model';
import { SignatureHelp, SignatureHelpProviderRegistry } from 'vs/editor/common/modes';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { CancellationToken } from 'vs/base/common/cancellation';

export const Context = {
	Visible: new RawContextKey<boolean>('parameterHintsVisible', false),
	MultipleSignatures: new RawContextKey<boolean>('parameterHintsMultipleSignatures', false),
};

export function provideSignatureHelp(model: ITextModel, position: Position, token: CancellationToken): Promise<SignatureHelp> {

	const supports = SignatureHelpProviderRegistry.ordered(model);

	return first2(supports.map(support => () => {
		return Promise.resolve(support.provideSignatureHelp(model, position, token)).catch(onUnexpectedExternalError);
	}));
}

registerDefaultLanguageCommand('_executeSignatureHelpProvider', (model, position) => provideSignatureHelp(model, position, CancellationToken.None));
