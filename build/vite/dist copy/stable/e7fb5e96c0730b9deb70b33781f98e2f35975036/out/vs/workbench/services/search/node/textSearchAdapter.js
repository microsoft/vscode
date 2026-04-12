/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as pfs from '../../../../base/node/pfs.js';
import { resultIsMatch } from '../common/search.js';
import { RipgrepTextSearchEngine } from './ripgrepTextSearchEngine.js';
import { NativeTextSearchManager } from './textSearchManager.js';
export class TextSearchEngineAdapter {
    constructor(query, numThreads) {
        this.query = query;
        this.numThreads = numThreads;
    }
    search(token, onResult, onMessage) {
        if ((!this.query.folderQueries || !this.query.folderQueries.length) && (!this.query.extraFileResources || !this.query.extraFileResources.length)) {
            return Promise.resolve({
                type: 'success',
                limitHit: false,
                stats: {
                    type: 'searchProcess'
                },
                messages: []
            });
        }
        const pretendOutputChannel = {
            appendLine(msg) {
                onMessage({ message: msg });
            }
        };
        const textSearchManager = new NativeTextSearchManager(this.query, new RipgrepTextSearchEngine(pretendOutputChannel, this.numThreads), pfs);
        return new Promise((resolve, reject) => {
            return textSearchManager
                .search(matches => {
                onResult(matches.map(fileMatchToSerialized));
            }, token)
                .then(c => resolve({ limitHit: c.limitHit ?? false, type: 'success', stats: c.stats, messages: [] }), reject);
        });
    }
}
function fileMatchToSerialized(match) {
    return {
        path: match.resource && match.resource.fsPath,
        results: match.results,
        numMatches: (match.results || []).reduce((sum, r) => {
            if (resultIsMatch(r)) {
                const m = r;
                return sum + m.rangeLocations.length;
            }
            else {
                return sum + 1;
            }
        }, 0)
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dFNlYXJjaEFkYXB0ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL25vZGUvdGV4dFNlYXJjaEFkYXB0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRCxPQUFPLEVBQThHLGFBQWEsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ2hLLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBRWpFLE1BQU0sT0FBTyx1QkFBdUI7SUFFbkMsWUFBb0IsS0FBaUIsRUFBVSxVQUFtQjtRQUE5QyxVQUFLLEdBQUwsS0FBSyxDQUFZO1FBQVUsZUFBVSxHQUFWLFVBQVUsQ0FBUztJQUFJLENBQUM7SUFFdkUsTUFBTSxDQUFDLEtBQXdCLEVBQUUsUUFBbUQsRUFBRSxTQUE4QztRQUNuSSxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLGtCQUFrQixJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQ2xKLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQztnQkFDdEIsSUFBSSxFQUFFLFNBQVM7Z0JBQ2YsUUFBUSxFQUFFLEtBQUs7Z0JBQ2YsS0FBSyxFQUFFO29CQUNOLElBQUksRUFBRSxlQUFlO2lCQUNyQjtnQkFDRCxRQUFRLEVBQUUsRUFBRTthQUNaLENBQUMsQ0FBQztRQUNKLENBQUM7UUFFRCxNQUFNLG9CQUFvQixHQUFHO1lBQzVCLFVBQVUsQ0FBQyxHQUFXO2dCQUNyQixTQUFTLENBQUMsRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztZQUM3QixDQUFDO1NBQ0QsQ0FBQztRQUNGLE1BQU0saUJBQWlCLEdBQUcsSUFBSSx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksdUJBQXVCLENBQUMsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQzNJLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDdEMsT0FBTyxpQkFBaUI7aUJBQ3RCLE1BQU0sQ0FDTixPQUFPLENBQUMsRUFBRTtnQkFDVCxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7WUFDOUMsQ0FBQyxFQUNELEtBQUssQ0FBQztpQkFDTixJQUFJLENBQ0osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDLFFBQVEsSUFBSSxLQUFLLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFDOUYsTUFBTSxDQUFDLENBQUM7UUFDWCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7Q0FDRDtBQUVELFNBQVMscUJBQXFCLENBQUMsS0FBaUI7SUFDL0MsT0FBTztRQUNOLElBQUksRUFBRSxLQUFLLENBQUMsUUFBUSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTTtRQUM3QyxPQUFPLEVBQUUsS0FBSyxDQUFDLE9BQU87UUFDdEIsVUFBVSxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDbkQsSUFBSSxhQUFhLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDdEIsTUFBTSxDQUFDLEdBQXFCLENBQUMsQ0FBQztnQkFDOUIsT0FBTyxHQUFHLEdBQUcsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUM7WUFDdEMsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE9BQU8sR0FBRyxHQUFHLENBQUMsQ0FBQztZQUNoQixDQUFDO1FBQ0YsQ0FBQyxFQUFFLENBQUMsQ0FBQztLQUNMLENBQUM7QUFDSCxDQUFDIn0=