/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../nls.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { ContentHoverController } from './contentHoverController.js';
import { AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { HoverVerbosityAction } from '../../../common/languages.js';
import { DECREASE_HOVER_VERBOSITY_ACCESSIBLE_ACTION_ID, DECREASE_HOVER_VERBOSITY_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACCESSIBLE_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_ID } from './hoverActionIds.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { Action } from '../../../../base/common/actions.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { labelForHoverVerbosityAction } from './markdownHoverParticipant.js';
var HoverAccessibilityHelpNLS;
(function (HoverAccessibilityHelpNLS) {
    HoverAccessibilityHelpNLS.increaseVerbosity = localize('increaseVerbosity', '- The focused hover part verbosity level can be increased with the Increase Hover Verbosity command.', `<keybinding:${INCREASE_HOVER_VERBOSITY_ACTION_ID}>`);
    HoverAccessibilityHelpNLS.decreaseVerbosity = localize('decreaseVerbosity', '- The focused hover part verbosity level can be decreased with the Decrease Hover Verbosity command.', `<keybinding:${DECREASE_HOVER_VERBOSITY_ACTION_ID}>`);
})(HoverAccessibilityHelpNLS || (HoverAccessibilityHelpNLS = {}));
export class HoverAccessibleView {
    constructor() {
        this.type = "view" /* AccessibleViewType.View */;
        this.priority = 95;
        this.name = 'hover';
        this.when = EditorContextKeys.hoverFocused;
    }
    getProvider(accessor) {
        const codeEditorService = accessor.get(ICodeEditorService);
        const codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
        if (!codeEditor) {
            throw new Error('No active or focused code editor');
        }
        const hoverController = ContentHoverController.get(codeEditor);
        if (!hoverController) {
            return;
        }
        const keybindingService = accessor.get(IKeybindingService);
        return accessor.get(IInstantiationService).createInstance(HoverAccessibleViewProvider, keybindingService, codeEditor, hoverController);
    }
}
export class HoverAccessibilityHelp {
    constructor() {
        this.priority = 100;
        this.name = 'hover';
        this.type = "help" /* AccessibleViewType.Help */;
        this.when = EditorContextKeys.hoverVisible;
    }
    getProvider(accessor) {
        const codeEditorService = accessor.get(ICodeEditorService);
        const codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
        if (!codeEditor) {
            throw new Error('No active or focused code editor');
        }
        const hoverController = ContentHoverController.get(codeEditor);
        if (!hoverController) {
            return;
        }
        return accessor.get(IInstantiationService).createInstance(HoverAccessibilityHelpProvider, hoverController);
    }
}
class BaseHoverAccessibleViewProvider extends Disposable {
    constructor(_hoverController) {
        super();
        this._hoverController = _hoverController;
        this.id = "hover" /* AccessibleViewProviderId.Hover */;
        this.verbositySettingKey = 'accessibility.verbosity.hover';
        this._onDidChangeContent = this._register(new Emitter());
        this.onDidChangeContent = this._onDidChangeContent.event;
        this._focusedHoverPartIndex = -1;
    }
    onOpen() {
        if (!this._hoverController) {
            return;
        }
        this._hoverController.shouldKeepOpenOnEditorMouseMoveOrLeave = true;
        this._focusedHoverPartIndex = this._hoverController.focusedHoverPartIndex();
        this._register(this._hoverController.onHoverContentsChanged(() => {
            this._onDidChangeContent.fire();
        }));
    }
    onClose() {
        if (!this._hoverController) {
            return;
        }
        if (this._focusedHoverPartIndex === -1) {
            this._hoverController.focus();
        }
        else {
            this._hoverController.focusHoverPartWithIndex(this._focusedHoverPartIndex);
        }
        this._focusedHoverPartIndex = -1;
        this._hoverController.shouldKeepOpenOnEditorMouseMoveOrLeave = false;
    }
    provideContentAtIndex(focusedHoverIndex, includeVerbosityActions) {
        if (focusedHoverIndex !== -1) {
            const accessibleContent = this._hoverController.getAccessibleWidgetContentAtIndex(focusedHoverIndex);
            if (accessibleContent === undefined) {
                return '';
            }
            const contents = [];
            if (includeVerbosityActions) {
                contents.push(...this._descriptionsOfVerbosityActionsForIndex(focusedHoverIndex));
            }
            contents.push(accessibleContent);
            return contents.join('\n');
        }
        else {
            const accessibleContent = this._hoverController.getAccessibleWidgetContent();
            if (accessibleContent === undefined) {
                return '';
            }
            const contents = [];
            contents.push(accessibleContent);
            return contents.join('\n');
        }
    }
    _descriptionsOfVerbosityActionsForIndex(index) {
        const content = [];
        const descriptionForIncreaseAction = this._descriptionOfVerbosityActionForIndex(HoverVerbosityAction.Increase, index);
        if (descriptionForIncreaseAction !== undefined) {
            content.push(descriptionForIncreaseAction);
        }
        const descriptionForDecreaseAction = this._descriptionOfVerbosityActionForIndex(HoverVerbosityAction.Decrease, index);
        if (descriptionForDecreaseAction !== undefined) {
            content.push(descriptionForDecreaseAction);
        }
        return content;
    }
    _descriptionOfVerbosityActionForIndex(action, index) {
        const isActionSupported = this._hoverController.doesHoverAtIndexSupportVerbosityAction(index, action);
        if (!isActionSupported) {
            return;
        }
        switch (action) {
            case HoverVerbosityAction.Increase:
                return HoverAccessibilityHelpNLS.increaseVerbosity;
            case HoverVerbosityAction.Decrease:
                return HoverAccessibilityHelpNLS.decreaseVerbosity;
        }
    }
}
export class HoverAccessibilityHelpProvider extends BaseHoverAccessibleViewProvider {
    constructor(hoverController) {
        super(hoverController);
        this.options = { type: "help" /* AccessibleViewType.Help */ };
    }
    provideContent() {
        return this.provideContentAtIndex(this._focusedHoverPartIndex, true);
    }
}
export class HoverAccessibleViewProvider extends BaseHoverAccessibleViewProvider {
    constructor(_keybindingService, _editor, hoverController) {
        super(hoverController);
        this._keybindingService = _keybindingService;
        this._editor = _editor;
        this.options = { type: "view" /* AccessibleViewType.View */ };
        this._initializeOptions(this._editor, hoverController);
    }
    provideContent() {
        return this.provideContentAtIndex(this._focusedHoverPartIndex, false);
    }
    get actions() {
        const actions = [];
        actions.push(this._getActionFor(this._editor, HoverVerbosityAction.Increase));
        actions.push(this._getActionFor(this._editor, HoverVerbosityAction.Decrease));
        return actions;
    }
    _getActionFor(editor, action) {
        let actionId;
        let accessibleActionId;
        let actionCodicon;
        switch (action) {
            case HoverVerbosityAction.Increase:
                actionId = INCREASE_HOVER_VERBOSITY_ACTION_ID;
                accessibleActionId = INCREASE_HOVER_VERBOSITY_ACCESSIBLE_ACTION_ID;
                actionCodicon = Codicon.add;
                break;
            case HoverVerbosityAction.Decrease:
                actionId = DECREASE_HOVER_VERBOSITY_ACTION_ID;
                accessibleActionId = DECREASE_HOVER_VERBOSITY_ACCESSIBLE_ACTION_ID;
                actionCodicon = Codicon.remove;
                break;
        }
        const actionLabel = labelForHoverVerbosityAction(this._keybindingService, action);
        const actionEnabled = this._hoverController.doesHoverAtIndexSupportVerbosityAction(this._focusedHoverPartIndex, action);
        return new Action(accessibleActionId, actionLabel, ThemeIcon.asClassName(actionCodicon), actionEnabled, () => {
            editor.getAction(actionId)?.run({ index: this._focusedHoverPartIndex, focus: false });
        });
    }
    _initializeOptions(editor, hoverController) {
        const helpProvider = this._register(new HoverAccessibilityHelpProvider(hoverController));
        this.options.language = editor.getModel()?.getLanguageId();
        this.options.customHelp = () => { return helpProvider.provideContentAtIndex(this._focusedHoverPartIndex, true); };
    }
}
export class ExtHoverAccessibleView {
    constructor() {
        this.type = "view" /* AccessibleViewType.View */;
        this.priority = 90;
        this.name = 'extension-hover';
    }
    getProvider(accessor) {
        const contextViewService = accessor.get(IContextViewService);
        const contextViewElement = contextViewService.getContextViewElement();
        const extensionHoverContent = contextViewElement?.textContent ?? undefined;
        const hoverService = accessor.get(IHoverService);
        if (contextViewElement.classList.contains('accessible-view-container') || !extensionHoverContent) {
            // The accessible view, itself, uses the context view service to display the text. We don't want to read that.
            return;
        }
        return new AccessibleContentProvider("hover" /* AccessibleViewProviderId.Hover */, { language: 'typescript', type: "view" /* AccessibleViewType.View */ }, () => { return extensionHoverContent; }, () => {
            hoverService.showAndFocusLastHover();
        }, 'accessibility.verbosity.hover');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG92ZXJBY2Nlc3NpYmxlVmlld3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9ob3Zlci9icm93c2VyL2hvdmVyQWNjZXNzaWJsZVZpZXdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNyRSxPQUFPLEVBQWdELHlCQUF5QixFQUEwRCxNQUFNLDhEQUE4RCxDQUFDO0FBRS9NLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM1RSxPQUFPLEVBQUUscUJBQXFCLEVBQW9CLE1BQU0sNERBQTRELENBQUM7QUFDckgsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDcEUsT0FBTyxFQUFFLDZDQUE2QyxFQUFFLGtDQUFrQyxFQUFFLDZDQUE2QyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFFM00sT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDcEYsT0FBTyxFQUFFLE1BQU0sRUFBVyxNQUFNLG9DQUFvQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FB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