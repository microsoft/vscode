/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { registerAccessibilityConfiguration } from 'vs/workbench/contrib/accessibility/browser/accessibilityContribution';
import { AccessibleViewService, IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';

registerAccessibilityConfiguration();
registerSingleton(IAccessibleViewService, AccessibleViewService, InstantiationType.Delayed);
