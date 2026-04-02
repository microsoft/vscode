/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
// eslint-disable-next-line local/code-import-patterns
import { CodeReviewStateKind, ICodeReviewService, ICodeReviewState, IPRReviewState, PRReviewStateKind } from '../../../../../sessions/contrib/codeReview/browser/codeReviewService.js';

export function createMockCodeReviewService(): ICodeReviewService {
	return new class extends mock<ICodeReviewService>() {
		private readonly _reviewState = observableValue<ICodeReviewState>('fixture.reviewState', { kind: CodeReviewStateKind.Idle });
		private readonly _prReviewState = observableValue<IPRReviewState>('fixture.prReviewState', { kind: PRReviewStateKind.None });

		override getReviewState() {
			return this._reviewState;
		}

		override getPRReviewState() {
			return this._prReviewState;
		}

		override hasReview(): boolean {
			return false;
		}

		override requestReview(): void { }
		override removeComment(): void { }
		override updateComment(): void { }
		override dismissReview(): void { }
		override async resolvePRReviewThread(): Promise<void> { }
		override markPRReviewCommentConverted(): void { }
	}();
}
