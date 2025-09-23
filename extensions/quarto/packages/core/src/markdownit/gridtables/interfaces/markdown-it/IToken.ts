/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Bas Verweij. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export default interface IToken
{
    children: IToken[];

    content: string;

    map: number[];

    attrSet(
        name: string,
        value: string
    ): void;
}