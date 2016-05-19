/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IModel, IEditorPosition} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {SignatureHelp, SignatureHelpProviderRegistry} from 'vs/editor/common/modes';
import {CancellationToken} from 'vs/base/common/cancellation';
import {toThenable} from 'vs/base/common/async';

export function provideSignatureHelp(model:IModel, position:IEditorPosition, cancellationToken = CancellationToken.None): Thenable<SignatureHelp> {

	let support = SignatureHelpProviderRegistry.ordered(model)[0];
	if (!support) {
		return TPromise.as(undefined);
	}

	return toThenable(support.provideSignatureHelp(model, position, cancellationToken));
}

CommonEditorRegistry.registerDefaultLanguageCommand('_executeSignatureHelpProvider', provideSignatureHelp);