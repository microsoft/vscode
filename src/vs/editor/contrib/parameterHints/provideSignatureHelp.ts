/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { first } from 'vs/base/common/async';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { registerDefaultLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { Position } from 'vs/editor/common/core/position';
import { ITextModel } from 'vs/editor/common/model';
import * as modes from 'vs/editor/common/modes';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { CancellationToken } from 'vs/base/common/cancellation';

export const Context = {
	Visible: new RawContextKey<boolean>('parameterHintsVisible', false),
	MultipleSignatures: new RawContextKey<boolean>('parameterHintsMultipleSignatures', false),
};

export function provideSignatureHelp(model: ITextModel, position: Position, context: modes.SignatureHelpContext, token: CancellationToken): Promise<modes.SignatureHelp | null | undefined> {

	const supports = modes.SignatureHelpProviderRegistry.ordered(model);

	return first(supports.map(support => () => {
		return Promise.resolve(support.provideSignatureHelp(model, position, token, context)).catch(onUnexpectedExternalError);
	}));
}

registerDefaultLanguageCommand('_executeSignatureHelpProvider', (model, position, args) =>
	provideSignatureHelp(model, position, {
		triggerKind: modes.SignatureHelpTriggerKind.Invoke,
		isRetrigger: false,
		triggerCharacter: args['triggerCharacter']
	}, CancellationToken.None));
