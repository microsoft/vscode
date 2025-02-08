/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { wrapInHotClass1 } from '../../../../platform/observable/common/wrapInHotClass.js';
import { InlineCompletionLanguageStatusBarContribution } from './inlineCompletionLanguageStatusBarContribution.js';

registerEditorContribution(InlineCompletionLanguageStatusBarContribution.Id, wrapInHotClass1(InlineCompletionLanguageStatusBarContribution.hot), EditorContributionInstantiation.Eventually);
