/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Event } from '../../../../base/common/event.js';
let DiffEditorActiveAnnouncementContribution = class DiffEditorActiveAnnouncementContribution extends Disposable {
    static { this.ID = 'workbench.contrib.diffEditorActiveAnnouncement'; }
    constructor(_editorService, _accessibilityService, _configurationService) {
        super();
        this._editorService = _editorService;
        this._accessibilityService = _accessibilityService;
        this._configurationService = _configurationService;
        this._register(Event.runAndSubscribe(_accessibilityService.onDidChangeScreenReaderOptimized, () => this._updateListener()));
        this._register(_configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("accessibility.verbosity.diffEditorActive" /* AccessibilityVerbositySettingId.DiffEditorActive */)) {
                this._updateListener();
            }
        }));
    }
    _updateListener() {
        const announcementEnabled = this._configurationService.getValue("accessibility.verbosity.diffEditorActive" /* AccessibilityVerbositySettingId.DiffEditorActive */);
        const screenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
        if (!announcementEnabled || !screenReaderOptimized) {
            this._onDidActiveEditorChangeListener?.dispose();
            this._onDidActiveEditorChangeListener = undefined;
            return;
        }
        if (this._onDidActiveEditorChangeListener) {
            return;
        }
        this._onDidActiveEditorChangeListener = this._register(this._editorService.onDidActiveEditorChange(() => {
            if (isDiffEditor(this._editorService.activeTextEditorControl)) {
                this._accessibilityService.alert(localize('openDiffEditorAnnouncement', "Diff editor"));
            }
        }));
    }
};
DiffEditorActiveAnnouncementContribution = __decorate([
    __param(0, IEditorService),
    __param(1, IAccessibilityService),
    __param(2, IConfigurationService)
], DiffEditorActiveAnnouncementContribution);
export { DiffEditorActiveAnnouncementContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3BlbkRpZmZFZGl0b3JBbm5vdW5jZW1lbnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9hY2Nlc3NpYmlsaXR5U2lnbmFscy9icm93c2VyL29wZW5EaWZmRWRpdG9yQW5ub3VuY2VtZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRW5HLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFHbEQsSUFBTSx3Q0FBd0MsR0FBOUMsTUFBTSx3Q0FBeUMsU0FBUSxVQUFVO2FBRXZELE9BQUUsR0FBRyxnREFBZ0QsQUFBbkQsQ0FBb0Q7SUFJdEUsWUFDa0MsY0FBOEIsRUFDdkIscUJBQTRDLEVBQzVDLHFCQUE0QztRQUVwRixLQUFLLEVBQUUsQ0FBQztRQUp5QixtQkFBYyxHQUFkLGNBQWMsQ0FBZ0I7UUFDdkIsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQUM1QywwQkFBcUIsR0FBckIscUJBQXFCLENBQXVCO1FBR3BGLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxxQkFBcUIsQ0FBQyxnQ0FBZ0MsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzVILElBQUksQ0FBQyxTQUFTLENBQUMscUJBQXFCLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDakUsSUFBSSxDQUFDLENBQUMsb0JBQW9CLG1HQUFrRCxFQUFFLENBQUM7Z0JBQzlFLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUN4QixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTyxlQUFlO1FBQ3RCLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFFBQVEsbUdBQWtELENBQUM7UUFDbEgsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztRQUVuRixJQUFJLENBQUMsbUJBQW1CLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1lBQ3BELElBQUksQ0FBQyxnQ0FBZ0MsRUFBRSxPQUFPLEVBQUUsQ0FBQztZQUNqRCxJQUFJLENBQUMsZ0NBQWdDLEdBQUcsU0FBUyxDQUFDO1lBQ2xELE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsZ0NBQWdDLEVBQUUsQ0FBQztZQUMzQyxPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxnQ0FBZ0MsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsdUJBQXVCLENBQUMsR0FBRyxFQUFFO1lBQ3ZHLElBQUksWUFBWSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsdUJBQXVCLENBQUMsRUFBRSxDQUFDO2dCQUMvRCxJQUFJLENBQUMscUJBQXFCLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDO1lBQ3pGLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQzs7QUF2Q1csd0NBQXdDO0lBT2xELFdBQUEsY0FBYyxDQUFBO0lBQ2QsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLHFCQUFxQixDQUFBO0dBVFgsd0NBQXdDLENBd0NwRCJ9