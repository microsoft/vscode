/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls';
import { Range } from '../../../../editor/common/core/range';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions';
import { Categories } from '../../../../platform/action/common/actionCommonCategories';
import { ITextMateTokenizationService } from '../../../services/textMate/browser/textMateTokenizationFeature';
import { IModelService } from '../../../../editor/common/services/model';
import { IEditorService } from '../../../services/editor/common/editorService';
import { URI } from '../../../../base/common/uri';
import { generateUuid } from '../../../../base/common/uuid';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService';
import { ITextModel } from '../../../../editor/common/model';
import { Constants } from '../../../../base/common/uint';
import { IHostService } from '../../../services/host/browser/host';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-sandbox/environmentService';
import { ILoggerService } from '../../../../platform/log/common/log';
import { joinPath } from '../../../../base/common/resources';
import { IFileService } from '../../../../platform/files/common/files';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation';

class StartDebugTextMate extends Action2 {

	private static resource = URI.parse(`inmemory:///tm-log.txt`);

	constructor() {
		super({
			id: 'editor.action.startDebugTextMate',
			title: nls.localize2('startDebugTextMate', "Start TextMate Syntax Grammar Logging"),
			category: Categories.Developer,
			f1: true
		});
	}

	private _getOrCreateModel(modelService: IModelService): ITextModel {
		const model = modelService.getModel(StartDebugTextMate.resource);
		if (model) {
			return model;
		}
		return modelService.createModel('', null, StartDebugTextMate.resource);
	}

	private _append(model: ITextModel, str: string) {
		const lineCount = model.getLineCount();
		model.applyEdits([{
			range: new Range(lineCount, Constants.MAX_SAFE_SMALL_INTEGER, lineCount, Constants.MAX_SAFE_SMALL_INTEGER),
			text: str
		}]);
	}

	async run(accessor: ServicesAccessor) {
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
		const append = (str: string) => {
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

		textMateService.startDebugMode(
			(str) => {
				this._append(model, str + '\n');
				scrollEditor();
				logger.info(str);
				logger.flush();
			},
			() => {

			}
		);
	}
}

registerAction2(StartDebugTextMate);
