/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, Dimension, registerWindow } from '../../../base/browser/dom.js';
import { CodeWindow, ensureCodeWindow } from '../../../base/browser/window.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { mock } from '../../../base/test/common/mock.js';
import { IRectangle } from '../../../platform/window/common/window.js';
import { IAuxiliaryTitlebarPart } from '../../../workbench/browser/parts/titlebar/titlebarPart.js';
import { BeforeAuxiliaryWindowUnloadEvent, IAuxiliaryWindow, IAuxiliaryWindowOpenOptions, IAuxiliaryWindowService } from '../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { SessionsParts } from '../../browser/parts/sessionsParts.js';
import { ISessionsTitleService } from '../../browser/parts/titlebarPart.js';
import { ISessionsPartService } from '../../services/sessions/browser/sessionsPartService.js';
import { createSessionsPartTestServices } from './sessionViewTestUtils.js';
import { ILifecycleService } from '../../../workbench/services/lifecycle/common/lifecycle.js';
import { TestLifecycleService } from '../../../workbench/test/common/workbenchTestServices.js';
import { IHostService } from '../../../workbench/services/host/browser/host.js';
import { TestHostService } from '../../../workbench/test/browser/workbenchTestServices.js';

let windowId = 1000;

class TestAuxiliaryWindow extends Disposable implements IAuxiliaryWindow {
	private readonly _onUnload = this._register(new Emitter<void>());
	readonly onUnload = this._onUnload.event;
	private readonly _onBeforeUnload = this._register(new Emitter<BeforeAuxiliaryWindowUnloadEvent>());
	readonly onBeforeUnload = this._onBeforeUnload.event;
	private readonly _onWillLayout = this._register(new Emitter<Dimension>());
	readonly onWillLayout = this._onWillLayout.event;
	readonly onDidLayout = Event.None;
	readonly whenStylesHaveLoaded = Promise.resolve();
	readonly window: CodeWindow;
	readonly container: HTMLElement;
	private closed = false;
	private bounds: IRectangle = { x: 0, y: 0, width: 802, height: 602 };

	constructor() {
		super();
		const frame = document.createElement('iframe');
		frame.style.width = '802px';
		frame.style.height = '602px';
		document.body.appendChild(frame);
		this._register(toDisposable(() => frame.remove()));
		const child = frame.contentWindow;
		assert(child);
		ensureCodeWindow(child, ++windowId);
		this._register(registerWindow(child));
		this.container = $('.monaco-workbench');
		child.document.body.appendChild(this.container);
		const childDocument = child.document;
		const childId = child.vscodeWindowId;
		const owner = this;
		this.window = new class extends mock<CodeWindow>() {
			override readonly vscodeWindowId = childId;
			override readonly document = childDocument;
			override get closed() { return owner.closed; }
			override close = (): void => {
				if (!owner.closed) {
					let vetoed = false;
					owner._onBeforeUnload.fire({ veto: reason => vetoed ||= !!reason });
					if (vetoed) {
						return;
					}
					owner.closed = true;
					owner._onUnload.fire();
				}
			};
		}();
	}

	updateOptions(): void { }
	async setBounds(bounds: IRectangle): Promise<void> { this.bounds = bounds; this.layout(); }
	layout(): void { this._onWillLayout.fire(new Dimension(this.bounds.width, this.bounds.height)); }
	createState(): IAuxiliaryWindowOpenOptions { return { bounds: this.bounds }; }
}

export function createSessionWindowsTestHarness(store: DisposableStore, createMain = true) {
	const services = createSessionsPartTestServices(store);
	const hostService = services.instantiationService.get(IHostService);
	assert(hostService instanceof TestHostService);
	const windows: TestAuxiliaryWindow[] = [];
	let openFailure: Error | undefined;
	const shutdown = store.add(new Emitter<void>());
	const lifecycle = store.add(new class extends TestLifecycleService {
		override get onDidShutdown() { return shutdown.event; }
	}());
	services.instantiationService.stub(ILifecycleService, lifecycle);
	services.instantiationService.stub(IAuxiliaryWindowService, new class extends mock<IAuxiliaryWindowService>() {
		override readonly onDidOpenAuxiliaryWindow = Event.None;
		override async open(): Promise<IAuxiliaryWindow> {
			if (openFailure) {
				throw openFailure;
			}
			const window = new TestAuxiliaryWindow();
			windows.push(window);
			return window;
		}
		override getWindow(id: number) { return windows.find(window => window.window.vscodeWindowId === id && !window.window.closed); }
	}());
	services.instantiationService.stub(ISessionsTitleService, new class extends mock<ISessionsTitleService>() {
		override createAuxiliarySessionsTitlebarPart(): IAuxiliaryTitlebarPart {
			return new class extends mock<IAuxiliaryTitlebarPart>() {
				override readonly height = 0;
				override readonly onDidChange = Event.None;
				override layout(): void { }
				override dispose = () => { };
			}();
		}
	}());
	const parts = store.add(services.instantiationService.createInstance(SessionsParts));
	services.instantiationService.stub(ISessionsPartService, parts);
	const main = parts.getPart('main')!;
	const renderMain = () => {
		main.create(services.container);
		main.layout(1202, 802, 0, 0);
	};
	if (createMain) {
		renderMain();
	}
	return { ...services, parts, main, windows, renderMain, lifecycle, shutdown, hostService, failOpen: (error: Error) => openFailure = error };
}
