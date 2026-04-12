/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { join } from '../../../../base/common/path.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
const MCPServerEditorIcon = registerIcon('mcp-server-editor-icon', Codicon.mcp, localize('mcpServerEditorLabelIcon', 'Icon of the MCP Server editor.'));
export class McpServerEditorInput extends EditorInput {
    static { this.ID = 'workbench.mcpServer.input2'; }
    get typeId() {
        return McpServerEditorInput.ID;
    }
    get capabilities() {
        return 2 /* EditorInputCapabilities.Readonly */ | 8 /* EditorInputCapabilities.Singleton */;
    }
    get resource() {
        return URI.from({
            scheme: Schemas.extension,
            path: join(this.mcpServer.id, 'mcpServer')
        });
    }
    constructor(_mcpServer) {
        super();
        this._mcpServer = _mcpServer;
    }
    get mcpServer() { return this._mcpServer; }
    getName() {
        return localize('extensionsInputName', "MCP Server: {0}", this._mcpServer.label);
    }
    getIcon() {
        return MCPServerEditorIcon;
    }
    matches(other) {
        if (super.matches(other)) {
            return true;
        }
        return other instanceof McpServerEditorInput && this._mcpServer.id === other._mcpServer.id;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwU2VydmVyRWRpdG9ySW5wdXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvYnJvd3Nlci9tY3BTZXJ2ZXJFZGl0b3JJbnB1dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU5QyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDcEUsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRXZELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFHakYsTUFBTSxtQkFBbUIsR0FBRyxZQUFZLENBQUMsd0JBQXdCLEVBQUUsT0FBTyxDQUFDLEdBQUcsRUFBRSxRQUFRLENBQUMsMEJBQTBCLEVBQUUsZ0NBQWdDLENBQUMsQ0FBQyxDQUFDO0FBRXhKLE1BQU0sT0FBTyxvQkFBcUIsU0FBUSxXQUFXO2FBRXBDLE9BQUUsR0FBRyw0QkFBNEIsQ0FBQztJQUVsRCxJQUFhLE1BQU07UUFDbEIsT0FBTyxvQkFBb0IsQ0FBQyxFQUFFLENBQUM7SUFDaEMsQ0FBQztJQUVELElBQWEsWUFBWTtRQUN4QixPQUFPLG9GQUFvRSxDQUFDO0lBQzdFLENBQUM7SUFFRCxJQUFhLFFBQVE7UUFDcEIsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDO1lBQ2YsTUFBTSxFQUFFLE9BQU8sQ0FBQyxTQUFTO1lBQ3pCLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsV0FBVyxDQUFDO1NBQzFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxZQUFvQixVQUErQjtRQUNsRCxLQUFLLEVBQUUsQ0FBQztRQURXLGVBQVUsR0FBVixVQUFVLENBQXFCO0lBRW5ELENBQUM7SUFFRCxJQUFJLFNBQVMsS0FBMEIsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztJQUV2RCxPQUFPO1FBQ2YsT0FBTyxRQUFRLENBQUMscUJBQXFCLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNsRixDQUFDO0lBRVEsT0FBTztRQUNmLE9BQU8sbUJBQW1CLENBQUM7SUFDNUIsQ0FBQztJQUVRLE9BQU8sQ0FBQyxLQUF3QztRQUN4RCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUMxQixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCxPQUFPLEtBQUssWUFBWSxvQkFBb0IsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsS0FBSyxLQUFLLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztJQUM1RixDQUFDIn0=