/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './placeholderText.css';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { ghostTextForeground } from '../../../common/core/editorColorRegistry.js';
import { localize } from '../../../../nls.js';
import { registerColor } from '../../../../platform/theme/common/colorUtils.js';
import { PlaceholderTextContribution } from './placeholderTextContribution.js';
import { wrapInReloadableClass1 } from '../../../../platform/observable/common/wrapInReloadableClass.js';

registerEditorContribution(PlaceholderTextContribution.ID, wrapInReloadableClass1(() => PlaceholderTextContribution), EditorContributionInstantiation.Eager);

registerColor('editor.placeholder.foreground', ghostTextForeground, localize('placeholderForeground', 'Foreground color of the placeholder text in the editor.'));
