var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isHotReloadEnabled } from '../../../base/common/hotReload.js';
import { readHotReloadableExport } from '../../../base/common/hotReloadHelpers.js';
import { autorunWithStore } from '../../../base/common/observable.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
/**
 * Wrap a class in a reloadable wrapper.
 * When the wrapper is created, the original class is created.
 * When the original class changes, the instance is re-created.
*/
export function wrapInReloadableClass0(getClass) {
    return !isHotReloadEnabled() ? getClass() : createWrapper(getClass, BaseClass0);
}
class BaseClass {
    constructor(instantiationService) {
        this.instantiationService = instantiationService;
    }
    init(...params) { }
}
function createWrapper(getClass, B) {
    // eslint-disable-next-line local/code-no-any-casts
    return (class ReloadableWrapper extends B {
        constructor() {
            super(...arguments);
            this._autorun = undefined;
        }
        init(...params) {
            this._autorun = autorunWithStore((reader, store) => {
                const clazz = readHotReloadableExport(getClass(), reader);
                store.add(this.instantiationService.createInstance(clazz, ...params));
            });
        }
        dispose() {
            this._autorun?.dispose();
        }
    });
}
let BaseClass0 = class BaseClass0 extends BaseClass {
    constructor(i) { super(i); this.init(); }
};
BaseClass0 = __decorate([
    __param(0, IInstantiationService)
], BaseClass0);
/**
 * Wrap a class in a reloadable wrapper.
 * When the wrapper is created, the original class is created.
 * When the original class changes, the instance is re-created.
*/
export function wrapInReloadableClass1(getClass) {
    // eslint-disable-next-line local/code-no-any-casts
    return !isHotReloadEnabled() ? getClass() : createWrapper(getClass, BaseClass1);
}
let BaseClass1 = class BaseClass1 extends BaseClass {
    constructor(param1, i) { super(i); this.init(param1); }
};
BaseClass1 = __decorate([
    __param(1, IInstantiationService)
], BaseClass1);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid3JhcEluUmVsb2FkYWJsZUNsYXNzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vd3JhcEluUmVsb2FkYWJsZUNsYXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5GLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3RFLE9BQU8sRUFBNEMscUJBQXFCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUU5SDs7OztFQUlFO0FBQ0YsTUFBTSxVQUFVLHNCQUFzQixDQUFpQyxRQUE2QjtJQUNuRyxPQUFPLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUUsVUFBVSxDQUFDLENBQUM7QUFDakYsQ0FBQztBQUlELE1BQU0sU0FBUztJQUNkLFlBQ2lCLG9CQUEyQztRQUEzQyx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO0lBQ3hELENBQUM7SUFFRSxJQUFJLENBQUMsR0FBRyxNQUFhLElBQVUsQ0FBQztDQUN2QztBQUVELFNBQVMsYUFBYSxDQUFrQixRQUFtQixFQUFFLENBQWdDO0lBQzVGLG1EQUFtRDtJQUNuRCxPQUFPLENBQUMsTUFBTSxpQkFBa0IsU0FBUSxDQUFDO1FBQWpDOztZQUNDLGFBQVEsR0FBNEIsU0FBUyxDQUFDO1FBWXZELENBQUM7UUFWUyxJQUFJLENBQUMsR0FBRyxNQUFhO1lBQzdCLElBQUksQ0FBQyxRQUFRLEdBQUcsZ0JBQWdCLENBQUMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLEVBQUU7Z0JBQ2xELE1BQU0sS0FBSyxHQUFHLHVCQUF1QixDQUFDLFFBQVEsRUFBRSxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUMxRCxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsS0FBSyxFQUFFLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUN2RSxDQUFDLENBQUMsQ0FBQztRQUNKLENBQUM7UUFFRCxPQUFPO1lBQ04sSUFBSSxDQUFDLFFBQVEsRUFBRSxPQUFPLEVBQUUsQ0FBQztRQUMxQixDQUFDO0tBQ0QsQ0FBUSxDQUFDO0FBQ1gsQ0FBQztBQUVELElBQU0sVUFBVSxHQUFoQixNQUFNLFVBQVcsU0FBUSxTQUFTO0lBQ2pDLFlBQW1DLENBQXdCLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztDQUN2RixDQUFBO0FBRkssVUFBVTtJQUNGLFdBQUEscUJBQXFCLENBQUE7R0FEN0IsVUFBVSxDQUVmO0FBRUQ7Ozs7RUFJRTtBQUNGLE1BQU0sVUFBVSxzQkFBc0IsQ0FBMkMsUUFBNkI7SUFDN0csbURBQW1EO0lBQ25ELE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQVMsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBRSxVQUFVLENBQUMsQ0FBQztBQUN4RixDQUFDO0FBRUQsSUFBTSxVQUFVLEdBQWhCLE1BQU0sVUFBVyxTQUFRLFNBQVM7SUFDakMsWUFBWSxNQUFXLEVBQXlCLENBQXdCLElBQUssS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7Q0FDM0csQ0FBQTtBQUZLLFVBQVU7SUFDVyxXQUFBLHFCQUFxQixDQUFBO0dBRDFDLFVBQVUsQ0FFZiJ9