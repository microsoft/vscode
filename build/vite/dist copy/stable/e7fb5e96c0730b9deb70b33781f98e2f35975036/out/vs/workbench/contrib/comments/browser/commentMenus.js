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
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
let CommentMenus = class CommentMenus {
    constructor(menuService) {
        this.menuService = menuService;
    }
    getCommentThreadTitleActions(contextKeyService) {
        return this.getMenu(MenuId.CommentThreadTitle, contextKeyService);
    }
    getCommentThreadActions(contextKeyService) {
        return this.getMenu(MenuId.CommentThreadActions, contextKeyService);
    }
    getCommentEditorActions(contextKeyService) {
        return this.getMenu(MenuId.CommentEditorActions, contextKeyService);
    }
    getCommentThreadAdditionalActions(contextKeyService) {
        return this.getMenu(MenuId.CommentThreadAdditionalActions, contextKeyService, { emitEventsForSubmenuChanges: true });
    }
    getCommentTitleActions(comment, contextKeyService) {
        return this.getMenu(MenuId.CommentTitle, contextKeyService);
    }
    getCommentActions(comment, contextKeyService) {
        return this.getMenu(MenuId.CommentActions, contextKeyService);
    }
    getCommentThreadTitleContextActions(contextKeyService) {
        return this.getActions(MenuId.CommentThreadTitleContext, contextKeyService, { shouldForwardArgs: true });
    }
    getMenu(menuId, contextKeyService, options) {
        return this.menuService.createMenu(menuId, contextKeyService, options);
    }
    getActions(menuId, contextKeyService, options) {
        return this.menuService.getMenuActions(menuId, contextKeyService, options).map((value) => value[1]).flat();
    }
    dispose() {
    }
};
CommentMenus = __decorate([
    __param(0, IMenuService)
], CommentMenus);
export { CommentMenus };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWVudE1lbnVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY29tbWVudHMvYnJvd3Nlci9jb21tZW50TWVudXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFJaEcsT0FBTyxFQUFpRCxZQUFZLEVBQUUsTUFBTSxFQUFxQyxNQUFNLGdEQUFnRCxDQUFDO0FBR2pLLElBQU0sWUFBWSxHQUFsQixNQUFNLFlBQVk7SUFDeEIsWUFDZ0MsV0FBeUI7UUFBekIsZ0JBQVcsR0FBWCxXQUFXLENBQWM7SUFDckQsQ0FBQztJQUVMLDRCQUE0QixDQUFDLGlCQUFxQztRQUNqRSxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLGtCQUFrQixFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDbkUsQ0FBQztJQUVELHVCQUF1QixDQUFDLGlCQUFxQztRQUM1RCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLG9CQUFvQixFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDckUsQ0FBQztJQUVELHVCQUF1QixDQUFDLGlCQUFxQztRQUM1RCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLG9CQUFvQixFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDckUsQ0FBQztJQUVELGlDQUFpQyxDQUFDLGlCQUFxQztRQUN0RSxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLDhCQUE4QixFQUFFLGlCQUFpQixFQUFFLEVBQUUsMkJBQTJCLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUN0SCxDQUFDO0lBRUQsc0JBQXNCLENBQUMsT0FBZ0IsRUFBRSxpQkFBcUM7UUFDN0UsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztJQUM3RCxDQUFDO0lBRUQsaUJBQWlCLENBQUMsT0FBZ0IsRUFBRSxpQkFBcUM7UUFDeEUsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztJQUMvRCxDQUFDO0lBRUQsbUNBQW1DLENBQUMsaUJBQXFDO1FBQ3hFLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMseUJBQXlCLEVBQUUsaUJBQWlCLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQzFHLENBQUM7SUFFTyxPQUFPLENBQUMsTUFBYyxFQUFFLGlCQUFxQyxFQUFFLE9BQTRCO1FBQ2xHLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLGlCQUFpQixFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ3hFLENBQUM7SUFFTyxVQUFVLENBQUMsTUFBYyxFQUFFLGlCQUFxQyxFQUFFLE9BQTRCO1FBQ3JHLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLGlCQUFpQixFQUFFLE9BQU8sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDNUcsQ0FBQztJQUVELE9BQU87SUFFUCxDQUFDO0NBQ0QsQ0FBQTtBQTVDWSxZQUFZO0lBRXRCLFdBQUEsWUFBWSxDQUFBO0dBRkYsWUFBWSxDQTRDeEIifQ==