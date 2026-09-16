/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { WorkspaceTrustContext } from '../../../workspace/common/workspace.js';
import { createOnboardingClickStep, GUIDED_TRYOUT_PRESENTATION_KIND } from '../../../onboarding/browser/onboarding.js';
import { IOnboardingTryout, registerOnboardingTryout } from '../../../onboarding/common/onboardingTryout.js';
import { IGuidedTryoutPayload } from '../../../onboarding/common/onboardingTryoutActions.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
import { BROWSER_AUTO_RELOAD_ONBOARDING_TARGET_ID, BrowserAutoReloadOnFileChangeSettingId } from './browserAutoReloadFeatures.js';

export const BROWSER_AUTO_RELOAD_TRYOUT_ID = 'browser.auto-reload';
export const BROWSER_AUTO_RELOAD_TRYOUT_PREREQUISITE_COMMAND_ID = 'workbench.action.browser.chooseAutoReloadTab';

export async function chooseAutoReloadTab(activeEditor: IEditorService['activeEditor'], openBrowserTabPicker: () => Promise<void>): Promise<void> {
	if (activeEditor instanceof BrowserEditorInput && activeEditor.url && URI.parse(activeEditor.url).scheme === Schemas.file) {
		return;
	}
	await openBrowserTabPicker();
}

async function runChooseAutoReloadTabCommand(accessor: ServicesAccessor): Promise<void> {
	const commandService = accessor.get(ICommandService);
	await chooseAutoReloadTab(
		accessor.get(IEditorService).activeEditor,
		() => commandService.executeCommand(BrowserViewCommandId.QuickOpen),
	);
}

export function createBrowserAutoReloadTryout(): IOnboardingTryout<IGuidedTryoutPayload> {
	return {
		id: BROWSER_AUTO_RELOAD_TRYOUT_ID,
		title: localize('browser.autoReload.tryout.title', "Try Automatic Browser Reload"),
		description: localize('browser.autoReload.tryout.description', "Choose an open local HTML browser tab and discover its per-tab automatic refresh control."),
		when: WorkspaceTrustContext.IsTrusted,
		unavailableMessage: localize('browser.autoReload.tryout.unavailable', "This example requires a trusted workspace and a local HTML file already open in the Integrated Browser."),
		setup: {
			label: localize('browser.autoReload.tryout.openSetting', "Open Automatic Reload Setting"),
			command: {
				id: 'workbench.action.openSettings',
				arguments: [`@id:${BrowserAutoReloadOnFileChangeSettingId}`],
			},
		},
		presentation: {
			kind: GUIDED_TRYOUT_PRESENTATION_KIND,
			payload: {
				launch: {
					kind: 'command',
					payload: {
						commandId: BROWSER_AUTO_RELOAD_TRYOUT_PREREQUISITE_COMMAND_ID,
					},
				},
				steps: [
					createOnboardingClickStep({
						id: 'reload-menu',
						targetId: BROWSER_AUTO_RELOAD_ONBOARDING_TARGET_ID,
						title: localize('browser.autoReload.tryout.control.title', "Refresh Local HTML Automatically"),
						description: localize('browser.autoReload.tryout.control.description', "Open the reload menu and choose Refresh Automatically to control this browser tab. The default comes from the Automatic Reload setting. This example leaves both unchanged."),
						placement: 'below',
					}),
				],
				unavailableMessage: localize('browser.autoReload.tryout.guidanceUnavailable', "Choose a local HTML tab from Quick Open Browser Tab. The automatic reload control is only available for local files."),
			},
		},
	};
}

class BrowserAutoReloadTryoutContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.browserAutoReloadTryout';

	constructor() {
		super();
		this._register(CommandsRegistry.registerCommand(BROWSER_AUTO_RELOAD_TRYOUT_PREREQUISITE_COMMAND_ID, runChooseAutoReloadTabCommand));
		this._register(registerOnboardingTryout(createBrowserAutoReloadTryout()));
	}
}

registerWorkbenchContribution2(BrowserAutoReloadTryoutContribution.ID, BrowserAutoReloadTryoutContribution, WorkbenchPhase.BlockRestore);
