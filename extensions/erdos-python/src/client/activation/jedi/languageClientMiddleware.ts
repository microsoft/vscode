// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { IServiceContainer } from '../../ioc/types';
import { LanguageClientMiddleware } from '../languageClientMiddleware';
import { LanguageServerType } from '../types';

export class JediLanguageClientMiddleware extends LanguageClientMiddleware {
    public constructor(serviceContainer: IServiceContainer, serverVersion?: string) {
        super(serviceContainer, LanguageServerType.Jedi, serverVersion);
    }
}
