/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../nls.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { URI } from '../../../../base/common/uri.js';
import { Schemas } from '../../../../base/common/network.js';
export const agentSessionsWelcomeInputTypeId = 'workbench.editors.agentSessionsWelcomeInput';
export class AgentSessionsWelcomeInput extends EditorInput {
    static { this.ID = agentSessionsWelcomeInputTypeId; }
    static { this.RESOURCE = URI.from({ scheme: Schemas.walkThrough, authority: 'vscode_agent_sessions_welcome' }); }
    get typeId() {
        return AgentSessionsWelcomeInput.ID;
    }
    get editorId() {
        return this.typeId;
    }
    toUntyped() {
        return {
            resource: AgentSessionsWelcomeInput.RESOURCE,
            options: {
                override: AgentSessionsWelcomeInput.ID,
                pinned: false
            }
        };
    }
    get resource() {
        return AgentSessionsWelcomeInput.RESOURCE;
    }
    matches(other) {
        if (super.matches(other)) {
            return true;
        }
        return other instanceof AgentSessionsWelcomeInput;
    }
    constructor(options = {}) {
        super();
        this._showTelemetryNotice = !!options.showTelemetryNotice;
        this._initiator = options.initiator ?? 'command';
        this._workspaceKind = options.workspaceKind;
    }
    getName() {
        return localize('agentSessionsWelcome', "Welcome");
    }
    get showTelemetryNotice() {
        return this._showTelemetryNotice;
    }
    set showTelemetryNotice(value) {
        this._showTelemetryNotice = value;
    }
    get initiator() {
        return this._initiator;
    }
    get workspaceKind() {
        return this._workspaceKind;
    }
    getTelemetryDescriptor() {
        const descriptor = super.getTelemetryDescriptor();
        descriptor['initiator'] = this._initiator;
        descriptor['workspaceKind'] = this._workspaceKind;
        /* __GDPR__FRAGMENT__
            "EditorTelemetryDescriptor" : {
                "initiator" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "How the welcome page was opened - startup or command." },
                "workspaceKind" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The type of workspace - empty, folder, or workspace." }
            }
        */
        return descriptor;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uc1dlbGNvbWVJbnB1dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVBZ2VudFNlc3Npb25zL2Jyb3dzZXIvYWdlbnRTZXNzaW9uc1dlbGNvbWVJbnB1dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFJN0QsTUFBTSxDQUFDLE1BQU0sK0JBQStCLEdBQUcsNkNBQTZDLENBQUM7QUFVN0YsTUFBTSxPQUFPLHlCQUEwQixTQUFRLFdBQVc7YUFFekMsT0FBRSxHQUFHLCtCQUErQixDQUFDO2FBQ3JDLGFBQVEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxXQUFXLEVBQUUsU0FBUyxFQUFFLCtCQUErQixFQUFFLENBQUMsQ0FBQztJQU1qSCxJQUFhLE1BQU07UUFDbEIsT0FBTyx5QkFBeUIsQ0FBQyxFQUFFLENBQUM7SUFDckMsQ0FBQztJQUVELElBQWEsUUFBUTtRQUNwQixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUM7SUFDcEIsQ0FBQztJQUVRLFNBQVM7UUFDakIsT0FBTztZQUNOLFFBQVEsRUFBRSx5QkFBeUIsQ0FBQyxRQUFRO1lBQzVDLE9BQU8sRUFBRTtnQkFDUixRQUFRLEVBQUUseUJBQXlCLENBQUMsRUFBRTtnQkFDdEMsTUFBTSxFQUFFLEtBQUs7YUFDYjtTQUNELENBQUM7SUFDSCxDQUFDO0lBRUQsSUFBSSxRQUFRO1FBQ1gsT0FBTyx5QkFBeUIsQ0FBQyxRQUFRLENBQUM7SUFDM0MsQ0FBQztJQUVRLE9BQU8sQ0FBQyxLQUF3QztRQUN4RCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUMxQixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCxPQUFPLEtBQUssWUFBWSx5QkFBeUIsQ0FBQztJQUNuRCxDQUFDO0lBRUQsWUFDQyxVQUE2QyxFQUFFO1FBRS9DLEtBQUssRUFBRSxDQUFDO1FBQ1IsSUFBSSxDQUFDLG9CQUFvQixHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsbUJBQW1CLENBQUM7UUFDMUQsSUFBSSxDQUFDLFVBQVUsR0FBRyxPQUFPLENBQUMsU0FBUyxJQUFJLFNBQVMsQ0FBQztRQUNqRCxJQUFJLENBQUMsY0FBYyxHQUFHLE9BQU8sQ0FBQyxhQUFhLENBQUM7SUFDN0MsQ0FBQztJQUVRLE9BQU87UUFDZixPQUFPLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBRUQsSUFBSSxtQkFBbUI7UUFDdEIsT0FBTyxJQUFJLENBQUMsb0JBQW9CLENBQUM7SUFDbEMsQ0FBQztJQUVELElBQUksbUJBQW1CLENBQUMsS0FBYztRQUNyQyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsS0FBSyxDQUFDO0lBQ25DLENBQUM7SUFFRCxJQUFJLFNBQVM7UUFDWixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUM7SUFDeEIsQ0FBQztJQUVELElBQUksYUFBYTtRQUNoQixPQUFPLElBQUksQ0FBQyxjQUFjLENBQUM7SUFDNUIsQ0FBQztJQUVRLHNCQUFzQjtRQUM5QixNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztRQUNsRCxVQUFVLENBQUMsV0FBVyxDQUFDLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQztRQUMxQyxVQUFVLENBQUMsZUFBZSxDQUFDLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQztRQUNsRDs7Ozs7VUFLRTtRQUNGLE9BQU8sVUFBVSxDQUFDO0lBQ25CLENBQUMifQ==