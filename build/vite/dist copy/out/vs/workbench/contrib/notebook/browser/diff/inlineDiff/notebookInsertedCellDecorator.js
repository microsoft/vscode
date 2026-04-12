/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { NotebookOverviewRulerLane } from '../../notebookBrowser.js';
import { overviewRulerAddedForeground } from '../../../../scm/common/quickDiff.js';
export class NotebookInsertedCellDecorator extends Disposable {
    constructor(notebookEditor) {
        super();
        this.notebookEditor = notebookEditor;
        this.decorators = this._register(new DisposableStore());
    }
    apply(diffInfo) {
        const model = this.notebookEditor.textModel;
        if (!model) {
            return;
        }
        const cells = diffInfo.filter(diff => diff.type === 'insert').map((diff) => model.cells[diff.modifiedCellIndex]);
        const ids = this.notebookEditor.deltaCellDecorations([], cells.map(cell => ({
            handle: cell.handle,
            options: {
                className: 'nb-insertHighlight', outputClassName: 'nb-insertHighlight', overviewRuler: {
                    color: overviewRulerAddedForeground,
                    modelRanges: [],
                    includeOutput: true,
                    position: NotebookOverviewRulerLane.Full
                }
            }
        })));
        this.clear();
        this.decorators.add(toDisposable(() => {
            if (!this.notebookEditor.isDisposed) {
                this.notebookEditor.deltaCellDecorations(ids, []);
            }
        }));
    }
    clear() {
        this.decorators.clear();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tJbnNlcnRlZENlbGxEZWNvcmF0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2RpZmYvaW5saW5lRGlmZi9ub3RlYm9va0luc2VydGVkQ2VsbERlY29yYXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUV2RyxPQUFPLEVBQW1CLHlCQUF5QixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDdEYsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFbkYsTUFBTSxPQUFPLDZCQUE4QixTQUFRLFVBQVU7SUFFNUQsWUFDa0IsY0FBK0I7UUFFaEQsS0FBSyxFQUFFLENBQUM7UUFGUyxtQkFBYyxHQUFkLGNBQWMsQ0FBaUI7UUFGaEMsZUFBVSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxlQUFlLEVBQUUsQ0FBQyxDQUFDO0lBTXBFLENBQUM7SUFDTSxLQUFLLENBQUMsUUFBd0I7UUFDcEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUM7UUFDNUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osT0FBTztRQUNSLENBQUM7UUFDRCxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxRQUFRLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztRQUNqSCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLG9CQUFvQixDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMzRSxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU07WUFDbkIsT0FBTyxFQUFFO2dCQUNSLFNBQVMsRUFBRSxvQkFBb0IsRUFBRSxlQUFlLEVBQUUsb0JBQW9CLEVBQUUsYUFBYSxFQUFFO29CQUN0RixLQUFLLEVBQUUsNEJBQTRCO29CQUNuQyxXQUFXLEVBQUUsRUFBRTtvQkFDZixhQUFhLEVBQUUsSUFBSTtvQkFDbkIsUUFBUSxFQUFFLHlCQUF5QixDQUFDLElBQUk7aUJBQ3hDO2FBQ0Q7U0FDRCxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2IsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRTtZQUNyQyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDckMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDbkQsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBQ00sS0FBSztRQUNYLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDekIsQ0FBQztDQUNEIn0=