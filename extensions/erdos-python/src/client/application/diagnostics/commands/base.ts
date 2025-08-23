// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { IDiagnostic, IDiagnosticCommand } from '../types';

export abstract class BaseDiagnosticCommand implements IDiagnosticCommand {
    constructor(public readonly diagnostic: IDiagnostic) {}
    public abstract invoke(): Promise<void>;
}
