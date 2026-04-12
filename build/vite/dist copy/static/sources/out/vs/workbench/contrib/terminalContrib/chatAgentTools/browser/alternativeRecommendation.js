/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
let previouslyRecommededInSession = false;
const terminalCommands = [
    {
        commands: [
            new RegExp(/^python3? -m pip install(\b)/),
            new RegExp(/^pip3? install(\b)/),
        ],
        tags: ['python environment'],
    },
    {
        commands: [
            new RegExp(/^python3? -m jupyter(\b)/),
            new RegExp(/^python3? -m pip install\b.*jupyter\b.*/),
            new RegExp(/^pip3? install\b.*jupyter\b.*/),
            new RegExp(/^jupyter(\b)/), // jupyter lab, jupyer notebook, jupyter nbconvert, etc.
        ],
        tags: ['python environment', 'jupyter environment'],
    }
];
export function getRecommendedToolsOverRunInTerminal(commandLine, languageModelToolsService) {
    const tools = languageModelToolsService.getTools(undefined);
    if (!tools || previouslyRecommededInSession) {
        return;
    }
    const recommendedTools = new Set();
    const messages = [
        `The terminal command '${commandLine}' was not executed.`,
        `Try using some of the following tools instead of running a Terminal Command (if unable to use one of these tools as an alternative then run the same terminal command again):`,
    ];
    for (const terminalCommand of terminalCommands) {
        if (!terminalCommand.commands.some((condition) => condition.test(commandLine))) {
            continue;
        }
        const tagsToSearchFor = terminalCommand.tags;
        Array.from(tools)
            .filter(t => tagsToSearchFor.some(tag => t.tags?.includes(tag)))
            .forEach(tool => {
            recommendedTools.add(tool.id);
        });
    }
    recommendedTools.forEach(toolName => {
        messages.push(`- ${toolName}`);
    });
    if (recommendedTools.size) {
        previouslyRecommededInSession = true;
        return messages.join('  \n');
    }
    return undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWx0ZXJuYXRpdmVSZWNvbW1lbmRhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL2FsdGVybmF0aXZlUmVjb21tZW5kYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsSUFBSSw2QkFBNkIsR0FBRyxLQUFLLENBQUM7QUFFMUMsTUFBTSxnQkFBZ0IsR0FBNkM7SUFDbEU7UUFDQyxRQUFRLEVBQUU7WUFDVCxJQUFJLE1BQU0sQ0FBQyw4QkFBOEIsQ0FBQztZQUMxQyxJQUFJLE1BQU0sQ0FBQyxvQkFBb0IsQ0FBQztTQUNoQztRQUNELElBQUksRUFBRSxDQUFDLG9CQUFvQixDQUFDO0tBQzVCO0lBQ0Q7UUFDQyxRQUFRLEVBQUU7WUFDVCxJQUFJLE1BQU0sQ0FBQywwQkFBMEIsQ0FBQztZQUN0QyxJQUFJLE1BQU0sQ0FBQyx5Q0FBeUMsQ0FBQztZQUNyRCxJQUFJLE1BQU0sQ0FBQywrQkFBK0IsQ0FBQztZQUMzQyxJQUFJLE1BQU0sQ0FBQyxjQUFjLENBQUMsRUFBRSx3REFBd0Q7U0FDcEY7UUFDRCxJQUFJLEVBQUUsQ0FBQyxvQkFBb0IsRUFBRSxxQkFBcUIsQ0FBQztLQUNuRDtDQUNELENBQUM7QUFFRixNQUFNLFVBQVUsb0NBQW9DLENBQUMsV0FBbUIsRUFBRSx5QkFBcUQ7SUFDOUgsTUFBTSxLQUFLLEdBQUcseUJBQXlCLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQzVELElBQUksQ0FBQyxLQUFLLElBQUksNkJBQTZCLEVBQUUsQ0FBQztRQUM3QyxPQUFPO0lBQ1IsQ0FBQztJQUVELE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxHQUFHLEVBQVUsQ0FBQztJQUMzQyxNQUFNLFFBQVEsR0FBYTtRQUMxQix5QkFBeUIsV0FBVyxxQkFBcUI7UUFDekQsK0tBQStLO0tBQy9LLENBQUM7SUFDRixLQUFLLE1BQU0sZUFBZSxJQUFJLGdCQUFnQixFQUFFLENBQUM7UUFDaEQsSUFBSSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUNoRixTQUFTO1FBQ1YsQ0FBQztRQUNELE1BQU0sZUFBZSxHQUFHLGVBQWUsQ0FBQyxJQUFJLENBQUM7UUFDN0MsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7YUFDZixNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQzthQUMvRCxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDZixnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQy9CLENBQUMsQ0FBQyxDQUFDO0lBRUwsQ0FBQztJQUNELGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRTtRQUNuQyxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssUUFBUSxFQUFFLENBQUMsQ0FBQztJQUNoQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksZ0JBQWdCLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDM0IsNkJBQTZCLEdBQUcsSUFBSSxDQUFDO1FBQ3JDLE9BQU8sUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUM5QixDQUFDO0lBRUQsT0FBTyxTQUFTLENBQUM7QUFDbEIsQ0FBQyJ9