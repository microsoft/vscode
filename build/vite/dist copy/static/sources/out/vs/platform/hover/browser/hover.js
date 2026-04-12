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
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { addStandardDisposableListener, isHTMLElement } from '../../../base/browser/dom.js';
export const IHoverService = createDecorator('hoverService');
let WorkbenchHoverDelegate = class WorkbenchHoverDelegate extends Disposable {
    get delay() {
        if (this.isInstantlyHovering()) {
            return 0; // show instantly when a hover was recently shown
        }
        if (this.hoverOptions?.dynamicDelay) {
            return content => this.hoverOptions?.dynamicDelay?.(content) ?? this._delay;
        }
        return this._delay;
    }
    constructor(placement, hoverOptions, overrideOptions = {}, configurationService, hoverService) {
        super();
        this.placement = placement;
        this.hoverOptions = hoverOptions;
        this.overrideOptions = overrideOptions;
        this.configurationService = configurationService;
        this.hoverService = hoverService;
        this.lastHoverHideTime = 0;
        this.timeLimit = 200;
        this.hoverDisposables = this._register(new DisposableStore());
        this._delay = this.configurationService.getValue('workbench.hover.delay');
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('workbench.hover.delay')) {
                this._delay = this.configurationService.getValue('workbench.hover.delay');
            }
        }));
    }
    showHover(options, focus) {
        const overrideOptions = typeof this.overrideOptions === 'function' ? this.overrideOptions(options, focus) : this.overrideOptions;
        // close hover on escape
        this.hoverDisposables.clear();
        const targets = isHTMLElement(options.target) ? [options.target] : options.target.targetElements;
        for (const target of targets) {
            this.hoverDisposables.add(addStandardDisposableListener(target, 'keydown', (e) => {
                if (e.equals(9 /* KeyCode.Escape */)) {
                    this.hoverService.hideHover();
                }
            }));
        }
        const id = isHTMLElement(options.content)
            ? undefined
            : typeof options.content === 'string'
                ? options.content.toString()
                : options.content.value;
        return this.hoverService.showInstantHover({
            ...options,
            ...overrideOptions,
            persistence: {
                hideOnKeyDown: true,
                ...overrideOptions.persistence
            },
            id,
            appearance: {
                ...options.appearance,
                compact: true,
                skipFadeInAnimation: this.isInstantlyHovering(),
                ...overrideOptions.appearance
            }
        }, focus);
    }
    isInstantlyHovering() {
        return !!this.hoverOptions?.instantHover && Date.now() - this.lastHoverHideTime < this.timeLimit;
    }
    setInstantHoverTimeLimit(timeLimit) {
        if (!this.hoverOptions?.instantHover) {
            throw new Error('Instant hover is not enabled');
        }
        this.timeLimit = timeLimit;
    }
    onDidHideHover() {
        this.hoverDisposables.clear();
        if (this.hoverOptions?.instantHover) {
            this.lastHoverHideTime = Date.now();
        }
    }
};
WorkbenchHoverDelegate = __decorate([
    __param(3, IConfigurationService),
    __param(4, IHoverService)
], WorkbenchHoverDelegate);
export { WorkbenchHoverDelegate };
// TODO@benibenj remove this, only temp fix for contextviews
export const nativeHoverDelegate = {
    showHover: function () {
        throw new Error('Native hover function not implemented.');
    },
    delay: 0,
    showNativeHover: true
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG92ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRWhGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxhQUFhLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUk1RixNQUFNLENBQUMsTUFBTSxhQUFhLEdBQUcsZUFBZSxDQUFnQixjQUFjLENBQUMsQ0FBQztBQVdyRSxJQUFNLHNCQUFzQixHQUE1QixNQUFNLHNCQUF1QixTQUFRLFVBQVU7SUFNckQsSUFBSSxLQUFLO1FBQ1IsSUFBSSxJQUFJLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxDQUFDO1lBQ2hDLE9BQU8sQ0FBQyxDQUFDLENBQUMsaURBQWlEO1FBQzVELENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUUsWUFBWSxFQUFFLENBQUM7WUFDckMsT0FBTyxPQUFPLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsWUFBWSxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUM3RSxDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ3BCLENBQUM7SUFJRCxZQUNpQixTQUE4QixFQUM3QixZQUE0QyxFQUNyRCxrQkFBMEgsRUFBRSxFQUM3RyxvQkFBNEQsRUFDcEUsWUFBNEM7UUFFM0QsS0FBSyxFQUFFLENBQUM7UUFOUSxjQUFTLEdBQVQsU0FBUyxDQUFxQjtR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