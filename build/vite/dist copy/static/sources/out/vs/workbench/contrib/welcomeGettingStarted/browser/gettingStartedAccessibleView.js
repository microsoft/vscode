import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { GettingStartedPage, inWelcomeContext } from './gettingStarted.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWalkthroughsService } from './gettingStartedService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { GettingStartedInput } from './gettingStartedInput.js';
import { localize } from '../../../../nls.js';
import { Action } from '../../../../base/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { URI } from '../../../../base/common/uri.js';
import { parse } from '../../../../base/common/marshalling.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
export class GettingStartedAccessibleView {
    constructor() {
        this.type = "view" /* AccessibleViewType.View */;
        this.priority = 110;
        this.name = 'walkthroughs';
        this.when = inWelcomeContext;
        this.getProvider = (accessor) => {
            const editorService = accessor.get(IEditorService);
            const editorPane = editorService.activeEditorPane;
            if (!(editorPane instanceof GettingStartedPage)) {
                return;
            }
            const gettingStartedInput = editorPane.input;
            if (!(gettingStartedInput instanceof GettingStartedInput) || !gettingStartedInput.selectedCategory) {
                return;
            }
            const gettingStartedService = accessor.get(IWalkthroughsService);
            const currentWalkthrough = gettingStartedService.getWalkthrough(gettingStartedInput.selectedCategory);
            const currentStepIds = gettingStartedInput.selectedStep;
            if (currentWalkthrough) {
                return new GettingStartedAccessibleProvider(accessor.get(IContextKeyService), accessor.get(ICommandService), accessor.get(IOpenerService), editorPane, currentWalkthrough, currentStepIds);
            }
            return;
        };
    }
}
class GettingStartedAccessibleProvider extends Disposable {
    constructor(contextService, commandService, openerService, _gettingStartedPage, _walkthrough, _focusedStep) {
        super();
        this.contextService = contextService;
        this.commandService = commandService;
        this.openerService = openerService;
        this._gettingStartedPage = _gettingStartedPage;
        this._walkthrough = _walkthrough;
        this._focusedStep = _focusedStep;
        this._currentStepIndex = 0;
        this._activeWalkthroughSteps = [];
        this.id = "walkthrough" /* AccessibleViewProviderId.Walkthrough */;
        this.verbositySettingKey = "accessibility.verbosity.walkthrough" /* AccessibilityVerbositySettingId.Walkthrough */;
        this.options = { type: "view" /* AccessibleViewType.View */ };
        this._activeWalkthroughSteps = _walkthrough.steps.filter(step => !step.when || this.contextService.contextMatchesRules(step.when));
    }
    get actions() {
        const actions = [];
        const step = this._activeWalkthroughSteps[this._currentStepIndex];
        const nodes = step.description.map(lt => lt.nodes.filter((node) => typeof node !== 'string').map(node => ({ href: node.href, label: node.label }))).flat();
        if (nodes.length === 1) {
            const node = nodes[0];
            actions.push(new Action('walthrough.step.action', node.label, ThemeIcon.asClassName(Codicon.run), true, () => {
                const isCommand = node.href.startsWith('command:');
                const command = node.href.replace(/command:(toSide:)?/, 'command:');
                if (isCommand) {
                    const commandURI = URI.parse(command);
                    let args = [];
                    try {
                        args = parse(decodeURIComponent(commandURI.query));
                    }
                    catch {
                        try {
                            args = parse(commandURI.query);
                        }
                        catch {
                            // ignore error
                        }
                    }
                    if (!Array.isArray(args)) {
                        args = [args];
                    }
                    this.commandService.executeCommand(commandURI.path, ...args);
                }
                else {
                    this.openerService.open(command, { allowCommands: true });
                }
            }));
        }
        return actions;
    }
    provideContent() {
        if (this._focusedStep) {
            const stepIndex = this._activeWalkthroughSteps.findIndex(step => step.id === this._focusedStep);
            if (stepIndex !== -1) {
                this._currentStepIndex = stepIndex;
            }
        }
        return this._getContent(this._walkthrough, this._activeWalkthroughSteps[this._currentStepIndex], /* includeTitle */ true);
    }
    _getContent(waltkrough, step, includeTitle) {
        const description = step.description.map(lt => lt.nodes.filter(node => typeof node === 'string')).join('\n');
        const stepsContent = localize('gettingStarted.step', '{0}\n{1}', step.title, description);
        if (includeTitle) {
            return [
                localize('gettingStarted.title', 'Title: {0}', waltkrough.title),
                localize('gettingStarted.description', 'Description: {0}', waltkrough.description),
                stepsContent
            ].join('\n');
        }
        else {
            return stepsContent;
        }
    }
    provideNextContent() {
        if (++this._currentStepIndex >= this._activeWalkthroughSteps.length) {
            --this._currentStepIndex;
            return;
        }
        return this._getContent(this._walkthrough, this._activeWalkthroughSteps[this._currentStepIndex]);
    }
    providePreviousContent() {
        if (--this._currentStepIndex < 0) {
            ++this._currentStepIndex;
            return;
        }
        return this._getContent(this._walkthrough, this._activeWalkthroughSteps[this._currentStepIndex]);
    }
    onClose() {
        if (this._currentStepIndex > -1) {
            const currentStep = this._activeWalkthroughSteps[this._currentStepIndex];
            this._gettingStartedPage.makeCategoryVisibleWhenAvailable(this._walkthrough.id, currentStep.id);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0dGluZ1N0YXJ0ZWRBY2Nlc3NpYmxlVmlldy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVHZXR0aW5nU3RhcnRlZC9icm93c2VyL2dldHRpbmdTdGFydGVkQWNjZXNzaWJsZVZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBTUEsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFMUYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGdCQUFnQixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDM0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBa0Qsb0JBQW9CLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUVsSCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxNQUFNLEVBQVcsTUFBTSxvQ0FBb0MsQ0FBQztBQUVyRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUU5RCxNQUFNLE9BQU8sNEJBQTRCO0lBQXpDO1FBQ1UsU0FBSSx3Q0FBMkI7UUFD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