/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Disposable } from 'vs/base/common/lifecycle';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { WelcomeWidget } from 'vs/workbench/contrib/welcomeDialog/browser/welcomeWidget';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

const configurationKey = 'welcome.experimental.dialog';

class WelcomeDialogContribution extends Disposable implements IWorkbenchContribution {

	private contextKeysToWatch = new Set<string>();

	constructor(
		@IStorageService storageService: IStorageService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService readonly contextService: IContextKeyService,
		@ICodeEditorService readonly codeEditorService: ICodeEditorService,
		@IInstantiationService readonly instantiationService: IInstantiationService,
		@ICommandService readonly commandService: ICommandService,
		@ITelemetryService readonly telemetryService: ITelemetryService
	) {
		super();

		if (!storageService.isNew(StorageScope.PROFILE)) {
			return; // do not show if this is not the first session
		}

		const setting = configurationService.inspect<boolean>(configurationKey);
		if (!setting.value) {
			return;
		}

		const welcomeDialog = environmentService.options?.welcomeDialog;
		if (!welcomeDialog) {
			return;
		}

		this.contextKeysToWatch.add(welcomeDialog.when);

		this._register(this.contextService.onDidChangeContext(e => {
			if (e.affectsSome(this.contextKeysToWatch) &&
				Array.from(this.contextKeysToWatch).every(value => this.contextService.contextMatchesRules(ContextKeyExpr.deserialize(value)))) {
				const codeEditor = this.codeEditorService.getActiveCodeEditor();
				if (codeEditor?.hasModel()) {
					const welcomeWidget = new WelcomeWidget(codeEditor, instantiationService, commandService, telemetryService);
					welcomeWidget.render(welcomeDialog.title,
						welcomeDialog.message,
						welcomeDialog.buttonText,
						welcomeDialog.buttonCommand,
						welcomeDialog.media);
					this.contextKeysToWatch.delete(welcomeDialog.when);
				}
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WelcomeDialogContribution, LifecyclePhase.Restored);
