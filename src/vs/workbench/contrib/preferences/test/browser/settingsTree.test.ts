/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ITreeNode } from '../../../../../base/browser/ui/tree/tree.js';
import { ToolBar } from '../../../../../base/browser/ui/toolbar/toolbar.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ISetting } from '../../../../services/preferences/common/preferences.js';
import { SettingsTarget } from '../../browser/preferencesWidgets.js';
import { AbstractSettingRenderer } from '../../browser/settingsTree.js';
import { SettingsTreeGroupElement, SettingsTreeSettingElement } from '../../browser/settingsTreeModels.js';

class TestSettingRenderer extends AbstractSettingRenderer {
	readonly templateId = 'test';
	toolbarDisposed = false;

	constructor() {
		super(
			[],
			(_setting: ISetting, _settingTarget: SettingsTarget): IAction[] => [],
			undefined!,
			undefined!,
			undefined!,
			{
				createInstance: () => ({
					dispose() { },
					updateScopeOverrides() { },
					updateWorkspaceTrust() { },
					updateSyncIgnored() { },
					updateDefaultOverrideIndicator() { },
					updatePreviewIndicator() { },
					updateAdvancedIndicator() { },
				})
			} as never,
			undefined!,
			undefined!,
			undefined!,
			new TestConfigurationService(),
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			{ setupDelayedHover: () => Disposable.None } as never,
			undefined!,
		);
	}

	renderTemplate(container: HTMLElement) {
		return this.renderCommonTemplate(undefined, container, 'test');
	}

	renderElement(element: ITreeNode<SettingsTreeSettingElement, never>, index: number, templateData: unknown): void {
		this.renderSettingElement(element, index, templateData as never);
	}

	protected override renderSettingToolbar(_container: HTMLElement): ToolBar {
		return {
			setActions() { },
			dispose: () => this.toolbarDisposed = true
		} as unknown as ToolBar;
	}

	protected renderValue(): void {
	}
}

function createSettingElement(deprecationMessageSeverity: 'warning' | 'info'): SettingsTreeSettingElement {
	const element = new SettingsTreeSettingElement(
		{
			key: 'test.setting',
			type: 'string',
			description: [],
			deprecationMessage: 'Deprecated setting',
			deprecationMessageSeverity,
		} as unknown as ISetting,
		new SettingsTreeGroupElement('test', undefined, 'Test', 0, false),
		ConfigurationTarget.USER_LOCAL,
		true,
		undefined,
		undefined!,
		{ extensionRecommendations: undefined } as never,
		{ currentProfile: { isDefault: true } } as never,
		new TestConfigurationService() as unknown as never,
		false,
	);
	element.inspectSelf = () => { };
	return element;
}

suite('SettingsTree renderer', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('disposes the setting toolbar with its template', () => {
		const renderer = new TestSettingRenderer();
		const template = renderer.renderTemplate(document.createElement('div'));

		assert.strictEqual(renderer.toolbarDisposed, false);
		renderer.disposeTemplate(template);
		assert.strictEqual(renderer.toolbarDisposed, true);

		renderer.dispose();
	});

	test('renders informational deprecation severity', () => {
		const renderer = new TestSettingRenderer();
		const template = renderer.renderTemplate(document.createElement('div'));
		const element = createSettingElement('info');

		renderer.renderElement({ element } as never, 0, template);

		const icon = template.deprecationWarningElement.firstElementChild;
		assert.deepStrictEqual({
			isDeprecated: template.containerElement.classList.contains('is-deprecated'),
			isDeprecatedInfo: template.containerElement.classList.contains('is-deprecated-info'),
			iconClasses: icon?.className,
			iconRole: icon?.getAttribute('role'),
			iconAriaLabel: icon?.getAttribute('aria-label'),
		}, {
			isDeprecated: true,
			isDeprecatedInfo: true,
			iconClasses: 'codicon codicon-info',
			iconRole: 'img',
			iconAriaLabel: 'Info',
		});

		renderer.disposeTemplate(template);
		element.parent?.dispose();
		element.dispose();
		renderer.dispose();
	});
});
