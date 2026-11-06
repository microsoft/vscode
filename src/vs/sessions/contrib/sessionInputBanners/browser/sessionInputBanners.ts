/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { IAgentFeedbackService } from '../../agentFeedback/browser/agentFeedbackService.js';
import type { ISessionChatPillsDebugData } from '../../chat/browser/sessionChatInputToolbarDebug.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { SessionInputBannerModel } from './sessionInputBannerModel.js';
import { SessionInputBannerWidget } from './sessionInputBannerWidget.js';

/** Hosts actionable CI and review-feedback banners above the active chat input. */
export class SessionInputBanners extends Disposable {
	readonly domNode = dom.$('.session-input-banners.empty');
	private readonly model: SessionInputBannerModel;

	constructor(
		@ISessionsService sessionsService: ISessionsService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService configurationService: IConfigurationService,
		@IGitHubService gitHubService: IGitHubService,
		@IAgentFeedbackService feedbackService: IAgentFeedbackService,
		@ICommandService commandService: ICommandService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService logService: ILogService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
	) {
		super();
		this.model = this._register(new SessionInputBannerModel(undefined, sessionsService, sessionsProvidersService, configurationService,
			gitHubService, feedbackService, commandService, storageService, logService, chatWidgetService));
		const widget = this._register(instantiationService.createInstance(SessionInputBannerWidget, []));
		this.domNode.appendChild(widget.domNode);
		this._register(autorun(reader => {
			const banners = this.model.banners.read(reader);
			this.domNode.classList.toggle('empty', banners.length === 0);
			widget.setBanners(banners);
		}));
	}

	setActive(active: boolean): void {
		this.model.setActive(active);
	}

	setDebugData(data: ISessionChatPillsDebugData | undefined): void {
		this.model.setDebugData(data);
	}
}
