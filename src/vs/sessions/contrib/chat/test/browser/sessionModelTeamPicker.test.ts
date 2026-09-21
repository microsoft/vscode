/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, addStandardDisposableListener } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { IConfirmation, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IModelPickerDelegate } from '../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerActionItem.js';
import { ModelPickerContentWidget } from '../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerContentWidget.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { resolveModelIdentifier } from '../../../../../workbench/contrib/chat/common/modelSelection.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionModelTeam, ISessionModelTeamState, ISessionsProvider, SessionModelTeamRole } from '../../../../services/sessions/common/sessionsProvider.js';
import { normalizeModelPickerOptions } from '../../browser/sessionModelPickerState.js';
import { getModelTeamModels, getModelTeamPresentation, ISessionModelTeamContext, SessionModelTeamPicker } from '../../browser/sessionModelTeamPicker.js';
import { getModelTeamInputSources } from '../../browser/sessionModelTeamInputRequests.js';

function model(id: string): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: id,
		metadata: {
			id, name: id, vendor: 'test', version: '', family: id,
			extension: new ExtensionIdentifier('test.models'),
			maxInputTokens: 1, maxOutputTokens: 1, isDefaultForLocation: {},
			configurationSchema: {
				type: 'object',
				properties: {
					thinkingLevel: { type: 'string', enum: ['low', 'medium', 'high'], enumItemLabels: ['Low', 'Medium', 'High'], default: 'medium', group: 'navigation' },
					contextSize: { type: 'number', enum: [1000, 2000], default: 1000, group: 'tokens' },
				},
			},
		},
	};
}

const lead = model('lead');
const worker = model('worker');
const scout = model('scout');
const auto = model('auto');
const models = [lead, worker, scout, auto];
const chatResource = URI.parse('chat:/one');

class TeamRolePicker extends Disposable {
	private readonly _selected = this._register(new Emitter<ILanguageModelChatMetadataAndIdentifier>());
	readonly onDidChangeSelection = this._selected.event;
	private readonly _closed = this._register(new Emitter<void>());
	readonly onDidClose = this._closed.event;
	readonly disposed = new DeferredPromise<void>();
	anchor: HTMLElement | undefined;
	group: string | undefined;
	private _input: HTMLInputElement | undefined;

	constructor(readonly delegate: IModelPickerDelegate, private readonly opened: Emitter<TeamRolePicker>) {
		super();
	}

	setSelectedModel(_model: ILanguageModelChatMetadataAndIdentifier | undefined): void { }

	focus(): void {
		this._input?.focus();
	}

	show(anchor: HTMLElement, _title: string, group?: string): void {
		this.anchor = anchor;
		this.group = group;
		this._input = anchor.appendChild($('input'));
		this._input.focus();
		this._register(toDisposable(() => this._input?.remove()));
		this.opened.fire(this);
	}

	override dispose(): void {
		super.dispose();
		this.disposed.complete();
	}

	choose(modelId: string, close = true): void {
		const selected = this.delegate.getModels().find(model => model.identifier === modelId);
		assert.ok(selected);
		this._selected.fire(selected);
		if (close) {
			this.close();
		}
	}

	close(): void {
		this._input?.remove();
		this._closed.fire();
	}
}

suite('SessionModelTeamPicker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function fixture(realPopup = false) {
		const changes = store.add(new Emitter<void>());
		const shown = store.add(new Emitter<void>());
		const selected = store.add(new Emitter<void>());
		const opened = store.add(new Emitter<TeamRolePicker>());
		const context = observableValue<ISessionModelTeamContext | undefined>('context', { sessionId: 'test:session', providerId: 'test', chatResource, modelId: 'lead' });
		let state: ISessionModelTeamState = { supported: true, pending: false };
		let barrier: DeferredPromise<void> | undefined;
		let failSave = false;
		let failOpen = false;
		let confirmReset = true;
		let onConfirm: (() => void) | undefined;
		const writes: { sessionId: string; resource: URI; leadModelId: string; team: ISessionModelTeam | undefined; leadConfiguration?: Readonly<Record<string, unknown>> }[] = [];
		const globalWrites: string[] = [];
		const selections: string[] = [];
		const errors: Parameters<INotificationService['error']>[0][] = [];
		const openedChats: { sessionId: string; resource: URI }[] = [];
		const resets: { role: SessionModelTeamRole; expected: URI; resource: URI }[] = [];
		const confirmations: IConfirmation[] = [];
		const session = new class extends mock<ISession>() {
			override readonly sessionId = 'test:session';
		}();
		const provider = new class extends mock<ISessionsProvider>() {
			override readonly id = 'test';
			override readonly onDidChangeModels = Event.None;
			override readonly onDidChangeModelTeam = changes.event;
			override getSessions() { return [session]; }
			override getModelsSnapshot(_sessionId: string, desiredModelId?: string) {
				return { models, modelTarget: 'test', desiredModelResolution: resolveModelIdentifier(models, desiredModelId, true) };
			}
			override getModelTeam(_sessionId: string, resource: URI) { return isEqual(resource, chatResource) ? state : undefined; }
			override async setModelTeam(sessionId: string, resource: URI, leadModelId: string, team: ISessionModelTeam | undefined, leadConfiguration?: Readonly<Record<string, unknown>>) {
				writes.push({ sessionId, resource, leadModelId, team, leadConfiguration });
				await barrier?.p;
				if (failSave) {
					throw new Error('Unable to save team');
				}
				state = {
					...state,
					supported: true,
					pending: true,
					selection: team,
					rememberedSelection: team ? undefined : state.selection ?? state.rememberedSelection,
					leadModelConfiguration: leadConfiguration ?? state.leadModelConfiguration,
					...(state.members ? { members: state.members.map(member => ({ ...member, enabled: !!team && (member.role === 'worker' || !!team.scoutModelId) })) } : {}),
				};
				const current = context.get();
				if (current && isEqual(current.chatResource, resource)) {
					context.set({ ...current, modelId: leadModelId }, undefined);
				}
				changes.fire();
			}
			override async resetModelTeamMember(_sessionId: string, resource: URI, role: SessionModelTeamRole, expected: URI): Promise<void> {
				if (!isEqual(state.members?.find(member => member.role === role)?.chatResource, expected)) {
					throw new Error('Teammate changed before reset');
				}
				resets.push({ role, expected, resource });
			}
		};
		const registeredProvider: ISessionsProvider = provider;
		const providers = new class extends mock<ISessionsProvidersService>() {
			override readonly onDidChangeProviders = Event.None;
			override getProvider<T extends ISessionsProvider>(id: string): T | undefined { return id === registeredProvider.id ? registeredProvider as T : undefined; }
		};
		const languageModels = new class extends mock<ILanguageModelsService>() {
			override readonly onDidChangeLanguageModels = Event.None;
			override getModelConfiguration() { return undefined; }
			override async setModelConfiguration(modelId: string) { globalWrites.push(modelId); }
		};
		const notifications = new class extends mock<INotificationService>() {
			override error(error: Parameters<INotificationService['error']>[0]) { errors.push(error); }
		};
		const sessionsService = new class extends mock<ISessionsService>() {
			override async openChat(session: ISession, resource: URI): Promise<void> {
				openedChats.push({ sessionId: session.sessionId, resource });
			}
		}();
		const dialogService = new class extends mock<IDialogService>() {
			override async confirm(confirmation: IConfirmation) {
				confirmations.push(confirmation);
				onConfirm?.();
				return { confirmed: confirmReset };
			}
		}();
		const picker = store.add(new SessionModelTeamPicker(context, delegate => {
			if (failOpen) {
				failOpen = false;
				throw new Error('Unable to open model picker');
			}
			return new TeamRolePicker(delegate, opened);
		}, providers, new class extends mock<IInstantiationService>() { }(), languageModels, notifications, new NullLogService(), NullHoverService, sessionsService, dialogService));
		const parent = mainWindow.document.body.appendChild($('.monaco-workbench'));
		store.add(toDisposable(() => parent.remove()));
		const layoutService = new class extends mock<ILayoutService>() {
			override readonly mainContainer = parent;
			override readonly activeContainer = parent;
			override readonly onDidLayoutContainer = Event.None;
			override getContainer() { return parent; }
		}();
		const contextView = realPopup ? store.add(new ContextViewService(layoutService)) : undefined;
		const contentWidget = contextView ? store.add(new ModelPickerContentWidget(contextView, layoutService)) : undefined;
		const mounted = store.add(new MutableDisposable());
		const popup = {
			anchor: parent,
			hide: () => contentWidget ? contentWidget.hide() : mounted.clear(),
			reopen: () => {
				const content = picker.getAdditionalContent();
				assert.ok(content);
				if (contentWidget) {
					contentWidget.show(content, popup);
				} else {
					const renderStore = new DisposableStore();
					if (content.renderHeader) {
						renderStore.add(content.renderHeader(parent, popup));
					}
					if (content.render) {
						renderStore.add(content.render(parent, popup));
					}
					mounted.value = renderStore;
				}
				shown.fire();
			},
		};
		const click = (label: string) => {
			const button = [...parent.querySelectorAll<HTMLElement>('.monaco-button')].find(button => button.getAttribute('aria-label')?.startsWith(label) || button.textContent?.trim() === label.trim());
			assert.ok(button, `Missing button ${label}`);
			button.click();
		};
		const choose = async (role: string, modelId: string | undefined, configure = false) => {
			const opening = Event.toPromise(opened.event);
			click(configure ? `${role} reasoning:` : `Choose model for ${role}:`);
			const rolePicker = await opening;
			if (modelId) {
				rolePicker.choose(modelId);
			} else {
				rolePicker.close();
			}
			await rolePicker.disposed.p;
			return rolePicker;
		};
		const toggle = () => {
			const toggle = parent.querySelector<HTMLButtonElement>('.monaco-switch');
			assert.ok(toggle);
			toggle.click();
		};
		const currentModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('model', lead);
		const delegate: IModelPickerDelegate = picker.decorate({
			currentModel,
			setModel: model => { selections.push(model.identifier); selected.fire(); },
			getModels: () => models,
			getPresentationOptions: () => ({ ...normalizeModelPickerOptions(undefined), showModelIcon: true }),
		});
		return {
			picker, parent, context, currentModel, writes, errors, delegate, selections, selected, popup, click, choose, toggle, opened, shown, globalWrites, openedChats, resets, confirmations,
			getState: () => state,
			setState: (value: ISessionModelTeamState) => { state = value; changes.fire(); },
			setBarrier: (value: DeferredPromise<void>) => { barrier = value; },
			failSave: () => { failSave = true; },
			failOpen: () => { failOpen = true; },
			setResetConfirmation: (confirmed: boolean, handler?: () => void) => { confirmReset = confirmed; onConfirm = handler; },
		};
	}

	test('all roles use the ordinary selectable model catalog', () => {
		const hidden = { ...model('hidden'), metadata: { ...model('hidden').metadata, isUserSelectable: false } };
		const byok = { ...model('byok'), metadata: { ...model('byok').metadata, isBYOK: true } };
		const catalog = [...models, hidden, byok];
		assert.deepStrictEqual(getModelTeamModels(catalog).map(model => model.identifier), ['lead', 'worker', 'scout', 'auto', 'byok']);
	});

	test('teammates retain the complete model configuration schema', () => {
		const requiresContext = model('requires-context');
		const configured = {
			...requiresContext,
			metadata: { ...requiresContext.metadata, configurationSchema: { ...requiresContext.metadata.configurationSchema, required: ['contextSize'] } },
		};
		assert.deepStrictEqual(getModelTeamModels([configured]), [configured]);
	});

	test('compact presentation names both agents and announces pending changes', () => {
		const presentation = getModelTeamPresentation({ supported: true, pending: true, selection: { workerModelId: 'missing' } }, models, 'lead');
		assert.deepStrictEqual({
			label: presentation?.label,
			aria: presentation?.ariaLabel,
			segments: presentation?.segments?.map(segment => segment.label),
		}, {
			label: 'lead + missing (Unavailable)',
			aria: 'Model team. Lead: lead (Reasoning: Medium). Worker: missing (Unavailable). Applies on the next request.',
			segments: ['lead', 'missing (Unavailable)'],
		});
	});

	test('pending guidance clears when the team configuration is applied', () => {
		const test = fixture();
		const state = { supported: true, pending: true, selection: { workerModelId: 'worker' } };
		test.setState(state);
		test.popup.reopen();
		const pending = test.parent.querySelector('.model-team-notice')?.textContent;
		test.setState({ ...state, pending: false });
		const applied = test.parent.querySelector('.model-team-notice')?.textContent;
		test.setState({ ...state, pending: false, error: 'Model unavailable' });
		assert.deepStrictEqual({
			pending, applied, error: test.parent.querySelector('.model-team-notice')?.textContent,
		}, {
			pending: 'Applies on the next request. Additional agents use credits.',
			applied: 'Additional agents use credits.',
			error: 'Model unavailable',
		});
	});

	test('Single shows only the Team switch without committing a selection', () => {
		const test = fixture();
		test.popup.reopen();
		assert.deepStrictEqual({
			checked: test.parent.querySelector('.monaco-switch')?.getAttribute('aria-checked'),
			roles: test.parent.querySelectorAll('.model-team-card').length,
			replacesList: test.picker.getAdditionalContent()?.replaceModelList,
			writes: test.writes,
		}, { checked: 'false', roles: 0, replacesList: false, writes: [] });
	});

	test('Team keyboard activation bypasses model acceptance without suppressing the native click', () => {
		const test = fixture();
		test.popup.reopen();
		const toggle = test.parent.querySelector<HTMLButtonElement>('.monaco-switch');
		assert.ok(toggle);
		const bubbled: KeyCode[] = [];
		store.add(addStandardDisposableListener(test.parent, 'keydown', event => bubbled.push(event.keyCode)));
		const prevented = [13, 32, 27].map(keyCode => {
			const event = new KeyboardEvent('keydown', { keyCode, bubbles: true, cancelable: true });
			toggle.dispatchEvent(event);
			return event.defaultPrevented;
		});
		assert.deepStrictEqual({ bubbled, prevented }, { bubbled: [KeyCode.Escape], prevented: [false, false, false] });
	});

	test('cancelling first-time setup preserves Single', async () => {
		const test = fixture();
		test.popup.reopen();
		const opening = Event.toPromise(test.opened.event);
		test.toggle();
		const rolePicker = await opening;
		const ready = Event.toPromise(test.shown.event);
		rolePicker.close();
		await ready;
		assert.deepStrictEqual({ writes: test.writes, errors: test.errors, presentation: test.picker.selectionPresentation.get() }, { writes: [], errors: [], presentation: undefined });
	});

	test('first-time enabling saves the exact chat without Apply or Cancel', async () => {
		const test = fixture();
		test.popup.reopen();
		const opening = Event.toPromise(test.opened.event);
		test.toggle();
		const rolePicker = await opening;
		const ready = Event.toPromise(test.shown.event);
		rolePicker.choose('worker');
		await ready;
		assert.deepStrictEqual({
			selection: test.getState().selection,
			targets: test.writes.map(write => [write.sessionId, write.resource, write.leadModelId]),
			roles: test.parent.querySelectorAll('.model-team-card').length,
			replacesList: test.picker.getAdditionalContent()?.replaceModelList,
			formButtons: [...test.parent.querySelectorAll('.monaco-button')].filter(button => button.textContent === 'Apply Team' || button.textContent === 'Cancel').length,
			errors: test.errors,
		}, {
			selection: { workerModelId: 'worker', workerModelConfiguration: {} },
			targets: [['test:session', chatResource, 'lead']],
			roles: 2, replacesList: true, formButtons: 0, errors: [],
		});
	});

	test('reactivating the initial Worker selector focuses its existing choices without cancelling setup', async () => {
		const test = fixture(true);
		test.popup.reopen();
		let openings = 0;
		store.add(test.opened.event(() => openings++));
		const opening = Event.toPromise(test.opened.event);
		test.toggle();
		const picker = await opening;
		const panel = test.parent.querySelector('.model-team-picker');
		const input = picker.anchor?.querySelector('input');
		const button = test.parent.querySelector<HTMLElement>('[data-role="worker"][data-control="model"]');
		assert.ok(input && button);
		input.value = 'work';
		for (let i = 0; i < 3; i++) {
			button.focus();
			button.click();
			await timeout(0);
		}
		const beforeSelection = {
			samePanel: test.parent.querySelector('.model-team-picker') === panel,
			sameInput: picker.anchor?.querySelector('input') === input,
			focused: mainWindow.document.activeElement === input,
			query: input.value,
			expanded: button.getAttribute('aria-expanded'),
			teamOn: test.parent.querySelector('.monaco-switch')?.getAttribute('aria-checked'),
			openings,
			writes: test.writes.length,
		};
		picker.choose('worker');
		await picker.disposed.p;
		await timeout(0);
		assert.deepStrictEqual({
			beforeSelection,
			writes: test.writes.map(write => ({ resource: write.resource, worker: write.team?.workerModelId })),
			errors: test.errors,
		}, {
			beforeSelection: { samePanel: true, sameInput: true, focused: true, query: 'work', expanded: 'true', teamOn: 'true', openings: 1, writes: 0 },
			writes: [{ resource: chatResource, worker: 'worker' }],
			errors: [],
		});
	});

	for (const role of ['lead', 'worker', 'scout']) {
		for (const configure of [false, true]) {
			test(`reactivating ${role} ${configure ? 'reasoning' : 'model'} choices refocuses the same picker`, async () => {
				const test = fixture(true);
				test.setState({ supported: true, pending: false, selection: { workerModelId: 'worker', scoutModelId: 'scout' } });
				test.popup.reopen();
				const selector = `[data-role="${role}"][data-control="${configure ? 'reasoning' : 'model'}"]`;
				const opening = Event.toPromise(test.opened.event);
				test.parent.querySelector<HTMLElement>(selector)!.click();
				const picker = await opening;
				const input = picker.anchor?.querySelector('input');
				const button = test.parent.querySelector<HTMLElement>(selector);
				assert.ok(input && button);
				button.focus();
				button.click();
				await timeout(0);
				const repeated = {
					sameInput: picker.anchor?.querySelector('input') === input,
					focused: mainWindow.document.activeElement === input,
					expanded: button.getAttribute('aria-expanded'),
					writes: test.writes.length,
				};
				picker.close();
				await picker.disposed.p;
				assert.deepStrictEqual(repeated, { sameInput: true, focused: true, expanded: 'true', writes: 0 });
			});
		}
	}

	test('adding and removing Scout save immediately', async () => {
		const test = fixture();
		test.setState({ supported: true, pending: false, selection: { workerModelId: 'worker' } });
		test.popup.reopen();
		const opening = Event.toPromise(test.opened.event);
		test.click('Add Scout');
		const rolePicker = await opening;
		rolePicker.choose('scout');
		await rolePicker.disposed.p;
		const before = test.parent.querySelectorAll('.model-team-card').length;
		test.click('Remove Scout');
		await timeout(0);
		assert.deepStrictEqual({
			before,
			after: test.parent.querySelectorAll('.model-team-card').length,
			selections: test.writes.map(write => write.team?.scoutModelId),
		}, { before: 3, after: 2, selections: ['scout', undefined] });
	});

	test('turning Team off and on remembers helper models and reasoning', async () => {
		const test = fixture();
		const selection = { workerModelId: 'worker', workerModelConfiguration: { thinkingLevel: 'high' }, scoutModelId: 'scout', scoutModelConfiguration: { thinkingLevel: 'low' } };
		test.setState({ supported: true, pending: false, selection, leadModelConfiguration: { thinkingLevel: 'medium' } });
		test.popup.reopen();
		let ready = Event.toPromise(test.shown.event);
		test.toggle();
		await ready;
		const off = { selection: test.getState().selection, remembered: test.getState().rememberedSelection, label: test.picker.selectionPresentation.get() };
		ready = Event.toPromise(test.shown.event);
		test.toggle();
		await ready;
		assert.deepStrictEqual({
			off,
			on: test.getState().selection,
			lead: test.getState().leadModelConfiguration,
			globalWrites: test.globalWrites,
		}, { off: { selection: undefined, remembered: selection, label: undefined }, on: selection, lead: { thinkingLevel: 'medium' }, globalWrites: [] });
	});

	test('role selection stays inside the team popup and restores focus on cancellation', async () => {
		const test = fixture();
		test.setState({ supported: true, pending: false, selection: { workerModelId: 'worker' } });
		test.popup.reopen();
		const panel = test.parent.querySelector('.model-team-picker');
		const rolePicker = await test.choose('Worker', undefined);
		assert.deepStrictEqual({
			insideTeam: rolePicker.anchor?.parentElement === panel,
			samePanel: test.parent.querySelector('.model-team-picker') === panel,
			current: rolePicker.delegate.currentModel.get()?.identifier,
			focused: mainWindow.document.activeElement?.getAttribute('aria-label'),
			writes: test.writes,
		}, { insideTeam: true, samePanel: true, current: 'worker', focused: 'Choose model for Worker: worker', writes: [] });
	});

	test('switching role choices keeps the Team popup and cancels the previous selector', async () => {
		const test = fixture();
		test.setState({ supported: true, pending: false, selection: { workerModelId: 'worker', scoutModelId: 'scout' } });
		test.popup.reopen();
		const panel = test.parent.querySelector('.model-team-picker');
		const firstOpening = Event.toPromise(test.opened.event);
		test.click('Choose model for Worker:');
		const first = await firstOpening;
		const secondOpening = Event.toPromise(test.opened.event);
		test.click('Scout reasoning:');
		const second = await secondOpening;
		await first.disposed.p;
		const expanded = test.parent.querySelector('[data-role="scout"][data-control="reasoning"]')?.getAttribute('aria-expanded');
		second.close();
		await second.disposed.p;
		assert.deepStrictEqual({
			samePanel: test.parent.querySelector('.model-team-picker') === panel,
			secondInside: second.anchor?.parentElement === panel,
			expanded,
			focused: mainWindow.document.activeElement?.getAttribute('aria-label'),
			writes: test.writes,
		}, { samePanel: true, secondInside: true, expanded: 'true', focused: 'Scout reasoning: Medium', writes: [] });
	});

	test('closing Team disposes its inline choices without reopening the popup', async () => {
		const test = fixture();
		test.setState({ supported: true, pending: false, selection: { workerModelId: 'worker' } });
		test.popup.reopen();
		const opening = Event.toPromise(test.opened.event);
		test.click('Choose model for Worker:');
		const rolePicker = await opening;
		test.popup.hide();
		await rolePicker.disposed.p;
		await timeout(0);
		assert.deepStrictEqual({
			teamOpen: !!test.parent.querySelector('.model-team-picker'),
			choicesConnected: rolePicker.anchor?.isConnected,
			writes: test.writes,
		}, { teamOpen: false, choicesConnected: false, writes: [] });
	});

	test('saving reasoning preserves the inline host and visible role cards', async () => {
		const test = fixture();
		test.setState({ supported: true, pending: false, selection: { workerModelId: 'worker' } });
		test.popup.reopen();
		const panel = test.parent.querySelector('.model-team-picker');
		const opening = Event.toPromise(test.opened.event);
		test.click('Worker reasoning:');
		const rolePicker = await opening;
		const barrier = new DeferredPromise<void>();
		test.setBarrier(barrier);
		const saved = rolePicker.delegate.modelConfiguration?.setModelConfiguration('worker', { thinkingLevel: 'high' });
		const whileSaving = {
			samePanel: test.parent.querySelector('.model-team-picker') === panel,
			choicesConnected: rolePicker.anchor?.isConnected,
			cards: test.parent.querySelectorAll('.model-team-card').length,
		};
		await barrier.complete();
		await saved;
		rolePicker.close();
		await rolePicker.disposed.p;
		assert.deepStrictEqual({
			whileSaving,
			reasoning: test.getState().selection?.workerModelConfiguration,
			samePanel: test.parent.querySelector('.model-team-picker') === panel,
		}, {
			whileSaving: { samePanel: true, choicesConnected: true, cards: 2 },
			reasoning: { thinkingLevel: 'high' }, samePanel: true,
		});
	});

	for (const role of ['Lead', 'Worker', 'Scout']) {
		test(`${role} model selection keeps the real popup open during a delayed save`, async () => {
			const test = fixture(true);
			test.setState({ supported: true, pending: false, selection: { workerModelId: 'worker', scoutModelId: 'scout' } });
			test.popup.reopen();
			const panel = test.parent.querySelector('.model-team-picker');
			const barrier = new DeferredPromise<void>();
			test.setBarrier(barrier);
			const opening = Event.toPromise(test.opened.event);
			test.click(`Choose model for ${role}:`);
			const rolePicker = await opening;
			rolePicker.choose('auto');
			await timeout(0);
			const whileSaving = {
				connected: panel?.isConnected,
				focused: mainWindow.document.activeElement === panel,
			};
			await barrier.complete();
			await rolePicker.disposed.p;
			await timeout(0);
			assert.deepStrictEqual({
				whileSaving,
				samePanel: test.parent.querySelector('.model-team-picker') === panel,
				focused: mainWindow.document.activeElement?.getAttribute('aria-label'),
				writes: test.writes.length,
			}, {
				whileSaving: { connected: true, focused: true },
				samePanel: true,
				focused: `Choose model for ${role}: auto`,
				writes: 1,
			});
		});
	}

	test('a failed delayed model save keeps the real Team popup open', async () => {
		const test = fixture(true);
		test.setState({ supported: true, pending: false, selection: { workerModelId: 'worker' } });
		test.failSave();
		test.popup.reopen();
		const barrier = new DeferredPromise<void>();
		test.setBarrier(barrier);
		const opening = Event.toPromise(test.opened.event);
		test.click('Choose model for Worker:');
		const rolePicker = await opening;
		rolePicker.choose('scout');
		await timeout(0);
		await barrier.complete();
		await rolePicker.disposed.p;
		await timeout(0);
		assert.deepStrictEqual({
			connected: !!test.parent.querySelector('.model-team-picker'),
			focused: mainWindow.document.activeElement?.getAttribute('aria-label'),
			worker: test.getState().selection?.workerModelId,
			errors: test.errors.map(error => error instanceof Error ? error.message : error),
		}, {
			connected: true, focused: 'Choose model for Worker: worker', worker: 'worker', errors: ['Unable to save team'],
		});
	});

	test('the same model has independent reasoning in every role', async () => {
		const test = fixture();
		test.setState({
			supported: true, pending: false, leadModelConfiguration: { thinkingLevel: 'high' },
			selection: { workerModelId: 'lead', workerModelConfiguration: { thinkingLevel: 'medium' }, scoutModelId: 'lead', scoutModelConfiguration: { thinkingLevel: 'high' } },
		});
		test.popup.reopen();
		const opening = Event.toPromise(test.opened.event);
		test.click('Worker reasoning:');
		const rolePicker = await opening;
		await rolePicker.delegate.modelConfiguration?.setModelConfiguration('lead', { thinkingLevel: 'low' });
		rolePicker.close();
		await rolePicker.disposed.p;
		assert.deepStrictEqual({
			group: rolePicker.group,
			lead: test.getState().leadModelConfiguration?.thinkingLevel,
			worker: test.getState().selection?.workerModelConfiguration?.thinkingLevel,
			scout: test.getState().selection?.scoutModelConfiguration?.thinkingLevel,
			focused: mainWindow.document.activeElement?.getAttribute('aria-label'),
			globalWrites: test.globalWrites,
		}, { group: 'navigation', lead: 'high', worker: 'low', scout: 'high', focused: 'Worker reasoning: Low', globalWrites: [] });
	});

	test('Lead reasoning is scoped to the team chat, not global defaults', async () => {
		const test = fixture();
		test.setState({ supported: true, pending: false, selection: { workerModelId: 'worker', workerModelConfiguration: { thinkingLevel: 'low' } } });
		await test.delegate.modelConfiguration?.setModelConfiguration('lead', { thinkingLevel: 'high' });
		assert.deepStrictEqual({
			lead: test.getState().leadModelConfiguration,
			worker: test.getState().selection?.workerModelConfiguration,
			globalWrites: test.globalWrites,
		}, { lead: { thinkingLevel: 'high' }, worker: { thinkingLevel: 'low' }, globalWrites: [] });
	});

	test('a chat that has not used a team preserves its original configuration access', async () => {
		const test = fixture();
		test.setState({ supported: true, pending: false, leadModelConfiguration: { thinkingLevel: 'low' } });
		const before = test.delegate.modelConfiguration?.getModelConfiguration('lead');
		await test.delegate.modelConfiguration?.setModelConfiguration('lead', { thinkingLevel: 'high' });
		assert.deepStrictEqual({ before, globalWrites: test.globalWrites, teamWrites: test.writes }, {
			before: undefined, globalWrites: ['lead'], teamWrites: [],
		});
	});

	test('opening a persistent teammate targets its existing chat without assigning work', async () => {
		const test = fixture();
		const member = { role: 'worker' as const, chatResource: URI.parse('chat:/persistent-worker'), status: SessionStatus.Completed, enabled: true };
		test.setState({ supported: true, pending: false, selection: { workerModelId: 'worker' }, members: [member] });
		test.popup.reopen();
		const status = test.parent.querySelector('.model-team-member-status')?.textContent;
		test.click('Open Worker Chat');
		await timeout(0);
		assert.deepStrictEqual({ status, opened: test.openedChats, writes: test.writes }, {
			status: 'Ready', opened: [{ sessionId: 'test:session', resource: member.chatResource }], writes: [],
		});
	});

	test('member progress updates preserve the focused role controls', () => {
		const test = fixture();
		const member = { role: 'worker' as const, chatResource: URI.parse('chat:/persistent-worker'), status: SessionStatus.Completed, enabled: true };
		const state = { supported: true, pending: false, selection: { workerModelId: 'worker' }, members: [member] };
		test.setState(state);
		test.popup.reopen();
		const button = test.parent.querySelector<HTMLElement>('[data-role="worker"][data-control="model"]');
		assert.ok(button);
		button.focus();
		test.setState({ ...state, members: [{ ...member, status: SessionStatus.InProgress }] });
		assert.deepStrictEqual({
			sameButton: test.parent.querySelector('[data-role="worker"][data-control="model"]') === button,
			focused: mainWindow.document.activeElement === button,
			status: test.parent.querySelector('.model-team-member-status')?.textContent,
			resetDisabled: test.parent.querySelector('[aria-label="Reset Worker"]')?.getAttribute('aria-disabled'),
		}, { sameButton: true, focused: true, status: 'Working', resetDisabled: 'true' });
	});

	test('idle chats show assignment progress rather than implying task completion', () => {
		const test = fixture();
		const member = { role: 'worker' as const, chatResource: URI.parse('chat:/persistent-worker'), status: SessionStatus.Completed, enabled: true };
		const state: ISessionModelTeamState = {
			supported: true, pending: false, selection: { workerModelId: 'worker' }, members: [member], task: { state: 'working' },
		};
		test.setState(state);
		test.popup.reopen();
		const labels = (['unassigned', 'queued', 'working', 'reported', 'blocked', 'removed'] as const).map(assignment => {
			test.setState({ ...state, members: [{ ...member, assignment: { state: assignment } }] });
			return test.parent.querySelector('.model-team-member-status')?.textContent;
		});
		assert.deepStrictEqual(labels, ['Awaiting Assignment', 'Queued', 'Working', 'Awaiting Lead Review', 'Blocked', 'Removed from Task']);
	});

	test('task transitions update the notice without replacing focused controls in the real popup', async () => {
		const test = fixture(true);
		const member = { role: 'worker' as const, chatResource: URI.parse('chat:/persistent-worker'), status: SessionStatus.Completed, enabled: true };
		const state: ISessionModelTeamState = {
			supported: true, pending: true, selection: { workerModelId: 'worker' }, members: [member], task: { state: 'working' },
		};
		test.setState(state);
		test.popup.reopen();
		const button = test.parent.querySelector<HTMLElement>('[data-role="worker"][data-control="model"]');
		assert.ok(button);
		button.focus();
		const transitions = [
			{ task: 'waiting', assignment: 'queued', status: SessionStatus.InProgress },
			{ task: 'reviewing', assignment: 'reported', status: SessionStatus.Completed },
		] as const;
		const snapshots = [];
		for (const transition of transitions) {
			test.setState({ ...state, task: { state: transition.task }, members: [{ ...member, status: transition.status, assignment: { state: transition.assignment } }] });
			await timeout(0);
			snapshots.push({
				sameButton: test.parent.querySelector('[data-role="worker"][data-control="model"]') === button,
				focused: mainWindow.document.activeElement === button,
				status: test.parent.querySelector('.model-team-member-status')?.textContent,
				notice: test.parent.querySelector('.model-team-notice')?.textContent,
				liveRole: test.parent.querySelector('.model-team-notice')?.getAttribute('role'),
			});
		}
		assert.deepStrictEqual(snapshots, [
			{ sameButton: true, focused: true, status: 'Queued', notice: 'Waiting for teammate reports.', liveRole: 'status' },
			{ sameButton: true, focused: true, status: 'Awaiting Lead Review', notice: 'Lead is reviewing teammate reports.', liveRole: 'status' },
		]);
	});

	test('task progress leaves inline choices and their focus intact in the real popup', async () => {
		const test = fixture(true);
		const state: ISessionModelTeamState = {
			supported: true, pending: false, selection: { workerModelId: 'worker' }, task: { state: 'waiting' },
		};
		test.setState(state);
		test.popup.reopen();
		const opening = Event.toPromise(test.opened.event);
		test.click('Worker reasoning:');
		const rolePicker = await opening;
		const focused = mainWindow.document.activeElement;
		test.setState({ ...state, task: { state: 'reviewing' } });
		await timeout(0);
		const during = {
			focused: mainWindow.document.activeElement === focused,
			connected: rolePicker.anchor?.isConnected,
			notice: test.parent.querySelector('.model-team-notice')?.textContent,
		};
		rolePicker.close();
		await rolePicker.disposed.p;
		assert.deepStrictEqual({
			during,
			focused: mainWindow.document.activeElement?.getAttribute('aria-label'),
			writes: test.writes,
		}, {
			during: { focused: true, connected: true, notice: 'Lead is reviewing teammate reports.' },
			focused: 'Worker reasoning: Medium', writes: [],
		});
	});

	test('approvals and history errors take precedence over workflow progress', () => {
		const test = fixture();
		const member = {
			role: 'worker' as const, chatResource: URI.parse('chat:/persistent-worker'), status: SessionStatus.NeedsInput,
			enabled: true, assignment: { state: 'reported' as const },
		};
		const state: ISessionModelTeamState = {
			supported: true, pending: false, selection: { workerModelId: 'worker' }, members: [member],
			task: { state: 'blocked', error: 'Task interrupted.' },
		};
		test.setState(state);
		test.popup.reopen();
		const descriptions = [
			{ status: SessionStatus.Completed, leadStatus: SessionStatus.NeedsInput, historyUnavailable: false, error: undefined },
			{ status: SessionStatus.NeedsInput, leadStatus: SessionStatus.Completed, historyUnavailable: false, error: undefined },
			{ status: SessionStatus.Error, leadStatus: SessionStatus.Completed, historyUnavailable: false, error: undefined },
			{ status: SessionStatus.NeedsInput, leadStatus: SessionStatus.NeedsInput, historyUnavailable: true, error: 'History is incomplete.' },
		].map(({ error, leadStatus, ...change }) => {
			test.setState({ ...state, task: { state: 'blocked', error: 'Task interrupted.', leadStatus }, ...(error ? { error } : {}), members: [{ ...member, ...change }] });
			const description = test.parent.querySelector('.model-team-member-status');
			return {
				status: description?.textContent,
				described: test.parent.querySelector('[aria-label="Open Worker Chat"]')?.getAttribute('aria-describedby') === description?.id,
				notice: test.parent.querySelector('.model-team-notice')?.textContent,
			};
		});
		assert.deepStrictEqual(descriptions, [
			{ status: 'Awaiting Lead Review', described: true, notice: 'Lead needs approval or input. Respond in its chat to continue.' },
			{ status: 'Awaiting Approval or Input', described: true, notice: 'Worker needs approval or input. Respond in Lead\'s approval queue to continue.' },
			{ status: 'Last request failed', described: true, notice: 'Task interrupted. Team task blocked. Retry in the affected chat, remove Scout if it is blocked, or turn Team off.' },
			{ status: 'Previous history unavailable', described: true, notice: 'History is incomplete.' },
		]);
	});

	test('delivered reports are not accepted and human blockers take priority', () => {
		const test = fixture();
		const member = { role: 'worker' as const, chatResource: URI.parse('chat:/worker'), status: SessionStatus.Completed, enabled: true };
		const state: ISessionModelTeamState = { supported: true, pending: false, selection: { workerModelId: 'worker' }, task: { state: 'reviewing' }, members: [member] };
		test.setState(state);
		test.popup.reopen();
		const stages = [
			{ assignment: { state: 'unassigned' as const, objective: 'Implement feature', revision: 1 } },
			{ assignment: { state: 'reported' as const, delivered: true, reviewed: false } },
			{ assignment: { state: 'reported' as const, delivered: true, reviewed: true } },
			{ assignment: { state: 'unassigned' as const, revision: 2, reviewFeedback: 'Add the missing test' } },
			{ assignment: { state: 'working' as const }, pendingInputCount: 2 },
		].map(stage => {
			test.setState({ ...state, members: [{ ...member, ...stage }] });
			return test.parent.querySelector('.model-team-member-status')?.textContent;
		});
		test.setState({ ...state, task: { state: 'integrating', leadPhase: 'integration' } });
		assert.deepStrictEqual({ stages, notice: test.parent.querySelector('.model-team-notice')?.textContent }, {
			stages: ['Assigned', 'Awaiting Lead Review', 'Accepted', 'Needs Rework', 'Awaiting Approval or Input'],
			notice: 'Lead is integrating accepted teammate work.',
		});
	});

	test('the approval projection contains only enabled current teammates', () => {
		const worker = { role: 'worker' as const, chatResource: URI.parse('chat:/worker'), status: SessionStatus.NeedsInput, enabled: true, title: 'Implementation' };
		const scout = { role: 'scout' as const, chatResource: URI.parse('chat:/scout'), status: SessionStatus.NeedsInput, enabled: false };
		const state: ISessionModelTeamState = { supported: true, pending: false, selection: { workerModelId: 'worker' }, members: [worker, scout] };
		assert.deepStrictEqual({
			enabled: getModelTeamInputSources(state),
			off: getModelTeamInputSources({ ...state, selection: undefined }),
			reset: getModelTeamInputSources({ ...state, members: [{ ...worker, chatResource: URI.parse('chat:/worker-replacement') }] }).map(source => source.resource.toString()),
			removed: getModelTeamInputSources({ ...state, members: [{ ...worker, assignment: { state: 'removed' } }] }),
		}, {
			enabled: [{ resource: worker.chatResource, label: 'Worker: Implementation' }],
			off: [], reset: ['chat:/worker-replacement'], removed: [],
		});
	});

	test('approval source labels omit duplicate localized roles and retain custom chat titles', () => {
		const members = (['worker', 'scout'] as const).map(role => ({
			role, chatResource: URI.parse(`chat:/${role}`), status: SessionStatus.NeedsInput, enabled: true,
		}));
		const state: ISessionModelTeamState = {
			supported: true, pending: false, selection: { workerModelId: 'worker', scoutModelId: 'scout' }, members,
		};
		const roleLabels = getModelTeamInputSources(state).map(source => source.label);
		const labelsWithTitles = (titles: readonly string[]) => getModelTeamInputSources({
			...state, members: members.map((member, index) => ({ ...member, title: titles[index] })),
		}).map(source => source.label);
		assert.deepStrictEqual({
			defaults: labelsWithTitles(roleLabels),
			custom: labelsWithTitles(['Implementation', 'Safety review']),
		}, {
			defaults: roleLabels,
			custom: ['Worker: Implementation', 'Scout: Safety review'],
		});
	});

	test('blocked and cancelled tasks retain normal model controls and explicit removal', async () => {
		const test = fixture();
		const state: ISessionModelTeamState = {
			supported: true, pending: false, selection: { workerModelId: 'worker', scoutModelId: 'scout' },
			members: [
				{ role: 'worker', chatResource: URI.parse('chat:/persistent-worker'), status: SessionStatus.Completed, enabled: true, assignment: { state: 'reported' } },
				{ role: 'scout', chatResource: URI.parse('chat:/persistent-scout'), status: SessionStatus.Completed, enabled: true, assignment: { state: 'blocked', error: 'Scout stopped.' } },
			],
			task: { state: 'blocked' },
		};
		test.setState(state);
		test.popup.reopen();
		const notices = (['blocked', 'cancelled', 'completed'] as const).map(task => {
			test.setState({
				...state, task: { state: task },
				members: task === 'completed' ? state.members?.map(member => ({ ...member, assignment: { state: 'reported' } })) : state.members,
			});
			return test.parent.querySelector('.model-team-notice')?.textContent;
		});
		test.setState(state);
		const modelDisabled = test.parent.querySelector('[data-role="scout"][data-control="model"]')?.getAttribute('aria-disabled');
		test.click('Remove Scout');
		await timeout(0);
		const ready = Event.toPromise(test.shown.event);
		test.toggle();
		await ready;
		assert.deepStrictEqual({
			notices, modelDisabled,
			selections: test.writes.map(write => write.team),
			notice: test.parent.querySelector('.model-team-header-notice')?.textContent,
			history: test.parent.querySelector('.model-team-history')?.getAttribute('aria-label'),
		}, {
			notices: [
				'Scout stopped. Team task blocked. Retry in the affected chat, remove Scout if it is blocked, or turn Team off.',
				'Scout stopped. Team task cancelled. Retry in the affected chat, remove Scout if it is blocked, or turn Team off.',
				'Team task completed.',
			],
			modelDisabled: 'false', selections: [{ workerModelId: 'worker', workerModelConfiguration: undefined }, undefined],
			notice: 'Team changes apply to the next request.', history: 'Team History',
		});
	});

	test('paused teammate history stays accessible with Team off', async () => {
		const test = fixture();
		const member = { role: 'worker' as const, chatResource: URI.parse('chat:/persistent-worker'), status: SessionStatus.Completed, enabled: false };
		test.setState({ supported: true, pending: false, rememberedSelection: { workerModelId: 'worker' }, members: [member] });
		test.popup.reopen();
		const status = test.parent.querySelector('.model-team-member-status')?.textContent;
		test.click('Open Worker Chat');
		await timeout(0);
		assert.deepStrictEqual({ status, opened: test.openedChats, writes: test.writes }, {
			status: 'Not in Team', opened: [{ sessionId: 'test:session', resource: member.chatResource }], writes: [],
		});
	});

	test('saved histories remain inspectable when runtime support is temporarily unavailable', async () => {
		const test = fixture();
		const member = { role: 'worker' as const, chatResource: URI.parse('chat:/persistent-worker'), status: SessionStatus.Completed, enabled: false };
		test.setState({ supported: false, pending: false, members: [member] });
		test.popup.reopen();
		const resetDisabled = test.parent.querySelector('[aria-label="Reset Worker"]')?.getAttribute('aria-disabled');
		test.click('Open Worker Chat');
		await timeout(0);
		assert.deepStrictEqual({ resetDisabled, opened: test.openedChats, writes: test.writes }, {
			resetDisabled: 'true', opened: [{ sessionId: 'test:session', resource: member.chatResource }], writes: [],
		});
	});

	test('reset requires confirmation and binds the exact teammate generation', async () => {
		const test = fixture();
		const member = { role: 'worker' as const, chatResource: URI.parse('chat:/persistent-worker'), status: SessionStatus.Completed, enabled: true };
		test.setState({ supported: true, pending: false, selection: { workerModelId: 'worker' }, members: [member] });
		test.popup.reopen();
		test.setResetConfirmation(false);
		let ready = Event.toPromise(test.shown.event);
		test.click('Reset Worker');
		await ready;
		const cancelled = test.resets.length;
		test.setResetConfirmation(true);
		ready = Event.toPromise(test.shown.event);
		test.click('Reset Worker');
		await ready;
		assert.deepStrictEqual({
			cancelled,
			resets: test.resets,
			confirmations: test.confirmations.map(confirmation => confirmation.message),
		}, { cancelled: 0, resets: [{ role: 'worker', expected: member.chatResource, resource: chatResource }], confirmations: ['Reset Worker?', 'Reset Worker?'] });
	});

	for (const confirmed of [true, false]) {
		test(`unavailable history is only reset with explicit confirmation: ${confirmed}`, async () => {
			const test = fixture();
			const member = { role: 'worker' as const, chatResource: URI.parse('chat:/migration-worker'), status: SessionStatus.Error, enabled: false, historyUnavailable: true };
			test.setState({ supported: true, pending: false, selection: { workerModelId: 'worker' }, members: [member] });
			test.popup.reopen();
			const before = test.resets.length;
			const openDisabled = test.parent.querySelector('[aria-label="Open Worker Chat"]')?.getAttribute('aria-disabled');
			test.setResetConfirmation(confirmed);
			const ready = Event.toPromise(test.shown.event);
			test.click('Reset Worker');
			await ready;
			assert.deepStrictEqual({
				before, openDisabled,
				resets: test.resets,
				question: test.confirmations[0].message,
			}, {
				before: 0, openDisabled: 'true', resets: confirmed ? [{ role: 'worker', expected: member.chatResource, resource: chatResource }] : [],
				question: 'Reset Worker?',
			});
		});
	}

	test('a reset confirmation cannot affect a different chat or replacement teammate', async () => {
		const test = fixture();
		const member = { role: 'worker' as const, chatResource: URI.parse('chat:/persistent-worker'), status: SessionStatus.Completed, enabled: true };
		const state = { supported: true, pending: false, selection: { workerModelId: 'worker' }, members: [member] };
		test.setState(state);
		test.popup.reopen();
		test.setResetConfirmation(true, () => test.setState({ ...state, members: [{ ...member, chatResource: URI.parse('chat:/replacement') }] }));
		const ready = Event.toPromise(test.shown.event);
		test.click('Reset Worker');
		await ready;
		const replacementErrors = test.errors.map(error => error instanceof Error ? error.message : error);
		test.setResetConfirmation(true, () => test.context.set(undefined, undefined));
		test.click('Reset Worker');
		await timeout(0);
		assert.deepStrictEqual({ resets: test.resets, replacementErrors }, { resets: [], replacementErrors: ['Teammate changed before reset'] });
	});

	test('helper pickers keep normal context controls and reset settings when changing models', async () => {
		const test = fixture();
		test.setState({ supported: true, pending: false, selection: { workerModelId: 'worker', workerModelConfiguration: { thinkingLevel: 'high' } } });
		test.popup.reopen();
		const rolePicker = await test.choose('Worker', 'scout');
		assert.deepStrictEqual({
			options: Object.keys(rolePicker.delegate.getModels()[0].metadata.configurationSchema?.properties ?? {}),
			selection: test.getState().selection,
			globalWrites: test.globalWrites,
		}, { options: ['thinkingLevel', 'contextSize'], selection: { workerModelId: 'scout', workerModelConfiguration: {} }, globalWrites: [] });
	});

	test('failed saving reports the error and retains the accepted team', async () => {
		const test = fixture();
		const selection = { workerModelId: 'worker' };
		test.setState({ supported: true, pending: false, selection });
		test.failSave();
		test.popup.reopen();
		await test.choose('Worker', 'scout');
		assert.deepStrictEqual({
			selection: test.getState().selection,
			errors: test.errors.map(error => error instanceof Error ? error.message : error),
		}, { selection, errors: ['Unable to save team'] });
	});

	test('a failed picker construction does not block the next attempt', async () => {
		const test = fixture();
		test.setState({ supported: true, pending: false, selection: { workerModelId: 'worker' } });
		test.popup.reopen();
		test.failOpen();
		test.click('Choose model for Worker:');
		await timeout(0);
		await test.choose('Worker', 'scout');
		assert.deepStrictEqual({
			worker: test.getState().selection?.workerModelId,
			errors: test.errors.map(error => error instanceof Error ? error.message : error),
		}, { worker: 'scout', errors: ['Unable to open model picker'] });
	});

	test('model and reasoning changes from one picker flow save in order', async () => {
		const test = fixture();
		test.setState({ supported: true, pending: false, selection: { workerModelId: 'worker', scoutModelId: 'scout' } });
		test.popup.reopen();
		const opening = Event.toPromise(test.opened.event);
		test.click('Choose model for Worker:');
		const rolePicker = await opening;
		rolePicker.choose('lead', false);
		await rolePicker.delegate.modelConfiguration?.setModelConfiguration('lead', { thinkingLevel: 'low' });
		rolePicker.close();
		await rolePicker.disposed.p;
		assert.deepStrictEqual({
			selection: test.getState().selection,
			writes: test.writes.map(write => write.team?.workerModelConfiguration),
			globalWrites: test.globalWrites,
		}, {
			selection: { workerModelId: 'lead', workerModelConfiguration: { thinkingLevel: 'low' }, scoutModelId: 'scout' },
			writes: [{}, { thinkingLevel: 'low' }],
			globalWrites: [],
		});
	});

	test('an obsolete remembered reasoning value requires a fresh explicit model choice', async () => {
		const test = fixture();
		test.setState({ supported: true, pending: false, rememberedSelection: { workerModelId: 'worker', workerModelConfiguration: { thinkingLevel: 'obsolete' } } });
		test.popup.reopen();
		const opening = Event.toPromise(test.opened.event);
		test.toggle();
		const rolePicker = await opening;
		const before = test.writes.length;
		const ready = Event.toPromise(test.shown.event);
		rolePicker.choose('worker');
		await ready;
		assert.deepStrictEqual({ before, selection: test.getState().selection, errors: test.errors }, {
			before: 0, selection: { workerModelId: 'worker', workerModelConfiguration: {} }, errors: [],
		});
	});

	test('restored and committed chat delegates retain the team presentation and cards', () => {
		const test = fixture();
		test.setState({ supported: true, pending: false, selection: { workerModelId: 'worker' } });
		test.popup.reopen();
		assert.deepStrictEqual({
			label: test.delegate.selectionPresentation?.get()?.label,
			roles: test.parent.querySelectorAll('.model-team-card').length,
			worker: test.parent.querySelectorAll('.model-team-model')[1].getAttribute('aria-label'),
		}, { label: 'lead + worker', roles: 2, worker: 'Choose model for Worker: worker' });
	});

	test('the canonical input model supplies the Lead while a committed session hydrates', async () => {
		const test = fixture();
		test.setState({ supported: true, pending: false, selection: { workerModelId: 'worker' }, leadModelConfiguration: { thinkingLevel: 'low' } });
		test.context.set({ sessionId: 'test:session', providerId: 'test', chatResource, modelId: undefined }, undefined);
		const label = test.picker.selectionPresentation.get()?.label;
		test.popup.reopen();
		await test.choose('Worker', 'scout');
		assert.deepStrictEqual({
			label,
			lead: test.writes[0]?.leadModelId,
			worker: test.getState().selection?.workerModelId,
			errors: test.errors,
		}, { label: 'lead + worker', lead: 'lead', worker: 'scout', errors: [] });
	});

	test('an open Lead card follows late canonical model hydration', () => {
		const test = fixture();
		test.setState({ supported: true, pending: false, selection: { workerModelId: 'worker' } });
		test.context.set({ sessionId: 'test:session', providerId: 'test', chatResource, modelId: undefined }, undefined);
		test.currentModel.set(undefined, undefined);
		test.popup.reopen();
		test.currentModel.set(lead, undefined);
		assert.deepStrictEqual({
			model: test.parent.querySelector('.model-team-model')?.getAttribute('aria-label'),
			reasoning: test.parent.querySelector('.model-team-reasoning')?.getAttribute('aria-label'),
			writes: test.writes,
		}, { model: 'Choose model for Lead: lead', reasoning: 'Lead reasoning: Medium', writes: [] });
	});

	test('choosing a normal model leaves the team before updating the chat input', async () => {
		const test = fixture();
		test.setState({ supported: true, pending: false, selection: { workerModelId: 'worker' } });
		const done = Event.toPromise(test.selected.event);
		test.delegate.setModel(scout);
		await done;
		assert.deepStrictEqual({ teams: test.writes.map(write => write.team), selections: test.selections }, { teams: [undefined], selections: ['scout'] });
	});

	test('a delayed model selection cannot change a different chat input', async () => {
		const test = fixture();
		const barrier = new DeferredPromise<void>();
		test.setBarrier(barrier);
		test.setState({ supported: true, pending: false, selection: { workerModelId: 'worker' } });
		test.delegate.setModel(scout);
		await timeout(0);
		test.context.set(undefined, undefined);
		barrier.complete();
		await timeout(0);
		assert.deepStrictEqual({ resources: test.writes.map(write => write.resource), selections: test.selections }, { resources: [chatResource], selections: [] });
	});

	test('configuration hydration disables the picker content without inventing a team', () => {
		const test = fixture();
		test.setState({ supported: true, loading: true, pending: false });
		assert.deepStrictEqual({ enabled: test.picker.canSelectModel.get(), content: test.picker.getAdditionalContent(), label: test.picker.selectionPresentation.get()?.label }, {
			enabled: false, content: undefined, label: 'Models',
		});
	});
});
