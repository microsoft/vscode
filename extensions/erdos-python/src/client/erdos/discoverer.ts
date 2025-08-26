/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as erdos from 'erdos';

import { IInterpreterSelector } from '../interpreter/configuration/types';
import { IInterpreterService } from '../interpreter/contracts';
import { IServiceContainer } from '../ioc/types';
import { traceError, traceInfo } from '../logging';
import { PythonEnvironment } from '../pythonEnvironments/info';
import { createPythonRuntimeMetadata } from './runtime';
import { comparePythonVersionDescending } from '../interpreter/configuration/environmentTypeComparer';
import { shouldIncludeInterpreter } from './interpreterSettings';
import { hasFiles } from './util';

export async function* pythonRuntimeDiscoverer(
    serviceContainer: IServiceContainer,
): AsyncGenerator<erdos.LanguageRuntimeMetadata> {
    try {
        traceInfo('pythonRuntimeDiscoverer: Starting Python runtime discoverer');

        const interpreterService = serviceContainer.get<IInterpreterService>(IInterpreterService);
        const interpreterSelector = serviceContainer.get<IInterpreterSelector>(IInterpreterSelector);

        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        const suggestions = interpreterSelector.getSuggestions(workspaceUri);        
        let recommendedInterpreter = interpreterSelector.getRecommendedSuggestion(suggestions, workspaceUri)
            ?.interpreter;
        if (!recommendedInterpreter) {
            recommendedInterpreter = await interpreterService.getActiveInterpreter(workspaceUri);
        }
        traceInfo(`pythonRuntimeDiscoverer: recommended interpreter: ${recommendedInterpreter?.path}`);

        await interpreterService.triggerRefresh().ignoreErrors();
        let interpreters = interpreterService.getInterpreters();
        traceInfo(`pythonRuntimeDiscoverer: discovered ${interpreters.length} Python interpreters`);

        traceInfo('pythonRuntimeDiscoverer: filtering interpreters');
        interpreters = filterInterpreters(interpreters);

        traceInfo(`pythonRuntimeDiscoverer: ${interpreters.length} Python interpreters remain after filtering`);

        traceInfo('pythonRuntimeDiscoverer: sorting interpreters');
        interpreters = sortInterpreters(interpreters, recommendedInterpreter);

        let recommendedForWorkspace = await hasFiles([
            '**/*.py',
            '**/*.ipynb',
            '.venv/**/*',
            '.conda/**/*',
            'pyproject.toml',
            'Pipfile',
            '*requirements.txt',
            '.python-version',
            'environment.yml',
        ]);
        traceInfo(`pythonRuntimeDiscoverer: recommended for workspace: ${recommendedForWorkspace}`);

        for (const interpreter of interpreters) {
            try {
                const runtime = await createPythonRuntimeMetadata(
                    interpreter,
                    serviceContainer,
                    recommendedForWorkspace,
                );

                recommendedForWorkspace = false;

                traceInfo(
                    `pythonRuntimeDiscoverer: registering runtime for interpreter ${interpreter.path} with id ${runtime.runtimeId}`,
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
        if (!shouldInclude) {
            traceInfo(`pythonRuntimeDiscoverer: filtering out user-excluded interpreter ${interpreter.path}`);
            return false;
        }

        return true;
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
