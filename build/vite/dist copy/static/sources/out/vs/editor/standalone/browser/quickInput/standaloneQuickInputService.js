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
import './standaloneQuickInput.css';
import { Event } from '../../../../base/common/event.js';
import { registerEditorContribution } from '../../../browser/editorExtensions.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorScopedLayoutService } from '../standaloneLayoutService.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { QuickInputService } from '../../../../platform/quickinput/browser/quickInputService.js';
import { createSingleCallFunction } from '../../../../base/common/functional.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
let EditorScopedQuickInputService = class EditorScopedQuickInputService extends QuickInputService {
    constructor(editor, instantiationService, contextKeyService, themeService, codeEditorService, configurationService) {
        super(instantiationService, contextKeyService, themeService, new EditorScopedLayoutService(editor.getContainerDomNode(), codeEditorService), configurationService);
        this.host = undefined;
        // Use the passed in code editor as host for the quick input widget
        const contribution = QuickInputEditorContribution.get(editor);
        if (contribution) {
            const widget = contribution.widget;
            this.host = {
                _serviceBrand: undefined,
                get mainContainer() { return widget.getDomNode(); },
                getContainer() { return widget.getDomNode(); },
                whenContainerStylesLoaded() { return undefined; },
                get containers() { return [widget.getDomNode()]; },
                get activeContainer() { return widget.getDomNode(); },
                get mainContainerDimension() { return editor.getLayoutInfo(); },
                get activeContainerDimension() { return editor.getLayoutInfo(); },
                get onDidLayoutMainContainer() { return editor.onDidLayoutChange; },
                get onDidLayoutActiveContainer() { return editor.onDidLayoutChange; },
                get onDidLayoutContainer() { return Event.map(editor.onDidLayoutChange, dimension => ({ container: widget.getDomNode(), dimension })); },
                get onDidChangeActiveContainer() { return Event.None; },
                get onDidAddContainer() { return Event.None; },
                get mainContainerOffset() { return { top: 0, quickPickTop: 0 }; },
                get activeContainerOffset() { return { top: 0, quickPickTop: 0 }; },
                focus: () => editor.focus()
            };
        }
        else {
            this.host = undefined;
        }
    }
    createController() {
        return super.createController(this.host);
    }
};
EditorScopedQuickInputService = __decorate([
    __param(1, IInstantiationService),
    __param(2, IContextKeyService),
    __param(3, IThemeService),
    __param(4, ICodeEditorService),
    __param(5, IConfigurationService)
], EditorScopedQuickInputService);
let StandaloneQuickInputService = class StandaloneQuickInputService {
    get activeService() {
        const editor = this.codeEditorService.getFocusedCodeEditor();
        if (!editor) {
            throw new Error('Quick input service needs a focused editor to work.');
        }
        // Find the quick input implementation for the focused
        // editor or create it lazily if not yet created
        let quickInputService = this.mapEditorToService.get(editor);
        if (!quickInputService) {
            const newQuickInputService = quickInputService = this.instantiationService.createInstance(EditorScopedQuickInputService, editor);
            this.mapEditorToService.set(editor, quickInputService);
            createSingleCallFunction(editor.onDidDispose)(() => {
                newQuickInputService.dispose();
                this.mapEditorToService.delete(editor);
            });
        }
        return quickInputService;
    }
    get currentQuickInput() { return this.activeService.currentQuickInput; }
    get quickAccess() { return this.activeService.quickAccess; }
    get backButton() { return this.activeService.backButton; }
    get alignment() { return this.activeService.alignment; }
    get onShow() { return this.activeService.onShow; }
    get onHide() { return this.activeService.onHide; }
    constructor(instantiationService, codeEditorService) {
        this.instantiationService = instantiationService;
        this.codeEditorService = codeEditorService;
        this.mapEditorToService = new Map();
    }
    pick(picks, options, token = CancellationToken.None) {
        return this.activeService /* TS fail */.pick(picks, options, token);
    }
    input(options, token) {
        return this.activeService.input(options, token);
    }
    createQuickPick(options = { useSeparators: false }) {
        return this.activeService.createQuickPick(options);
    }
    createInputBox() {
        return this.activeService.createInputBox();
    }
    createQuickWidget() {
        return this.activeService.createQuickWidget();
    }
    createQuickTree() {
        return this.activeService.createQuickTree();
    }
    focus() {
        return this.activeService.focus();
    }
    toggle() {
        return this.activeService.toggle();
    }
    navigate(next, quickNavigate) {
        return this.activeService.navigate(next, quickNavigate);
    }
    accept() {
        return this.activeService.accept();
    }
    back() {
        return this.activeService.back();
    }
    cancel() {
        return this.activeService.cancel();
    }
    setAlignment(alignment) {
        return this.activeService.setAlignment(alignment);
    }
    toggleHover() {
        return this.activeService.toggleHover();
    }
};
StandaloneQuickInputService = __decorate([
    __param(0, IInstantiationService),
    __param(1, ICodeEditorService)
], StandaloneQuickInputService);
export { StandaloneQuickInputService };
export class QuickInputEditorContribution {
    static { this.ID = 'editor.controller.quickInput'; }
    static get(editor) {
        return editor.getContribution(QuickInputEditorContribution.ID);
    }
    constructor(editor) {
        this.editor = editor;
        this.widget = new QuickInputEditorWidget(this.editor);
    }
    dispose() {
        this.widget.dispose();
    }
}
export class QuickInputEditorWidget {
    static { this.ID = 'editor.contrib.quickInputWidget'; }
    constructor(codeEditor) {
        this.codeEditor = codeEditor;
        this.domNode = document.createElement('div');
        this.codeEditor.addOverlayWidget(this);
    }
    getId() {
        return QuickInputEditorWidget.ID;
    }
    getDomNode() {
        return this.domNode;
    }
    getPosition() {
        return { preference: { top: 0, left: 0 } };
    }
    dispose() {
        this.codeEditor.removeOverlayWidget(this);
    }
}
registerEditorContribution(QuickInputEditorContribution.ID, QuickInputEditorContribution, 4 /* EditorContributionInstantiation.Lazy */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhbG9uZVF1aWNrSW5wdXRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3N0YW5kYWxvbmUvYnJvd3Nlci9xdWlja0lucHV0L3N0YW5kYWxvbmVRdWlja0lucHV0U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLDRCQUE0QixDQUFDO0FBQ3BDLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUV6RCxPQUFPLEVBQW1DLDBCQUEwQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFbkgsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRWxGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzFFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRXBGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRW5HLElBQU0sNkJBQTZCLEdBQW5DLE1BQU0sNkJBQThCLFNBQVEsaUJBQWlCO0lBSTVELFlBQ0MsTUFBbUIsRUFDSSxvQkFBMkMsRUFDOUMsaUJBQXFDLEVBQzFDLFlBQTJCLEVBQ3RCLGlCQUFxQyxFQUNsQyxvQkFBMkM7UUFFbEUsS0FBSyxDQUNKLG9C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