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
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { isITextModel } from '../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../../nls.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { showToolsPicker } from '../actions/chatToolPicker.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { ALL_PROMPTS_LANGUAGE_SELECTOR, getPromptsTypeForLanguageId, PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { registerEditorFeature } from '../../../../../editor/common/editorFeatures.js';
import { PromptFileRewriter } from './promptFileRewriter.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { parseCommaSeparatedList, PromptHeaderAttributes } from '../../common/promptSyntax/promptFileParser.js';
import { isBoolean } from '../../../../../base/common/types.js';
import { getTarget, isTarget, isVSCodeOrDefaultTarget } from '../../common/promptSyntax/languageProviders/promptFileAttributes.js';
let PromptToolsCodeLensProvider = class PromptToolsCodeLensProvider extends Disposable {
    constructor(promptsService, languageService, languageModelToolsService, instantiationService) {
        super();
        this.promptsService = promptsService;
        this.languageService = languageService;
        this.languageModelToolsService = languageModelToolsService;
        this.instantiationService = instantiationService;
        // `_`-prefix marks this as private command
        this.cmdId = `_configure/${generateUuid()}`;
        this._register(this.languageService.codeLensProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, this));
        this._register(CommandsRegistry.registerCommand(this.cmdId, (_accessor, ...args) => {
            const [modelArg, rangeArg, isStringArg, toolsArg, targetArg] = args;
            const model = modelArg;
            if (isITextModel(model) && Range.isIRange(rangeArg) && isBoolean(isStringArg) && Array.isArray(toolsArg) && isTarget(targetArg)) {
                this.updateTools(model, Range.lift(rangeArg), isStringArg, toolsArg, targetArg);
            }
        }));
    }
    async provideCodeLenses(model, token) {
        const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
        if (!promptType || promptType === PromptsType.instructions) {
            // if the model is not a prompt, we don't provide any code actions
            return undefined;
        }
        const promptAST = this.promptsService.getParsedPromptFile(model);
        const header = promptAST.header;
        if (!header) {
            return undefined;
        }
        const target = getTarget(promptType, header);
        if (!isVSCodeOrDefaultTarget(target)) {
            return undefined;
        }
        const toolsAttr = header.getAttribute(PromptHeaderAttributes.tools);
        if (!toolsAttr) {
            return undefined;
        }
        let value = toolsAttr.value;
        if (value.type === 'scalar') {
            value = parseCommaSeparatedList(value);
        }
        if (value.type !== 'sequence') {
            return undefined;
        }
        const items = value.items;
        const selectedTools = items.filter(item => item.type === 'scalar').map(item => item.value);
        const codeLens = {
            range: toolsAttr.range.collapseToStart(),
            command: {
                title: localize('configure-tools.capitalized.ellipsis', "Configure Tools..."),
                id: this.cmdId,
                arguments: [model, toolsAttr.value.range, toolsAttr.value.type === 'scalar', selectedTools, target]
            }
        };
        return { lenses: [codeLens] };
    }
    async updateTools(model, range, isString, selectedTools, target) {
        const selectedToolsNow = () => this.languageModelToolsService.toToolAndToolSetEnablementMap(selectedTools, undefined);
        const newSelectedAfter = await this.instantiationService.invokeFunction(showToolsPicker, localize('placeholder', "Select tools"), 'codeLens', undefined, selectedToolsNow);
        if (!newSelectedAfter) {
            return;
        }
        this.instantiationService.createInstance(PromptFileRewriter).rewriteTools(model, newSelectedAfter, range, isString);
    }
};
PromptToolsCodeLensProvider = __decorate([
    __param(0, IPromptsService),
    __param(1, ILanguageFeaturesService),
    __param(2, ILanguageModelToolsService),
    __param(3, IInstantiationService)
], PromptToolsCodeLensProvider);
registerEditorFeature(PromptToolsCodeLensProvider);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0VG9vbHNDb2RlTGVuc1Byb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3Byb21wdFN5bnRheC9wcm9tcHRUb29sc0NvZGVMZW5zUHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUVsRSxPQUFPLEVBQUUsWUFBWSxFQUFjLE1BQU0sdUNBQXVDLENBQUM7QUFDakYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDckcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUMvRCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsNkJBQTZCLEVBQUUsMkJBQTJCLEVBQUUsV0FBVyxFQUFVLE1BQU0sMENBQTBDLENBQUM7QUFDM0ksT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzdELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUVuRSxPQUFPLEVBQUUs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