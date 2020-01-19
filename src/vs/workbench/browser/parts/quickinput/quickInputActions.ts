/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickManyToggle, QuickPickBack } from 'vs/workbench/browser/parts/quickinput/quickInput';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';

KeybindingsRegistry.registerCommandAndKeybindingRule(QuickPickManyToggle);
KeybindingsRegistry.registerCommandAndKeybindingRule(QuickPickBack);
