/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { derivedHandleChanges, observableValue, runOnChange, autorun, derived } from '../../../../../base/common/observable.js';
import { StringEdit, StringReplacement } from '../../../../../editor/common/core/edits/stringEdit.js';
import { EditSources } from '../../../../../editor/common/textModelEditSource.js';
export class ObservableWorkspace {
    constructor() {
        this._version = 0;
        /**
         * Is fired when any open document changes.
        */
        this.onDidOpenDocumentChange = derivedHandleChanges({
            owner: this,
            changeTracker: {
                createChangeSummary: () => ({ didChange: false }),
                handleChange: (ctx, changeSummary) => {
                    if (!ctx.didChange(this.documents)) {
                        changeSummary.didChange = true; // A document changed
                    }
                    return true;
                }
            }
        }, (reader, changeSummary) => {
            const docs = this.documents.read(reader);
            for (const d of docs) {
                d.value.read(reader); // add dependency
            }
            if (changeSummary.didChange) {
                this._version++; // to force a change
            }
            return this._version;
            // TODO@hediet make this work:
            /*
            const docs = this.openDocuments.read(reader);
            for (const d of docs) {
                if (reader.readChangesSinceLastRun(d.value).length > 0) {
                    reader.reportChange(d);
                }
            }
            return undefined;
            */
        });
        this.lastActiveDocument = derived((reader) => {
            const obs = observableValue('lastActiveDocument', undefined);
            reader.store.add(autorun((reader) => {
                const docs = this.documents.read(reader);
                for (const d of docs) {
                    reader.store.add(runOnChange(d.value, () => {
                        obs.set(d, undefined);
                    }));
                }
            }));
            return obs;
        }).flatten();
    }
    getFirstOpenDocument() {
        return this.documents.get()[0];
    }
    getDocument(documentId) {
        return this.documents.get().find(d => d.uri.toString() === documentId.toString());
    }
}
export class StringEditWithReason extends StringEdit {
    static replace(range, newText, source = EditSources.unknown({})) {
        return new StringEditWithReason([new StringReplacement(range, newText)], source);
    }
    constructor(replacements, reason) {
        super(replacements);
        this.reason = reason;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib2JzZXJ2YWJsZVdvcmtzcGFjZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2VkaXRUZWxlbWV0cnkvYnJvd3Nlci9oZWxwZXJzL29ic2VydmFibGVXb3Jrc3BhY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUF5QixvQkFBb0IsRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFlLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVwSyxPQUFPLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFHdEcsT0FBTyxFQUFFLFdBQVcsRUFBdUIsTUFBTSxxREFBcUQsQ0FBQztBQUV2RyxNQUFNLE9BQWdCLG1CQUFtQjtJQUF6QztRQVlTLGFBQVEsR0FBRyxDQUFDLENBQUM7UUFFckI7O1VBRUU7UUFDYyw0QkFBdUIsR0FBRyxvQkFBb0IsQ0FBQztZQUM5RCxLQUFLLEVBQUUsSUFBSTtZQUNYLGFBQWEsRUFBRTtnQkFDZCxtQkFBbUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxDQUFDO2dCQUNqRCxZQUFZLEVBQUUsQ0FBQyxHQUFHLEVBQUUsYUFBYSxFQUFFLEVBQUU7b0JBQ3BDLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO3dCQUNwQyxhQUFhLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxDQUFDLHFCQUFxQjtvQkFDdEQsQ0FBQztvQkFDRCxPQUFPLElBQUksQ0FBQztnQkFDYixDQUFDO2FBQ0Q7U0FDRCxFQUFFLENBQUMsTUFBTSxFQUFFLGFBQWEsRUFBRSxFQUFFO1lBQzVCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3pDLEtBQUssTUFBTSxDQUFDLElBQUksSUFBSSxFQUFFLENBQUM7Z0JBQ3RCLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsaUJBQWlCO1lBQ3hDLENBQUM7WUFDRCxJQUFJLGFBQWEsQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDN0IsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsb0JBQW9CO1lBQ3RDLENBQUM7WUFDRCxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUM7WUFFckIsOEJBQThCO1lBQzlCOzs7Ozs7OztjQVFFO1FBQ0gsQ0FBQyxDQUFDLENBQUM7UUFFYSx1QkFBa0IsR0FBRyxPQUFPLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUN2RCxNQUFNLEdBQUcsR0FBRyxlQUFlLENBQUMsb0JBQW9CLEVBQUUsU0FBNEMsQ0FBQyxDQUFDO1lBQ2hHLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO2dCQUNuQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDekMsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQztvQkFDdEIsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFO3dCQUMxQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztvQkFDdkIsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDTCxDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNKLE9BQU8sR0FBRyxDQUFDO1FBQ1osQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDZCxDQUFDO0lBMURBLG9CQUFvQjtRQUNuQixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUVELFdBQVcsQ0FBQyxVQUFlO1FBQzFCLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxLQUFLLFVBQVUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQ25GLENBQUM7Q0FvREQ7QUFhRCxNQUFNLE9BQU8sb0JBQXFCLFNBQVEsVUFBVTtJQUM1QyxNQUFNLENBQVUsT0FBTyxDQUFDLEtBQWtCLEVBQUUsT0FBZSxFQUFFLFNBQThCLFdBQVcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBQ3hILE9BQU8sSUFBSSxvQkFBb0IsQ0FBQyxDQUFDLElBQUksaUJBQWlCLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDbEYsQ0FBQztJQUVELFlBQ0MsWUFBd0MsRUFDeEIsTUFBMkI7UUFFM0MsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRkosV0FBTSxHQUFOLE1BQU0sQ0FBcUI7SUFHNUMsQ0FBQztDQUNEIn0=