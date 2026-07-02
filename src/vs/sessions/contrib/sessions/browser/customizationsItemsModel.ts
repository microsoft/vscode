/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { AICustomizationItemsModel } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { CustomizationsToolbarContribution } from './customizationsToolbar.contribution.js';

export function getSessionsCustomizationItemsModel(): AICustomizationItemsModel {
	return getWorkbenchContribution<CustomizationsToolbarContribution>(CustomizationsToolbarContribution.ID).getItemsModel();
}
