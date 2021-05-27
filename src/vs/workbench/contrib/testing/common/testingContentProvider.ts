/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ITextModelContentProvider, ITextModelService } from 'vs/editor/common/services/resolverService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { parseTestUri, TestUriType, TEST_DATA_SCHEME } from 'vs/workbench/contrib/testing/common/testingUri';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';

/**
 * A content provider that returns various outputs for tests. This is used
 * in the inline peek view.
 */
export class TestingContentProvider implements IWorkbenchContribution, ITextModelContentProvider {
	constructor(
		@ITextModelService textModelResolverService: ITextModelService,
		@IModelService private readonly modelService: IModelService,
		@ITestService private readonly testService: ITestService,
		@ITestService private readonly resultService: ITestResultService,
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

		const test = 'providerId' in parsed
			? await this.testService.lookupTest({ providerId: parsed.providerId, testId: parsed.testId })
			: this.resultService.lookup(parsed.resultId)?.tests.find(t => t.id === parsed.testId);

		if (!test) {
			return null;
		}

		let text: string | undefined;
		switch (parsed.type) {
			case TestUriType.ResultActualOutput:
			case TestUriType.LiveActualOutput:
				text = test.item.state.messages[parsed.messageIndex]?.actualOutput;
				break;
			case TestUriType.ResultExpectedOutput:
			case TestUriType.LiveExpectedOutput:
				text = test.item.state.messages[parsed.messageIndex]?.expectedOutput;
				break;
			case TestUriType.ResultMessage:
			case TestUriType.LiveMessage:
				text = test.item.state.messages[parsed.messageIndex]?.message.toString();
				break;
		}

		if (text === undefined) {
			return null;
		}

		return this.modelService.createModel(text, null, resource, true);
	}
}
