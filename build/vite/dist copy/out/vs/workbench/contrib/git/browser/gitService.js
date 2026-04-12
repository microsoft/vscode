/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValueOpts } from '../../../../base/common/observable.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { AutoOpenBarrier } from '../../../../base/common/async.js';
import { ILogService } from '../../../../platform/log/common/log.js';
let GitService = class GitService extends Disposable {
    get repositories() {
        return this._delegate?.repositories ?? [];
    }
    constructor(logService) {
        super();
        this.logService = logService;
        this._delegateBarrier = new AutoOpenBarrier(10_000);
    }
    setDelegate(delegate) {
        // The delegate can only be set once, since the vscode.git
        // extension can only run in one extension host process per
        // window.
        if (this._delegate) {
            this.logService.error('[GitService][setDelegate] GitExtension delegate is already set.');
            throw new BugIndicatingError('GitExtension delegate is already set.');
        }
        this._delegate = delegate;
        this._delegateBarrier.open();
        return toDisposable(() => {
            this._delegate = undefined;
        });
    }
    async openRepository(uri) {
        // We need to wait for the delegate to be set before we can open a repository.
        // At the moment we are waiting for 10 seconds before we automatically open the
        // barrier.
        await this._delegateBarrier.wait();
        if (!this._delegate) {
            this.logService.warn('[GitService][openRepository] GitExtension delegate is not set after 10 seconds. Cannot open repository.');
            return undefined;
        }
        return this._delegate.openRepository(uri);
    }
};
GitService = __decorate([
    __param(0, ILogService)
], GitService);
export { GitService };
export class GitRepository extends Disposable {
    updateState(state) {
        this.state.set(state, undefined);
    }
    constructor(rootUri, initialState, delegate) {
        super();
        this.delegate = delegate;
        this.rootUri = rootUri;
        this.state = observableValueOpts({ owner: this, equalsFn: structuralEquals }, initialState);
    }
    async getRefs(query, token) {
        return this.delegate.getRefs(this.rootUri, query, token);
    }
    async diffBetweenWithStats(ref1, ref2, path) {
        return this.delegate.diffBetweenWithStats(this.rootUri, ref1, ref2, path);
    }
    async diffBetweenWithStats2(ref, path) {
        return this.delegate.diffBetweenWithStats2(this.rootUri, ref, path);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2dpdC9icm93c2VyL2dpdFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdkUsT0FBTyxFQUFFLFVBQVUsRUFBZSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUc3RixPQUFPLEVBQXVCLG1CQUFtQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDakcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDckUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUU5RCxJQUFNLFVBQVUsR0FBaEIsTUFBTSxVQUFXLFNBQVEsVUFBVTtJQU16QyxJQUFJLFlBQVk7UUFDZixPQUFPLElBQUksQ0FBQyxTQUFTLEVBQUUsWUFBWSxJQUFJLEVBQUUsQ0FBQztJQUMzQyxDQUFDO0lBRUQsWUFBeUIsVUFBd0M7UUFDaEUsS0FBSyxFQUFFLENBQUM7UUFEaUMsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQU56RCxxQkFBZ0IsR0FBRyxJQUFJLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQVF2RCxDQUFDO0lBRUQsV0FBVyxDQUFDLFFBQStCO1FBQzFDLDBEQUEwRDtRQUMxRCwyREFBMkQ7UUFDM0QsVUFBVTtRQUNWLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3BCLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLGlFQUFpRSxDQUFDLENBQUM7WUFDekYsTUFBTSxJQUFJLGtCQUFrQixDQUFDLHVDQUF1QyxDQUFDLENBQUM7UUFDdkUsQ0FBQztRQUVELElBQUksQ0FBQyxTQUFTLEdBQUcsUUFBUSxDQUFDO1FBQzFCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUU3QixPQUFPLFlBQVksQ0FBQyxHQUFHLEVBQUU7WUFDeEIsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7UUFDNUIsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLGNBQWMsQ0FBQyxHQUFRO1FBQzVCLDhFQUE4RTtRQUM5RSwrRUFBK0U7UUFDL0UsV0FBVztRQUNYLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksRUFBRSxDQUFDO1FBRW5DLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDckIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMseUdBQXlHLENBQUMsQ0FBQztZQUNoSSxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUMzQyxDQUFDO0NBQ0QsQ0FBQTtBQTVDWSxVQUFVO0lBVVQsV0FBQSxXQUFXLENBQUE7R0FWWixVQUFVLENBNEN0Qjs7QUFFRCxNQUFNLE9BQU8sYUFBYyxTQUFRLFVBQVU7SUFJNUMsV0FBVyxDQUFDLEtBQXlCO1FBQ3BDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNsQyxDQUFDO0lBRUQsWUFDQyxPQUFZLEVBQ1osWUFBZ0MsRUFDZixRQUErQjtRQUVoRCxLQUFLLEVBQUUsQ0FBQztRQUZTLGFBQVEsR0FBUixRQUFRLENBQXVCO1FBSWhELElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxLQUFLLEdBQUcsbUJBQW1CLENBQUMsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxnQkFBZ0IsRUFBRSxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQzdGLENBQUM7SUFFRCxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQWtCLEVBQUUsS0FBeUI7UUFDMUQsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztJQUMxRCxDQUFDO0lBRUQsS0FBSyxDQUFDLG9CQUFvQixDQUFDLElBQVksRUFBRSxJQUFZLEVBQUUsSUFBYTtRQUNuRSxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzNFLENBQUM7SUFFRCxLQUFLLENBQUMscUJBQXFCLENBQUMsR0FBVyxFQUFFLElBQWE7UUFDckQsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3JFLENBQUM7Q0FDRCJ9