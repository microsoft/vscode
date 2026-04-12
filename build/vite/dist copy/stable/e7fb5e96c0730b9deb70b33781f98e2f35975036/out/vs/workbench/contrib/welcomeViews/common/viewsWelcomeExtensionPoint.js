/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
export var ViewsWelcomeExtensionPointFields;
(function (ViewsWelcomeExtensionPointFields) {
    ViewsWelcomeExtensionPointFields["view"] = "view";
    ViewsWelcomeExtensionPointFields["contents"] = "contents";
    ViewsWelcomeExtensionPointFields["when"] = "when";
    ViewsWelcomeExtensionPointFields["group"] = "group";
    ViewsWelcomeExtensionPointFields["enablement"] = "enablement";
})(ViewsWelcomeExtensionPointFields || (ViewsWelcomeExtensionPointFields = {}));
export const ViewIdentifierMap = {
    'explorer': 'workbench.explorer.emptyView',
    'debug': 'workbench.debug.welcome',
    'scm': 'workbench.scm',
    'testing': 'workbench.view.testing'
};
const viewsWelcomeExtensionPointSchema = Object.freeze({
    type: 'array',
    description: nls.localize('contributes.viewsWelcome', "Contributed views welcome content. Welcome content will be rendered in tree based views whenever they have no meaningful content to display, ie. the File Explorer when no folder is open. Such content is useful as in-product documentation to drive users to use certain features before they are available. A good example would be a `Clone Repository` button in the File Explorer welcome view."),
    items: {
        type: 'object',
        description: nls.localize('contributes.viewsWelcome.view', "Contributed welcome content for a specific view."),
        required: [
            ViewsWelcomeExtensionPointFields.view,
            ViewsWelcomeExtensionPointFields.contents
        ],
        properties: {
            [ViewsWelcomeExtensionPointFields.view]: {
                anyOf: [
                    {
                        type: 'string',
                        description: nls.localize('contributes.viewsWelcome.view.view', "Target view identifier for this welcome content. Only tree based views are supported.")
                    },
                    {
                        type: 'string',
                        description: nls.localize('contributes.viewsWelcome.view.view', "Target view identifier for this welcome content. Only tree based views are supported."),
                        enum: Object.keys(ViewIdentifierMap)
                    }
                ]
            },
            [ViewsWelcomeExtensionPointFields.contents]: {
                type: 'string',
                description: nls.localize('contributes.viewsWelcome.view.contents', "Welcome content to be displayed. The format of the contents is a subset of Markdown, with support for links only."),
            },
            [ViewsWelcomeExtensionPointFields.when]: {
                type: 'string',
                description: nls.localize('contributes.viewsWelcome.view.when', "Condition when the welcome content should be displayed."),
            },
            [ViewsWelcomeExtensionPointFields.group]: {
                type: 'string',
                description: nls.localize('contributes.viewsWelcome.view.group', "Group to which this welcome content belongs. Proposed API."),
            },
            [ViewsWelcomeExtensionPointFields.enablement]: {
                type: 'string',
                description: nls.localize('contributes.viewsWelcome.view.enablement', "Condition when the welcome content buttons and command links should be enabled."),
            },
        }
    }
});
export const viewsWelcomeExtensionPointDescriptor = {
    extensionPoint: 'viewsWelcome',
    jsonSchema: viewsWelcomeExtensionPointSchema
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld3NXZWxjb21lRXh0ZW5zaW9uUG9pbnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi93ZWxjb21lVmlld3MvY29tbW9uL3ZpZXdzV2VsY29tZUV4dGVuc2lvblBvaW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFHMUMsTUFBTSxDQUFOLElBQVksZ0NBTVg7QUFORCxXQUFZLGdDQUFnQztJQUMzQyxpREFBYSxDQUFBO0lBQ2IseURBQXFCLENBQUE7SUFDckIsaURBQWEsQ0FBQTtJQUNiLG1EQUFlLENBQUE7SUFDZiw2REFBeUIsQ0FBQTtBQUMxQixDQUFDLEVBTlcsZ0NBQWdDLEtBQWhDLGdDQUFnQyxRQU0zQztBQVlELE1BQU0sQ0FBQyxNQUFNLGlCQUFpQixHQUE4QjtJQUMzRCxVQUFVLEVBQUUsOEJBQThCO0lBQzFDLE9BQU8sRUFBRSx5QkFBeUI7SUFDbEMsS0FBSyxFQUFFLGVBQWU7SUFDdEIsU0FBUyxFQUFFLHdCQUF3QjtDQUNuQyxDQUFDO0FBRUYsTUFBTSxnQ0FBZ0MsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUErQjtJQUNwRixJQUFJLEVBQUUsT0FBTztJQUNiLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLDBCQUEwQixFQUFFLHdZQUF3WSxDQUFDO0lBQy9iLEtBQUssRUFBRTtRQUNOLElBQUksRUFBRSxRQUFRO1FBQ2QsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsK0JBQStCLEVBQUUsa0RBQWtELENBQUM7UUFDOUcsUUFBUSxFQUFFO1lBQ1QsZ0NBQWdDLENBQUMsSUFBSTtZQUNyQyxnQ0FBZ0MsQ0FBQyxRQUFRO1NBQ3pDO1FBQ0QsVUFBVSxFQUFFO1lBQ1gsQ0FBQyxnQ0FBZ0MsQ0FBQyxJQUFJLENBQUMsRUFBRTtnQkFDeEMsS0FBSyxFQUFFO29CQUNOO3dCQUNDLElBQUksRUFBRSxRQUFRO3dCQUNkLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLG9DQUFvQyxFQUFFLHVGQUF1RixDQUFDO3FCQUN4SjtvQkFDRDt3QkFDQyxJQUFJLEVBQUUsUUFBUTt3QkFDZCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxvQ0FBb0MsRUFBRSx1RkFBdUYsQ0FBQzt3QkFDeEosSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUM7cUJBQ3BDO2lCQUNEO2FBQ0Q7WUFDRCxDQUFDLGdDQUFnQyxDQUFDLFFBQVEsQ0FBQyxFQUFFO2dCQUM1QyxJQUFJLEVBQUUsUUFBUTtnQkFDZCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyx3Q0FBd0MsRUFBRSxtSEFBbUgsQ0FBQzthQUN4TDtZQUNELENBQUMsZ0NBQWdDLENBQUMsSUFBSSxDQUFDLEVBQUU7Z0JBQ3hDLElBQUksRUFBRSxRQUFRO2dCQUNkLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLG9DQUFvQyxFQUFFLHlEQUF5RCxDQUFDO2FBQzFIO1lBQ0QsQ0FBQyxnQ0FBZ0MsQ0FBQyxLQUFLLENBQUMsRUFBRTtnQkFDekMsSUFBSSxFQUFFLFFBQVE7Z0JBQ2QsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMscUNBQXFDLEVBQUUsNERBQTRELENBQUM7YUFDOUg7WUFDRCxDQUFDLGdDQUFnQyxDQUFDLFVBQVUsQ0FBQyxFQUFFO2dCQUM5QyxJQUFJLEVBQUUsUUFBUTtnQkFDZCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQywwQ0FBMEMsRUFBRSxpRkFBaUYsQ0FBQzthQUN4SjtTQUNEO0tBQ0Q7Q0FDRCxDQUFDLENBQUM7QUFFSCxNQUFNLENBQUMsTUFBTSxvQ0FBb0MsR0FBRztJQUNuRCxjQUFjLEVBQUUsY0FBYztJQUM5QixVQUFVLEVBQUUsZ0NBQWdDO0NBQzVDLENBQUMifQ==