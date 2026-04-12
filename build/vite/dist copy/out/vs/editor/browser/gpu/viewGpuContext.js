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
var ViewGpuContext_1;
import * as nls from '../../../nls.js';
import { addDisposableListener, getActiveWindow } from '../../../base/browser/dom.js';
import { createFastDomNode } from '../../../base/browser/fastDomNode.js';
import { Color } from '../../../base/common/color.js';
import { BugIndicatingError } from '../../../base/common/errors.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { observableValue, runOnChange } from '../../../base/common/observable.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { TextureAtlas } from './atlas/textureAtlas.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { INotificationService, Severity } from '../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { GPULifecycle } from './gpuDisposable.js';
import { ensureNonNullable, observeDevicePixelDimensions } from './gpuUtils.js';
import { RectangleRenderer } from './rectangleRenderer.js';
import { DecorationCssRuleExtractor } from './css/decorationCssRuleExtractor.js';
import { Event } from '../../../base/common/event.js';
import { DecorationStyleCache } from './css/decorationStyleCache.js';
let ViewGpuContext = class ViewGpuContext extends Disposable {
    static { ViewGpuContext_1 = this; }
    static { this._decorationCssRuleExtractor = new DecorationCssRuleExtractor(); }
    static get decorationCssRuleExtractor() {
        return ViewGpuContext_1._decorationCssRuleExtractor;
    }
    static { this._decorationStyleCache = new DecorationStyleCache(); }
    static get decorationStyleCache() {
        return ViewGpuContext_1._decorationStyleCache;
    }
    /**
     * The shared texture atlas to use across all views.
     *
     * @throws if called before the GPU device is resolved
     */
    static get atlas() {
        if (!ViewGpuContext_1._atlas) {
            throw new BugIndicatingError('Cannot call ViewGpuContext.textureAtlas before device is resolved');
        }
        return ViewGpuContext_1._atlas;
    }
    /**
     * The shared texture atlas to use across all views. This is a convenience alias for
     * {@link ViewGpuContext.atlas}.
     *
     * @throws if called before the GPU device is resolved
     */
    get atlas() {
        return ViewGpuContext_1.atlas;
    }
    constructor(context, _instantiationService, _notificationService, configurationService, _themeService) {
        super();
        this._instantiationService = _instantiationService;
        this._notificationService = _notificationService;
        this.configurationService = configurationService;
        this._themeService = _themeService;
        /**
         * The hard cap for line columns rendered by the GPU renderer.
         */
        this.maxGpuCols = 2000;
        this.canvas = createFastDomNode(document.createElement('canvas'));
        this.canvas.setClassName('editorCanvas');
        // Adjust the canvas size to avoid drawing under the scroll bar
        this._register(Event.runAndSubscribe(configurationService.onDidChangeConfiguration, e => {
            if (!e || e.affectsConfiguration('editor.scrollbar.verticalScrollbarSize')) {
                const verticalScrollbarSize = configurationService.getValue('editor').scrollbar?.verticalScrollbarSize ?? 14;
                this.canvas.domNode.style.boxSizing = 'border-box';
                this.canvas.domNode.style.paddingRight = `${verticalScrollbarSize}px`;
            }
        }));
        this.ctx = ensureNonNullable(this.canvas.domNode.getContext('webgpu'));
        // Request the GPU device, we only want to do this a single time per window as it's async
        // and can delay the initial render.
        if (!ViewGpuContext_1.device) {
            ViewGpuContext_1.device = GPULifecycle.requestDevice((message) => {
                const choices = [{
                        label: nls.localize('editor.dom.render', "Use DOM-based rendering"),
                        run: () => this.configurationService.updateValue('editor.experimentalGpuAcceleration', 'off'),
                    }];
                this._notificationService.prompt(Severity.Warning, message, choices);
            }).then(ref => {
                ViewGpuContext_1.deviceSync = ref.object;
                if (!ViewGpuContext_1._atlas) {
                    ViewGpuContext_1._atlas = this._instantiationService.createInstance(TextureAtlas, ref.object.limits.maxTextureDimension2D, undefined, ViewGpuContext_1.decorationStyleCache);
                }
                return ref.object;
            });
        }
        const dprObs = observableValue(this, getActiveWindow().devicePixelRatio);
        this._register(addDisposableListener(getActiveWindow(), 'resize', () => {
            dprObs.set(getActiveWindow().devicePixelRatio, undefined);
        }));
        this.devicePixelRatio = dprObs;
        this._register(runOnChange(this.devicePixelRatio, () => ViewGpuContext_1.atlas?.clear()));
        // Clear decoration CSS caches when theme changes as CSS variables may have different values
        this._register(this._themeService.onDidColorThemeChange(() => {
            ViewGpuContext_1.decorationCssRuleExtractor.clear();
            ViewGpuContext_1.atlas?.clear();
        }));
        const canvasDevicePixelDimensions = observableValue(this, { width: this.canvas.domNode.width, height: this.canvas.domNode.height });
        this._register(observeDevicePixelDimensions(this.canvas.domNode, getActiveWindow(), (width, height) => {
            this.canvas.domNode.width = width;
            this.canvas.domNode.height = height;
            canvasDevicePixelDimensions.set({ width, height }, undefined);
        }));
        this.canvasDevicePixelDimensions = canvasDevicePixelDimensions;
        const contentLeft = observableValue(this, 0);
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            contentLeft.set(context.configuration.options.get(165 /* EditorOption.layoutInfo */).contentLeft, undefined);
        }));
        this.contentLeft = contentLeft;
        this.rectangleRenderer = this._register(this._instantiationService.createInstance(RectangleRenderer, context, this.contentLeft, this.devicePixelRatio, this.canvas.domNode, this.ctx, ViewGpuContext_1.device));
    }
    /**
     * This method determines which lines can be and are allowed to be rendered using the GPU
     * renderer. Eventually this should trend all lines, except maybe exceptional cases like
     * decorations that use class names.
     */
    canRender(options, viewportData, lineNumber) {
        const data = viewportData.getViewLineRenderingData(lineNumber);
        // Check if the line has simple attributes that aren't supported
        if (data.containsRTL ||
            data.maxColumn > this.maxGpuCols) {
            return false;
        }
        // Check if all inline decorations are supported
        if (data.inlineDecorations.length > 0) {
            let supported = true;
            for (const decoration of data.inlineDecorations) {
                if (decoration.type !== 0 /* InlineDecorationType.Regular */) {
                    supported = false;
                    break;
                }
                const styleRules = ViewGpuContext_1._decorationCssRuleExtractor.getStyleRules(this.canvas.domNode, decoration.inlineClassName);
                supported &&= styleRules.every(rule => {
                    // Pseudo classes aren't supported currently
                    if (rule.selectorText.includes(':')) {
                        return false;
                    }
                    for (const r of rule.style) {
                        if (!supportsCssRule(r, rule.style)) {
                            return false;
                        }
                    }
                    return true;
                });
                if (!supported) {
                    break;
                }
            }
            return supported;
        }
        return true;
    }
    /**
     * Like {@link canRender} but returns detailed information about why the line cannot be rendered.
     */
    canRenderDetailed(options, viewportData, lineNumber) {
        const data = viewportData.getViewLineRenderingData(lineNumber);
        const reasons = [];
        if (data.containsRTL) {
            reasons.push('containsRTL');
        }
        if (data.maxColumn > this.maxGpuCols) {
            reasons.push('maxColumn > maxGpuCols');
        }
        if (data.inlineDecorations.length > 0) {
            let supported = true;
            const problemTypes = [];
            const problemSelectors = [];
            const problemRules = [];
            for (const decoration of data.inlineDecorations) {
                if (decoration.type !== 0 /* InlineDecorationType.Regular */) {
                    problemTypes.push(decoration.type);
                    supported = false;
                    continue;
                }
                const styleRules = ViewGpuContext_1._decorationCssRuleExtractor.getStyleRules(this.canvas.domNode, decoration.inlineClassName);
                supported &&= styleRules.every(rule => {
                    // Pseudo classes aren't supported currently
                    if (rule.selectorText.includes(':')) {
                        problemSelectors.push(rule.selectorText);
                        return false;
                    }
                    for (const r of rule.style) {
                        if (!supportsCssRule(r, rule.style)) {
                            // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
                            problemRules.push(`${r}: ${rule.style[r]}`);
                            return false;
                        }
                    }
                    return true;
                });
                if (!supported) {
                    continue;
                }
            }
            if (problemTypes.length > 0) {
                reasons.push(`inlineDecorations with unsupported types (${problemTypes.map(e => `\`${e}\``).join(', ')})`);
            }
            if (problemRules.length > 0) {
                reasons.push(`inlineDecorations with unsupported CSS rules (${problemRules.map(e => `\`${e}\``).join(', ')})`);
            }
            if (problemSelectors.length > 0) {
                reasons.push(`inlineDecorations with unsupported CSS selectors (${problemSelectors.map(e => `\`${e}\``).join(', ')})`);
            }
        }
        return reasons;
    }
};
ViewGpuContext = ViewGpuContext_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, INotificationService),
    __param(3, IConfigurationService),
    __param(4, IThemeService)
], ViewGpuContext);
export { ViewGpuContext };
/**
 * A list of supported decoration CSS rules that can be used in the GPU renderer.
 */
const gpuSupportedDecorationCssRules = [
    'color',
    'font-weight',
    'opacity',
    'text-decoration',
    'text-decoration-color',
    'text-decoration-line',
    'text-decoration-style',
    'text-decoration-thickness',
];
function supportsCssRule(rule, style) {
    if (!gpuSupportedDecorationCssRules.includes(rule)) {
        return false;
    }
    // Check for values that aren't supported
    switch (rule) {
        case 'text-decoration':
        case 'text-decoration-line': {
            const value = style.getPropertyValue(rule);
            // Only line-through is supported currently
            return value === 'line-through';
        }
        case 'text-decoration-color': {
            const value = style.getPropertyValue(rule);
            // Support var(--something, initial/inherit) which falls back to currentcolor
            if (/^var\(--[^,]+,\s*(?:initial|inherit)\)$/.test(value)) {
                return true;
            }
            // Support parsed color values
            return Color.Format.CSS.parse(value) !== null;
        }
        case 'text-decoration-style': {
            const value = style.getPropertyValue(rule);
            // Only 'initial' (solid) is supported
            return value === 'initial';
        }
        case 'text-decoration-thickness': {
            const value = style.getPropertyValue(rule);
            // Only pixel values and 'initial' are supported
            return value === 'initial' || /^\d+(\.\d+)?px$/.test(value);
        }
        default: return true;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld0dwdUNvbnRleHQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci9ncHUvdmlld0dwdUNvbnRleHQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0saUJBQWlCLENBQUM7QUFDdkMsT0FBTyxFQUFFLHFCQUFxQixFQUFFLGVBQWUsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3RGLE9BQU8sRUFBRSxpQkFBaUIsRUFBb0IsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdEQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRy9ELE9BQU8sRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFvQixNQUFNLG9DQUFvQyxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN2RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsb0JBQW9CLEVBQWlCLFFBQVEsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3RILE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDbEQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLDRCQUE0QixFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBRTNELE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUV0RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUc5RCxJQUFNLGNBQWMsR0FBcEIsTUFBTSxjQUFlLFNBQVEsVUFBVTs7YUFjckIsZ0NBQTJCLEdBQUcsSUFBSSwwQkFBMEIsRUFBRSxBQUFuQyxDQUFvQztJQUN2RixNQUFNLEtBQUssMEJBQTBCO1FBQ3BDLE9BQU8sZ0JBQWMsQ0FBQywyQkFBMkIsQ0FBQztJQUNuRCxDQUFDO2FBRXVCLDBCQUFxQixHQUFHLElBQUksb0JBQW9CLEVBQUUsQUFBN0IsQ0FBOEI7SUFDM0UsTUFBTSxLQUFLLG9CQUFvQjtRQUM5QixPQUFPLGdCQUFjLENBQUMscUJBQXFCLENBQUM7SUFDN0MsQ0FBQztJQUlEOzs7O09BSUc7SUFDSCxNQUFNLEtBQUssS0FBSztRQUNmLElBQUksQ0FBQyxnQkFBYyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQzVCLE1BQU0sSUFBSSxrQkFBa0IsQ0FBQyxtRUFBbUUsQ0FBQyxDQUFDO1FBQ25HLENBQUM7UUFDRCxPQUFPLGdCQUFjLENBQUMsTUFBTSxDQUFDO0lBQzlCLENBQUM7SUFDRDs7Ozs7T0FLRztJQUNILElBQUksS0FBSztRQUNSLE9BQU8sZ0JBQWMsQ0FBQyxLQUFLLENBQUM7SUFDN0IsQ0FBQztJQU1ELFlBQ0MsT0FBb0IsRUFDRyxxQkFBNkQsRUFDOUQsb0JBQTJELEVBQzFELG9CQUE0RCxFQUNwRSxhQUE2QztRQUU1RCxLQUFLLEVBQUUsQ0FBQztRQUxnQywwQkFBcUIsR0FBckIscUJBQXFCLENBQXVCO1FBQzdDLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBc0I7UUFDekMseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQUNuRCxrQkFBYSxHQUFiLGFBQWEsQ0FBZTtRQXZEN0Q7O1dBRUc7UUFDTSxlQUFVLEdBQUcsSUFBSSxDQUFDO1FBd0QxQixJQUFJLENBQUMsTUFBTSxHQUFHLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUNsRSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUV6QywrREFBK0Q7UUFDL0QsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLG9CQUFvQixDQUFDLHdCQUF3QixFQUFFLENBQUMsQ0FBQyxFQUFFO1lBQ3ZGLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLG9CQUFvQixDQUFDLHdDQUF3QyxDQUFDLEVBQUUsQ0FBQztnQkFDNUUsTUFBTSxxQkFBcUIsR0FBRyxvQkFBb0IsQ0FBQyxRQUFRLENBQWlCLFFBQVEsQ0FBQyxDQUFDLFNBQVMsRUFBRSxxQkFBcUIsSUFBSSxFQUFFLENBQUM7Z0JBQzdILElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsWUFBWSxDQUFDO2dCQUNuRCxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsWUFBWSxHQUFHLEdBQUcscUJBQXFCLElBQUksQ0FBQztZQUN2RSxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksQ0FBQyxHQUFHLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFFdkUseUZBQXlGO1FBQ3pGLG9DQUFvQztRQUNwQyxJQUFJLENBQUMsZ0JBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUM1QixnQkFBYyxDQUFDLE1BQU0sR0FBRyxZQUFZLENBQUMsYUFBYSxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7Z0JBQzlELE1BQU0sT0FBTyxHQUFvQixDQUFDO3dCQUNqQyxLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSx5QkFBeUIsQ0FBQzt3QkFDbkUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxXQUFXLENBQUMsb0NBQW9DLEVBQUUsS0FBSyxDQUFDO3FCQUM3RixDQUFDLENBQUM7Z0JBQ0gsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztZQUN0RSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUU7Z0JBQ2IsZ0JBQWMsQ0FBQyxVQUFVLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQztnQkFDdkMsSUFBSSxDQUFDLGdCQUFjLENBQUMsTUFBTSxFQUFFLENBQUM7b0JBQzVCLGdCQUFjLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsWUFBWSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLHFCQUFxQixFQUFFLFNBQVMsRUFBRSxnQkFBYyxDQUFDLG9CQUFvQixDQUFDLENBQUM7Z0JBQzFLLENBQUM7Z0JBQ0QsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDO1lBQ25CLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFHLGVBQWUsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUN6RSxJQUFJLENBQUMsU0FBUyxDQUFDLHFCQUFxQixDQUFDLGVBQWUsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLEVBQUU7WUFDdEUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxnQkFBZ0IsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUMzRCxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxDQUFDLGdCQUFnQixHQUFHLE1BQU0sQ0FBQztRQUMvQixJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFLENBQUMsZ0JBQWMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXhGLDRGQUE0RjtRQUM1RixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMscUJBQXFCLENBQUMsR0FBRyxFQUFFO1lBQzVELGdCQUFjLENBQUMsMEJBQTBCLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDbEQsZ0JBQWMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLENBQUM7UUFDL0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sMkJBQTJCLEdBQUcsZUFBZSxDQUFDLElBQUksRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDcEksSUFBSSxDQUFDLFNBQVMsQ0FBQyw0QkFBNEIsQ0FDMUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQ25CLGVBQWUsRUFBRSxFQUNqQixDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsRUFBRTtZQUNqQixJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1lBQ2xDLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7WUFDcEMsMkJBQTJCLENBQUMsR0FBRyxDQUFDLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQy9ELENBQUMsQ0FDRCxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsMkJBQTJCLEdBQUcsMkJBQTJCLENBQUM7UUFFL0QsTUFBTSxXQUFXLEdBQUcsZUFBZSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM3QyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUNyRSxXQUFXLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLEdBQUcsbUNBQXlCLENBQUMsV0FBVyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3BHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQztRQUUvQixJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDLGlCQUFpQixFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLGdCQUFjLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUMvTSxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNJLFNBQVMsQ0FBQyxPQUF3QixFQUFFLFlBQTBCLEVBQUUsVUFBa0I7UUFDeEYsTUFBTSxJQUFJLEdBQUcsWUFBWSxDQUFDLHdCQUF3QixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRS9ELGdFQUFnRTtRQUNoRSxJQUNDLElBQUksQ0FBQyxXQUFXO1lBQ2hCLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLFVBQVUsRUFDL0IsQ0FBQztZQUNGLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUVELGdEQUFnRDtRQUNoRCxJQUFJLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDdkMsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDO1lBQ3JCLEtBQUssTUFBTSxVQUFVLElBQUksSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7Z0JBQ2pELElBQUksVUFBVSxDQUFDLElBQUkseUNBQWlDLEVBQUUsQ0FBQztvQkFDdEQsU0FBUyxHQUFHLEtBQUssQ0FBQztvQkFDbEIsTUFBTTtnQkFDUCxDQUFDO2dCQUNELE1BQU0sVUFBVSxHQUFHLGdCQUFjLENBQUMsMkJBQTJCLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLFVBQVUsQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFDN0gsU0FBUyxLQUFLLFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUU7b0JBQ3JDLDRDQUE0QztvQkFDNUMsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO3dCQUNyQyxPQUFPLEtBQUssQ0FBQztvQkFDZCxDQUFDO29CQUNELEtBQUssTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO3dCQUM1QixJQUFJLENBQUMsZUFBZSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQzs0QkFDckMsT0FBTyxLQUFLLENBQUM7d0JBQ2QsQ0FBQztvQkFDRixDQUFDO29CQUNELE9BQU8sSUFBSSxDQUFDO2dCQUNiLENBQUMsQ0FBQyxDQUFDO2dCQUNILElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztvQkFDaEIsTUFBTTtnQkFDUCxDQUFDO1lBQ0YsQ0FBQztZQUNELE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRDs7T0FFRztJQUNJLGlCQUFpQixDQUFDLE9BQXdCLEVBQUUsWUFBMEIsRUFBRSxVQUFrQjtRQUNoRyxNQUFNLElBQUksR0FBRyxZQUFZLENBQUMsd0JBQXdCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDL0QsTUFBTSxPQUFPLEdBQWEsRUFBRSxDQUFDO1FBQzdCLElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3RCLE9BQU8sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDN0IsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDdEMsT0FBTyxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBQ3hDLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDdkMsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDO1lBQ3JCLE1BQU0sWUFBWSxHQUEyQixFQUFFLENBQUM7WUFDaEQsTUFBTSxnQkFBZ0IsR0FBYSxFQUFFLENBQUM7WUFDdEMsTUFBTSxZQUFZLEdBQWEsRUFBRSxDQUFDO1lBQ2xDLEtBQUssTUFBTSxVQUFVLElBQUksSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7Z0JBQ2pELElBQUksVUFBVSxDQUFDLElBQUkseUNBQWlDLEVBQUUsQ0FBQztvQkFDdEQsWUFBWSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ25DLFNBQVMsR0FBRyxLQUFLLENBQUM7b0JBQ2xCLFNBQVM7Z0JBQ1YsQ0FBQztnQkFDRCxNQUFNLFVBQVUsR0FBRyxnQkFBYyxDQUFDLDJCQUEyQixDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxVQUFVLENBQUMsZUFBZSxDQUFDLENBQUM7Z0JBQzdILFNBQVMsS0FBSyxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFO29CQUNyQyw0Q0FBNEM7b0JBQzVDLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQzt3QkFDckMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQzt3QkFDekMsT0FBTyxLQUFLLENBQUM7b0JBQ2QsQ0FBQztvQkFDRCxLQUFLLE1BQU0sQ0FBQyxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQzt3QkFDNUIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7NEJBQ3JDLHVGQUF1Rjs0QkFDdkYsWUFBWSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQzs0QkFDbkQsT0FBTyxLQUFLLENBQUM7d0JBQ2QsQ0FBQztvQkFDRixDQUFDO29CQUNELE9BQU8sSUFBSSxDQUFDO2dCQUNiLENBQUMsQ0FBQyxDQUFDO2dCQUNILElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztvQkFDaEIsU0FBUztnQkFDVixDQUFDO1lBQ0YsQ0FBQztZQUNELElBQUksWUFBWSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDN0IsT0FBTyxDQUFDLElBQUksQ0FBQyw2Q0FBNkMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzVHLENBQUM7WUFDRCxJQUFJLFlBQVksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQzdCLE9BQU8sQ0FBQyxJQUFJLENBQUMsaURBQWlELFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNoSCxDQUFDO1lBQ0QsSUFBSSxnQkFBZ0IsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ2pDLE9BQU8sQ0FBQyxJQUFJLENBQUMscURBQXFELGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3hILENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxPQUFPLENBQUM7SUFDaEIsQ0FBQzs7QUFuT1csY0FBYztJQXFEeEIsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLG9CQUFvQixDQUFBO0lBQ3BCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxhQUFhLENBQUE7R0F4REgsY0FBYyxDQW9PMUI7O0FBRUQ7O0dBRUc7QUFDSCxNQUFNLDhCQUE4QixHQUFHO0lBQ3RDLE9BQU87SUFDUCxhQUFhO0lBQ2IsU0FBUztJQUNULGlCQUFpQjtJQUNqQix1QkFBdUI7SUFDdkIsc0JBQXNCO0lBQ3RCLHVCQUF1QjtJQUN2QiwyQkFBMkI7Q0FDM0IsQ0FBQztBQUVGLFNBQVMsZUFBZSxDQUFDLElBQVksRUFBRSxLQUEwQjtJQUNoRSxJQUFJLENBQUMsOEJBQThCLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7UUFDcEQsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ0QseUNBQXlDO0lBQ3pDLFFBQVEsSUFBSSxFQUFFLENBQUM7UUFDZCxLQUFLLGlCQUFpQixDQUFDO1FBQ3ZCLEtBQUssc0JBQXNCLENBQUMsQ0FBQyxDQUFDO1lBQzdCLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMzQywyQ0FBMkM7WUFDM0MsT0FBTyxLQUFLLEtBQUssY0FBYyxDQUFDO1FBQ2pDLENBQUM7UUFDRCxLQUFLLHVCQUF1QixDQUFDLENBQUMsQ0FBQztZQUM5QixNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDM0MsNkVBQTZFO1lBQzdFLElBQUkseUNBQXlDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQzNELE9BQU8sSUFBSSxDQUFDO1lBQ2IsQ0FBQztZQUNELDhCQUE4QjtZQUM5QixPQUFPLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxJQUFJLENBQUM7UUFDL0MsQ0FBQztRQUNELEtBQUssdUJBQXVCLENBQUMsQ0FBQyxDQUFDO1lBQzlCLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMzQyxzQ0FBc0M7WUFDdEMsT0FBTyxLQUFLLEtBQUssU0FBUyxDQUFDO1FBQzVCLENBQUM7UUFDRCxLQUFLLDJCQUEyQixDQUFDLENBQUMsQ0FBQztZQUNsQyxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDM0MsZ0RBQWdEO1lBQ2hELE9BQU8sS0FBSyxLQUFLLFNBQVMsSUFBSSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDN0QsQ0FBQztRQUNELE9BQU8sQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDO0lBQ3RCLENBQUM7QUFDRixDQUFDIn0=