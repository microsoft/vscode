/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter, Event } from '../../../../../../../base/common/event.js';
export class MockPromptsService {
    constructor() {
        this._onDidChangeCustomAgents = new Emitter();
        this.onDidChangeCustomAgents = this._onDidChangeCustomAgents.event;
        this._customModes = [];
        this.onDidChangeInstructions = Event.None;
        this.onDidChangePromptFiles = Event.None;
        this.onDidChangeSkills = Event.None;
    }
    setCustomModes(modes) {
        this._customModes = modes;
        this._onDidChangeCustomAgents.fire();
    }
    async getCustomAgents(token) {
        return this._customModes;
    }
    // Stub implementations for required interface methods
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSyntaxParserFor(_model) { throw new Error('Not implemented'); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listPromptFiles(_type) { throw new Error('Not implemented'); }
    listPromptFilesForStorage(type, storage, token) { throw new Error('Not implemented'); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSourceFolders(_type) { throw new Error('Not implemented'); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getResolvedSourceFolders(_type) { throw new Error('Not implemented'); }
    isValidSlashCommandName(_command) { return false; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolvePromptSlashCommand(command, _token) { throw new Error('Not implemented'); }
    get onDidChangeSlashCommands() { throw new Error('Not implemented'); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getPromptSlashCommands(_token) { throw new Error('Not implemented'); }
    getPromptSlashCommandName(uri, _token) { throw new Error('Not implemented'); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse(_uri, _type, _token) { throw new Error('Not implemented'); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parseNew(_uri, _token) { throw new Error('Not implemented'); }
    getParsedPromptFile(textModel) { throw new Error('Not implemented'); }
    registerContributedFile(type, uri, extension, name, description, when) { throw new Error('Not implemented'); }
    getPromptLocationLabel(promptPath) { throw new Error('Not implemented'); }
    listNestedAgentMDs(token) { throw new Error('Not implemented'); }
    listAgentInstructions(token) { throw new Error('Not implemented'); }
    getAgentFileURIFromModeFile(oldURI) { throw new Error('Not implemented'); }
    getDisabledPromptFiles(type) { throw new Error('Method not implemented.'); }
    setDisabledPromptFiles(type, uris) { throw new Error('Method not implemented.'); }
    registerPromptFileProvider(extension, type, provider) { throw new Error('Method not implemented.'); }
    findAgentSkills(token) { throw new Error('Method not implemented.'); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getHooks(_token) { throw new Error('Method not implemented.'); }
    getInstructionFiles(_token) { throw new Error('Method not implemented.'); }
    getDiscoveryInfo(_type, _token) { throw new Error('Method not implemented.'); }
    dispose() { }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9ja1Byb21wdHNTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9tb2NrUHJvbXB0c1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQVUzRSxNQUFNLE9BQU8sa0JBQWtCO0lBQS9CO1FBSWtCLDZCQUF3QixHQUFHLElBQUksT0FBTyxFQUFRLENBQUM7UUFDdkQsNEJBQXVCLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEtBQUssQ0FBQztRQUUvRCxpQkFBWSxHQUFtQixFQUFFLENBQUM7UUErQzFDLDRCQUF1QixHQUFnQixLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ2xELDJCQUFzQixHQUFnQixLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ2pELHNCQUFpQixHQUFnQixLQUFLLENBQUMsSUFBSSxDQUFDO0lBQzdDLENBQUM7SUFoREEsY0FBYyxDQUFDLEtBQXFCO1FBQ25DLElBQUksQ0FBQyxZQUFZLEdBQUcsS0FBSyxDQUFDO1FBQzFCLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUN0QyxDQUFDO0lBRUQsS0FBSyxDQUFDLGVBQWUsQ0FBQyxLQUF3QjtRQUM3QyxPQUFPLElBQUksQ0FBQyxZQUFZLENBQUM7SUFDMUIsQ0FBQztJQUVELHNEQUFzRDtJQUN0RCw4REFBOEQ7SUFDOUQsa0JBQWtCLENBQUMsTUFBVyxJQUFTLE1BQU0sSUFBSSxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDNUUsOERBQThEO0lBQzlELGVBQWUsQ0FBQyxLQUFVLElBQTZCLE1BQU0sSUFBSSxLQUFLLENB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