/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
export function createMockCodeReviewService() {
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this._reviewState = observableValue('fixture.reviewState', { kind: "idle" /* CodeReviewStateKind.Idle */ });
            this._prReviewState = observableValue('fixture.prReviewState', { kind: "none" /* PRReviewStateKind.None */ });
        }
        getReviewState() {
            return this._reviewState;
        }
        getPRReviewState() {
            return this._prReviewState;
        }
        hasReview() {
            return false;
        }
        requestReview() { }
        removeComment() { }
        updateComment() { }
        dismissReview() { }
        async resolvePRReviewThread() { }
        markPRReviewCommentConverted() { }
    }();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9ja0NvZGVSZXZpZXdTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9jb21wb25lbnRGaXh0dXJlcy9zZXNzaW9ucy9tb2NrQ29kZVJldmlld1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUkvRCxNQUFNLFVBQVUsMkJBQTJCO0lBQzFDLE9BQU8sSUFBSSxLQUFNLFNBQVEsSUFBSSxFQUFzQjtRQUF4Qzs7WUFDTyxpQkFBWSxHQUFHLGVBQWUsQ0FBbUIscUJBQXFCLEVBQUUsRUFBRSxJQUFJLHVDQUEwQixFQUFFLENBQUMsQ0FBQztZQUM1RyxtQkFBYyxHQUFHLGVBQWUsQ0FBaUIsdUJBQXVCLEVBQUUsRUFBRSxJQUFJLHFDQUF3QixFQUFFLENBQUMsQ0FBQztRQW9COUgsQ0FBQztRQWxCUyxjQUFjO1lBQ3RCLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQztRQUMxQixDQUFDO1FBRVEsZ0JBQWdCO1lBQ3hCLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQztRQUM1QixDQUFDO1FBRVEsU0FBUztZQUNqQixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFFUSxhQUFhLEtBQVcsQ0FBQztRQUN6QixhQUFhLEtBQVcsQ0FBQztRQUN6QixhQUFhLEtBQVcsQ0FBQztRQUN6QixhQUFhLEtBQVcsQ0FBQztRQUN6QixLQUFLLENBQUMscUJBQXFCLEtBQW9CLENBQUM7UUFDaEQsNEJBQTRCLEtBQVcsQ0FBQztLQUNqRCxFQUFFLENBQUM7QUFDTCxDQUFDIn0=