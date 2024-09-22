/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AccessibleViewType, AccessibleContentProvider, ExtensionContentProvider, IAccessibleViewContentProvider, AccessibleViewProviderId } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplentation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { GettingStartedPage, inWelcomeContext } from './gettingStarted.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IResolvedWalkthrough, IResolvedWalkthroughStep, IWalkthroughsService } from './gettingStartedService.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { GettingStartedInput } from './gettingStartedInput.js';
import { localize } from '../../../../nls.js';

export class GettingStartedAccessibleView implements IAccessibleViewImplentation {
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

			return new GettingStartedAccessibleProvider(accessor.get(IContextKeyService), editorPane, currentWalkthrough, currentStepIds);
		}
		return;
	};
}

class GettingStartedAccessibleProvider extends Disposable implements IAccessibleViewContentProvider {

	private _currentStepIndex: number = 0;
	private _activeWalkthroughSteps: IResolvedWalkthroughStep[] = [];

	constructor(
		private contextService: IContextKeyService,
		private readonly _gettingStartedPage: GettingStartedPage,
		private readonly _focusedItem: IResolvedWalkthrough,
		private readonly _focusedStep?: string | undefined,
	) {
		super();
		this._activeWalkthroughSteps = _focusedItem.steps.filter(step => !step.when || this.contextService.contextMatchesRules(step.when));
	}

	readonly id = AccessibleViewProviderId.Walkthrough;
	readonly verbositySettingKey = AccessibilityVerbositySettingId.Walkthrough;
	readonly options = { type: AccessibleViewType.View };

	provideContent(): string {
		if (this._focusedStep) {
			const stepIndex = this._activeWalkthroughSteps.findIndex(step => step.id === this._focusedStep);
			if (stepIndex !== -1) {
				this._currentStepIndex = stepIndex;
			}
		}
		return this._getContent(this._currentStepIndex + 1, this._focusedItem, this._activeWalkthroughSteps[this._currentStepIndex]);
	}

	private _getContent(index: number, waltkrough: IResolvedWalkthrough, step: IResolvedWalkthroughStep): string {

		const stepsContent =
			localize('gettingStarted.step', 'Step {0}: {1}\nDescription: {2}', index, step.title, step.description.join(' '));

		return [
			localize('gettingStarted.title', 'Title: {0}', waltkrough.title),
			localize('gettingStarted.description', 'Description: {0}', waltkrough.description),
			stepsContent
		].join('\n\n');
	}

	provideNextContent(): string | undefined {
		if (++this._currentStepIndex >= this._activeWalkthroughSteps.length) {
			--this._currentStepIndex;
			return;
		}
		return this._getContent(this._currentStepIndex + 1, this._focusedItem, this._activeWalkthroughSteps[this._currentStepIndex]);
	}

	providePreviousContent(): string | undefined {
		if (--this._currentStepIndex < 0) {
			++this._currentStepIndex;
			return;
		}
		return this._getContent(this._currentStepIndex + 1, this._focusedItem, this._activeWalkthroughSteps[this._currentStepIndex]);
	}

	onClose(): void {
		this._gettingStartedPage.focus();
	}
}
