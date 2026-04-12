import { TernarySearchTree, UriIterator } from '../../../../base/common/ternarySearchTree.js';
import { ResourceMap } from '../../../../base/common/map.js';
/**
 * A ternary search tree that supports URI keys and query/fragment-aware substring matching, specifically for file search.
 * This is because the traditional TST does not support query and fragments https://github.com/microsoft/vscode/issues/227836
 */
export class FolderQuerySearchTree extends TernarySearchTree {
    constructor(folderQueries, getFolderQueryInfo, ignorePathCasing = () => false) {
        const uriIterator = new UriIterator(ignorePathCasing, () => false);
        super(uriIterator);
        const fqBySameBase = new ResourceMap();
        folderQueries.forEach((fq, i) => {
            const uriWithoutQueryOrFragment = fq.folder.with({ query: '', fragment: '' });
            if (fqBySameBase.has(uriWithoutQueryOrFragment)) {
                fqBySameBase.get(uriWithoutQueryOrFragment).push({ fq, i });
            }
            else {
                fqBySameBase.set(uriWithoutQueryOrFragment, [{ fq, i }]);
            }
        });
        fqBySameBase.forEach((values, key) => {
            const folderQueriesWithQueries = new Map();
            for (const fqBases of values) {
                const folderQueryInfo = getFolderQueryInfo(fqBases.fq, fqBases.i);
                folderQueriesWithQueries.set(this.encodeKey(fqBases.fq.folder), folderQueryInfo);
            }
            super.set(key, folderQueriesWithQueries);
        });
    }
    findQueryFragmentAwareSubstr(key) {
        const baseURIResult = super.findSubstr(key.with({ query: '', fragment: '' }));
        if (!baseURIResult) {
            return undefined;
        }
        const queryAndFragmentKey = this.encodeKey(key);
        return baseURIResult.get(queryAndFragmentKey);
    }
    forEachFolderQueryInfo(fn) {
        return this.forEach(elem => elem.forEach(mapElem => fn(mapElem)));
    }
    encodeKey(key) {
        let str = '';
        if (key.query) {
            str += key.query;
        }
        if (key.fragment) {
            str += '#' + key.fragment;
        }
        return str;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9sZGVyUXVlcnlTZWFyY2hUcmVlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vZm9sZGVyUXVlcnlTZWFyY2hUcmVlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQU1BLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxXQUFXLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFN0Q7OztHQUdHO0FBQ0gsTUFBTSxPQUFPLHFCQUErRCxTQUFRLGlCQUFvRDtJQUN2SSxZQUFZLGFBQWtDLEVBQzdDLGtCQUFvRSxFQUNwRSxtQkFBMEMsR0FBRyxFQUFFLENBQUMsS0FBSztRQUVyRCxNQUFNLFdBQVcsR0FBRyxJQUFJLFdBQVcsQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNuRSxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFbkIsTUFBTSxZQUFZLEdBQUcsSUFBSSxXQUFXLEVBQTBDLENBQUM7UUFDL0UsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUMvQixNQUFNLHlCQUF5QixHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUM5RSxJQUFJLFlBQVksQ0FBQyxHQUFHLENBQUMseUJBQXlCLENBQUMsRUFBRSxDQUFDO2dCQUNqRCxZQUFZLENBQUMsR0FBRyxDQUFDLHlCQUF5QixDQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDOUQsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLFlBQVksQ0FBQyxHQUFHLENBQUMseUJBQXlCLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDMUQsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBQ0gsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsRUFBRTtZQUNwQyxNQUFNLHdCQUF3QixHQUFHLElBQUksR0FBRyxFQUEyQixDQUFDO1lBQ3BFLEtBQUssTUFBTSxPQUFPLElBQUksTUFBTSxFQUFFLENBQUM7Z0JBQzlCLE1BQU0sZUFBZSxHQUFHLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNsRSx3QkFBd0IsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFLGVBQWUsQ0FBQyxDQUFDO1lBQ2xGLENBQUM7WUFDRCxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO1FBQzFDLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELDRCQUE0QixDQUFDLEdBQVE7UUFFcEMsTUFBTSxhQUFhLEdBQUcsS0FBSyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzlFLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUNwQixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBQ0QsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2hELE9BQU8sYUFBYSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0lBRS9DLENBQUM7SUFFRCxzQkFBc0IsQ0FBQyxFQUE4QztRQUNwRSxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNuRSxDQUFDO0lBRU8sU0FBUyxDQUFDLEdBQVE7UUFDekIsSUFBSSxHQUFHLEdBQUcsRUFBRSxDQUFDO1FBQ2IsSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDZixHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQztRQUNsQixDQUFDO1FBQ0QsSUFBSSxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDbEIsR0FBRyxJQUFJLEdBQUcsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDO1FBQzNCLENBQUM7UUFDRCxPQUFPLEdBQUcsQ0FBQztJQUNaLENBQUM7Q0FFRCJ9