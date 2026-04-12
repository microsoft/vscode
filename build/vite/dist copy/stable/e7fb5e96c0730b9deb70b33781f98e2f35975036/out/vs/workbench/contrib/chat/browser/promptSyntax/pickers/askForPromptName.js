/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../../../nls.js';
import { getPromptFileExtension } from '../../../common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import Severity from '../../../../../../base/common/severity.js';
import { isValidBasename } from '../../../../../../base/common/extpath.js';
/**
 * Asks the user for a file name.
 */
export async function askForPromptFileName(accessor, type, selectedFolder, existingFileName, fileExtensionOverride) {
    const quickInputService = accessor.get(IQuickInputService);
    const fileService = accessor.get(IFileService);
    const sanitizeInput = (input) => {
        const trimmedName = input.trim();
        if (!trimmedName) {
            return undefined;
        }
        const fileExtension = fileExtensionOverride ?? getPromptFileExtension(type);
        return (trimmedName.endsWith(fileExtension))
            ? trimmedName
            : `${trimmedName}${fileExtension}`;
    };
    const validateInput = async (value) => {
        const fileName = sanitizeInput(value);
        if (!fileName) {
            return {
                content: localize('askForPromptFileName.error.empty', "Please enter a name."),
                severity: Severity.Warning
            };
        }
        if (!isValidBasename(fileName)) {
            return {
                content: localize('askForPromptFileName.error.invalid', "The name contains invalid characters."),
                severity: Severity.Error
            };
        }
        const fileUri = URI.joinPath(selectedFolder, fileName);
        if (await fileService.exists(fileUri)) {
            return {
                content: localize('askForPromptFileName.error.exists', "A file for the given name already exists."),
                severity: Severity.Error
            };
        }
        return undefined;
    };
    const placeHolder = existingFileName ? getPlaceholderStringForRename(type) : getPlaceholderStringForNew(type);
    const result = await quickInputService.input({ placeHolder, validateInput, value: existingFileName });
    if (!result) {
        return undefined;
    }
    return sanitizeInput(result);
}
function getPlaceholderStringForNew(type) {
    switch (type) {
        case PromptsType.instructions:
            return localize('askForInstructionsFileName.placeholder', "Enter the name of the instructions file");
        case PromptsType.prompt:
            return localize('askForPromptFileName.placeholder', "Enter the name of the prompt file");
        case PromptsType.agent:
            return localize('askForAgentFileName.placeholder', "Enter the name of the agent file");
        default:
            throw new Error('Unknown prompt type');
    }
}
function getPlaceholderStringForRename(type) {
    switch (type) {
        case PromptsType.instructions:
            return localize('askForRenamedInstructionsFileName.placeholder', "Enter a new name of the instructions file");
        case PromptsType.prompt:
            return localize('askForRenamedPromptFileName.placeholder', "Enter a new name of the prompt file");
        case PromptsType.agent:
            return localize('askForRenamedAgentFileName.placeholder', "Enter a new name of the agent file");
        default:
            throw new Error('Unknown prompt type');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNrRm9yUHJvbXB0TmFtZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9wcm9tcHRTeW50YXgvcGlja2Vycy9hc2tGb3JQcm9tcHROYW1lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNwRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDMUUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDaEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNoRixPQUFPLFFBQVEsTUFBTSwyQ0FBMkMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFHM0U7O0dBRUc7QUFDSCxNQUFNLENBQUMsS0FBSyxVQUFVLG9CQUFvQixDQUN6QyxRQUEwQixFQUMxQixJQUFpQixFQUNqQixjQUFtQixFQUNuQixnQkFBeUIsRUFDekIscUJBQThCO0lBRTlCLE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0lBQzNELE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7SUFFL0MsTUFBTSxhQUFhLEdBQUcsQ0FBQyxLQUFhLEVBQUUsRUFBRTtRQUN2QyxNQUFNLFdBQVcsR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDakMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxNQUFNLGFBQWEsR0FBRyxxQkFBcUIsSUFBSSxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM1RSxPQUFPLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUMzQyxDQUFDLENBQUMsV0FBVztZQUNiLENBQUMsQ0FBQyxHQUFHLFdBQVcsR0FBRyxhQUFhLEVBQUUsQ0FBQztJQUNyQyxDQUFDLENBQUM7SUFFRixNQUFNLGFBQWEsR0FBRyxLQUFLLEVBQUUsS0FBYSxFQUFFLEVBQUU7UUFDN0MsTUFBTSxRQUFRLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3RDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLE9BQU87Z0JBQ04sT0FBTyxFQUFFLFFBQVEsQ0FBQyxrQ0FBa0MsRUFBRSxzQkFBc0IsQ0FBQztnQkFDN0UsUUFBUSxFQUFFLFFBQVEsQ0FBQyxPQUFPO2FBQzFCLENBQUM7UUFDSCxDQUFDO1FBRUQsSUFBSSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQ2hDLE9BQU87Z0JBQ04sT0FBTyxFQUFFLFFBQVEsQ0FBQyxvQ0FBb0MsRUFBRSx1Q0FBdUMsQ0FBQztnQkFDaEcsUUFBUSxFQUFFLFFBQVEsQ0FBQyxLQUFLO2FBQ3hCLENBQUM7UUFDSCxDQUFDO1FBRUQsTUFBTSxPQUFPLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxjQUFjLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDdkQsSUFBSSxNQUFNLFdBQVcsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUN2QyxPQUFPO2dCQUNOLE9BQU8sRUFBRSxRQUFRLENBQUMsbUNBQW1DLEVBQUUsMkNBQTJDLENBQUM7Z0JBQ25HLFFBQVEsRUFBRSxRQUFRLENBQUMsS0FBSzthQUN4QixDQUFDO1FBQ0gsQ0FBQztRQUVELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUMsQ0FBQztJQUNGLE1BQU0sV0FBVyxHQUFHLGdCQUFnQixDQUFDLENBQUMsQ0FBQyw2QkFBNkIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsMEJBQTBCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDOUcsTUFBTSxNQUFNLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxDQUFDLENBQUM7SUFDdEcsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2IsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVELE9BQU8sYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQzlCLENBQUM7QUFFRCxTQUFTLDBCQUEwQixDQUFDLElBQWlCO0lBQ3BELFFBQVEsSUFBSSxFQUFFLENBQUM7UUFDZCxLQUFLLFdBQVcsQ0FBQyxZQUFZO1lBQzVCLE9BQU8sUUFBUSxDQUFDLHdDQUF3QyxFQUFFLHlDQUF5QyxDQUFDLENBQUM7UUFDdEcsS0FBSyxXQUFXLENBQUMsTUFBTTtZQUN0QixPQUFPLFFBQVEsQ0FBQyxrQ0FBa0MsRUFBRSxtQ0FBbUMsQ0FBQyxDQUFDO1FBQzFGLEtBQUssV0FBVyxDQUFDLEtBQUs7WUFDckIsT0FBTyxRQUFRLENBQUMsaUNBQWlDLEVBQUUsa0NBQWtDLENBQUMsQ0FBQztRQUN4RjtZQUNDLE1BQU0sSUFBSSxLQUFLLENBQUMscUJBQXFCLENBQUMsQ0FBQztJQUN6QyxDQUFDO0FBQ0YsQ0FBQztBQUVELFNBQVMsNkJBQTZCLENBQUMsSUFBaUI7SUFDdkQsUUFBUSxJQUFJLEVBQUUsQ0FBQztRQUNkLEtBQUssV0FBVyxDQUFDLFlBQVk7WUFDNUIsT0FBTyxRQUFRLENBQUMsK0NBQStDLEVBQUUsMkNBQTJDLENBQUMsQ0FBQztRQUMvRyxLQUFLLFdBQVcsQ0FBQyxNQUFNO1lBQ3RCLE9BQU8sUUFBUSxDQUFDLHlDQUF5QyxFQUFFLHFDQUFxQyxDQUFDLENBQUM7UUFDbkcsS0FBSyxXQUFXLENBQUMsS0FBSztZQUNyQixPQUFPLFFBQVEsQ0FBQyx3Q0FBd0MsRUFBRSxvQ0FBb0MsQ0FBQyxDQUFDO1FBQ2pHO1lBQ0MsTUFBTSxJQUFJLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0lBQ3pDLENBQUM7QUFDRixDQUFDIn0=