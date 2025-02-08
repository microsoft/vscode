/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { LanguageStatusContribution, ResetAction } from './languageStatus.js';


registerWorkbenchContribution2(LanguageStatusContribution.Id, LanguageStatusContribution, WorkbenchPhase.AfterRestored);
registerAction2(ResetAction);
