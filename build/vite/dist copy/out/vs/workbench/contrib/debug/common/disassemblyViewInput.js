/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EditorInput } from '../../../common/editor/editorInput.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
const DisassemblyEditorIcon = registerIcon('disassembly-editor-label-icon', Codicon.debug, localize('disassemblyEditorLabelIcon', 'Icon of the disassembly editor label.'));
export class DisassemblyViewInput extends EditorInput {
    constructor() {
        super(...arguments);
        this.resource = undefined;
    }
    static { this.ID = 'debug.disassemblyView.input'; }
    get typeId() {
        return DisassemblyViewInput.ID;
    }
    static get instance() {
        if (!DisassemblyViewInput._instance || DisassemblyViewInput._instance.isDisposed()) {
            DisassemblyViewInput._instance = new DisassemblyViewInput();
        }
        return DisassemblyViewInput._instance;
    }
    getName() {
        return localize('disassemblyInputName', "Disassembly");
    }
    getIcon() {
        return DisassemblyEditorIcon;
    }
    matches(other) {
        return other instanceof DisassemblyViewInput;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlzYXNzZW1ibHlWaWV3SW5wdXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy9jb21tb24vZGlzYXNzZW1ibHlWaWV3SW5wdXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU5QyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRWpGLE1BQU0scUJBQXFCLEdBQUcsWUFBWSxDQUFDLCtCQUErQixFQUFFLE9BQU8sQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLDRCQUE0QixFQUFFLHVDQUF1QyxDQUFDLENBQUMsQ0FBQztBQUU1SyxNQUFNLE9BQU8sb0JBQXFCLFNBQVEsV0FBVztJQUFyRDs7UUFpQlUsYUFBUSxHQUFHLFNBQVMsQ0FBQztJQWMvQixDQUFDO2FBN0JnQixPQUFFLEdBQUcsNkJBQTZCLEFBQWhDLENBQWlDO0lBRW5ELElBQWEsTUFBTTtRQUNsQixPQUFPLG9CQUFvQixDQUFDLEVBQUUsQ0FBQztJQUNoQyxDQUFDO0lBR0QsTUFBTSxLQUFLLFFBQVE7UUFDbEIsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFNBQVMsSUFBSSxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQztZQUNwRixvQkFBb0IsQ0FBQyxTQUFTLEdBQUcsSUFBSSxvQkFBb0IsRUFBRSxDQUFDO1FBQzdELENBQUM7UUFFRCxPQUFPLG9CQUFvQixDQUFDLFNBQVMsQ0FBQztJQUN2QyxDQUFDO0lBSVEsT0FBTztRQUNmLE9BQU8sUUFBUSxDQUFDLHNCQUFzQixFQUFFLGFBQWEsQ0FBQyxDQUFDO0lBQ3hELENBQUM7SUFFUSxPQUFPO1FBQ2YsT0FBTyxxQkFBcUIsQ0FBQztJQUM5QixDQUFDO0lBRVEsT0FBTyxDQUFDLEtBQWM7UUFDOUIsT0FBTyxLQUFLLFlBQVksb0JBQW9CLENBQUM7SUFDOUMsQ0FBQyJ9