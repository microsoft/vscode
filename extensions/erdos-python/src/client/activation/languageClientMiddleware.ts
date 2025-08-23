// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { IServiceContainer } from '../ioc/types';
import { sendTelemetryEvent } from '../telemetry';

import { LanguageClientMiddlewareBase } from './languageClientMiddlewareBase';
import { LanguageServerType } from './types';

export class LanguageClientMiddleware extends LanguageClientMiddlewareBase {
    public constructor(serviceContainer: IServiceContainer, serverType: LanguageServerType, serverVersion?: string) {
        super(serviceContainer, serverType, sendTelemetryEvent, serverVersion);
    }
}
