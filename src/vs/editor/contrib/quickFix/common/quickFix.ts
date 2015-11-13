/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IQuickFixSupport, IQuickFix} from 'vs/editor/common/modes';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';

const QuickFixRegistry = new LanguageFeatureRegistry<IQuickFixSupport>('quickFixSupport');

export default QuickFixRegistry;

export interface IQuickFix2 extends IQuickFix {
	support: IQuickFixSupport;
}