/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AbstractRuntimeExtensionsEditor } from './abstractRuntimeExtensionsEditor.js';
import { ReportExtensionIssueAction } from '../common/reportExtensionIssueAction.js';
export class RuntimeExtensionsEditor extends AbstractRuntimeExtensionsEditor {
    _getProfileInfo() {
        return null;
    }
    _getUnresponsiveProfile(extensionId) {
        return undefined;
    }
    _createSlowExtensionAction(element) {
        return null;
    }
    _createReportExtensionIssueAction(element) {
        if (element.marketplaceInfo) {
            return this._instantiationService.createInstance(ReportExtensionIssueAction, element.description);
        }
        return null;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclJ1bnRpbWVFeHRlbnNpb25zRWRpdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZXh0ZW5zaW9ucy9icm93c2VyL2Jyb3dzZXJSdW50aW1lRXh0ZW5zaW9uc0VkaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUtoRyxPQUFPLEVBQUUsK0JBQStCLEVBQXFCLE1BQU0sc0NBQXNDLENBQUM7QUFDMUcsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFckYsTUFBTSxPQUFPLHVCQUF3QixTQUFRLCtCQUErQjtJQUVqRSxlQUFlO1FBQ3hCLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVTLHVCQUF1QixDQUFDLFdBQWdDO1FBQ2pFLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFUywwQkFBMEIsQ0FBQyxPQUEwQjtRQUM5RCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFUyxpQ0FBaUMsQ0FBQyxPQUEwQjtRQUNyRSxJQUFJLE9BQU8sQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUM3QixPQUFPLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsMEJBQTBCLEVBQUUsT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ25HLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7Q0FDRCJ9