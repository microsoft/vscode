/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';
import { Memento } from '../../../common/memento.js';
import { CustomEditorInfo } from './customEditor.js';
import { customEditorsExtensionPoint } from './extensionPoint.js';
import { RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
export class ContributedCustomEditors extends Disposable {
    static { this.CUSTOM_EDITORS_STORAGE_ID = 'customEditors'; }
    static { this.CUSTOM_EDITORS_ENTRY_ID = 'editors'; }
    constructor(storageService) {
        super();
        this._editors = new Map();
        this._onChange = this._register(new Emitter());
        this.onChange = this._onChange.event;
        this._memento = new Memento(ContributedCustomEditors.CUSTOM_EDITORS_STORAGE_ID, storageService);
        const mementoObject = this._memento.getMemento(0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        for (const info of mementoObject[ContributedCustomEditors.CUSTOM_EDITORS_ENTRY_ID] || []) {
            this.add(new CustomEditorInfo(info));
        }
        this._register(customEditorsExtensionPoint.setHandler(extensions => {
            this.update(extensions);
        }));
    }
    update(extensions) {
        this._editors.clear();
        for (const extension of extensions) {
            for (const webviewEditorContribution of extension.value) {
                this.add(new CustomEditorInfo({
                    id: webviewEditorContribution.viewType,
                    displayName: webviewEditorContribution.displayName,
                    providerDisplayName: extension.description.isBuiltin ? nls.localize('builtinProviderDisplayName', "Built-in") : extension.description.displayName || extension.description.identifier.value,
                    selector: webviewEditorContribution.selector || [],
                    priority: getPriorityFromContribution(webviewEditorContribution, extension.description),
                }));
            }
        }
        const mementoObject = this._memento.getMemento(0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        mementoObject[ContributedCustomEditors.CUSTOM_EDITORS_ENTRY_ID] = Array.from(this._editors.values());
        this._memento.saveMemento();
        this._onChange.fire();
    }
    [Symbol.iterator]() {
        return this._editors.values();
    }
    get(viewType) {
        return this._editors.get(viewType);
    }
    getContributedEditors(resource) {
        return Array.from(this._editors.values())
            .filter(customEditor => customEditor.matches(resource));
    }
    add(info) {
        if (this._editors.has(info.id)) {
            console.error(`Custom editor with id '${info.id}' already registered`);
            return;
        }
        this._editors.set(info.id, info);
    }
}
function getPriorityFromContribution(contribution, extension) {
    switch (contribution.priority) {
        case "default" /* CustomEditorPriority.default */:
            return RegisteredEditorPriority.default;
        case "option" /* CustomEditorPriority.option */:
            return RegisteredEditorPriority.option;
        case "builtin" /* CustomEditorPriority.builtin */:
            // Builtin is only valid for builtin extensions
            return extension.isBuiltin ? RegisteredEditorPriority.builtin : RegisteredEditorPriority.default;
        default:
            return RegisteredEditorPriority.default;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udHJpYnV0ZWRDdXN0b21FZGl0b3JzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY3VzdG9tRWRpdG9yL2NvbW1vbi9jb250cmlidXRlZEN1c3RvbUVkaXRvcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVsRSxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBRzFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNyRCxPQUFPLEVBQWdELGdCQUFnQixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDbkcsT0FBTyxFQUFFLDJCQUEyQixFQUFnQyxNQUFNLHFCQUFxQixDQUFDO0FBQ2hHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBT3BHLE1BQU0sT0FBTyx3QkFBeUIsU0FBUSxVQUFVO2FBRS9CLDhCQUF5QixHQUFHLGVBQWUsQUFBbEIsQ0FBbUI7YUFDNUMsNEJBQXVCLEdBQUcsU0FBUyxBQUFaLENBQWE7SUFLNUQsWUFBWSxjQUErQjtRQUMxQyxLQUFLLEVBQUUsQ0FBQztRQUpRLGFBQVEsR0FBRyxJQUFJLEdBQUcsRUFBNEIsQ0FBQztRQWtCL0MsY0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQ2pELGFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQztRQWIvQyxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksT0FBTyxDQUFDLHdCQUF3QixDQUFDLHlCQUF5QixFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBRWhHLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSw2REFBNkMsQ0FBQztRQUM1RixLQUFLLE1BQU0sSUFBSSxJQUFJLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDO1lBQzFGLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3RDLENBQUM7UUFFRCxJQUFJLENBQUMsU0FBUyxDQUFDLDJCQUEyQixDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsRUFBRTtZQUNsRSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3pCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBS08sTUFBTSxDQUFDLFVBQTBFO1FBQ3hGLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLENBQUM7UUFFdEIsS0FBSyxNQUFNLFNBQVMsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNwQyxLQUFLLE1BQU0seUJBQXlCLElBQUksU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUN6RCxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksZ0JBQWdCLENBQUM7b0JBQzdCLEVBQUUsRUFBRSx5QkFBeUIsQ0FBQyxRQUFRO29CQUN0QyxXQUFXLEVBQUUseUJBQXlCLENBQUMsV0FBVztvQkFDbEQsbUJBQW1CLEVBQUUsU0FBUyxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsNEJBQTRCLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsV0FBVyxJQUFJLFNBQVMsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLEtBQUs7b0JBQzNMLFFBQVEsRUFBRSx5QkFBeUIsQ0FBQyxRQUFRLElBQUksRUFBRTtvQkFDbEQsUUFBUSxFQUFFLDJCQUEyQixDQUFDLHlCQUF5QixFQUFFLFNBQVMsQ0FBQyxXQUFXLENBQUM7aUJBQ3ZGLENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztRQUNGLENBQUM7UUFFRCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsNkRBQTZDLENBQUM7UUFDNUYsYUFBYSxDQUFDLHdCQUF3QixDQUFDLHVCQUF1QixDQUFDLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDckcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUU1QixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ3ZCLENBQUM7SUFFTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7UUFDdkIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQy9CLENBQUM7SUFFTSxHQUFHLENBQUMsUUFBZ0I7UUFDMUIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNwQyxDQUFDO0lBRU0scUJBQXFCLENBQUMsUUFBYTtRQUN6QyxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQzthQUN2QyxNQUFNLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7SUFDMUQsQ0FBQztJQUVPLEdBQUcsQ0FBQyxJQUFzQjtRQUNqQyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQ2hDLE9BQU8sQ0FBQyxLQUFLLENBQUMsMEJBQTBCLElBQUksQ0FBQyxFQUFFLHNCQUFzQixDQUFDLENBQUM7WUFDdkUsT0FBTztRQUNSLENBQUM7UUFDRCxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2xDLENBQUM7O0FBR0YsU0FBUywyQkFBMkIsQ0FDbkMsWUFBMEMsRUFDMUMsU0FBZ0M7SUFFaEMsUUFBUSxZQUFZLENBQUMsUUFBNEMsRUFBRSxDQUFDO1FBQ25FO1lBQ0MsT0FBTyx3QkFBd0IsQ0FBQyxPQUFPLENBQUM7UUFFekM7WUFDQyxPQUFPLHdCQUF3QixDQUFDLE1BQU0sQ0FBQztRQUV4QztZQUNDLCtDQUErQztZQUMvQyxPQUFPLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLHdCQUF3QixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsd0JBQXdCLENBQUMsT0FBTyxDQUFDO1FBRWxHO1lBQ0MsT0FBTyx3QkFBd0IsQ0FBQyxPQUFPLENBQUM7SUFDMUMsQ0FBQztBQUNGLENBQUMifQ==