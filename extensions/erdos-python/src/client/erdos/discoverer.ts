/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as erdos from 'erdos';

import { IInterpreterSelector } from '../interpreter/configuration/types';
import { IInterpreterService } from '../interpreter/contracts';
import { IServiceContainer } from '../ioc/types';
import { traceError } from '../logging';
import { PythonEnvironment } from '../pythonEnvironments/info';
import { createPythonRuntimeMetadata, createPythonRuntimeMetadataFromEnvironment } from './runtime';
import { comparePythonVersionDescending } from '../interpreter/configuration/environmentTypeComparer';
import { shouldIncludeInterpreter } from './interpreterSettings';

export async function* pythonRuntimeDiscoverer(
    serviceContainer: IServiceContainer,
): AsyncGenerator<erdos.LanguageRuntimeMetadata> {
    try {
        // Try to use the proper Python Extension Environments API
        try {
            const { PythonExtension } = await import('../api/types');
            const pythonApi = await PythonExtension.api();
            
            // Trigger environment discovery to ensure we have up-to-date environments
            await pythonApi.environments.refreshEnvironments();
            
            const environments = pythonApi.environments.known;

            // Get the active environment from VS Code instead of guessing
            const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
            const activeEnvPath = pythonApi.environments.getActiveEnvironmentPath(workspaceUri);

            for (const environment of environments) {
                try {
                    // Resolve full environment details
                    const resolvedEnv = await pythonApi.environments.resolveEnvironment(environment);
                    if (!resolvedEnv) {
                        continue;
                    }

                    // Use VS Code's determination of which environment is active/recommended
                    const isRecommendedForWorkspace = resolvedEnv.id === activeEnvPath.id;

                    const runtime = await createPythonRuntimeMetadataFromEnvironment(
                        resolvedEnv,
                        serviceContainer,
                        isRecommendedForWorkspace,
                    );

                    yield runtime;
                } catch (err) {
                    // Skip failed environments
                }
            }
            return; // Successfully used environments API
        } catch (err) {
            // Fallback to interpreter service if environments API fails
        }

        const interpreterService = serviceContainer.get<IInterpreterService>(IInterpreterService);
        const interpreterSelector = serviceContainer.get<IInterpreterSelector>(IInterpreterSelector);

        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        const suggestions = interpreterSelector.getSuggestions(workspaceUri);        
        let recommendedInterpreter = interpreterSelector.getRecommendedSuggestion(suggestions, workspaceUri)
            ?.interpreter;
        if (!recommendedInterpreter) {
            recommendedInterpreter = await interpreterService.getActiveInterpreter(workspaceUri);
        }
        await interpreterService.triggerRefresh().ignoreErrors();
        let interpreters = interpreterService.getInterpreters();
        interpreters = filterInterpreters(interpreters);
        interpreters = sortInterpreters(interpreters, recommendedInterpreter);

        for (const interpreter of interpreters) {
            try {
                // In fallback mode, use the recommended interpreter from VS Code's selector
                const isRecommendedForWorkspace = interpreter === recommendedInterpreter;

                const runtime = await createPythonRuntimeMetadata(
                    interpreter,
                    serviceContainer,
                    isRecommendedForWorkspace,
                );

                yield runtime;
            } catch (err) {
                traceError(
                    `pythonRuntimeDiscoverer: failed to register runtime for interpreter ${interpreter.path}`,
                    err,
                );
            }
        }
    } catch (ex) {
        traceError('pythonRuntimeDiscoverer() failed', ex);
    }
}

function filterInterpreters(interpreters: PythonEnvironment[]): PythonEnvironment[] {
    return interpreters.filter((interpreter) => {
        const shouldInclude = shouldIncludeInterpreter(interpreter.path);
        return shouldInclude;
    });
}

function sortInterpreters(
    interpreters: PythonEnvironment[],
    preferredInterpreter: PythonEnvironment | undefined,
): PythonEnvironment[] {
    const copy: PythonEnvironment[] = [...interpreters];
    copy.sort((a: PythonEnvironment, b: PythonEnvironment) => {
        if (preferredInterpreter) {
            if (preferredInterpreter.id === a.id) return -1;
            if (preferredInterpreter.id === b.id) return 1;
        }

        return comparePythonVersionDescending(a.version, b.version);
    });
    return copy;
}
