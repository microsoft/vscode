/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
const LOG_PREFIX = '[GitHubRepositoryModel]';
/**
 * Reactive model for a GitHub repository. Wraps fetcher data
 * in observables and supports on-demand refresh.
 */
export class GitHubRepositoryModel extends Disposable {
    constructor(owner, repo, _fetcher, _logService) {
        super();
        this.owner = owner;
        this.repo = repo;
        this._fetcher = _fetcher;
        this._logService = _logService;
        this._repository = observableValue(this, undefined);
        this.repository = this._repository;
    }
    async refresh() {
        try {
            const data = await this._fetcher.getRepository(this.owner, this.repo);
            this._repository.set(data, undefined);
        }
        catch (err) {
            this._logService.error(`${LOG_PREFIX} Failed to refresh repository ${this.owner}/${this.repo}:`, err);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViUmVwb3NpdG9yeU1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9naXRodWIvYnJvd3Nlci9tb2RlbHMvZ2l0aHViUmVwb3NpdG9yeU1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRSxPQUFPLEVBQWUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFLeEYsTUFBTSxVQUFVLEdBQUcseUJBQXlCLENBQUM7QUFFN0M7OztHQUdHO0FBQ0gsTUFBTSxPQUFPLHFCQUFzQixTQUFRLFVBQVU7SUFLcEQsWUFDVSxLQUFhLEVBQ2IsSUFBWSxFQUNKLFFBQWlDLEVBQ2pDLFdBQXdCO1FBRXpDLEtBQUssRUFBRSxDQUFDO1FBTEMsVUFBSyxHQUFMLEtBQUssQ0FBUTtRQUNiLFNBQUksR0FBSixJQUFJLENBQVE7UUFDSixhQUFRLEdBQVIsUUFBUSxDQUF5QjtRQUNqQyxnQkFBVyxHQUFYLFdBQVcsQ0FBYTtRQVB6QixnQkFBVyxHQUFHLGVBQWUsQ0FBZ0MsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3RGLGVBQVUsR0FBK0MsSUFBSSxDQUFDLFdBQVcsQ0FBQztJQVNuRixDQUFDO0lBRUQsS0FBSyxDQUFDLE9BQU87UUFDWixJQUFJLENBQUM7WUFDSixNQUFNLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3RFLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztRQUN2QyxDQUFDO1FBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNkLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEdBQUcsVUFBVSxpQ0FBaUMsSUFBSSxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUMsSUFBSSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDdkcsQ0FBQztJQUNGLENBQUM7Q0FDRCJ9