/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import * as nls from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
export const defaultExternalUriOpenerId = 'default';
export const externalUriOpenersSettingId = 'workbench.externalUriOpeners';
const externalUriOpenerIdSchemaAddition = {
    type: 'string',
    enum: []
};
const exampleUriPatterns = `
- \`https://microsoft.com\`: Matches this specific domain using https
- \`https://microsoft.com:8080\`: Matches this specific domain on this port using https
- \`https://microsoft.com:*\`: Matches this specific domain on any port using https
- \`https://microsoft.com/foo\`: Matches \`https://microsoft.com/foo\` and \`https://microsoft.com/foo/bar\`, but not \`https://microsoft.com/foobar\` or \`https://microsoft.com/bar\`
- \`https://*.microsoft.com\`: Match all domains ending in \`microsoft.com\` using https
- \`microsoft.com\`: Match this specific domain using either http or https
- \`*.microsoft.com\`: Match all domains ending in \`microsoft.com\` using either http or https
- \`http://192.168.0.1\`: Matches this specific IP using http
- \`http://192.168.0.*\`: Matches all IP's with this prefix using http
- \`*\`: Match all domains using either http or https`;
export const externalUriOpenersConfigurationNode = {
    ...workbenchConfigurationNodeBase,
    properties: {
        [externalUriOpenersSettingId]: {
            type: 'object',
            markdownDescription: nls.localize('externalUriOpeners', "Configure the opener to use for external URIs (http, https)."),
            defaultSnippets: [{
                    body: {
                        'example.com': '$1'
                    }
                }],
            additionalProperties: {
                anyOf: [
                    {
                        type: 'string',
                        markdownDescription: nls.localize('externalUriOpeners.uri', "Map URI pattern to an opener id.\nExample patterns: \n{0}", exampleUriPatterns),
                    },
                    {
                        type: 'string',
                        markdownDescription: nls.localize('externalUriOpeners.uri', "Map URI pattern to an opener id.\nExample patterns: \n{0}", exampleUriPatterns),
                        enum: [defaultExternalUriOpenerId],
                        enumDescriptions: [nls.localize('externalUriOpeners.defaultId', "Open using VS Code's standard opener.")],
                    },
                    externalUriOpenerIdSchemaAddition
                ]
            }
        }
    }
};
export function updateContributedOpeners(enumValues, enumDescriptions) {
    externalUriOpenerIdSchemaAddition.enum = enumValues;
    externalUriOpenerIdSchemaAddition.enumDescriptions = enumDescriptions;
    Registry.as(Extensions.Configuration)
        .notifyConfigurationSchemaUpdated(externalUriOpenersConfigurationNode);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVybmFsVXJpT3BlbmVyL2NvbW1vbi9jb25maWd1cmF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBOEMsVUFBVSxFQUFFLE1BQU0sb0VBQW9FLENBQUM7QUFDNUksT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEYsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUUxQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFNUUsTUFBTSxDQUFDLE1BQU0sMEJBQTBCLEdBQUcsU0FBUyxDQUFDO0FBRXBELE1BQU0sQ0FBQyxNQUFNLDJCQUEyQixHQUFHLDhCQUE4QixDQUFDO0FBTTFFLE1BQU0saUNBQWlDLEdBQWdCO0lBQ3RELElBQUksRUFBRSxRQUFRO0lBQ2QsSUFBSSxFQUFFLEVBQUU7Q0FDUixDQUFDO0FBRUYsTUFBTSxrQkFBa0IsR0FBRzs7Ozs7Ozs7OztzREFVMkIsQ0FBQztBQUV2RCxNQUFNLENBQUMsTUFBTSxtQ0FBbUMsR0FBdUI7SUFDdEUsR0FBRyw4QkFBOEI7SUFDakMsVUFBVSxFQUFFO1FBQ1gsQ0FBQywyQkFBMkIsQ0FBQyxFQUFFO1lBQzlCLElBQUksRUFBRSxRQUFRO1lBQ2QsbUJBQW1CLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSw4REFBOEQsQ0FBQztZQUN2SCxlQUFlLEVBQUUsQ0FBQztvQkFDakIsSUFBSSxFQUFFO3dCQUNMLGFBQWEsRUFBRSxJQUFJO3FCQUNuQjtpQkFDRCxDQUFDO1lBQ0Ysb0JBQW9CLEVBQUU7Z0JBQ3JCLEtBQUssRUFBRTtvQkFDTjt3QkFDQyxJQUFJLEVBQUUsUUFBUTt3QkFDZCxtQkFBbUIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHdCQUF3QixFQUFFLDJEQUEyRCxFQUFFLGtCQUFrQixDQUFDO3FCQUM1STtvQkFDRDt3QkFDQyxJQUFJLEVBQUUsUUFBUTt3QkFDZCxtQkFBbUIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHdCQUF3QixFQUFFLDJEQUEyRCxFQUFFLGtCQUFrQixDQUFDO3dCQUM1SSxJQUFJLEVBQUUsQ0FBQywwQkFBMEIsQ0FBQzt3QkFDbEMsZ0JBQWdCLEVBQUUsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLDhCQUE4QixFQUFFLHVDQUF1QyxDQUFDLENBQUM7cUJBQ3pHO29CQUNELGlDQUFpQztpQkFDakM7YUFDRDtTQUNEO0tBQ0Q7Q0FDRCxDQUFDO0FBRUYsTUFBTSxVQUFVLHdCQUF3QixDQUFDLFVBQW9CLEVBQUUsZ0JBQTBCO0lBQ3hGLGlDQUFpQyxDQUFDLElBQUksR0FBRyxVQUFVLENBQUM7SUFDcEQsaUNBQWlDLENBQUMsZ0JBQWdCLEdBQUcsZ0JBQWdCLENBQUM7SUFFdEUsUUFBUSxDQUFDLEVBQUUsQ0FBeUIsVUFBVSxDQUFDLGFBQWEsQ0FBQztTQUMzRCxnQ0FBZ0MsQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO0FBQ3pFLENBQUMifQ==