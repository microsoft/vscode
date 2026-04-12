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
import { withoutDuplicates } from '../../../../base/common/arrays.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../../base/common/observable.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { inlineCompletionProviderGetMatcher, providerIdSchemaUri } from '../../../../editor/contrib/inlineCompletions/browser/controller/commands.js';
import { Extensions } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { wrapInHotClass1 } from '../../../../platform/observable/common/wrapInHotClass.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { InlineCompletionLanguageStatusBarContribution } from './inlineCompletionLanguageStatusBarContribution.js';
registerWorkbenchContribution2(InlineCompletionLanguageStatusBarContribution.Id, wrapInHotClass1(InlineCompletionLanguageStatusBarContribution.hot), 4 /* WorkbenchPhase.Eventually */);
let InlineCompletionSchemaContribution = class InlineCompletionSchemaContribution extends Disposable {
    static { this.Id = 'vs.contrib.InlineCompletionSchemaContribution'; }
    constructor(_languageFeaturesService) {
        super();
        this._languageFeaturesService = _languageFeaturesService;
        const registry = Registry.as(Extensions.JSONContribution);
        const inlineCompletionsProvider = observableFromEvent(this, this._languageFeaturesService.inlineCompletionsProvider.onDidChange, () => this._languageFeaturesService.inlineCompletionsProvider.allNoModel());
        this._register(autorun(reader => {
            const provider = inlineCompletionsProvider.read(reader);
            registry.registerSchema(providerIdSchemaUri, {
                enum: withoutDuplicates(provider.flatMap(p => inlineCompletionProviderGetMatcher(p))),
            }, reader.store);
        }));
    }
};
InlineCompletionSchemaContribution = __decorate([
    __param(0, ILanguageFeaturesService)
], InlineCompletionSchemaContribution);
export { InlineCompletionSchemaContribution };
registerWorkbenchContribution2(InlineCompletionSchemaContribution.Id, InlineCompletionSchemaContribution, 4 /* WorkbenchPhase.Eventually */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ29tcGxldGlvbnMuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci9pbmxpbmVDb21wbGV0aW9ucy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNyRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNsRyxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw2RUFBNkUsQ0FBQztBQUN0SixPQUFPLEVBQUUsVUFBVSxFQUE2QixNQUFNLHFFQUFxRSxDQUFDO0FBQzVILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMzRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUEwQiw4QkFBOEIsRUFBa0IsTUFBTSxrQ0FBa0MsQ0FBQztBQUMxSCxPQUFPLEVBQUUsNkNBQTZDLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUVuSCw4QkFBOEIsQ0FBQyw2Q0FBNkMsQ0FBQyxFQUFFLEVBQUUsZUFBZSxDQUFDLDZDQUE2QyxDQUFDLEdBQUcsQ0FBQyxvQ0FBNEIsQ0FBQztBQUV6SyxJQUFNLGtDQUFrQyxHQUF4QyxNQUFNLGtDQUFtQyxTQUFRLFVBQVU7YUFDbkQsT0FBRSxHQUFHLCtDQUErQyxBQUFsRCxDQUFtRDtJQUVuRSxZQUM0Qyx3QkFBa0Q7UUFFN0YsS0FBSyxFQUFFLENBQUM7UUFGbUMsNkJBQXdCLEdBQXhCLHdCQUF3QixDQUEwQjtRQUk3RixNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUE0QixVQUFVLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNyRixNQUFNLHlCQUF5QixHQUFHLG1CQUFtQixDQUFDLElBQUksRUFDekQsSUFBSSxDQUFDLHdCQUF3QixDQUFDLHlCQUF5QixDQUFDLFdBQVcsRUFDbkUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLHlCQUF5QixDQUFDLFVBQVUsRUFBRSxDQUMxRSxDQUFDO1FBRUYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDL0IsTUFBTSxRQUFRLEdBQUcseUJBQXlCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3hELFFBQVEsQ0FBQyxjQUFjLENBQUMsbUJBQW1CLEVBQUU7Z0JBQzVDLElBQUksRUFBRSxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsa0NBQWtDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUNyRixFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNsQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQzs7QUFwQlcsa0NBQWtDO0lBSTVDLFdBQUEsd0JBQXdCLENBQUE7R0FKZCxrQ0FBa0MsQ0FxQjlDOztBQUVELDhCQUE4QixDQUFDLGtDQUFrQyxDQUFDLEVBQUUsRUFBRSxrQ0FBa0Msb0NBQTRCLENBQUMifQ==