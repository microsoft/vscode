/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { removeAnsiEscapeCodes } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { ILanguageSelection, ILanguageService } from 'vs/editor/common/languages/language';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelContentProvider, ITextModelService } from 'vs/editor/common/services/resolverService';
import { localize } from 'vs/nls';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { TestMessageType } from 'vs/workbench/contrib/testing/common/testTypes';
import { TEST_DATA_SCHEME, TestUriType, parseTestUri } from 'vs/workbench/contrib/testing/common/testingUri';

/**
 * A content provider that returns various outputs for tests. This is used
 * in the inline peek view.
 */
export class TestingContentProvider implements IWorkbenchContribution, ITextModelContentProvider {
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

		if (parsed.type === TestUriType.AllOutput) {
			const stream = await result.getOutput();
			const model = this.modelService.createModel('', null, resource, false);
			const append = (text: string) => model.applyEdits([{
				range: { startColumn: 1, endColumn: 1, startLineNumber: Infinity, endLineNumber: Infinity },
				text,
			}]);

			let hadContent = false;
			stream.on('data', buf => {
				hadContent ||= buf.byteLength > 0;
				append(removeAnsiEscapeCodes(buf.toString()));
			});
			stream.on('end', () => {
				if (!hadContent) {
					append(localize('runNoOutout', 'The test run did not record any output.'));
				}
			});
			model.onWillDispose(() => stream.destroy());
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
					const content = await result!.getOutputRange(message.offset, message.length);
					text = removeAnsiEscapeCodes(content.toString());
				} else if (typeof message.message === 'string') {
					text = message.message;
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
