/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { extUri, isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { PROMPT_DOCUMENTATION_URL, PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
/**
 * Asks the user for a specific prompt folder, if multiple folders provided.
 */
export async function askForPromptSourceFolder(accessor, type, existingFolder, isMove = false) {
    const instantiationService = accessor.get(IInstantiationService);
    const quickInputService = accessor.get(IQuickInputService);
    const promptsService = accessor.get(IPromptsService);
    const labelService = accessor.get(ILabelService);
    const workspaceService = accessor.get(IWorkspaceContextService);
    // get prompts source folders based on the prompt type
    const folders = await promptsService.getSourceFolders(type);
    // if no source folders found, show 'learn more' dialog
    // note! this is a temporary solution and must be replaced with a dialog to select
    //       a custom folder path, or switch to a different prompt type
    if (folders.length === 0) {
        await instantiationService.invokeFunction(accessor => showNoFoldersDialog(accessor, type));
        return;
    }
    const pickOptions = {
        placeHolder: existingFolder ? getPlaceholderStringforMove(type, isMove) : getPlaceholderStringforNew(type),
        canPickMany: false,
        matchOnDescription: true,
    };
    // create list of source folder locations
    const foldersList = folders.map(folder => {
        const uri = folder.uri;
        const detail = (existingFolder && isEqual(uri, existingFolder)) ? localize('current.folder', "Current Location") : undefined;
        if (folder.storage !== PromptsStorage.local) {
            return {
                type: 'item',
                label: promptsService.getPromptLocationLabel(folder),
                detail,
                tooltip: labelService.getUriLabel(uri),
                folder
            };
        }
        const { folders } = workspaceService.getWorkspace();
        const isMultirootWorkspace = (folders.length > 1);
        const firstFolder = folders[0];
        // if multi-root or empty workspace, or source folder `uri` does not point to
        // the root folder of a single-root workspace, return the default label and description
        if (isMultirootWorkspace || !firstFolder || !extUri.isEqual(firstFolder.uri, uri)) {
            return {
                type: 'item',
                label: labelService.getUriLabel(uri, { relative: true }),
                detail,
                tooltip: labelService.getUriLabel(uri),
                folder,
            };
        }
        // if source folder points to the root of this single-root workspace,
        // use appropriate label and description strings to prevent confusion
        return {
            type: 'item',
            label: localize('commands.prompts.create.source-folder.current-workspace', "Current Workspace"),
            detail,
            tooltip: labelService.getUriLabel(uri),
            folder,
        };
    });
    const answer = await quickInputService.pick(foldersList, pickOptions);
    if (!answer) {
        return;
    }
    return answer.folder;
}
function getPlaceholderStringforNew(type) {
    switch (type) {
        case PromptsType.instructions:
            return localize('workbench.command.instructions.create.location.placeholder', "Select a location to create the instructions file");
        case PromptsType.prompt:
            return localize('workbench.command.prompt.create.location.placeholder', "Select a location to create the prompt file");
        case PromptsType.agent:
            return localize('workbench.command.agent.create.location.placeholder', "Select a location to create the agent file");
        case PromptsType.skill:
            return localize('workbench.command.skill.create.location.placeholder', "Select a location to create the skill");
        case PromptsType.hook:
            return localize('workbench.command.hook.create.location.placeholder', "Select a location to create the hook file");
        default:
            throw new Error('Unknown prompt type');
    }
}
function getPlaceholderStringforMove(type, isMove) {
    if (isMove) {
        switch (type) {
            case PromptsType.instructions:
                return localize('instructions.move.location.placeholder', "Select a location to move the instructions file to");
            case PromptsType.prompt:
                return localize('prompt.move.location.placeholder', "Select a location to move the prompt file to");
            case PromptsType.agent:
                return localize('agent.move.location.placeholder', "Select a location to move the agent file to");
            case PromptsType.skill:
                return localize('skill.move.location.placeholder', "Select a location to move the skill to");
            case PromptsType.hook:
                throw new Error('Hooks cannot be moved');
            default:
                throw new Error('Unknown prompt type');
        }
    }
    switch (type) {
        case PromptsType.instructions:
            return localize('instructions.copy.location.placeholder', "Select a location to copy the instructions file to");
        case PromptsType.prompt:
            return localize('prompt.copy.location.placeholder', "Select a location to copy the prompt file to");
        case PromptsType.agent:
            return localize('agent.copy.location.placeholder', "Select a location to copy the agent file to");
        case PromptsType.skill:
            return localize('skill.copy.location.placeholder', "Select a location to copy the skill to");
        case PromptsType.hook:
            throw new Error('Hooks cannot be copied');
        default:
            throw new Error('Unknown prompt type');
    }
}
/**
 * Shows a dialog to the user when no prompt source folders are found.
 *
 * Note! this is a temporary solution and must be replaced with a dialog to select
 *       a custom folder path, or switch to a different prompt type
 */
async function showNoFoldersDialog(accessor, type) {
    const quickInputService = accessor.get(IQuickInputService);
    const openerService = accessor.get(IOpenerService);
    const docsQuickPick = {
        type: 'item',
        label: getLearnLabel(type),
        description: PROMPT_DOCUMENTATION_URL,
        tooltip: PROMPT_DOCUMENTATION_URL,
        value: URI.parse(PROMPT_DOCUMENTATION_URL),
    };
    const result = await quickInputService.pick([docsQuickPick], {
        placeHolder: getMissingSourceFolderString(type),
        canPickMany: false,
    });
    if (result) {
        await openerService.open(result.value);
    }
}
function getLearnLabel(type) {
    switch (type) {
        case PromptsType.prompt:
            return localize('commands.prompts.create.ask-folder.empty.docs-label', 'Learn how to configure reusable prompts');
        case PromptsType.instructions:
            return localize('commands.instructions.create.ask-folder.empty.docs-label', 'Learn how to configure reusable instructions');
        case PromptsType.agent:
            return localize('commands.agent.create.ask-folder.empty.docs-label', 'Learn how to configure custom agents');
        case PromptsType.skill:
            return localize('commands.skill.create.ask-folder.empty.docs-label', 'Learn how to configure skills');
        case PromptsType.hook:
            return localize('commands.hook.create.ask-folder.empty.docs-label', 'Learn how to configure hooks');
        default:
            throw new Error('Unknown prompt type');
    }
}
function getMissingSourceFolderString(type) {
    switch (type) {
        case PromptsType.instructions:
            return localize('commands.instructions.create.ask-folder.empty.placeholder', 'No instruction source folders found.');
        case PromptsType.prompt:
            return localize('commands.prompts.create.ask-folder.empty.placeholder', 'No prompt source folders found.');
        case PromptsType.agent:
            return localize('commands.agent.create.ask-folder.empty.placeholder', 'No agent source folders found.');
        case PromptsType.skill:
            return localize('commands.skill.create.ask-folder.empty.placeholder', 'No skill source folders found.');
        case PromptsType.hook:
            return localize('commands.hook.create.ask-folder.empty.placeholder', 'No hook source folders found.');
        default:
            throw new Error('Unknown prompt type');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNrRm9yUHJvbXB0U291cmNlRm9sZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3Byb21wdFN5bnRheC9waWNrZXJzL2Fza0ZvclByb21wdFNvdXJjZUZvbGRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUUzRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsV0FBVyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEcsT0FBTyxFQUFnQixrQkFBa0IsRUFBa0IsTUFBTSw0REFBNEQsQ0FBQztBQUM5SCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUNwRyxPQUFPLEVBQWUsZUFBZSxFQUFFLGNBQWMsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBT3RIOztHQUVHO0FBQ0gsTUFBTSxDQUFDLEtBQUssVUFBVSx3QkFBd0IsQ0FDN0MsUUFBMEIsRUFDMUIsSUFBaUIsRUFDakIsY0FBZ0MsRUFDaEMsU0FBa0IsS0FBSztJQUV2QixNQUFNLG9CQUFvQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQztJQUNqRSxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztJQUMzRCxNQUFNLGNBQWMsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQ3JELE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDakQsTUFBTSxnQkFBZ0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHdCQUF3QixDQUFDLENBQUM7SUFFaEUsc0RBQXNEO0lBQ3RELE1BQU0sT0FBTyxHQUFHLE1BQU0sY0FBYyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDO0lBRTVELHVEQUF1RDtJQUN2RCxrRkFBa0Y7SUFDbEYsbUVBQW1FO0lBQ25FLElBQUksT0FBTyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUMxQixNQUFNLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLG1CQUFtQixDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE9BQU87SUFDUixDQUFDO0lBRUQsTUFBTSxXQUFXLEdBQXVDO1FBQ3ZELFdBQVcsRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDLDJCQUEyQixDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsMEJBQTBCLENBQUMsSUFBSSxDQUFDO1FBQzFHLFdBQVcsRUFBRSxLQUFLO1FBQ2xCLGtCQUFrQixFQUFFLElBQUk7S0FDeEIsQ0FBQztJQUVGLHlDQUF5QztJQUN6QyxNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUF1QixNQUFNLENBQUMsRUFBRTtRQUM5RCxNQUFNLEdBQUcsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDO1FBQ3ZCLE1BQU0sTUFBTSxHQUFHLENBQUMsY0FBYyxJQUFJLE9BQU8sQ0FBQyxHQUFHLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUM3SCxJQUFJLE1BQU0sQ0FBQyxPQUFPLEtBQUssY0FBYyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQzdDLE9BQU87Z0JBQ04sSUFBSSxFQUFFLE1BQU07Z0JBQ1osS0FBSyxFQUFFLGNBQWMsQ0FBQyxzQkFBc0IsQ0FBQyxNQUFNLENBQUM7Z0JBQ3BELE1BQU07Z0JBQ04sT0FBTyxFQUFFLFlBQVksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDO2dCQUN0QyxNQUFNO2FBQ04sQ0FBQztRQUNILENBQUM7UUFFRCxNQUFNLEVBQUUsT0FBTyxFQUFFLEdBQUcsZ0JBQWdCLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDcEQsTUFBTSxvQkFBb0IsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFbEQsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRS9CLDZFQUE2RTtRQUM3RSx1RkFBdUY7UUFDdkYsSUFBSSxvQkFBb0IsSUFBSSxDQUFDLFdBQVcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ25GLE9BQU87Z0JBQ04sSUFBSSxFQUFFLE1BQU07Z0JBQ1osS0FBSyxFQUFFLFlBQVksQ0FBQyxXQUFXLENBQUMsR0FBRyxFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDO2dCQUN4RCxNQUFNO2dCQUNOLE9BQU8sRUFBRSxZQUFZLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQztnQkFDdEMsTUFBTTthQUNOLENBQUM7UUFDSCxDQUFDO1FBRUQscUVBQXFFO1FBQ3JFLHFFQUFxRTtRQUNyRSxPQUFPO1lBQ04sSUFBSSxFQUFFLE1BQU07WUFDWixLQUFLLEVBQUUsUUFBUSxDQUNkLHlEQUF5RCxFQUN6RCxtQkFBbUIsQ0FDbkI7WUFDRCxNQUFNO1lBQ04sT0FBTyxFQUFFLFlBQVksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDO1lBQ3RDLE1BQU07U0FDTixDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxNQUFNLE1BQU0sR0FBRyxNQUFNLGlCQUFpQixDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDdEUsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2IsT0FBTztJQUNSLENBQUM7SUFFRCxPQUFPLE1BQU0sQ0FBQyxNQUFNLENBQUM7QUFDdEIsQ0FBQztBQUVELFNBQVMsMEJBQTBCLENBQUMsSUFBaUI7SUFDcEQsUUFBUSxJQUFJLEVBQUUsQ0FBQztRQUNkLEtBQUssV0FBVyxDQUFDLFlBQVk7WUFDNUIsT0FBTyxRQUFRLENBQUMsNERBQTRELEVBQUUsbURBQW1ELENBQUMsQ0FBQztRQUNwSSxLQUFLLFdBQVcsQ0FBQyxNQUFNO1lBQ3RCLE9BQU8sUUFBUSxDQUFDLHNEQUFzRCxFQUFFLDZDQUE2QyxDQUFDLENBQUM7UUFDeEgsS0FBSyxXQUFXLENBQUMsS0FBSztZQUNyQixPQUFPLFFBQVEsQ0FBQyxxREFBcUQsRUFBRSw0Q0FBNEMsQ0FBQyxDQUFDO1FBQ3RILEtBQUssV0FBVyxDQUFDLEtBQUs7WUFDckIsT0FBTyxRQUFRLENBQUMscURBQXFELEVBQUUsdUNBQXVDLENBQUMsQ0FBQztRQUNqSCxLQUFLLFdBQVcsQ0FBQyxJQUFJO1lBQ3BCLE9BQU8sUUFBUSxDQUFDLG9EQUFvRCxFQUFFLDJDQUEyQyxDQUFDLENBQUM7UUFDcEg7WUFDQyxNQUFNLElBQUksS0FBSyxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFDekMsQ0FBQztBQUNGLENBQUM7QUFFRCxTQUFTLDJCQUEyQixDQUFDLElBQWlCLEVBQUUsTUFBZTtJQUN0RSxJQUFJLE1BQU0sRUFBRSxDQUFDO1FBQ1osUUFBUSxJQUFJLEVBQUUsQ0FBQztZQUNkLEtBQUssV0FBVyxDQUFDLFlBQVk7Z0JBQzVCLE9BQU8sUUFBUSxDQUFDLHdDQUF3QyxFQUFFLG9EQUFvRCxDQUFDLENBQUM7WUFDakgsS0FBSyxXQUFXLENBQUMsTUFBTTtnQkFDdEIsT0FBTyxRQUFRLENBQUMsa0NBQWtDLEVBQUUsOENBQThDLENBQUMsQ0FBQztZQUNyRyxLQUFLLFdBQVcsQ0FBQyxLQUFLO2dCQUNyQixPQUFPLFFBQVEsQ0FBQyxpQ0FBaUMsRUFBRSw2Q0FBNkMsQ0FBQyxDQUFDO1lBQ25HLEtBQUssV0FBVyxDQUFDLEtBQUs7Z0JBQ3JCLE9BQU8sUUFBUSxDQUFDLGlDQUFpQyxFQUFFLHdDQUF3QyxDQUFDLENBQUM7WUFDOUYsS0FBSyxXQUFXLENBQUMsSUFBSTtnQkFDcEIsTUFBTSxJQUFJLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1lBQzFDO2dCQUNDLE1BQU0sSUFBSSxLQUFLLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQUN6QyxDQUFDO0lBQ0YsQ0FBQztJQUNELFFBQVEsSUFBSSxFQUFFLENBQUM7UUFDZCxLQUFLLFdBQVcsQ0FBQyxZQUFZO1lBQzVCLE9BQU8sUUFBUSxDQUFDLHdDQUF3QyxFQUFFLG9EQUFvRCxDQUFDLENBQUM7UUFDakgsS0FBSyxXQUFXLENBQUMsTUFBTTtZQUN0QixPQUFPLFFBQVEsQ0FBQyxrQ0FBa0MsRUFBRSw4Q0FBOEMsQ0FBQyxDQUFDO1FBQ3JHLEtBQUssV0FBVyxDQUFDLEtBQUs7WUFDckIsT0FBTyxRQUFRLENBQUMsaUNBQWlDLEVBQUUsNkNBQTZDLENBQUMsQ0FBQztRQUNuRyxLQUFLLFdBQVcsQ0FBQyxLQUFLO1lBQ3JCLE9BQU8sUUFBUSxDQUFDLGlDQUFpQyxFQUFFLHdDQUF3QyxDQUFDLENBQUM7UUFDOUYsS0FBSyxXQUFXLENBQUMsSUFBSTtZQUNwQixNQUFNLElBQUksS0FBSyxDQUFDLHdCQUF3QixDQUFDLENBQUM7UUFDM0M7WUFDQyxNQUFNLElBQUksS0FBSyxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFDekMsQ0FBQztBQUNGLENBQUM7QUFFRDs7Ozs7R0FLRztBQUNILEtBQUssVUFBVSxtQkFBbUIsQ0FBQyxRQUEwQixFQUFFLElBQWlCO0lBQy9FLE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0lBQzNELE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7SUFFbkQsTUFBTSxhQUFhLEdBQW9DO1FBQ3RELElBQUksRUFBRSxNQUFNO1FBQ1osS0FBSyxFQUFFLGFBQWEsQ0FBQyxJQUFJLENBQUM7UUFDMUIsV0FBVyxFQUFFLHdCQUF3QjtRQUNyQyxPQUFPLEVBQUUsd0JBQXdCO1FBQ2pDLEtBQUssRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLHdCQUF3QixDQUFDO0tBQzFDLENBQUM7SUFFRixNQUFNLE1BQU0sR0FBRyxNQUFNLGlCQUFpQixDQUFDLElBQUksQ0FDMUMsQ0FBQyxhQUFhLENBQUMsRUFDZjtRQUNDLFdBQVcsRUFBRSw0QkFBNEIsQ0FBQyxJQUFJLENBQUM7UUFDL0MsV0FBVyxFQUFFLEtBQUs7S0FDbEIsQ0FBQyxDQUFDO0lBRUosSUFBSSxNQUFNLEVBQUUsQ0FBQztRQUNaLE1BQU0sYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDeEMsQ0FBQztBQUNGLENBQUM7QUFFRCxTQUFTLGFBQWEsQ0FBQyxJQUFpQjtJQUN2QyxRQUFRLElBQUksRUFBRSxDQUFDO1FBQ2QsS0FBSyxXQUFXLENBQUMsTUFBTTtZQUN0QixPQUFPLFFBQVEsQ0FBQyxxREFBcUQsRUFBRSx5Q0FBeUMsQ0FBQyxDQUFDO1FBQ25ILEtBQUssV0FBVyxDQUFDLFlBQVk7WUFDNUIsT0FBTyxRQUFRLENBQUMsMERBQTBELEVBQUUsOENBQThDLENBQUMsQ0FBQztRQUM3SCxLQUFLLFdBQVcsQ0FBQyxLQUFLO1lBQ3JCLE9BQU8sUUFBUSxDQUFDLG1EQUFtRCxFQUFFLHNDQUFzQyxDQUFDLENBQUM7UUFDOUcsS0FBSyxXQUFXLENBQUMsS0FBSztZQUNyQixPQUFPLFFBQVEsQ0FBQyxtREFBbUQsRUFBRSwrQkFBK0IsQ0FBQyxDQUFDO1FBQ3ZHLEtBQUssV0FBVyxDQUFDLElBQUk7WUFDcEIsT0FBTyxRQUFRLENBQUMsa0RBQWtELEVBQUUsOEJBQThCLENBQUMsQ0FBQztRQUNyRztZQUNDLE1BQU0sSUFBSSxLQUFLLENBQUMscUJBQXFCLENBQUMsQ0FBQztJQUN6QyxDQUFDO0FBQ0YsQ0FBQztBQUVELFNBQVMsNEJBQTRCLENBQUMsSUFBaUI7SUFDdEQsUUFBUSxJQUFJLEVBQUUsQ0FBQztRQUNkLEtBQUssV0FBVyxDQUFDLFlBQVk7WUFDNUIsT0FBTyxRQUFRLENBQUMsMkRBQTJELEVBQUUsc0NBQXNDLENBQUMsQ0FBQztRQUN0SCxLQUFLLFdBQVcsQ0FBQyxNQUFNO1lBQ3RCLE9BQU8sUUFBUSxDQUFDLHNEQUFzRCxFQUFFLGlDQUFpQyxDQUFDLENBQUM7UUFDNUcsS0FBSyxXQUFXLENBQUMsS0FBSztZQUNyQixPQUFPLFFBQVEsQ0FBQyxvREFBb0QsRUFBRSxnQ0FBZ0MsQ0FBQyxDQUFDO1FBQ3pHLEtBQUssV0FBVyxDQUFDLEtBQUs7WUFDckIsT0FBTyxRQUFRLENBQUMsb0RBQW9ELEVBQUUsZ0NBQWdDLENBQUMsQ0FBQztRQUN6RyxLQUFLLFdBQVcsQ0FBQyxJQUFJO1lBQ3BCLE9BQU8sUUFBUSxDQUFDLG1EQUFtRCxFQUFFLCtCQUErQixDQUFDLENBQUM7UUFDdkc7WUFDQyxNQUFNLElBQUksS0FBSyxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFDekMsQ0FBQztBQUNGLENBQUMifQ==