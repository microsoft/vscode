/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Bas Verweij. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import IState from "./IState";

type TRuleFunction = (
    state: IState,
    startLine: number,
    endLine: number,
    silent: boolean) => boolean;

export default TRuleFunction;