/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IAutomationDescriptor, IAutomationRun } from '../../../chat/common/automations/automation.js';
import { AutomationCatalogueState, IAutomationProviderDescriptor, IAutomationRunRequestResult, IAutomationService, IGuardedAutomationUpdateResult } from '../../../chat/common/automations/automationService.js';
import { ICustomViewDescriptor, ICustomViewOpenRequest, ICustomViewService } from '../customView.js';
import { IPinnedCanvas, IPinnedCanvasService } from '../pinnedCanvases.js';
import { IAgentFeedbackNavigationBearing, IAgentFeedbackService } from '../agentFeedback.js';
import { IAgentFeedback } from '../agentFeedbackModel.js';
import { IAquariumService, IMountedToggleHandle } from '../aquarium.js';
import { ICodeReviewService, IPRReviewCommentTarget, IPRReviewState, PRReviewStateKind } from '../codeReviewService.js';
import { ISession, ISessionFileChange } from '../../../../services/sessions/common/session.js';

function notAvailable(): Promise<never> {
	return Promise.reject(new Error('Automations are not available in this window'));
}

/**
 * The custom views of an editor window: it shows none, so the sessions list offers none of the
 * entries that open one, such as Automations.
 */
export class EditorWindowCustomViewService implements ICustomViewService {

	declare readonly _serviceBrand: undefined;

	readonly activeCustomView: IObservable<ICustomViewDescriptor | undefined> = constObservable(undefined);
	readonly activeCustomViewOpen: IObservable<ICustomViewOpenRequest | undefined> = constObservable(undefined);

	registerCustomView(): IDisposable {
		return Disposable.None;
	}

	showCustomView(): void { }

	hideCustomView(): void { }
}

/** The automations of an editor window: it has none, so the sessions list shows no Automations entry. */
export class EditorWindowAutomationService implements IAutomationService {

	declare readonly _serviceBrand: undefined;

	readonly unavailableProviders: IObservable<readonly IAutomationProviderDescriptor[]> = constObservable([]);
	readonly availableProviders: IObservable<readonly IAutomationProviderDescriptor[]> = constObservable([]);
	readonly catalogueState: IObservable<AutomationCatalogueState> = constObservable('unavailable');
	readonly automations: IObservable<readonly IAutomationDescriptor[]> = constObservable([]);
	readonly runs: IObservable<readonly IAutomationRun[]> = constObservable([]);

	canCreateAutomation(): boolean { return false; }
	getAutomation(): IAutomationDescriptor | undefined { return undefined; }
	runsFor(): IObservable<readonly IAutomationRun[]> { return this.runs; }
	createAutomation(): Promise<IAutomationDescriptor> { return notAvailable(); }
	updateAutomation(): Promise<IAutomationDescriptor> { return notAvailable(); }
	updateAutomationIfUnchanged(): Promise<IGuardedAutomationUpdateResult> { return notAvailable(); }
	deleteAutomation(): Promise<void> { return notAvailable(); }
	runAutomation(): Promise<IAutomationRunRequestResult> { return notAvailable(); }
	getActiveRunFor(): IAutomationRun | undefined { return undefined; }
	canRunAutomation(): boolean { return false; }
	canUpdateAutomation(): boolean { return false; }
	canDeleteAutomation(): boolean { return false; }
}

/** The pinned canvases of an editor window: it has none, so the sessions list shows none. */
export class EditorWindowPinnedCanvasService implements IPinnedCanvasService {

	declare readonly _serviceBrand: undefined;

	readonly enabled: IObservable<boolean> = constObservable(false);
	readonly entries: IObservable<readonly IPinnedCanvas[]> = constObservable([]);
	readonly selected: IObservable<IPinnedCanvas | undefined> = constObservable(undefined);

	getEntry(): IPinnedCanvas | undefined { return undefined; }
	isPinned(): boolean { return false; }
	isShown(): boolean { return false; }
	getTrackedCanvas(): undefined { return undefined; }
	pin(): boolean { return false; }
	unpin(): void { }
	async show(): Promise<void> { }
	reconnect(): void { }
	async goToChat(): Promise<void> { }
	async closeCanvas(): Promise<void> { }
}

/**
 * The feedback on the changes of agent sessions in an editor window: the window offers none, as the
 * Agents window's diff editors do, so the chats it shows have none to show or send.
 */
export class EditorWindowAgentFeedbackService implements IAgentFeedbackService {

	declare readonly _serviceBrand: undefined;

	readonly onDidChangeFeedback = Event.None;
	readonly onDidChangeFeedbackVisibility = Event.None;
	readonly onDidChangeNavigation = Event.None;
	readonly onDidRevealSessionComment = Event.None;
	readonly onDidChangeFeedbackScope = Event.None;
	readonly onDidAddFeedback = Event.None;
	readonly onDidConvertFeedback = Event.None;
	readonly onDidAddReply = Event.None;
	readonly onDidSubmitFeedback = Event.None;

	readonly activeFeedbackSessionResource: IObservable<URI> = constObservable(URI.from({ scheme: 'agent-feedback', path: '/none' }));

	addFeedback(): IAgentFeedback {
		throw new Error('Agent feedback is not available in this window');
	}
	acceptFeedback(): void { }
	removeFeedback(): void { }
	updateFeedback(): void { }
	updateFeedbackSourcePullRequest(): void { }
	setFeedbackResolved(): void { }
	addReply(): void { }
	getFeedback(): readonly IAgentFeedback[] { return []; }
	getFeedbackObservable(): IObservable<readonly IAgentFeedback[]> { return constObservable([]); }
	isAgentHostSession(): boolean { return false; }
	showFeedbackInEditor(): void { }
	hideFeedbackInEditor(): void { }
	getVisibleResolvedFeedbackIds(): ReadonlySet<string> { return new Set(); }
	hasLoadedFeedback(): boolean { return true; }
	getSessionForFile(): ISession | undefined { return undefined; }
	getChatChanges(): readonly ISessionFileChange[] { return []; }
	getFeedbackSessionResource(): URI | undefined { return undefined; }
	registerFeedbackResourceScope(): IDisposable { return Disposable.None; }
	getMostRecentSessionForResource(): URI | undefined { return undefined; }
	async revealFeedback(): Promise<void> { }
	async revealSessionComment(): Promise<void> { }
	getNextFeedback(): IAgentFeedback | undefined { return undefined; }
	getNextNavigableItem(): undefined { return undefined; }
	setNavigationAnchor(): void { }
	getNavigationBearing(): IAgentFeedbackNavigationBearing { return { activeIdx: -1, totalCount: 0 }; }
	clearFeedback(): void { }
	markFeedbackSubmitted(): void { }
	async submitFeedback(): Promise<boolean> { return false; }
	async addFeedbackAndSubmit(): Promise<void> { }
}

/** The aquarium of an editor window: it has none, as only the Agents window shows it. */
export class EditorWindowAquariumService implements IAquariumService {

	declare readonly _serviceBrand: undefined;

	readonly actionVisible: IObservable<boolean> = constObservable(false);

	mountToggle(): IMountedToggleHandle {
		return { setHostVisible: () => { }, dispose: () => { } };
	}

	toggleActionVisibility(): boolean {
		return false;
	}

	simulateStreak(): void { }
}

/** The pull request reviews of agent sessions in an editor window: it loads none, as only the Agents window does. */
export class EditorWindowCodeReviewService implements ICodeReviewService {

	declare readonly _serviceBrand: undefined;

	private readonly _none: IObservable<IPRReviewState> = constObservable({ kind: PRReviewStateKind.None });

	getPRReviewState(): IObservable<IPRReviewState> {
		return this._none;
	}

	getPRReviewCommentPullRequests(): readonly [] {
		return [];
	}

	async getPRReviewCommentTargets(): Promise<readonly IPRReviewCommentTarget[]> {
		return [];
	}

	createPRReviewComment(): Promise<void> {
		return Promise.reject(new Error('Pull request reviews are not available in this window'));
	}

	async resolvePRReviewThread(): Promise<void> { }
	markPRReviewCommentConverted(): void { }
	dismissPRReviewComment(): void { }
}
