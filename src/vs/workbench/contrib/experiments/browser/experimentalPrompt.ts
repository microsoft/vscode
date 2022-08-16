/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INotificationService, Severity, IPromptChoice } from 'vs/platform/notification/common/notification';
import { IExperimentService, IExperiment, ExperimentActionType, IExperimentActionPromptProperties, IExperimentActionPromptCommand, ExperimentState } from 'vs/workbench/contrib/experiments/common/experimentService';
import { IExtensionsViewPaneContainer, VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from 'vs/workbench/contrib/extensions/common/extensions';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Disposable } from 'vs/base/common/lifecycle';
import { language } from 'vs/base/common/platform';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { URI } from 'vs/base/common/uri';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { ViewContainerLocation } from 'vs/workbench/common/views';

export class ExperimentalPrompts extends Disposable implements IWorkbenchContribution {

	constructor(
		@IExperimentService private readonly experimentService: IExperimentService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ICommandService private readonly commandService: ICommandService

	) {
		super();
		this._register(this.experimentService.onExperimentEnabled(e => {
			if (e.action && e.action.type === ExperimentActionType.Prompt && e.state === ExperimentState.Run) {
				this.showExperimentalPrompts(e);
			}
		}, this));
	}

	private showExperimentalPrompts(experiment: IExperiment): void {
		if (!experiment || !experiment.enabled || !experiment.action || experiment.state !== ExperimentState.Run) {
			return;
		}

		const actionProperties = (<IExperimentActionPromptProperties>experiment.action.properties);
		const promptText = ExperimentalPrompts.getLocalizedText(actionProperties.promptText, language || '');
		if (!actionProperties || !promptText) {
			return;
		}
		if (!actionProperties.commands) {
			actionProperties.commands = [];
		}

		const choices: IPromptChoice[] = actionProperties.commands.map((command: IExperimentActionPromptCommand) => {
			const commandText = ExperimentalPrompts.getLocalizedText(command.text, language || '');
			return {
				label: commandText,
				run: () => {
					if (command.externalLink) {
						this.openerService.open(URI.parse(command.externalLink));
					} else if (command.curatedExtensionsKey && Array.isArray(command.curatedExtensionsList)) {
						this.paneCompositeService.openPaneComposite(EXTENSIONS_VIEWLET_ID, ViewContainerLocation.Sidebar, true)
							.then(viewlet => viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer)
							.then(viewlet => {
								viewlet?.search('curated:' + command.curatedExtensionsKey);
							});
					} else if (command.codeCommand) {
						this.commandService.executeCommand(command.codeCommand.id, ...command.codeCommand.arguments);
					}

					this.experimentService.markAsCompleted(experiment.id);

				}
			};
		});

		this.notificationService.prompt(Severity.Info, promptText, choices, {
			onCancel: () => {
				this.experimentService.markAsCompleted(experiment.id);
			}
		});
	}

	static getLocalizedText(text: string | { [key: string]: string }, displayLanguage: string): string {
		if (typeof text === 'string') {
			return text;
		}
		const msgInEnglish = text['en'] || text['en-us'];
		displayLanguage = displayLanguage.toLowerCase();
		if (!text[displayLanguage] && displayLanguage.indexOf('-') === 2) {
			displayLanguage = displayLanguage.substr(0, 2);
		}
		return text[displayLanguage] || msgInEnglish;
	}
}
