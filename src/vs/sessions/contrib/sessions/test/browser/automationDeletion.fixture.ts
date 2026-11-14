/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dialog } from '../../../../../base/browser/ui/dialog/dialog.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfirmation, IConfirmationResult, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultDialogStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IAutomationDescriptor } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import '../../browser/views/automationsView.js';

export default defineThemedFixtureGroup({ path: 'sessions/automationDeletion/' }, {
	Confirmation: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast'],
		render: renderConfirmation,
	}),
});

async function renderConfirmation(ctx: ComponentFixtureContext): Promise<void> {
	ctx.container.style.width = '700px';
	ctx.container.style.height = '320px';
	const shown = new DeferredPromise<void>();
	const automation: IAutomationDescriptor = {
		id: 'daily-review',
		name: 'Daily review',
		prompt: 'Review the workspace',
		schedule: { interval: 'hourly', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
		target: { kind: 'workspace', folderUri: URI.file('/workspace'), isolation: { kind: 'default' } },
		enabled: true,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
	};
	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: reg => {
			reg.defineInstance(IConfigurationService, new TestConfigurationService({ chat: { automations: { enabled: true } } }));
			reg.defineInstance(IAutomationService, new class extends mock<IAutomationService>() {
				override canDeleteAutomation(): boolean { return true; }
				override supportsDeleteHistoryChoice(): boolean { return true; }
				override async deleteAutomation(): Promise<void> { }
			}());
			reg.defineInstance(IDialogService, new class extends mock<IDialogService>() {
				override async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
					const dialog = ctx.disposableStore.add(new Dialog(ctx.container, confirmation.message, [confirmation.primaryButton ?? 'Yes', 'Cancel'], {
						cancelId: 1,
						detail: typeof confirmation.detail === 'string' ? confirmation.detail : confirmation.detail?.value,
						type: typeof confirmation.type === 'string' ? confirmation.type : 'question',
						checkboxLabel: confirmation.checkbox?.label,
						checkboxChecked: confirmation.checkbox?.checked,
						buttonStyles: defaultButtonStyles,
						checkboxStyles: defaultCheckboxStyles,
						inputBoxStyles: defaultInputBoxStyles,
						dialogStyles: defaultDialogStyles,
					}));
					const result = dialog.show();
					void shown.complete();
					try {
						const { button, checkboxChecked } = await result;
						return { confirmed: button === 0, checkboxChecked };
					} finally {
						dialog.dispose();
					}
				}
			}());
		},
	});
	const command = CommandsRegistry.getCommand('sessions.automations.delete');
	if (!command) {
		throw new Error('Automation deletion command is not registered');
	}
	void Promise.resolve(instantiationService.invokeFunction(accessor => command.handler(accessor, automation))).catch(error => shown.error(error));
	await shown.p;
}
