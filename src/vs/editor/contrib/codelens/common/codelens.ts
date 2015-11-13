/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import {IAction, Action} from 'vs/base/common/actions';
import {TPromise} from 'vs/base/common/winjs.base';
import {IRange, IPosition} from 'vs/editor/common/editorCommon';
import {Range} from 'vs/editor/common/core/range';
import {ICodeLensSupport, ICodeLensSymbol, ICommand} from 'vs/editor/common/modes';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';

const _registry = new LanguageFeatureRegistry<ICodeLensSupport>('codeLensSupport');

export {_registry as CodeLensRegistry}
