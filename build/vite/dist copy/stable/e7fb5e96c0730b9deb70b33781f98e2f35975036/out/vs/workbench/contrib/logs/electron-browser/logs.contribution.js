/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { OpenLogsFolderAction, OpenExtensionLogsFolderAction } from './logsActions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: OpenLogsFolderAction.ID,
            title: OpenLogsFolderAction.TITLE,
            category: Categories.Developer,
            f1: true
        });
    }
    run(servicesAccessor) {
        return servicesAccessor.get(IInstantiationService).createInstance(OpenLogsFolderAction, OpenLogsFolderAction.ID, OpenLogsFolderAction.TITLE.value).run();
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: OpenExtensionLogsFolderAction.ID,
            title: OpenExtensionLogsFolderAction.TITLE,
            category: Categories.Developer,
            f1: true
        });
    }
    run(servicesAccessor) {
        return servicesAccessor.get(IInstantiationService).createInstance(OpenExtensionLogsFolderAction, OpenExtensionLogsFolderAction.ID, OpenExtensionLogsFolderAction.TITLE.value).run();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9ncy5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9sb2dzL2VsZWN0cm9uLWJyb3dzZXIvbG9ncy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDMUYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLDZCQUE2QixFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFFdkYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFbkcsZUFBZSxDQUFDLEtBQU0sU0FBUSxPQUFPO0lBQ3BDO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLG9CQUFvQixDQUFDLEVBQUU7WUFDM0IsS0FBSyxFQUFFLG9CQUFvQixDQUFDLEtBQUs7WUFDakMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxTQUFTO1lBQzlCLEVBQUUsRUFBRSxJQUFJO1NBQ1IsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUNELEdBQUcsQ0FBQyxnQkFBa0M7UUFDckMsT0FBTyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLEVBQUUsb0JBQW9CLENBQUMsRUFBRSxFQUFFLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUMxSixDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsZUFBZSxDQUFDLEtBQU0sU0FBUSxPQUFPO0lBQ3BDO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLDZCQUE2QixDQUFDLEVBQUU7WUFDcEMsS0FBSyxFQUFFLDZCQUE2QixDQUFDLEtBQUs7WUFDMUMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxTQUFTO1lBQzlCLEVBQUUsRUFBRSxJQUFJO1NBQ1IsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUNELEdBQUcsQ0FBQyxnQkFBa0M7UUFDckMsT0FBTyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQyxjQUFjLENBQUMsNkJBQTZCLEVBQUUsNkJBQTZCLENBQUMsRUFBRSxFQUFFLDZCQUE2QixDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNyTCxDQUFDO0NBQ0QsQ0FBQyxDQUFDIn0=