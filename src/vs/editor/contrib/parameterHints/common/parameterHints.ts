/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {illegalArgument} from 'vs/base/common/errors';
import {TPromise} from 'vs/base/common/winjs.base';
import {IModel, IPosition} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {IParameterHints, IParameterHintsSupport} from 'vs/editor/common/modes';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';

export const ParameterHintsRegistry = new LanguageFeatureRegistry<IParameterHintsSupport>('parameterHintsSupport');

export function getParameterHints(model:IModel, position:IPosition, triggerCharacter: string): TPromise<IParameterHints> {

	let support = ParameterHintsRegistry.ordered(model)[0];
	if (!support) {
		return TPromise.as(undefined);
	}

	return support.getParameterHints(model.getAssociatedResource(), position, triggerCharacter);
}

CommonEditorRegistry.registerDefaultLanguageCommand('_executeSignatureHelpProvider', function(model, position, args) {
	let {triggerCharacter} = args;
	if (triggerCharacter && typeof triggerCharacter !== 'string') {
		throw illegalArgument('triggerCharacter');
	}
	return getParameterHints(model, position, triggerCharacter);
});