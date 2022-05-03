/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { ILanguageSelection, ILanguageService } from 'vs/editor/common/languages/language';
import { ITextModelContentProvider, ITextModelService } from 'vs/editor/common/services/resolverService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { TestMessageType } from 'vs/workbench/contrib/testing/common/testTypes';
import { parseTestUri, TestUriType, TEST_DATA_SCHEME } from 'vs/workbench/contrib/testing/common/testingUri';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { removeAnsiEscapeCodes } from 'vs/base/common/strings';

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

		const test = this.resultService.getResult(parsed.resultId)?.getStateById(parsed.testExtId);

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
				if (message) {
					if (typeof message.message === 'string') {
						text = message.type === TestMessageType.Output ? removeAnsiEscapeCodes(message.message) : message.message;
					} else {
						text = message.message.value;
						language = this.languageService.createById('markdown');
					}
				}
				break;
			}
		}

		if (text === undefined) {
			return null;
		}

		return this.modelService.createModel(text, language, resource, false);
	}
}
