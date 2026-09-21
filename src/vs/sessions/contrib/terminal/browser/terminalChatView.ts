/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/terminalChatView.css';
import { $, Dimension, getWindow, scheduleAtNextAnimationFrame, size } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { createPixelSpinner } from '../../../../base/browser/ui/pixelSpinner/pixelSpinner.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun, constObservable } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ITerminalInstance, ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { AbstractChatView } from '../../../browser/parts/chatView.js';
import { IChat, ISession } from '../../../services/sessions/common/session.js';
import { ISessionTerminal, ISessionTerminalService } from '../../../services/terminal/browser/sessionTerminalService.js';
import { ISessionOpenTelemetryService, ISessionTerminalRenderObserver } from '../../../services/sessions/browser/sessionOpenTelemetryService.js';

interface ITerminalRenderRequest {
	readonly observer: ISessionTerminalRenderObserver;
	readonly frame: MutableDisposable<IDisposable>;
	kind: 'render' | 'existingRender';
}

export class TerminalChatView extends AbstractChatView {
	override readonly kind = 'terminal';
	override readonly hasVisibleTranscriptContent = constObservable(true);

	private readonly _headerGap = $('.session-terminal-header-gap');
	private readonly _terminalContainer = $('.session-terminal-container.integrated-terminal');
	private readonly _statusContainer = $('.session-terminal-status');
	private readonly _messageRow = $('.session-terminal-message');
	private readonly _spinner = this._register(createPixelSpinner(this._messageRow));
	private readonly _message = $('p');
	private readonly _startButton: Button;
	private readonly _sessionDisposables = this._register(new DisposableStore());
	private readonly _terminalDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly _terminalViewRegistration = this._register(new MutableDisposable());
	private readonly _renderRequestDisposables = this._register(new MutableDisposable<DisposableStore>());
	private _session: ISession | undefined;
	private _chat: IChat | undefined;
	private _terminalState: ISessionTerminal | undefined;
	private _terminal: ITerminalInstance | undefined;
	private _visible = true;
	private _active = false;
	private _requestedStart = false;
	private _terminalRendered = false;
	private _renderRequest: ITerminalRenderRequest | undefined;
	private _dimensions: Dimension | undefined;
	private _lastTerminalDimensions: Dimension | undefined;
	private _lastTerminalVisible: boolean | undefined;

	constructor(
		@ISessionTerminalService private readonly _sessionTerminalService: ISessionTerminalService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ISessionOpenTelemetryService private readonly _sessionOpenTelemetryService: ISessionOpenTelemetryService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this.element.classList.add('session-terminal-view');
		this._headerGap.setAttribute('aria-hidden', 'true');
		this.element.append(this._headerGap, this._statusContainer, this._terminalContainer);
		this._message.setAttribute('role', 'status');
		this._message.tabIndex = -1;
		this._messageRow.appendChild(this._message);
		this._statusContainer.appendChild(this._messageRow);
		this._startButton = this._register(new Button(this._statusContainer, defaultButtonStyles));
		this._startButton.label = localize('resumeCliSession', "Resume CLI");
		this._register(this._startButton.onDidClick(() => this._start()));
	}

	override setChat(chat: IChat, _historyKey?: string, session?: ISession): void {
		if (this._session?.sessionId === session?.sessionId) {
			if (!isEqual(this._chat?.resource, chat.resource)) {
				this._terminalViewRegistration.clear();
				this._chat = chat;
				this._updateTerminalViewRegistration();
			}
			return;
		}
		this._terminalViewRegistration.clear();
		this._sessionDisposables.clear();
		this._detach();
		this._session = session;
		this._chat = chat;
		this._requestedStart = false;
		const state = this._terminalState = session && this._sessionTerminalService.getSessionTerminal(session.sessionId);
		if (!state || !session) {
			this._statusContainer.style.display = '';
			this._spinner.element.style.display = 'none';
			this._message.textContent = localize('terminalSessionUnavailable', "This terminal session is unavailable.");
			this._startButton.element.style.display = 'none';
			this._updateTerminalViewRegistration();
			return;
		}
		this._sessionDisposables.add(autorun(reader => {
			const terminal = state.instance.read(reader);
			const starting = state.isStarting.read(reader);
			const initializing = state.isInitializing?.read(reader) ?? false;
			const error = state.error.read(reader);
			const warning = state.warning?.read(reader);
			const otherSession = state.displaysOtherSession?.read(reader);
			const archived = session.isArchived.read(reader);
			session.status.read(reader);
			if (terminal || starting) {
				this._requestedStart = true;
			}
			if (terminal !== this._terminal) {
				this._detach();
				this._terminal = terminal;
				if (terminal) {
					const resources = new DisposableStore();
					this._terminalDisposables.value = resources;
					void this._observeTerminalRendering(terminal, resources);
					terminal.attachToElement(this._terminalContainer);
				}
			}
			const running = state.isRunning.read(reader);
			if (initializing || !running || error || archived) {
				this._invalidateTerminalRender();
			}
			this._spinner.element.style.display = starting || initializing || otherSession?.switching ? '' : 'none';
			this._statusContainer.style.display = running && !starting && !initializing && !error && !warning && !archived && !otherSession ? 'none' : '';
			this._message.textContent = error ?? warning ?? (archived
				? localize('terminalSessionArchived', "This terminal session is archived.")
				: starting || initializing
					? localize('terminalSessionStarting', "Starting the CLI terminal...")
					: otherSession?.switching
						? localize('terminalSessionSwitching', "Switching the CLI from “{0}” to this conversation...", otherSession.title)
						: otherSession
							? localize('terminalSessionBackground', "This CLI is currently showing “{0}”. Use the CLI's session list to switch back to this conversation.", otherSession.title)
							: localize('terminalSessionStopped', "The CLI has stopped. Resume it to continue this session."));
			this._startButton.element.style.display = !archived && !running && !starting ? '' : 'none';
			this._startButton.enabled = !starting && !archived;
			this._layoutTerminal();
			if (!terminal && !archived && !starting && !error && this._visible && !this._requestedStart) {
				this._start();
			}
		}));
		this._updateTerminalViewRegistration();
	}

	private async _observeTerminalRendering(terminal: ITerminalInstance, resources: DisposableStore): Promise<void> {
		try {
			resources.add(Event.once(terminal.onWillDispose)(() => {
				if (resources.isDisposed || this._terminal !== terminal) {
					return;
				}
				this._invalidateTerminalRender();
				this._failTerminalRender();
				resources.dispose();
			}));
			resources.add(Event.once(terminal.onExit)(() => {
				if (resources.isDisposed || this._terminal !== terminal) {
					return;
				}
				this._invalidateTerminalRender();
				this._failTerminalRender();
			}));
			const xterm = terminal.xterm ?? await terminal.xtermReadyPromise;
			if (resources.isDisposed || this._terminal !== terminal) {
				return;
			}
			if (!xterm) {
				this._failTerminalRender();
				return;
			}
			const invalidate = () => {
				if (!resources.isDisposed && this._terminal === terminal) {
					this._invalidateTerminalRender();
				}
			};
			resources.add(xterm.raw.onResize(invalidate));
			resources.add(xterm.raw.onRender(() => {
				if (resources.isDisposed || this._terminal !== terminal || terminal.isDisposed
					|| terminal.domElement.parentElement !== this._terminalContainer
					|| this._lastTerminalVisible !== true || this._terminalState?.isInitializing?.get()) {
					return;
				}
				this._terminalRendered = true;
				if (this._renderRequest) {
					this._renderRequest.kind = 'render';
				}
				this._updateTerminalRenderReadiness();
			}));
		} catch {
			if (!resources.isDisposed && this._terminal === terminal) {
				resources.dispose();
				this._failTerminalRender();
			}
		}
	}

	private _updateTerminalViewRegistration(): void {
		if (!this._session || !this._chat || !this._active || !this._visible || !this.element.isConnected
			|| this.element.closest('[inert], [hidden], [aria-hidden="true"]')) {
			this._terminalViewRegistration.clear();
			return;
		}
		if (!this._terminalViewRegistration.value) {
			this._terminalViewRegistration.value = this._sessionOpenTelemetryService.registerTerminalView(this._session.resource, this._chat.resource, observer => {
				const resources = new DisposableStore();
				this._renderRequestDisposables.value = resources;
				const request: ITerminalRenderRequest = {
					observer,
					frame: resources.add(new MutableDisposable()),
					kind: this._terminalRendered ? 'existingRender' : 'render',
				};
				this._renderRequest = request;
				resources.add(toDisposable(() => {
					if (this._renderRequest === request) {
						this._renderRequest = undefined;
					}
				}));
				this._updateTerminalRenderReadiness();
				return toDisposable(() => {
					if (this._renderRequest === request) {
						this._renderRequestDisposables.clear();
					}
				});
			});
		}
		this._updateTerminalRenderReadiness();
	}

	private _invalidateTerminalRender(): void {
		this._terminalRendered = false;
		this._renderRequest?.frame.clear();
	}

	private _failTerminalRender(cancelled = false): void {
		const observer = this._renderRequest?.observer;
		this._renderRequestDisposables.clear();
		if (cancelled) {
			observer?.onCancel();
		} else {
			observer?.onFailure();
		}
	}

	private _canReportTerminalRender(): boolean {
		return !this._store.isDisposed && this._active && this._visible && this._lastTerminalVisible === true
			&& !!this._lastTerminalDimensions && this._lastTerminalDimensions.width > 0 && this._lastTerminalDimensions.height > 0
			&& !!this._terminal && !this._terminal.isDisposed && this._terminalRendered
			&& this._terminal.domElement.parentElement === this._terminalContainer
			&& this._terminalContainer.isConnected
			&& !!this._terminalState?.isRunning.get()
			&& !this._terminalState.isStarting.get() && !this._terminalState.isInitializing?.get()
			&& !this._terminalState.error.get() && !this._session?.isArchived.get();
	}

	private _updateTerminalRenderReadiness(): void {
		const request = this._renderRequest;
		if (!request) {
			return;
		}
		if (!this._terminalState || this._terminalState.error.get() || this._session?.isArchived.get() || this._terminal?.isDisposed
			|| (this._terminal && !this._terminalState.isRunning.get() && !this._terminalState.isStarting.get())) {
			this._failTerminalRender();
			return;
		}
		if (!this._canReportTerminalRender()) {
			request.frame.clear();
			return;
		}
		if (!request.frame.value) {
			request.frame.value = this.scheduleRenderFrame(() => {
				request.frame.clear();
				if (this._renderRequest !== request || !this._canReportTerminalRender()
					|| this.element.closest('[inert], [hidden], [aria-hidden="true"]')
					|| !this._terminalContainer.checkVisibility({ checkVisibilityCSS: true })) {
					return;
				}
				this._renderRequestDisposables.clear();
				request.observer.onReady(request.kind);
			});
		}
	}

	/** Observe the frame after xterm rendering without requesting another terminal refresh. */
	protected scheduleRenderFrame(callback: () => void): IDisposable {
		return scheduleAtNextAnimationFrame(getWindow(this.element), callback);
	}

	private _start(): void {
		if (!this._terminalState || !this._session || this._session.isArchived.get()) {
			return;
		}
		this._requestedStart = true;
		const state = this._terminalState;
		void state.start().then(() => {
			// Only the active session may take focus: inactive sessions shown side by side
			// are still visible, and startup can finish seconds after the user moved on.
			if (this._terminalState === state && this._active && this._visible && !this._store.isDisposed) {
				this.focus();
			}
		}).catch(error => {
			if (this._terminalState === state && !this._store.isDisposed) {
				this._failTerminalRender(isCancellationError(error));
			}
			if (!isCancellationError(error)) {
				this._logService.error('[TerminalChatView] Failed to start terminal', error);
				this._notificationService.error(error);
			}
		});
	}

	override setActive(active: boolean): void {
		this._active = active;
		this._updateTerminalViewRegistration();
	}

	protected override doLayout(width: number, height: number): void {
		this._dimensions = new Dimension(width, height);
		this._updateTerminalViewRegistration();
		this._layoutTerminal();
	}

	private _layoutTerminal(): void {
		// While hidden the container reports zero-height chrome, which would resize the
		// live pty (and SIGWINCH the CLI) to the wrong dimensions.
		if (!this._dimensions || !this._terminalContainer.isConnected || !this._visible) {
			if (this._terminal?.domElement.parentElement === this._terminalContainer && this._lastTerminalVisible !== false) {
				this._terminal.setVisible(false);
				this._lastTerminalVisible = false;
			}
			this._renderRequest?.frame.clear();
			return;
		}
		const height = Math.max(0, this._dimensions.height - this._headerGap.offsetHeight - this._statusContainer.offsetHeight);
		size(this._terminalContainer, this._dimensions.width, height);
		if (this._terminal?.domElement.parentElement === this._terminalContainer) {
			const dimensions = new Dimension(this._dimensions.width, height);
			if (!this._lastTerminalDimensions || !Dimension.equals(this._lastTerminalDimensions, dimensions)) {
				this._terminal.layout(dimensions);
				this._lastTerminalDimensions = dimensions;
			}
			const visible = this._visible && height > 0;
			if (this._lastTerminalVisible !== visible) {
				this._terminal.setVisible(visible);
				this._lastTerminalVisible = visible;
			}
		}
		this._updateTerminalRenderReadiness();
	}

	override focus(): void {
		if (this._terminal && this._terminalState?.isRunning.get()) {
			this._terminalService.setActiveInstance(this._terminal);
			void this._terminal.focusWhenReady().catch(error => this._logService.error('[TerminalChatView] Focus failed', error));
		} else if (this._startButton.element.style.display !== 'none') {
			this._startButton.focus();
		} else {
			this._message.focus();
		}
	}

	override setVisible(visible: boolean): void {
		this._visible = visible;
		this._updateTerminalViewRegistration();
		this._layoutTerminal();
		if (visible && this._terminalState && !this._terminal && !this._requestedStart) {
			this._start();
		}
	}

	override attach(resources: URI[]): void {
		if (!this._terminal || !this._terminalState?.isRunning.get() || this._session?.isArchived.get()) {
			this._notificationService.warn(localize('terminalSessionAttachUnavailable', "Start the CLI terminal before attaching files."));
			return;
		}
		if (resources.some(resource => resource.scheme !== Schemas.file)) {
			this._notificationService.warn(localize('terminalSessionLocalAttachments', "Only local files can be attached to a CLI terminal session."));
			return;
		}
		void this._attachFiles(this._terminal, resources)
			.catch(error => this._notificationService.error(error));
		this.focus();
	}

	private async _attachFiles(terminal: ITerminalInstance, resources: readonly URI[]): Promise<void> {
		const paths = await Promise.all(resources.map(resource => terminal.preparePathForShell(resource.fsPath)));
		await terminal.sendText(paths.join(' '), false, true);
	}

	override toJSON(): object {
		return { type: 'sessions.terminalChatView' };
	}

	private _detach(): void {
		this._terminalDisposables.clear();
		this._invalidateTerminalRender();
		if (this._terminal?.domElement.parentElement === this._terminalContainer) {
			this._terminal.setVisible(false);
			this._terminal.detachFromElement();
		}
		this._terminal = undefined;
		this._lastTerminalDimensions = undefined;
		this._lastTerminalVisible = undefined;
	}

	override dispose(): void {
		this._detach();
		super.dispose();
	}
}
