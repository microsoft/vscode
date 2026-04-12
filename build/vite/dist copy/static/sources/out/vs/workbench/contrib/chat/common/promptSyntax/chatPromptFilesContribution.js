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
import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { joinPath, isEqualOrParent } from '../../../../../base/common/resources.js';
import { localize } from '../../../../../nls.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
import { IPromptsService, PromptsStorage } from './service/promptsService.js';
import { PromptsType } from './promptTypes.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions } from '../../../../services/extensionManagement/common/extensionFeatures.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
var ChatContributionPoint;
(function (ChatContributionPoint) {
    ChatContributionPoint["chatInstructions"] = "chatInstructions";
    ChatContributionPoint["chatAgents"] = "chatAgents";
    ChatContributionPoint["chatPromptFiles"] = "chatPromptFiles";
    ChatContributionPoint["chatSkills"] = "chatSkills";
})(ChatContributionPoint || (ChatContributionPoint = {}));
function registerChatFilesExtensionPoint(point) {
    return extensionsRegistry.ExtensionsRegistry.registerExtensionPoint({
        extensionPoint: point,
        jsonSchema: {
            description: localize('chatContribution.schema.description', 'Contributes {0} for chat prompts.', point),
            type: 'array',
            items: {
                additionalProperties: false,
                type: 'object',
                defaultSnippets: [{
                        body: {
                            path: point === ChatContributionPoint.chatSkills
                                ? './relative/path/to/skill-name/SKILL.md'
                                : './relative/path/to/file.md',
                        }
                    }],
                required: ['path'],
                properties: {
                    path: {
                        description: point === ChatContributionPoint.chatSkills
                            ? localize('chatContribution.property.path.skills', 'Path to the SKILL.md file relative to the extension root. The folder name must match the "name" property in SKILL.md.')
                            : localize('chatContribution.property.path', 'Path to the file relative to the extension root.'),
                        type: 'string'
                    },
                    name: {
                        description: localize('chatContribution.property.name', '(Optional) Name for this entry.'),
                        deprecationMessage: localize('chatContribution.property.name.deprecated', 'Specify "name" in the prompt file itself instead.'),
                        type: 'string'
                    },
                    description: {
                        description: localize('chatContribution.property.description', '(Optional) Description of the entry.'),
                        deprecationMessage: localize('chatContribution.property.description.deprecated', 'Specify "description" in the prompt file itself instead.'),
                        type: 'string'
                    },
                    when: {
                        description: localize('chatContribution.property.when', '(Optional) A condition which must be true to enable this entry.'),
                        type: 'string'
                    }
                }
            }
        }
    });
}
const epPrompt = registerChatFilesExtensionPoint(ChatContributionPoint.chatPromptFiles);
const epInstructions = registerChatFilesExtensionPoint(ChatContributionPoint.chatInstructions);
const epAgents = registerChatFilesExtensionPoint(ChatContributionPoint.chatAgents);
const epSkills = registerChatFilesExtensionPoint(ChatContributionPoint.chatSkills);
function pointToType(contributionPoint) {
    switch (contributionPoint) {
        case ChatContributionPoint.chatPromptFiles: return PromptsType.prompt;
        case ChatContributionPoint.chatInstructions: return PromptsType.instructions;
        case ChatContributionPoint.chatAgents: return PromptsType.agent;
        case ChatContributionPoint.chatSkills: return PromptsType.skill;
        default: {
            const exhaustiveCheck = contributionPoint;
            throw new Error(`Unknown contribution point: ${exhaustiveCheck}`);
        }
    }
}
function key(extensionId, type, path) {
    return `${extensionId.value}/${type}/${path}`;
}
let ChatPromptFilesExtensionPointHandler = class ChatPromptFilesExtensionPointHandler {
    static { this.ID = 'workbench.contrib.chatPromptFilesExtensionPointHandler'; }
    constructor(promptsService) {
        this.promptsService = promptsService;
        this.registrations = new DisposableMap();
        this.handle(epPrompt, ChatContributionPoint.chatPromptFiles);
        this.handle(epInstructions, ChatContributionPoint.chatInstructions);
        this.handle(epAgents, ChatContributionPoint.chatAgents);
        this.handle(epSkills, ChatContributionPoint.chatSkills);
    }
    handle(extensionPoint, contributionPoint) {
        extensionPoint.setHandler((_extensions, delta) => {
            for (const ext of delta.added) {
                const type = pointToType(contributionPoint);
                for (const raw of ext.value) {
                    if (!raw.path) {
                        ext.collector.error(localize('extension.missing.path', "Extension '{0}' cannot register {1} entry without path.", ext.description.identifier.value, contributionPoint));
                        continue;
                    }
                    const fileUri = joinPath(ext.description.extensionLocation, raw.path);
                    if (!isEqualOrParent(fileUri, ext.description.extensionLocation)) {
                        ext.collector.error(localize('extension.invalid.path', "Extension '{0}' {1} entry '{2}' resolves outside the extension.", ext.description.identifier.value, contributionPoint, raw.path));
                        continue;
                    }
                    if (raw.when && !ContextKeyExpr.deserialize(raw.when)) {
                        ext.collector.error(localize('extension.invalid.when', "Extension '{0}' {1} entry '{2}' has an invalid when clause: '{3}'.", ext.description.identifier.value, contributionPoint, raw.path, raw.when));
                        continue;
                    }
                    try {
                        const d = this.promptsService.registerContributedFile(type, fileUri, ext.description, raw.name, raw.description, raw.when);
                        this.registrations.set(key(ext.description.identifier, type, raw.path), d);
                    }
                    catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        ext.collector.error(localize('extension.registration.failed', "Extension '{0}' {1}. Failed to register {2}: {3}", ext.description.identifier.value, contributionPoint, raw.path, msg));
                    }
                }
            }
            for (const ext of delta.removed) {
                const type = pointToType(contributionPoint);
                for (const raw of ext.value) {
                    this.registrations.deleteAndDispose(key(ext.description.identifier, type, raw.path));
                }
            }
        });
    }
};
ChatPromptFilesExtensionPointHandler = __decorate([
    __param(0, IPromptsService)
], ChatPromptFilesExtensionPointHandler);
export { ChatPromptFilesExtensionPointHandler };
/**
 * Register the command to list all extension-contributed prompt files.
 */
CommandsRegistry.registerCommand('_listExtensionPromptFiles', async (accessor) => {
    const promptsService = accessor.get(IPromptsService);
    // Get extension prompt files for all prompt types in parallel
    const [agents, instructions, prompts, skills, hooks] = await Promise.all([
        promptsService.listPromptFiles(PromptsType.agent, CancellationToken.None),
        promptsService.listPromptFiles(PromptsType.instructions, CancellationToken.None),
        promptsService.listPromptFiles(PromptsType.prompt, CancellationToken.None),
        promptsService.listPromptFiles(PromptsType.skill, CancellationToken.None),
        promptsService.listPromptFiles(PromptsType.hook, CancellationToken.None),
    ]);
    // Combine all files and collect extension-contributed ones
    const result = [];
    for (const file of [...agents, ...instructions, ...prompts, ...skills, ...hooks]) {
        if (file.storage === PromptsStorage.extension) {
            result.push({ uri: file.uri.toJSON(), type: file.type, extensionId: file.extension.identifier.value });
        }
    }
    return result;
});
class ChatPromptFilesDataRenderer extends Disposable {
    constructor(contributionPoint) {
        super();
        this.contributionPoint = contributionPoint;
        this.type = 'table';
    }
    shouldRender(manifest) {
        return !!manifest.contributes?.[this.contributionPoint];
    }
    render(manifest) {
        const contributions = manifest.contributes?.[this.contributionPoint] ?? [];
        if (!contributions.length) {
            return { data: { headers: [], rows: [] }, dispose: () => { } };
        }
        const headers = [
            localize('chatFilesName', "Name"),
            localize('chatFilesDescription', "Description"),
            localize('chatFilesPath', "Path"),
        ];
        const rows = contributions.map(d => {
            return [
                d.name ?? '-',
                d.description ?? '-',
                d.path,
            ];
        });
        return {
            data: {
                headers,
                rows
            },
            dispose: () => { }
        };
    }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: ChatContributionPoint.chatPromptFiles,
    label: localize('chatPromptFiles', "Chat Prompt Files"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(ChatPromptFilesDataRenderer, [ChatContributionPoint.chatPromptFiles]),
});
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: ChatContributionPoint.chatInstructions,
    label: localize('chatInstructions', "Chat Instructions"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(ChatPromptFilesDataRenderer, [ChatContributionPoint.chatInstructions]),
});
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: ChatContributionPoint.chatAgents,
    label: localize('chatAgents', "Chat Agents"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(ChatPromptFilesDataRenderer, [ChatContributionPoint.chatAgents]),
});
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: ChatContributionPoint.chatSkills,
    label: localize('chatSkills', "Chat Skills"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(ChatPromptFilesDataRenderer, [ChatContributionPoint.chatSkills]),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFByb21wdEZpbGVzQ29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L2NoYXRQcm9tcHRGaWxlc0NvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxRQUFRLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBR2pELE9BQU8sS0FBSyxrQkFBa0IsTUFBTSw4REFBOEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsZUFBZSxFQUFFLGNBQWMsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQzlFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUUvQyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN2RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDN0YsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxVQUFVLEVBQW1HLE1BQU0sc0VBQXNFLENBQUM7QUFDbk0sT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBU3pGLElBQUsscUJBS0o7QUFMRCxXQUFLLHFCQUFxQjtJQUN6Qiw4REFBcUMsQ0FBQTtJQUNyQyxrREFBeUIsQ0FBQTtJQUN6Qiw0REFBbUMsQ0FBQTtJQUNuQyxrREFBeUIsQ0FBQTtBQUMxQixDQUFDLEVBTEkscUJBQXFCLEtBQXJCLHFCQUFxQixRQUt6QjtBQUVELFNBQVMsK0JBQStCLENBQUMsS0FBNEI7SUFDcEUsT0FBTyxrQkFBa0IsQ0FBQyxrQkFBa0IsQ0FBQyxzQkFBc0IsQ0FBNkI7UUFDL0YsY0FBYyxFQUFFLEtBQUs7UUFDckIsVUFBVSxFQUFFO1lBQ1gsV0FBVyxFQUFFLFFBQVEsQ0FBQyxxQ0FBcUMsRUFBRSxtQ0FBbUMsRUFBRSxLQUFLLENBQUM7WUFDeEcsSUFBSSxFQUFFLE9BQU87WUFDYixLQUFLLEVBQUU7Z0JBQ04sb0JBQW9CLEVBQUUsS0FBSztnQkFDM0IsSUFBSSxFQUFFLFFBQVE7Z0JBQ2QsZUFBZSxFQUFFLENBQUM7d0JBQ2pCLElBQUksRUFBRTs0QkFDTCxJQUFJLEVBQUUsS0FBSyxLQUFLLHFCQUFxQixDQUFDLFVBQVU7Z0NBQy9DLENBQUMsQ0FBQyx3Q0FBd0M7Z0NBQzFDLENBQUMsQ0FBQyw0QkFBNEI7eUJBQy9CO3FCQUNELENBQUM7Z0JBQ0YsUUFBUSxFQUFFLENBQUMsTUFBTSxDQUFDO2dCQUNsQixVQUFVLEVBQUU7b0JBQ1gsSUFBSSxFQUFFO3dCQUNMLFdBQVcsRUFBRSxLQUFLLEtBQUsscUJBQXFCLENBQUMsVUFBVTs0QkFDdEQsQ0FBQyxDQUFDLFFBQVEsQ0FBQyx1Q0FBdUMsRUFBRSx1SEFBdUgsQ0FBQzs0QkFDNUssQ0FBQyxDQUFDLFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSxrREFBa0QsQ0FBQzt3QkFDakcsSUFBSSxFQUFFLFFBQVE7cUJBQ2Q7b0JBQ0QsSUFBSSxFQUFFO3dCQUNMLFdBQVcsRUFBRSxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsaUNBQWlDLENBQUM7d0JBQzFGLGtCQUFrQixFQUFFLFFBQVEsQ0FBQywyQ0FBMkMsRUFBRSxtREFBbUQsQ0FBQzt3QkFDOUgsSUFBSSxFQUFFLFFBQVE7cUJBQ2Q7b0JBQ0QsV0FBVyxFQUFFO3dCQUNaLFdBQVcsRUFBRSxRQUFRLENBQUMsdUNBQXVDLEVBQUUsc0NBQXNDLENBQUM7d0JBQ3RHLGtCQUFrQixFQUFFLFFBQVEsQ0FBQyxrREFBa0QsRUFBRSwwREFBMEQsQ0FBQzt3QkFDNUksSUFBSSxFQUFFLFFBQVE7cUJBQ2Q7b0JBQ0QsSUFBSSxFQUFFO3dCQUNMLFdBQVcsRUFBRSxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsaUVBQWlFLENBQUM7d0JBQzFILElBQUksRUFBRSxRQUFRO3FCQUNkO2lCQUNEO2FBQ0Q7U0FDRDtLQUNELENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCxNQUFNLFFBQVEsR0FBRywrQkFBK0IsQ0FBQyxxQkFBcUIsQ0FBQyxlQUFlLENBQUMsQ0FBQztBQUN4RixNQUFNLGNBQWMsR0FBRywrQkFBK0IsQ0FBQyxxQkFBcUIsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0FBQy9GLE1BQU0sUUFBUSxHQUFHLCtCQUErQixDQUFDLHFCQUFxQixDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBQ25GLE1BQU0sUUFBUSxHQUFHLCtCQUErQixDQUFDLHFCQUFxQixDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBRW5GLFNBQVMsV0FBVyxDQUFDLGlCQUF3QztJQUM1RCxRQUFRLGlCQUFpQixFQUFFLENBQUM7UUFDM0IsS0FBSyxxQkFBcUIsQ0FBQyxlQUFlLENBQUMsQ0FBQyxPQUFPLFdBQVcsQ0FBQyxNQUFNLENBQUM7UUFDdEUsS0FBSyxxQkFBcUIsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLE9BQU8sV0FBVyxDQUFDLFlBQVksQ0FBQztRQUM3RSxLQUFLLHFCQUFxQixDQUFDLFVBQVUsQ0FBQyxDQUFDLE9BQU8sV0FBVyxDQUFDLEtBQUssQ0FBQztRQUNoRSxLQUFLLHFCQUFxQixDQUFDLFVBQVUsQ0FBQyxDQUFDLE9BQU8sV0FBVyxDQUFDLEtBQUssQ0FBQztRQUNoRSxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ1QsTUFBTSxlQUFlLEdBQVUsaUJBQWlCLENBQUM7WUFDakQsTUFBTSxJQUFJLEtBQUssQ0FBQywrQkFBK0IsZUFBZSxFQUFFLENBQUMsQ0FBQztRQUNuRSxDQUFDO0lBQ0YsQ0FBQztBQUNGLENBQUM7QUFFRCxTQUFTLEdBQUcsQ0FBQyxXQUFnQyxFQUFFLElBQWlCLEVBQUUsSUFBWTtJQUM3RSxPQUFPLEdBQUcsV0FBVyxDQUFDLEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFLENBQUM7QUFDL0MsQ0FBQztBQUVNLElBQU0sb0NBQW9DLEdBQTFDLE1BQU0sb0NBQW9DO2FBQ3pCLE9BQUUsR0FBRyx3REFBd0QsQUFBM0QsQ0FBNEQ7SUFJckYsWUFDa0IsY0FBZ0Q7UUFBL0IsbUJBQWMsR0FBZCxjQUFjLENBQWlCO1FBSGpELGtCQUFhLEdBQUcsSUFBSSxhQUFhLEVBQVUsQ0FBQztRQUs1RCxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxxQkFBcUIsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUM3RCxJQUFJLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFBRSxxQkFBcUIsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3BFLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLHFCQUFxQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3hELElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLHFCQUFxQixDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3pELENBQUM7SUFFTyxNQUFNLENBQUMsY0FBOEUsRUFBRSxpQkFBd0M7UUFDdEksY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFdBQVcsRUFBRSxLQUFLLEVBQUUsRUFBRTtZQUNoRCxLQUFLLE1BQU0sR0FBRyxJQUFJLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDL0IsTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUM7Z0JBQzVDLEtBQUssTUFBTSxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUM3QixJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO3dCQUNmLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSx5REFBeUQsRUFBRSxHQUFHLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO3dCQUN4SyxTQUFTO29CQUNWLENBQUM7b0JBQ0QsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsaUJBQWlCLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUN0RSxJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLEVBQUUsQ0FBQzt3QkFDbEUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLHdCQUF3QixFQUFFLGlFQUFpRSxFQUFFLEdBQUcsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxpQkFBaUIsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQzt3QkFDMUwsU0FBUztvQkFDVixDQUFDO29CQUNELElBQUksR0FBRyxDQUFDLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7d0JBQ3ZELEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxvRUFBb0UsRUFBRSxHQUFHLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQzt3QkFDdk0sU0FBUztvQkFDVixDQUFDO29CQUNELElBQUksQ0FBQzt3QkFDSixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLHVCQUF1QixDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsR0FBRyxDQUFDLFdBQVcsRUFBRSxHQUFHLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxXQUFXLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO3dCQUMzSCxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFDNUUsQ0FBQztvQkFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO3dCQUNaLE1BQU0sR0FBRyxHQUFHLENBQUMsWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDdkQsR0FBRyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLCtCQUErQixFQUFFLGtEQUFrRCxFQUFFLEdBQUcsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxpQkFBaUIsRUFBRSxHQUFHLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQ3hMLENBQUM7Z0JBQ0YsQ0FBQztZQUNGLENBQUM7WUFDRCxLQUFLLE1BQU0sR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDakMsTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUM7Z0JBQzVDLEtBQUssTUFBTSxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUM3QixJQUFJLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLFVBQVUsRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ3RGLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDOztBQWhEVyxvQ0FBb0M7SUFNOUMsV0FBQSxlQUFlLENBQUE7R0FOTCxvQ0FBb0MsQ0FpRGhEOztBQVdEOztHQUVHO0FBQ0gsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLDJCQUEyQixFQUFFLEtBQUssRUFBRSxRQUFRLEVBQXlDLEVBQUU7SUFDdkgsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztJQUVyRCw4REFBOEQ7SUFDOUQsTUFBTSxDQUFDLE1BQU0sRUFBRSxZQUFZLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUM7UUFDeEUsY0FBYyxDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQztRQUN6RSxjQUFjLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxZQUFZLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDO1FBQ2hGLGNBQWMsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUM7UUFDMUUsY0FBYyxDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQztRQUN6RSxjQUFjLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDO0tBQ3hFLENBQUMsQ0FBQztJQUVILDJEQUEyRDtJQUMzRCxNQUFNLE1BQU0sR0FBaUMsRUFBRSxDQUFDO0lBQ2hELEtBQUssTUFBTSxJQUFJLElBQUksQ0FBQyxHQUFHLE1BQU0sRUFBRSxHQUFHLFlBQVksRUFBRSxHQUFHLE9BQU8sRUFBRSxHQUFHLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDbEYsSUFBSSxJQUFJLENBQUMsT0FBTyxLQUFLLGNBQWMsQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUMvQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsV0FBVyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDeEcsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUMsQ0FBQyxDQUFDO0FBRUgsTUFBTSwyQkFBNEIsU0FBUSxVQUFVO0lBR25ELFlBQTZCLGlCQUF3QztRQUNwRSxLQUFLLEVBQUUsQ0FBQztRQURvQixzQkFBaUIsR0FBakIsaUJBQWlCLENBQXVCO1FBRjVELFNBQUksR0FBRyxPQUFPLENBQUM7SUFJeEIsQ0FBQztJQUVELFlBQVksQ0FBQyxRQUE0QjtRQUN4QyxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDekQsQ0FBQztJQUVELE1BQU0sQ0FBQyxRQUE0QjtRQUNsQyxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsV0FBVyxFQUFFLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxDQUFDO1FBQzNFLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDM0IsT0FBTyxFQUFFLElBQUksRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNoRSxDQUFDO1FBRUQsTUFBTSxPQUFPLEdBQUc7WUFDZixRQUFRLENBQUMsZUFBZSxFQUFFLE1BQU0sQ0FBQztZQUNqQyxRQUFRLENBQUMsc0JBQXNCLEVBQUUsYUFBYSxDQUFDO1lBQy9DLFFBQVEsQ0FBQyxlQUFlLEVBQUUsTUFBTSxDQUFDO1NBQ2pDLENBQUM7UUFFRixNQUFNLElBQUksR0FBaUIsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUNoRCxPQUFPO2dCQUNOLENBQUMsQ0FBQyxJQUFJLElBQUksR0FBRztnQkFDYixDQUFDLENBQUMsV0FBVyxJQUFJLEdBQUc7Z0JBQ3BCLENBQUMsQ0FBQyxJQUFJO2FBQ04sQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO1FBRUgsT0FBTztZQUNOLElBQUksRUFBRTtnQkFDTCxPQUFPO2dCQUNQLElBQUk7YUFDSjtZQUNELE9BQU8sRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDO1NBQ2xCLENBQUM7SUFDSCxDQUFDO0NBQ0Q7QUFFRCxRQUFRLENBQUMsRUFBRSxDQUE2QixVQUFVLENBQUMseUJBQXlCLENBQUMsQ0FBQyx3QkFBd0IsQ0FBQztJQUN0RyxFQUFFLEVBQUUscUJBQXFCLENBQUMsZUFBZTtJQUN6QyxLQUFLLEVBQUUsUUFBUSxDQUFDLGlCQUFpQixFQUFFLG1CQUFtQixDQUFDO0lBQ3ZELE1BQU0sRUFBRTtRQUNQLFNBQVMsRUFBRSxLQUFLO0tBQ2hCO0lBQ0QsUUFBUSxFQUFFLElBQUksY0FBYyxDQUFDLDJCQUEyQixFQUFFLENBQUMscUJBQXFCLENBQUMsZUFBZSxDQUFDLENBQUM7Q0FDbEcsQ0FBQyxDQUFDO0FBRUgsUUFBUSxDQUFDLEVBQUUsQ0FBNkIsVUFBVSxDQUFDLHlCQUF5QixDQUFDLENBQUMsd0JBQXdCLENBQUM7SUFDdEcsRUFBRSxFQUFFLHFCQUFxQixDQUFDLGdCQUFnQjtJQUMxQyxLQUFLLEVBQUUsUUFBUSxDQUFDLGtCQUFrQixFQUFFLG1CQUFtQixDQUFDO0lBQ3hELE1BQU0sRUFBRTtRQUNQLFNBQVMsRUFBRSxLQUFLO0tBQ2hCO0lBQ0QsUUFBUSxFQUFFLElBQUksY0FBYyxDQUFDLDJCQUEyQixFQUFFLENBQUMscUJBQXFCLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztDQUNuRyxDQUFDLENBQUM7QUFFSCxRQUFRLENBQUMsRUFBRSxDQUE2QixVQUFVLENBQUMseUJBQXlCLENBQUMsQ0FBQyx3QkFBd0IsQ0FBQztJQUN0RyxFQUFFLEVBQUUscUJBQXFCLENBQUMsVUFBVTtJQUNwQyxLQUFLLEVBQUUsUUFBUSxDQUFDLFlBQVksRUFBRSxhQUFhLENBQUM7SUFDNUMsTUFBTSxFQUFFO1FBQ1AsU0FBUyxFQUFFLEtBQUs7S0FDaEI7SUFDRCxRQUFRLEVBQUUsSUFBSSxjQUFjLENBQUMsMkJBQTJCLEVBQUUsQ0FBQyxxQkFBcUIsQ0FBQyxVQUFVLENBQUMsQ0FBQztDQUM3RixDQUFDLENBQUM7QUFFSCxRQUFRLENBQUMsRUFBRSxDQUE2QixVQUFVLENBQUMseUJBQXlCLENBQUMsQ0FBQyx3QkFBd0IsQ0FBQztJQUN0RyxFQUFFLEVBQUUscUJBQXFCLENBQUMsVUFBVTtJQUNwQyxLQUFLLEVBQUUsUUFBUSxDQUFDLFlBQVksRUFBRSxhQUFhLENBQUM7SUFDNUMsTUFBTSxFQUFFO1FBQ1AsU0FBUyxFQUFFLEtBQUs7S0FDaEI7SUFDRCxRQUFRLEVBQUUsSUFBSSxjQUFjLENBQUMsMkJBQTJCLEVBQUUsQ0FBQyxxQkFBcUIsQ0FBQyxVQUFVLENBQUMsQ0FBQztDQUM3RixDQUFDLENBQUMifQ==