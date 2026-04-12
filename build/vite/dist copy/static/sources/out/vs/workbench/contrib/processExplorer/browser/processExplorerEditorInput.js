/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
const processExplorerEditorIcon = registerIcon('process-explorer-editor-label-icon', Codicon.serverProcess, localize('processExplorerEditorLabelIcon', 'Icon of the process explorer editor label.'));
export class ProcessExplorerEditorInput extends EditorInput {
    constructor() {
        super(...arguments);
        this.resource = ProcessExplorerEditorInput.RESOURCE;
    }
    static { this.ID = 'workbench.editor.processExplorer'; }
    static { this.RESOURCE = URI.from({
        scheme: 'process-explorer',
        path: 'default'
    }); }
    static get instance() {
        if (!ProcessExplorerEditorInput._instance || ProcessExplorerEditorInput._instance.isDisposed()) {
            ProcessExplorerEditorInput._instance = new ProcessExplorerEditorInput();
        }
        return ProcessExplorerEditorInput._instance;
    }
    get typeId() { return ProcessExplorerEditorInput.ID; }
    get editorId() { return ProcessExplorerEditorInput.ID; }
    get capabilities() { return 2 /* EditorInputCapabilities.Readonly */ | 8 /* EditorInputCapabilities.Singleton */; }
    getName() {
        return localize('processExplorerInputName', "Process Explorer");
    }
    getIcon() {
        return processExplorerEditorIcon;
    }
    matches(other) {
        if (super.matches(other)) {
            return true;
        }
        return other instanceof ProcessExplorerEditorInput;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc0V4cGxvcmVyRWRpdG9ySW5wdXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9wcm9jZXNzRXhwbG9yZXIvYnJvd3Nlci9wcm9jZXNzRXhwbG9yZXJFZGl0b3JJbnB1dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFOUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFakYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRXBFLE1BQU0seUJBQXlCLEdBQUcsWUFBWSxDQUFDLG9DQUFvQyxFQUFFLE9BQU8sQ0FBQyxhQUFhLEVBQUUsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLDRDQUE0QyxDQUFDLENBQUMsQ0FBQztBQUV0TSxNQUFNLE9BQU8sMEJBQTJCLFNBQVEsV0FBVztJQUEzRDs7UUF3QlUsYUFBUSxHQUFHLDBCQUEwQixDQUFDLFFBQVEsQ0FBQztJQWlCekQsQ0FBQzthQXZDZ0IsT0FBRSxHQUFHLGtDQUFrQyxBQUFyQyxDQUFzQzthQUV4QyxhQUFRLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQztRQUNuQyxNQUFNLEVBQUUsa0JBQWtCO1FBQzFCLElBQUksRUFBRSxTQUFTO0tBQ2YsQ0FBQyxBQUhzQixDQUdyQjtJQUdILE1BQU0sS0FBSyxRQUFRO1FBQ2xCLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxTQUFTLElBQUksMEJBQTBCLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUM7WUFDaEcsMEJBQTBCLENBQUMsU0FBUyxHQUFHLElBQUksMEJBQTBCLEVBQUUsQ0FBQztRQUN6RSxDQUFDO1FBRUQsT0FBTywwQkFBMEIsQ0FBQyxTQUFTLENBQUM7SUFDN0MsQ0FBQztJQUVELElBQWEsTUFBTSxLQUFhLE9BQU8sMEJBQTBCLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUV2RSxJQUFhLFFBQVEsS0FBeUIsT0FBTywwQkFBMEIsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBRXJGLElBQWEsWUFBWSxLQUE4QixPQUFPLG9GQUFvRSxDQUFDLENBQUMsQ0FBQztJQUk1SCxPQUFPO1FBQ2YsT0FBTyxRQUFRLENBQUMsMEJBQTBCLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztJQUNqRSxDQUFDO0lBRVEsT0FBTztRQUNmLE9BQU8seUJBQXlCLENBQUM7SUFDbEMsQ0FBQztJQUVRLE9BQU8sQ0FBQyxLQUF3QztRQUN4RCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUMxQixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCxPQUFPLEtBQUssWUFBWSwwQkFBMEIsQ0FBQztJQUNwRCxDQUFDIn0=