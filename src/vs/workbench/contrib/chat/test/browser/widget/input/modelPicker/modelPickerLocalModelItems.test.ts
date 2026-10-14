/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IStringDictionary } from '../../../../../../../../base/common/collections.js';
import { Emitter } from '../../../../../../../../base/common/event.js';
import { constObservable, IObservable, ISettableObservable, observableValue } from '../../../../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { ActionListItemKind, IActionListItem } from '../../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetDropdownAction } from '../../../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IAgentConnection, IAgentHostService } from '../../../../../../../../platform/agentHost/common/agentService.js';
import { ILocalModelConsent, ILocalModelFamilyV1, ILocalModelStatusV1, LocalModelEnabledSettingId } from '../../../../../../../../platform/agentHost/common/localModel.js';
import { ICommandService } from '../../../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../../../../platform/product/common/productService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUpdateService, StateType } from '../../../../../../../../platform/update/common/update.js';
import { IUriIdentityService } from '../../../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../../../platform/workspace/common/workspaceTrust.js';
import { getLocalModelStopNowId, ILocalModelService } from '../../../../../../../services/agentHost/common/localModelService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../../../services/chat/common/chatEntitlementService.js';
import { TestChatEntitlementService, TestWorkspaceTrustManagementService } from '../../../../../../../test/common/workbenchTestServices.js';
import { ITerminalService } from '../../../../../../terminal/browser/terminal.js';
import { buildLocalModelPickerItems, formatLocalModelContextTokens, getLocalModelDirectModelPresentation, getLocalModelRunningAction, getLocalModelStateLabel, ILocalModelPickerHost, matchesLocalModelRowId, ModelPickerLocalModels } from '../../../../../browser/widget/input/modelPicker/modelPickerLocalModelItems.js';
import { IModelConfigPropertySchema, IModelConfigurationAccess } from '../../../../../browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { ITabbedModelPickerContext, TabbedModelPicker } from '../../../../../browser/widget/input/modelPicker/modelPickerTabbedWidget.js';
import { ModelPickerWidget } from '../../../../../browser/widget/input/modelPicker/modelPickerWidget.js';
import { SessionType } from '../../../../../common/chatSessionsService.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../common/languageModels.js';
import { NullLanguageModelsService } from '../../../../common/languageModels.js';

const GB = 1024 ** 3;
/** Direct rows are published as `vscode-on-device/<alias>`, and installs name that same row id. */
const MODEL_ID = 'vscode-on-device/MAI-Code-1.1-Flash';
const OTHER_MODEL_ID = 'vscode-on-device/Qwen-Coder';
const FAMILY_ID = 'mai-code-1.1-flash-local';

function createFamily(overrides: Partial<ILocalModelFamilyV1> = {}): ILocalModelFamilyV1 {
	return {
		familyId: FAMILY_ID,
		capiId: FAMILY_ID,
		autoCapable: true,
		displayName: 'Example Flash 1.0',
		usage: { runningStreams: 0, boundDirectChats: 0, liveAutoRoutes: 0 },
		consentGiven: false,
		...overrides,
	};
}

const offer = { fit: 'full', requiredGpuBytes: 60 * GB, downloadBytes: 56.7 * GB, peakDiskBytes: 60 * GB, licenseName: 'MIT', licenseUrl: 'https://example.com/license' } as const;
const install = { contentId: 'c1', adopted: false, owned: true, modelId: MODEL_ID } as const;
const otherFamily = createFamily({ familyId: 'qwen-coder-local', capiId: 'qwen-coder-local', displayName: 'Qwen Coder', install: { ...install, contentId: 'q1', modelId: OTHER_MODEL_ID }, usage: { runningStreams: 0, boundDirectChats: 2, liveAutoRoutes: 0 } });

function createStatus(families: readonly ILocalModelFamilyV1[], active?: ILocalModelStatusV1['active'], overrides: Partial<ILocalModelStatusV1> = {}): ILocalModelStatusV1 {
	return {
		schemaVersion: 1,
		device: { capacityBytes: 102 * GB, confidence: 'measured' },
		runtime: { version: 'b11459' },
		catalog: { state: 'ready', registries: { azureml: 'ready' } },
		families,
		active,
		useInAuto: true,
		...overrides,
	};
}

function activeFor(familyId: string, overrides: Partial<NonNullable<ILocalModelStatusV1['active']>> = {}): NonNullable<ILocalModelStatusV1['active']> {
	return { familyId, contentId: 'c1', servingGeneration: 1, server: 'ready', profile: 'full-gpu', autoEligible: true, ...overrides };
}

/** A compact, comparable view of the built rows. */
function summarize(items: readonly IActionListItem<IActionWidgetDropdownAction>[]) {
	return items.map(item => item.kind === ActionListItemKind.Separator ? { separator: item.label } : {
		id: item.item?.id,
		label: item.label,
		state: item.detail ?? (typeof item.description === 'string' ? item.description : item.description?.value),
		ariaDescription: item.ariaDescription,
		icon: item.group?.icon?.id,
		...(item.badge ? { badge: item.badge } : {}),
		...(item.item?.checked ? { checked: true } : {}),
		...(item.disabled ? { disabled: true } : {}),
		...(item.className?.split(' ').includes('chat-model-picker-local-model-unavailable') ? { unavailable: true } : {}),
		...(item.toolbarActions ? { toolbar: item.toolbarActions.map(action => action.enabled ? action.label : `(${action.label})`) } : {}),
		...(item.hover || item.submenuActions || item.inlineToggle ? { extra: true } : {}),
	});
}

interface IExpectedRow {
	readonly id?: string;
	readonly label?: string;
	/** What the row says besides its state, read after it. */
	readonly notes?: readonly string[];
	/** The label of the Details button. */
	readonly details?: string;
	/** The badge after the name, e.g. Active. */
	readonly badge?: string;
	/** A family that isn't downloaded (or set up): read first, and its row can't be selected. */
	readonly unavailable?: 'Not downloaded' | 'Not set up';
}

/**
 * The expected summary of a family row: no text besides its name and badge,
 * its state read out with its notes, its icon (the check of the selected
 * model, or none), and only its Details button, which a family that isn't
 * downloaded labels Download, with its progress, or Paused.
 */
function expectedRow(state: string | undefined, icon: 'blank' | 'check', { id = `localModel:${FAMILY_ID}`, label = 'Example Flash 1.0', notes = [], details = 'Details', badge, unavailable }: IExpectedRow = {}) {
	const ariaDescription = [...unavailable ? [unavailable] : [], ...state ? [state] : [], ...notes].join(', ');
	return { id, label, state: undefined, ariaDescription: ariaDescription || undefined, icon, ...(badge ? { badge } : {}), ...(unavailable ? { unavailable: true } : {}), toolbar: [details] };
}

function rowsFor(status: ILocalModelStatusV1) {
	return summarize(buildLocalModelPickerItems(status));
}

function createAgentHostModel(id: string, name: string, thinkingLevel?: IModelConfigPropertySchema): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: `${SessionType.AgentHostCopilot}:${id}`,
		metadata: upcastPartial<ILanguageModelChatMetadata>({
			id,
			name,
			vendor: SessionType.AgentHostCopilot,
			family: id,
			version: '1.0',
			maxInputTokens: 100000,
			maxOutputTokens: 8000,
			isDefaultForLocation: {},
			targetChatSessionType: SessionType.AgentHostCopilot,
			configurationSchema: thinkingLevel && { properties: { thinkingLevel } },
		}),
	};
}

/** Example Flash's reasoning effort, and Qwen's thinking switch, as the Copilot agent host advertises them on the direct rows. */
const EFFORT_THINKING: IModelConfigPropertySchema = { type: 'string', group: 'navigation', enum: ['low', 'medium', 'high'], enumItemLabels: ['Low', 'Medium', 'High'], default: 'medium' };
const TOGGLE_THINKING: IModelConfigPropertySchema = { type: 'string', group: 'navigation', enum: ['none', 'medium'], enumItemLabels: ['Off', 'On'], default: 'medium' };
const exampleFlashContext = { tokens: 131072, options: [{ tokens: 65536, gpuBytes: 57242 * 1024 ** 2 }, { tokens: 131072, gpuBytes: 59034 * 1024 ** 2 }, { tokens: 262144, gpuBytes: 62618 * 1024 ** 2 }] };
const qwenContext = { tokens: 131072, options: [{ tokens: 65536, gpuBytes: 6917 * 1024 ** 2 }, { tokens: 131072, gpuBytes: 8729 * 1024 ** 2 }, { tokens: 262144, gpuBytes: 12825 * 1024 ** 2 }] };

/** A chat's in-memory model configuration. */
function createConfigurationAccess(initial: IStringDictionary<IStringDictionary<unknown>> = {}): IModelConfigurationAccess {
	const values = new Map(Object.entries(initial));
	return {
		getModelConfiguration: modelId => values.get(modelId),
		setModelConfiguration: async (modelId, next) => { values.set(modelId, { ...values.get(modelId), ...next }); },
		getModelConfigurationActions: () => [],
	};
}

/** Records the actions a picker sends, and serves status per connection. */
function createLocalModelService(statusByConnection: Map<IAgentConnection, ISettableObservable<ILocalModelStatusV1 | undefined>>, pendingStops: IObservable<ReadonlySet<string>> = constObservable(new Set())) {
	const calls: string[] = [];
	const consents: ILocalModelConsent[] = [];
	const service = upcastPartial<ILocalModelService>({
		getStatus: (connection: IAgentConnection): IObservable<ILocalModelStatusV1 | undefined> => statusByConnection.get(connection) ?? constObservable(undefined),
		getPendingStops: () => pendingStops,
		makeActive: (_connection: IAgentConnection, familyId: string) => { calls.push(`makeActive:${familyId}`); return true; },
		setUp: (_connection: IAgentConnection, familyId: string, consent: ILocalModelConsent) => { calls.push(`setUp:${familyId}`); consents.push(consent); return true; },
		cancel: (_connection: IAgentConnection, operationId: string) => { calls.push(`cancel:${operationId}`); return true; },
		start: () => { calls.push('start'); return true; },
		setContextSize: (_connection: IAgentConnection, familyId: string, tokens: number) => { calls.push(`setContextSize:${familyId}:${tokens}`); return true; },
		setUseInAuto: async (value: boolean) => { calls.push(`setUseInAuto:${value}`); },
	});
	return { service, calls, consents };
}

/** Records `publicLog2` events. */
class RecordingTelemetryService extends mock<ITelemetryService>() {
	readonly events: { readonly name: string; readonly data: unknown }[] = [];
	override publicLog2(eventName: string, data?: unknown): void {
		this.events.push({ name: eventName, data });
	}
}

/** Records what a row asked its picker for. */
function createHost(selection: Partial<Pick<ILocalModelPickerHost, 'models' | 'selectedModelId' | 'configurationAccess'>> = {}) {
	const shown: string[] = [];
	const selected: string[] = [];
	const host: ILocalModelPickerHost = {
		models: selection.models ?? [],
		selectedModelId: selection.selectedModelId,
		configurationAccess: selection.configurationAccess,
		select: model => selected.push(model.identifier),
		showDetails: familyId => shown.push(familyId),
	};
	return { host, shown, selected };
}

suite('ModelPickerLocalModelItems', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows nothing without a listed family', () => {
		assert.deepStrictEqual(buildLocalModelPickerItems(createStatus([])), []);
	});

	test('rows before and during setup: a model that isn\'t downloaded can\'t be selected; its button says Download (or Set Up), the download\'s progress or Paused; no hover, menu or switch', () => {
		const operation = { id: 'op1', kind: 'setup', state: 'running', resumeOnStartup: true } as const;
		const cases: Record<string, ILocalModelStatusV1> = {
			download: createStatus([createFamily({ offer, entry: { modelFilesPresent: false } })]),
			nearFit: createStatus([createFamily({ offer: { ...offer, fit: 'near' } })]),
			foundOnDevice: createStatus([createFamily({ offer, entry: { modelFilesPresent: true } })]),
			checkingDevice: createStatus([createFamily({ offer, operation: { ...operation, phase: 'checkingDevice' } })]),
			downloading: createStatus([createFamily({ offer, operation: { ...operation, phase: 'downloading', completedBytes: 420, totalBytes: 1000 } })]),
			downloadingUnknown: createStatus([createFamily({ offer, operation: { ...operation, phase: 'downloading' } })]),
			verifying: createStatus([createFamily({ offer, operation: { ...operation, phase: 'verifying' } })]),
			draining: createStatus([createFamily({ install, operation: { ...operation, kind: 'update', phase: 'draining' } })], activeFor(FAMILY_ID, { drain: { runningStreams: 3 } })),
			swapLoading: createStatus([createFamily({ install, operation: { ...operation, kind: 'swap', phase: 'loading' } })]),
			removing: createStatus([createFamily({ install, operation: { ...operation, kind: 'remove' } })]),
			pausedByUser: createStatus([createFamily({ offer, operation: { ...operation, state: 'paused', pausedReason: 'user', phase: 'downloading', completedBytes: 420, totalBytes: 1000 } })]),
			pausedConsentChanged: createStatus([createFamily({ offer, operation: { ...operation, state: 'paused', pausedReason: 'consentChanged' } })]),
		};
		const actual = Object.fromEntries(Object.entries(cases).map(([name, status]) => [name, rowsFor(status)[0]]));
		const notDownloaded = 'Not downloaded';
		assert.deepStrictEqual(actual, {
			download: expectedRow('56.7 GB download', 'blank', { unavailable: notDownloaded, details: 'Download' }),
			nearFit: expectedRow('56.7 GB download', 'blank', { unavailable: notDownloaded, details: 'Download', notes: ['May run slower on this device'] }),
			foundOnDevice: expectedRow('Found on this device', 'blank', { unavailable: 'Not set up', details: 'Set Up' }),
			checkingDevice: expectedRow('Checking this device…', 'blank', { unavailable: notDownloaded, details: 'Checking this device…' }),
			downloading: expectedRow('Downloading 42%', 'blank', { unavailable: notDownloaded, details: '42%' }),
			downloadingUnknown: expectedRow('Downloading…', 'blank', { unavailable: notDownloaded, details: 'Downloading…' }),
			verifying: expectedRow('Verifying…', 'blank', { unavailable: 'Not set up', details: 'Verifying…' }),
			draining: expectedRow('Waiting for 3 responses…', 'blank', { badge: 'Active' }),
			swapLoading: expectedRow('Loading model…', 'blank'),
			removing: expectedRow('Removing…', 'blank'),
			pausedByUser: expectedRow('Paused at 42%', 'blank', { unavailable: notDownloaded, details: 'Paused' }),
			pausedConsentChanged: expectedRow('Paused', 'blank', { unavailable: notDownloaded, details: 'Paused', notes: ['Needs your approval again'] }),
		});
	});

	test('the Download button of a model that isn\'t downloaded is named after it, opens its detail page like the row and reads as an action; while it downloads, it names the progress', () => {
		const { host, shown, selected } = createHost({ models: [createAgentHostModel(MODEL_ID, 'Example Flash 1.0')] });
		const operation = { id: 'op1', kind: 'setup', resumeOnStartup: true } as const;
		const button = (family: ILocalModelFamilyV1) => {
			const [row] = buildLocalModelPickerItems(createStatus([family]), host);
			const [action] = row.toolbarActions!;
			action.run();
			row.item!.run();
			const classes = row.className?.split(' ') ?? [];
			const call = classes.includes('chat-model-picker-local-model-download') ? 'download' : classes.includes('chat-model-picker-local-model-call') ? 'call' : undefined;
			return { id: action.id, label: action.label, name: action.tooltip, opensDialog: row.toolbarDialogActionIds?.includes(action.id), ...(call ? { call } : {}) };
		};
		assert.deepStrictEqual({
			download: button(createFamily({ offer })),
			setUp: button(createFamily({ offer, entry: { modelFilesPresent: true } })),
			downloading: button(createFamily({ offer, operation: { ...operation, state: 'running', phase: 'downloading', completedBytes: 420, totalBytes: 1000 } })),
			paused: button(createFamily({ offer, operation: { ...operation, state: 'paused', pausedReason: 'user', phase: 'downloading', completedBytes: 420, totalBytes: 1000 } })),
			failed: button(createFamily({ offer, operation: { ...operation, state: 'error', error: { code: 'network', message: 'The download was interrupted.', actions: ['retry'] } } })),
			shown,
			selected,
		}, {
			// Download and Set Up read as actions, Download with its icon; progress, Paused and errors stay states.
			download: { id: 'chat.modelPicker.localModelDetails', label: 'Download', name: 'Download Example Flash 1.0', opensDialog: true, call: 'download' },
			setUp: { id: 'chat.modelPicker.localModelDetails', label: 'Set Up', name: 'Set Up Example Flash 1.0', opensDialog: true, call: 'call' },
			downloading: { id: 'chat.modelPicker.localModelDetails', label: '42%', name: 'Example Flash 1.0 Details, Downloading 42%', opensDialog: true },
			paused: { id: 'chat.modelPicker.localModelDetails', label: 'Paused', name: 'Example Flash 1.0 Details, Paused at 42%', opensDialog: true },
			failed: { id: 'chat.modelPicker.localModelDetails', label: 'Download interrupted', name: 'Example Flash 1.0 Details, Download interrupted', opensDialog: true },
			// The button and the row both open the detail page; neither selects a model.
			shown: [FAMILY_ID, FAMILY_ID, FAMILY_ID, FAMILY_ID, FAMILY_ID, FAMILY_ID, FAMILY_ID, FAMILY_ID, FAMILY_ID, FAMILY_ID],
			selected: [],
		});
	});

	test('rows of installed models and errors', () => {
		const family = createFamily({ install, offer });
		const unsupportedModel = { code: 'runtimeUnsupportedModel', message: 'This llama.cpp build can\'t run Example Flash 1.0 yet.', actions: ['getLlamaCpp', 'openSettings', 'retry'] } as const;
		const cases: Record<string, ILocalModelStatusV1> = {
			notActive: createStatus([family, otherFamily], activeFor(otherFamily.familyId)),
			startsWhenNeeded: createStatus([family], activeFor(family.familyId, { server: 'stopped' })),
			starting: createStatus([family], activeFor(family.familyId, { server: 'starting' })),
			ready: createStatus([family], activeFor(family.familyId)),
			tooSlowForAuto: createStatus([family], activeFor(family.familyId, { autoEligible: false })),
			notAutoCapable: createStatus([{ ...family, autoCapable: false }], activeFor(family.familyId)),
			updateAvailable: createStatus([{ ...family, install: { ...install, update: { contentId: 'c2', downloadBytes: 2 * GB } } }], activeFor(family.familyId)),
			downloadFailed: createStatus([createFamily({ offer, operation: { id: 'op1', kind: 'setup', state: 'error', resumeOnStartup: false, error: { code: 'network', message: 'The download was interrupted.', actions: ['retry'] } } })]),
			orphan: createStatus([family], activeFor(family.familyId, { server: 'error', error: { code: 'orphan', message: 'A previous server is still running.', actions: ['retry', 'stopPrevious'] } })),
			runtimeTooOld: createStatus([createFamily({ offer, operation: { id: 'op1', kind: 'setup', state: 'error', resumeOnStartup: false, error: { code: 'runtimeTooOld', message: 'The llama-server is too old.', actions: ['getLlamaCpp', 'openSettings', 'retry'] } } })]),
			runtimeUnsupportedModel: createStatus([family], activeFor(family.familyId, { server: 'error', error: unsupportedModel })),
		};
		const actual = Object.fromEntries(Object.entries(cases).map(([name, status]) => [name, rowsFor(status)[0]]));
		assert.deepStrictEqual(actual, {
			notActive: expectedRow('Not loaded', 'blank'),
			startsWhenNeeded: expectedRow('Starts when needed', 'blank'),
			starting: expectedRow('Loading model…', 'blank', { badge: 'Active' }),
			ready: expectedRow(undefined, 'blank', { badge: 'Active' }),
			tooSlowForAuto: expectedRow(undefined, 'blank', { badge: 'Active', notes: ['Too slow for Auto'] }),
			notAutoCapable: expectedRow(undefined, 'blank', { badge: 'Active', notes: ['Not available for Auto yet'] }),
			updateAvailable: expectedRow(undefined, 'blank', { badge: 'Active', notes: ['Update available (2.0 GB)'] }),
			downloadFailed: expectedRow('Download interrupted', 'blank', { unavailable: 'Not downloaded', details: 'Download interrupted' }),
			orphan: expectedRow('Previous server still running', 'blank'),
			runtimeTooOld: expectedRow('llama.cpp is too old', 'blank', { unavailable: 'Not downloaded', details: 'llama.cpp is too old' }),
			runtimeUnsupportedModel: expectedRow('Needs a newer llama.cpp', 'blank'),
		});
	});

	test('row affordances: whatever the state, Details and a row without a direct model open the detail page', () => {
		const { host, shown } = createHost();
		const build = (status: ILocalModelStatusV1) => buildLocalModelPickerItems(status, host)[0];
		const rows = [
			build(createStatus([createFamily({ offer })])),
			build(createStatus([createFamily({ offer, entry: { modelFilesPresent: true } })])),
			build(createStatus([createFamily({ offer, operation: { id: 'op1', kind: 'setup', state: 'running', resumeOnStartup: true, phase: 'downloading' } })])),
			build(createStatus([createFamily({ install, offer })], activeFor(FAMILY_ID, { server: 'error', error: { code: 'crashed', message: 'Stopped.', actions: ['retry'] } }))),
			build(createStatus([createFamily({ offer, operation: { id: 'op2', kind: 'setup', state: 'paused', pausedReason: 'consentChanged', resumeOnStartup: false } })])),
		];
		for (const row of rows) {
			row.item!.run();
			row.toolbarActions!.forEach(action => action.run());
		}
		assert.deepStrictEqual({ toolbars: rows.map(row => row.toolbarActions!.map(action => action.label)), shown: shown.length }, {
			toolbars: [['Download'], ['Set Up'], ['Downloading…'], ['Details'], ['Paused']],
			shown: rows.length * 2,
		});
	});

	test('an installed family with a direct model is a single row that selects it; its Details button opens its page', () => {
		const direct = createAgentHostModel(MODEL_ID, 'Example Flash 1.0');
		const other = createAgentHostModel(OTHER_MODEL_ID, 'Qwen Coder');
		const family = createFamily({ install: { ...install, update: { contentId: 'c2', downloadBytes: 2 * GB } } });
		const offered = createFamily({ familyId: 'offered', capiId: 'offered', displayName: 'Offered Model', offer });
		const { host, shown, selected } = createHost({ models: [direct, other, createAgentHostModel('gpt-5', 'GPT-5')], selectedModelId: direct.identifier });
		const items = buildLocalModelPickerItems(createStatus([family, otherFamily, offered], activeFor(family.familyId)), host);
		const [active, inactive] = items;
		active.toolbarActions![0].run();
		active.item!.run();
		inactive.item!.run();
		assert.deepStrictEqual({ rows: summarize(items), shown, selected }, {
			rows: [
				{ ...expectedRow(undefined, 'check', { id: direct.identifier, badge: 'Active', notes: ['No usage limit', 'Update available (2.0 GB)'] }), checked: true },
				expectedRow('Not loaded', 'blank', { id: other.identifier, label: 'Qwen Coder' }),
				expectedRow('56.7 GB download', 'blank', { id: 'localModel:offered', label: 'Offered Model', unavailable: 'Not downloaded', details: 'Download' }),
			],
			shown: [FAMILY_ID],
			selected: [direct.identifier, other.identifier],
		});
	});

	test('row summary: an installed model\'s Details button names its thinking level and context size; its state is only read out, while it isn\'t ready', () => {
		const configuration = createConfigurationAccess({ [`${SessionType.AgentHostCopilot}:${OTHER_MODEL_ID}`]: { thinkingLevel: 'none' } });
		const effort = createAgentHostModel(MODEL_ID, 'Example Flash 1.0', EFFORT_THINKING);
		const toggle = createAgentHostModel(OTHER_MODEL_ID, 'Qwen Coder', TOGGLE_THINKING);
		const plain = createAgentHostModel('vscode-on-device/Plain', 'Plain Model');
		const families = [
			createFamily({ install, context: exampleFlashContext }),
			{ ...otherFamily, context: { ...qwenContext, tokens: 65536 } },
			createFamily({ familyId: 'plain', capiId: 'plain', displayName: 'Plain Model', install: { ...install, contentId: 'p1', modelId: 'vscode-on-device/Plain' }, context: exampleFlashContext }),
			createFamily({ familyId: 'no-context', capiId: 'no-context', displayName: 'Older Host Model', install: { ...install, contentId: 'n1', modelId: 'vscode-on-device/Older' } }),
			createFamily({ familyId: 'offered', capiId: 'offered', displayName: 'Offered Model', offer, context: exampleFlashContext }),
		];
		const { host } = createHost({ models: [effort, toggle, plain], selectedModelId: effort.identifier, configurationAccess: configuration });
		const items = buildLocalModelPickerItems(createStatus(families, activeFor(FAMILY_ID)), host);
		assert.deepStrictEqual({
			rows: items.map(item => ({ badge: item.badge, ariaDescription: item.ariaDescription, toolbar: item.toolbarActions?.map(action => action.label) })),
			detailsTooltip: items[0].toolbarActions?.at(-1)?.tooltip,
		}, {
			rows: [
				{ badge: 'Active', ariaDescription: 'Effort Level: Medium, Context: 128K, No usage limit', toolbar: ['Medium \u00b7 128K'] },
				{ badge: undefined, ariaDescription: 'Not loaded, Effort Level: Off, Context: 64K', toolbar: ['Off \u00b7 64K'] },
				{ badge: undefined, ariaDescription: 'Not loaded, Context: 128K', toolbar: ['128K'] },
				{ badge: undefined, ariaDescription: 'Not loaded', toolbar: ['Details'] },
				{ badge: undefined, ariaDescription: 'Not downloaded, 56.7 GB download', toolbar: ['Download'] },
			],
			detailsTooltip: 'Example Flash 1.0 Details, Medium \u00b7 128K',
		});
	});

	test('a loaded model\'s row summary and readout show the context size it serves with, not the selected one', () => {
		const configuration = createConfigurationAccess({ [`${SessionType.AgentHostCopilot}:${OTHER_MODEL_ID}`]: { thinkingLevel: 'none' } });
		const qwen = createAgentHostModel(OTHER_MODEL_ID, 'Qwen Coder', TOGGLE_THINKING);
		// 256K selected, but the device only fits 128K.
		const family = { ...otherFamily, context: { ...qwenContext, tokens: 262144 } };
		const { host } = createHost({ models: [qwen], selectedModelId: qwen.identifier, configurationAccess: configuration });
		const describe = (active: ILocalModelStatusV1['active']) => {
			const status = createStatus([family], active);
			const row = buildLocalModelPickerItems(status, host)[0];
			return { details: row.toolbarActions?.at(-1)?.label, readout: getLocalModelDirectModelPresentation(qwen, status, configuration)?.readout };
		};
		assert.deepStrictEqual({
			ready: describe(activeFor(family.familyId, { contextTokens: 131072 })),
			starting: describe(activeFor(family.familyId, { server: 'starting', contextTokens: 131072 })),
			stopped: describe(activeFor(family.familyId, { server: 'stopped', contextTokens: 131072 })),
			notActive: describe(activeFor(FAMILY_ID, { contextTokens: 131072 })),
			unknownServingSize: describe(activeFor(family.familyId)),
		}, {
			ready: { details: 'Off \u00b7 128K', readout: { label: 'Off \u00b7 128K', description: 'Effort Level: Off, Context: 128K' } },
			starting: { details: 'Off \u00b7 128K', readout: { label: 'Loading…', description: 'Loading model…, Effort Level: Off, Context: 128K' } },
			stopped: { details: 'Off \u00b7 256K', readout: { label: 'Not loaded', description: 'Starts when needed, Effort Level: Off, Context: 256K' } },
			notActive: { details: 'Off \u00b7 256K', readout: { label: 'Not loaded', description: 'Not loaded, Effort Level: Off, Context: 256K' } },
			unknownServingSize: { details: 'Off \u00b7 256K', readout: { label: 'Off \u00b7 256K', description: 'Effort Level: Off, Context: 256K' } },
		});
	});

	test('the detail page\'s stop action: Pause stops setup, Cancel a model change (also while it waits for responses) or its load, and Stop Now an update\'s drain; once sent, it reads as in progress and can\'t be chosen again', () => {
		const operation = { kind: 'setup', state: 'running', resumeOnStartup: true } as const;
		const status = createStatus([
			createFamily({ offer, operation: { ...operation, id: 'download', phase: 'downloading' } }),
			createFamily({ familyId: 'swap', capiId: 'swap', displayName: 'Swap', install, operation: { ...operation, id: 'swap', kind: 'swap', phase: 'loading' } }),
			createFamily({ familyId: 'drain', capiId: 'drain', displayName: 'Drain', install, operation: { ...operation, id: 'drain', kind: 'swap', phase: 'draining' } }),
			createFamily({ familyId: 'update', capiId: 'update', displayName: 'Update', install, operation: { ...operation, id: 'update', kind: 'update', phase: 'draining' } }),
		], activeFor('update', { drain: { runningStreams: 1 } }));
		const stops = (pendingStops?: ReadonlySet<string>) => status.families.map(family => {
			const stop = getLocalModelRunningAction(family, status, pendingStops);
			return stop && `${stop.pending ? `(${stop.label})` : stop.label} ${stop.request.action}`;
		});
		assert.deepStrictEqual({ before: stops(), pending: stops(new Set(['download', 'swap', 'drain', getLocalModelStopNowId('update')])) }, {
			before: ['Pause cancel', 'Cancel cancel', 'Cancel cancel', 'Stop Now stopNow'],
			pending: ['(Pausing…) cancel', '(Cancelling…) cancel', '(Cancelling…) cancel', '(Stopping…) stopNow'],
		});
	});

	test('during a swap to another model, the incoming model\'s detail page offers Cancel, which keeps the active model while its responses finish; the rows only open details', () => {
		const incoming = createFamily({ familyId: 'incoming', capiId: 'incoming', displayName: 'Incoming', install: { ...install, contentId: 'i1', modelId: 'vscode-on-device/Incoming' }, operation: { id: 'swap', kind: 'swap', state: 'running', resumeOnStartup: false, phase: 'draining' } });
		const outgoing = createFamily({ install });
		// The active model stays the outgoing one until its responses finish.
		const status = createStatus([outgoing, incoming], activeFor(FAMILY_ID, { server: 'stopping', swapTo: 'incoming', drain: { runningStreams: 1 } }));
		assert.deepStrictEqual({
			actions: [getLocalModelRunningAction(outgoing, status)?.label, getLocalModelRunningAction(incoming, status)?.label],
			pending: getLocalModelRunningAction(incoming, status, new Set(['swap']))?.label,
			// Stop Now of the same drain is pending under its own key: the Cancel is still offered.
			stopNowPending: getLocalModelRunningAction(incoming, status, new Set([getLocalModelStopNowId('swap')]))?.label,
			rows: buildLocalModelPickerItems(status).map(row => row.toolbarActions?.map(action => action.label)),
		}, {
			actions: [undefined, 'Cancel'],
			pending: 'Cancelling…',
			stopNowPending: 'Cancel',
			rows: [['Details'], ['Details']],
		});
	});

	test('an active model reads its load step, or that it stops; a model the device can\'t hold at its context size says so', () => {
		const family = createFamily({ install });
		const describe = (active: ILocalModelStatusV1['active'], overrides: Partial<ILocalModelFamilyV1> = {}) => {
			const row = buildLocalModelPickerItems(createStatus([{ ...family, ...overrides }], active))[0];
			return [row.badge, row.ariaDescription];
		};
		assert.deepStrictEqual({
			loading: describe(activeFor(FAMILY_ID, { server: 'starting', load: { step: 'loading', startedAt: 0, expectedMs: 30_000 } })),
			warmingUp: describe(activeFor(FAMILY_ID, { server: 'starting', load: { step: 'warmingUp', startedAt: 0 } })),
			// This llama.cpp build crashed with speculative decoding: the host loads the model again without it.
			retrying: describe(activeFor(FAMILY_ID, { server: 'starting', load: { step: 'loading', startedAt: 0, retry: 'withoutSpeculativeDecoding' } })),
			retryWarmingUp: describe(activeFor(FAMILY_ID, { server: 'starting', load: { step: 'warmingUp', startedAt: 0, retry: 'withoutSpeculativeDecoding' } })),
			stopping: describe(activeFor(FAMILY_ID, { server: 'stopping' })),
			memoryWarning: describe(undefined, { memoryWarning: { requiredBytes: 13 * GB, capacityBytes: 8 * GB } }),
		}, {
			loading: ['Active', 'Loading model…'],
			warmingUp: ['Active', 'Warming up…'],
			retrying: ['Active', 'Retrying…'],
			retryWarmingUp: ['Active', 'Retrying…'],
			stopping: [undefined, 'Stopping…'],
			memoryWarning: [undefined, 'Not loaded, Needs more GPU memory than this device has'],
		});
	});

	test('context sizes read like cloud context labels', () => {
		assert.deepStrictEqual([65536, 131072, 262144, 98304, 1048576, 128000, 1000000, 512].map(formatLocalModelContextTokens), ['64K', '128K', '256K', '96K', '1M', '128K', '1M', '512']);
	});

	test('direct model rows: the readout states the model\'s state while it isn\'t ready, otherwise its thinking level and context size', () => {
		const family = createFamily({ install });
		const direct = createAgentHostModel(MODEL_ID, 'Example Flash 1.0');
		const other = createAgentHostModel(OTHER_MODEL_ID, 'Qwen Coder');
		const cloud = { ...createAgentHostModel('gpt-5', 'GPT-5') };
		const notAgentHost = { ...direct, metadata: { ...direct.metadata, targetChatSessionType: 'remote-copilotcli' } };
		const status = createStatus([family, otherFamily], activeFor(family.familyId));
		const configured = createStatus([{ ...family, context: exampleFlashContext }, { ...otherFamily, context: qwenContext }], activeFor(family.familyId));
		const configuration = createConfigurationAccess({ [`${SessionType.AgentHostCopilot}:${MODEL_ID}`]: { thinkingLevel: 'high' } });
		const describe = (model: ILanguageModelChatMetadataAndIdentifier, current: ILocalModelStatusV1) => {
			const presentation = getLocalModelDirectModelPresentation(model, current, configuration);
			return presentation && { state: presentation.state, readout: presentation.readout.label, description: presentation.readout.description };
		};
		assert.deepStrictEqual({
			active: describe(direct, status),
			loading: describe(direct, createStatus([family, otherFamily], activeFor(family.familyId, { server: 'starting' }))),
			notLoaded: describe(other, status),
			activeWithSettings: describe(createAgentHostModel(MODEL_ID, 'Example Flash 1.0', EFFORT_THINKING), configured),
			notLoadedWithSettings: describe(createAgentHostModel(OTHER_MODEL_ID, 'Qwen Coder', TOGGLE_THINKING), configured),
			cloud: describe(cloud, status),
			otherSessionType: describe(notAgentHost, status),
		}, {
			active: { state: undefined, readout: 'Ready', description: 'Ready' },
			loading: { state: 'Loading model…', readout: 'Loading…', description: 'Loading model…' },
			notLoaded: { state: 'Not loaded', readout: 'Not loaded', description: 'Not loaded' },
			activeWithSettings: { state: undefined, readout: 'High \u00b7 128K', description: 'Effort Level: High, Context: 128K' },
			notLoadedWithSettings: { state: 'Not loaded', readout: 'Not loaded', description: 'Not loaded, Effort Level: On, Context: 128K' },
			cloud: undefined,
			otherSessionType: undefined,
		});
	});

	test('the readout shows a short state or, once ready, the thinking level and context size, never both; its description says all of them', () => {
		const configuration = createConfigurationAccess({ [`${SessionType.AgentHostCopilot}:${MODEL_ID}`]: { thinkingLevel: 'medium' } });
		const model = createAgentHostModel(MODEL_ID, 'Example Flash 1.0', EFFORT_THINKING);
		const family = createFamily({ install, context: exampleFlashContext });
		const running = { state: 'running', resumeOnStartup: false } as const;
		const describe = (active: ILocalModelStatusV1['active'], operation?: ILocalModelFamilyV1['operation']) => {
			const readout = getLocalModelDirectModelPresentation(model, createStatus([{ ...family, operation }, otherFamily], active), configuration)!.readout;
			return `${readout.label} | ${readout.description}`;
		};
		const settings = 'Effort Level: Medium, Context: 128K';
		assert.deepStrictEqual({
			loading: describe(activeFor(FAMILY_ID, { server: 'starting', load: { step: 'loading', startedAt: 0 } })),
			warmingUp: describe(activeFor(FAMILY_ID, { server: 'starting', load: { step: 'warmingUp', startedAt: 0 } })),
			// This llama.cpp build crashed with speculative decoding: the host loads the model again without it.
			retrying: describe(activeFor(FAMILY_ID, { server: 'starting', load: { step: 'loading', startedAt: 0, retry: 'withoutSpeculativeDecoding' } })),
			retryWarmingUp: describe(activeFor(FAMILY_ID, { server: 'starting', load: { step: 'warmingUp', startedAt: 0, retry: 'withoutSpeculativeDecoding' } })),
			// A new context size: the host swaps the active model to itself.
			reloadDraining: describe(activeFor(FAMILY_ID, { swapTo: FAMILY_ID, drain: { runningStreams: 2 } }), { ...running, id: 'reload', kind: 'swap', phase: 'draining' }),
			reloadUnloading: describe(activeFor(FAMILY_ID, { server: 'stopping', swapTo: FAMILY_ID }), { ...running, id: 'reload', kind: 'swap', phase: 'loading' }),
			reloading: describe(activeFor(FAMILY_ID, { server: 'starting', swapTo: FAMILY_ID, load: { step: 'loading', startedAt: 0 } }), { ...running, id: 'reload', kind: 'swap', phase: 'loading' }),
			reloadRetrying: describe(activeFor(FAMILY_ID, { server: 'starting', swapTo: FAMILY_ID, load: { step: 'loading', startedAt: 0, retry: 'withoutSpeculativeDecoding' } }), { ...running, id: 'reload', kind: 'swap', phase: 'loading' }),
			swappedIn: describe(activeFor(otherFamily.familyId, { swapTo: FAMILY_ID, drain: { runningStreams: 1 } }), { ...running, id: 'swap', kind: 'swap', phase: 'draining' }),
			swapNoneRunning: describe(activeFor(otherFamily.familyId, { swapTo: FAMILY_ID, drain: { runningStreams: 0 } }), { ...running, id: 'swap', kind: 'swap', phase: 'draining' }),
			nextToLoad: describe(activeFor(otherFamily.familyId, { server: 'stopping', swapTo: FAMILY_ID })),
			stopping: describe(activeFor(FAMILY_ID, { server: 'stopping' })),
			notLoaded: describe(activeFor(otherFamily.familyId)),
			downloading: describe(activeFor(FAMILY_ID), { ...running, id: 'update', kind: 'update', phase: 'downloading', completedBytes: 42, totalBytes: 100 }),
			paused: describe(activeFor(FAMILY_ID), { id: 'update', kind: 'update', state: 'paused', pausedReason: 'user', resumeOnStartup: false, phase: 'downloading', completedBytes: 42, totalBytes: 100 }),
			error: describe(activeFor(FAMILY_ID, { server: 'error', error: { code: 'crashed', message: 'Example Flash 1.0 stopped unexpectedly.', actions: ['retry'] } })),
			ready: describe(activeFor(FAMILY_ID, { contextTokens: 131072 })),
		}, {
			loading: `Loading… | Loading model…, ${settings}`,
			warmingUp: `Loading… | Warming up…, ${settings}`,
			retrying: `Loading… | Retrying…, ${settings}`,
			retryWarmingUp: `Loading… | Retrying…, ${settings}`,
			reloadDraining: `Reloading… | Waiting for 2 responses…, ${settings}`,
			reloadUnloading: `Reloading… | Reloading…, ${settings}`,
			reloading: `Reloading… | Reloading…, ${settings}`,
			reloadRetrying: `Reloading… | Retrying…, ${settings}`,
			swappedIn: `Loading… | Waiting for 1 response…, ${settings}`,
			swapNoneRunning: `Loading… | Loading model…, ${settings}`,
			nextToLoad: `Loading… | Loading model…, ${settings}`,
			stopping: `Stopping… | Stopping…, ${settings}`,
			notLoaded: `Not loaded | Not loaded, ${settings}`,
			downloading: `Downloading 42% | Downloading 42%, ${settings}`,
			paused: `Paused | Paused at 42%, ${settings}`,
			error: `Stopped unexpectedly | Stopped unexpectedly, ${settings}`,
			ready: `Medium \u00b7 128K | ${settings}`,
		});
	});

	test('a drain with no response running never reads "Waiting for 0 responses": rows, the detail page\'s state and its stop action read as the load (or reload) it is part of', () => {
		const running = { state: 'running', resumeOnStartup: false } as const;
		const describe = (operation: ILocalModelFamilyV1['operation'], active: ILocalModelStatusV1['active']) => {
			const family = createFamily({ install, operation });
			const status = createStatus([family, otherFamily], active);
			return [buildLocalModelPickerItems(status)[0].ariaDescription, getLocalModelStateLabel(family, 'preparing', status), getLocalModelRunningAction(family, status)?.label].join(' | ');
		};
		const draining = (kind: 'swap' | 'update') => ({ ...running, id: 'op', kind, phase: 'draining' } as const);
		assert.deepStrictEqual({
			swap: describe(draining('swap'), activeFor(otherFamily.familyId, { swapTo: FAMILY_ID, drain: { runningStreams: 0 } })),
			reload: describe(draining('swap'), activeFor(FAMILY_ID, { swapTo: FAMILY_ID, drain: { runningStreams: 0 } })),
			reloadNoDrain: describe(draining('swap'), activeFor(FAMILY_ID, { swapTo: FAMILY_ID })),
			update: describe(draining('update'), activeFor(FAMILY_ID, { drain: { runningStreams: 0 } })),
			oneRunning: describe(draining('swap'), activeFor(otherFamily.familyId, { swapTo: FAMILY_ID, drain: { runningStreams: 1 } })),
		}, {
			swap: 'Loading model… | Loading model… | Cancel',
			reload: 'Reloading… | Reloading… | Cancel',
			reloadNoDrain: 'Reloading… | Reloading… | Cancel',
			update: 'Preparing… | Preparing… | Pause',
			oneRunning: 'Waiting for 1 response… | Waiting for 1 response… | Cancel',
		});
	});

	test('direct row ids: `vscode-on-device/<alias>`, matched with or without the provider prefix', () => {
		assert.deepStrictEqual([
			matchesLocalModelRowId(MODEL_ID, MODEL_ID),
			matchesLocalModelRowId(MODEL_ID, 'MAI-Code-1.1-Flash'),
			matchesLocalModelRowId('MAI-Code-1.1-Flash', MODEL_ID),
			matchesLocalModelRowId(MODEL_ID, OTHER_MODEL_ID),
			matchesLocalModelRowId(MODEL_ID, 'other-provider/MAI-Code-1.1-Flash'),
			matchesLocalModelRowId(undefined, MODEL_ID),
		], [true, true, true, false, false, false]);
	});

	suite('ModelPickerLocalModels', () => {
		const localConnection = upcastPartial<IAgentHostService>({});
		const remoteConnection = upcastPartial<IAgentConnection>({});

		function createController(options: { enabled?: boolean; chatEnabled?: boolean; connection?: IAgentConnection; status?: ILocalModelStatusV1 } = {}) {
			const localStatus = observableValue<ILocalModelStatusV1 | undefined>('status', options.status);
			const pendingStops = observableValue<ReadonlySet<string>>('pendingStops', new Set());
			const { service, calls, consents } = createLocalModelService(new Map([[localConnection as IAgentConnection, localStatus]]), pendingStops);
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(ILocalModelService, service);
			instantiationService.stub(IAgentHostService, localConnection);
			instantiationService.stub(IConfigurationService, new TestConfigurationService({ [LocalModelEnabledSettingId]: options.enabled ?? true }));
			const chatEnabled = options.chatEnabled ?? true;
			instantiationService.stub(IContextKeyService, new class extends MockContextKeyService { override contextMatchesRules() { return chatEnabled; } }());
			instantiationService.stub(ICommandService, {});
			instantiationService.stub(IOpenerService, {});
			instantiationService.stub(ITerminalService, {});
			const telemetry = new RecordingTelemetryService();
			instantiationService.stub(ITelemetryService, telemetry);
			instantiationService.stub(ILogService, new NullLogService());
			const events: string[] = [];
			const controller = store.add(instantiationService.createInstance(ModelPickerLocalModels, options.connection, event => events.push(`${event.action}:${event.fromReadiness}:${event.installedFamilies}`)));
			return { controller, calls, consents, events, localStatus, telemetry, pendingStops };
		}

		const family = createFamily({ install });
		const twoInstalled = createStatus([family, otherFamily], activeFor(otherFamily.familyId));

		test('binds to the chat\'s connection: a remote connection, a disabled setting or disabled AI show nothing', () => {
			const presentations = {
				local: createController({ status: twoInstalled }).controller.getPresentation()?.getItems().length,
				remote: createController({ status: twoInstalled, connection: remoteConnection }).controller.getPresentation(),
				settingOff: createController({ status: twoInstalled, enabled: false }).controller.getPresentation(),
				aiDisabled: createController({ status: twoInstalled, chatEnabled: false }).controller.getPresentation(),
				noFamilies: createController({ status: createStatus([]) }).controller.getPresentation(),
			};
			assert.deepStrictEqual(presentations, { local: 2, remote: undefined, settingOff: undefined, aiDisabled: undefined, noFamilies: undefined });
		});

		test('selecting a direct model loads it at once, without asking: a non-active one becomes active, a stopped active one starts; a loaded one, one swapping in and cloud models load nothing', () => {
			const select = (status: ILocalModelStatusV1, modelId: string) => {
				const { controller, calls, events } = createController({ status });
				const loaded = controller.loadOnSelect(createAgentHostModel(modelId, modelId));
				return { loaded, calls, events };
			};
			assert.deepStrictEqual({
				notActive: select(twoInstalled, MODEL_ID),
				loadedActive: select(twoInstalled, OTHER_MODEL_ID),
				stoppedActive: select(createStatus([family, otherFamily], activeFor(otherFamily.familyId, { server: 'stopped' })), OTHER_MODEL_ID),
				failedActive: select(createStatus([family, otherFamily], activeFor(otherFamily.familyId, { server: 'error', error: { code: 'crashed', message: 'Stopped.', actions: ['retry'] } })), OTHER_MODEL_ID),
				startingActive: select(createStatus([family, otherFamily], activeFor(otherFamily.familyId, { server: 'starting' })), OTHER_MODEL_ID),
				swappingIn: select(createStatus([family, otherFamily], activeFor(otherFamily.familyId, { server: 'stopping', swapTo: FAMILY_ID })), MODEL_ID),
				cloud: select(twoInstalled, 'gpt-5'),
			}, {
				notActive: { loaded: true, calls: [`makeActive:${FAMILY_ID}`], events: ['makeActive:installed:2'] },
				loadedActive: { loaded: false, calls: [], events: [] },
				stoppedActive: { loaded: true, calls: ['start'], events: ['start:installed:2'] },
				failedActive: { loaded: true, calls: ['start'], events: ['start:error:2'] },
				startingActive: { loaded: false, calls: [], events: [] },
				swappingIn: { loaded: false, calls: [], events: [] },
				cloud: { loaded: false, calls: [], events: [] },
			});
		});

		test('refreshes on state transitions right away, on progress at most once a second', () => {
			const operation = { id: 'op1', kind: 'setup', state: 'running', resumeOnStartup: true, phase: 'downloading', completedBytes: 1, totalBytes: 10 } as const;
			const { controller, localStatus } = createController({ status: createStatus([createFamily({ offer })]) });
			let changes = 0;
			store.add(controller.onDidChange(() => changes++));
			localStatus.set(createStatus([createFamily({ offer, operation })]), undefined);
			const afterTransition = changes;
			localStatus.set(createStatus([createFamily({ offer, operation: { ...operation, completedBytes: 2 } })]), undefined);
			localStatus.set(createStatus([createFamily({ offer, operation: { ...operation, completedBytes: 3 } })]), undefined);
			assert.deepStrictEqual({ afterTransition, afterProgress: changes }, { afterTransition: 1, afterProgress: 1 });
		});

		test('detail page consent is sent as given, and reports the accepted entry path', () => {
			const { controller, calls, consents, events, telemetry } = createController({ status: createStatus([createFamily({ offer })]) });
			const details = controller.getPresentation()!.getDetails(FAMILY_ID)!;
			details.actions.logConsent?.('consentShown', 'modelOnly');
			details.actions.run({ action: 'setUp', familyId: FAMILY_ID, readiness: 'requiresSetup', consent: { scope: 'scope' }, entryPath: 'modelOnly' });
			assert.deepStrictEqual({
				details: [details.family.familyId, details.readiness],
				calls,
				consents,
				events,
				flow: telemetry.events.filter(event => event.name === 'localModel.flow').map(event => event.data),
			}, {
				details: [FAMILY_ID, 'requiresSetup'],
				calls: [`setUp:${FAMILY_ID}`],
				consents: [{ scope: 'scope' }],
				events: ['setUp:requiresSetup:0'],
				flow: [
					{ step: 'consentShown', entryPath: 'modelOnly', action: undefined, currentModelKind: undefined },
					{ step: 'consentAccepted', entryPath: 'modelOnly', action: undefined, currentModelKind: undefined },
				],
			});
		});

		test('a stop that was just sent refreshes an open picker at once, and its detail page shows it as in progress', () => {
			const operation = { id: 'op1', kind: 'setup', state: 'running', resumeOnStartup: true, phase: 'downloading', completedBytes: 1, totalBytes: 10 } as const;
			const { controller, pendingStops } = createController({ status: createStatus([createFamily({ offer, operation })]) });
			let changes = 0;
			store.add(controller.onDidChange(() => changes++));
			const pause = () => {
				const details = controller.getPresentation()!.getDetails(FAMILY_ID)!;
				const stop = getLocalModelRunningAction(details.family, details.status, details.pendingStops);
				return { label: stop?.label, pending: stop?.pending };
			};
			const before = pause();
			pendingStops.set(new Set(['op1']), undefined);
			assert.deepStrictEqual({ before, after: { ...pause(), changes } }, {
				before: { label: 'Pause', pending: false },
				after: { label: 'Pausing…', pending: true, changes: 1 },
			});
		});

		test('the detail page\'s context size choice is sent to the chat\'s connection as `setContextSize`', () => {
			const { controller, calls, events } = createController({ status: createStatus([createFamily({ install, context: exampleFlashContext })], activeFor(FAMILY_ID)) });
			controller.getPresentation()!.getDetails(FAMILY_ID)!.actions.run({ action: 'setContextSize', familyId: FAMILY_ID, readiness: 'ready', contextTokens: 262144 });
			assert.deepStrictEqual({ calls, events }, { calls: [`setContextSize:${FAMILY_ID}:262144`], events: ['setContextSize:ready:1'] });
		});
	});

	suite('ModelPickerWidget selection', () => {

		function createPicker() {
			const localConnection = upcastPartial<IAgentHostService>({});
			const family = createFamily({ install });
			const status = observableValue<ILocalModelStatusV1 | undefined>('status', createStatus([family, { ...otherFamily, context: qwenContext }], activeFor(otherFamily.familyId)));
			const { service, calls } = createLocalModelService(new Map([[localConnection as IAgentConnection, status]]));
			const auto = createAgentHostModel('auto', 'Auto');
			const active = createAgentHostModel(OTHER_MODEL_ID, 'Qwen Coder', TOGGLE_THINKING);
			const direct = createAgentHostModel(MODEL_ID, 'Example Flash 1.0');
			const models = [auto, active, direct];
			let shown: { readonly context: ITabbedModelPickerContext; readonly detailsModelId: string | undefined } | undefined;
			const pickerSelections: (string | undefined)[] = [];

			const instantiationService = store.add(new TestInstantiationService());
			// The widget only opens the tabbed picker; record the context it is given.
			const onDidHide = store.add(new Emitter<void>());
			instantiationService.stubInstance(TabbedModelPicker, {
				onDidHide: onDidHide.event,
				get isVisible() { return !!shown; },
				show: (_anchor: HTMLElement, context: ITabbedModelPickerContext, detailsModelId?: string) => { shown = { context, detailsModelId }; },
				hide: () => {
					shown = undefined;
					onDidHide.fire();
				},
				setSelectedModel: (modelId: string | undefined) => { pickerSelections.push(modelId); },
				setLocalModels: () => { },
				dispose: () => { },
			});
			instantiationService.stub(ICommandService, {});
			instantiationService.stub(IOpenerService, {});
			instantiationService.stub(ITelemetryService, NullTelemetryService);
			instantiationService.stub(ITerminalService, {});
			instantiationService.stub(ILogService, new NullLogService());
			instantiationService.stub(ILanguageModelsService, new class extends NullLanguageModelsService {
				override getLanguageModelIds() { return models.map(model => model.identifier); }
			}());
			instantiationService.stub(IProductService, { version: '1.100.0' });
			const entitlementService = new TestChatEntitlementService();
			entitlementService.entitlement = ChatEntitlement.Pro;
			instantiationService.stub(IChatEntitlementService, entitlementService);
			instantiationService.stub(IUpdateService, { state: { type: StateType.Uninitialized } });
			instantiationService.stub(IUriIdentityService, {});
			instantiationService.stub(IDefaultAccountService, { resolveGitHubUrl: () => undefined });
			instantiationService.stub(IWorkspaceTrustManagementService, store.add(new TestWorkspaceTrustManagementService()));
			instantiationService.stub(IWorkspaceTrustRequestService, {});
			instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
			instantiationService.stub(IConfigurationService, new TestConfigurationService({ [LocalModelEnabledSettingId]: true }));
			instantiationService.stub(ILocalModelService, service);
			instantiationService.stub(IAgentHostService, localConnection);
			instantiationService.stub(IContextKeyService, new class extends MockContextKeyService { override contextMatchesRules() { return true; } }());

			const selections: string[] = [];
			const picker = store.add(instantiationService.createInstance(ModelPickerWidget, {
				currentModel: constObservable(active),
				setModel: () => { },
				getModels: () => models,
				getSessionType: () => SessionType.AgentHostCopilot,
				getPresentationOptions: () => ({
					showManageModelsAction: false, showUnavailableFeatured: false,
					showAutoModel: true, showModelIcon: false,
				}),
			}));
			store.add(picker.onDidChangeSelection(model => selections.push(model.identifier)));
			picker.setSelectedModel(active);
			pickerSelections.length = 0;
			return { picker, calls, selections, pickerSelections, direct, active, status, get shown() { return shown; } };
		}

		test('a non-active direct model is selected at once and starts loading, without a dialog', () => {
			const result = createPicker();
			const { picker, calls, selections, pickerSelections, direct } = result;
			picker.show(upcastPartial<HTMLElement>({ closest: () => null }));
			const context = result.shown!.context;
			// The On This Device tab's rows, given the selection the tabbed picker supplies.
			const localModels = context.localModels!;
			const rows = localModels.getItems({
				models: context.models.filter(model => !!localModels.getDirectModel(model)),
				selectedModelId: context.selectedModelId,
				configurationAccess: context.configurationAccess,
				select: model => context.onSelect(model),
				showDetails: () => { },
			});
			rows.find(row => row.item?.id === direct.identifier)!.item!.run();
			assert.deepStrictEqual({
				tab: summarize(rows),
				calls,
				selections,
				selected: picker.selectedModel?.metadata.id,
				pickerSelections,
			}, {
				tab: [
					expectedRow('Not loaded', 'blank', { id: direct.identifier }),
					{ ...expectedRow(undefined, 'check', { id: `${SessionType.AgentHostCopilot}:${OTHER_MODEL_ID}`, label: 'Qwen Coder', badge: 'Active', notes: ['Effort Level: On, Context: 128K', 'No usage limit'], details: 'On \u00b7 128K' }), checked: true },
				],
				calls: [`makeActive:${FAMILY_ID}`],
				selections: [direct.identifier],
				selected: MODEL_ID,
				pickerSelections: [],
			});
		});

		test('the readout of a selected on-device model states its thinking level and context size, or only its state while it loads, and opens its detail page', () => {
			const result = createPicker();
			const container = document.createElement('div');
			document.body.appendChild(container);
			store.add({ dispose: () => container.remove() });
			result.picker.render(container);
			const readout = container.querySelector<HTMLElement>('.model-picker-config')!;
			const describe = () => ({ text: readout.textContent, ariaLabel: readout.getAttribute('aria-label'), hasPopup: readout.getAttribute('aria-haspopup'), visible: readout.style.display !== 'none' });
			const before = describe();
			result.status.set(createStatus([createFamily({ install }), { ...otherFamily, context: qwenContext }], activeFor(otherFamily.familyId, { server: 'starting', load: { step: 'loading', startedAt: 0 } })), undefined);
			const loading = describe();
			readout.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
			assert.deepStrictEqual({ before, loading, detailsModelId: result.shown?.detailsModelId }, {
				before: { text: 'On \u00b7 128K', ariaLabel: 'Qwen Coder details, Effort Level: On, Context: 128K', hasPopup: 'dialog', visible: true },
				loading: { text: 'Loading…', ariaLabel: 'Qwen Coder details, Loading model…, Effort Level: On, Context: 128K', hasPopup: 'dialog', visible: true },
				detailsModelId: result.active.identifier,
			});
		});
	});
});
