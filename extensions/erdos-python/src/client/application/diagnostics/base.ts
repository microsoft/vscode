// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { injectable, unmanaged } from 'inversify';
import { DiagnosticSeverity } from 'vscode';
import { IWorkspaceService } from '../../common/application/types';
import { IDisposable, IDisposableRegistry, Resource } from '../../common/types';
import { asyncFilter } from '../../common/utils/arrayUtils';
import { IServiceContainer } from '../../ioc/types';
import { sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';
import { DiagnosticCodes } from './constants';
import { DiagnosticScope, IDiagnostic, IDiagnosticFilterService, IDiagnosticsService } from './types';

@injectable()
export abstract class BaseDiagnostic implements IDiagnostic {
    constructor(
        public readonly code: DiagnosticCodes,
        public readonly message: string,
        public readonly severity: DiagnosticSeverity,
        public readonly scope: DiagnosticScope,
        public readonly resource: Resource,
        public readonly shouldShowPrompt = true,
        public readonly invokeHandler: 'always' | 'default' = 'default',
    ) {}
}

@injectable()
export abstract class BaseDiagnosticsService implements IDiagnosticsService, IDisposable {
    protected static handledDiagnosticCodeKeys: string[] = [];
    protected readonly filterService: IDiagnosticFilterService;
    constructor(
        @unmanaged() private readonly supportedDiagnosticCodes: string[],
        @unmanaged() protected serviceContainer: IServiceContainer,
        @unmanaged() protected disposableRegistry: IDisposableRegistry,
        @unmanaged() public readonly runInBackground: boolean = false,
        @unmanaged() public readonly runInUntrustedWorkspace: boolean = false,
    ) {
        this.filterService = serviceContainer.get<IDiagnosticFilterService>(IDiagnosticFilterService);
        disposableRegistry.push(this);
    }
    public abstract diagnose(resource: Resource): Promise<IDiagnostic[]>;
    public dispose() {
        // Nothing to do, but can be overidden
    }
    public async handle(diagnostics: IDiagnostic[]): Promise<void> {
        if (diagnostics.length === 0) {
            return;
        }
        const diagnosticsToHandle = await asyncFilter(diagnostics, async (item) => {
            if (!(await this.canHandle(item))) {
                return false;
            }
            if (item.invokeHandler && item.invokeHandler === 'always') {
                return true;
            }
            const key = this.getDiagnosticsKey(item);
            if (BaseDiagnosticsService.handledDiagnosticCodeKeys.indexOf(key) !== -1) {
                return false;
            }
            BaseDiagnosticsService.handledDiagnosticCodeKeys.push(key);
            return true;
        });
        await this.onHandle(diagnosticsToHandle);
    }
    public async canHandle(diagnostic: IDiagnostic): Promise<boolean> {
        sendTelemetryEvent(EventName.DIAGNOSTICS_MESSAGE, undefined, { code: diagnostic.code });
        return this.supportedDiagnosticCodes.filter((item) => item === diagnostic.code).length > 0;
    }
    protected abstract onHandle(diagnostics: IDiagnostic[]): Promise<void>;
    /**
     * Returns a key used to keep track of whether a diagnostic was handled or not.
     * So as to prevent handling/displaying messages multiple times for the same diagnostic.
     */
    protected getDiagnosticsKey(diagnostic: IDiagnostic): string {
        if (diagnostic.scope === DiagnosticScope.Global) {
            return diagnostic.code;
        }
        const workspace = this.serviceContainer.get<IWorkspaceService>(IWorkspaceService);
        const workspaceFolder = diagnostic.resource ? workspace.getWorkspaceFolder(diagnostic.resource) : undefined;
        return `${diagnostic.code}dbe75733-0407-4124-a1b2-ca769dc30523${
            workspaceFolder ? workspaceFolder.uri.fsPath : ''
        }`;
    }
}
