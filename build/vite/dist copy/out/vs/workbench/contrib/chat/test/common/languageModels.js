/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
export class NullLanguageModelsService {
    constructor() {
        this.onDidChangeLanguageModels = Event.None;
        this.onDidChangeLanguageModelVendors = Event.None;
        this.onDidChangeModelsControlManifest = Event.None;
        this.restrictedChatParticipants = observableValue('restrictedChatParticipants', Object.create(null));
    }
    registerLanguageModelProvider(vendor, provider) {
        return Disposable.None;
    }
    deltaLanguageModelChatProviderDescriptors(added, removed) {
    }
    updateModelPickerPreference(modelIdentifier, showInModelPicker) {
        return;
    }
    getVendors() {
        return [];
    }
    getLanguageModelIds() {
        return [];
    }
    lookupLanguageModel(identifier) {
        return undefined;
    }
    lookupLanguageModelByQualifiedName(qualifiedName) {
        return undefined;
    }
    getLanguageModels() {
        return [];
    }
    setContributedSessionModels() {
        return;
    }
    clearContributedSessionModels() {
        return;
    }
    getLanguageModelGroups(vendor) {
        return [];
    }
    async selectLanguageModels(selector) {
        return [];
    }
    sendChatRequest(identifier, from, messages, options, token) {
        throw new Error('Method not implemented.');
    }
    computeTokenLength(identifier, message, token) {
        throw new Error('Method not implemented.');
    }
    getModelConfiguration(_modelId) {
        return undefined;
    }
    async setModelConfiguration(_modelId, _values) {
    }
    getModelConfigurationActions(_modelId) {
        return [];
    }
    async configureLanguageModelsProviderGroup(vendorId, name) {
    }
    async configureModel(_modelId) {
    }
    async addLanguageModelsProviderGroup(name, vendorId, configuration) {
    }
    async removeLanguageModelsProviderGroup(vendorId, providerGroupName) {
    }
    async migrateLanguageModelsProviderGroup(languageModelsProviderGroup) { }
    getRecentlyUsedModelIds() {
        return [];
    }
    addToRecentlyUsedList() { }
    clearRecentlyUsedList() { }
    getModelsControlManifest() {
        return { free: {}, paid: {} };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VNb2RlbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL2xhbmd1YWdlTW9kZWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0seUNBQXlDLENBQUM7QUFDbEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBTTNFLE1BQU0sT0FBTyx5QkFBeUI7SUFBdEM7UUFVQyw4QkFBeUIsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3ZDLG9DQUErQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDN0MscUNBQWdDLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQXdGOUMsK0JBQTBCLEdBQUcsZUFBZSxDQUFDLDRCQUE0QixFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUNqRyxDQUFDO0lBbEdBLDZCQUE2QixDQUFDLE1BQWMsRUFBRSxRQUFvQztRQUNqRixPQUFPLFVBQVUsQ0FBQyxJQUFJLENBQUM7SUFDeEIsQ0FBQztJQUVELHlDQUF5QyxDQUFDLEtBQW1DLEVBQUUsT0FBcUM7SUFDcEgsQ0FBQztJQU1ELDJCQUEyQixDQUFDLGVBQXVCLEVBQUUsaUJBQTBCO1FBQzlFLE9BQU87SUFDUixDQUFDO0lBRUQsVUFBVTtRQUNULE9BQU8sRUFBRSxDQUFDO0lBQ1gsQ0FBQztJQUVELG1CQUFtQjtRQUNsQixPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFFRCxtQkFBbUIsQ0FBQyxVQUFrQjtRQUNyQyxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsa0NBQWtDLENBQUMsYUFBcUI7UUFDdkQsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVELGlCQUFpQjtRQUNoQixPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFFRCwyQkFBMkI7UUFDMUIsT0FBTztJQUNSLENBQUM7SUFFRCw2QkFBNkI7UUFDNUIsT0FBTztJQUNSLENBQUM7SUFFRCxzQkFBc0IsQ0FBQyxNQUFjO1FBQ3BDLE9BQU8sRUFBRSxDQUFDO0lBQ1gsQ0FBQztJQUVELEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxRQUFvQztRQUM5RCxPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFFRCxlQUFlLENBQUMsVUFBa0IsRUFBRSxJQUFxQyxFQUFFLFFBQXdCLEVBQUUsT0FBeUMsRUFBRSxLQUF3QjtRQUN2SyxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUVELGtCQUFrQixDQUFDLFVBQWtCLEVBQUUsT0FBOEIsRUFBRSxLQUF3QjtRQUM5RixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUVELHFCQUFxQixDQUFDLFFBQWdCO1FBQ3JDLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxLQUFLLENBQUMscUJBQXFCLENBQUMsUUFBZ0IsRUFBRSxPQUFtQztJQUNqRixDQUFDO0lBRUQsNEJBQTRCLENBQUMsUUFBZ0I7UUFDNUMsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0lBRUQsS0FBSyxDQUFDLG9DQUFvQyxDQUFDLFFBQWdCLEVBQUUsSUFBYTtJQUUxRSxDQUFDO0lBRUQsS0FBSyxDQUFDLGNBQWMsQ0FBQyxRQUFnQjtJQUNyQyxDQUFDO0lBRUQsS0FBSyxDQUFDLDhCQUE4QixDQUFDLElBQVksRUFBRSxRQUFnQixFQUFFLGFBQXFEO0lBRTFILENBQUM7SUFFRCxLQUFLLENBQUMsaUNBQWlDLENBQUMsUUFBZ0IsRUFBRSxpQkFBeUI7SUFDbkYsQ0FBQztJQUVELEtBQUssQ0FBQyxrQ0FBa0MsQ0FBQywyQkFBeUQsSUFBbUIsQ0FBQztJQUV0SCx1QkFBdUI7UUFDdEIsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0lBRUQscUJBQXFCLEtBQVcsQ0FBQztJQUNqQyxxQkFBcUIsS0FBVyxDQUFDO0lBRWpDLHdCQUF3QjtRQUN2QixPQUFPLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUM7SUFDL0IsQ0FBQztDQUdEIn0=