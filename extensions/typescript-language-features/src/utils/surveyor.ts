/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import TypeScriptServiceClient from '../typescriptServiceClient';
import { Disposable } from './dispose';
import { memoize } from './memoize';

const localize = nls.loadMessageBundle();

interface SurveyData {
	/**
	 * Internal id of the survey. Comes from TypeScript.
	 */
	readonly id: string;

	/**
	 * Text displayed to the user when survey is triggered.
	 */
	readonly prompt: string;

	/**
	 * Number of times to trigger with `surveyReady` before showing the survey.
	 *
	 * This is cumulative and shared across workspaces.
	 */
	readonly globalTriggerThreshold: number;

	/**
	 * Survey link.
	 */
	readonly url: vscode.Uri;

	/**
	 * Milliseconds to wait after 'Remind later' is chosen before trying to prompt again.
	 */
	readonly remindLaterDelayInMilliseconds: number;
}

const allSurveys: ReadonlyArray<SurveyData> = [
	{
		id: 'checkJs',
		prompt: localize('survey.checkJs.prompt', "Help improve VS Code's support for [checkJs](https://code.visualstudio.com/Docs/languages/javascript#_type-checking) in JavaScript! Since you have been using this feature, would you consider taking a short survey about your experience?"),
		globalTriggerThreshold: 10,
		url: vscode.Uri.parse('https://www.surveymonkey.com/r/FH8PZQ3'),
		remindLaterDelayInMilliseconds: 3 * 24 * 60 * 60 * 1000 // 3 days
	}
];

class Survey {

	private _hasShownInThisSession = false;

	public constructor(
		private readonly data: SurveyData,
		private readonly memento: vscode.Memento
	) { }

	public get id(): string { return this.data.id; }

	public get prompt(): string { return this.data.prompt; }

	public get isActive(): boolean {
		return !this._hasShownInThisSession && !this.memento.get<boolean>(this.isCompletedMementoKey);
	}

	public open(): void {
		this.markComplete();
		vscode.commands.executeCommand<void>('vscode.open', this.data.url);
	}

	public remindLater(): void {
		// Make sure we don't show again in this session (but don't persist as completed)
		this._hasShownInThisSession = true;

		// And save off prompt time.
		this.memento.update(this.lastPromptTimeMementoKey, Date.now());
	}

	public trigger(): boolean {
		const triggerCount = this.triggerCount + 1;
		this.memento.update(this.triggerCountMementoKey, triggerCount);
		if (triggerCount >= this.data.globalTriggerThreshold) {
			const lastPromptTime = this.memento.get<number>(this.lastPromptTimeMementoKey);
			if (!lastPromptTime || isNaN(+lastPromptTime)) {
				return true;
			}
			return (lastPromptTime + this.data.remindLaterDelayInMilliseconds < Date.now());
		}
		return false;
	}

	public willShow() {
		this._hasShownInThisSession = true;
	}

	public markComplete() {
		this._hasShownInThisSession = true;
		this.memento.update(this.isCompletedMementoKey, true);
	}

	private get triggerCount(): number {
		const count = this.memento.get<number>(this.triggerCountMementoKey);
		return !count || isNaN(+count) ? 0 : +count;
	}

	private getMementoKey(part: string): string {
		return `survey.v0.${this.id}.${part}`;
	}

	private get isCompletedMementoKey(): string {
		return this.getMementoKey('isComplete');
	}

	private get lastPromptTimeMementoKey(): string {
		return this.getMementoKey('lastPromptTime');
	}

	private get triggerCountMementoKey(): string {
		return this.getMementoKey('globalTriggerCount');
	}
}

export class Surveyor extends Disposable {

	public constructor(
		private readonly memento: vscode.Memento,
		serviceClient: TypeScriptServiceClient,
	) {
		super();

		this._register(serviceClient.onSurveyReady(e => this.surveyReady(e.surveyId)));
	}

	@memoize
	private get surveys(): Map<string, Survey> {
		return new Map<string, Survey>(
			allSurveys.map(data => [data.id, new Survey(data, this.memento)] as [string, Survey]));
	}

	private surveyReady(surveyId: string): void {
		const survey = this.tryGetActiveSurvey(surveyId);
		if (survey && survey.trigger()) {
			survey.willShow();
			this.showSurveyToUser(survey);
		}
	}

	private async showSurveyToUser(survey: Survey): Promise<void> {
		enum Choice {
			GoToSurvey = 1,
			RemindLater = 2,
			NeverAgain = 3,
		}

		interface MessageItem extends vscode.MessageItem {
			readonly choice: Choice;
		}

		const response = await vscode.window.showInformationMessage<MessageItem>(survey.prompt,
			{
				title: localize('takeShortSurvey', "Take Short Survey"),
				choice: Choice.GoToSurvey
			}, {
				title: localize('remindLater', "Remind Me Later"),
				choice: Choice.RemindLater
			}, {
				title: localize('neverAgain', "Disable JS/TS Surveys"),
				choice: Choice.NeverAgain
			});

		switch (response && response.choice) {
			case Choice.GoToSurvey:
				survey.open();
				break;

			case Choice.NeverAgain:
				survey.markComplete();
				this.disableSurveys();
				break;

			case Choice.RemindLater:
			default: // If user just closes the notification, treat this as a remind later.
				survey.remindLater();
				break;
		}
	}

	private tryGetActiveSurvey(surveyId: string): Survey | undefined {
		const survey = this.surveys.get(surveyId);
		if (!survey) {
			return undefined;
		}

		if (this.areSurveysEnabled() && survey.isActive) {
			return survey;
		}

		return undefined;
	}

	private areSurveysEnabled() {
		const config = vscode.workspace.getConfiguration('typescript');
		return config.get<boolean>('surveys.enabled', true);
	}

	private disableSurveys() {
		const config = vscode.workspace.getConfiguration('typescript');
		config.update('surveys.enabled', false);
	}
}