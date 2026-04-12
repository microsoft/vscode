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
import * as nls from '../../../../nls.js';
import * as path from '../../../../base/common/path.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
/**
 * Shows a message when opening a large file which has been memory optimized (and features disabled).
 */
let LargeFileOptimizationsWarner = class LargeFileOptimizationsWarner extends Disposable {
    static { this.ID = 'editor.contrib.largeFileOptimizationsWarner'; }
    constructor(_editor, _notificationService, _configurationService) {
        super();
        this._editor = _editor;
        this._notificationService = _notificationService;
        this._configurationService = _configurationService;
        this._register(this._editor.onDidChangeModel((e) => this._update()));
        this._update();
    }
    _update() {
        const model = this._editor.getModel();
        if (!model) {
            return;
        }
        if (model.isTooLargeForTokenization()) {
            const message = nls.localize({
                key: 'largeFile',
                comment: [
                    'Variable 0 will be a file name.'
                ]
            }, "{0}: tokenization, wrapping, folding, codelens, word highlighting and sticky scroll have been turned off for this large file in order to reduce memory usage and avoid freezing or crashing.", path.basename(model.uri.path));
            this._notificationService.prompt(Severity.Info, message, [
                {
                    label: nls.localize('removeOptimizations', "Forcefully Enable Features"),
                    run: () => {
                        this._configurationService.updateValue(`editor.largeFileOptimizations`, false).then(() => {
                            this._notificationService.info(nls.localize('reopenFilePrompt', "Please reopen file in order for this setting to take effect."));
                        }, (err) => {
                            this._notificationService.error(err);
                        });
                    }
                }
            ], { neverShowAgain: { id: 'editor.contrib.largeFileOptimizationsWarner' } });
        }
    }
};
LargeFileOptimizationsWarner = __decorate([
    __param(1, INotificationService),
    __param(2, IConfigurationService)
], LargeFileOptimizationsWarner);
export { LargeFileOptimizationsWarner };
registerEditorContribution(LargeFileOptimizationsWarner.ID, LargeFileOptimizationsWarner, 1 /* EditorContributionInstantiation.AfterFirstRender */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFyZ2VGaWxlT3B0aW1pemF0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVFZGl0b3IvYnJvd3Nlci9sYXJnZUZpbGVPcHRpbWl6YXRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxLQUFLLElBQUksTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFbEUsT0FBTyxFQUFtQywwQkFBMEIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRTdILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxRQUFRLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUUxRzs7R0FFRztBQUNJLElBQU0sNEJBQTRCLEdBQWxDLE1BQU0sNEJBQTZCLFNBQVEsVUFBVTthQUVwQyxPQUFFLEdBQUcsNkNBQTZDLEFBQWhELENBQWlEO0lBRTFFLFlBQ2tCLE9BQW9CLEVBQ0Usb0JBQTBDLEVBQ3pDLHFCQUE0QztRQUVwRixLQUFLLEVBQUUsQ0FBQztRQUpTLFlBQU8sR0FBUCxPQUFPLENBQWE7UUFDRSx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXNCO1FBQ3pDLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFJcEYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3JFLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNoQixDQUFDO0lBRU8sT0FBTztRQUNkLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDdEMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsRUFBRSxFQUFFLENBQUM7WUFDdkMsTUFBTSxPQUFPLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FDM0I7Z0JBQ0MsR0FBRyxFQUFFLFdBQVc7Z0JBQ2hCLE9BQU8sRUFBRTtvQkFDUixpQ0FBaUM7aUJBQ2pDO2FBQ0QsRUFDRCw4TEFBOEwsRUFDOUwsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUM3QixDQUFDO1lBRUYsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRTtnQkFDeEQ7b0JBQ0MsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMscUJBQXFCLEVBQUUsNEJBQTRCLENBQUM7b0JBQ3hFLEdBQUcsRUFBRSxHQUFHLEVBQUU7d0JBQ1QsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFdBQVcsQ0FBQywrQkFBK0IsRUFBRSxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFOzRCQUN4RixJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEVBQUUsOERBQThELENBQUMsQ0FBQyxDQUFDO3dCQUNsSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsRUFBRTs0QkFDVixJQUFJLENBQUMsb0JBQW9CLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO3dCQUN0QyxDQUFDLENBQUMsQ0FBQztvQkFDSixDQUFDO2lCQUNEO2FBQ0QsRUFBRSxFQUFFLGNBQWMsRUFBRSxFQUFFLEVBQUUsRUFBRSw2Q0FBNkMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMvRSxDQUFDO0lBQ0YsQ0FBQzs7QUE5Q1csNEJBQTRCO0lBTXRDLFdBQUEsb0JBQW9CLENBQUE7SUFDcEIsV0FBQSxxQkFBcUIsQ0FBQTtHQVBYLDRCQUE0QixDQStDeEM7O0FBRUQsMEJBQTBCLENBQUMsNEJBQTRCLENBQUMsRUFBRSxFQUFFLDRCQUE0QiwyREFBbUQsQ0FBQyJ9