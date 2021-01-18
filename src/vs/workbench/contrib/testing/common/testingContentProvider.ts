/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ITextModelContentProvider, ITextModelService } from 'vs/editor/common/services/resolverService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ITestingCollectionService } from 'vs/workbench/contrib/testing/common/testingCollectionService';
import { parseTestUri, TestUriType, TEST_DATA_SCHEME } from 'vs/workbench/contrib/testing/common/testingUri';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';

export class TestingContentProvider implements IWorkbenchContribution, ITextModelContentProvider {
	constructor(
		@ITextModelService textModelResolverService: ITextModelService,
		@IModelService private readonly modelService: IModelService,
		@ITestingCollectionService private readonly collection: ITestingCollectionService,
		@ITestService private readonly testService: ITestService,
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

		const test = this.collection.getTestById(resource.authority) ||
			await this.testService.lookupTest({ providerId: parsed.providerId, testId: parsed.testId });
		if (!test) {
			return null;
		}

		let text: string | undefined;
		switch (parsed.type) {
			case TestUriType.ActualOutput:
				text = test.item.state.messages[parsed.messageIndex]?.actualOutput;
				break;
			case TestUriType.ExpectedOutput:
				text = test.item.state.messages[parsed.messageIndex]?.expectedOutput;
				break;
			case TestUriType.Message:
				text = test.item.state.messages[parsed.messageIndex]?.message.toString();
				break;
		}

		if (text === undefined) {
			return null;
		}

		return this.modelService.createModel(text, null, resource, true);
	}
}
