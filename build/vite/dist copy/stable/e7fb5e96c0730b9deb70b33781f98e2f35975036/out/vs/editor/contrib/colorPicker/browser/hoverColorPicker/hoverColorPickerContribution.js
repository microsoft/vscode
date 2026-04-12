/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Range } from '../../../../common/core/range.js';
import { ContentHoverController } from '../../../hover/browser/contentHoverController.js';
import { isOnColorDecorator } from './hoverColorPicker.js';
export class HoverColorPickerContribution extends Disposable {
    static { this.ID = 'editor.contrib.colorContribution'; }
    static { this.RECOMPUTE_TIME = 1000; } // ms
    constructor(_editor) {
        super();
        this._editor = _editor;
        this._register(_editor.onMouseDown((e) => this.onMouseDown(e)));
    }
    dispose() {
        super.dispose();
    }
    onMouseDown(mouseEvent) {
        const colorDecoratorsActivatedOn = this._editor.getOption(168 /* EditorOption.colorDecoratorsActivatedOn */);
        if (colorDecoratorsActivatedOn !== 'click' && colorDecoratorsActivatedOn !== 'clickAndHover') {
            return;
        }
        if (!isOnColorDecorator(mouseEvent)) {
            return;
        }
        const hoverController = this._editor.getContribution(ContentHoverController.ID);
        if (!hoverController) {
            return;
        }
        if (hoverController.isColorPickerVisible) {
            return;
        }
        const targetRange = mouseEvent.target.range;
        if (!targetRange) {
            return;
        }
        const range = new Range(targetRange.startLineNumber, targetRange.startColumn + 1, targetRange.endLineNumber, targetRange.endColumn + 1);
        hoverController.showContentHover(range, 1 /* HoverStartMode.Immediate */, 1 /* HoverStartSource.Click */, false);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG92ZXJDb2xvclBpY2tlckNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2NvbG9yUGlja2VyL2Jyb3dzZXIvaG92ZXJDb2xvclBpY2tlci9ob3ZlckNvbG9yUGlja2VyQ29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUdyRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFekQsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFMUYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFM0QsTUFBTSxPQUFPLDRCQUE2QixTQUFRLFVBQVU7YUFFcEMsT0FBRSxHQUFXLGtDQUFrQyxDQUFDO2FBRXZELG1CQUFjLEdBQUcsSUFBSSxDQUFDLEdBQUMsS0FBSztJQUU1QyxZQUE2QixPQUFvQjtRQUVoRCxLQUFLLEVBQUUsQ0FBQztRQUZvQixZQUFPLEdBQVAsT0FBTyxDQUFhO1FBR2hELElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDakUsQ0FBQztJQUVRLE9BQU87UUFDZixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDakIsQ0FBQztJQUVPLFdBQVcsQ0FBQyxVQUE2QjtRQUVoRCxNQUFNLDBCQUEwQixHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxtREFBeUMsQ0FBQztRQUNuRyxJQUFJLDBCQUEwQixLQUFLLE9BQU8sSUFBSSwwQkFBMEIsS0FBSyxlQUFlLEVBQUUsQ0FBQztZQUM5RixPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1lBQ3JDLE9BQU87UUFDUixDQUFDO1FBQ0QsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQXlCLHNCQUFzQixDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3hHLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUN0QixPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksZUFBZSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDMUMsT0FBTztRQUNSLENBQUM7UUFDRCxNQUFNLFdBQVcsR0FBRyxVQUFVLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQztRQUM1QyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDbEIsT0FBTztRQUNSLENBQUM7UUFDRCxNQUFNLEtBQUssR0FBRyxJQUFJLEtBQUssQ0FBQyxXQUFXLENBQUMsZUFBZSxFQUFFLFdBQVcsQ0FBQyxXQUFXLEdBQUcsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxhQUFhLEVBQUUsV0FBVyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN4SSxlQUFlLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxvRUFBb0QsS0FBSyxDQUFDLENBQUM7SUFDbEcsQ0FBQyJ9