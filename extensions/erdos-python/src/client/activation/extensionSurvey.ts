// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import * as querystring from 'querystring';
import { env, UIKind } from 'vscode';
import { IApplicationEnvironment, IApplicationShell, IWorkspaceService } from '../common/application/types';
import { ShowExtensionSurveyPrompt } from '../common/experiments/groups';
import '../common/extensions';
import { IPlatformService } from '../common/platform/types';
import { IBrowserService, IExperimentService, IPersistentStateFactory, IRandom } from '../common/types';
import { Common, ExtensionSurveyBanner } from '../common/utils/localize';
import { traceDecoratorError } from '../logging';
import { sendTelemetryEvent } from '../telemetry';
import { EventName } from '../telemetry/constants';
import { IExtensionSingleActivationService } from './types';

// persistent state names, exported to make use of in testing
export enum extensionSurveyStateKeys {
    doNotShowAgain = 'doNotShowExtensionSurveyAgain',
    disableSurveyForTime = 'doNotShowExtensionSurveyUntilTime',
}

const timeToDisableSurveyFor = 1000 * 60 * 60 * 24 * 7 * 12; // 12 weeks
const WAIT_TIME_TO_SHOW_SURVEY = 1000 * 60 * 60 * 3; // 3 hours

@injectable()
export class ExtensionSurveyPrompt implements IExtensionSingleActivationService {
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: false, virtualWorkspace: true };
    constructor(
        @inject(IApplicationShell) private appShell: IApplicationShell,
        @inject(IBrowserService) private browserService: IBrowserService,
        @inject(IPersistentStateFactory) private persistentState: IPersistentStateFactory,
        @inject(IRandom) private random: IRandom,
        @inject(IExperimentService) private experiments: IExperimentService,
        @inject(IApplicationEnvironment) private appEnvironment: IApplicationEnvironment,
        @inject(IPlatformService) private platformService: IPlatformService,
        @inject(IWorkspaceService) private readonly workspace: IWorkspaceService,
        private sampleSizePerOneHundredUsers: number = 10,
        private waitTimeToShowSurvey: number = WAIT_TIME_TO_SHOW_SURVEY,
    ) {}

    public async activate(): Promise<void> {
        if (!(await this.experiments.inExperiment(ShowExtensionSurveyPrompt.experiment))) {
            return;
        }
        const show = this.shouldShowBanner();
        if (!show) {
            return;
        }
        setTimeout(() => this.showSurvey().ignoreErrors(), this.waitTimeToShowSurvey);
    }

    @traceDecoratorError('Failed to check whether to display prompt for extension survey')
    public shouldShowBanner(): boolean {
        if (env.uiKind === UIKind?.Web) {
            return false;
        }

        let feedbackEnabled = true;

        const telemetryConfig = this.workspace.getConfiguration('telemetry');
        if (telemetryConfig) {
            feedbackEnabled = telemetryConfig.get<boolean>('feedback.enabled', true);
        }

        if (!feedbackEnabled) {
            return false;
        }

        const doNotShowSurveyAgain = this.persistentState.createGlobalPersistentState(
            extensionSurveyStateKeys.doNotShowAgain,
            false,
        );
        if (doNotShowSurveyAgain.value) {
            return false;
        }
        const isSurveyDisabledForTimeState = this.persistentState.createGlobalPersistentState(
            extensionSurveyStateKeys.disableSurveyForTime,
            false,
            timeToDisableSurveyFor,
        );
        if (isSurveyDisabledForTimeState.value) {
            return false;
        }
        // we only want 10% of folks to see this survey.
        const randomSample: number = this.random.getRandomInt(0, 100);
        if (randomSample >= this.sampleSizePerOneHundredUsers) {
            return false;
        }
        return true;
    }

    @traceDecoratorError('Failed to display prompt for extension survey')
    public async showSurvey() {
        const prompts = [ExtensionSurveyBanner.bannerLabelYes, ExtensionSurveyBanner.maybeLater, Common.doNotShowAgain];
        const telemetrySelections: ['Yes', 'Maybe later', "Don't show again"] = [
            'Yes',
            'Maybe later',
            "Don't show again",
        ];
        const selection = await this.appShell.showInformationMessage(ExtensionSurveyBanner.bannerMessage, ...prompts);
        sendTelemetryEvent(EventName.EXTENSION_SURVEY_PROMPT, undefined, {
            selection: selection ? telemetrySelections[prompts.indexOf(selection)] : undefined,
        });
        if (!selection) {
            return;
        }
        if (selection === ExtensionSurveyBanner.bannerLabelYes) {
            this.launchSurvey();
            // Disable survey for a few weeks
            await this.persistentState
                .createGlobalPersistentState(
                    extensionSurveyStateKeys.disableSurveyForTime,
                    false,
                    timeToDisableSurveyFor,
                )
                .updateValue(true);
        } else if (selection === Common.doNotShowAgain) {
            // Never show the survey again
            await this.persistentState
                .createGlobalPersistentState(extensionSurveyStateKeys.doNotShowAgain, false)
                .updateValue(true);
        }
    }

    private launchSurvey() {
        const query = querystring.stringify({
            o: encodeURIComponent(this.platformService.osType), // platform
            v: encodeURIComponent(this.appEnvironment.vscodeVersion),
            e: encodeURIComponent(this.appEnvironment.packageJson.version), // extension version
            m: encodeURIComponent(this.appEnvironment.sessionId),
        });
        const url = `https://aka.ms/AA5rjx5?${query}`;
        this.browserService.launch(url);
    }
}
