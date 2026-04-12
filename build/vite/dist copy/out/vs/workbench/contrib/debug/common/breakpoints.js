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
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
let Breakpoints = class Breakpoints {
    constructor(breakpointContribution, contextKeyService) {
        this.breakpointContribution = breakpointContribution;
        this.contextKeyService = contextKeyService;
        this.breakpointsWhen = typeof breakpointContribution.when === 'string' ? ContextKeyExpr.deserialize(breakpointContribution.when) : undefined;
    }
    get language() {
        return this.breakpointContribution.language;
    }
    get enabled() {
        return !this.breakpointsWhen || this.contextKeyService.contextMatchesRules(this.breakpointsWhen);
    }
};
Breakpoints = __decorate([
    __param(1, IContextKeyService)
], Breakpoints);
export { Breakpoints };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJlYWtwb2ludHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy9jb21tb24vYnJlYWtwb2ludHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGNBQWMsRUFBd0Isa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUd6SCxJQUFNLFdBQVcsR0FBakIsTUFBTSxXQUFXO0lBSXZCLFlBQ2tCLHNCQUErQyxFQUMzQixpQkFBcUM7UUFEekQsMkJBQXNCLEdBQXRCLHNCQUFzQixDQUF5QjtRQUMzQixzQkFBaUIsR0FBakIsaUJBQWlCLENBQW9CO1FBRTFFLElBQUksQ0FBQyxlQUFlLEdBQUcsT0FBTyxzQkFBc0IsQ0FBQyxJQUFJLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsV0FBVyxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7SUFDOUksQ0FBQztJQUVELElBQUksUUFBUTtRQUNYLE9BQU8sSUFBSSxDQUFDLHNCQUFzQixDQUFDLFFBQVEsQ0FBQztJQUM3QyxDQUFDO0lBRUQsSUFBSSxPQUFPO1FBQ1YsT0FBTyxDQUFDLElBQUksQ0FBQyxlQUFlLElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztJQUNsRyxDQUFDO0NBQ0QsQ0FBQTtBQWxCWSxXQUFXO0lBTXJCLFdBQUEsa0JBQWtCLENBQUE7R0FOUixXQUFXLENBa0J2QiJ9