// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { Resource } from '../types';
import { IActiveResourceService, IDocumentManager, IWorkspaceService } from './types';

@injectable()
export class ActiveResourceService implements IActiveResourceService {
    constructor(
        @inject(IDocumentManager) private readonly documentManager: IDocumentManager,
        @inject(IWorkspaceService) private readonly workspaceService: IWorkspaceService,
    ) {}

    public getActiveResource(): Resource {
        const editor = this.documentManager.activeTextEditor;
        if (editor && !editor.document.isUntitled) {
            return editor.document.uri;
        }
        return Array.isArray(this.workspaceService.workspaceFolders) &&
            this.workspaceService.workspaceFolders.length > 0
            ? this.workspaceService.workspaceFolders[0].uri
            : undefined;
    }
}
