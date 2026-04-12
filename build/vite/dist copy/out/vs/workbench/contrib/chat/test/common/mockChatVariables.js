/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ResourceMap } from '../../../../../base/common/map.js';
export class MockChatVariablesService {
    constructor() {
        this._dynamicVariables = new ResourceMap();
        this._selectedToolAndToolSets = new ResourceMap();
    }
    getDynamicVariables(sessionResource) {
        return this._dynamicVariables.get(sessionResource) ?? [];
    }
    getSelectedToolAndToolSets(sessionResource) {
        return this._selectedToolAndToolSets.get(sessionResource) ?? new Map();
    }
    setDynamicVariables(sessionResource, variables) {
        this._dynamicVariables.set(sessionResource, variables);
    }
    setSelectedToolAndToolSets(sessionResource, tools) {
        this._selectedToolAndToolSets.set(sessionResource, tools);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9ja0NoYXRWYXJpYWJsZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL21vY2tDaGF0VmFyaWFibGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUtoRSxNQUFNLE9BQU8sd0JBQXdCO0lBQXJDO1FBR1Msc0JBQWlCLEdBQUcsSUFBSSxXQUFXLEVBQStCLENBQUM7UUFDbkUsNkJBQXdCLEdBQUcsSUFBSSxXQUFXLEVBQWdDLENBQUM7SUFpQnBGLENBQUM7SUFmQSxtQkFBbUIsQ0FBQyxlQUFvQjtRQUN2QyxPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQzFELENBQUM7SUFFRCwwQkFBMEIsQ0FBQyxlQUFvQjtRQUM5QyxPQUFPLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLElBQUksSUFBSSxHQUFHLEVBQUUsQ0FBQztJQUN4RSxDQUFDO0lBRUQsbUJBQW1CLENBQUMsZUFBb0IsRUFBRSxTQUFzQztRQUMvRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLGVBQWUsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBRUQsMEJBQTBCLENBQUMsZUFBb0IsRUFBRSxLQUFtQztRQUNuRixJQUFJLENBQUMsd0JBQXdCLENBQUMsR0FBRyxDQUFDLGVBQWUsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUMzRCxDQUFDO0NBQ0QifQ==