/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
export var Extensions;
(function (Extensions) {
    Extensions.PreferencesEditorPane = 'workbench.registry.preferences.editorPanes';
})(Extensions || (Extensions = {}));
class PreferencesEditorPaneRegistryImpl extends Disposable {
    constructor() {
        super();
        this.descriptors = new Map();
        this._onDidRegisterPreferencesEditorPanes = this._register(new Emitter());
        this.onDidRegisterPreferencesEditorPanes = this._onDidRegisterPreferencesEditorPanes.event;
        this._onDidDeregisterPreferencesEditorPanes = this._register(new Emitter());
        this.onDidDeregisterPreferencesEditorPanes = this._onDidDeregisterPreferencesEditorPanes.event;
    }
    registerPreferencesEditorPane(descriptor) {
        if (this.descriptors.has(descriptor.id)) {
            throw new Error(`PreferencesEditorPane with id ${descriptor.id} already registered`);
        }
        this.descriptors.set(descriptor.id, descriptor);
        this._onDidRegisterPreferencesEditorPanes.fire([descriptor]);
        return {
            dispose: () => {
                if (this.descriptors.delete(descriptor.id)) {
                    this._onDidDeregisterPreferencesEditorPanes.fire([descriptor]);
                }
            }
        };
    }
    getPreferencesEditorPanes() {
        return [...this.descriptors.values()].sort((a, b) => a.order - b.order);
    }
}
Registry.add(Extensions.PreferencesEditorPane, new PreferencesEditorPaneRegistryImpl());
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmVyZW5jZXNFZGl0b3JSZWdpc3RyeS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3ByZWZlcmVuY2VzL2Jyb3dzZXIvcHJlZmVyZW5jZXNFZGl0b3JSZWdpc3RyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFFL0UsT0FBTyxFQUFTLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBSWxFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUU1RSxNQUFNLEtBQVcsVUFBVSxDQUUxQjtBQUZELFdBQWlCLFVBQVU7SUFDYixnQ0FBcUIsR0FBRyw0Q0FBNEMsQ0FBQztBQUNuRixDQUFDLEVBRmdCLFVBQVUsS0FBVixVQUFVLFFBRTFCO0FBdURELE1BQU0saUNBQWtDLFNBQVEsVUFBVTtJQVV6RDtRQUNDLEtBQUssRUFBRSxDQUFDO1FBVFEsZ0JBQVcsR0FBRyxJQUFJLEdBQUcsRUFBNEMsQ0FBQztRQUVsRSx5Q0FBb0MsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFzQyxDQUFDLENBQUM7UUFDakgsd0NBQW1DLEdBQUcsSUFBSSxDQUFDLG9DQUFvQyxDQUFDLEtBQUssQ0FBQztRQUU5RSwyQ0FBc0MsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFzQyxDQUFDLENBQUM7UUFDbkgsMENBQXFDLEdBQUcsSUFBSSxDQUFDLHNDQUFzQyxDQUFDLEtBQUssQ0FBQztJQUluRyxDQUFDO0lBRUQsNkJBQTZCLENBQUMsVUFBNEM7UUFDekUsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUN6QyxNQUFNLElBQUksS0FBSyxDQUFDLGlDQUFpQyxVQUFVLENBQUMsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO1FBQ3RGLENBQUM7UUFDRCxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsRUFBRSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQ2hELElBQUksQ0FBQyxvQ0FBb0MsQ0FBQyxJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBQzdELE9BQU87WUFDTixPQUFPLEVBQUUsR0FBRyxFQUFFO2dCQUNiLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7b0JBQzVDLElBQUksQ0FBQyxzQ0FBc0MsQ0FBQyxJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO2dCQUNoRSxDQUFDO1lBQ0YsQ0FBQztTQUNELENBQUM7SUFDSCxDQUFDO0lBRUQseUJBQXlCO1FBQ3hCLE9BQU8sQ0FBQyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN6RSxDQUFDO0NBRUQ7QUFFRCxRQUFRLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxxQkFBcUIsRUFBRSxJQUFJLGlDQUFpQyxFQUFFLENBQUMsQ0FBQyJ9