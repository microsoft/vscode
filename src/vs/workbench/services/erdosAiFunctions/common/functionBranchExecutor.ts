/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { FunctionBranch, BranchResult } from '../../erdosAi/browser/parallelFunctionBranchManager.js';

export const IFunctionBranchExecutor = createDecorator<IFunctionBranchExecutor>('functionBranchExecutor');

export interface IFunctionBranchExecutor {
    readonly _serviceBrand: undefined;
    
    /**
     * Execute a function branch independently
     */
    executeBranch(branch: FunctionBranch): Promise<BranchResult>;
}

