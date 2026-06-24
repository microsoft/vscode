/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AccessibleViewType, AccessibleContentProvider, ExtensionContentProvider, IAccessibleViewContentProvider, AccessibleViewProviderId } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { GettingStartedPage, inWelcomeContext } from './gettingStarted.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IResolvedWalkthrough, IResolvedWalkthroughStep, IWalkthroughsService } from './gettingStartedService.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { GettingStartedInput } from './gettingStartedInput.js';
import { localize } from '../../../../nls.js';
import { Action, IAction } from '../../../../base/common/actions.js';
import { ILink } from '../../../../base/common/linkedText.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { URI } from '../../../../base/common/uri.js';
import { parse } from '../../../../base/common/marshalling.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';

export class GettingStartedAccessibleView implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.View;
	readonly priority = 110;
	readonly name = 'walkthroughs';
	readonly when = inWelcomeContext;

	getProvider = (accessor: ServicesAccessor): AccessibleContentProvider | ExtensionContentProvider | undefined => {
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

			return new GettingStartedAccessibleProvider(
				accessor.get(IContextKeyService),
				accessor.get(ICommandService),
				accessor.get(IOpenerService),
				editorPane,
				currentWalkthrough,
				currentStepIds);
		}
		return;
	};
}

class GettingStartedAccessibleProvider extends Disposable implements IAccessibleViewContentProvider {

	private _currentStepIndex: number = 0;
	private _activeWalkthroughSteps: IResolvedWalkthroughStep[] = [];

	constructor(
		private contextService: IContextKeyService,
		private commandService: ICommandService,
		private openerService: IOpenerService,
		private readonly _gettingStartedPage: GettingStartedPage,
		private readonly _walkthrough: IResolvedWalkthrough,
		private readonly _focusedStep?: string | undefined,
	) {
		super();
		this._activeWalkthroughSteps = _walkthrough.steps.filter(step => !step.when || this.contextService.contextMatchesRules(step.when));
	}

	readonly id = AccessibleViewProviderId.Walkthrough;
	readonly verbositySettingKey = AccessibilityVerbositySettingId.Walkthrough;
	readonly options = { type: AccessibleViewType.View };

	public get actions(): IAction[] {
		const actions: IAction[] = [];
		const step = this._activeWalkthroughSteps[this._currentStepIndex];
		const nodes = step.description.map(lt => lt.nodes.filter((node): node is ILink => typeof node !== 'string').map(node => ({ href: node.href, label: node.label }))).flat();
		if (nodes.length === 1) {
			const node = nodes[0];

			actions.push(new Action('walthrough.step.action', node.label, ThemeIcon.asClassName(Codicon.run), true, () => {

				const isCommand = node.href.startsWith('command:');
				const command = node.href.replace(/command:(toSide:)?/, 'command:');

				if (isCommand) {
					const commandURI = URI.parse(command);

					let args: unknown[] = [];
					try {
						args = parse(decodeURIComponent(commandURI.query));
					} catch {
						try {
							args = parse(commandURI.query);
						} catch {
							// ignore error
						}
					}
					if (!Array.isArray(args)) {
						args = [args];
					}
					this.commandService.executeCommand(commandURI.path, ...args);
				} else {
					this.openerService.open(command, { allowCommands: true });
				}
			}));
		}
		return actions;
	}

	provideContent(): string {
		if (this._focusedStep) {
			const stepIndex = this._activeWalkthroughSteps.findIndex(step => step.id === this._focusedStep);
			if (stepIndex !== -1) {
				this._currentStepIndex = stepIndex;
			}
		}
		return this._getContent(this._walkthrough, this._activeWalkthroughSteps[this._currentStepIndex], /* includeTitle */true);
	}

	private _getContent(waltkrough: IResolvedWalkthrough, step: IResolvedWalkthroughStep, includeTitle?: boolean): string {

		const description = step.description.map(lt => lt.nodes.filter(node => typeof node === 'string')).join('\n');
		const stepsContent =
			localize('gettingStarted.step', '{0}\n{1}', step.title, description);

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

	provideNextContent(): string | undefined {
		if (++this._currentStepIndex >= this._activeWalkthroughSteps.length) {
			--this._currentStepIndex;
			return;
		}
		return this._getContent(this._walkthrough, this._activeWalkthroughSteps[this._currentStepIndex]);
	}

	providePreviousContent(): string | undefined {
		if (--this._currentStepIndex < 0) {
			++this._currentStepIndex;
			return;
		}
		return this._getContent(this._walkthrough, this._activeWalkthroughSteps[this._currentStepIndex]);
	}

	onClose(): void {
		if (this._currentStepIndex > -1) {
			const currentStep = this._activeWalkthroughSteps[this._currentStepIndex];
			this._gettingStartedPage.makeCategoryVisibleWhenAvailable(this._walkthrough.id, currentStep.id);
		}
	}
}
