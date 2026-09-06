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
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ISetting } from '../../../../services/preferences/common/preferences.js';
import { SettingsTarget } from '../../browser/preferencesWidgets.js';
import { AbstractSettingRenderer } from '../../browser/settingsTree.js';
import { SettingsTreeSettingElement } from '../../browser/settingsTreeModels.js';

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
			{ createInstance: () => ({ dispose() { } }) } as never,
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

	renderElement(_element: ITreeNode<SettingsTreeSettingElement, never>, _index: number, _templateData: unknown): void {
	}

	protected override renderSettingToolbar(_container: HTMLElement): ToolBar {
		return {
			dispose: () => this.toolbarDisposed = true
		} as unknown as ToolBar;
	}

	protected renderValue(): void {
	}
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
});
