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
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { derived, ObservableMap } from '../../../../../../base/common/observable.js';
import { isObject } from '../../../../../../base/common/types.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { observableMemento } from '../../../../../../platform/observable/common/observableMemento.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ChatModeKind } from '../../../common/constants.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { ILanguageModelToolsService, isToolSet } from '../../../common/tools/languageModelToolsService.js';
import { PromptFileRewriter } from '../../promptSyntax/promptFileRewriter.js';
var ToolEnablementStates;
(function (ToolEnablementStates) {
    function fromMap(map) {
        const toolSets = new Map(), tools = new Map();
        for (const [entry, enabled] of map.entries()) {
            if (isToolSet(entry)) {
                toolSets.set(entry.id, enabled);
            }
            else {
                tools.set(entry.id, enabled);
            }
        }
        return { toolSets, tools };
    }
    ToolEnablementStates.fromMap = fromMap;
    function isStoredDataV1(data) {
        return isObject(data) && data.version === undefined
            && (data.disabledTools === undefined || Array.isArray(data.disabledTools))
            && (data.disabledToolSets === undefined || Array.isArray(data.disabledToolSets));
    }
    function isStoredDataV2(data) {
        return isObject(data) && data.version === 2 && Array.isArray(data.toolSetEntries) && Array.isArray(data.toolEntries);
    }
    function fromStorage(storage) {
        try {
            const parsed = JSON.parse(storage);
            if (isStoredDataV2(parsed)) {
                return { toolSets: new Map(parsed.toolSetEntries), tools: new Map(parsed.toolEntries) };
            }
            else if (isStoredDataV1(parsed)) {
                const toolSetEntries = parsed.disabledToolSets?.map(id => [id, false]);
                const toolEntries = parsed.disabledTools?.map(id => [id, false]);
                return { toolSets: new Map(toolSetEntries), tools: new Map(toolEntries) };
            }
        }
        catch {
            // ignore
        }
        // invalid data
        return { toolSets: new Map(), tools: new Map() };
    }
    ToolEnablementStates.fromStorage = fromStorage;
    function toStorage(state) {
        const storageData = {
            version: 2,
            toolSetEntries: Array.from(state.toolSets.entries()),
            toolEntries: Array.from(state.tools.entries())
        };
        return JSON.stringify(storageData);
    }
    ToolEnablementStates.toStorage = toStorage;
})(ToolEnablementStates || (ToolEnablementStates = {}));
export var ToolsScope;
(function (ToolsScope) {
    ToolsScope[ToolsScope["Global"] = 0] = "Global";
    ToolsScope[ToolsScope["Session"] = 1] = "Session";
    ToolsScope[ToolsScope["Agent"] = 2] = "Agent";
    ToolsScope[ToolsScope["Agent_ReadOnly"] = 3] = "Agent_ReadOnly";
})(ToolsScope || (ToolsScope = {}));
let ChatSelectedTools = class ChatSelectedTools extends Disposable {
    constructor(_mode, languageModel, _toolsService, _storageService, _instantiationService) {
        super();
        this._mode = _mode;
        this.languageModel = languageModel;
        this._toolsService = _toolsService;
        this._instantiationService = _instantiationService;
        this._sessionStates = new ObservableMap();
        /**
         * All tools and tool sets with their enabled state.
         * Tools are filtered based on the current model context.
         */
        this.entriesMap = derived(r => {
            const map = new Map();
            const lm = this.languageModel.read(r)?.metadata;
            // look up the tools in the hierarchy: session > mode > global
            const currentMode = this._mode.read(r);
            let currentMap = this._sessionStates.observable.read(r).get(currentMode.id);
            if (!currentMap && currentMode.kind === ChatModeKind.Agent) {
                const modeTools = currentMode.customTools?.read(r);
                if (modeTools) {
                    currentMap = ToolEnablementStates.fromMap(this._toolsService.toToolAndToolSetEnablementMap(modeTools, lm));
                }
            }
            if (!currentMap) {
                currentMap = this._globalState.read(r);
            }
            // Use getTools with contextKeyService to filter tools by current model
            for (const tool of this._currentTools.read(r)) {
                if (tool.canBeReferencedInPrompt) {
                    map.set(tool, currentMap.tools.get(tool.id) !== false); // if unknown, it's enabled
                }
            }
            for (const toolSet of this._toolsService.getToolSetsForModel(lm, r)) {
                const toolSetEnabled = currentMap.toolSets.get(toolSet.id) !== false; // if unknown, it's enabled
                map.set(toolSet, toolSetEnabled);
                for (const tool of toolSet.getTools(r)) {
                    map.set(tool, toolSetEnabled || currentMap.tools.get(tool.id) === true); // if unknown, use toolSetEnabled
                }
            }
            return map;
        });
        this.userSelectedTools = derived(r => {
            // extract a map of tool ids
            const result = {};
            const map = this.entriesMap.read(r);
            for (const [item, enabled] of map) {
                if (!isToolSet(item)) {
                    result[item.id] = enabled;
                }
            }
            return result;
        });
        const globalStateMemento = observableMemento({
            key: 'chat/selectedTools',
            defaultValue: { toolSets: new Map(), tools: new Map() },
            fromStorage: ToolEnablementStates.fromStorage,
            toStorage: ToolEnablementStates.toStorage
        });
        this._globalState = this._store.add(globalStateMemento(0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */, _storageService));
        this._currentTools = languageModel.map(lm => _toolsService.observeTools(lm?.metadata)).map((o, r) => o.read(r));
    }
    get entriesScope() {
        const mode = this._mode.get();
        if (this._sessionStates.has(mode.id)) {
            return ToolsScope.Session;
        }
        if (mode.kind === ChatModeKind.Agent && mode.customTools?.get() && mode.uri) {
            return mode.source?.storage !== PromptsStorage.extension ? ToolsScope.Agent : ToolsScope.Agent_ReadOnly;
        }
        return ToolsScope.Global;
    }
    get currentMode() {
        return this._mode.get();
    }
    resetSessionEnablementState() {
        const mode = this._mode.get();
        this._sessionStates.delete(mode.id);
    }
    set(enablementMap, sessionOnly) {
        const mode = this._mode.get();
        if (sessionOnly || this._sessionStates.has(mode.id)) {
            this._sessionStates.set(mode.id, ToolEnablementStates.fromMap(enablementMap));
            return;
        }
        if (mode.kind === ChatModeKind.Agent && mode.customTools?.get() && mode.uri) {
            if (mode.source?.storage !== PromptsStorage.extension) {
                // apply directly to mode file.
                this.updateCustomModeTools(mode.uri.get(), enablementMap);
                return;
            }
            else {
                // can not write to extensions, store
                this._sessionStates.set(mode.id, ToolEnablementStates.fromMap(enablementMap));
                return;
            }
        }
        this._globalState.set(ToolEnablementStates.fromMap(enablementMap), undefined);
    }
    async updateCustomModeTools(uri, enablementMap) {
        await this._instantiationService.createInstance(PromptFileRewriter).openAndRewriteTools(uri, enablementMap, CancellationToken.None);
    }
};
ChatSelectedTools = __decorate([
    __param(2, ILanguageModelToolsService),
    __param(3, IStorageService),
    __param(4, IInstantiationService)
], ChatSelectedTools);
export { ChatSelectedTools };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNlbGVjdGVkVG9vbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRTZWxlY3RlZFRvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsT0FBTyxFQUFlLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVsRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFDekgsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxzREFBc0QsQ0FBQztBQUVwSCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFHNUQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSwwQkFBMEIsRUFBcUQsU0FBUyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDOUosT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFzQjlFLElBQVUsb0JBQW9CLENBZ0Q3QjtBQWhERCxXQUFVLG9CQUFvQjtJQUM3QixTQUFnQixPQUFPLENBQUMsR0FBaUM7UUFDeEQsTUFBTSxRQUFRLEdBQXlCLElBQUksR0FBRyxFQUFFLEVBQUUsS0FBSyxHQUF5QixJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQzFGLEtBQUssTUFBTSxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsSUFBSSxHQUFHLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQztZQUM5QyxJQUFJLFNBQVMsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUN0QixRQUFRLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDakMsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUM5QixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLENBQUM7SUFDNUIsQ0FBQztJQVZlLDRCQUFPLFVBVXRCLENBQUE7SUFFRCxTQUFTLGNBQWMsQ0FBQyxJQUE2QztRQUNwRSxPQUFPLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsT0FBTyxLQUFLLFNBQVM7ZUFDL0MsQ0FBQyxJQUFJLENBQUMsYUFBYSxLQUFLLFNBQVMsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztlQUN2RSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsS0FBSyxTQUFTLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO0lBQ25GLENBQUM7SUFFRCxTQUFTLGNBQWMsQ0FBQyxJQUE2QztRQUNwRSxPQUFPLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsT0FBTyxLQUFLLENBQUMsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUN0SCxDQUFDO0lBRUQsU0FBZ0IsV0FBVyxDQUFDLE9BQWU7UUFDMUMsSUFBSSxDQUFDO1lBQ0osTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNuQyxJQUFJLGNBQWMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUM1QixPQUFPLEVBQUUsUUFBUSxFQUFFLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsRUFBRSxLQUFLLEVBQUUsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7WUFDekYsQ0FBQztpQkFBTSxJQUFJLGNBQWMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUNuQyxNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsS0FBSyxDQUFzQixDQUFDLENBQUM7Z0JBQzVGLE1BQU0sV0FBVyxHQUFHLE1BQU0sQ0FBQyxhQUFhLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsS0FBSyxDQUFzQixDQUFDLENBQUM7Z0JBQ3RGLE9BQU8sRUFBRSxRQUFRLEVBQUUsSUFBSSxHQUFHLENBQUMsY0FBYyxDQUFDLEVBQUUsS0FBSyxFQUFFLElBQUksR0FBRyxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7WUFDM0UsQ0FBQztRQUNGLENBQUM7UUFBQyxNQUFNLENBQUM7WUFDUixTQUFTO1FBQ1YsQ0FBQztRQUNELGVBQWU7UUFDZixPQUFPLEVBQUUsUUFBUSxFQUFFLElBQUksR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksR0FBRyxFQUFFLEVBQUUsQ0FBQztJQUNsRCxDQUFDO0lBZmUsZ0NBQVcsY0FlMUIsQ0FBQTtJQUVELFNBQWdCLFNBQVMsQ0FBQyxLQUEyQjtRQUNwRCxNQUFNLFdBQVcsR0FBaUI7WUFDakMsT0FBTyxFQUFFLENBQUM7WUFDVixjQUFjLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3BELFdBQVcsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7U0FDOUMsQ0FBQztRQUNGLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUNwQyxDQUFDO0lBUGUsOEJBQVMsWUFPeEIsQ0FBQTtBQUNGLENBQUMsRUFoRFMsb0JBQW9CLEtBQXBCLG9CQUFvQixRQWdEN0I7QUFFRCxNQUFNLENBQU4sSUFBWSxVQUtYO0FBTEQsV0FBWSxVQUFVO0lBQ3JCLCtDQUFNLENBQUE7SUFDTixpREFBTyxDQUFBO0lBQ1AsNkNBQUssQ0FBQTtJQUNMLCtEQUFjLENBQUE7QUFDZixDQUFDLEVBTFcsVUFBVSxLQUFWLFVBQVUsUUFLckI7QUFFTSxJQUFNLGlCQUFpQixHQUF2QixNQUFNLGlCQUFrQixTQUFRLFVBQVU7SUFPaEQsWUFDa0IsS0FBNkIsRUFDN0IsYUFBK0UsRUFDcEUsYUFBMEQsRUFDckUsZUFBZ0MsRUFDMUIscUJBQTZEO1FBRXBGLEtBQUssRUFBRSxDQUFDO1FBTlMsVUFBSyxHQUFMLEtBQUssQ0FBd0I7UUFDN0Isa0JBQWEsR0FBYixhQUFhLENBQWtFO1FBQ25ELGtCQUFhLEdBQWIsYUFBYSxDQUE0QjtRQUU5QywwQkFBcUIsR0FBckIscUJBQXFCLENBQXVCO1FBUnBFLG1CQUFjLEdBQUcsSUFBSSxhQUFhLEVBQTRDLENBQUM7UUF3QmhHOzs7V0FHRztRQUNhLGVBQVUsR0FBOEMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ25GLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxFQUFpQyxDQUFDO1lBQ3JELE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQztZQUVoRCw4REFBOEQ7WUFDOUQsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdkMsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDNUUsSUFBSSxDQUFDLFVBQVUsSUFBSSxXQUFXLENBQUMsSUFBSSxLQUFLLFlBQVksQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDNUQsTUFBTSxTQUFTLEdBQUcsV0FBVyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ25ELElBQUksU0FBUyxFQUFFLENBQUM7b0JBQ2YsVUFBVSxHQUFHLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLDZCQUE2QixDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUM1RyxDQUFDO1lBQ0YsQ0FBQztZQUNELElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDakIsVUFBVSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hDLENBQUM7WUFDRCx1RUFBdUU7WUFDdkUsS0FBSyxNQUFNLElBQUksSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUMvQyxJQUFJLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO29CQUNsQyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxVQUFVLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssS0FBSyxDQUFDLENBQUMsQ0FBQywyQkFBMkI7Z0JBQ3BGLENBQUM7WUFDRixDQUFDO1lBQ0QsS0FBSyxNQUFNLE9BQU8sSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLG1CQUFtQixDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNyRSxNQUFNLGNBQWMsR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEtBQUssS0FBSyxDQUFDLENBQUMsMkJBQTJCO2dCQUNqRyxHQUFHLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxjQUFjLENBQUMsQ0FBQztnQkFDakMsS0FBSyxNQUFNLElBQUksSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ3hDLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLGNBQWMsSUFBSSxVQUFVLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQyxpQ0FBaUM7Z0JBQzNHLENBQUM7WUFDRixDQUFDO1lBQ0QsT0FBTyxHQUFHLENBQUM7UUFDWixDQUFDLENBQUMsQ0FBQztRQUVhLHNCQUFpQixHQUFtQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDL0UsNEJBQTRCO1lBQzVCLE1BQU0sTUFBTSxHQUFzQixFQUFFLENBQUM7WUFDckMsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEMsS0FBSyxNQUFNLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO2dCQUNuQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7b0JBQ3RCLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDO2dCQUMzQixDQUFDO1lBQ0YsQ0FBQztZQUNELE9BQU8sTUFBTSxDQUFDO1FBQ2YsQ0FBQyxDQUFDLENBQUM7UUExREYsTUFBTSxrQkFBa0IsR0FBRyxpQkFBaUIsQ0FBdUI7WUFDbEUsR0FBRyxFQUFFLG9CQUFvQjtZQUN6QixZQUFZLEVBQUUsRUFBRSxRQUFRLEVBQUUsSUFBSSxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxHQUFHLEVBQUUsRUFBRTtZQUN2RCxXQUFXLEVBQUUsb0JBQW9CLENBQUMsV0FBVztZQUM3QyxTQUFTLEVBQUUsb0JBQW9CLENBQUMsU0FBUztTQUN6QyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGtCQUFrQiw4REFBOEMsZUFBZSxDQUFDLENBQUMsQ0FBQztRQUN0SCxJQUFJLENBQUMsYUFBYSxHQUFHLGFBQWEsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FDM0MsYUFBYSxDQUFDLFlBQVksQ0FBQyxFQUFFLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDckUsQ0FBQztJQWtERCxJQUFJLFlBQVk7UUFDZixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQzlCLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDdEMsT0FBTyxVQUFVLENBQUMsT0FBTyxDQUFDO1FBQzNCLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssWUFBWSxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRSxJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUM3RSxPQUFPLElBQUksQ0FBQyxNQUFNLEVBQUUsT0FBTyxLQUFLLGNBQWMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxjQUFjLENBQUM7UUFDekcsQ0FBQztRQUNELE9BQU8sVUFBVSxDQUFDLE1BQU0sQ0FBQztJQUMxQixDQUFDO0lBRUQsSUFBSSxXQUFXO1FBQ2QsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ3pCLENBQUM7SUFFRCwyQkFBMkI7UUFDMUIsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUM5QixJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDckMsQ0FBQztJQUVELEdBQUcsQ0FBQyxhQUEyQyxFQUFFLFdBQW9CO1FBQ3BFLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDOUIsSUFBSSxXQUFXLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDckQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxvQkFBb0IsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztZQUM5RSxPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxZQUFZLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsR0FBRyxFQUFFLElBQUksSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQzdFLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxPQUFPLEtBQUssY0FBYyxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUN2RCwrQkFBK0I7Z0JBQy9CLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxFQUFFLGFBQWEsQ0FBQyxDQUFDO2dCQUMxRCxPQUFPO1lBQ1IsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLHFDQUFxQztnQkFDckMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxvQkFBb0IsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztnQkFDOUUsT0FBTztZQUNSLENBQUM7UUFDRixDQUFDO1FBQ0QsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQy9FLENBQUM7SUFFTyxLQUFLLENBQUMscUJBQXFCLENBQUMsR0FBUSxFQUFFLGFBQTJDO1FBQ3hGLE1BQU0sSUFBSSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsRUFBRSxhQUFhLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDckksQ0FBQztDQUNELENBQUE7QUF2SFksaUJBQWlCO0lBVTNCLFdBQUEsMEJBQTBCLENBQUE7SUFDMUIsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLHFCQUFxQixDQUFBO0dBWlgsaUJBQWlCLENBdUg3QiJ9