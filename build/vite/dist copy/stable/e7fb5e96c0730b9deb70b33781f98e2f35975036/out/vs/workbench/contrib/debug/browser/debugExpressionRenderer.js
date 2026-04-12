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
import * as dom from '../../../../base/browser/dom.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { Expression, ExpressionContainer, Variable } from '../common/debugModel.js';
import { ReplEvaluationResult } from '../common/replModel.js';
import { splitExpressionOrScopeHighlights } from './baseDebugView.js';
import { handleANSIOutput } from './debugANSIHandling.js';
import { COPY_EVALUATE_PATH_ID, COPY_VALUE_ID } from './debugCommands.js';
import { LinkDetector } from './linkDetector.js';
const MAX_VALUE_RENDER_LENGTH_IN_VIEWLET = 1024;
const booleanRegex = /^(true|false)$/i;
const stringRegex = /^(['"]).*\1$/;
var Cls;
(function (Cls) {
    Cls["Value"] = "value";
    Cls["Unavailable"] = "unavailable";
    Cls["Error"] = "error";
    Cls["Changed"] = "changed";
    Cls["Boolean"] = "boolean";
    Cls["String"] = "string";
    Cls["Number"] = "number";
})(Cls || (Cls = {}));
const allClasses = Object.keys({
    ["value" /* Cls.Value */]: 0,
    ["unavailable" /* Cls.Unavailable */]: 0,
    ["error" /* Cls.Error */]: 0,
    ["changed" /* Cls.Changed */]: 0,
    ["boolean" /* Cls.Boolean */]: 0,
    ["string" /* Cls.String */]: 0,
    ["number" /* Cls.Number */]: 0,
});
let DebugExpressionRenderer = class DebugExpressionRenderer {
    constructor(commandService, configurationService, instantiationService, hoverService) {
        this.commandService = commandService;
        this.hoverService = hoverService;
        this.linkDetector = instantiationService.createInstance(LinkDetector);
        this.displayType = observableConfigValue('debug.showVariableTypes', false, configurationService);
    }
    renderVariable(data, variable, options = {}) {
        const displayType = this.displayType.get();
        const highlights = splitExpressionOrScopeHighlights(variable, options.highlights || []);
        if (variable.available) {
            data.type.textContent = '';
            let text = variable.name;
            if (variable.value && typeof variable.name === 'string') {
                if (variable.type && displayType) {
                    text += ': ';
                    data.type.textContent = variable.type + ' =';
                }
                else {
                    text += ' =';
                }
            }
            data.label.set(text, highlights.name, variable.type && !displayType ? variable.type : variable.name);
            data.name.classList.toggle('virtual', variable.presentationHint?.kind === 'virtual');
            data.name.classList.toggle('internal', variable.presentationHint?.visibility === 'internal');
        }
        else if (variable.value && typeof variable.name === 'string' && variable.name) {
            data.label.set(':');
        }
        data.expression.classList.toggle('lazy', !!variable.presentationHint?.lazy);
        const commands = [
            { id: COPY_VALUE_ID, args: [variable, [variable]] }
        ];
        if (variable.evaluateName) {
            commands.push({ id: COPY_EVALUATE_PATH_ID, args: [{ variable }] });
        }
        return this.renderValue(data.value, variable, {
            showChanged: options.showChanged,
            maxValueLength: MAX_VALUE_RENDER_LENGTH_IN_VIEWLET,
            hover: { commands },
            highlights: highlights.value,
            colorize: true,
            session: variable.getSession(),
        });
    }
    renderValue(container, expressionOrValue, options = {}) {
        const store = new DisposableStore();
        // Use remembered capabilities so REPL elements can render even once a session ends
        const supportsANSI = options.session?.rememberedCapabilities?.supportsANSIStyling ?? options.wasANSI ?? false;
        let value = typeof expressionOrValue === 'string' ? expressionOrValue : expressionOrValue.value;
        // remove stale classes
        for (const cls of allClasses) {
            container.classList.remove(cls);
        }
        container.classList.add("value" /* Cls.Value */);
        // when resolving expressions we represent errors from the server as a variable with name === null.
        if (value === null || ((expressionOrValue instanceof Expression || expressionOrValue instanceof Variable || expressionOrValue instanceof ReplEvaluationResult) && !expressionOrValue.available)) {
            container.classList.add("unavailable" /* Cls.Unavailable */);
            if (value !== Expression.DEFAULT_VALUE) {
                container.classList.add("error" /* Cls.Error */);
            }
        }
        else {
            if (typeof expressionOrValue !== 'string' && options.showChanged && expressionOrValue.valueChanged && value !== Expression.DEFAULT_VALUE) {
                // value changed color has priority over other colors.
                container.classList.add("changed" /* Cls.Changed */);
                expressionOrValue.valueChanged = false;
            }
            if (options.colorize && typeof expressionOrValue !== 'string') {
                if (expressionOrValue.type === 'number' || expressionOrValue.type === 'boolean' || expressionOrValue.type === 'string') {
                    container.classList.add(expressionOrValue.type);
                }
                else if (!isNaN(+value)) {
                    container.classList.add("number" /* Cls.Number */);
                }
                else if (booleanRegex.test(value)) {
                    container.classList.add("boolean" /* Cls.Boolean */);
                }
                else if (stringRegex.test(value)) {
                    container.classList.add("string" /* Cls.String */);
                }
            }
        }
        if (options.maxValueLength && value && value.length > options.maxValueLength) {
            value = value.substring(0, options.maxValueLength) + '...';
        }
        if (!value) {
            value = '';
        }
        const session = options.session ?? ((expressionOrValue instanceof ExpressionContainer) ? expressionOrValue.getSession() : undefined);
        // Only use hovers for links if thre's not going to be a hover for the value.
        const hoverBehavior = options.hover === false ? { type: 0 /* DebugLinkHoverBehavior.Rich */, store } : { type: 2 /* DebugLinkHoverBehavior.None */, store };
        dom.clearNode(container);
        const locationReference = options.locationReference ?? (expressionOrValue instanceof ExpressionContainer && expressionOrValue.valueLocationReference);
        let linkDetector = this.linkDetector;
        if (locationReference && session) {
            linkDetector = this.linkDetector.makeReferencedLinkDetector(locationReference, session);
        }
        if (supportsANSI) {
            container.appendChild(handleANSIOutput(value, linkDetector, session ? session.root : undefined, options.highlights, hoverBehavior));
        }
        else {
            container.appendChild(linkDetector.linkify(value, hoverBehavior, false, session?.root, true, options.highlights));
        }
        if (options.hover !== false) {
            const { commands = [] } = options.hover || {};
            store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), container, () => {
                const container = dom.$('div');
                const markdownHoverElement = dom.$('div.hover-row');
                const hoverContentsElement = dom.append(markdownHoverElement, dom.$('div.hover-contents'));
                const hoverContentsPre = dom.append(hoverContentsElement, dom.$('pre.debug-var-hover-pre'));
                if (supportsANSI) {
                    // note: intentionally using `this.linkDetector` so we don't blindly linkify the
                    // entire contents and instead only link file paths that it contains.
                    hoverContentsPre.appendChild(handleANSIOutput(value, this.linkDetector, session ? session.root : undefined, options.highlights, hoverBehavior));
                }
                else {
                    hoverContentsPre.textContent = value;
                }
                container.appendChild(markdownHoverElement);
                return container;
            }, {
                actions: commands.map(({ id, args }) => {
                    const description = CommandsRegistry.getCommand(id)?.metadata?.description;
                    return {
                        label: typeof description === 'string' ? description : description ? description.value : id,
                        commandId: id,
                        run: () => this.commandService.executeCommand(id, ...args),
                    };
                })
            }));
        }
        return store;
    }
};
DebugExpressionRenderer = __decorate([
    __param(0, ICommandService),
    __param(1, IConfigurationService),
    __param(2, IInstantiationService),
    __param(3, IHoverService)
], DebugExpressionRenderer);
export { DebugExpressionRenderer };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdFeHByZXNzaW9uUmVuZGVyZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy9icm93c2VyL2RlYnVnRXhwcmVzc2lvblJlbmRlcmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFFdkQsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDcEcsT0FBTyxFQUFFLGVBQWUsRUFBZSxNQUFNLHNDQUFzQyxDQUFDO0FBRXBGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNyRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFFMUcsT0FBTyxFQUFFLFVBQVUsRUFBRSxtQkFBbUIsRUFBRSxRQUFRLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNwRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUM5RCxPQUFPLEVBQXlCLGdDQUFnQyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDN0YsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDMUQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLGFBQWEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzFFLE9BQU8sRUFBeUUsWUFBWSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFnQ3hILE1BQU0sa0NB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