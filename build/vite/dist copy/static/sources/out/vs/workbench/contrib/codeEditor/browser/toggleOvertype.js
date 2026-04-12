/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { InputMode } from '../../../../editor/common/inputMode.js';
export class ToggleOvertypeInsertMode extends Action2 {
    constructor() {
        super({
            id: 'editor.action.toggleOvertypeInsertMode',
            title: {
                ...localize2('toggleOvertypeInsertMode', "Toggle Overtype/Insert Mode"),
                mnemonicTitle: localize({ key: 'mitoggleOvertypeInsertMode', comment: ['&& denotes a mnemonic'] }, "&&Toggle Overtype/Insert Mode"),
            },
            metadata: {
                description: localize2('toggleOvertypeMode.description', "Toggle between overtype and insert mode"),
            },
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 19 /* KeyCode.Insert */,
                mac: { primary: 512 /* KeyMod.Alt */ | 2048 /* KeyMod.CtrlCmd */ | 45 /* KeyCode.KeyO */ },
            },
            f1: true,
            category: Categories.View
        });
    }
    async run(accessor) {
        const oldInputMode = InputMode.getInputMode();
        const newInputMode = oldInputMode === 'insert' ? 'overtype' : 'insert';
        InputMode.setInputMode(newInputMode);
    }
}
registerAction2(ToggleOvertypeInsertMode);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9nZ2xlT3ZlcnR5cGUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jb2RlRWRpdG9yL2Jyb3dzZXIvdG9nZ2xlT3ZlcnR5cGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUkxRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFbkUsTUFBTSxPQUFPLHdCQUF5QixTQUFRLE9BQU87SUFFcEQ7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsd0NBQXdDO1lBQzVDLEtBQUssRUFBRTtnQkFDTixHQUFHLFNBQVMsQ0FBQywwQkFBMEIsRUFBRSw2QkFBNkIsQ0FBQztnQkFDdkUsYUFBYSxFQUFFLFFBQVEsQ0FBQyxFQUFFLEdBQUcsRUFBRSw0QkFBNEIsRUFBRSxPQUFPLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsK0JBQStCLENBQUM7YUFDbkk7WUFDRCxRQUFRLEVBQUU7Z0JBQ1QsV0FBVyxFQUFFLFNBQVMsQ0FBQyxnQ0FBZ0MsRUFBRSx5Q0FBeUMsQ0FBQzthQUNuRztZQUNELFVBQVUsRUFBRTtnQkFDWCxNQUFNLDZDQUFtQztnQkFDekMsT0FBTyx5QkFBZ0I7Z0JBQ3ZCLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxnREFBMkIsd0JBQWUsRUFBRTthQUM1RDtZQUNELEVBQUUsRUFBRSxJQUFJO1lBQ1IsUUFBUSxFQUFFLFVBQVUsQ0FBQyxJQUFJO1NBQ3pCLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFUSxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO1FBQzVDLE1BQU0sWUFBWSxHQUFHLFNBQVMsQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUM5QyxNQUFNLFlBQVksR0FBRyxZQUFZLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQztRQUN2RSxTQUFTLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQ3RDLENBQUM7Q0FDRDtBQUVELGVBQWUsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDIn0=