// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { IBrowserService } from '../../../common/types';
import { IServiceContainer } from '../../../ioc/types';
import { sendTelemetryEvent } from '../../../telemetry';
import { EventName } from '../../../telemetry/constants';
import { IDiagnostic } from '../types';
import { BaseDiagnosticCommand } from './base';

export class LaunchBrowserCommand extends BaseDiagnosticCommand {
    constructor(diagnostic: IDiagnostic, private serviceContainer: IServiceContainer, private url: string) {
        super(diagnostic);
    }
    public async invoke(): Promise<void> {
        sendTelemetryEvent(EventName.DIAGNOSTICS_ACTION, undefined, { url: this.url });
        const browser = this.serviceContainer.get<IBrowserService>(IBrowserService);
        return browser.launch(this.url);
    }
}
