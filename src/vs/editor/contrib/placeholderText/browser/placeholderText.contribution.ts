/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./placeholderText';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../browser/editorExtensions';
import { ghostTextForeground } from '../../../common/core/editorColorRegistry';
import { localize } from '../../../../nls';
import { registerColor } from '../../../../platform/theme/common/colorUtils';
import { PlaceholderTextContribution } from './placeholderTextContribution';
import { wrapInReloadableClass1 } from '../../../../platform/observable/common/wrapInReloadableClass';

registerEditorContribution(PlaceholderTextContribution.ID, wrapInReloadableClass1(() => PlaceholderTextContribution), EditorContributionInstantiation.Eager);

registerColor('editor.placeholder.foreground', ghostTextForeground, localize('placeholderForeground', 'Foreground color of the placeholder text in the editor.'));
