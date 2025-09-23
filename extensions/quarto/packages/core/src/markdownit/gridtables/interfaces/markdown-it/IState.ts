/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Bas Verweij. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import IToken from "./IToken";

export default interface IState
{
    src: string;

    bMarks: number[];

    eMarks: number[];

    blkIndent: number;

    tShift: number[];

    line: number;

    push(
        action: string,
        tag: string,
        level: number
    ): IToken;
}