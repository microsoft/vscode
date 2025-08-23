// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { injectable, inject } from 'inversify';
import { IConfigurationService, IToolExecutionPath } from '../../types';

@injectable()
export class PipEnvExecutionPath implements IToolExecutionPath {
    constructor(@inject(IConfigurationService) private readonly configService: IConfigurationService) {}

    public get executable(): string {
        return this.configService.getSettings().pipenvPath;
    }
}
