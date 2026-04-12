/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { Range } from '../../../../editor/common/core/range.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { ITextMateTokenizationService } from '../../../services/textMate/browser/textMateTokenizationFeature.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { ILoggerService } from '../../../../platform/log/common/log.js';
import { joinPath } from '../../../../base/common/resources.js';
import { IFileService } from '../../../../platform/files/common/files.js';
class StartDebugTextMate extends Action2 {
    static { this.resource = URI.parse(`inmemory:///tm-log.txt`); }
    constructor() {
        super({
            id: 'editor.action.startDebugTextMate',
            title: nls.localize2('startDebugTextMate', "Start TextMate Syntax Grammar Logging"),
            category: Categories.Developer,
            f1: true
        });
    }
    _getOrCreateModel(modelService) {
        const model = modelService.getModel(StartDebugTextMate.resource);
        if (model) {
            return model;
        }
        return modelService.createModel('', null, StartDebugTextMate.resource);
    }
    _append(model, str) {
        const lineCount = model.getLineCount();
        model.applyEdits([{
                range: new Range(lineCount, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */, lineCount, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */),
                text: str
            }]);
    }
    async run(accessor) {
        const textMateService = accessor.get(ITextMateTokenizationService);
        const modelService = accessor.get(IModelService);
        const editorService = accessor.get(IEditorService);
        const codeEditorService = accessor.get(ICodeEditorService);
        const hostService = accessor.get(IHostService);
        const environmentService = accessor.get(INativeWorkbenchEnvironmentService);
        const loggerService = accessor.get(ILoggerService);
        const fileService = accessor.get(IFileService);
        const pathInTemp = joinPath(environmentService.tmpDir, `vcode-tm-log-${generateUuid()}.txt`);
        await fileService.createFile(pathInTemp);
        const logger = loggerService.createLogger(pathInTemp, { name: 'debug textmate' });
        const model = this._getOrCreateModel(modelService);
        const append = (str) => {
            this._append(model, str + '\n');
            scrollEditor();
            logger.info(str);
            logger.flush();
        };
        await hostService.openWindow([{ fileUri: pathInTemp }], { forceNewWindow: true });
        const textEditorPane = await editorService.openEditor({
            resource: model.uri,
            options: { pinned: true }
        });
        if (!textEditorPane) {
            return;
        }
        const scrollEditor = () => {
            const editors = codeEditorService.listCodeEditors();
            for (const editor of editors) {
                if (editor.hasModel()) {
                    if (editor.getModel().uri.toString() === StartDebugTextMate.resource.toString()) {
                        editor.revealLine(editor.getModel().getLineCount());
                    }
                }
            }
        };
        append(`// Open the file you want to test to the side and watch here`);
        append(`// Output mirrored at ${pathInTemp}`);
        textMateService.startDebugMode((str) => {
            this._append(model, str + '\n');
            scrollEditor();
            logger.info(str);
            logger.flush();
        }, () => {
        });
    }
}
registerAction2(StartDebugTextMate);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhcnREZWJ1Z1RleHRNYXRlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY29kZUVkaXRvci9lbGVjdHJvbi1icm93c2VyL3N0YXJ0RGVidWdUZXh0TWF0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUMxRixPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUNqSCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDL0QsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFHOUYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBQzFILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRzFFLE1BQU0sa0JBQW1CLFNBQVEs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