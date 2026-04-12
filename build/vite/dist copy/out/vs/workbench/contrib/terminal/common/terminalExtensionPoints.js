/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as extensionsRegistry from '../../../services/extensions/common/extensionsRegistry.js';
import { terminalContributionsDescriptor } from './terminal.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../base/common/uri.js';
import { Emitter } from '../../../../base/common/event.js';
import { isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { isObject, isString } from '../../../../base/common/types.js';
// terminal extension point
const terminalsExtPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint(terminalContributionsDescriptor);
export const ITerminalContributionService = createDecorator('terminalContributionsService');
export class TerminalContributionService {
    get terminalProfiles() { return this._terminalProfiles; }
    get terminalCompletionProviders() { return this._terminalCompletionProviders; }
    constructor() {
        this._terminalProfiles = [];
        this._terminalCompletionProviders = [];
        this._onDidChangeTerminalCompletionProviders = new Emitter();
        this.onDidChangeTerminalCompletionProviders = this._onDidChangeTerminalCompletionProviders.event;
        terminalsExtPoint.setHandler(contributions => {
            this._terminalProfiles = contributions.map(c => {
                return c.value?.profiles?.filter(p => hasValidTerminalIcon(p)).map(e => {
                    return { ...e, extensionIdentifier: c.description.identifier.value };
                }) || [];
            }).flat();
            this._terminalCompletionProviders = contributions.map(c => {
                if (!isProposedApiEnabled(c.description, 'terminalCompletionProvider')) {
                    return [];
                }
                return c.value?.completionProviders?.map(p => {
                    return { ...p, extensionIdentifier: c.description.identifier.value };
                }) || [];
            }).flat();
            this._onDidChangeTerminalCompletionProviders.fire();
        });
    }
}
function hasValidTerminalIcon(profile) {
    function isValidDarkLightIcon(obj) {
        return (isObject(obj) &&
            'light' in obj && URI.isUri(obj.light) &&
            'dark' in obj && URI.isUri(obj.dark));
    }
    return !profile.icon || (isString(profile.icon) ||
        URI.isUri(profile.icon) ||
        isValidDarkLightIcon(profile.icon));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxFeHRlbnNpb25Qb2ludHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9jb21tb24vdGVybWluYWxFeHRlbnNpb25Qb2ludHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLGtCQUFrQixNQUFNLDJEQUEyRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUNoRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFN0YsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRXRFLDJCQUEyQjtBQUMzQixNQUFNLGlCQUFpQixHQUFHLGtCQUFrQixDQUFDLGtCQUFrQixDQUFDLHNCQUFzQixDQUF5QiwrQkFBK0IsQ0FBQyxDQUFDO0FBY2hKLE1BQU0sQ0FBQyxNQUFNLDRCQUE0QixHQUFHLGVBQWUsQ0FBK0IsOEJBQThCLENBQUMsQ0FBQztBQUUxSCxNQUFNLE9BQU8sMkJBQTJCO0lBSXZDLElBQUksZ0JBQWdCLEtBQUssT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO0lBR3pELElBQUksMkJBQTJCLEtBQUssT0FBTyxJQUFJLENBQUMsNEJBQTRCLENBQUMsQ0FBQyxDQUFDO0lBSy9FO1FBVFEsc0JBQWlCLEdBQTZDLEVBQUUsQ0FBQztRQUdqRSxpQ0FBNEIsR0FBd0QsRUFBRSxDQUFDO1FBRzlFLDRDQUF1QyxHQUFHLElBQUksT0FBTyxFQUFRLENBQUM7UUFDdEUsMkNBQXNDLEdBQUcsSUFBSSxDQUFDLHVDQUF1QyxDQUFDLEtBQUssQ0FBQztRQUdwRyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLEVBQUU7WUFDNUMsSUFBSSxDQUFDLGlCQUFpQixHQUFHLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQzlDLE9BQU8sQ0FBQyxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUU7b0JBQ3RFLE9BQU8sRUFBRSxHQUFHLENBQUMsRUFBRSxtQkFBbUIsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDdEUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ1YsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7WUFFVixJQUFJLENBQUMsNEJBQTRCLEdBQUcsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDekQsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsNEJBQTRCLENBQUMsRUFBRSxDQUFDO29CQUN4RSxPQUFPLEVBQUUsQ0FBQztnQkFDWCxDQUFDO2dCQUNELE9BQU8sQ0FBQyxDQUFDLEtBQUssRUFBRSxtQkFBbUIsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUU7b0JBQzVDLE9BQU8sRUFBRSxHQUFHLENBQUMsRUFBRSxtQkFBbUIsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDdEUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ1YsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7WUFFVixJQUFJLENBQUMsdUNBQXVDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDckQsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0NBQ0Q7QUFFRCxTQUFTLG9CQUFvQixDQUFDLE9BQXFDO0lBQ2xFLFNBQVMsb0JBQW9CLENBQUMsR0FBWTtRQUN6QyxPQUFPLENBQ04sUUFBUSxDQUFDLEdBQUcsQ0FBQztZQUNiLE9BQU8sSUFBSSxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDO1lBQ3RDLE1BQU0sSUFBSSxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQ3BDLENBQUM7SUFDSCxDQUFDO0lBQ0QsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLElBQUksQ0FDdkIsUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7UUFDdEIsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDO1FBQ3ZCLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FDbEMsQ0FBQztBQUNILENBQUMifQ==