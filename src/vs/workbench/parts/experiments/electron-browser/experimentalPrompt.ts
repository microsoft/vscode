/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { INotificationService, Severity, IPromptChoice } from 'vs/platform/notification/common/notification';
import { IExperimentService, IExperiment, ExperimentActionType, IExperimentStorageState, IExperimentActionPromptProperties, ExperimentState } from 'vs/workbench/parts/experiments/node/experimentSerivce';
import { TPromise } from 'vs/base/common/winjs.base';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IExtensionsWorkbenchService, IExtensionsViewlet } from 'vs/workbench/parts/extensions/common/extensions';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';

export class ExperimentalPrompts extends Disposable implements IWorkbenchContribution {
	private _disposables: IDisposable[] = [];

	constructor(
		@IExperimentService private experimentService: IExperimentService,
		@IViewletService private viewletService: IViewletService,
		@INotificationService private notificationService: INotificationService,
		@IStorageService private storageService: IStorageService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IExtensionsWorkbenchService private extensionWorkbenchService: IExtensionsWorkbenchService

	) {
		super();
		this.experimentService.onExperimentEnabled(e => {
			if (e.action && e.action.type === ExperimentActionType.Prompt && e.state === ExperimentState.Run) {
				this.showExperimentalPrompts(e);
			}
		}, this, this._disposables);
	}

	private showExperimentalPrompts(experiment: IExperiment): TPromise<any> {
		if (!experiment || !experiment.enabled || !experiment.action || experiment.state !== ExperimentState.Run) {
			return TPromise.as(null);
		}

		const storageKey = 'experiments.' + experiment.id;
		const experimentState: IExperimentStorageState = safeParse(this.storageService.get(storageKey, StorageScope.GLOBAL), {});
		if (experimentState.state !== ExperimentState.Run) {
			return TPromise.as(null);
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

		let showPrompt = TPromise.as(true);
		const actionProperties = (<IExperimentActionPromptProperties>experiment.action.properties);
		if (!actionProperties.commands) {
			actionProperties.commands = [];
		}

		const curatedListCommands = actionProperties.commands.filter(x => {
			const curatedList = (x.curatedExtensionsKey && Array.isArray(x.curatedExtensionsList)) ? x.curatedExtensionsList.map(e => e.toLowerCase()) : [];
			return curatedList.length;
		});

		if (curatedListCommands.length > 1) {
			return TPromise.as(null);
		}

		const curatedListCommand = curatedListCommands[0];
		if (curatedListCommand) {
			const curatedList = curatedListCommand.curatedExtensionsList.map(e => e.toLowerCase());
			showPrompt = this.extensionWorkbenchService.queryLocal().then(locals => !locals.some(e => curatedList.indexOf(e.id.toLowerCase()) > -1));
		}

		return showPrompt.then(show => {
			if (!show) {
				return;
			}

			const choices: IPromptChoice[] = actionProperties.commands.map(command => {
				return {
					label: command.text,
					run: () => {
						logTelemetry(command.text);
						if (command.externalLink) {
							window.open(command.externalLink);
							return;
						}
						if (command.curatedExtensionsKey && Array.isArray(command.curatedExtensionsList)) {
							this.viewletService.openViewlet('workbench.view.extensions', true)
								.then(viewlet => viewlet as IExtensionsViewlet)
								.then(viewlet => {
									if (viewlet) {
										viewlet.search('curated:' + command.curatedExtensionsKey);
									}
								});
							return;
						}

						this.experimentService.markAsCompleted(experiment.id);

					}
				};
			});

			this.notificationService.prompt(Severity.Info, experiment.action.properties.promptText, choices, logTelemetry);
		});
	}

	dispose() {
		this._disposables = dispose(this._disposables);
	}
}

function safeParse(text: string, defaultObject: any) {
	try {
		return JSON.parse(text);
	}
	catch (e) {
		return defaultObject;
	}
}