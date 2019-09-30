/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IExperimentService, ExperimentState } from 'vs/workbench/contrib/experiments/common/experimentService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { language, locale } from 'vs/base/common/platform';
import { IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IProductService } from 'vs/platform/product/common/productService';
import { IHostService } from 'vs/workbench/services/host/browser/host';

export abstract class AbstractTelemetryOptOut implements IWorkbenchContribution {

	private static TELEMETRY_OPT_OUT_SHOWN = 'workbench.telemetryOptOutShown';
	private privacyUrl: string | undefined;

	constructor(
		@IStorageService storageService: IStorageService,
		@IOpenerService openerService: IOpenerService,
		@INotificationService private readonly notificationService: INotificationService,
		@IHostService hostService: IHostService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IExperimentService private readonly experimentService: IExperimentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@IProductService productService: IProductService
	) {
		if (!productService.telemetryOptOutUrl || storageService.get(AbstractTelemetryOptOut.TELEMETRY_OPT_OUT_SHOWN, StorageScope.GLOBAL)) {
			return;
		}
		const experimentId = 'telemetryOptOut';
		Promise.all([
			this.getWindowCount(),
			experimentService.getExperimentById(experimentId)
		]).then(([count, experimentState]) => {
			if (!hostService.hasFocus && count > 1) {
				return;
			}
			storageService.store(AbstractTelemetryOptOut.TELEMETRY_OPT_OUT_SHOWN, true, StorageScope.GLOBAL);

			this.privacyUrl = productService.privacyStatementUrl || productService.telemetryOptOutUrl;

			if (experimentState && experimentState.state === ExperimentState.Run && telemetryService.isOptedIn) {
				this.runExperiment(experimentId);
				return;
			}

			const telemetryOptOutUrl = productService.telemetryOptOutUrl;
			if (telemetryOptOutUrl) {
				const optOutNotice = localize('telemetryOptOut.optOutNotice', "Help improve VS Code by allowing Microsoft to collect usage data. Read our [privacy statement]({0}) and learn how to [opt out]({1}).", this.privacyUrl, productService.telemetryOptOutUrl);
				const optInNotice = localize('telemetryOptOut.optInNotice', "Help improve VS Code by allowing Microsoft to collect usage data. Read our [privacy statement]({0}) and learn how to [opt in]({1}).", this.privacyUrl, productService.telemetryOptOutUrl);

				notificationService.prompt(
					Severity.Info,
					telemetryService.isOptedIn ? optOutNotice : optInNotice,
					[{
						label: localize('telemetryOptOut.readMore', "Read More"),
						run: () => openerService.open(URI.parse(telemetryOptOutUrl))
					}],
					{ sticky: true }
				);
			}
		})
			.then(undefined, onUnexpectedError);
	}

	protected abstract getWindowCount(): Promise<number>;

	private runExperiment(experimentId: string) {
		const promptMessageKey = 'telemetryOptOut.optOutOption';
		const yesLabelKey = 'telemetryOptOut.OptIn';
		const noLabelKey = 'telemetryOptOut.OptOut';

		let promptMessage = localize('telemetryOptOut.optOutOption', "Please help Microsoft improve Visual Studio Code by allowing the collection of usage data. Read our [privacy statement]({0}) for more details.", this.privacyUrl);
		let yesLabel = localize('telemetryOptOut.OptIn', "Yes, glad to help");
		let noLabel = localize('telemetryOptOut.OptOut', "No, thanks");

		let queryPromise = Promise.resolve(undefined);
		if (locale && locale !== language && locale !== 'en' && locale.indexOf('en-') === -1) {
			queryPromise = this.galleryService.query({ text: `tag:lp-${locale}` }, CancellationToken.None).then(tagResult => {
				if (!tagResult || !tagResult.total) {
					return undefined;
				}
				const extensionToFetchTranslationsFrom = tagResult.firstPage.filter(e => e.publisher === 'MS-CEINTL' && e.name.indexOf('vscode-language-pack') === 0)[0] || tagResult.firstPage[0];
				if (!extensionToFetchTranslationsFrom.assets || !extensionToFetchTranslationsFrom.assets.coreTranslations.length) {
					return undefined;
				}

				return this.galleryService.getCoreTranslation(extensionToFetchTranslationsFrom, locale!)
					.then(translation => {
						const translationsFromPack: any = translation && translation.contents ? translation.contents['vs/workbench/contrib/welcome/gettingStarted/electron-browser/telemetryOptOut'] : {};
						if (!!translationsFromPack[promptMessageKey] && !!translationsFromPack[yesLabelKey] && !!translationsFromPack[noLabelKey]) {
							promptMessage = translationsFromPack[promptMessageKey].replace('{0}', this.privacyUrl) + ' (Please help Microsoft improve Visual Studio Code by allowing the collection of usage data.)';
							yesLabel = translationsFromPack[yesLabelKey] + ' (Yes)';
							noLabel = translationsFromPack[noLabelKey] + ' (No)';
						}
						return undefined;
					});

			});
		}

		const logTelemetry = (optout?: boolean) => {
			type ExperimentsOptOutClassification = {
				optout?: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
			};

			type ExperimentsOptOutEvent = {
				optout?: boolean;
			};
			this.telemetryService.publicLog2<ExperimentsOptOutEvent, ExperimentsOptOutClassification>('experiments:optout', typeof optout === 'boolean' ? { optout } : {});
		};

		queryPromise.then(() => {
			this.notificationService.prompt(
				Severity.Info,
				promptMessage,
				[
					{
						label: yesLabel,
						run: () => {
							logTelemetry(false);
						}
					},
					{
						label: noLabel,
						run: () => {
							logTelemetry(true);
							this.configurationService.updateValue('telemetry.enableTelemetry', false);
							this.configurationService.updateValue('telemetry.enableCrashReporter', false);
						}
					}
				],
				{
					sticky: true,
					onCancel: logTelemetry
				}
			);
			this.experimentService.markAsCompleted(experimentId);
		});
	}
}

export class BrowserTelemetryOptOut extends AbstractTelemetryOptOut {

	protected async getWindowCount(): Promise<number> {
		return 1;
	}
}
