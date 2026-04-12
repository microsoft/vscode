/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { revive } from '../../../../../base/common/marshalling.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { reviveSerializedAgent } from '../participants/chatAgents.js';
import { IDiagnosticVariableEntryFilterData } from '../attachments/chatVariableEntries.js';
import { arrayEquals } from '../../../../../base/common/equals.js';
export var IParsedChatRequest;
(function (IParsedChatRequest) {
    function equals(a, b) {
        return a.text === b.text && arrayEquals(a.parts, b.parts, (p1, p2) => p1.kind === p2.kind &&
            OffsetRange.equals(p1.range, p2.range) &&
            Range.equalsRange(p1.editorRange, p2.editorRange) &&
            p1.text === p2.text);
    }
    IParsedChatRequest.equals = equals;
})(IParsedChatRequest || (IParsedChatRequest = {}));
export function getPromptText(request) {
    const message = request.parts.map(r => r.promptText).join('').trimStart();
    const diff = request.text.length - message.length;
    return { message, diff };
}
export class ChatRequestTextPart {
    static { this.Kind = 'text'; }
    constructor(range, editorRange, text) {
        this.range = range;
        this.editorRange = editorRange;
        this.text = text;
        this.kind = ChatRequestTextPart.Kind;
    }
    get promptText() {
        return this.text;
    }
}
// warning, these also show up in a regex in the parser
export const chatVariableLeader = '#';
export const chatAgentLeader = '@';
export const chatSubcommandLeader = '/';
/**
 * An invocation of a static variable that can be resolved by the variable service
 * @deprecated, but kept for backwards compatibility with old persisted chat requests
 */
class ChatRequestVariablePart {
    static { this.Kind = 'var'; }
    constructor(range, editorRange, variableName, variableArg, variableId) {
        this.range = range;
        this.editorRange = editorRange;
        this.variableName = variableName;
        this.variableArg = variableArg;
        this.variableId = variableId;
        this.kind = ChatRequestVariablePart.Kind;
    }
    get text() {
        const argPart = this.variableArg ? `:${this.variableArg}` : '';
        return `${chatVariableLeader}${this.variableName}${argPart}`;
    }
    get promptText() {
        return this.text;
    }
}
/**
 * An invocation of a tool
 */
export class ChatRequestToolPart {
    static { this.Kind = 'tool'; }
    constructor(range, editorRange, toolName, toolId, displayName, icon) {
        this.range = range;
        this.editorRange = editorRange;
        this.toolName = toolName;
        this.toolId = toolId;
        this.displayName = displayName;
        this.icon = icon;
        this.kind = ChatRequestToolPart.Kind;
    }
    get text() {
        return `${chatVariableLeader}${this.toolName}`;
    }
    get promptText() {
        return this.text;
    }
    toVariableEntry() {
        return { kind: 'tool', id: this.toolId, name: this.toolName, range: this.range, value: undefined, icon: ThemeIcon.isThemeIcon(this.icon) ? this.icon : undefined, fullName: this.displayName };
    }
}
/**
 * An invocation of a tool
 */
export class ChatRequestToolSetPart {
    static { this.Kind = 'toolset'; }
    constructor(range, editorRange, id, name, icon, tools) {
        this.range = range;
        this.editorRange = editorRange;
        this.id = id;
        this.name = name;
        this.icon = icon;
        this.tools = tools;
        this.kind = ChatRequestToolSetPart.Kind;
    }
    get text() {
        return `${chatVariableLeader}${this.name}`;
    }
    get promptText() {
        return this.text;
    }
    toVariableEntry() {
        return { kind: 'toolset', id: this.id, name: this.name, range: this.range, icon: this.icon, value: this.tools };
    }
}
/**
 * An invocation of an agent that can be resolved by the agent service
 */
export class ChatRequestAgentPart {
    static { this.Kind = 'agent'; }
    constructor(range, editorRange, agent) {
        this.range = range;
        this.editorRange = editorRange;
        this.agent = agent;
        this.kind = ChatRequestAgentPart.Kind;
    }
    get text() {
        return `${chatAgentLeader}${this.agent.name}`;
    }
    get promptText() {
        return '';
    }
}
/**
 * An invocation of an agent's subcommand
 */
export class ChatRequestAgentSubcommandPart {
    static { this.Kind = 'subcommand'; }
    constructor(range, editorRange, command) {
        this.range = range;
        this.editorRange = editorRange;
        this.command = command;
        this.kind = ChatRequestAgentSubcommandPart.Kind;
    }
    get text() {
        return `${chatSubcommandLeader}${this.command.name}`;
    }
    get promptText() {
        return '';
    }
}
/**
 * An invocation of a standalone slash command
 */
export class ChatRequestSlashCommandPart {
    static { this.Kind = 'slash'; }
    constructor(range, editorRange, slashCommand) {
        this.range = range;
        this.editorRange = editorRange;
        this.slashCommand = slashCommand;
        this.kind = ChatRequestSlashCommandPart.Kind;
    }
    get text() {
        return `${chatSubcommandLeader}${this.slashCommand.command}`;
    }
    get promptText() {
        return `${chatSubcommandLeader}${this.slashCommand.command}`;
    }
}
/**
 * An invocation of a standalone slash command
 */
export class ChatRequestSlashPromptPart {
    static { this.Kind = 'prompt'; }
    constructor(range, editorRange, name) {
        this.range = range;
        this.editorRange = editorRange;
        this.name = name;
        this.kind = ChatRequestSlashPromptPart.Kind;
    }
    get text() {
        return `${chatSubcommandLeader}${this.name}`;
    }
    get promptText() {
        return `${chatSubcommandLeader}${this.name}`;
    }
}
/**
 * An invocation of a dynamic reference like '#file:'
 */
export class ChatRequestDynamicVariablePart {
    static { this.Kind = 'dynamic'; }
    constructor(range, editorRange, text, id, modelDescription, data, fullName, icon, isFile, isDirectory) {
        this.range = range;
        this.editorRange = editorRange;
        this.text = text;
        this.id = id;
        this.modelDescription = modelDescription;
        this.data = data;
        this.fullName = fullName;
        this.icon = icon;
        this.isFile = isFile;
        this.isDirectory = isDirectory;
        this.kind = ChatRequestDynamicVariablePart.Kind;
    }
    get referenceText() {
        return this.text.replace(chatVariableLeader, '');
    }
    get promptText() {
        return this.text;
    }
    toVariableEntry() {
        if (this.id === 'vscode.problems') {
            return IDiagnosticVariableEntryFilterData.toEntry(this.data.filter);
        }
        return { kind: this.isDirectory ? 'directory' : this.isFile ? 'file' : 'generic', id: this.id, name: this.referenceText, range: this.range, value: this.data, fullName: this.fullName, icon: this.icon };
    }
}
export function reviveParsedChatRequest(serialized) {
    return {
        text: serialized.text,
        parts: serialized.parts.map(part => {
            if (part.kind === ChatRequestTextPart.Kind) {
                return new ChatRequestTextPart(new OffsetRange(part.range.start, part.range.endExclusive), part.editorRange, part.text);
            }
            else if (part.kind === ChatRequestVariablePart.Kind) {
                return new ChatRequestVariablePart(new OffsetRange(part.range.start, part.range.endExclusive), part.editorRange, part.variableName, part.variableArg, part.variableId || '');
            }
            else if (part.kind === ChatRequestToolPart.Kind) {
                return new ChatRequestToolPart(new OffsetRange(part.range.start, part.range.endExclusive), part.editorRange, part.toolName, part.toolId, part.displayName, part.icon);
            }
            else if (part.kind === ChatRequestToolSetPart.Kind) {
                return new ChatRequestToolSetPart(new OffsetRange(part.range.start, part.range.endExclusive), part.editorRange, part.id, part.name, part.icon, part.tools ?? []);
            }
            else if (part.kind === ChatRequestAgentPart.Kind) {
                let agent = part.agent;
                agent = reviveSerializedAgent(agent);
                return new ChatRequestAgentPart(new OffsetRange(part.range.start, part.range.endExclusive), part.editorRange, agent);
            }
            else if (part.kind === ChatRequestAgentSubcommandPart.Kind) {
                return new ChatRequestAgentSubcommandPart(new OffsetRange(part.range.start, part.range.endExclusive), part.editorRange, part.command);
            }
            else if (part.kind === ChatRequestSlashCommandPart.Kind) {
                return new ChatRequestSlashCommandPart(new OffsetRange(part.range.start, part.range.endExclusive), part.editorRange, part.slashCommand);
            }
            else if (part.kind === ChatRequestSlashPromptPart.Kind) {
                return new ChatRequestSlashPromptPart(new OffsetRange(part.range.start, part.range.endExclusive), part.editorRange, part.name);
            }
            else if (part.kind === ChatRequestDynamicVariablePart.Kind) {
                return new ChatRequestDynamicVariablePart(new OffsetRange(part.range.start, part.range.endExclusive), part.editorRange, part.text, part.id, part.modelDescription, revive(part.data), part.fullName, part.icon, part.isFile, part.isDirectory);
            }
            else {
                throw new Error(`Unknown chat request part: ${part.kind}`);
            }
        })
    };
}
export function extractAgentAndCommand(parsed) {
    const agentPart = parsed.parts.find((r) => r instanceof ChatRequestAgentPart);
    const commandPart = parsed.parts.find((r) => r instanceof ChatRequestAgentSubcommandPart);
    return { agentPart, commandPart };
}
export function formatChatQuestion(chatAgentService, location, prompt, participant = null, command = null) {
    let question = '';
    if (participant && participant !== chatAgentService.getDefaultAgent(location)?.id) {
        const agent = chatAgentService.getAgent(participant);
        if (!agent) {
            // Refers to agent that doesn't exist
            return undefined;
        }
        question += `${chatAgentLeader}${agent.name} `;
        if (command) {
            question += `${chatSubcommandLeader}${command} `;
        }
    }
    return question + prompt;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFBhcnNlclR5cGVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UGFyc2VyVHlwZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNwRSxPQUFPLEVBQWdCLFdBQVcsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3BHLE9BQU8sRUFBVSxLQUFLLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMzRSxPQUFPLEVBQXdELHFCQUFxQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFLNUgsT0FBTyxFQUE4RSxrQ0FBa0MsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3ZLLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQVNuRSxNQUFNLEtBQVcsa0JBQWtCLENBU2xDO0FBVEQsV0FBaUIsa0JBQWtCO0lBQ2xDLFNBQWdCLE1BQU0sQ0FBQyxDQUFxQixFQUFFLENBQXFCO1FBQ2xFLE9BQU8sQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsSUFBSSxJQUFJLFdBQVcsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FDcEUsRUFBRSxDQUFDLElBQUksS0FBSyxFQUFFLENBQUMsSUFBSTtZQUNuQixXQUFXLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQztZQUN0QyxLQUFLLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFD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