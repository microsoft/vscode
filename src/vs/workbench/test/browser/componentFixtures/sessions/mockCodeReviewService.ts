/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ICodeReviewService, IPRReviewState, PRReviewStateKind } from '../../../../contrib/sessions/browser/codeReviewService.js';

export function createMockCodeReviewService(): ICodeReviewService {
	return new class extends mock<ICodeReviewService>() {
		private readonly _prReviewState = observableValue<IPRReviewState>('fixture.prReviewState', { kind: PRReviewStateKind.None });

		override getPRReviewState() {
			return this._prReviewState;
		}

		override async resolvePRReviewThread(): Promise<void> { }
		override markPRReviewCommentConverted(): void { }
	}();
}
