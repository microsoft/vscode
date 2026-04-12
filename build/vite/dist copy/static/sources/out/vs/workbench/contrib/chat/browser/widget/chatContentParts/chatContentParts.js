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
import { Disposable, ReferenceCollection } from '../../../../../../base/common/lifecycle.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
/**
 * Ref-counted collection of inline text models keyed by URI. Models are
 * created on first acquire and disposed only when the last reference is
 * released, preventing duplicate-model errors during re-renders.
 */
let InlineTextModelCollection = class InlineTextModelCollection extends Disposable {
    constructor(modelService) {
        super();
        this._collection = new InlineTextModelReferenceCollection(modelService);
    }
    acquire(uri, value, languageSelection, isForSimpleWidget) {
        return this._collection.acquire(uri.toString(), uri, value, languageSelection, isForSimpleWidget);
    }
};
InlineTextModelCollection = __decorate([
    __param(0, IModelService)
], InlineTextModelCollection);
export { InlineTextModelCollection };
class InlineTextModelReferenceCollection extends ReferenceCollection {
    constructor(modelService) {
        super();
        this.modelService = modelService;
    }
    createReferencedObject(key, uri, value, languageSelection, isForSimpleWidget) {
        return this.modelService.createModel(value, languageSelection, uri, isForSimpleWidget);
    }
    destroyReferencedObject(_key, model) {
        model.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdENvbnRlbnRQYXJ0cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29udGVudFBhcnRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQWUsbUJBQW1CLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQVExRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUErQ2xGOzs7O0dBSUc7QUFDSSxJQUFNLHlCQUF5QixHQUEvQixNQUFNLHlCQUEwQixTQUFRLFVBQVU7SUFHeEQsWUFBMkIsWUFBMkI7UUFDckQsS0FBSyxFQUFFLENBQUM7UUFDUixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksa0NBQWtDLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDekUsQ0FBQztJQUVELE9BQU8sQ0FBQyxHQUFRLEVBQUUsS0FBYSxFQUFFLGlCQUE0QyxFQUFFLGlCQUEwQjtRQUN4RyxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLGlCQUFpQixFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDbkcsQ0FBQztDQUNELENBQUE7QUFYWSx5QkFBeUI7SUFHeEIsV0FBQSxhQUFhLENBQUE7R0FIZCx5QkFBeUIsQ0FXckM7O0FBRUQsTUFBTSxrQ0FBbUMsU0FBUSxtQkFBK0I7SUFDL0UsWUFBNkIsWUFBMkI7UUFDdkQsS0FBSyxFQUFFLENBQUM7UUFEb0IsaUJBQVksR0FBWixZQUFZLENBQWU7SUFFeEQsQ0FBQztJQUVrQixzQkFBc0IsQ0FBQyxHQUFXLEVBQUUsR0FBUSxFQUFFLEtBQWEsRUFBRSxpQkFBNEMsRUFBRSxpQkFBMEI7UUFDdkosT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDeEYsQ0FBQztJQUVrQix1QkFBdUIsQ0FBQyxJQUFZLEVBQUUsS0FBaUI7UUFDekUsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pCLENBQUM7Q0FDRCJ9