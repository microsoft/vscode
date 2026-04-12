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
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
/**
 * Registry for chat input part widgets.
 * Widgets register themselves and are instantiated by the controller based on context key conditions.
 */
export const ChatInputPartWidgetsRegistry = new class {
    constructor() {
        this.widgets = [];
    }
    register(id, ctor, when) {
        this.widgets.push({ id, ctor: ctor, when });
    }
    getWidgets() {
        return this.widgets;
    }
}();
/**
 * Controller that manages the rendering of widgets in the chat input part.
 * Widgets are shown/hidden based on context key conditions.
 */
let ChatInputPartWidgetController = class ChatInputPartWidgetController extends Disposable {
    constructor(container, contextKeyService, instantiationService) {
        super();
        this.container = container;
        this.contextKeyService = contextKeyService;
        this.instantiationService = instantiationService;
        this.renderedWidgets = new Map();
        this.update();
        this._register(this.contextKeyService.onDidChangeContext(e => {
            const relevantKeys = new Set();
            for (const descriptor of ChatInputPartWidgetsRegistry.getWidgets()) {
                if (descriptor.when) {
                    for (const key of descriptor.when.keys()) {
                        relevantKeys.add(key);
                    }
                }
            }
            if (e.affectsSome(relevantKeys)) {
                this.update();
            }
        }));
    }
    update() {
        const visibleIds = new Set();
        for (const descriptor of ChatInputPartWidgetsRegistry.getWidgets()) {
            if (this.contextKeyService.contextMatchesRules(descriptor.when)) {
                visibleIds.add(descriptor.id);
            }
        }
        for (const [id, rendered] of this.renderedWidgets) {
            if (!visibleIds.has(id)) {
                rendered.widget.domNode.remove();
                rendered.disposables.dispose();
                this.renderedWidgets.delete(id);
            }
        }
        for (const descriptor of ChatInputPartWidgetsRegistry.getWidgets()) {
            if (!visibleIds.has(descriptor.id)) {
                continue;
            }
            if (!this.renderedWidgets.has(descriptor.id)) {
                const disposables = new DisposableStore();
                const widget = this.instantiationService.createInstance(descriptor.ctor);
                disposables.add(widget);
                this.renderedWidgets.set(descriptor.id, { descriptor, widget, disposables });
                this.container.appendChild(widget.domNode);
            }
        }
    }
    get height() {
        let total = 0;
        for (const rendered of this.renderedWidgets.values()) {
            total += rendered.widget.height;
        }
        return total;
    }
    dispose() {
        for (const rendered of this.renderedWidgets.values()) {
            rendered.widget.domNode.remove();
            rendered.disposables.dispose();
        }
        this.renderedWidgets.clear();
        super.dispose();
    }
};
ChatInputPartWidgetController = __decorate([
    __param(1, IContextKeyService),
    __param(2, IInstantiationService)
], ChatInputPartWidgetController);
export { ChatInputPartWidgetController };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdElucHV0UGFydFdpZGdldHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dFBhcnRXaWRnZXRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLE1BQU0sNENBQTRDLENBQUM7QUFDdEcsT0FBTyxFQUF3QixrQkFBa0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ3RILE9BQU8sRUFBa0IscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQXVCekg7OztHQUdHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sNEJBQTRCLEdBQUcsSUFBSTtJQUFBO1FBQ3RDLFlBQU8sR0FBcUMsRUFBRSxDQUFDO0lBU3pELENBQUM7SUFQQSxRQUFRLENBQW9DLEVBQVUsRUFBRSxJQUF5RCxFQUFFLElBQTJCO1FBQzdJLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUE4QyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7SUFDdkYsQ0FBQztJQUVELFVBQVU7UUFDVCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7SUFDckIsQ0FBQztDQUNELEVBQUUsQ0FBQztBQVFKOzs7R0FHRztBQUNJLElBQU0sNkJBQTZCLEdBQW5DLE1BQU0sNkJBQThCLFNBQVEsVUFBVTtJQUk1RCxZQUNrQixTQUFzQixFQUNuQixpQkFBc0QsRUFDbkQsb0JBQTREO1FBRW5GLEtBQUssRUFBRSxDQUFDO1FBSlMsY0FBUyxHQUFULFNBQVMsQ0FBYTtRQUNGLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBb0I7UUFDbEMseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQUxuRSxv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