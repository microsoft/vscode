/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseLocalizationWorkbenchContribution } from '../common/localization.contribution.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

export class WebLocalizationWorkbenchContribution extends BaseLocalizationWorkbenchContribution {

	static readonly ID = 'workbench.contrib.webLocalization';
}

registerWorkbenchContribution2(WebLocalizationWorkbenchContribution.ID, WebLocalizationWorkbenchContribution, WorkbenchPhase.Eventually);
