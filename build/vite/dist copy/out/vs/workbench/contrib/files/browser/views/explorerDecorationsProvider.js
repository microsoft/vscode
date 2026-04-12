/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Emitter } from '../../../../../base/common/event.js';
import { localize } from '../../../../../nls.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { listInvalidItemForeground, listDeemphasizedForeground } from '../../../../../platform/theme/common/colorRegistry.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { explorerRootErrorEmitter } from './explorerViewer.js';
import { IExplorerService } from '../files.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
export function provideDecorations(fileStat) {
    if (fileStat.isRoot && fileStat.error) {
        return {
            tooltip: localize('canNotResolve', "Unable to resolve workspace folder ({0})", toErrorMessage(fileStat.error)),
            letter: '!',
            color: listInvalidItemForeground,
        };
    }
    if (fileStat.isSymbolicLink) {
        return {
            tooltip: localize('symbolicLlink', "Symbolic Link"),
            letter: '\u2937'
        };
    }
    if (fileStat.isUnknown) {
        return {
            tooltip: localize('unknown', "Unknown File Type"),
            letter: '?'
        };
    }
    if (fileStat.isExcluded) {
        return {
            color: listDeemphasizedForeground,
        };
    }
    return undefined;
}
let ExplorerDecorationsProvider = class ExplorerDecorationsProvider {
    constructor(explorerService, contextService) {
        this.explorerService = explorerService;
        this.label = localize('label', "Explorer");
        this._onDidChange = new Emitter();
        this.toDispose = new DisposableStore();
        this.toDispose.add(this._onDidChange);
        this.toDispose.add(contextService.onDidChangeWorkspaceFolders(e => {
            this._onDidChange.fire(e.changed.concat(e.added).map(wf => wf.uri));
        }));
        this.toDispose.add(explorerRootErrorEmitter.event((resource => {
            this._onDidChange.fire([resource]);
        })));
    }
    get onDidChange() {
        return this._onDidChange.event;
    }
    async provideDecorations(resource) {
        const fileStat = this.explorerService.findClosest(resource);
        if (!fileStat) {
            throw new Error('ExplorerItem not found');
        }
        return provideDecorations(fileStat);
    }
    dispose() {
        this.toDispose.dispose();
    }
};
ExplorerDecorationsProvider = __decorate([
    __param(0, IExplorerService),
    __param(1, IWorkspaceContextService)
], ExplorerDecorationsProvider);
export { ExplorerDecorationsProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhwbG9yZXJEZWNvcmF0aW9uc1Byb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZmlsZXMvYnJvd3Nlci92aWV3cy9leHBsb3JlckRlY29yYXRpb25zUHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFTLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUVqRyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM5SCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFFL0QsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sYUFBYSxDQUFDO0FBQy9DLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUU1RSxNQUFNLFVBQVUsa0JBQWtCLENBQUMsUUFBc0I7SUFDeEQsSUFBSSxRQUFRLENBQUMsTUFBTSxJQUFJLFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUN2QyxPQUFPO1lBQ04sT0FBTyxFQUFFLFFBQVEsQ0FBQyxlQUFlLEVBQUUsMENBQTBDLEVBQUUsY0FBYyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUM5RyxNQUFNLEVBQUUsR0FBRztZQUNYLEtBQUssRUFBRSx5QkFBeUI7U0FDaEMsQ0FBQztJQUNILENBQUM7SUFDRCxJQUFJLFFBQVEsQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUM3QixPQUFPO1lBQ04sT0FBTyxFQUFFLFFBQVEsQ0FBQyxlQUFlLEVBQUUsZUFBZSxDQUFDO1lBQ25ELE1BQU0sRUFBRSxRQUFRO1NBQ2hCLENBQUM7SUFDSCxDQUFDO0lBQ0QsSUFBSSxRQUFRLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDeEIsT0FBTztZQUNOLE9BQU8sRUFBRSxRQUFRLENBQUMsU0FBUyxFQUFFLG1CQUFtQixDQUFDO1lBQ2pELE1BQU0sRUFBRSxHQUFHO1NBQ1gsQ0FBQztJQUNILENBQUM7SUFDRCxJQUFJLFFBQVEsQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUN6QixPQUFPO1lBQ04sS0FBSyxFQUFFLDBCQUEwQjtTQUNqQyxDQUFDO0lBQ0gsQ0FBQztJQUVELE9BQU8sU0FBUyxDQUFDO0FBQ2xCLENBQUM7QUFFTSxJQUFNLDJCQUEyQixHQUFqQyxNQUFNLDJCQUEyQjtJQUt2QyxZQUNtQixlQUF5QyxFQUNqQyxjQUF3QztRQUR4QyxvQkFBZSxHQUFmLGVBQWUsQ0FBa0I7UUFMbkQsVUFBSyxHQUFXLFFBQVEsQ0FBQyxPQUFPLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDdEMsaUJBQVksR0FBRyxJQUFJLE9BQU8sRUFBUyxDQUFDO1FBQ3BDLGNBQVMsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBTWxELElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUN0QyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDakUsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3JFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRTtZQUM3RCxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDcEMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ04sQ0FBQztJQUVELElBQUksV0FBVztRQUNkLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUM7SUFDaEMsQ0FBQztJQUVELEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxRQUFhO1FBQ3JDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzVELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUMzQyxDQUFDO1FBRUQsT0FBTyxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNyQyxDQUFDO0lBRUQsT0FBTztRQUNOLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDMUIsQ0FBQztDQUNELENBQUE7QUFsQ1ksMkJBQTJCO0lBTXJDLFdBQUEsZ0JBQWdCLENBQUE7SUFDaEIsV0FBQSx3QkFBd0IsQ0FBQTtHQVBkLDJCQUEyQixDQWtDdkMifQ==