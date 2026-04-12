/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EditorInput } from '../../../common/editor/editorInput.js';
import { URI } from '../../../../base/common/uri.js';
import { Schemas } from '../../../../base/common/network.js';
export class ImageCarouselEditorInput extends EditorInput {
    static { this.ID = 'workbench.input.imageCarousel'; }
    get capabilities() {
        return super.capabilities | 8 /* EditorInputCapabilities.Singleton */ | 2048 /* EditorInputCapabilities.RequiresModal */;
    }
    constructor(collection, startIndex = 0) {
        super();
        this.collection = collection;
        this.startIndex = startIndex;
        this._resource = URI.from({
            scheme: Schemas.vscodeImageCarousel,
            path: `/${encodeURIComponent(collection.id)}`,
        });
        this._name = collection.title;
    }
    get typeId() {
        return ImageCarouselEditorInput.ID;
    }
    get resource() {
        return this._resource;
    }
    getName() {
        return this._name;
    }
    setName(name) {
        if (this._name !== name) {
            this._name = name;
            this._onDidChangeLabel.fire();
        }
    }
    matches(other) {
        if (other instanceof ImageCarouselEditorInput) {
            return other.collection.id === this.collection.id;
        }
        return false;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1hZ2VDYXJvdXNlbEVkaXRvcklucHV0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvaW1hZ2VDYXJvdXNlbC9icm93c2VyL2ltYWdlQ2Fyb3VzZWxFZGl0b3JJbnB1dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFcEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUc3RCxNQUFNLE9BQU8sd0JBQXlCLFNBQVEsV0FBVzthQUN4QyxPQUFFLEdBQUcsK0JBQStCLENBQUM7SUFLckQsSUFBYSxZQUFZO1FBQ3hCLE9BQU8sS0FBSyxDQUFDLFlBQVksNENBQW9DLG1EQUF3QyxDQUFDO0lBQ3ZHLENBQUM7SUFFRCxZQUNpQixVQUFvQyxFQUNwQyxhQUFxQixDQUFDO1FBRXRDLEtBQUssRUFBRSxDQUFDO1FBSFEsZUFBVSxHQUFWLFVBQVUsQ0FBMEI7UUFDcEMsZUFBVSxHQUFWLFVBQVUsQ0FBWTtRQUd0QyxJQUFJLENBQUMsU0FBUyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUM7WUFDekIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxtQkFBbUI7WUFDbkMsSUFBSSxFQUFFLElBQUksa0JBQWtCLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxFQUFFO1NBQzdDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxLQUFLLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQztJQUMvQixDQUFDO0lBRUQsSUFBSSxNQUFNO1FBQ1QsT0FBTyx3QkFBd0IsQ0FBQyxFQUFFLENBQUM7SUFDcEMsQ0FBQztJQUVELElBQUksUUFBUTtRQUNYLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQztJQUN2QixDQUFDO0lBRVEsT0FBTztRQUNmLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQztJQUNuQixDQUFDO0lBRUQsT0FBTyxDQUFDLElBQVk7UUFDbkIsSUFBSSxJQUFJLENBQUMsS0FBSyxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ3pCLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1lBQ2xCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUMvQixDQUFDO0lBQ0YsQ0FBQztJQUVRLE9BQU8sQ0FBQyxLQUF3QztRQUN4RCxJQUFJLEtBQUssWUFBWSx3QkFBd0IsRUFBRSxDQUFDO1lBQy9DLE9BQU8sS0FBSyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7UUFDbkQsQ0FBQztRQUNELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQyJ9