/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { IChatPetWidgetHost } from '../../../browser/widget/chatPetWidget.js';
import { ChatPetWidgetCoordinator } from '../../../browser/widget/chatPetWidgetService.js';

suite('ChatPetWidgetService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHost(): IChatPetWidgetHost {
		const parent = document.createElement('div');
		return {
			parent,
			dragBounds: parent,
			movementBounds: parent,
			model: constObservable(undefined),
			hasInput: constObservable(false),
			inputChanged: Event.None,
			getPlatformTop: () => undefined,
			onDidChangePlatform: Event.None,
		};
	}

	test('uses one window pet and moves it between focused or preferred chat hosts', () => {
		const focusEmitter = disposables.add(new Emitter<IChatWidget | undefined>());
		const firstWidget = new class extends mock<IChatWidget>() { }();
		const secondWidget = new class extends mock<IChatWidget>() { }();
		const thirdWidget = new class extends mock<IChatWidget>() { }();
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override lastFocusedWidget: IChatWidget | undefined = firstWidget;
			override readonly onDidChangeFocusedWidget = focusEmitter.event;

			focus(widget: IChatWidget): void {
				this.lastFocusedWidget = widget;
				focusEmitter.fire(widget);
			}
		}();
		const instances: {
			host: IChatPetWidgetHost;
			readonly hostHistory: IChatPetWidgetHost[];
			disposed: boolean;
		}[] = [];
		const coordinator = disposables.add(new ChatPetWidgetCoordinator(host => {
			const instance = {
				host,
				hostHistory: [host],
				disposed: false,
				setHost(nextHost: IChatPetWidgetHost) {
					this.host = nextHost;
					this.hostHistory.push(nextHost);
				},
				dispose() {
					this.disposed = true;
				},
			};
			instances.push(instance);
			return instance;
		}, chatWidgetService));
		const firstHost = createHost();
		const secondHost = createHost();
		const thirdHost = createHost();
		const firstPreferred = observableValue(disposables, true);
		const secondPreferred = observableValue(disposables, false);
		const firstRegistration = disposables.add(coordinator.register(firstWidget, firstHost, firstPreferred));
		const secondRegistration = disposables.add(coordinator.register(secondWidget, secondHost, secondPreferred));

		firstPreferred.set(false, undefined);
		secondPreferred.set(true, undefined);
		chatWidgetService.focus(firstWidget);
		firstRegistration.dispose();
		const thirdRegistration = disposables.add(coordinator.register(thirdWidget, thirdHost));
		chatWidgetService.focus(thirdWidget);

		assert.deepStrictEqual({
			instanceCount: instances.length,
			hostHistory: instances[0].hostHistory,
			firstActive: firstRegistration.active.get(),
			secondActive: secondRegistration.active.get(),
			thirdActive: thirdRegistration.active.get(),
			disposed: instances[0].disposed,
		}, {
			instanceCount: 1,
			hostHistory: [firstHost, secondHost, firstHost, secondHost, thirdHost],
			firstActive: false,
			secondActive: false,
			thirdActive: true,
			disposed: false,
		});
	});

	test('keeps the window pet through a host gap and disposes it with the coordinator', () => {
		const focusEmitter = disposables.add(new Emitter<IChatWidget | undefined>());
		const widget = new class extends mock<IChatWidget>() { }();
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override lastFocusedWidget: IChatWidget | undefined = widget;
			override readonly onDidChangeFocusedWidget = focusEmitter.event;
		}();
		let pet: { dispose(): void; setHost(host: IChatPetWidgetHost): void } | undefined;
		let disposed = false;
		const coordinator = disposables.add(new ChatPetWidgetCoordinator(() => {
			const instance = {
				dispose: () => disposed = true,
				setHost: () => { },
			};
			pet = instance;
			return instance;
		}, chatWidgetService));
		const registration = coordinator.register(widget, createHost());

		registration.dispose();
		const disposedAfterHost = disposed;
		coordinator.dispose();

		assert.deepStrictEqual({ created: !!pet, disposedAfterHost, disposed }, { created: true, disposedAfterHost: false, disposed: true });
	});

	test('disposes a parked pet when its auxiliary window closes', () => {
		const focusEmitter = disposables.add(new Emitter<IChatWidget | undefined>());
		const windowCloseEmitter = disposables.add(new Emitter<number>());
		const widget = new class extends mock<IChatWidget>() { }();
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override lastFocusedWidget: IChatWidget | undefined = widget;
			override readonly onDidChangeFocusedWidget = focusEmitter.event;
		}();
		let disposed = false;
		const coordinator = disposables.add(new ChatPetWidgetCoordinator(() => ({
			setHost: () => { },
			dispose: () => disposed = true,
		}), chatWidgetService, windowCloseEmitter.event));
		const host = createHost();
		const registration = disposables.add(coordinator.register(widget, host));

		windowCloseEmitter.fire(dom.getWindowId(dom.getWindow(host.parent)));

		assert.deepStrictEqual({ active: registration.active.get(), disposed }, { active: false, disposed: true });
	});
});
