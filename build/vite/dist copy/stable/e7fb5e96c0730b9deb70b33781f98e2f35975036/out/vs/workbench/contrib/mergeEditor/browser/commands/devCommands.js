/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { MergeEditor } from '../view/mergeEditor.js';
import { ctxIsMergeEditor } from '../../common/mergeEditor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
const MERGE_EDITOR_CATEGORY = localize2('mergeEditor', 'Merge Editor (Dev)');
export class MergeEditorCopyContentsToJSON extends Action2 {
    constructor() {
        super({
            id: 'merge.dev.copyContentsJson',
            category: MERGE_EDITOR_CATEGORY,
            title: localize2('merge.dev.copyState', "Copy Merge Editor State as JSON"),
            icon: Codicon.layoutCentered,
            f1: true,
            precondition: ctxIsMergeEditor,
        });
    }
    run(accessor) {
        const { activeEditorPane } = accessor.get(IEditorService);
        const clipboardService = accessor.get(IClipboardService);
        const notificationService = accessor.get(INotificationService);
        if (!(activeEditorPane instanceof MergeEditor)) {
            notificationService.info({
                name: localize('mergeEditor.name', 'Merge Editor'),
                message: localize('mergeEditor.noActiveMergeEditor', "No active merge editor")
            });
            return;
        }
        const model = activeEditorPane.model;
        if (!model) {
            return;
        }
        const contents = {
            languageId: model.resultTextModel.getLanguageId(),
            base: model.base.getValue(),
            input1: model.input1.textModel.getValue(),
            input2: model.input2.textModel.getValue(),
            result: model.resultTextModel.getValue(),
            initialResult: model.getInitialResultValue(),
        };
        const jsonStr = JSON.stringify(contents, undefined, 4);
        clipboardService.writeText(jsonStr);
        notificationService.info({
            name: localize('mergeEditor.name', 'Merge Editor'),
            message: localize('mergeEditor.successfullyCopiedMergeEditorContents', "Successfully copied merge editor state"),
        });
    }
}
export class MergeEditorSaveContentsToFolder extends Action2 {
    constructor() {
        super({
            id: 'merge.dev.saveContentsToFolder',
            category: MERGE_EDITOR_CATEGORY,
            title: localize2('merge.dev.saveContentsToFolder', "Save Merge Editor State to Folder"),
            icon: Codicon.layoutCentered,
            f1: true,
            precondition: ctxIsMergeEditor,
        });
    }
    async run(accessor) {
        const { activeEditorPane } = accessor.get(IEditorService);
        const notificationService = accessor.get(INotificationService);
        const dialogService = accessor.get(IFileDialogService);
        const fileService = accessor.get(IFileService);
        const languageService = accessor.get(ILanguageService);
        if (!(activeEditorPane instanceof MergeEditor)) {
            notificationService.info({
                name: localize('mergeEditor.name', 'Merge Editor'),
                message: localize('mergeEditor.noActiveMergeEditor', "No active merge editor")
            });
            return;
        }
        const model = activeEditorPane.model;
        if (!model) {
            return;
        }
        const result = await dialogService.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            title: localize('mergeEditor.selectFolderToSaveTo', 'Select folder to save to')
        });
        if (!result) {
            return;
        }
        const targetDir = result[0];
        const extension = languageService.getExtensions(model.resultTextModel.getLanguageId())[0] || '';
        async function write(fileName, source) {
            await fileService.writeFile(URI.joinPath(targetDir, fileName + extension), VSBuffer.fromString(source), {});
        }
        await Promise.all([
            write('base', model.base.getValue()),
            write('input1', model.input1.textModel.getValue()),
            write('input2', model.input2.textModel.getValue()),
            write('result', model.resultTextModel.getValue()),
            write('initialResult', model.getInitialResultValue()),
        ]);
        notificationService.info({
            name: localize('mergeEditor.name', 'Merge Editor'),
            message: localize('mergeEditor.successfullySavedMergeEditorContentsToFolder', "Successfully saved merge editor state to folder"),
        });
    }
}
export class MergeEditorLoadContentsFromFolder extends Action2 {
    constructor() {
        super({
            id: 'merge.dev.loadContentsFromFolder',
            category: MERGE_EDITOR_CATEGORY,
            title: localize2('merge.dev.loadContentsFromFolder', "Load Merge Editor State from Folder"),
            icon: Codicon.layoutCentered,
            f1: true
        });
    }
    async run(accessor, args) {
        const dialogService = accessor.get(IFileDialogService);
        const editorService = accessor.get(IEditorService);
        const fileService = accessor.get(IFileService);
        const quickInputService = accessor.get(IQuickInputService);
        if (!args) {
            args = {};
        }
        let targetDir;
        if (!args.folderUri) {
            const result = await dialogService.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                title: localize('mergeEditor.selectFolderToSaveTo', 'Select folder to save to')
            });
            if (!result) {
                return;
            }
            targetDir = result[0];
        }
        else {
            targetDir = args.folderUri;
        }
        const targetDirInfo = await fileService.resolve(targetDir);
        function findFile(name) {
            return targetDirInfo.children.find(c => c.name.startsWith(name))?.resource;
        }
        const shouldOpenInitial = await promptOpenInitial(quickInputService, args.resultState);
        const baseUri = findFile('base');
        const input1Uri = findFile('input1');
        const input2Uri = findFile('input2');
        const resultUri = findFile(shouldOpenInitial ? 'initialResult' : 'result');
        const input = {
            base: { resource: baseUri },
            input1: { resource: input1Uri, label: 'Input 1', description: 'Input 1', detail: '(from file)' },
            input2: { resource: input2Uri, label: 'Input 2', description: 'Input 2', detail: '(from file)' },
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGV2Q29tbWFuZHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tZXJnZUVkaXRvci9icm93c2VyL2NvbW1hbmRzL2RldkNvbW1hbmRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFNUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUU3RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUU3RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDckQsT0FBTyxFQUFFLGdCQUFnQixFQUF1QixNQUFNLDZCQUE2QixDQUFDO0FBQ3BGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUVyRixNQUFNLHFCQUFxQixHQUFxQixTQUFTLENBQUMsYUFBYSxFQUFFLG9CQUFvQixDQUFDLENBQUM7QUFFL0Ys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