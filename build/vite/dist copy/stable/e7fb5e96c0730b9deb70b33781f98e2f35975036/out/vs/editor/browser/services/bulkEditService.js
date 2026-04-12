/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../base/common/uri.js';
import { isObject } from '../../../base/common/types.js';
export const IBulkEditService = createDecorator('IWorkspaceEditService');
export class ResourceEdit {
    constructor(metadata) {
        this.metadata = metadata;
    }
    static convert(edit) {
        return edit.edits.map(edit => {
            if (ResourceTextEdit.is(edit)) {
                return ResourceTextEdit.lift(edit);
            }
            if (ResourceFileEdit.is(edit)) {
                return ResourceFileEdit.lift(edit);
            }
            throw new Error('Unsupported edit');
        });
    }
}
export class ResourceTextEdit extends ResourceEdit {
    static is(candidate) {
        if (candidate instanceof ResourceTextEdit) {
            return true;
        }
        return isObject(candidate)
            && URI.isUri(candidate.resource)
            && isObject(candidate.textEdit);
    }
    static lift(edit) {
        if (edit instanceof ResourceTextEdit) {
            return edit;
        }
        else {
            return new ResourceTextEdit(edit.resource, edit.textEdit, edit.versionId, edit.metadata);
        }
    }
    constructor(resource, textEdit, versionId = undefined, metadata) {
        super(metadata);
        this.resource = resource;
        this.textEdit = textEdit;
        this.versionId = versionId;
    }
}
export class ResourceFileEdit extends ResourceEdit {
    static is(candidate) {
        if (candidate instanceof ResourceFileEdit) {
            return true;
        }
        else {
            return isObject(candidate)
                && (Boolean(candidate.newResource) || Boolean(candidate.oldResource));
        }
    }
    static lift(edit) {
        if (edit instanceof ResourceFileEdit) {
            return edit;
        }
        else {
            return new ResourceFileEdit(edit.oldResource, edit.newResource, edit.options, edit.metadata);
        }
    }
    constructor(oldResource, newResource, options = {}, metadata) {
        super(metadata);
        this.oldResource = oldResource;
        this.newResource = newResource;
        this.options = options;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVsa0VkaXRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUcxRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBS3pELE1BQU0sQ0FBQyxNQUFNLGdCQUFnQixHQUFHLGVBQWUsQ0FBbUIsdUJBQXVCLENBQUMsQ0FBQztBQUUzRixNQUFNLE9BQU8sWUFBWTtJQUV4QixZQUErQixRQUFnQztRQUFoQyxhQUFRLEdBQVIsUUFBUSxDQUF3QjtJQUFJLENBQUM7SUFFcEUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFtQjtRQUVqQyxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQzVCLElBQUksZ0JBQWdCLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7Z0JBQy9CLE9BQU8sZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3BDLENBQUM7WUFFRCxJQUFJLGdCQUFnQixDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUMvQixPQUFPLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNwQyxDQUFDO1lBQ0QsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ3JDLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLGdCQUFpQixTQUFRLFlBQVk7SUFFakQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxTQUFrQjtRQUMzQixJQUFJLFNBQVMsWUFBWSxnQkFBZ0IsRUFBRSxDQUFDO1lBQzNDLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELE9BQU8sUUFBUSxDQUFDLFNBQVMsQ0FBQztlQUN0QixHQUFHLENBQUMsS0FBSyxDQUFzQixTQUFVLENBQUMsUUFBUSxDQUFDO2VBQ25ELFFBQVEsQ0FBc0IsU0FBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3hELENBQUM7SUFFRCxNQUFNLENBQUMsSUFBSSxDQUFDLElBQXdCO1FBQ25DLElBQUksSUFBSSxZQUFZLGdCQUFnQixFQUFFLENBQUM7WUFDdEMsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO2FBQU0sQ0FBQztZQUNQLE9BQU8sSUFBSSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDMUYsQ0FBQztJQUNGLENBQUM7SUFFRCxZQUNVLFFBQWEsRUFDYixRQUE0RSxFQUM1RSxZQUFnQyxTQUFTLEVBQ2xELFFBQWdDO1FBRWhDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUxQLGFBQVEsR0FBUixRQUFRLENBQUs7UUFDYixhQUFRLEdBQVIsUUFBUSxDQUFvRTtRQUM1RSxjQUFTLEdBQVQsU0FBUyxDQUFnQztJQUluRCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sZ0JBQWlCLFNBQVEsWUFBWTtJQUVqRCxNQUFNLENBQUMsRUFBRSxDQUFDLFNBQWtCO1FBQzNCLElBQUksU0FBUyxZQUFZLGdCQUFnQixFQUFFLENBQUM7WUFDM0MsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO2FBQU0sQ0FBQztZQUNQLE9BQU8sUUFBUSxDQUFDLFNBQVMsQ0FBQzttQkFDdEIsQ0FBQyxPQUFPLENBQXNCLFNBQVUsQ0FBQyxXQUFXLENBQUMsSUFBSSxPQUFPLENBQXNCLFNBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO1FBQ3BILENBQUM7SUFDRixDQUFDO0lBRUQsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUF3QjtRQUNuQyxJQUFJLElBQUksWUFBWSxnQkFBZ0IsRUFBRSxDQUFDO1lBQ3RDLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLElBQUksZ0JBQWdCLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzlGLENBQUM7SUFDRixDQUFDO0lBRUQsWUFDVSxXQUE0QixFQUM1QixXQUE0QixFQUM1QixVQUFvQyxFQUFFLEVBQy9DLFFBQWdDO1FBRWhDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUxQLGdCQUFXLEdBQVgsV0FBVyxDQUFpQjtRQUM1QixnQkFBVyxHQUFYLFdBQVcsQ0FBaUI7UUFDNUIsWUFBTyxHQUFQLE9BQU8sQ0FBK0I7SUFJaEQsQ0FBQztDQUNEIn0=