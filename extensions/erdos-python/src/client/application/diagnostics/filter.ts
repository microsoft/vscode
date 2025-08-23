// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { IPersistentStateFactory } from '../../common/types';
import { IServiceContainer } from '../../ioc/types';
import { DiagnosticScope, IDiagnosticFilterService } from './types';

export enum FilterKeys {
    GlobalDiagnosticFilter = 'GLOBAL_DIAGNOSTICS_FILTER',
    WorkspaceDiagnosticFilter = 'WORKSPACE_DIAGNOSTICS_FILTER',
}

@injectable()
export class DiagnosticFilterService implements IDiagnosticFilterService {
    constructor(@inject(IServiceContainer) private serviceContainer: IServiceContainer) {}
    public async shouldIgnoreDiagnostic(code: string): Promise<boolean> {
        const factory = this.serviceContainer.get<IPersistentStateFactory>(IPersistentStateFactory);
        const globalState = factory.createGlobalPersistentState<string[]>(FilterKeys.GlobalDiagnosticFilter, []);
        const workspaceState = factory.createWorkspacePersistentState<string[]>(
            FilterKeys.WorkspaceDiagnosticFilter,
            [],
        );
        return globalState.value.indexOf(code) >= 0 || workspaceState.value.indexOf(code) >= 0;
    }
    public async ignoreDiagnostic(code: string, scope: DiagnosticScope): Promise<void> {
        const factory = this.serviceContainer.get<IPersistentStateFactory>(IPersistentStateFactory);
        const state =
            scope === DiagnosticScope.Global
                ? factory.createGlobalPersistentState<string[]>(FilterKeys.GlobalDiagnosticFilter, [])
                : factory.createWorkspacePersistentState<string[]>(FilterKeys.WorkspaceDiagnosticFilter, []);

        const currentValue = state.value.slice();
        await state.updateValue(currentValue.concat(code));
    }
}
