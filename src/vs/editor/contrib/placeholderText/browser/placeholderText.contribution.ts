/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./placeholderText';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ghostTextForeground } from 'vs/editor/common/core/editorColorRegistry';
import { localize } from 'vs/nls';
import { registerColor } from 'vs/platform/theme/common/colorUtils';
import { PlaceholderTextContribution } from './placeholderTextContribution';
import { wrapInReloadableClass1 } from 'vs/platform/observable/common/wrapInReloadableClass';

registerEditorContribution(PlaceholderTextContribution.ID, wrapInReloadableClass1(() => PlaceholderTextContribution), EditorContributionInstantiation.Eager);

registerColor('editor.placeholder.foreground', ghostTextForeground, localize('placeholderForeground', 'Foreground color of the placeholder text in the editor.'));
