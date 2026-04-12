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
import { Range } from '../../../../../../editor/common/core/range.js';
import { localize } from '../../../../../../nls.js';
import { ILanguageModelToolsService } from '../../tools/languageModelToolsService.js';
import { getPromptsTypeForLanguageId, PromptsType } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';
import { parseCommaSeparatedList, PromptHeaderAttributes } from '../promptFileParser.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { LEGACY_MODE_FILE_EXTENSION } from '../config/promptFileLocations.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { MARKERS_OWNER_ID } from './promptValidator.js';
import { IMarkerService } from '../../../../../../platform/markers/common/markers.js';
import { CodeActionKind } from '../../../../../../editor/contrib/codeAction/common/types.js';
import { getTarget, isVSCodeOrDefaultTarget } from './promptFileAttributes.js';
let PromptCodeActionProvider = class PromptCodeActionProvider {
    constructor(promptsService, languageModelToolsService, fileService, markerService) {
        this.promptsService = promptsService;
        this.languageModelToolsService = languageModelToolsService;
        this.fileService = fileService;
        this.markerService = markerService;
        /**
         * Debug display name for this provider.
         */
        this._debugDisplayName = 'PromptCodeActionProvider';
    }
    async provideCodeActions(model, range, context, token) {
        const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
        if (!promptType || promptType === PromptsType.instructions) {
            // if the model is not a prompt, we don't provide any code actions
            return undefined;
        }
        const result = [];
        const promptAST = this.promptsService.getParsedPromptFile(model);
        switch (promptType) {
            case PromptsType.agent:
                this.getUpdateToolsCodeActions(promptAST, promptType, model, range, result);
                await this.getMigrateModeFileCodeActions(model, result);
                break;
            case PromptsType.prompt:
                this.getUpdateModeCodeActions(promptAST, model, range, result);
                this.getUpdateToolsCodeActions(promptAST, promptType, model, range, result);
                break;
        }
        if (result.length === 0) {
            return undefined;
        }
        return {
            actions: result,
            dispose: () => { }
        };
    }
    getMarkers(model, range) {
        const markers = this.markerService.read({ resource: model.uri, owner: MARKERS_OWNER_ID });
        return markers.filter(marker => range.containsRange(marker));
    }
    createCodeAction(model, range, title, edits) {
        return {
            title,
            edit: { edits },
            ranges: [range],
            diagnostics: this.getMarkers(model, range),
            kind: CodeActionKind.QuickFix.value
        };
    }
    getUpdateModeCodeActions(promptFile, model, range, result) {
        const modeAttr = promptFile.header?.getAttribute(PromptHeaderAttributes.mode);
        if (!modeAttr?.range.containsRange(range)) {
            return;
        }
        const keyRange = new Range(modeAttr.range.startLineNumber, modeAttr.range.startColumn, modeAttr.range.startLineNumber, modeAttr.range.startColumn + modeAttr.key.length);
        result.push(this.createCodeAction(model, keyRange, localize('renameToAgent', "Rename to 'agent'"), [asWorkspaceTextEdit(model, { range: keyRange, text: 'agent' })]));
    }
    async getMigrateModeFileCodeActions(model, result) {
        if (model.uri.path.endsWith(LEGACY_MODE_FILE_EXTENSION)) {
            const location = this.promptsService.getAgentFileURIFromModeFile(model.uri);
            if (location && await this.fileService.canMove(model.uri, location)) {
                const edit = { oldResource: model.uri, newResource: location, options: { overwrite: false, copy: false } };
                result.push(this.createCodeAction(model, new Range(1, 1, 1, 4), localize('migrateToAgent', "Migrate to custom agent file"), [edit]));
            }
        }
    }
    getUpdateToolsCodeActions(promptFile, promptType, model, range, result) {
        if (!promptFile.header) {
            return;
        }
        const toolsAttr = promptFile.header.getAttribute(PromptHeaderAttributes.tools);
        if (!toolsAttr || !toolsAttr.value.range.containsRange(range)) {
            return;
        }
        const target = getTarget(promptType, promptFile.header);
        if (!isVSCodeOrDefaultTarget(target)) {
            // GitHub Copilot and Claude custom agents use a fixed set of tool names that are not deprecated
            return;
        }
        let value = toolsAttr.value;
        if (value.type === 'scalar') {
            value = parseCommaSeparatedList(value);
        }
        if (value.type !== 'sequence') {
            return;
        }
        const values = value.items;
        const deprecatedNames = new Lazy(() => this.languageModelToolsService.getDeprecatedFullReferenceNames());
        const edits = [];
        for (const item of values) {
            if (item.type !== 'scalar') {
                continue;
            }
            const newNames = deprecatedNames.value.get(item.value);
            if (newNames && newNames.size > 0) {
                const quote = model.getValueInRange(new Range(item.range.startLineNumber, item.range.startColumn, item.range.endLineNumber, item.range.startColumn + 1));
                if (newNames.size === 1) {
                    const newName = Array.from(newNames)[0];
                    const text = (quote === `'` || quote === '"') ? (quote + newName + quote) : newName;
                    const edit = { range: item.range, text };
                    edits.push(edit);
                    if (item.range.containsRange(range)) {
                        result.push(this.createCodeAction(model, item.range, localize('updateToolName', "Update to '{0}'", newName), [asWorkspaceTextEdit(model, edit)]));
                    }
                }
                else {
                    // Multiple new names - expand to include all of them
                    const newNamesArray = Array.from(newNames).sort((a, b) => a.localeCompare(b));
                    const separator = model.getValueInRange(new Range(item.range.startLineNumber, item.range.endColumn, item.range.endLineNumber, item.range.endColumn + 2));
                    const useCommaSpace = separator.includes(',');
                    const delimiterText = useCommaSpace ? ', ' : ',';
                    const newNamesText = newNamesArray.map(name => (quote === `'` || quote === '"') ? (quote + name + quote) : name).join(delimiterText);
                    const edit = { range: item.range, text: newNamesText };
                    edits.push(edit);
                    if (item.range.containsRange(range)) {
                        result.push(this.createCodeAction(model, item.range, localize('expandToolNames', "Expand to {0} tools", newNames.size), [asWorkspaceTextEdit(model, edit)]));
                    }
                }
            }
        }
        if (edits.length && result.length === 0 || edits.length > 1) {
            result.push(this.createCodeAction(model, value.range, localize('updateAllToolNames', "Update all tool names"), edits.map(edit => asWorkspaceTextEdit(model, edit))));
        }
    }
};
PromptCodeActionProvider = __decorate([
    __param(0, IPromptsService),
    __param(1, ILanguageModelToolsService),
    __param(2, IFileService),
    __param(3, IMarkerService)
], PromptCodeActionProvider);
export { PromptCodeActionProvider };
function asWorkspaceTextEdit(model, textEdit) {
    return {
        versionId: model.getVersionId(),
        resource: model.uri,
        textEdit
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0Q29kZUFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvbGFuZ3VhZ2VQcm92aWRlcnMvcHJvbXB0Q29kZUFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBR3RFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN0RixPQUFPLEVBQUUsMkJBQTJCLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDN0UsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQy9ELE9BQU8sRUFBRSx1QkFBdUIsRUFBb0Isc0JBQXNCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUUzRyxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDN0QsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDOUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3hELE9BQU8sRUFBZSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNuRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDN0YsT0FBTyxFQUFFLFNBQVMsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBRXhFLElBQU0sd0JBQXdCLEdBQTlCLE1BQU0sd0JBQXdCO0lBTXBDLFlBQ2tCLGNBQWdE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