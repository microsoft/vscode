/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { IDocumentDiff, IDocumentDiffProvider, IDocumentDiffProviderOptions } from '../../../common/diff/documentDiffProvider.js';
import { linesDiffComputers } from '../../../common/diff/linesDiffComputers.js';
import { ITextModel } from '../../../common/model.js';
import { Event } from '../../../../base/common/event.js';
import { IDiffProviderFactoryService } from '../../../browser/widget/diffEditor/diffProviderFactoryService.js';

export class TestDiffProviderFactoryService implements IDiffProviderFactoryService {
	declare readonly _serviceBrand: undefined;
	createDiffProvider(): IDocumentDiffProvider {
		return new SyncDocumentDiffProvider();
	}
}

class SyncDocumentDiffProvider implements IDocumentDiffProvider {
	computeDiff(original: ITextModel, modified: ITextModel, options: IDocumentDiffProviderOptions, cancellationToken: CancellationToken): Promise<IDocumentDiff> {
		const result = linesDiffComputers.getDefault().computeDiff(original.getLinesContent(), modified.getLinesContent(), options);
		return Promise.resolve({
			changes: result.changes,
			quitEarly: result.hitTimeout,
			identical: original.getValue() === modified.getValue(),
			moves: result.moves,
		});
	}

	onDidChange: Event<void> = () => toDisposable(() => { });
}
