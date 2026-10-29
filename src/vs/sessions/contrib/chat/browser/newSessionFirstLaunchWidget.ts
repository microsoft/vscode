/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../base/browser/formattedTextRenderer.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Link } from '../../../../platform/opener/browser/link.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { SessionsView, SessionsViewId } from '../../sessions/browser/views/sessionsView.js';
import { INewSessionFirstLaunchService } from './newSessionFirstLaunch.js';
import { createFirstLaunchIllustration } from './newSessionFirstLaunchIllustrations.js';

export class NewSessionFirstLaunchWidget extends Disposable {
	readonly visible;

	constructor(
		parent: HTMLElement,
		inputVisible: IObservable<boolean> | undefined,
		@INewSessionFirstLaunchService private readonly firstLaunchService: INewSessionFirstLaunchService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IViewsService private readonly viewsService: IViewsService,
	) {
		super();
		this.visible = derived(this, reader => firstLaunchService.visible.read(reader) && (inputVisible?.read(reader) ?? true));
		const element = dom.append(parent, dom.$('.new-session-first-launch'));
		const documentVisibilityChanged = observableSignalFromEvent(this, Event.fromDOMEventEmitter(element.ownerDocument, 'visibilitychange'));
		this._register(toDisposable(() => {
			element.remove();
			parent.classList.remove('first-launch-visible');
		}));
		let rendered = false;
		this._register(autorun(reader => {
			const visible = this.visible.read(reader);
			element.hidden = !visible;
			parent.classList.toggle('first-launch-visible', visible);
			if (!visible) {
				return;
			}
			documentVisibilityChanged.read(reader);
			if (element.ownerDocument.hidden) {
				return;
			}
			if (!rendered) {
				rendered = true;
				this.renderContents(element);
			}
			reader.store.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(element), () => {
				if (element.isConnected && element.getClientRects().length > 0 && !element.ownerDocument.hidden && this.visible.read(undefined)) {
					firstLaunchService.markPresented();
				}
			}));
		}));
	}

	private renderContents(element: HTMLElement): void {
		const features = dom.append(element, dom.$('.new-session-first-launch-features'));
		for (const [illustration, label] of [
			['workspaces', localize('firstLaunch.workspaces', "Parallel workspaces")],
			['agents', localize('firstLaunch.agents', "Multiple agents")],
			['control', localize('firstLaunch.control', "Same control")],
		] as const) {
			const feature = dom.append(features, dom.$('.new-session-first-launch-feature'));
			feature.appendChild(createFirstLaunchIllustration(illustration));
			dom.append(feature, dom.$('span', undefined, label));
		}
		const prompt = dom.append(element, dom.$('h2.new-session-first-launch-prompt'));
		const resume = dom.append(prompt, dom.$('div'));
		const label = dom.$('span');
		const link = this._register(this.instantiationService.createInstance(Link, resume, { label, href: '#' }, {
			opener: () => this.openSessions().catch(onUnexpectedError),
		}));
		const startTask = dom.append(prompt, dom.$('div'));
		this._register(autorun(reader => {
			const count = this.firstLaunchService.sessionCount.read(reader);
			resume.hidden = count === 0;
			startTask.textContent = count > 0
				? localize('firstLaunch.anotherHarness', "Or kick off a task with another harness.")
				: localize('firstLaunch.startTask', "Kick off a task with your favorite harness.");
			renderFormattedText(count === 1
				? localize('firstLaunch.resumeOne', "Pick up where you left off in **1 session**.")
				: localize('firstLaunch.resume', "Pick up where you left off in **{0} sessions**.", count), undefined, label);
			link.enabled = count > 0;
		}));
	}

	private async openSessions(): Promise<void> {
		const view = await this.viewsService.openView<SessionsView>(SessionsViewId, true);
		if (!view) {
			throw new Error(localize('firstLaunch.sessionsUnavailable', "The sessions list could not be opened. Try again."));
		}
		view.setExpanded(true);
	}
}
