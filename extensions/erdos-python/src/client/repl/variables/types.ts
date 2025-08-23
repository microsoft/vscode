// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { CancellationToken, Variable } from 'vscode';

export interface IVariableDescription extends Variable {
    /** The name of the variable at the root scope */
    root: string;
    /** How to look up the specific property of the root variable */
    propertyChain: (string | number)[];
    /** The number of children for collection types */
    count?: number;
    /** Names of children */
    hasNamedChildren?: boolean;
    /** A method to get the children of this variable */
    getChildren?: (start: number, token: CancellationToken) => Promise<IVariableDescription[]>;
}
