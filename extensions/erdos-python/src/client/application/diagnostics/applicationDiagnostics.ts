// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { DiagnosticSeverity } from 'vscode';
import { IWorkspaceService } from '../../common/application/types';
import { isTestExecution } from '../../common/constants';
import { Resource } from '../../common/types';
import { IServiceContainer } from '../../ioc/types';
import { traceLog, traceVerbose } from '../../logging';
import { IApplicationDiagnostics } from '../types';
import { IDiagnostic, IDiagnosticsService } from './types';

function log(diagnostics: IDiagnostic[]): void {
    diagnostics.forEach((item) => {
        const message = `Diagnostic Code: ${item.code}, Message: ${item.message}`;
        switch (item.severity) {
            case DiagnosticSeverity.Error:
            case DiagnosticSeverity.Warning: {
                traceLog(message);
                break;
            }
            default: {
                traceVerbose(message);
            }
        }
    });
}

async function runDiagnostics(diagnosticServices: IDiagnosticsService[], resource: Resource): Promise<void> {
    await Promise.all(
        diagnosticServices.map(async (diagnosticService) => {
            const diagnostics = await diagnosticService.diagnose(resource);
            if (diagnostics.length > 0) {
                log(diagnostics);
                await diagnosticService.handle(diagnostics);
            }
        }),
    );
}

@injectable()
export class ApplicationDiagnostics implements IApplicationDiagnostics {
    constructor(@inject(IServiceContainer) private readonly serviceContainer: IServiceContainer) {}

    public register() {}

    public async performPreStartupHealthCheck(resource: Resource): Promise<void> {
        // When testing, do not perform health checks, as modal dialogs can be displayed.
        if (isTestExecution()) {
            return;
        }
        let services = this.serviceContainer.getAll<IDiagnosticsService>(IDiagnosticsService);
        const workspaceService = this.serviceContainer.get<IWorkspaceService>(IWorkspaceService);
        if (!workspaceService.isTrusted) {
            services = services.filter((item) => item.runInUntrustedWorkspace);
        }
        // Perform these validation checks in the foreground.
        await runDiagnostics(
            services.filter((item) => !item.runInBackground),
            resource,
        );

        // Perform these validation checks in the background.
        runDiagnostics(
            services.filter((item) => item.runInBackground),
            resource,
        ).ignoreErrors();
    }
}
