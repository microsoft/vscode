/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
const AgentPluginEditorIcon = registerIcon('agent-plugin-editor-icon', Codicon.extensions, localize('agentPluginEditorLabelIcon', 'Icon of the Agent Plugin editor.'));
function getPluginId(item) {
    if (item.kind === "installed" /* AgentPluginItemKind.Installed */) {
        return item.plugin.uri.toString();
    }
    return `${item.marketplaceReference.canonicalId}/${item.source}`;
}
export class AgentPluginEditorInput extends EditorInput {
    static { this.ID = 'workbench.agentPlugin.input'; }
    get typeId() {
        return AgentPluginEditorInput.ID;
    }
    get capabilities() {
        return super.capabilities | 8 /* EditorInputCapabilities.Singleton */ | 2048 /* EditorInputCapabilities.RequiresModal */;
    }
    get resource() {
        return URI.from({
            scheme: Schemas.extension,
            path: `/agentPlugin/${encodeURIComponent(getPluginId(this._item))}`
        });
    }
    constructor(_item) {
        super();
        this._item = _item;
    }
    get item() { return this._item; }
    getName() {
        return localize('agentPluginInputName', "Plugin: {0}", this._item.name);
    }
    getIcon() {
        return AgentPluginEditorIcon;
    }
    matches(other) {
        if (super.matches(other)) {
            return true;
        }
        return other instanceof AgentPluginEditorInput && getPluginId(this._item) === getPluginId(other._item);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRQbHVnaW5FZGl0b3JJbnB1dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFBsdWdpbkVkaXRvci9hZ2VudFBsdWdpbkVkaXRvcklucHV0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFaEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFcEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBR3ZFLE1BQU0scUJBQXFCLEdBQUcsWUFBWSxDQUFDLDBCQUEwQixFQUFFLE9BQU8sQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLDRCQUE0QixFQUFFLGtDQUFrQyxDQUFDLENBQUMsQ0FBQztBQUV2SyxTQUFTLFdBQVcsQ0FBQyxJQUFzQjtJQUMxQyxJQUFJLElBQUksQ0FBQyxJQUFJLG9EQUFrQyxFQUFFLENBQUM7UUFDakQsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNuQyxDQUFDO0lBQ0QsT0FBTyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxXQUFXLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO0FBQ2xFLENBQUM7QUFFRCxNQUFNLE9BQU8sc0JBQXVCLFNBQVEsV0FBVzthQUV0QyxPQUFFLEdBQUcsNkJBQTZCLENBQUM7SUFFbkQsSUFBYSxNQUFNO1FBQ2xCLE9BQU8sc0JBQXNCLENBQUMsRUFBRSxDQUFDO0lBQ2xDLENBQUM7SUFFRCxJQUFhLFlBQVk7UUFDeEIsT0FBTyxLQUFLLENBQUMsWUFBWSw0Q0FBb0MsbURBQXdDLENBQUM7SUFDdkcsQ0FBQztJQUVELElBQWEsUUFBUTtRQUNwQixPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUM7WUFDZixNQUFNLEVBQUUsT0FBTyxDQUFDLFNBQVM7WUFDekIsSUFBSSxFQUFFLGdCQUFnQixrQkFBa0IsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUU7U0FDbkUsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELFlBQW9CLEtBQXVCO1FBQzFDLEtBQUssRUFBRSxDQUFDO1FBRFcsVUFBSyxHQUFMLEtBQUssQ0FBa0I7SUFFM0MsQ0FBQztJQUVELElBQUksSUFBSSxLQUF1QixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBRTFDLE9BQU87UUFDZixPQUFPLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxhQUFhLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN6RSxDQUFDO0lBRVEsT0FBTztRQUNmLE9BQU8scUJBQXFCLENBQUM7SUFDOUIsQ0FBQztJQUVRLE9BQU8sQ0FBQyxLQUF3QztRQUN4RCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUMxQixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCxPQUFPLEtBQUssWUFBWSxzQkFBc0IsSUFBSSxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDeEcsQ0FBQyJ9