/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { derived } from '../../../../../../base/common/observable.js';
import { setTimeout0 } from '../../../../../../base/common/platform.js';
import { isSuggestionInViewport } from '../../model/inlineCompletionsModel.js';
/**
 * Warning: This is not per inline edit id and gets created often.
 * @deprecated TODO@hediet remove
*/
export class ModelPerInlineEdit {
    constructor(_model, inlineEdit, tabAction) {
        this._model = _model;
        this.inlineEdit = inlineEdit;
        this.tabAction = tabAction;
        this.editorType = this._model.editorType;
        this.displayLocation = this.inlineEdit.inlineCompletion.hint;
        this.inViewPort = derived(this, reader => isSuggestionInViewport(this._model.editor, this.inlineEdit.inlineCompletion, reader));
        this.onDidAccept = this._model.onDidAccept;
    }
    accept(alternativeAction) {
        this._model.accept(undefined, alternativeAction);
    }
    handleInlineEditShownNextFrame(viewKind, viewData) {
        const item = this.inlineEdit.inlineCompletion;
        const timeWhenShown = Date.now();
        item.addRef();
        setTimeout0(() => {
            this._model.handleInlineSuggestionShown(item, viewKind, viewData, timeWhenShown);
            item.removeRef();
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lRWRpdHNNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9pbmxpbmVFZGl0c01vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxPQUFPLEVBQWUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNuRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDeEUsT0FBTyxFQUEwQixzQkFBc0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBTXZHOzs7RUFHRTtBQUNGLE1BQU0sT0FBTyxrQkFBa0I7SUFZOUIsWUFDa0IsTUFBOEIsRUFDdEMsVUFBaUMsRUFDakMsU0FBMkM7UUFGbkMsV0FBTSxHQUFOLE1BQU0sQ0FBd0I7UUFDdEMsZUFBVSxHQUFWLFVBQVUsQ0FBdUI7UUFDakMsY0FBUyxHQUFULFNBQVMsQ0FBa0M7UUFFcEQsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQztRQUV6QyxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDO1FBRTdELElBQUksQ0FBQyxVQUFVLEdBQUcsT0FBTyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUNoSSxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDO0lBQzVDLENBQUM7SUFFRCxNQUFNLENBQUMsaUJBQTJCO1FBQ2pDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO0lBQ2xELENBQUM7SUFFRCw4QkFBOEIsQ0FBQyxRQUFrQyxFQUFFLFFBQWtDO1FBQ3BHLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUM7UUFDOUMsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ2pDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNkLFdBQVcsQ0FBQyxHQUFHLEVBQUU7WUFDaEIsSUFBSSxDQUFDLE1BQU0sQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUNqRixJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDbEIsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0NBQ0QifQ==