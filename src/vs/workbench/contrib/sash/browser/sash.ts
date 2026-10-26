/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { clamp } from '../../../../base/common/numbers.js';
import { addDisposableListener, EventType, getWindow, onDidUnregisterWindow } from '../../../../base/browser/dom.js';
import { setGlobalSashSize, setGlobalHoverDelay } from '../../../../base/browser/ui/sash/sash.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { createStyleSheet } from '../../../../base/browser/domStylesheets.js';
import { WebviewMouseActivity, webviewMouseActivityEvent } from '../../webview/common/webview.js';

export const minSize = 1;
export const maxSize = 20; // see also https://ux.stackexchange.com/questions/39023/what-is-the-optimum-button-size-of-touch-screen-applications

export class SashSettingsController extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sash';

	private readonly styleSheet = createStyleSheet();

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		const onDidChangeSize = Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('workbench.sash.size'));
		onDidChangeSize(this.onDidChangeSize, this, this._store);
		this.onDidChangeSize();

		const onDidChangeHoverDelay = Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('workbench.sash.hoverDelay'));
		onDidChangeHoverDelay(this.onDidChangeHoverDelay, this, this._store);
		this.onDidChangeHoverDelay();
	}

	private onDidChangeSize(): void {
		const configuredSize = this.configurationService.getValue<number>('workbench.sash.size');
		const size = clamp(configuredSize, 4, 20);
		const hoverSize = clamp(configuredSize, 1, 8);

		this.styleSheet.textContent = `
			.monaco-workbench {
				--vscode-sash-size: ${size}px;
				--vscode-sash-hover-size: ${hoverSize}px;
			}
		`;

		setGlobalSashSize(size);
	}

	private onDidChangeHoverDelay(): void {
		setGlobalHoverDelay(this.configurationService.getValue<number>('workbench.sash.hoverDelay'));
	}
}

export class SashGrippersController extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sashGrippers';

	private readonly containers = this._register(new DisposableMap<HTMLElement, DisposableStore>());

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILayoutService layoutService: ILayoutService,
	) {
		super();

		for (const container of layoutService.containers) {
			this.registerContainer(container);
		}
		this._register(layoutService.onDidAddContainer(({ container, disposables }) => {
			this.registerContainer(container);
			disposables.add(toDisposable(() => this.containers.deleteAndDispose(container)));
		}));
		this._register(onDidUnregisterWindow(targetWindow => {
			for (const container of this.containers.keys()) {
				if (getWindow(container) === targetWindow) {
					this.containers.deleteAndDispose(container);
				}
			}
		}));
	}

	private registerContainer(container: HTMLElement): void {
		const disposables = new DisposableStore();
		this.containers.set(container, disposables);
		const activityListeners = disposables.add(new DisposableStore());
		const targetWindow = getWindow(container);

		const update = () => {
			activityListeners.clear();
			if (!this.configurationService.getValue<boolean>('workbench.sash.autoHideGrippers')) {
				return;
			}

			const autoHideDelay = this.configurationService.getValue<number>('workbench.sash.autoHideGrippersDelay');
			let idleTimeout: number | undefined;
			let lastMousePosition: { x: number; y: number } | undefined;
			const showGrippers = () => {
				targetWindow.clearTimeout(idleTimeout);
				container.classList.remove('sash-grippers-hidden');
				idleTimeout = targetWindow.setTimeout(() => {
					idleTimeout = undefined;
					container.classList.add('sash-grippers-hidden');
				}, autoHideDelay);
			};

			activityListeners.add(toDisposable(() => {
				targetWindow.clearTimeout(idleTimeout);
				container.classList.remove('sash-grippers-hidden');
			}));
			const onMouseActivity = ({ screenX, screenY }: WebviewMouseActivity) => {
				if (lastMousePosition?.x === screenX && lastMousePosition.y === screenY) {
					return;
				}
				lastMousePosition = { x: screenX, y: screenY };
				showGrippers();
			};
			activityListeners.add(addDisposableListener(targetWindow, EventType.MOUSE_MOVE, onMouseActivity, true));
			activityListeners.add(addDisposableListener(targetWindow, webviewMouseActivityEvent, (e: globalThis.Event) => {
				if (e instanceof CustomEvent || e instanceof targetWindow.CustomEvent) {
					const detail: Partial<WebviewMouseActivity> | null | undefined = e.detail;
					if (typeof detail === 'object' && detail !== null
						&& typeof detail.screenX === 'number' && Number.isFinite(detail.screenX)
						&& typeof detail.screenY === 'number' && Number.isFinite(detail.screenY)) {
						onMouseActivity({ screenX: detail.screenX, screenY: detail.screenY });
					}
				}
			}));
			showGrippers();
		};

		disposables.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.sash.autoHideGrippers') || e.affectsConfiguration('workbench.sash.autoHideGrippersDelay')) {
				update();
			}
		}));
		update();
	}
}
