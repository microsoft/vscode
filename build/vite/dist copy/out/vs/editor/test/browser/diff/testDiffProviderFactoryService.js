/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { linesDiffComputers } from '../../../common/diff/linesDiffComputers.js';
export class TestDiffProviderFactoryService {
    createDiffProvider() {
        return new SyncDocumentDiffProvider();
    }
}
class SyncDocumentDiffProvider {
    constructor() {
        this.onDidChange = () => toDisposable(() => { });
    }
    computeDiff(original, modified, options, cancellationToken) {
        const result = linesDiffComputers.getDefault().computeDiff(original.getLinesContent(), modified.getLinesContent(), options);
        return Promise.resolve({
            changes: result.changes,
            quitEarly: result.hitTimeout,
            identical: original.getValue() === modified.getValue(),
            moves: result.moves,
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdERpZmZQcm92aWRlckZhY3RvcnlTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3Rlc3QvYnJvd3Nlci9kaWZmL3Rlc3REaWZmUHJvdmlkZXJGYWN0b3J5U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFcEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFLaEYsTUFBTSxPQUFPLDhCQUE4QjtJQUUxQyxrQkFBa0I7UUFDakIsT0FBTyxJQUFJLHdCQUF3QixFQUFFLENBQUM7SUFDdkMsQ0FBQztDQUNEO0FBRUQsTUFBTSx3QkFBd0I7SUFBOUI7UUFXVSxnQkFBVyxHQUFnQixHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDbkUsQ0FBQztJQVhBLFdBQVcsQ0FBQyxRQUFvQixFQUFFLFFBQW9CLEVBQUUsT0FBcUMsRUFBRSxpQkFBb0M7UUFDbEksTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsVUFBVSxFQUFFLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxlQUFlLEVBQUUsRUFBRSxRQUFRLENBQUMsZUFBZSxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDNUgsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDO1lBQ3RCLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTztZQUN2QixTQUFTLEVBQUUsTUFBTSxDQUFDLFVBQVU7WUFDNUIsU0FBUyxFQUFFLFFBQVEsQ0FBQyxRQUFRLEVBQUUsS0FBSyxRQUFRLENBQUMsUUFBUSxFQUFFO1lBQ3RELEtBQUssRUFBRSxNQUFNLENBQUMsS0FBSztTQUNuQixDQUFDLENBQUM7SUFDSixDQUFDO0NBR0QifQ==