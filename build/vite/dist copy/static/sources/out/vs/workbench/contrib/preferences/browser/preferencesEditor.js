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
var PreferencesEditor_1;
import './media/preferencesEditor.css';
import * as DOM from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { Event } from '../../../../base/common/event.js';
import { getInputBoxStyle } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { CONTEXT_PREFERENCES_SEARCH_FOCUS } from '../common/preferences.js';
import { settingsTextInputBorder } from '../common/settingsEditorColorRegistry.js';
import { SearchWidget } from './preferencesWidgets.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions } from './preferencesEditorRegistry.js';
import { Action } from '../../../../base/common/actions.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';
class PreferenceTabAction extends Action {
    constructor(descriptor, actionCallback) {
        super(descriptor.id, descriptor.title, '', true, actionCallback);
        this.descriptor = descriptor;
    }
}
let PreferencesEditor = class PreferencesEditor extends EditorPane {
    static { PreferencesEditor_1 = this; }
    static { this.ID = 'workbench.editor.preferences'; }
    constructor(group, telemetryService, themeService, storageService, instantiationService, contextKeyService) {
        super(PreferencesEditor_1.ID, group, telemetryService, themeService, storageService);
        this.instantiationService = instantiationService;
        this.editorPanesRegistry = Registry.as(Extensions.PreferencesEditorPane);
        this.preferencesTabActions = [];
        this.preferencesEditorPane = this._register(new MutableDisposable());
        this.searchFocusContextKey = CONTEXT_PREFERENCES_SEARCH_FOCUS.bindTo(contextKeyService);
        this.element = DOM.$('.preferences-editor');
        const headerContainer = DOM.append(this.element, DOM.$('.preferences-editor-header'));
        const searchContainer = DOM.append(headerContainer, DOM.$('.search-container'));
        this.searchWidget = this._register(this.instantiationService.createInstance(SearchWidget, searchContainer, {
            focusKey: this.searchFocusContextKey,
            inputBoxStyles: getInputBoxStyle({
                inputBorder: settingsTextInputBorder
            })
        }));
        this._register(Event.debounce(this.searchWidget.onDidChange, () => undefined, 300)(() => {
            this.preferencesEditorPane.value?.search(this.searchWidget.getValue());
        }));
        const preferencesTabsContainer = DOM.append(headerContainer, DOM.$('.preferences-tabs-container'));
        this.preferencesTabActionBar = this._register(new ActionBar(preferencesTabsContainer, {
            orientation: 0 /* ActionsOrientation.HORIZONTAL */,
            focusOnlyEnabledItems: true,
            ariaLabel: localize('preferencesTabSwitcherBarAriaLabel', "Preferences Tab Switcher"),
            ariaRole: 'tablist',
        }));
        this.onDidChangePreferencesEditorPane(this.editorPanesRegistry.getPreferencesEditorPanes(), []);
        this._register(this.editorPanesRegistry.onDidRegisterPreferencesEditorPanes(descriptors => this.onDidChangePreferencesEditorPane(descriptors, [])));
        this._register(this.editorPanesRegistry.onDidDeregisterPreferencesEditorPanes(descriptors => this.onDidChangePreferencesEditorPane([], descriptors)));
        this.bodyElement = DOM.append(this.element, DOM.$('.preferences-editor-body'));
    }
    createEditor(parent) {
        DOM.append(parent, this.element);
    }
    layout(dimension) {
        this.dimension = dimension;
        this.searchWidget.layout(dimension);
        this.searchWidget.inputBox.inputElement.style.paddingRight = `12px`;
        this.preferencesEditorPane.value?.layout(new DOM.Dimension(this.bodyElement.clientWidth, dimension.height - 87 /* header height */));
    }
    async setInput(input, options, context, token) {
        await super.setInput(input, options, context, token);
        if (this.preferencesTabActions.length) {
            this.onDidSelectPreferencesEditorPane(this.preferencesTabActions[0].id);
        }
    }
    onDidChangePreferencesEditorPane(toAdd, toRemove) {
        for (const desc of toRemove) {
            const index = this.preferencesTabActions.findIndex(action => action.id === desc.id);
            if (index !== -1) {
                this.preferencesTabActionBar.pull(index);
                this.preferencesTabActions[index].dispose();
                this.preferencesTabActions.splice(index, 1);
            }
        }
        if (toAdd.length > 0) {
            const all = this.editorPanesRegistry.getPreferencesEditorPanes();
            for (const desc of toAdd) {
                const index = all.findIndex(action => action.id === desc.id);
                if (index !== -1) {
                    const action = new PreferenceTabAction(desc, () => this.onDidSelectPreferencesEditorPane(desc.id));
                    this.preferencesTabActions.splice(index, 0, action);
                    this.preferencesTabActionBar.push(action, { index });
                }
            }
        }
    }
    onDidSelectPreferencesEditorPane(id) {
        let selectedAction;
        for (const action of this.preferencesTabActions) {
            if (action.id === id) {
                action.checked = true;
                selectedAction = action;
            }
            else {
                action.checked = false;
            }
        }
        if (selectedAction) {
            this.searchWidget.inputBox.setPlaceHolder(localize('FullTextSearchPlaceholder', "Search {0}", selectedAction.descriptor.title));
            this.searchWidget.inputBox.setAriaLabel(localize('FullTextSearchPlaceholder', "Search {0}", selectedAction.descriptor.title));
        }
        this.renderBody(selectedAction?.descriptor);
        if (this.dimension) {
            this.layout(this.dimension);
        }
    }
    renderBody(descriptor) {
        this.preferencesEditorPane.value = undefined;
        DOM.clearNode(this.bodyElement);
        if (descriptor) {
            const editorPane = this.instantiationService.createInstance(descriptor.ctorDescriptor.ctor);
            this.preferencesEditorPane.value = editorPane;
            this.bodyElement.appendChild(editorPane.getDomNode());
        }
    }
    dispose() {
        super.dispose();
        this.preferencesTabActions.forEach(action => action.dispose());
    }
};
PreferencesEditor = PreferencesEditor_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IThemeService),
    __param(3, IStorageService),
    __param(4, IInstantiationService),
    __param(5, IContextKeyService)
], PreferencesEditor);
export { PreferencesEditor };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmVyZW5jZXNFZGl0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9wcmVmZXJlbmNlcy9icm93c2VyL3ByZWZlcmVuY2VzRWRpdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLCtCQUErQixDQUFDO0FBQ3ZDLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdkYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUV6RSxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUM1RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdkQsT0FBTyxFQUFFLFNBQVMsRUFBc0IsTUFBTSxvREFBb0QsQ0FBQztBQUNuRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFrQyxVQUFVLEVBQTRELE1BQU0sZ0NBQWdDLENBQUM7QUFDdEosT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBSzVELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRXpFLE1BQU0sbUJBQW9CLFNBQVEsTUFBTTtJQUN2QyxZQUFxQixVQUE0QyxFQUFFLGNBQTBCO1FBQzVGLEtBQUssQ0FBQyxVQUFVLENBQUMsRUFBRSxFQUFFLFVBQVUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxjQUFjLENBQUMsQ0FBQztRQUQ3QyxlQUFVLEdBQVYsVUFBVSxDQUFrQztJQUVqRSxDQUFDO0NBQ0Q7QUFFTSxJQUFNLGlCQUFpQixHQUF2QixNQUFNLGlCQUFrQixTQUFRLFVBQVU7O2FBRWhDLE9BQUUsR0FBVyw4QkFBOEIsQUFBekMsQ0FBMEM7SUFlNUQsWUFDQyxLQUFtQixFQUNBLGdCQUFtQyxFQUN2QyxZQUEyQixFQUN6QixjQUErQixFQUN6QixvQkFBNEQsRUFDL0QsaUJBQXFDO1FBRXpELEtBQUssQ0FBQyxtQkFBaUIsQ0FBQyxFQUFFLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLFlBQVksRUFBRSxjQUFjLENBQUMsQ0FBQztRQUgzQyx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBbEJuRSx3QkFBbUIsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFpQyxVQUFVLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQU1wRywwQkFBcUIsR0FBMEIsRUFBRSxDQUFDO1FBQ2xELDBCQUFxQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxpQkFBaUIsRUFBMEIsQ0FBQyxDQUFDO1FBZ0J4RyxJQUFJLENBQUMscUJBQXFCLEdBQUcsZ0NBQWdDLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFFeEYsSUFBSSxDQUFDLE9BQU8sR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFDNUMsTUFBTSxlQUFlLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsNEJBQTRCLENBQUMsQ0FBQyxDQUFDO1FBRXRGLE1BQU0sZUFBZSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsZUFBZSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDO1FBQ2hGLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLFlBQVksRUFBRSxlQUFlLEVBQUU7WUFDMUcsUUFBUSxFQUFFLElBQUksQ0FBQyxxQkFBcUI7WUFDcEMsY0FBYyxFQUFFLGdCQUFnQixDQUFDO2dCQUNoQyxXQUFXLEVBQUUsdUJBQXVCO2FBQ3BDLENBQUM7U0FDRixDQUFDLENBQUMsQ0FBQztRQUNKLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFO1lBQ3ZGLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUN4RSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSx3QkFBd0IsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLDZCQUE2QixDQUFDLENBQUMsQ0FBQztRQUNuRyxJQUFJLENBQUMsdUJBQXVCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLFNBQVMsQ0FBQyx3QkFBd0IsRUFBRTtZQUNyRixXQUFXLHVDQUErQjtZQUMxQyxxQkFBcUIsRUFBRSxJQUFJO1lBQzNCLFNBQVMsRUFBRSxRQUFRLENBQUMsb0NBQW9DLEVBQUUsMEJBQTBCLENBQUM7WUFDckYsUUFBUSxFQUFFLFNBQVM7U0FDbkIsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsZ0NBQWdDLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLHlCQUF5QixFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDaEcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsbUNBQW1DLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNwSixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxxQ0FBcUMsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxFQUFFLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRXRKLElBQUksQ0FBQyxXQUFXLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxDQUFDO0lBQ2hGLENBQUM7SUFFUyxZQUFZLENBQUMsTUFBbUI7UUFDekMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFFRCxNQUFNLENBQUMsU0FBd0I7UUFDOUIsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7UUFDM0IsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDcEMsSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxZQUFZLEdBQUcsTUFBTSxDQUFDO1FBRXBFLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFdBQVcsRUFBRSxTQUFTLENBQUMsTUFBTSxHQUFHLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUM7SUFDdEksQ0FBQztJQUVRLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBa0IsRUFBRSxPQUFtQyxFQUFFLE9BQTJCLEVBQUUsS0FBd0I7UUFDckksTUFBTSxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3JELElBQUksSUFBSSxDQUFDLHFCQUFxQixDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3ZDLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDekUsQ0FBQztJQUNGLENBQUM7SUFFTyxnQ0FBZ0MsQ0FBQyxLQUFrRCxFQUFFLFFBQXFEO1FBQ2pKLEtBQUssTUFBTSxJQUFJLElBQUksUUFBUSxFQUFFLENBQUM7WUFDN0IsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3BGLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ2xCLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ3pDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDNUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDN0MsQ0FBQztRQUNGLENBQUM7UUFDRCxJQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDdEIsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLHlCQUF5QixFQUFFLENBQUM7WUFDakUsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsQ0FBQztnQkFDMUIsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUM3RCxJQUFJLEtBQUssS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO29CQUNsQixNQUFNLE1BQU0sR0FBRyxJQUFJLG1CQUFtQixDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQ25HLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQztvQkFDcEQsSUFBSSxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO2dCQUN0RCxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRU8sZ0NBQWdDLENBQUMsRUFBVTtRQUNsRCxJQUFJLGNBQStDLENBQUM7UUFDcEQsS0FBSyxNQUFNLE1BQU0sSUFBSSxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUNqRCxJQUFJLE1BQU0sQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUM7Z0JBQ3RCLE1BQU0sQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDO2dCQUN0QixjQUFjLEdBQUcsTUFBTSxDQUFDO1lBQ3pCLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxNQUFNLENBQUMsT0FBTyxHQUFHLEtBQUssQ0FBQztZQUN4QixDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksY0FBYyxFQUFFLENBQUM7WUFDcEIsSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSxZQUFZLEVBQUUsY0FBYyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ2hJLElBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsMkJBQTJCLEVBQUUsWUFBWSxFQUFFLGNBQWMsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUMvSCxDQUFDO1FBRUQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxjQUFjLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFFNUMsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDcEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDN0IsQ0FBQztJQUNGLENBQUM7SUFFTyxVQUFVLENBQUMsVUFBNkM7UUFDL0QsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssR0FBRyxTQUFTLENBQUM7UUFDN0MsR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFaEMsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNoQixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUF5QixVQUFVLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3BILElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLEdBQUcsVUFBVSxDQUFDO1lBQzlDLElBQUksQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZELENBQUM7SUFDRixDQUFDO0lBRVEsT0FBTztRQUNmLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNoQixJQUFJLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFDaEUsQ0FBQzs7QUF2SVcsaUJBQWlCO0lBbUIzQixXQUFBLGlCQUFpQixDQUFBO0lBQ2pCLFdBQUEsYUFBYSxDQUFBO0lBQ2IsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsa0JBQWtCLENBQUE7R0F2QlIsaUJBQWlCLENBd0k3QiJ9