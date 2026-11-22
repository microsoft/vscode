/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatLiveResponseStats.css';
import { $ } from '../../../../../base/browser/dom.js';
import { HoverStyle } from '../../../../../base/browser/ui/hover/hover.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { formatChatResponseStats, formatElapsedTime } from '../../common/chatProgressFormatting.js';
import { getLatestModelCallTokensPerSecond } from '../../common/chatUsage.js';
import { ChatConfiguration, ChatResponseStats, ChatResponseStatsTokens } from '../../common/constants.js';
import { IChatResponseModel } from '../../common/model/chatModel.js';

/**
 * Shows how long a running response has been working and its output tokens, while
 * {@link ChatConfiguration.ResponseStats} is the location of this instance. Its element
 * is hidden otherwise. {@link ChatConfiguration.ResponseStatsTokens} selects whether the
 * tokens show as the speed of the latest model call or as the count of the response so far.
 */
export class ChatLiveResponseStats extends Disposable {

	readonly element = $('span.chat-live-response-stats', { role: 'timer' });

	/** Whether the stats show: a response is running while this instance is at the configured location. */
	readonly isShown: IObservable<boolean>;

	constructor(
		location: Exclude<ChatResponseStats, ChatResponseStats.Off>,
		response: IObservable<IChatResponseModel | undefined>,
		@IConfigurationService configurationService: IConfigurationService,
		@IHoverService hoverService: IHoverService,
	) {
		super();
		this.element.hidden = true;
		const configuredLocation = observableConfigValue<ChatResponseStats>(ChatConfiguration.ResponseStats, ChatResponseStats.Off, configurationService);
		// Unknown values show the speed.
		const countsTokens = observableConfigValue<ChatResponseStatsTokens>(ChatConfiguration.ResponseStatsTokens, ChatResponseStatsTokens.Speed, configurationService)
			.map(tokens => tokens === ChatResponseStatsTokens.Count);
		this._register(hoverService.setupDelayedHover(this.element, () => ({
			content: countsTokens.get()
				? localize('chat.liveResponseStats.countHover', "Time spent working and the output tokens of the response so far")
				: localize('chat.liveResponseStats.hover', "Time spent working and the output speed of the latest model call"),
			style: HoverStyle.Pointer,
		})));

		const runningResponse = derived(this, reader => {
			// The response is only looked up while its stats show here. Unknown values show them nowhere.
			const shown = configuredLocation.read(reader) === location ? response.read(reader) : undefined;
			return shown?.isIncomplete.read(reader) ? shown : undefined;
		});
		this.isShown = runningResponse.map(running => !!running);
		this._register(autorun(reader => {
			const running = runningResponse.read(reader);
			this.element.hidden = !running;
			if (!running) {
				return;
			}
			const startedAt = running.confirmationAdjustedTimestamp.read(reader);
			const waitingSince = running.isPendingConfirmation.read(reader)?.startedWaitingAt;
			// Only what shows is looked up.
			const outputTokens = countsTokens.read(reader) ? running.completionTokenCountObs.read(reader) : undefined;
			const tokensPerSecond = countsTokens.read(reader) ? undefined : getLatestModelCallTokensPerSecond(running.usageObs.read(reader));
			const nextSecond = reader.store.add(new RunOnceScheduler(() => update(), 1000));
			const update = () => {
				const elapsedMs = Math.max(0, (waitingSince ?? Date.now()) - startedAt);
				const stats = formatChatResponseStats(formatElapsedTime(elapsedMs), tokensPerSecond, outputTokens);
				this.element.textContent = stats?.parts.join(' \u00b7 ') ?? '';
				this.element.ariaLabel = stats?.ariaLabel ?? null;
				// The time stands still while the response waits for a confirmation.
				if (waitingSince === undefined) {
					nextSecond.schedule(1000 - elapsedMs % 1000);
				}
			};
			update();
		}));
	}
}
