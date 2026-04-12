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
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ListResizeColumnAction } from './listResizeColumnAction.js';
let ListContext = class ListContext {
    static { this.ID = 'workbench.contrib.listContext'; }
    constructor(contextKeyService) {
        contextKeyService.createKey('listSupportsTypeNavigation', true);
        // @deprecated in favor of listSupportsTypeNavigation
        contextKeyService.createKey('listSupportsKeyboardNavigation', true);
    }
};
ListContext = __decorate([
    __param(0, IContextKeyService)
], ListContext);
export { ListContext };
registerWorkbenchContribution2(ListContext.ID, ListContext, 1 /* WorkbenchPhase.BlockStartup */);
registerAction2(ListResizeColumnAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlzdC5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9saXN0L2Jyb3dzZXIvbGlzdC5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUEwQyw4QkFBOEIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzFILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqRixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUU5RCxJQUFNLFdBQVcsR0FBakIsTUFBTSxXQUFXO2FBRVAsT0FBRSxHQUFHLCtCQUErQixBQUFsQyxDQUFtQztJQUVyRCxZQUNxQixpQkFBcUM7UUFFekQsaUJBQWlCLENBQUMsU0FBUyxDQUFVLDRCQUE0QixFQUFFLElBQUksQ0FBQyxDQUFDO1FBRXpFLHFEQUFxRDtRQUNyRCxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsZ0NBQWdDLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDckUsQ0FBQzs7QUFYVyxXQUFXO0lBS3JCLFdBQUEsa0JBQWtCLENBQUE7R0FMUixXQUFXLENBWXZCOztBQUVELDhCQUE4QixDQUFDLFdBQVcsQ0FBQyxFQUFFLEVBQUUsV0FBVyxzQ0FBOEIsQ0FBQztBQUN6RixlQUFlLENBQUMsc0JBQXNCLENBQUMsQ0FBQyJ9