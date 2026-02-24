/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/welcomeOverlay.css';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { $, append } from '../../../../base/browser/dom.js';
import { autorun } from '../../../../base/common/observable.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ISessionsWelcomeService, ISessionsWelcomeStep } from '../common/sessionsWelcomeService.js';
import { localize } from '../../../../nls.js';

export class SessionsWelcomeOverlay extends Disposable {

	private readonly overlay: HTMLElement;
	private actionRunning = false;
	private runningStepId: string | undefined;

	private readonly _onDidDismiss = this._register(new Emitter<void>());
	readonly onDidDismiss: Event<void> = this._onDidDismiss.event;

	constructor(
		container: HTMLElement,
		@ISessionsWelcomeService private readonly welcomeService: ISessionsWelcomeService,
	) {
		super();

		// Root overlay element — blocks the entire window
		this.overlay = append(container, $('.sessions-welcome-overlay'));
		this._register({ dispose: () => this.overlay.remove() });

		const card = append(this.overlay, $('.sessions-welcome-card'));

		// Header
		const header = append(card, $('.sessions-welcome-header'));
		append(header, $('h2', undefined, localize('welcomeTitle', "VS Code - Sessions")));
		append(header, $('p.sessions-welcome-subtitle', undefined, localize('welcomeSubtitle', "Complete the following steps to get started.")));

		// Step list container
		const stepList = append(card, $('.sessions-welcome-step-list'));

		// Current step action area
		const actionArea = append(card, $('.sessions-welcome-action-area'));
		const actionDescription = append(actionArea, $('p.sessions-welcome-action-description'));
		const actionButton = this._register(new Button(actionArea, { ...defaultButtonStyles }));

		// Track state for error display
		const errorContainer = append(actionArea, $('p.sessions-welcome-error'));
		errorContainer.style.display = 'none';

		// Reactively render the step list and current step
		this._register(autorun(reader => {
			const steps = this.welcomeService.steps.read(reader);
			const current = this.welcomeService.currentStep.read(reader);
			const isComplete = this.welcomeService.isComplete.read(reader);

			if (isComplete) {
				this.dismiss();
				return;
			}

			// Render step indicators
			this.renderStepList(stepList, steps, current);

			// Render current step action area
			if (current) {
				actionDescription.textContent = current.description;
				actionButton.label = current.actionLabel;
				actionButton.enabled = !this.actionRunning;
				actionArea.style.display = '';
			} else {
				actionArea.style.display = 'none';
			}
		}));

		// Button click handler
		this._register(actionButton.onDidClick(async () => {
			const current = this.welcomeService.currentStep.get();
			if (!current || this.actionRunning) {
				return;
			}

			this.actionRunning = true;
			this.runningStepId = current.id;
			actionButton.enabled = false;
			errorContainer.style.display = 'none';

			// Re-render step list to show spinner
			this.renderStepList(stepList, this.welcomeService.steps.get(), current);

			try {
				await current.action();
			} catch (err) {
				errorContainer.textContent = localize('stepError', "Something went wrong. Please try again.");
				errorContainer.style.display = '';
			} finally {
				this.actionRunning = false;
				this.runningStepId = undefined;
				actionButton.enabled = true;
			}
		}));
	}

	private renderStepList(container: HTMLElement, steps: readonly ISessionsWelcomeStep[], current: ISessionsWelcomeStep | undefined): void {
		container.textContent = '';
		for (let i = 0; i < steps.length; i++) {
			const step = steps[i];
			const satisfied = step.isSatisfied.get();
			const isCurrent = step === current;

			const stepEl = append(container, $(
				'.sessions-welcome-step-item' +
				(satisfied ? '.satisfied' : '') +
				(isCurrent ? '.current' : '')
			));

			// Step number / check icon / spinner
			const indicator = append(stepEl, $('.sessions-welcome-step-indicator'));
			if (satisfied) {
				indicator.appendChild(renderIcon(Codicon.check));
			} else if (this.runningStepId === step.id) {
				indicator.appendChild(renderIcon(Codicon.loading));
				indicator.classList.add('loading');
			} else {
				indicator.textContent = String(i + 1);
			}

			// Step title
			append(stepEl, $('span.sessions-welcome-step-title', undefined, step.title));
		}
	}

	private dismiss(): void {
		this.overlay.classList.add('sessions-welcome-overlay-dismissed');
		this._onDidDismiss.fire();
		// Allow CSS transition to finish before disposing
		setTimeout(() => this.dispose(), 200);
	}
}
