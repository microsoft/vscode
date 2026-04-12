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
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ToolDataSource, ToolInvocationPresentation } from '../languageModelToolsService.js';
import { IChatArtifactsService } from '../chatArtifactsService.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
export const SetArtifactsToolId = 'setArtifacts';
const inputSchema = {
    type: 'object',
    properties: {
        artifacts: {
            type: 'array',
            description: 'The complete list of artifacts for this session. Overwrites any existing artifacts.',
            items: {
                type: 'object',
                properties: {
                    label: {
                        type: 'string',
                        description: 'Display label for the artifact.'
                    },
                    uri: {
                        type: 'string',
                        description: 'Fully qualified URI of the artifact (e.g. https://localhost:3000 or file:///path/to/file). Must include the scheme.'
                    },
                    type: {
                        type: 'string',
                        enum: ['devServer', 'screenshot', 'plan'],
                        description: 'The type of artifact.'
                    }
                },
                required: ['label']
            }
        }
    },
    required: ['artifacts']
};
export const SetArtifactsToolData = {
    id: SetArtifactsToolId,
    toolReferenceName: 'artifacts',
    legacyToolReferenceFullNames: ['Set Session Artifacts'],
    displayName: localize('tool.setArtifacts.displayName', 'Set Session Artifacts'),
    modelDescription: 'Set the list of artifacts for the current session. Each artifact has a label and either a uri or a toolCallId+dataPartIndex reference, plus an optional type (devServer, screenshot, plan). This overwrites the entire artifact list. URIs must be fully qualified with a scheme (e.g. https://localhost:3000, file:///tmp/plan.md). To reference a screenshot or image from a previous tool result, use toolCallId and dataPartIndex instead of uri.\n\nWhen to use this tool:\n- When creating or updating a plan saved to session memory — set a plan artifact so the user can view it in the artifact panel\n- When taking screenshots or producing visual output — set a screenshot artifact to surface the image\n- When starting a dev server — set a devServer artifact with the URL so the user can access it\n- When producing important documents, drafts, or temporary markdown files — set an artifact to make them easily accessible\n- After verification steps that produce visual results — update artifacts with screenshots showing the outcome\n\nWorkflow:\n- Prefer artifacts over printing long content inline in chat. Save content to a file or memory, then set an artifact pointing to it.\n- When updating plans or documents, update both the underlying file AND the artifact list.\n- Keep artifact labels concise and descriptive.',
    canBeReferencedInPrompt: true,
    source: ToolDataSource.Internal,
    inputSchema
};
let SetArtifactsTool = class SetArtifactsTool {
    constructor(_chatArtifactsService, _fileService) {
        this._chatArtifactsService = _chatArtifactsService;
        this._fileService = _fileService;
    }
    async prepareToolInvocation(_context, _token) {
        return {
            pastTenseMessage: new MarkdownString(localize('tool.setArtifacts.pastTense', "Updated session artifacts")),
            presentation: ToolInvocationPresentation.Hidden,
        };
    }
    async invoke(invocation, _countTokens, _progress, _token) {
        const args = invocation.parameters;
        const chatSessionResource = invocation.context?.sessionResource;
        if (!chatSessionResource) {
            return {
                content: [{ kind: 'text', value: 'Error: No session resource available' }]
            };
        }
        const artifacts = [];
        for (const a of args.artifacts ?? []) {
            let uri = a.uri;
            if (!uri) {
                uri = '';
            }
            if (uri) {
                const parsed = URI.parse(uri);
                if (parsed.scheme !== 'http' && parsed.scheme !== 'https') {
                    if (!await this._fileService.exists(parsed)) {
                        throw new Error(localize('tool.setArtifacts.uriNotFound', "Artifact URI does not exist: {0}", uri));
                    }
                }
            }
            artifacts.push({ label: a.label, uri, type: a.type });
        }
        this._chatArtifactsService.getArtifacts(chatSessionResource).set(artifacts);
        return {
            content: [{ kind: 'text', value: localize('tool.setArtifacts.success', "Set {0} artifact(s)", artifacts.length) }]
        };
    }
};
SetArtifactsTool = __decorate([
    __param(0, IChatArtifactsService),
    __param(1, IFileService)
], SetArtifactsTool);
export { SetArtifactsTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0QXJ0aWZhY3RzVG9vbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9zZXRBcnRpZmFjdHNUb29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBSWhHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2hGLE9BQU8sRUFLTixjQUFjLEVBR2QsMEJBQTBCLEVBQzFCLE1BQU0saUNBQWlDLENBQUM7QUFDekMsT0FBTyxFQUFpQixxQkFBcUIsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ2xGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUU5RSxNQUFNLENBQUMsTUFBTSxrQkFBa0IsR0FBRyxjQUFjLENBQUM7QUFFakQsTUFBTSxXQUFXLEdBQWlEO0lBQ2pFLElBQUksRUFBRSxRQUFRO0lBQ2QsVUFBVSxFQUFFO1FBQ1gsU0FBUyxFQUFFO1lBQ1YsSUFBSSxFQUFFLE9BQU87WUFDYixXQUFXLEVBQUUscUZBQXFGO1lBQ2xHLEtBQUssRUFBRTtnQkFDTixJQUFJLEVBQUUsUUFBUTtnQkFDZCxVQUFVLEVBQUU7b0JBQ1gsS0FBSyxFQUFFO3dCQUNOLElBQUksRUFBRSxRQUFRO3dCQUNkLFdBQVcsRUFBRSxpQ0FBaUM7cUJBQzlDO29CQUNELEdBQUcsRUFBRTt3QkFDSixJQUFJLEVBQUUsUUFBUTt3QkFDZCxXQUFXLEVBQUUscUhBQXFIO3FCQUNsSTtvQkFDRCxJQUFJLEVBQUU7d0JBQ0wsSUFBSSxFQUFFLFFBQVE7d0JBQ2QsSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFLFlBQVksRUFBRSxNQUFNLENBQUM7d0JBQ3pDLFdBQVcsRUFBRSx1QkFBdUI7cUJBQ3BDO2lCQUNEO2dCQUNELFFBQVEsRUFBRSxDQUFDLE9BQU8sQ0FBQzthQUNuQjtTQUNEO0tBQ0Q7SUFDRCxRQUFRLEVBQUUsQ0FBQyxXQUFXLENBQUM7Q0FDdkIsQ0FBQztBQUVGLE1BQU0sQ0FBQyxNQUFNLG9CQUFvQixHQUFjO0lBQzlDLEVBQUUsRUFBRSxrQkFBa0I7SUFDdEIsaUJBQWlCLEVBQUUsV0FBVztJQUM5Qiw0QkFBNEIsRUFBRSxDQUFDLHVCQUF1QixDQUFDO0lBQ3ZELFdBQVcsRUFBRSxRQUFRLENBQUMsK0JBQStCLEVBQUUsdUJBQXVCLENBQUM7SUFDL0UsZ0JBQWdCLEVBQUUsb3lDQUFveUM7SUFDdHpDLHVCQUF1QixFQUFFLElBQUk7SUFDN0IsTUFBTSxFQUFFLGNBQWMsQ0FBQyxRQUFRO0lBQy9CLFdBQVc7Q0FDWCxDQUFDO0FBTUssSUFBTSxnQkFBZ0IsR0FBdEIsTUFBTSxnQkFBZ0I7SUFFNUIsWUFDeUMscUJBQTRDLEVBQ3JELFlBQTBCO1FBRGpCLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFDckQsaUJBQVksR0FBWixZQUFZLENBQWM7SUFDdEQsQ0FBQztJQUVMLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxRQUEyQyxFQUFFLE1BQXlCO1FBQ2pHLE9BQU87WUFDTixnQkFBZ0IsRUFBRSxJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMsNkJBQTZCLEVBQUUsMkJBQTJCLENBQUMsQ0FBQztZQUMxRyxZQUFZLEVBQUUsMEJBQTBCLENBQUMsTUFBTTtTQUMvQyxDQUFDO0lBQ0gsQ0FBQztJQUVELEtBQUssQ0FBQyxNQUFNLENBQUMsVUFBMkIsRUFBRSxZQUFtQixFQUFFLFNBQWdCLEVBQUUsTUFBeUI7UUFDekcsTUFBTSxJQUFJLEdBQUcsVUFBVSxDQUFDLFVBQW9DLENBQUM7UUFDN0QsTUFBTSxtQkFBbUIsR0FBRyxVQUFVLENBQUMsT0FBTyxFQUFFLGVBQWUsQ0FBQztRQUNoRSxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUMxQixPQUFPO2dCQUNOLE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsc0NBQXNDLEVBQUUsQ0FBQzthQUMxRSxDQUFDO1FBQ0gsQ0FBQztRQUVELE1BQU0sU0FBUyxHQUFvQixFQUFFLENBQUM7UUFDdEMsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsU0FBUyxJQUFJLEVBQUUsRUFBRSxDQUFDO1lBQ3RDLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUM7WUFDaEIsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO2dCQUNWLEdBQUcsR0FBRyxFQUFFLENBQUM7WUFDVixDQUFDO1lBRUQsSUFBSSxHQUFHLEVBQUUsQ0FBQztnQkFDVCxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUM5QixJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssTUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssT0FBTyxFQUFFLENBQUM7b0JBQzNELElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7d0JBQzdDLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLCtCQUErQixFQUFFLGtDQUFrQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQ3JHLENBQUM7Z0JBQ0YsQ0FBQztZQUNGLENBQUM7WUFFRCxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUN2RCxDQUFDO1FBRUQsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFlBQVksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUU1RSxPQUFPO1lBQ04sT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsMkJBQTJCLEVBQUUscUJBQXFCLEVBQUUsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7U0FDbEgsQ0FBQztJQUNILENBQUM7Q0FDRCxDQUFBO0FBaERZLGdCQUFnQjtJQUcxQixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsWUFBWSxDQUFBO0dBSkYsZ0JBQWdCLENBZ0Q1QiJ9