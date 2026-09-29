/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IAccountPolicyGateService, whenAccountPolicySettled } from '../common/accountPolicyService.js';
import { AccountPolicyGateContribution } from './accountPolicyGateContribution.js';

registerWorkbenchContribution2(AccountPolicyGateContribution.ID, AccountPolicyGateContribution, WorkbenchPhase.AfterRestored);

CommandsRegistry.registerCommand('_workbench.whenAccountPolicySettled', accessor =>
	whenAccountPolicySettled(accessor.get(IDefaultAccountService), accessor.get(IAccountPolicyGateService)));
