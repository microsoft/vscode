/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { instantiateTestCodeEditor, createCodeEditorServices } from './testCodeEditor.js';
import { instantiateTextModel } from '../common/testTextModel.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
export function testCommand(lines, languageId, selection, commandFactory, expectedLines, expectedSelection, forceTokenization, prepare) {
    const disposables = new DisposableStore();
    const instantiationService = createCodeEditorServices(disposables);
    if (prepare) {
        instantiationService.invokeFunction(prepare, disposables);
    }
    const model = disposables.add(instantiateTextModel(instantiationService, lines.join('\n'), languageId));
    const editor = disposables.add(instantiateTestCodeEditor(instantiationService, model));
    const viewModel = editor.getViewModel();
    if (forceTokenization) {
        model.tokenization.forceTokenization(model.getLineCount());
    }
    viewModel.setSelections('tests', [selection]);
    const command = instantiationService.invokeFunction((accessor) => commandFactory(accessor, viewModel.getSelection()));
    viewModel.executeCommand(command, 'tests');
    assert.deepStrictEqual(model.getLinesContent(), expectedLines);
    const actualSelection = viewModel.getSelection();
    assert.deepStrictEqual(actualSelection.toString(), expectedSelection.toString());
    disposables.dispose();
}
/**
 * Extract edit operations if command `command` were to execute on model `model`
 */
export function getEditOperation(model, command) {
    const operations = [];
    const editOperationBuilder = {
        addEditOperation: (range, text, forceMoveMarkers = false) => {
            operations.push({
                range: range,
                text: text,
                forceMoveMarkers: forceMoveMarkers
            });
        },
        addTrackedEditOperation: (range, text, forceMoveMarkers = false) => {
            operations.push({
                range: range,
                text: text,
                forceMoveMarkers: forceMoveMarkers
            });
        },
        trackSelection: (selection) => {
            return '';
        }
    };
    command.getEditOperations(model, editOperationBuilder);
    return operations;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdENvbW1hbmQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9icm93c2VyL3Rlc3RDb21tYW5kLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUs1QixPQUFPLEVBQUUseUJBQXlCLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUMxRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUVsRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFHcEUsTUFBTSxVQUFVLFdBQVcsQ0FDMUIsS0FBZSxFQUNmLFVBQXlCLEVBQ3pCLFNBQW9CLEVBQ3BCLGNBQThFLEVBQzlFLGFBQXVCLEVBQ3ZCLGlCQUE0QixFQUM1QixpQkFBMkIsRUFDM0IsT0FBNEU7SUFFNUUsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUMxQyxNQUFNLG9CQUFvQixHQUFHLHdCQUF3QixDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQ25FLElBQUksT0FBTyxFQUFFLENBQUM7UUFDYixvQkFBb0IsQ0FBQyxjQUFjLENBQUMsT0FBTyxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFDRCxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLG9CQUFvQixFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQztJQUN4RyxNQUFNLE1BQU0sR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLHlCQUF5QixDQUFDLG9CQUFvQixFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDdkYsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLFlBQVksRUFBRyxDQUFDO0lBRXpDLElBQUksaUJBQWlCLEVBQUUsQ0FBQztRQUN2QixLQUFLLENBQUMsWUFBWSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFFRCxTQUFTLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFFOUMsTUFBTSxPQUFPLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxjQUFjLENBQUMsUUFBUSxFQUFFLFNBQVMsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDdEgsU0FBUyxDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFFM0MsTUFBTSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsZUFBZSxFQUFFLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFFL0QsTUFBTSxlQUFlLEdBQUcsU0FBUyxDQUFDLFlBQVksRUFBRSxDQUFDO0lBQ2pELE1BQU0sQ0FBQyxlQUFlLENBQUMsZUFBZSxDQUFDLFFBQVEsRUFBRSxFQUFFLGlCQUFpQixDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFFakYsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQ3ZCLENBQUM7QUFFRDs7R0FFRztBQUNILE1BQU0sVUFBVSxnQkFBZ0IsQ0FBQyxLQUFpQixFQUFFLE9BQWlCO0lBQ3BFLE1BQU0sVUFBVSxHQUEyQixFQUFFLENBQUM7SUFDOUMsTUFBTSxvQkFBb0IsR0FBMEI7UUFDbkQsZ0JBQWdCLEVBQUUsQ0FBQyxLQUFhLEVBQUUsSUFBWSxFQUFFLG1CQUE0QixLQUFLLEVBQUUsRUFBRTtZQUNwRixVQUFVLENBQUMsSUFBSSxDQUFDO2dCQUNmLEtBQUssRUFBRSxLQUFLO2dCQUNaLElBQUksRUFBRSxJQUFJO2dCQUNWLGdCQUFnQixFQUFFLGdCQUFnQjthQUNsQyxDQUFDLENBQUM7UUFDSixDQUFDO1FBRUQsdUJBQXVCLEVBQUUsQ0FBQyxLQUFhLEVBQUUsSUFBWSxFQUFFLG1CQUE0QixLQUFLLEVBQUUsRUFBRTtZQUMzRixVQUFVLENBQUMsSUFBSSxDQUFDO2dCQUNmLEtBQUssRUFBRSxLQUFLO2dCQUNaLElBQUksRUFBRSxJQUFJO2dCQUNWLGdCQUFnQixFQUFFLGdCQUFnQjthQUNsQyxDQUFDLENBQUM7UUFDSixDQUFDO1FBR0QsY0FBYyxFQUFFLENBQUMsU0FBcUIsRUFBRSxFQUFFO1lBQ3pDLE9BQU8sRUFBRSxDQUFDO1FBQ1gsQ0FBQztLQUNELENBQUM7SUFDRixPQUFPLENBQUMsaUJBQWlCLENBQUMsS0FBSyxFQUFFLG9CQUFvQixDQUFDLENBQUM7SUFDdkQsT0FBTyxVQUFVLENBQUM7QUFDbkIsQ0FBQyJ9