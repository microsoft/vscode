// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as typemoq from 'typemoq';
import { LaunchBrowserCommand } from '../../../../client/application/diagnostics/commands/launchBrowser';
import { IDiagnostic, IDiagnosticCommand } from '../../../../client/application/diagnostics/types';
import { IBrowserService } from '../../../../client/common/types';
import { IServiceContainer } from '../../../../client/ioc/types';

suite('Application Diagnostics - Commands Launch Browser', () => {
    let cmd: IDiagnosticCommand;
    let serviceContainer: typemoq.IMock<IServiceContainer>;
    let diagnostic: typemoq.IMock<IDiagnostic>;
    const url = 'xyz://abc';
    setup(() => {
        serviceContainer = typemoq.Mock.ofType<IServiceContainer>();
        diagnostic = typemoq.Mock.ofType<IDiagnostic>();
        cmd = new LaunchBrowserCommand(diagnostic.object, serviceContainer.object, url);
    });

    test('Invoking Command should launch the browser', async () => {
        const browser = typemoq.Mock.ofType<IBrowserService>();
        serviceContainer
            .setup((s) => s.get(typemoq.It.isValue(IBrowserService)))
            .returns(() => browser.object)
            .verifiable(typemoq.Times.once());
        browser.setup((s) => s.launch(typemoq.It.isValue(url))).verifiable(typemoq.Times.once());

        await cmd.invoke();
        serviceContainer.verifyAll();
    });
});
