/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import content from './vs_code_editor_walkthrough.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WalkThroughInput } from '../walkThroughInput.js';
import { FileAccess, Schemas } from '../../../../../base/common/network.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { walkThroughContentRegistry } from '../../common/walkThroughContentProvider.js';
walkThroughContentRegistry.registerProvider('vs/workbench/contrib/welcomeWalkthrough/browser/editor/vs_code_editor_walkthrough', content);
const typeId = 'workbench.editors.walkThroughInput';
const inputOptions = {
    typeId,
    name: localize('editorWalkThrough.title', "Editor Playground"),
    resource: FileAccess.asBrowserUri('vs/workbench/contrib/welcomeWalkthrough/browser/editor/vs_code_editor_walkthrough.md')
        .with({
        scheme: Schemas.walkThrough,
        query: JSON.stringify({ moduleId: 'vs/workbench/contrib/welcomeWalkthrough/browser/editor/vs_code_editor_walkthrough' })
    }),
    telemetryFrom: 'walkThrough'
};
export class EditorWalkThroughAction extends Action2 {
    static { this.ID = 'workbench.action.showInteractivePlayground'; }
    static { this.LABEL = localize2('editorWalkThrough', 'Interactive Editor Playground'); }
    constructor() {
        super({
            id: EditorWalkThroughAction.ID,
            title: EditorWalkThroughAction.LABEL,
            category: Categories.Help,
            f1: true,
            metadata: {
                description: localize2('editorWalkThroughMetadata', "Opens an interactive playground for learning about the editor.")
            }
        });
    }
    run(serviceAccessor) {
        const editorService = serviceAccessor.get(IEditorService);
        const instantiationService = serviceAccessor.get(IInstantiationService);
        const input = instantiationService.createInstance(WalkThroughInput, inputOptions);
        // TODO @lramos15 adopt the resolver here
        return editorService.openEditor(input, { pinned: true })
            .then(() => void (0));
    }
}
export class EditorWalkThroughInputSerializer {
    static { this.ID = typeId; }
    canSerialize(editorInput) {
        return true;
    }
    serialize(editorInput) {
        return '';
    }
    deserialize(instantiationService) {
        return instantiationService.createInstance(WalkThroughInput, inputOptions);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yV2Fsa1Rocm91Z2guanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi93ZWxjb21lV2Fsa3Rocm91Z2gvYnJvd3Nlci9lZGl0b3IvZWRpdG9yV2Fsa1Rocm91Z2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxPQUFPLE1BQU0saUNBQWlDLENBQUM7QUFDdEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDckYsT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLCtEQUErRCxDQUFDO0FBQ3hILE9BQU8sRUFBRSxnQkFBZ0IsRUFBMkIsTUFBTSx3QkFBd0IsQ0FBQztBQUNuRixPQUFPLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRzVFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUM1RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDN0YsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFeEYsMEJBQTBCLENBQUMsZ0JBQWdCLENBQUMsbUZBQW1GLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFFMUksTUFBTSxNQUFNLEdBQUcsb0NBQW9DLENBQUM7QUFDcEQsTUFBTSxZQUFZLEdBQTRCO0lBQzdDLE1BQU07SUFDTixJQUFJLEVBQUUsUUFBUSxDQUFDLHlCQUF5QixFQUFFLG1CQUFtQixDQUFDO0lBQzlELFFBQVEsRUFBRSxVQUFVLENBQUMsWUFBWSxDQUFDLHNGQUFzRixDQUFDO1NBQ3ZILElBQUksQ0FBQztRQUNMLE1BQU0sRUFBRSxPQUFPLENBQUMsV0FBVztRQUMzQixLQUFLLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxtRkFBbUYsRUFBRSxDQUFDO0tBQ3hILENBQUM7SUFDSCxhQUFhLEVBQUUsYUFBYTtDQUM1QixDQUFDO0FBRUYsTUFBTSxPQUFPLHVCQUF3QixTQUFRLE9BQU87YUFFNUIsT0FBRSxHQUFHLDRDQUE0QyxDQUFDO2FBQ2xELFVBQUssR0FBRyxTQUFTLENBQUMsbUJBQW1CLEVBQUUsK0JBQStCLENBQUMsQ0FBQztJQUUvRjtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSx1QkFBdUIsQ0FBQyxFQUFFO1lBQzlCLEtBQUssRUFBRSx1QkFBdUIsQ0FBQyxLQUFLO1lBQ3BDLFFBQVEsRUFBRSxVQUFVLENBQUMsSUFBSTtZQUN6QixFQUFFLEVBQUUsSUFBSTtZQUNSLFFBQVEsRUFBRTtnQkFDVCxXQUFXLEVBQUUsU0FBUyxDQUFDLDJCQUEyQixFQUFFLGdFQUFnRSxDQUFDO2FBQ3JIO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVlLEdBQUcsQ0FBQyxlQUFpQztRQUNwRCxNQUFNLGFBQWEsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQzFELE1BQU0sb0JBQW9CLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBQ3hFLE1BQU0sS0FBSyxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUNsRix5Q0FBeUM7UUFDekMsT0FBTyxhQUFhLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQzthQUN0RCxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDeEIsQ0FBQzs7QUFHRixNQUFNLE9BQU8sZ0NBQWdDO2FBRTVCLE9BQUUsR0FBRyxNQUFNLENBQUM7SUFFckIsWUFBWSxDQUFDLFdBQXdCO1FBQzNDLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVNLFNBQVMsQ0FBQyxXQUF3QjtRQUN4QyxPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFFTSxXQUFXLENBQUMsb0JBQTJDO1FBQzdELE9BQU8sb0JBQW9CLENBQUMsY0FBYyxDQUFDLGdCQUFnQixFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQzVFLENBQUMifQ==