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
import { reset } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
/**
 * A small reusable widget that renders an enablement status message inside
 * a `.status` container, matching the style used by the extension and MCP
 * server editors. The message is shown only when the contribution is
 * disabled and is rendered as markdown with a theme icon prefix.
 */
let EnablementStatusWidget = class EnablementStatusWidget extends Disposable {
    constructor(_container, enablement, _labels, _markdownRendererService) {
        super();
        this._container = _container;
        this._labels = _labels;
        this._markdownRendererService = _markdownRendererService;
        this._renderDisposables = this._register(new MutableDisposable());
        this._register(autorun(reader => {
            this._render(enablement.read(reader));
        }));
    }
    _render(state) {
        reset(this._container);
        this._renderDisposables.value = undefined;
        let message;
        if (state === 0 /* ContributionEnablementState.DisabledProfile */) {
            message = this._labels.disabledProfile;
        }
        else if (state === 1 /* ContributionEnablementState.DisabledWorkspace */) {
            message = this._labels.disabledWorkspace;
        }
        if (!message) {
            return;
        }
        const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
        markdown.appendMarkdown(`$(${Codicon.info.id})&nbsp;`);
        markdown.appendText(message);
        const rendered = this._markdownRendererService.render(markdown);
        this._renderDisposables.value = rendered;
        this._container.appendChild(rendered.element);
    }
};
EnablementStatusWidget = __decorate([
    __param(3, IMarkdownRendererService)
], EnablementStatusWidget);
export { EnablementStatusWidget };
/** Default labels for plugin enablement status. */
export const pluginEnablementLabels = {
    disabledProfile: localize('pluginDisabled', "This plugin is disabled."),
    disabledWorkspace: localize('pluginDisabledWorkspace', "This plugin is disabled for this workspace."),
};
/** Default labels for MCP server enablement status. */
export const mcpServerEnablementLabels = {
    disabledProfile: localize('mcpServerDisabled', "This MCP server is disabled."),
    disabledWorkspace: localize('mcpServerDisabledWorkspace', "This MCP server is disabled for this workspace."),
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5hYmxlbWVudFN0YXR1c1dpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9lbmFibGVtZW50U3RhdHVzV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNyRixPQUFPLEVBQWUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDN0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBR3JHOzs7OztHQUtHO0FBQ0ksSUFBTSxzQkFBc0IsR0FBNUIsTUFBTSxzQkFBdUIsU0FBUSxVQUFVO0lBSXJELFlBQ2tCLFVBQXVCLEVBQ3hDLFVBQW9ELEVBQ25DLE9BR2hCLEVBQ3lCLHdCQUFtRTtRQUU3RixLQUFLLEVBQUUsQ0FBQztRQVJTLGVBQVUsR0FBVixVQUFVLENBQWE7UUFFdkIsWUFBTyxHQUFQLE9BQU8sQ0FHdkI7UUFDMEMsNkJBQXdCLEdBQXhCLHdCQUF3QixDQUEwQjtRQVQ3RSx1QkFBa0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO1FBWTdFLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQy9CLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQ3ZDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRU8sT0FBTyxDQUFDLEtBQWtDO1FBQ2pELEtBQUssQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDdkIsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssR0FBRyxTQUFTLENBQUM7UUFFMUMsSUFBSSxPQUEyQixDQUFDO1FBQ2hDLElBQUksS0FBSyx3REFBZ0QsRUFBRSxDQUFDO1lBQzNELE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQztRQUN4QyxDQUFDO2FBQU0sSUFBSSxLQUFLLDBEQUFrRCxFQUFFLENBQUM7WUFDcEUsT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUM7UUFDMUMsQ0FBQztRQUVELElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNkLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsSUFBSSxjQUFjLENBQUMsRUFBRSxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3RGLFFBQVEsQ0FBQyxjQUFjLENBQUMsS0FBSyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDdkQsUUFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM3QixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsd0JBQXdCLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2hFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFDO1FBQ3pDLElBQUksQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUMvQyxDQUFDO0NBQ0QsQ0FBQTtBQXpDWSxzQkFBc0I7SUFXaEMsV0FBQSx3QkFBd0IsQ0FBQTtHQVhkLHNCQUFzQixDQXlDbEM7O0FBRUQsbURBQW1EO0FBQ25ELE1BQU0sQ0FBQyxNQUFNLHNCQUFzQixHQUFHO0lBQ3JDLGVBQWUsRUFBRSxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsMEJBQTBCLENBQUM7SUFDdkUsaUJBQWlCLEVBQUUsUUFBUSxDQUFDLHlCQUF5QixFQUFFLDZDQUE2QyxDQUFDO0NBQ3JHLENBQUM7QUFFRix1REFBdUQ7QUFDdkQsTUFBTSxDQUFDLE1BQU0seUJBQXlCLEdBQUc7SUFDeEMsZUFBZSxFQUFFLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSw4QkFBOEIsQ0FBQztJQUM5RSxpQkFBaUIsRUFBRSxRQUFRLENBQUMsNEJBQTRCLEVBQUUsaURBQWlELENBQUM7Q0FDNUcsQ0FBQyJ9