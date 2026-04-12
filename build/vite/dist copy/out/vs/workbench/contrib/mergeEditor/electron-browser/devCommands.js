/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { randomPath } from '../../../../base/common/extpath.js';
import { URI } from '../../../../base/common/uri.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { MergeEditor } from '../browser/view/mergeEditor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
const MERGE_EDITOR_CATEGORY = localize2('mergeEditor', 'Merge Editor (Dev)');
export class MergeEditorOpenContentsFromJSON extends Action2 {
    constructor() {
        super({
            id: 'merge.dev.openContentsJson',
            category: MERGE_EDITOR_CATEGORY,
            title: localize2('merge.dev.openState', "Open Merge Editor State from JSON"),
            icon: Codicon.layoutCentered,
            f1: true,
        });
    }
    async run(accessor, args) {
        const quickInputService = accessor.get(IQuickInputService);
        const clipboardService = accessor.get(IClipboardService);
        const editorService = accessor.get(IEditorService);
        const languageService = accessor.get(ILanguageService);
        const env = accessor.get(INativeEnvironmentService);
        const fileService = accessor.get(IFileService);
        if (!args) {
            args = {};
        }
        let content;
        if (!args.data) {
            const result = await quickInputService.input({
                prompt: localize('mergeEditor.enterJSON', 'Enter JSON'),
                value: await clipboardService.readText(),
            });
            if (result === undefined) {
                return;
            }
            content =
                result !== ''
                    ? JSON.parse(result)
                    : { base: '', input1: '', input2: '', result: '', languageId: 'plaintext' };
        }
        else {
            content = args.data;
        }
        const targetDir = URI.joinPath(env.tmpDir, randomPath());
        const extension = languageService.getExtensions(content.languageId)[0] || '';
        const baseUri = URI.joinPath(targetDir, `/base${extension}`);
        const input1Uri = URI.joinPath(targetDir, `/input1${extension}`);
        const input2Uri = URI.joinPath(targetDir, `/input2${extension}`);
        const resultUri = URI.joinPath(targetDir, `/result${extension}`);
        const initialResultUri = URI.joinPath(targetDir, `/initialResult${extension}`);
        async function writeFile(uri, content) {
            await fileService.writeFile(uri, VSBuffer.fromString(content));
        }
        const shouldOpenInitial = await promptOpenInitial(quickInputService, args.resultState);
        await Promise.all([
            writeFile(baseUri, content.base),
            writeFile(input1Uri, content.input1),
            writeFile(input2Uri, content.input2),
            writeFile(resultUri, shouldOpenInitial ? (content.initialResult || '') : content.result),
            writeFile(initialResultUri, content.initialResult || ''),
        ]);
        const input = {
            base: { resource: baseUri },
            input1: { resource: input1Uri, label: 'Input 1', description: 'Input 1', detail: '(from JSON)' },
            input2: { resource: input2Uri, label: 'Input 2', description: 'Input 2', detail: '(from JSON)' },
            result: { resource: resultUri },
        };
        editorService.openEditor(input);
    }
}
async function promptOpenInitial(quickInputService, resultStateOverride) {
    if (resultStateOverride) {
        return resultStateOverride === 'initial';
    }
    const result = await quickInputService.pick([{ label: 'result', result: false }, { label: 'initial result', result: true }], { canPickMany: false });
    return result?.result;
}
class MergeEditorAction extends Action2 {
    constructor(desc) {
        super(desc);
    }
    run(accessor) {
        const { activeEditorPane } = accessor.get(IEditorService);
        if (activeEditorPane instanceof MergeEditor) {
            const vm = activeEditorPane.viewModel.get();
            if (!vm) {
                return;
            }
            this.runWithViewModel(vm, accessor);
        }
    }
}
export class OpenSelectionInTemporaryMergeEditor extends MergeEditorAction {
    constructor() {
        super({
            id: 'merge.dev.openSelectionInTemporaryMergeEditor',
            category: MERGE_EDITOR_CATEGORY,
            title: localize2('merge.dev.openSelectionInTemporaryMergeEditor', "Open Selection In Temporary Merge Editor"),
            icon: Codicon.layoutCentered,
            f1: true,
        });
    }
    async runWithViewModel(viewModel, accessor) {
        const rangesInBase = viewModel.selectionInBase.get()?.rangesInBase;
        if (!rangesInBase || rangesInBase.length === 0) {
            return;
        }
        const base = rangesInBase
            .map((r) => viewModel.model.base.getValueInRange(r))
            .join('\n');
        const input1 = rangesInBase
            .map((r) => viewModel.inputCodeEditorView1.editor.getModel().getValueInRange(viewModel.model.translateBaseRangeToInput(1, r)))
            .join('\n');
        const input2 = rangesInBase
            .map((r) => viewModel.inputCodeEditorView2.editor.getModel().getValueInRange(viewModel.model.translateBaseRangeToInput(2, r)))
            .join('\n');
        const result = rangesInBase
            .map((r) => viewModel.resultCodeEditorView.editor.getModel().getValueInRange(viewModel.model.translateBaseRangeToResult(r)))
            .join('\n');
        new MergeEditorOpenContentsFromJSON().run(accessor, {
            data: {
                base,
                input1,
                input2,
                result,
                languageId: viewModel.resultCodeEditorView.editor.getModel().getLanguageId()
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGV2Q29tbWFuZHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tZXJnZUVkaXRvci9lbGVjdHJvbi1icm93c2VyL2RldkNvbW1hbmRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNuRixPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRXpELE9BQU8sRUFBRSxPQUFPLEVBQW1CLE1BQU0sZ0RBQWdELENBQUM7QUFDMUYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDOUYsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDbkcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRTFFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRTFGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUc3RCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFbEYsTUFBTSxxQkFBcUIsR0FBcUIsU0FBUyxDQUFDLGFBQWEsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO0FBRS9GLE1BQU0sT0FBTywrQkFBZ0MsU0FBUSxPQUFPO0lBQzNEO1FBQ0MsS0FBSyxDQUFD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