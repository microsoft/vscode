/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IOutlineEntry, IOutlineSupport} from 'vs/editor/common/modes';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';

const QuickOutineRegistry = new LanguageFeatureRegistry<IOutlineSupport>('outlineSupport');

export {
	IOutlineEntry,
	IOutlineSupport
}

export default QuickOutineRegistry;