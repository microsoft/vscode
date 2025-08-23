// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { Uri } from 'vscode';
import * as path from 'path';
import { IInterpreterService } from '../../interpreter/contracts';
import { IServiceContainer } from '../../ioc/types';
import { PythonEnvironment } from '../../pythonEnvironments/info';
import { IWorkspaceService } from '../application/types';
import { IFileSystem } from '../platform/types';
import { TerminalService } from './service';
import { SynchronousTerminalService } from './syncTerminalService';
import { ITerminalService, ITerminalServiceFactory, TerminalCreationOptions } from './types';

@injectable()
export class TerminalServiceFactory implements ITerminalServiceFactory {
    private terminalServices: Map<string, TerminalService>;

    constructor(
        @inject(IServiceContainer) private serviceContainer: IServiceContainer,
        @inject(IFileSystem) private fs: IFileSystem,
        @inject(IInterpreterService) private interpreterService: IInterpreterService,
    ) {
        this.terminalServices = new Map<string, TerminalService>();
    }
    public getTerminalService(options: TerminalCreationOptions & { newTerminalPerFile?: boolean }): ITerminalService {
        const resource = options?.resource;
        const title = options?.title;
        let terminalTitle = typeof title === 'string' && title.trim().length > 0 ? title.trim() : 'Python';
        const interpreter = options?.interpreter;
        const id = this.getTerminalId(terminalTitle, resource, interpreter, options.newTerminalPerFile);
        if (!this.terminalServices.has(id)) {
            if (resource && options.newTerminalPerFile) {
                terminalTitle = `${terminalTitle}: ${path.basename(resource.fsPath).replace('.py', '')}`;
            }
            options.title = terminalTitle;
            const terminalService = new TerminalService(this.serviceContainer, options);
            this.terminalServices.set(id, terminalService);
        }

        // Decorate terminal service with the synchronous service.
        return new SynchronousTerminalService(
            this.fs,
            this.interpreterService,
            this.terminalServices.get(id)!,
            interpreter,
        );
    }
    public createTerminalService(resource?: Uri, title?: string): ITerminalService {
        title = typeof title === 'string' && title.trim().length > 0 ? title.trim() : 'Python';
        return new TerminalService(this.serviceContainer, { resource, title });
    }
    private getTerminalId(
        title: string,
        resource?: Uri,
        interpreter?: PythonEnvironment,
        newTerminalPerFile?: boolean,
    ): string {
        if (!resource && !interpreter) {
            return title;
        }
        const workspaceFolder = this.serviceContainer
            .get<IWorkspaceService>(IWorkspaceService)
            .getWorkspaceFolder(resource || undefined);
        const fileId = resource && newTerminalPerFile ? resource.fsPath : '';
        return `${title}:${workspaceFolder?.uri.fsPath || ''}:${interpreter?.path}:${fileId}`;
    }
}
