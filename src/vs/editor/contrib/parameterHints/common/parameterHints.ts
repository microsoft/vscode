/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IReadOnlyModel } from 'vs/editor/common/editorCommon';
import { CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { SignatureHelp, SignatureHelpProviderRegistry } from 'vs/editor/common/modes';
import { asWinJsPromise } from 'vs/base/common/async';
import { Position } from 'vs/editor/common/core/position';

export const Context = {
	Visible: 'parameterHintsVisible',
	MultipleSignatures: 'parameterHintsMultipleSignatures',
};

export function provideSignatureHelp(model:IReadOnlyModel, position:Position): TPromise<SignatureHelp> {
	const support = SignatureHelpProviderRegistry.ordered(model)[0];

	if (!support) {
		return TPromise.as(undefined);
	}

	return asWinJsPromise(token => support.provideSignatureHelp(model, position, token));
}

CommonEditorRegistry.registerDefaultLanguageCommand('_executeSignatureHelpProvider', provideSignatureHelp);