/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AccessibleViewType, AccessibleContentProvider, ExtensionContentProvider, IAccessibleViewContentProvider, AccessibleViewProviderId } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplentation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { GettingStartedPage } from './gettingStarted.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IResolvedWalkthrough, IWalkthroughsService } from './gettingStartedService.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { GettingStartedInput } from './gettingStartedInput.js';
import { localize } from '../../../../nls.js';

export class GettingStartedAccessibleView implements IAccessibleViewImplentation {
	readonly type = AccessibleViewType.View;
	readonly priority = 110;
	readonly name = 'walkthroughs';
	readonly when?: ContextKeyExpression | undefined;

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
		if (currentWalkthrough) {
			return new GettingStartedAccessibleProvider(editorPane, currentWalkthrough);
		}
		return;
	};
}

class GettingStartedAccessibleProvider extends Disposable implements IAccessibleViewContentProvider {

	constructor(
		private readonly _gettingStartedPage: GettingStartedPage,
		private readonly _focusedItem: IResolvedWalkthrough,
	) {
		super();
	}

	readonly id = AccessibleViewProviderId.Walkthrough;
	readonly verbositySettingKey = AccessibilityVerbositySettingId.Walkthrough;
	readonly options = { type: AccessibleViewType.View };

	provideContent(): string {
		return this._getContent(this._focusedItem);
	}

	private _getContent(item: IResolvedWalkthrough): string {
		const stepsContent = item.steps.map((step, index) => {
			return localize('gettingStarted.step', 'Step {0}: {1}\nDescription: {2}', index + 1, step.title, step.description.join(' '));
		}).join('\n\n');

		return [
			localize('gettingStarted.title', 'Title: {0}', item.title),
			localize('gettingStarted.description', 'Description: {0}', item.description),
			stepsContent
		].join('\n\n');
	}

	onClose(): void {
		this._gettingStartedPage.focus();
	}
}
