/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../../../base/common/async.js';
import { IStringDictionary } from '../../../../../../../../base/common/collections.js';
import { upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../../../base/test/common/virtualScheduling/runWithFakedTimers.js';
import { TestAccessibilityService } from '../../../../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { computeLocalModelConsentScope, deriveLocalModelReadiness, ILocalModelFamilyV1, ILocalModelStatusV1 } from '../../../../../../../../platform/agentHost/common/localModel.js';
import { NullOpenerService } from '../../../../../../../../platform/opener/test/common/nullOpenerService.js';
import { getLocalModelServerStopId } from '../../../../../../../services/agentHost/common/localModelService.js';
import { LocalModelEntryPath } from '../../../../../browser/agentSessions/agentHost/localModelSetupFlow.js';
import { LocalModelCard } from '../../../../../browser/widget/input/modelPicker/modelPickerLocalModelCard.js';
import { ILocalModelDetails, ILocalModelDirectModelConfig, ILocalModelPickerActionRequest } from '../../../../../browser/widget/input/modelPicker/modelPickerLocalModelItems.js';
import { IModelConfigPropertySchema, IModelConfigurationAccess } from '../../../../../browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../../common/languageModels.js';

const GB = 1024 ** 3;
const FAMILY_ID = 'example-flash-local';
/** The Use in Auto notes: what it does, then the agreed safety disclosure. */
const USE_IN_AUTO = 'Let Auto route turns to this on-device model, with cloud fallback.';
const DISCLOSURE = 'Local models may not use the same safety filters as GitHub Copilot-provided models and may be more susceptible to malicious instructions, especially when actions are automatically approved.';
const offer = { fit: 'full', requiredGpuBytes: 60 * GB, downloadBytes: 56.7 * GB, peakDiskBytes: 57.2 * GB, licenseName: 'MIT', licenseUrl: 'https://example.com/license' } as const;
const install = { contentId: 'c1', adopted: false, owned: true, modelId: 'vscode-on-device/Example-Flash' } as const;

function createFamily(overrides: Partial<ILocalModelFamilyV1> = {}): ILocalModelFamilyV1 {
	return { familyId: FAMILY_ID, capiId: FAMILY_ID, autoCapable: true, displayName: 'Example Flash 1.0', usage: { runningStreams: 0, boundDirectChats: 0, liveAutoRoutes: 0 }, consentGiven: false, ...overrides };
}

function createStatus(family: ILocalModelFamilyV1, overrides: Partial<ILocalModelStatusV1> = {}): ILocalModelStatusV1 {
	return {
		schemaVersion: 1,
		device: { capacityBytes: 64 * GB, confidence: 'measured' },
		runtime: {},
		catalog: { state: 'ready', registries: { azureml: 'ready' } },
		families: [family],
		useInAuto: true,
		...overrides,
	};
}

function active(overrides: Partial<NonNullable<ILocalModelStatusV1['active']>> = {}): NonNullable<ILocalModelStatusV1['active']> {
	return { familyId: FAMILY_ID, contentId: 'c1', servingGeneration: 1, server: 'ready', profile: 'full-gpu', autoEligible: true, ...overrides };
}

suite('LocalModelCard', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createCard(status: ILocalModelStatusV1, directModel?: ILocalModelDirectModelConfig, pendingStops?: ReadonlySet<string>, motionReduced = true) {
		const requests: ILocalModelPickerActionRequest[] = [];
		const consentLog: string[] = [];
		const detailsFor = (current: ILocalModelStatusV1, pending = pendingStops): ILocalModelDetails => {
			const family = current.families[0];
			return {
				status: current,
				family,
				readiness: deriveLocalModelReadiness(family, current)!,
				actions: {
					run: request => requests.push(request),
					logConsent: (step: string, entryPath: LocalModelEntryPath) => consentLog.push(`${step}:${entryPath}`),
				},
				directModel,
				pendingStops: pending,
			};
		};
		const accessibilityService = new class extends TestAccessibilityService {
			override isMotionReduced(): boolean { return motionReduced; }
		}();
		const card = store.add(new LocalModelCard(detailsFor(status), NullOpenerService, accessibilityService));
		const container = document.createElement('div');
		container.append(card.headerElement, card.element);
		document.body.appendChild(container);
		store.add({ dispose: () => container.remove() });
		const button = (label: string) => [...card.element.querySelectorAll<HTMLElement>('.monaco-button')].find(candidate => candidate.textContent === label)!;
		return {
			card, requests, consentLog, button,
			update: (next: ILocalModelStatusV1, pending?: ReadonlySet<string>) => card.update(detailsFor(next, pending)),
			/** The header icon named `label`. */
			headerAction: (label: string) => [...card.headerElement.querySelectorAll<HTMLElement>('.action-label')].find(action => action.getAttribute('aria-label') === label)!,
			/** The header icons as `name (icon)`, or `name (busy: icon)` while the in-progress indicator stands in for the icon; a disabled one in parentheses. */
			headerIcons: () => [...card.headerElement.querySelectorAll<HTMLElement>('.action-label')].map(action => {
				const icon = [...action.classList].find(name => name.startsWith('codicon-'))?.slice('codicon-'.length);
				const text = `${action.getAttribute('aria-label')} (${action.classList.contains('busy') ? `busy: ${icon}` : icon})`;
				return action.classList.contains('disabled') ? `(${text})` : text;
			}),
			/** The warning banner at the top of the page. */
			warning: () => card.element.firstElementChild?.classList.contains('chat-model-hover-warning-text') ? card.element.firstElementChild.textContent : undefined,
			/** The segmented choices of a setting, the chosen one marked. */
			choices: (title: string) => [...card.element.querySelectorAll<HTMLElement>(`[aria-label="${title}"] [role="radio"]`)].map(option => option.classList.contains('active') || option.getAttribute('aria-checked') === 'true' ? `[${option.textContent}]` : option.textContent),
			option: (title: string, label: string) => [...card.element.querySelectorAll<HTMLElement>(`[aria-label="${title}"] [role="radio"]`)].find(option => option.textContent === label)!,
			notes: () => [...card.element.querySelectorAll('.chat-local-model-card-note')].filter(note => !(note as HTMLElement).hidden).map(note => note.textContent),
			/** The page as a screen reader meets it: headings, text, and buttons (primary ones marked). */
			read: () => ({
				state: card.headerElement.querySelector('.chat-model-card-name')?.getAttribute('aria-description'),
				headings: [...container.querySelectorAll('[role="heading"]')].map(heading => `${heading.getAttribute('aria-level')}:${heading.textContent}`),
				text: [...card.element.querySelectorAll('.chat-local-model-card-text, .chat-local-model-card-message')].map(element => element.textContent),
				buttons: [...card.element.querySelectorAll<HTMLElement>('.monaco-button:not([role="radio"])')].map(element => element.classList.contains('secondary') ? element.textContent : `[${element.textContent}]`),
			}),
		};
	}

	test('a model to download shows its consent inline: the model only, never llama.cpp; Download agrees to exactly the family it showed', () => {
		const family = createFamily({ offer, entry: { modelFilesPresent: false } });
		const status = createStatus(family);
		const { card, requests, consentLog, button, read } = createCard(status);
		const page = read();
		button('Download').click();
		card.dispose();
		// Leaving it without agreeing is reported once.
		const left = createCard(status);
		left.card.dispose();
		assert.deepStrictEqual({ page, requests, consentLog, leftConsentLog: left.consentLog }, {
			page: {
				state: 'Not set up',
				headings: ['2:Example Flash 1.0', '3:Download'],
				text: [
					'Download size: 56.7 GB. Free space needed during setup: 57.2 GB.',
					'Source: Azure ML registry. License: MIT.',
					'Stored in ~/.copilot/azureml-models and shared with other Copilot apps.',
					'Loading Example Flash 1.0 needs llama.cpp, which VS Code doesn\'t install. You can get it while the model downloads.',
					'You can keep using Copilot while it downloads.',
					'View the MIT license',
				],
				buttons: ['[Download]'],
			},
			requests: [
				{ action: 'setUp', familyId: FAMILY_ID, readiness: 'requiresSetup', consent: { scope: computeLocalModelConsentScope({ family }) }, entryPath: 'modelOnly' },
			],
			consentLog: ['consentShown:modelOnly'],
			leftConsentLog: ['consentShown:modelOnly', 'consentCancelled:modelOnly'],
		});
	});

	test('an installed model that can\'t load without a usable llama.cpp gives directions: Get llama.cpp, Open Settings and Retry', () => {
		const message = 'Example Flash 1.0 needs llama.cpp to run. Install a llama.cpp build that supports it, then set Chat \u203a Copilot \u203a Local Model: Llama Server Path (chat.copilot.localModel.llamaServerPath) to its llama-server and select Retry.';
		const status = createStatus(createFamily({ install }), { active: active({ server: 'error', error: { code: 'runtimeNotFound', message, actions: ['getLlamaCpp', 'openSettings', 'retry'] } }) });
		const result = createCard(status);
		const page = result.read();
		result.button('Get llama.cpp').click();
		result.button('Open Settings').click();
		result.button('Retry').click();
		result.card.dispose();
		assert.deepStrictEqual({ text: page.text, buttons: page.buttons, requests: result.requests }, {
			text: [message],
			// Get llama.cpp leads: the other fixes need a build first.
			buttons: ['[Get llama.cpp]', 'Open Settings', 'Retry'],
			requests: [
				{ action: 'getLlamaCpp', familyId: FAMILY_ID, readiness: 'error' },
				{ action: 'openSettings', familyId: FAMILY_ID, readiness: 'error' },
				{ action: 'retry', familyId: FAMILY_ID, readiness: 'error', operationId: undefined },
			],
		});
	});

	test('progress updates in place and keeps focus; a change of state re-renders and keeps focus on the header icon, which follows the state', () => {
		const downloading = (completedBytes: number) => createStatus(createFamily({ offer, operation: { id: 'op1', kind: 'setup', state: 'running', resumeOnStartup: true, phase: 'downloading', completedBytes, totalBytes: 100 * GB, bytesPerSecond: GB / 4 } }));
		const result = createCard(downloading(42 * GB));
		const icon = result.headerAction('Downloading Example Flash 1.0 42%, Pause');
		icon.focus();
		const progress = () => {
			const bar = result.card.element.querySelector('[role="progressbar"]');
			return { value: bar?.getAttribute('aria-valuenow'), text: result.read().text[0], note: result.card.element.querySelector('.chat-local-model-card-note')?.textContent };
		};
		const before = { ...progress(), page: result.read(), icons: result.headerIcons() };
		result.update(downloading(80 * GB));
		const after = { ...progress(), icons: result.headerIcons(), focused: document.activeElement === icon };
		result.update(createStatus(createFamily({ install, offer }), { active: active({ server: 'starting' }) }));
		const loaded = { state: result.read().state, icons: result.headerIcons(), focused: document.activeElement === icon };
		result.card.dispose();
		assert.deepStrictEqual({ before, after, loaded }, {
			before: {
				value: '42',
				text: 'Downloading: 42.0 GB of 100.0 GB',
				note: 'About 4 min remaining',
				page: {
					state: 'Downloading 42%',
					headings: ['2:Example Flash 1.0', '3:Status'],
					text: ['Downloading: 42.0 GB of 100.0 GB'],
					buttons: [],
				},
				icons: ['Downloading Example Flash 1.0 42%, Pause (busy: debug-pause)'],
			},
			after: { value: '80', text: 'Downloading: 80.0 GB of 100.0 GB', note: 'About 1 min remaining', icons: ['Downloading Example Flash 1.0 80%, Pause (busy: debug-pause)'], focused: true },
			loaded: { state: 'Loading model…', icons: ['Loading Example Flash 1.0, Cancel (busy: stop-circle)', 'Remove Example Flash 1.0... (trash)'], focused: true },
		});
	});

	test('a ready model offers Use in Auto, and Stop, Update and Remove as header icons rather than a Manage section', () => {
		const status = createStatus(createFamily({ install: { ...install, update: { contentId: 'c2', downloadBytes: 2 * GB } }, offer }), { active: active({ profile: 'near-fit' }), useInAuto: false });
		const result = createCard(status);
		const page = result.read();
		const icons = result.headerIcons();
		const toggle = result.card.element.querySelector<HTMLElement>('[role="switch"]')!;
		const autoSwitch = { label: toggle.getAttribute('aria-label'), checked: toggle.getAttribute('aria-checked'), description: toggle.getAttribute('aria-describedby')!.split(' ').map(id => document.getElementById(id)?.textContent) };
		toggle.click();
		result.headerAction('Update Example Flash 1.0 (2.0 GB)').click();
		result.headerAction('Stop Example Flash 1.0').click();
		result.card.dispose();
		assert.deepStrictEqual({ page, icons, autoSwitch, requests: result.requests.map(request => [request.action, request.value]) }, {
			page: {
				state: 'Ready',
				headings: ['2:Example Flash 1.0'],
				text: [],
				buttons: [],
			},
			icons: ['Stop Example Flash 1.0 (stop-circle)', 'Update Example Flash 1.0 (2.0 GB) (cloud-download)', 'Remove Example Flash 1.0... (trash)'],
			autoSwitch: { label: 'Use in Auto', checked: 'false', description: [USE_IN_AUTO, DISCLOSURE] },
			requests: [['toggleAuto', true], ['update', undefined], ['stop', undefined]],
		});
	});

	const MiB = 1024 ** 2;
	const exampleFlashContext = { tokens: 131072, options: [{ tokens: 65536, gpuBytes: 57242 * MiB }, { tokens: 131072, gpuBytes: 59034 * MiB }, { tokens: 262144, gpuBytes: 62618 * MiB }] };

	/** The family's direct model with a thinking level, and the chat's in-memory configuration of it. */
	function createDirectModel(thinkingLevel: IModelConfigPropertySchema) {
		const values = new Map<string, IStringDictionary<unknown>>();
		const changes: string[] = [];
		const model: ILanguageModelChatMetadataAndIdentifier = {
			identifier: 'agent-host-copilot:vscode-on-device/Example-Flash',
			metadata: upcastPartial<ILanguageModelChatMetadata>({ id: 'vscode-on-device/Example-Flash', name: 'Example Flash 1.0', configurationSchema: { properties: { thinkingLevel } } }),
		};
		const configurationAccess: IModelConfigurationAccess = {
			getModelConfiguration: modelId => values.get(modelId),
			setModelConfiguration: async (modelId, next) => { values.set(modelId, { ...values.get(modelId), ...next }); },
			getModelConfigurationActions: () => [],
		};
		const directModel: ILocalModelDirectModelConfig = { model, configurationAccess, onDidChangeConfiguration: (group, key, from, to) => changes.push(`${group}:${key}:${from}->${to}`) };
		return { directModel, values, changes };
	}

	test('an installed model\'s context sizes state their GPU memory; choosing one for the loaded model asks the host to reload it', () => {
		const loaded = createCard(createStatus(createFamily({ install, offer, context: exampleFlashContext }), { active: active() }));
		const page = { ...loaded.read(), context: loaded.choices('Context'), labels: [...loaded.card.element.querySelectorAll('[aria-label="Context"] [role="radio"]')].map(option => option.getAttribute('aria-label')), notes: loaded.notes() };
		loaded.option('Context', '256K').click();
		loaded.option('Context', '128K').click();
		const notLoaded = createCard(createStatus(createFamily({ install, offer, context: { ...exampleFlashContext, tokens: 65536 } }), { active: active({ familyId: 'other' }) }));
		assert.deepStrictEqual({ page, requests: loaded.requests, notLoaded: { context: notLoaded.choices('Context'), notes: notLoaded.notes() } }, {
			page: {
				state: 'Ready',
				headings: ['2:Example Flash 1.0', '3:Context'],
				text: [],
				buttons: [],
				context: ['64K', '[128K]', '256K'],
				labels: ['64K, About 55.9 GB of GPU memory', '128K, About 57.7 GB of GPU memory', '256K, About 61.2 GB of GPU memory'],
				notes: ['128K uses about 57.7 GB of GPU memory.', 'Changing it reloads the model. Running responses finish first.', USE_IN_AUTO, DISCLOSURE],
			},
			requests: [
				{ action: 'setContextSize', familyId: FAMILY_ID, readiness: 'ready', contextTokens: 262144 },
				{ action: 'setContextSize', familyId: FAMILY_ID, readiness: 'ready', contextTokens: 131072 },
			],
			notLoaded: {
				context: ['[64K]', '128K', '256K'],
				notes: ['64K uses about 55.9 GB of GPU memory.', 'A change applies the next time the model loads.', USE_IN_AUTO, DISCLOSURE],
			},
		});
	});

	test('when the loaded model serves with another context size than selected, the page keeps the selection and says why, in the choices\' description', () => {
		const selected256 = { ...exampleFlashContext, tokens: 262144 };
		const read = (result: ReturnType<typeof createCard>) => ({
			context: result.choices('Context'),
			notes: result.notes().slice(0, 3),
			described: result.card.element.querySelector('[aria-label="Context"]')?.getAttribute('aria-describedby')?.split(' ').map(id => document.getElementById(id)?.textContent),
		});
		const reduced = read(createCard(createStatus(createFamily({ install, offer, context: selected256 }), { active: active({ contextTokens: 131072 }) })));
		const reloading = read(createCard(createStatus(createFamily({ install, offer, context: selected256, operation: { id: 'op1', kind: 'swap', state: 'running', resumeOnStartup: false, phase: 'draining' } }), { active: active({ contextTokens: 131072, drain: { runningStreams: 1 } }) })));
		const serving = read(createCard(createStatus(createFamily({ install, offer, context: selected256 }), { active: active({ contextTokens: 262144 }) })));
		assert.deepStrictEqual({ reduced, reloading, serving }, {
			reduced: {
				context: ['64K', '128K', '[256K]'],
				notes: ['Running with 128K: not enough GPU memory for 256K right now.', '256K uses about 61.2 GB of GPU memory.', 'Changing it reloads the model. Running responses finish first.'],
				described: ['Running with 128K: not enough GPU memory for 256K right now.', '256K uses about 61.2 GB of GPU memory.', 'Changing it reloads the model. Running responses finish first.'],
			},
			reloading: {
				context: ['64K', '128K', '[256K]'],
				notes: ['Running with 128K until it reloads with 256K.', '256K uses about 61.2 GB of GPU memory.', 'Changing it reloads the model. Running responses finish first.'],
				described: ['Running with 128K until it reloads with 256K.', '256K uses about 61.2 GB of GPU memory.', 'Changing it reloads the model. Running responses finish first.'],
			},
			serving: {
				context: ['64K', '128K', '[256K]'],
				notes: ['256K uses about 61.2 GB of GPU memory.', 'Changing it reloads the model. Running responses finish first.', USE_IN_AUTO],
				described: ['256K uses about 61.2 GB of GPU memory.', 'Changing it reloads the model. Running responses finish first.'],
			},
		});
	});

	test('the first header icon shows the state: Load, Resume, Stop, or the in-progress indicator, which turns into the step\'s stop action; none while it needs setting up or failed', () => {
		const update = { contentId: 'c2', downloadBytes: 2 * GB };
		const running = { state: 'running', resumeOnStartup: true } as const;
		const other = createFamily({ familyId: 'other', capiId: 'other', displayName: 'Other', install: { ...install, contentId: 'o1', modelId: 'vscode-on-device/Other' } });
		const otherActive = active({ familyId: 'other', contentId: 'o1' });
		const card = (family: ILocalModelFamilyV1, activeModel?: NonNullable<ILocalModelStatusV1['active']>, pendingStops?: ReadonlySet<string>) => createCard(createStatus(family, { families: [family, other], active: activeModel }), undefined, pendingStops);
		const pages = {
			needsSetup: card(createFamily({ offer })),
			downloading: card(createFamily({ offer, operation: { ...running, id: 'op1', kind: 'setup', phase: 'downloading', completedBytes: 41, totalBytes: 100 } })),
			pausePending: card(createFamily({ offer, operation: { ...running, id: 'op1', kind: 'setup', phase: 'downloading', completedBytes: 41, totalBytes: 100 } }), undefined, new Set(['op1'])),
			verifying: card(createFamily({ offer, operation: { ...running, id: 'op1', kind: 'setup', phase: 'verifying' } })),
			paused: card(createFamily({ offer, operation: { id: 'op1', kind: 'setup', state: 'paused', pausedReason: 'user', resumeOnStartup: false, phase: 'downloading', completedBytes: 41, totalBytes: 100 } })),
			consentChanged: card(createFamily({ offer, operation: { id: 'op1', kind: 'setup', state: 'paused', pausedReason: 'consentChanged', resumeOnStartup: false } })),
			failed: card(createFamily({ offer, operation: { id: 'op1', kind: 'setup', state: 'error', resumeOnStartup: false, error: { code: 'network', message: 'The download was interrupted.', actions: ['retry'] } } })),
			notLoaded: card(createFamily({ install: { ...install, update }, offer }), otherActive),
			stopped: card(createFamily({ install, offer }), active({ server: 'stopped' })),
			loading: card(createFamily({ install, offer }), active({ server: 'starting', load: { step: 'loading', startedAt: 0 } })),
			cancelPending: card(createFamily({ install, offer }), active({ server: 'starting', load: { step: 'loading', startedAt: 0 } }), new Set([getLocalModelServerStopId(FAMILY_ID)])),
			warmingUp: card(createFamily({ install, offer }), active({ server: 'starting', load: { step: 'warmingUp', startedAt: 0 } })),
			retrying: card(createFamily({ install, offer }), active({ server: 'starting', load: { step: 'loading', startedAt: 0, retry: 'withoutSpeculativeDecoding' } })),
			ready: card(createFamily({ install, offer }), active()),
			stopPending: card(createFamily({ install, offer }), active(), new Set([getLocalModelServerStopId(FAMILY_ID)])),
			stopping: card(createFamily({ install, offer }), active({ server: 'stopping' })),
			serverFailed: card(createFamily({ install, offer }), active({ server: 'error', error: { code: 'crashed', message: 'It stopped.', actions: ['retry'] } })),
			waitingForResponses: card(createFamily({ install, offer, operation: { ...running, id: 'swap', kind: 'swap', phase: 'draining' } }), active({ familyId: 'other', contentId: 'o1', server: 'stopping', swapTo: FAMILY_ID, drain: { runningStreams: 2 } })),
			swappingIn: card(createFamily({ install, offer, operation: { ...running, id: 'swap', kind: 'swap', phase: 'loading' } }), active({ server: 'starting', load: { step: 'loading', startedAt: 0 } })),
			reloading: card(createFamily({ install, offer, operation: { ...running, id: 'reload', kind: 'swap', phase: 'loading' } }), active({ server: 'starting', swapTo: FAMILY_ID, load: { step: 'loading', startedAt: 0 } })),
			updating: card(createFamily({ install: { ...install, update }, offer, operation: { ...running, id: 'op1', kind: 'update', phase: 'downloading' } }), active()),
			removing: card(createFamily({ install, offer, operation: { id: 'op1', kind: 'remove', state: 'running', resumeOnStartup: false } }), otherActive),
		};
		const icons = Object.fromEntries(Object.entries(pages).map(([name, page]) => [name, page.headerIcons()]));
		const click = (page: ReturnType<typeof createCard>, label: string) => {
			page.headerAction(label).click();
			return page.requests.map(request => [request.action, request.operationId]);
		};
		const remove = 'Remove Example Flash 1.0... (trash)';
		assert.deepStrictEqual({
			icons,
			requests: {
				downloading: click(pages.downloading, 'Downloading Example Flash 1.0 41%, Pause'),
				pausePending: click(pages.pausePending, 'Downloading Example Flash 1.0 41%, Pausing…'),
				paused: click(pages.paused, 'Resume Example Flash 1.0'),
				notLoaded: click(pages.notLoaded, 'Load Example Flash 1.0'),
				stopped: click(pages.stopped, 'Load Example Flash 1.0'),
				loading: click(pages.loading, 'Loading Example Flash 1.0, Cancel'),
				ready: click(pages.ready, 'Stop Example Flash 1.0'),
				waitingForResponses: click(pages.waitingForResponses, 'Waiting for 2 responses to finish, Cancel'),
				swappingIn: click(pages.swappingIn, 'Loading Example Flash 1.0, Cancel'),
			},
			page: pages.ready.read(),
		}, {
			icons: {
				needsSetup: [],
				downloading: ['Downloading Example Flash 1.0 41%, Pause (busy: debug-pause)'],
				pausePending: ['(Downloading Example Flash 1.0 41%, Pausing… (busy: debug-pause))'],
				verifying: ['Verifying Example Flash 1.0, Pause (busy: debug-pause)'],
				paused: ['Resume Example Flash 1.0 (play-circle)', remove],
				consentChanged: [remove],
				failed: [],
				notLoaded: ['Load Example Flash 1.0 (play-circle)', 'Update Example Flash 1.0 (2.0 GB) (cloud-download)', remove],
				stopped: ['Load Example Flash 1.0 (play-circle)', remove],
				loading: ['Loading Example Flash 1.0, Cancel (busy: stop-circle)', remove],
				cancelPending: ['(Loading Example Flash 1.0, Cancelling… (busy: stop-circle))', remove],
				warmingUp: ['Warming up Example Flash 1.0, Cancel (busy: stop-circle)', remove],
				retrying: ['Retrying Example Flash 1.0 without speculative decoding, Cancel (busy: stop-circle)', remove],
				ready: ['Stop Example Flash 1.0 (stop-circle)', remove],
				stopPending: ['(Stopping Example Flash 1.0 (busy: stop-circle))', remove],
				stopping: ['(Stopping Example Flash 1.0 (busy: stop-circle))', remove],
				serverFailed: [remove],
				waitingForResponses: ['Waiting for 2 responses to finish, Cancel (busy: stop-circle)', remove],
				swappingIn: ['Loading Example Flash 1.0, Cancel (busy: stop-circle)', remove],
				reloading: ['Reloading Example Flash 1.0, Cancel (busy: stop-circle)', remove],
				updating: ['Downloading Example Flash 1.0, Pause (busy: debug-pause)', remove],
				removing: ['(Removing Example Flash 1.0 (busy: stop-circle))'],
			},
			requests: {
				downloading: [['cancel', 'op1']],
				pausePending: [],
				paused: [['resume', 'op1']],
				notLoaded: [['makeActive', undefined]],
				stopped: [['start', undefined]],
				loading: [['stop', undefined]],
				ready: [['stop', undefined]],
				waitingForResponses: [['cancel', 'swap']],
				swappingIn: [['cancel', 'swap']],
			},
			// No state badge: the heading gives the state to screen readers.
			page: { state: 'Ready', headings: ['2:Example Flash 1.0'], text: [], buttons: [] },
		});
	});

	test('the in-progress indicator is the session spinner, or the in-progress icon with reduced motion, and keeps running through updates', () => {
		const loading = (load: NonNullable<NonNullable<ILocalModelStatusV1['active']>['load']>) => createStatus(createFamily({ install, offer }), { active: active({ server: 'starting', load }) });
		const animated = createCard(loading({ step: 'loading', startedAt: 0 }), undefined, undefined, false);
		const indicator = () => animated.card.headerElement.querySelector('.chat-local-model-card-busy');
		const spinner = indicator()?.querySelector('.monaco-pixel-spinner');
		animated.update(loading({ step: 'warmingUp', startedAt: 0 }));
		const sameAfterStep = indicator()?.querySelector('.monaco-pixel-spinner') === spinner;
		animated.update(createStatus(createFamily({ install, offer }), { active: active() }));
		const afterReady = indicator();
		const reduced = createCard(loading({ step: 'loading', startedAt: 0 }));
		assert.deepStrictEqual({
			spinner: !!spinner,
			sameAfterStep,
			afterReady: afterReady ?? null,
			reduced: reduced.card.headerElement.querySelector('.chat-local-model-card-busy .codicon')?.className,
		}, {
			spinner: true,
			sameAfterStep: true,
			afterReady: null,
			reduced: 'codicon codicon-session-in-progress',
		});
	});

	test('a warning at the top says when the device can\'t hold the model at its context size, suggesting a smaller one only when one fits', () => {
		const qwenContext = { tokens: 262144, options: [{ tokens: 65536, gpuBytes: 6917 * MiB }, { tokens: 131072, gpuBytes: 8729 * MiB }, { tokens: 262144, gpuBytes: 12825 * MiB }] };
		const warn = (capacityBytes: number) => createCard(createStatus(createFamily({ install, offer, context: qwenContext, memoryWarning: { requiredBytes: 12825 * MiB, capacityBytes } }))).warning();
		assert.deepStrictEqual({
			smallerFits: warn(8 * GB),
			noneFits: warn(6 * GB),
			none: createCard(createStatus(createFamily({ install, offer, context: qwenContext }))).warning(),
		}, {
			smallerFits: 'Example Flash 1.0 needs about 12.5 GB of GPU memory at 256K. This device has about 8.0 GB. Choose a smaller context.',
			noneFits: 'Example Flash 1.0 needs about 12.5 GB of GPU memory at 256K. This device has about 6.0 GB.',
			none: undefined,
		});
	});

	test('a load shows its step and, estimated from the last comparable load, a bar and a time remaining that counts down a second at a time, then reads as almost done while the bar holds at 95%', () => runWithFakedTimers({}, async () => {
		const loading = (load: NonNullable<ILocalModelStatusV1['active']>['load']) => createStatus(createFamily({ install, offer }), { active: active({ server: 'starting', load }) });
		const auto = [USE_IN_AUTO, DISCLOSURE];
		const progress = (result: ReturnType<typeof createCard>) => {
			const bar = result.card.element.querySelector('[role="progressbar"]');
			return { state: result.read().state, text: result.read().text[0], value: bar?.getAttribute('aria-valuenow') ?? null, notes: result.notes() };
		};
		// 25.5 s into a load whose last comparable one took 30 s.
		const start = Date.now();
		const estimated = createCard(loading({ step: 'loading', startedAt: start - 25_500, expectedMs: 30_000 }));
		const initial = progress(estimated);
		// Sampled every 100 ms: the time remaining moves one second at a time, at the whole seconds of it, then stays.
		const changes: string[] = [];
		const sample = () => {
			const { notes, value } = progress(estimated);
			const line = `${notes[0]} (${value}%)`;
			if (changes.at(-1)?.endsWith(line) !== true) {
				changes.push(`${Date.now() - start} ms: ${line}`);
			}
		};
		sample();
		await timeout(50);
		for (let i = 0; i < 60; i++) {
			sample();
			await timeout(100);
		}
		estimated.update(loading({ step: 'warmingUp', startedAt: Date.now() - 45_000, expectedMs: 30_000 }));
		const warmingUp = progress(estimated);
		const firstLoad = createCard(loading({ step: 'loading', startedAt: Date.now() }));
		const indeterminate = progress(firstLoad);
		estimated.card.dispose();
		firstLoad.card.dispose();
		assert.deepStrictEqual({ initial, changes, warmingUp, indeterminate }, {
			initial: { state: 'Loading model…', text: 'Loading model…', value: '85', notes: ['About 5 s remaining', ...auto] },
			changes: [
				'0 ms: About 5 s remaining (85%)',
				'550 ms: About 4 s remaining (86%)',
				'1550 ms: About 3 s remaining (90%)',
				'2550 ms: About 2 s remaining (93%)',
				'3550 ms: About 1 s remaining (95%)',
				'4550 ms: Almost done… (95%)',
			],
			warmingUp: { state: 'Warming up…', text: 'Warming up…', value: '95', notes: ['Almost done…', ...auto] },
			indeterminate: { state: 'Loading model…', text: 'Loading model…', value: null, notes: auto },
		});
	}));
	test('a load retried without speculative decoding says so and why in Status through both of its steps, with a short state and the load\'s progress', () => runWithFakedTimers({}, async () => {
		const retrying = (step: 'loading' | 'warmingUp', expectedMs?: number) => createStatus(createFamily({ install, offer }), { active: active({ server: 'starting', load: { step, startedAt: Date.now() - 5_000, expectedMs, retry: 'withoutSpeculativeDecoding' } }) });
		const view = (result: ReturnType<typeof createCard>) => ({ state: result.read().state, text: result.read().text, value: result.card.element.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') ?? null, notes: result.notes() });
		const result = createCard(retrying('loading'));
		const loading = view(result);
		result.update(retrying('warmingUp'));
		const warmingUp = view(result);
		const withEstimate = createCard(retrying('loading', 20_000));
		const estimated = view(withEstimate);
		result.card.dispose();
		withEstimate.card.dispose();
		const reason = 'This llama.cpp build crashed with speculative decoding, so Example Flash 1.0 loads without it.';
		const auto = [USE_IN_AUTO, DISCLOSURE];
		assert.deepStrictEqual({ loading, warmingUp, estimated }, {
			loading: { state: 'Retrying…', text: ['Retrying without speculative decoding…'], value: null, notes: [reason, ...auto] },
			warmingUp: { state: 'Retrying…', text: ['Retrying without speculative decoding…'], value: null, notes: [reason, ...auto] },
			estimated: { state: 'Retrying…', text: ['Retrying without speculative decoding…'], value: '25', notes: ['About 15 s remaining', reason, ...auto] },
		});
	}));

	test('a Pause or Stop that was sent reads as in progress at once on its header icon, which can\'t be chosen again until the status changes; focus stays on the icon as it follows the state', () => {
		const run = (label: string, pendingId: string, initial: ILocalModelStatusV1, steps: readonly ILocalModelStatusV1[]) => {
			const result = createCard(initial);
			const icon = result.headerAction(label);
			icon.focus();
			icon.click();
			result.update(initial, new Set([pendingId]));
			const states = [result.headerIcons()];
			for (const step of steps) {
				result.update(step);
				states.push(result.headerIcons());
			}
			return { requests: result.requests.map(request => [request.action, request.operationId]), states, focused: document.activeElement === icon, buttons: result.read().buttons };
		};
		const operation = { id: 'op1', kind: 'setup', state: 'running', resumeOnStartup: true, phase: 'downloading', completedBytes: 10, totalBytes: 100 } as const;
		const loaded = (server: 'ready' | 'stopping' | 'stopped') => createStatus(createFamily({ install, offer }), { active: active({ server }) });
		const remove = 'Remove Example Flash 1.0... (trash)';
		assert.deepStrictEqual({
			pause: run('Downloading Example Flash 1.0 10%, Pause', 'op1', createStatus(createFamily({ offer, operation })), [createStatus(createFamily({ offer, operation: { ...operation, state: 'paused', pausedReason: 'user' } }))]),
			stop: run('Stop Example Flash 1.0', getLocalModelServerStopId(FAMILY_ID), loaded('ready'), [loaded('stopping'), loaded('stopped')]),
		}, {
			pause: {
				requests: [['cancel', 'op1']],
				// The header icon resumes it: the Status section has no duplicate button.
				states: [['(Downloading Example Flash 1.0 10%, Pausing… (busy: debug-pause))'], ['Resume Example Flash 1.0 (play-circle)', remove]],
				focused: true,
				buttons: [],
			},
			stop: {
				requests: [['stop', undefined]],
				states: [['(Stopping Example Flash 1.0 (busy: stop-circle))', remove], ['(Stopping Example Flash 1.0 (busy: stop-circle))', remove], ['Load Example Flash 1.0 (play-circle)', remove]],
				focused: true,
				buttons: [],
			},
		});
	});

	test('during a swap from another model, the incoming model\'s header icon offers Cancel, which keeps the outgoing model and shows at once as in progress', () => {
		const incoming = createFamily({ install, operation: { id: 'swap', kind: 'swap', state: 'running', resumeOnStartup: false, phase: 'draining' } });
		const outgoing = createFamily({ familyId: 'other', capiId: 'other', displayName: 'Other', install: { ...install, contentId: 'o1', modelId: 'vscode-on-device/Other' } });
		// The active model stays the outgoing one until its responses finish.
		const status = createStatus(incoming, { families: [incoming, outgoing], active: active({ familyId: 'other', contentId: 'o1', server: 'stopping', swapTo: FAMILY_ID, drain: { runningStreams: 1 } }) });
		const result = createCard(status);
		const before = result.headerIcons();
		result.headerAction('Waiting for 1 response to finish, Cancel').click();
		result.update(status, new Set(['swap']));
		assert.deepStrictEqual({ before, requests: result.requests.map(request => request.action), pending: result.headerIcons(), buttons: result.read().buttons }, {
			before: ['Waiting for 1 response to finish, Cancel (busy: stop-circle)', 'Remove Example Flash 1.0... (trash)'],
			requests: ['cancel'],
			pending: ['(Waiting for 1 response to finish, Cancelling… (busy: stop-circle))', 'Remove Example Flash 1.0... (trash)'],
			buttons: [],
		});
	});

	test('the thinking level is the chat\'s setting of the direct model: choosing one saves it, reports it and keeps focus on it', async () => {
		const effort = createDirectModel({ type: 'string', group: 'navigation', enum: ['low', 'medium', 'high'], enumItemLabels: ['Low', 'Medium', 'High'], default: 'medium' });
		const result = createCard(createStatus(createFamily({ install, offer, context: exampleFlashContext }), { active: active() }), effort.directModel);
		result.card.element.classList.add('monaco-reduce-motion');
		const before = { headings: result.read().headings, thinking: result.choices('Effort Level') };
		const high = result.option('Effort Level', 'High');
		high.focus();
		high.click();
		await timeout(0);
		const after = { thinking: result.choices('Effort Level'), focused: document.activeElement?.textContent, requests: result.requests };
		const toggle = createDirectModel({ type: 'string', group: 'navigation', enum: ['none', 'medium'], enumItemLabels: ['Off', 'On'], default: 'medium' });
		const qwen = createCard(createStatus(createFamily({ install, offer }), { active: active({ familyId: 'other' }) }), toggle.directModel);
		const notInstalled = createCard(createStatus(createFamily({ offer })), effort.directModel);
		assert.deepStrictEqual({
			before, after,
			saved: Object.fromEntries(effort.values),
			changes: effort.changes,
			qwen: qwen.choices('Effort Level'),
			notInstalled: notInstalled.read().headings,
		}, {
			before: { headings: ['2:Example Flash 1.0', '3:Effort Level', '3:Context'], thinking: ['Low', '[Medium]', 'High'] },
			after: { thinking: ['Low', 'Medium', '[High]'], focused: 'High', requests: [] },
			saved: { [effort.directModel.model.identifier]: { thinkingLevel: 'high' } },
			changes: ['navigation:thinkingLevel:medium->high'],
			qwen: ['Off', '[On]'],
			notInstalled: ['2:Example Flash 1.0', '3:Download'],
		});
	});
});
