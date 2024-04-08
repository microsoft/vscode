/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { AccessibleViewType, IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { AccessibleViewAction } from 'vs/workbench/contrib/accessibility/browser/accessibleViewActions';

export interface AccessibilityHelpProvider {
	/**
	 * The id of the provider.
	 */
	id: string;

	/**
	 * This will show the dialog when this context value is true.
	 */
	contextValue: string;

	/**
	 * Provide the content of the dialog as a markdown string.
	*/
	provideContent(token: CancellationToken): string;

	/**
	 * This will be called when the dialog is closed.
	 */
	resolveOnClose(token: CancellationToken): void;
}

export interface IAccessibilityHelpProviderService {
	readonly _serviceBrand: undefined;
	registerAccessibilityHelpProvider(provider: AccessibilityHelpProvider): IDisposable;
}

export const IAccessibilityHelpProviderService = createDecorator<IAccessibilityHelpProviderService>('accessibilityHelpProviderService');
export class AccessibilityHelpProviderService extends Disposable implements IAccessibilityHelpProviderService {
	declare _serviceBrand: undefined;
	constructor() {
		super();
	}
	registerAccessibilityHelpProvider(provider: AccessibilityHelpProvider): IDisposable {
		this._register(AccessibleViewAction.addImplementation(95, provider.id, accessor => {
			const accessibleViewService = accessor.get(IAccessibleViewService);
			accessibleViewService.show({
				id: provider.id as any,
				verbositySettingKey: 'accessibilityHelpDialogVerbosity' as any,
				provideContent() { return provider.provideContent(new CancellationTokenSource().token); },
				onClose() {
					provider.resolveOnClose(new CancellationTokenSource().token);
				},
				options: { type: AccessibleViewType.Help }
			});
			return true;
		}, ContextKeyExpr.has(provider.contextValue)));
		return {
			dispose: () => {
				AccessibleViewAction.removeImplementation(provider.id);
			}
		};
	}
}
