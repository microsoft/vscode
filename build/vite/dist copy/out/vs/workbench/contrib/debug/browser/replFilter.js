/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { matchesFuzzy } from '../../../../base/common/filters.js';
import { splitGlobAware } from '../../../../base/common/glob.js';
import { ReplEvaluationResult, ReplEvaluationInput } from '../common/replModel.js';
import { Variable } from '../common/debugModel.js';
export class ReplFilter {
    constructor() {
        this._parsedQueries = [];
    }
    static { this.matchQuery = matchesFuzzy; }
    set filterQuery(query) {
        this._parsedQueries = [];
        query = query.trim();
        if (query && query !== '') {
            const filters = splitGlobAware(query, ',').map(s => s.trim()).filter(s => !!s.length);
            for (const f of filters) {
                if (f.startsWith('\\')) {
                    this._parsedQueries.push({ type: 'include', query: f.slice(1) });
                }
                else if (f.startsWith('!')) {
                    this._parsedQueries.push({ type: 'exclude', query: f.slice(1) });
                }
                else {
                    this._parsedQueries.push({ type: 'include', query: f });
                }
            }
        }
    }
    filter(element, parentVisibility) {
        if (element instanceof ReplEvaluationInput || element instanceof ReplEvaluationResult || element instanceof Variable) {
            // Only filter the output events, everything else is visible https://github.com/microsoft/vscode/issues/105863
            return 1 /* TreeVisibility.Visible */;
        }
        let includeQueryPresent = false;
        let includeQueryMatched = false;
        const text = element.toString(true);
        for (const { type, query } of this._parsedQueries) {
            if (type === 'exclude' && ReplFilter.matchQuery(query, text)) {
                // If exclude query matches, ignore all other queries and hide
                return false;
            }
            else if (type === 'include') {
                includeQueryPresent = true;
                if (ReplFilter.matchQuery(query, text)) {
                    includeQueryMatched = true;
                }
            }
        }
        return includeQueryPresent ? includeQueryMatched : (typeof parentVisibility !== 'undefined' ? parentVisibility : 1 /* TreeVisibility.Visible */);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwbEZpbHRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvcmVwbEZpbHRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQWMsWUFBWSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDOUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBR2pFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ25GLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQVFuRCxNQUFNLE9BQU8sVUFBVTtJQUF2QjtRQUlTLG1CQUFjLEdBQWtCLEVBQUUsQ0FBQztJQTRDNUMsQ0FBQzthQTlDTyxlQUFVLEdBQUcsWUFBWSxBQUFmLENBQWdCO0lBR2pDLElBQUksV0FBVyxDQUFDLEtBQWE7UUFDNUIsSUFBSSxDQUFDLGNBQWMsR0FBRyxFQUFFLENBQUM7UUFDekIsS0FBSyxHQUFHLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUVyQixJQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssRUFBRSxFQUFFLENBQUM7WUFDM0IsTUFBTSxPQUFPLEdBQUcsY0FBYyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3RGLEtBQUssTUFBTSxDQUFDLElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQ3pCLElBQUksQ0FBQyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO29CQUN4QixJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNsRSxDQUFDO3FCQUFNLElBQUksQ0FBQyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUM5QixJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNsRSxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN6RCxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRUQsTUFBTSxDQUFDLE9BQXFCLEVBQUUsZ0JBQWdDO1FBQzdELElBQUksT0FBTyxZQUFZLG1CQUFtQixJQUFJLE9BQU8sWUFBWSxvQkFBb0IsSUFBSSxPQUFPLFlBQVksUUFBUSxFQUFFLENBQUM7WUFDdEgsOEdBQThHO1lBQzlHLHNDQUE4QjtRQUMvQixDQUFDO1FBRUQsSUFBSSxtQkFBbUIsR0FBRyxLQUFLLENBQUM7UUFDaEMsSUFBSSxtQkFBbUIsR0FBRyxLQUFLLENBQUM7UUFFaEMsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVwQyxLQUFLLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLElBQUksSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ25ELElBQUksSUFBSSxLQUFLLFNBQVMsSUFBSSxVQUFVLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUM5RCw4REFBOEQ7Z0JBQzlELE9BQU8sS0FBSyxDQUFDO1lBQ2QsQ0FBQztpQkFBTSxJQUFJLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDL0IsbUJBQW1CLEdBQUcsSUFBSSxDQUFDO2dCQUMzQixJQUFJLFVBQVUsQ0FBQyxVQUFVLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUM7b0JBQ3hDLG1CQUFtQixHQUFHLElBQUksQ0FBQztnQkFDNUIsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxnQkFBZ0IsS0FBSyxXQUFXLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUMsK0JBQXVCLENBQUMsQ0FBQztJQUMxSSxDQUFDIn0=