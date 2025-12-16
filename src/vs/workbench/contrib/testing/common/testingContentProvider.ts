/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { removeAnsiEscapeCodes } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { ILanguageSelection, ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ITestResultService } from './testResultService.js';
import { TestMessageType } from './testTypes.js';
import { TEST_DATA_SCHEME, TestUriType, parseTestUri } from './testingUri.js';

/**
 * A content provider that returns various outputs for tests. This is used
 * in the inline peek view.
 */
export class TestingContentProvider implements IWorkbenchContribution, ITextModelContentProvider {
	public static readonly ID = 'workbench.contrib.testing.contentProvider';

	constructor(
		@ITextModelService textModelResolverService: ITextModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IModelService private readonly modelService: IModelService,
		@ITestResultService private readonly resultService: ITestResultService,
	) {
		textModelResolverService.registerTextModelContentProvider(TEST_DATA_SCHEME, this);
	}

	/**
	 * @inheritdoc
	 */
	public async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this.modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}

		const parsed = parseTestUri(resource);
		if (!parsed) {
			return null;
		}

		const result = this.resultService.getResult(parsed.resultId);
		if (!result) {
			return null;
		}

		if (parsed.type === TestUriType.TaskOutput) {
			const task = result.tasks[parsed.taskIndex];
			const model = this.modelService.createModel('', null, resource, false);
			const append = (text: string) => model.applyEdits([{
				range: { startColumn: 1, endColumn: 1, startLineNumber: Infinity, endLineNumber: Infinity },
				text,
			}]);

			const init = VSBuffer.concat(task.output.buffers, task.output.length).toString();
			append(removeAnsiEscapeCodes(init));

			let hadContent = init.length > 0;
			const dispose = new DisposableStore();
			dispose.add(task.output.onDidWriteData(d => {
				hadContent ||= d.byteLength > 0;
				append(removeAnsiEscapeCodes(d.toString()));
			}));
			task.output.endPromise.then(() => {
				if (dispose.isDisposed) {
					return;
				}
				if (!hadContent) {
					append(localize('runNoOutout', 'The test run did not record any output.'));
					dispose.dispose();
				}
			});
			model.onWillDispose(() => dispose.dispose());

			return model;
		}

		const test = result?.getStateById(parsed.testExtId);
		if (!test) {
			return null;
		}

		let text: string | undefined;
		let language: ILanguageSelection | null = null;
		switch (parsed.type) {
			case TestUriType.ResultActualOutput: {
				const message = test.tasks[parsed.taskIndex].messages[parsed.messageIndex];
				if (message?.type === TestMessageType.Error) { text = message.actual; }
				break;
			}
			case TestUriType.TestOutput: {
				text = '';
				const output = result.tasks[parsed.taskIndex].output;
				for (const message of test.tasks[parsed.taskIndex].messages) {
					if (message.type === TestMessageType.Output) {
						text += removeAnsiEscapeCodes(output.getRange(message.offset, message.length).toString());
					}
				}
				break;
			}
			case TestUriType.ResultExpectedOutput: {
				const message = test.tasks[parsed.taskIndex].messages[parsed.messageIndex];
				if (message?.type === TestMessageType.Error) { text = message.expected; }
				break;
			}
			case TestUriType.ResultMessage: {
				const message = test.tasks[parsed.taskIndex].messages[parsed.messageIndex];
				if (!message) {
					break;
				}

				if (message.type === TestMessageType.Output) {
					const content = result.tasks[parsed.taskIndex].output.getRange(message.offset, message.length);
					text = removeAnsiEscapeCodes(content.toString());
				} else if (typeof message.message === 'string') {
					text = removeAnsiEscapeCodes(message.message);
				} else {
					text = message.message.value;
					language = this.languageService.createById('markdown');
				}
			}
		}

		if (text === undefined) {
			return null;
		}

		return this.modelService.createModel(text, language, resource, false);
	}
}
