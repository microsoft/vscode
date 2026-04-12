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
var ChatEditorOptions_1;
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IViewDescriptorService } from '../../../../common/views.js';
let ChatEditorOptions = class ChatEditorOptions extends Disposable {
    static { ChatEditorOptions_1 = this; }
    static { this.lineHeightEm = 1.4; }
    get configuration() {
        return this._config;
    }
    static { this.relevantSettingIds = [
        'chat.editor.lineHeight',
        'chat.editor.fontSize',
        'chat.editor.fontFamily',
        'chat.editor.fontWeight',
        'chat.editor.wordWrap',
        'editor.cursorBlinking',
        'editor.fontLigatures',
        'editor.accessibilitySupport',
        'editor.bracketPairColorization.enabled',
        'editor.bracketPairColorization.independentColorPoolPerBracketType',
    ]; }
    constructor(viewId, foreground, inputEditorBackgroundColor, resultEditorBackgroundColor, configurationService, themeService, viewDescriptorService) {
        super();
        this.foreground = foreground;
        this.inputEditorBackgroundColor = inputEditorBackgroundColor;
        this.resultEditorBackgroundColor = resultEditorBackgroundColor;
        this.configurationService = configurationService;
        this.themeService = themeService;
        this.viewDescriptorService = viewDescriptorService;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._register(this.themeService.onDidColorThemeChange(e => this.update()));
        this._register(this.viewDescriptorService.onDidChangeLocation(e => {
            if (e.views.some(v => v.id === viewId)) {
                this.update();
            }
        }));
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (ChatEditorOptions_1.relevantSettingIds.some(id => e.affectsConfiguration(id))) {
                this.update();
            }
        }));
        this.update();
    }
    update() {
        const editorConfig = this.configurationService.getValue('editor');
        // TODO shouldn't the setting keys be more specific?
        const chatEditorConfig = this.configurationService.getValue('chat')?.editor;
        const accessibilitySupport = this.configurationService.getValue('editor.accessibilitySupport');
        this._config = {
            foreground: this.themeService.getColorTheme().getColor(this.foreground),
            inputEditor: {
                backgroundColor: this.themeService.getColorTheme().getColor(this.inputEditorBackgroundColor),
                accessibilitySupport,
            },
            resultEditor: {
                backgroundColor: this.themeService.getColorTheme().getColor(this.resultEditorBackgroundColor),
                fontSize: chatEditorConfig.fontSize,
                fontFamily: chatEditorConfig.fontFamily === 'default' ? editorConfig.fontFamily : chatEditorConfig.fontFamily,
                fontWeight: chatEditorConfig.fontWeight,
                lineHeight: chatEditorConfig.lineHeight ? chatEditorConfig.lineHeight : ChatEditorOptions_1.lineHeightEm * chatEditorConfig.fontSize,
                bracketPairColorization: {
                    enabled: this.configurationService.getValue('editor.bracketPairColorization.enabled'),
                    independentColorPoolPerBracketType: this.configurationService.getValue('editor.bracketPairColorization.independentColorPoolPerBracketType'),
                },
                wordWrap: chatEditorConfig.wordWrap,
                fontLigatures: editorConfig.fontLigatures,
            }
        };
        this._onDidChange.fire();
    }
};
ChatEditorOptions = ChatEditorOptions_1 = __decorate([
    __param(4, IConfigurationService),
    __param(5, IThemeService),
    __param(6, IViewDescriptorService)
], ChatEditorOptions);
export { ChatEditorOptions };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE9wdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRPcHRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRXJFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNyRixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQXVDOUQsSUFBTSxpQkFBaUIsR0FBdkIsTUFBTSxpQkFBa0IsU0FBUSxVQUFVOzthQUN4QixpQkFBWSxHQUFHLEdBQUcsQUFBTixDQUFPO0lBTTNDLElBQVcsYUFBYTtRQUN2QixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7SUFDckIsQ0FBQzthQUV1Qix1QkFBa0IsR0FBRztRQUM1Qyx3QkFBd0I7UUFDeEIsc0JBQXNCO1FBQ3RCLHdCQUF3QjtRQUN4Qix3QkFBd0I7UUFDeEIsc0JBQXNCO1FBQ3RCLHVCQUF1QjtRQUN2QixzQkFBc0I7UUFDdEIsNkJBQTZCO1FBQzdCLHdDQUF3QztRQUN4QyxtRUFBbUU7S0FDbkUsQUFYeUMsQ0FXeEM7SUFFRixZQUNDLE1BQTBCLEVBQ1QsVUFBa0IsRUFDbEIsMEJBQWtDLEVBQ2xDLDJCQUFtQyxFQUM3QixvQkFBNEQsRUFDcEUsWUFBNEMsRUFDbkMscUJBQThEO1FBRXRGLEtBQUssRUFBRSxDQUFDO1FBUFMsZUFBVSxHQUFWLFVBQVUsQ0FBUTtRQUNsQiwrQkFBMEIsR0FBMUIsMEJBQTBCLENBQVE7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