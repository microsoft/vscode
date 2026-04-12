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
var CodeActionKeybindingResolver_1;
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { codeActionCommandId, fixAllCommandId, organizeImportsCommandId, refactorCommandId, sourceActionCommandId } from './codeAction.js';
import { CodeActionCommandArgs, CodeActionKind } from '../common/types.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
let CodeActionKeybindingResolver = class CodeActionKeybindingResolver {
    static { CodeActionKeybindingResolver_1 = this; }
    static { this.codeActionCommands = [
        refactorCommandId,
        codeActionCommandId,
        sourceActionCommandId,
        organizeImportsCommandId,
        fixAllCommandId
    ]; }
    constructor(keybindingService) {
        this.keybindingService = keybindingService;
    }
    getResolver() {
        // Lazy since we may not actually ever read the value
        const allCodeActionBindings = new Lazy(() => this.keybindingService.getKeybindings()
            .filter(item => CodeActionKeybindingResolver_1.codeActionCommands.indexOf(item.command) >= 0)
            .filter(item => item.resolvedKeybinding)
            .map((item) => {
            // Special case these commands since they come built-in with VS Code and don't use 'commandArgs'
            let commandArgs = item.commandArgs;
            if (item.command === organizeImportsCommandId) {
                commandArgs = { kind: CodeActionKind.SourceOrganizeImports.value };
            }
            else if (item.command === fixAllCommandId) {
                commandArgs = { kind: CodeActionKind.SourceFixAll.value };
            }
            return {
                resolvedKeybinding: item.resolvedKeybinding,
                ...CodeActionCommandArgs.fromUser(commandArgs, {
                    kind: HierarchicalKind.None,
                    apply: "never" /* CodeActionAutoApply.Never */
                })
            };
        }));
        return (action) => {
            if (action.kind) {
                const binding = this.bestKeybindingForCodeAction(action, allCodeActionBindings.value);
                return binding?.resolvedKeybinding;
            }
            return undefined;
        };
    }
    bestKeybindingForCodeAction(action, candidates) {
        if (!action.kind) {
            return undefined;
        }
        const kind = new HierarchicalKind(action.kind);
        return candidates
            .filter(candidate => candidate.kind.contains(kind))
            .filter(candidate => {
            if (candidate.preferred) {
                // If the candidate keybinding only applies to preferred actions, the this action must also be preferred
                return action.isPreferred;
            }
            return true;
        })
            .reduceRight((currentBest, candidate) => {
            if (!currentBest) {
                return candidate;
            }
            // Select the more specific binding
            return currentBest.kind.contains(candidate.kind) ? candidate : currentBest;
        }, undefined);
    }
};
CodeActionKeybindingResolver = CodeActionKeybindingResolver_1 = __decorate([
    __param(0, IKeybindingService)
], CodeActionKeybindingResolver);
export { CodeActionKeybindingResolver };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUFjdGlvbktleWJpbmRpbmdSZXNvbHZlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vYnJvd3Nlci9jb2RlQWN0aW9uS2V5YmluZGluZ1Jlc29sdmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUUvRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFdkQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLGVBQWUsRUFBRSx3QkFBd0IsRUFBRSxpQkFBaUIsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNJLE9BQU8sRUFBdUIscUJBQXFCLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFRbkYsSUFBTSw0QkFBNEIsR0FBbEMsTUFBTSw0QkFBNEI7O2FBQ2hCLHVCQUFrQixHQUFzQjtRQUMvRCxpQkFBaUI7UUFDakIsbUJBQW1CO1FBQ25CLHFCQUFxQjtRQUNyQix3QkFBd0I7UUFDeEIsZUFBZTtLQUNmLEFBTnlDLENBTXhDO0lBRUYsWUFDc0MsaUJBQXFDO1FBQXJDLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBb0I7SUFDdkUsQ0FBQztJQUVFLFdBQVc7UUFDakIscURBQXFEO1FBQ3JELE1BQU0scUJBQXFCLEdBQUcsSUFBSSxJQUFJLENBQXlDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxjQUFjLEVBQUU7YUFDMUgsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsOEJBQTRCLENBQUMsa0JBQWtCLENBQUMsT0FBTyxDQUFDLElBQUks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