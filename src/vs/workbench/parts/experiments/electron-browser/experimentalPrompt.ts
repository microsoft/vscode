/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { INotificationService, Severity, IPromptChoice } from 'vs/platform/notification/common/notification';
import { IExperimentService, IExperiment, ExperimentActionType, IExperimentActionPromptProperties, IExperimentActionPromptCommand, ExperimentState } from 'vs/workbench/parts/experiments/node/experimentService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IExtensionsViewlet } from 'vs/workbench/parts/extensions/common/extensions';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { language } from 'vs/base/common/platform';

export class ExperimentalPrompts extends Disposable implements IWorkbenchContribution {
	private _disposables: IDisposable[] = [];

	constructor(
		@IExperimentService private experimentService: IExperimentService,
		@IViewletService private viewletService: IViewletService,
		@INotificationService private notificationService: INotificationService,
		@ITelemetryService private telemetryService: ITelemetryService

	) {
		super();
		this.experimentService.onExperimentEnabled(e => {
			if (e.action && e.action.type === ExperimentActionType.Prompt && e.state === ExperimentState.Run) {
				this.showExperimentalPrompts(e);
			}
		}, this, this._disposables);
	}

	private showExperimentalPrompts(experiment: IExperiment): void {
		if (!experiment || !experiment.enabled || !experiment.action || experiment.state !== ExperimentState.Run) {
			return;
		}

		const logTelemetry = (commandText?: string) => {
			/* __GDPR__
				"experimentalPrompts" : {
					"experimentId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"commandText": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"cancelled": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
				}
			*/
			this.telemetryService.publicLog('experimentalPrompts', {
				experimentId: experiment.id,
				commandText,
				cancelled: !commandText
			});
		};

		const actionProperties = (<IExperimentActionPromptProperties>experiment.action.properties);
		const promptText = ExperimentalPrompts.getPromptText(actionProperties, language);
		if (!actionProperties || !promptText) {
			return;
		}
		if (!actionProperties.commands) {
			actionProperties.commands = [];
		}

		const choices: IPromptChoice[] = actionProperties.commands.map((command: IExperimentActionPromptCommand) => {
			return {
				label: command.text,
				run: () => {
					logTelemetry(command.text);
					if (command.externalLink) {
						window.open(command.externalLink);
					} else if (command.curatedExtensionsKey && Array.isArray(command.curatedExtensionsList)) {
						this.viewletService.openViewlet('workbench.view.extensions', true)
							.then(viewlet => viewlet as IExtensionsViewlet)
							.then(viewlet => {
								if (viewlet) {
									viewlet.search('curated:' + command.curatedExtensionsKey);
								}
							});
					}

					this.experimentService.markAsCompleted(experiment.id);

				}
			};
		});

		this.notificationService.prompt(Severity.Info, promptText, choices, {
			onCancel: () => {
				logTelemetry();
				this.experimentService.markAsCompleted(experiment.id);
			}
		});
	}

	dispose() {
		this._disposables = dispose(this._disposables);
	}

	static getPromptText(actionProperties: IExperimentActionPromptProperties, displayLanguage: string): string {
		if (typeof actionProperties.promptText === 'string') {
			return actionProperties.promptText;
		}
		const msgInEnglish = actionProperties.promptText['en'] || actionProperties.promptText['en-us'];
		displayLanguage = displayLanguage.toLowerCase();
		if (!actionProperties.promptText[displayLanguage] && displayLanguage.indexOf('-') === 2) {
			displayLanguage = displayLanguage.substr(0, 2);
		}
		return actionProperties.promptText[displayLanguage] || msgInEnglish;
	}
}
