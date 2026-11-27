/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, EventType } from '../../../../../base/browser/dom.js';
import { DataTransfers } from '../../../../../base/browser/dnd.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import Severity from '../../../../../base/common/severity.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationHandle, INotificationService, IPromptChoice, NoOpNotification, NotificationMessage } from '../../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAutomationDialogService } from '../../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { SessionsDataTransfers } from '../../../../../workbench/contrib/sessions/browser/dnd.js';
import { AutomationCommands } from '../../browser/automationCommands.js';
import { AutomationImportDropTarget } from '../../browser/automationImportDropTarget.js';
import { createDragEvent, fileDataTransfer, ProtectedModeDataTransfer } from './automationDragTestUtils.js';

suite('AutomationImportDropTarget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(parent: HTMLElement = document.body) {
		const instantiationService = store.add(new TestInstantiationService());
		const notifications: { severity: Severity; message: string; choices: IPromptChoice[] }[] = [];
		const dialogErrors: string[] = [];
		const commands: string[] = [];
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override prompt(severity: Severity, message: NotificationMessage, choices: IPromptChoice[]): INotificationHandle {
				notifications.push({ severity, message: String(message), choices });
				return new NoOpNotification();
			}
		}());
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async error(message: string): Promise<void> { dialogErrors.push(message); }
		}());
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(id: string): Promise<T> {
				commands.push(id);
				return undefined as T;
			}
		}());
		instantiationService.stub(IAutomationDialogService, new class extends mock<IAutomationDialogService>() { }());
		instantiationService.stub(IAutomationService, new class extends mock<IAutomationService>() { }());
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ chat: { automations: { enabled: true } } }));
		instantiationService.stub(IFileService, new class extends mock<IFileService>() { }());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		const root = parent.appendChild($('div'));
		store.add(toDisposable(() => root.remove()));
		store.add(instantiationService.createInstance(AutomationImportDropTarget, root));
		return { root, notifications, dialogErrors, commands };
	}

	function describeOverlay(root: HTMLElement) {
		const overlay = root.querySelector<HTMLElement>('.automation-import-drop-overlay')!;
		const label = overlay.querySelector<HTMLElement>('.drop-overlay-label')!;
		return {
			state: !overlay.classList.contains('visible') ? 'hidden' : overlay.classList.contains('accept') ? 'accept' : 'reject',
			label: label.textContent,
			icon: [...label.querySelector('.codicon')?.classList ?? []].find(className => className.startsWith('codicon-')),
		};
	}

	/** Hovers a drag over the root and leaves again, returning what the hover showed. */
	function hover(root: HTMLElement, dataTransfer: DataTransfer) {
		root.dispatchEvent(createDragEvent(EventType.DRAG_ENTER, dataTransfer));
		const shown = { ...describeOverlay(root), dropEffect: dataTransfer.dropEffect };
		root.dispatchEvent(createDragEvent(EventType.DRAG_LEAVE, dataTransfer));
		return shown;
	}

	const markdown = (name: string) => new File(['x'], name, { type: 'text/markdown' });

	test('accepts one text, untyped, or in-app file while Chromium hides its name', () => {
		const { root } = setup();
		const resources = new DataTransfer();
		resources.setData(DataTransfers.RESOURCES, JSON.stringify(['file:///shared/review.automation.md']));
		const accepted = { state: 'accept', label: 'Import Automation File', icon: 'codicon-cloud-upload-compact', dropEffect: 'copy' };

		assert.deepStrictEqual({
			markdown: hover(root, new ProtectedModeDataTransfer(fileDataTransfer(markdown('review.automation.md')))),
			untyped: hover(root, new ProtectedModeDataTransfer(fileDataTransfer(new File(['x'], 'review.automation.md')))),
			resource: hover(root, new ProtectedModeDataTransfer(resources)),
			afterLeave: describeOverlay(root),
		}, {
			markdown: accepted,
			untyped: accepted,
			resource: accepted,
			afterLeave: { state: 'hidden', label: '', icon: undefined },
		});
	});

	test('rejects several files or a non-text file without the import tint', () => {
		const { root } = setup();

		assert.deepStrictEqual({
			several: hover(root, new ProtectedModeDataTransfer(fileDataTransfer(markdown('a.automation.md'), markdown('b.automation.md')))),
			image: hover(root, new ProtectedModeDataTransfer(fileDataTransfer(new File(['x'], 'photo.png', { type: 'image/png' })))),
		}, {
			several: { state: 'reject', label: 'Can\'t import 2 files. Drop one at a time.', icon: 'codicon-error-compact', dropEffect: 'none' },
			image: { state: 'reject', label: 'Can\'t import this file. Only .automation.md files can be imported.', icon: 'codicon-error-compact', dropEffect: 'none' },
		});
	});

	test('ignores drags that carry no file', () => {
		const { root } = setup();
		const text = new DataTransfer();
		text.setData('text/plain', 'Review the workspace');
		const session = new DataTransfer();
		session.setData(SessionsDataTransfers.SESSION, '{}');
		const ignored = (dataTransfer: DataTransfer) => {
			const transfer = new ProtectedModeDataTransfer(dataTransfer);
			transfer.dropEffect = 'move';
			return hover(root, transfer);
		};

		assert.deepStrictEqual({ text: ignored(text), session: ignored(session) }, {
			text: { state: 'hidden', label: '', icon: undefined, dropEffect: 'move' },
			session: { state: 'hidden', label: '', icon: undefined, dropEffect: 'move' },
		});
	});

	test('reports a drop it cannot import in a notification that offers Import Automation', () => {
		const { root, notifications, dialogErrors, commands } = setup();
		const notes = fileDataTransfer(markdown('notes.md'));
		const resources = new DataTransfer();
		resources.setData(DataTransfers.RESOURCES, JSON.stringify(['file:///shared/a.automation.md', 'file:///shared/b.automation.md']));

		root.dispatchEvent(createDragEvent(EventType.DRAG_ENTER, new ProtectedModeDataTransfer(notes)));
		root.dispatchEvent(createDragEvent(EventType.DROP, notes));
		root.dispatchEvent(createDragEvent(EventType.DROP, resources));
		notifications[0]?.choices[0]?.run();

		assert.deepStrictEqual({
			overlay: describeOverlay(root).state,
			notifications: notifications.map(({ severity, message, choices }) => ({ severity, message, choices: choices.map(choice => choice.label) })),
			dialogErrors,
			commands,
		}, {
			overlay: 'hidden',
			notifications: [
				{ severity: Severity.Error, message: 'notes.md isn\'t an automation file. Only .automation.md files can be imported.', choices: ['Import Automation...'] },
				{ severity: Severity.Error, message: 'Drop one automation file at a time.', choices: ['Import Automation...'] },
			],
			dialogErrors: [],
			commands: [AutomationCommands.import.id],
		});
	});

	test('covers the part of the target on screen, whether an ancestor or the target scrolls', () => {
		const rect = (element: Element) => {
			const { top, left, width, height } = element.getBoundingClientRect();
			return { top: Math.round(top), left: Math.round(left), width: Math.round(width), height: Math.round(height) };
		};
		/**
		 * Hovers an accepted drag over a 1000px tall target, scrolled 600px down inside a fixed 300x200 frame. Returns
		 * where the overlay and the center of its label land, and where they belong: on the box the scroller shows its
		 * content in, its padding box less any classic scrollbar, without making the scroller overflow.
		 */
		const hoverScrolled = (scrolls: 'ancestor' | 'target') => {
			const frame = document.body.appendChild($('div', { style: `position: fixed; top: 0; left: 0; width: 300px; height: 200px; overflow: ${scrolls === 'ancestor' ? 'hidden' : 'visible'};` }));
			store.add(toDisposable(() => frame.remove()));
			const { root } = setup(frame);
			if (scrolls === 'ancestor') {
				root.style.height = '1000px';
			} else {
				root.style.height = '200px';
				root.style.overflow = 'auto';
				root.appendChild($('div', { style: 'height: 1000px;' }));
			}
			const scroller = scrolls === 'ancestor' ? frame : root;
			scroller.scrollTop = 600;
			root.dispatchEvent(createDragEvent(EventType.DRAG_ENTER, new ProtectedModeDataTransfer(fileDataTransfer(markdown('review.automation.md')))));
			const overlay = root.querySelector('.automation-import-drop-overlay')!;
			const label = overlay.querySelector('.drop-overlay-label')!.getBoundingClientRect();
			const { clientWidth: width, clientHeight: height } = scroller;
			return {
				actual: {
					overlay: rect(overlay),
					labelCenter: { x: Math.round(label.left + label.width / 2), y: Math.round(label.top + label.height / 2) },
					scrollSize: { width: scroller.scrollWidth, height: scroller.scrollHeight },
				},
				expected: {
					overlay: { top: 0, left: 0, width, height },
					labelCenter: { x: Math.round(width / 2), y: Math.round(height / 2) },
					scrollSize: { width, height: 1000 },
				},
			};
		};
		const ancestor = hoverScrolled('ancestor');
		const target = hoverScrolled('target');

		assert.deepStrictEqual({ ancestor: ancestor.actual, target: target.actual }, { ancestor: ancestor.expected, target: target.expected });
	});
});
