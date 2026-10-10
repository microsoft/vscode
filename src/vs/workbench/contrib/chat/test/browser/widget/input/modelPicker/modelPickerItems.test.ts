/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { ActionListItemKind, IActionListItem } from '../../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetDropdownAction } from '../../../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { getControlModelsForEntitlement, getModelPickerAccessibilityProvider, getModelPickerControlModels } from '../../../../../browser/widget/input/modelPicker/modelPickerItems.js';
import { createModelAction, createModelItem } from '../../../../../browser/widget/input/modelPicker/modelPickerItemPrimitives.js';
import { buildModelPickerDestinations } from '../../../../../browser/widget/input/modelPicker/modelPickerTabs.js';
import { filterModelsForSession } from '../../../../../browser/widget/input/chatInputModelUtils.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../../common/constants.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, IModelsControlManifest } from '../../../../../common/languageModels.js';
import { ChatEntitlement } from '../../../../../../../services/chat/common/chatEntitlementService.js';

function createModel(id: string, name: string, vendor = 'copilot'): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: `${vendor}-${id}`,
		metadata: {
			id,
			name,
			vendor,
			version: id,
			family: vendor,
			maxInputTokens: 128000,
			maxOutputTokens: 4096,
			isDefaultForLocation: {},
		} as ILanguageModelChatMetadata,
	};
}

/**
 * Builds an agent-host model: all such models share a single vendor (the
 * `agent-host-<type>` session type) but declare their upstream provider's
 * vendor id via `modelGroup`.
 */
function createAgentHostModel(id: string, name: string, modelGroup: { id: string; sourceId?: string }): ILanguageModelChatMetadataAndIdentifier {
	const vendor = 'agent-host-copilotcli';
	return {
		identifier: `${vendor}:${id}`,
		metadata: {
			id,
			name,
			vendor,
			version: '1.0',
			family: id,
			maxInputTokens: 128000,
			maxOutputTokens: 4096,
			isDefaultForLocation: {},
			targetChatSessionType: vendor,
			modelGroup,
		} as ILanguageModelChatMetadata,
	};
}

/**
 * Builds a `ILanguageModelsService` stub that simulates BYOK provider
 * groups: each `vendors` entry advertises one or more user-configured
 * groups (mapping group name to model identifiers).
 */
function createLanguageModelsServiceStub(vendors: { vendor: string; displayName: string; groups: { name: string; modelIdentifiers: string[] }[] }[]): ILanguageModelsService {
	return {
		getModelConfigurationActions: () => [],
		getModelConfiguration: () => undefined,
		getVendors: () => vendors.map(v => ({ vendor: v.vendor, displayName: v.displayName })),
		getLanguageModelGroups: (vendor: string) => {
			const v = vendors.find(x => x.vendor === vendor);
			if (!v) {
				return [];
			}
			return v.groups.map(g => ({
				group: { vendor: v.vendor, name: g.name },
				modelIdentifiers: g.modelIdentifiers,
			}));
		},
	} as unknown as ILanguageModelsService;
}

/** A picker row for `model`, described the way the tabbed picker describes it. */
function createRow(model: ILanguageModelChatMetadataAndIdentifier): IActionListItem<IActionWidgetDropdownAction> {
	const { action, ariaDescription } = createModelAction(model, undefined, () => { });
	return { ...createModelItem(action), ariaDescription };
}

function createControlManifest(): IModelsControlManifest {
	return {
		free: {
			'free-model': { label: 'Free Model', featured: true, exists: true },
		},
		paid: {
			'paid-model': { label: 'Paid Model', featured: true, exists: true },
		},
	};
}

suite('getModelPickerAccessibilityProvider', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses radio semantics for model items', () => {
		const provider = getModelPickerAccessibilityProvider();
		assert.strictEqual(provider.getRole({ kind: ActionListItemKind.Action } as IActionListItem<IActionWidgetDropdownAction>), 'menuitemradio');
		assert.strictEqual(provider.getRole({ kind: ActionListItemKind.Separator } as IActionListItem<IActionWidgetDropdownAction>), 'separator');
		assert.strictEqual(provider.getWidgetRole(), 'menu');
	});

	test('search uses listbox options and announces the current model without menu check state', () => {
		const provider = getModelPickerAccessibilityProvider(true);
		const item: IActionListItem<IActionWidgetDropdownAction> = {
			kind: ActionListItemKind.Action,
			label: 'Test Model',
			item: {
				id: 'test-model',
				label: 'Test Model',
				enabled: true,
				checked: true,
				class: undefined,
				tooltip: '',
				run: () => { },
			},
		};
		assert.deepStrictEqual({
			role: provider.getRole(item),
			listRole: provider.getWidgetRole(),
			checked: provider.isChecked(item),
			label: provider.getAriaLabel(item),
			separatorRole: provider.getRole({ kind: ActionListItemKind.Separator }),
		}, {
			role: 'option',
			listRole: 'listbox',
			checked: undefined,
			label: 'Test Model, Current model',
			separatorRole: 'separator',
		});
	});

	test('includes inline source and right-aligned multiplier', () => {
		const provider = getModelPickerAccessibilityProvider();
		assert.strictEqual(provider.getAriaLabel({
			kind: ActionListItemKind.Action,
			label: 'Claude Opus 4.7',
			badge: 'Copilot',
			description: '15x',
		} as IActionListItem<IActionWidgetDropdownAction>), 'Claude Opus 4.7, Copilot, 15x');
	});

	test('prefers ariaDescription over description', () => {
		const provider = getModelPickerAccessibilityProvider();
		assert.strictEqual(provider.getAriaLabel({
			kind: ActionListItemKind.Action,
			label: 'Claude Sonnet 4.6',
			description: 'Copilot',
			ariaDescription: 'Medium cost',
		} as IActionListItem<IActionWidgetDropdownAction>), 'Claude Sonnet 4.6, Medium cost');
	});

	test('announces hover notices with their severity', () => {
		const model = createModel('gpt-4.1', 'GPT-4.1');
		model.metadata = {
			...model.metadata,
			priceCategory: 'medium',
			warningText: { data_retention: 'Prompts are **retained** for 30 days.' },
			infoText: { model_relocated: 'Now serves from a [new region](https://aka.ms/region).' },
		} as ILanguageModelChatMetadata;
		const provider = getModelPickerAccessibilityProvider();

		assert.strictEqual(
			provider.getAriaLabel(createRow(model)),
			'GPT-4.1, Medium cost, Warning: Prompts are retained for 30 days., Info: Now serves from a new region.');
	});

	test('leaves models without notices unchanged', () => {
		const provider = getModelPickerAccessibilityProvider();
		assert.strictEqual(provider.getAriaLabel(createRow(createModel('gpt-4.1', 'GPT-4.1'))), 'GPT-4.1');
	});
});

suite('getModelPickerControlModels', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('edu entitlement uses free featured control manifest', () => {
		const manifest = createControlManifest();
		assert.strictEqual(getControlModelsForEntitlement(manifest, ChatEntitlement.EDU), manifest.free);
	});

	test('available targeted models remain featured while entitlement is signed out', () => {
		const auto = createAgentHostModel('auto', 'Auto', { id: 'copilotcli' });
		const freeFeatured = createAgentHostModel('free-model', 'Free Model', { id: 'copilotcli' });
		const paidFeatured = createAgentHostModel('paid-model', 'Paid Model', { id: 'copilotcli' });
		const other = createAgentHostModel('other-model', 'Other Model', { id: 'copilotcli' });

		assert.deepStrictEqual(getModelPickerControlModels(createControlManifest(), ChatEntitlement.Unknown, [auto, freeFeatured, paidFeatured, other]), {
			'free-model': { label: 'Free Model', featured: true, exists: true },
			'paid-model': { label: 'Paid Model', featured: true, exists: true },
		});
	});

	test('signed-out control models exclude unavailable and BYOK models', () => {
		const manifest: IModelsControlManifest = {
			free: {
				'available-targeted': { label: 'Available Targeted', featured: true, exists: false },
				'unavailable-targeted': { label: 'Unavailable Targeted', featured: true, exists: false },
				'byok-model': { label: 'BYOK Model', featured: true, exists: true },
			},
			paid: {},
		};
		const availableTargeted = createAgentHostModel('available-targeted', 'Available Targeted', { id: 'copilotcli' });
		const baseByokModel = createAgentHostModel('byok-model', 'BYOK Model', { id: 'custom' });
		const byokModel = { ...baseByokModel, metadata: { ...baseByokModel.metadata, byokModelIdentifier: 'custom/byok-model' } };

		assert.deepStrictEqual(getModelPickerControlModels(manifest, ChatEntitlement.Unknown, [availableTargeted, byokModel]), {
			'available-targeted': { label: 'Available Targeted', featured: true, exists: true },
		});
	});
});

/**
 * Regression coverage for the chat model picker.
 *
 * Guards the end-to-end picker pipeline (`filterModelsForSession` →
 * `buildModelPickerDestinations`) against regressions where models contributed by a
 * `languageModelChatProvider` extension stop appearing in the picker even
 * though they remain visible in the model configuration view.
 *
 * Behavior under test: `metadata.isUserSelectable` defaults to `true`. Only an
 * explicit `false` hides a model from the picker; both `undefined` and `true`
 * make the model visible. This rule applies uniformly to the copilot vendor
 * and to third-party `languageModelChatProvider` vendors, and matches what
 * the model configuration view surfaces.
 */
suite('chat model picker - languageModelChatProvider visibility regression', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createCopilotModel(
		id: string,
		name: string,
		overrides: Partial<ILanguageModelChatMetadata> = {},
	): ILanguageModelChatMetadataAndIdentifier {
		return {
			identifier: `copilot/${id}`,
			metadata: {
				id,
				name,
				vendor: 'copilot',
				version: '1.0.0',
				family: 'copilot',
				maxInputTokens: 128_000,
				maxOutputTokens: 4_096,
				isDefaultForLocation: {},
				isUserSelectable: true,
				capabilities: { toolCalling: true, agentMode: true },
				...overrides,
			} as ILanguageModelChatMetadata,
		};
	}

	function createThirdPartyModel(
		id: string,
		name: string,
		overrides: Partial<ILanguageModelChatMetadata> = {},
	): ILanguageModelChatMetadataAndIdentifier {
		return {
			identifier: `my-vendor/${id}`,
			metadata: {
				id,
				name,
				vendor: 'my-vendor',
				version: '1.0.0',
				family: 'my-family',
				maxInputTokens: 128_000,
				maxOutputTokens: 4_096,
				isDefaultForLocation: {},
				capabilities: { toolCalling: true, agentMode: true },
				...overrides,
			} as ILanguageModelChatMetadata,
		};
	}

	/**
	 * Runs the full picker pipeline (`filterModelsForSession` →
	 * `buildModelPickerDestinations`) for an Ask-mode/Chat-location session and
	 * returns the models listed across every provider tab.
	 */
	function runPickerPipeline(
		models: ILanguageModelChatMetadataAndIdentifier[],
		languageModelsService: ILanguageModelsService,
	): { readonly label: string }[] {
		const filtered = filterModelsForSession(
			models,
			undefined,
			ChatModeKind.Ask,
			ChatAgentLocation.Chat,
		);
		return buildModelPickerDestinations(filtered, languageModelsService)
			.flatMap(destination => destination.models)
			.map(model => ({ label: model.metadata.name }));
	}

	/**
	 * Builds a one-group-per-vendor `ILanguageModelsService` stub on top of
	 * the file-level `createLanguageModelsServiceStub` helper.
	 */
	function buildLmService(
		vendors: { vendor: string; displayName: string; modelIdentifiers: string[] }[],
	): ILanguageModelsService {
		return createLanguageModelsServiceStub(
			vendors.map(v => ({
				vendor: v.vendor,
				displayName: v.displayName,
				groups: [{ name: v.displayName, modelIdentifiers: v.modelIdentifiers }],
			})),
		);
	}

	test('regression: third-party model with isUserSelectable omitted is shown in the picker', () => {
		// Original bug: a `languageModelChatProvider` model that omits
		// `isUserSelectable` was treated as falsy and dropped from the picker
		// even though the model configuration view kept showing it.
		const tp = createThirdPartyModel('tp', 'TP', { isUserSelectable: undefined });
		const lmService = buildLmService([
			{ vendor: 'my-vendor', displayName: 'My Vendor', modelIdentifiers: [tp.identifier] },
		]);

		const labels = runPickerPipeline([tp], lmService).map(i => i.label);
		assert.deepStrictEqual(
			labels,
			['TP'],
			'A third-party `languageModelChatProvider` model that omits isUserSelectable must still appear in the picker.',
		);
	});

	test('regression: third-party model with isUserSelectable: true is shown in the picker', () => {
		const tp = createThirdPartyModel('tp', 'TP', { isUserSelectable: true });
		const lmService = buildLmService([
			{ vendor: 'my-vendor', displayName: 'My Vendor', modelIdentifiers: [tp.identifier] },
		]);

		const labels = runPickerPipeline([tp], lmService).map(i => i.label);
		assert.deepStrictEqual(labels, ['TP']);
	});

	test('regression: third-party model with isUserSelectable: false is hidden from the picker', () => {
		// The default-to-true rule: only an explicit `false` hides a model.
		// This applies uniformly to copilot and third-party vendors.
		const tp = createThirdPartyModel('tp', 'TP', { isUserSelectable: false });
		const lmService = buildLmService([
			{ vendor: 'my-vendor', displayName: 'My Vendor', modelIdentifiers: [tp.identifier] },
		]);

		const labels = runPickerPipeline([tp], lmService).map(i => i.label);
		assert.deepStrictEqual(
			labels,
			[],
			'An explicit `isUserSelectable: false` must hide the model regardless of vendor.',
		);
	});

	test('regression: copilot internal model (isUserSelectable: false) is hidden from the picker', () => {
		const internal = createCopilotModel('internal', 'Internal', { isUserSelectable: false });
		const lmService = buildLmService([
			{ vendor: 'copilot', displayName: 'GitHub Copilot', modelIdentifiers: [internal.identifier] },
		]);

		const labels = runPickerPipeline([internal], lmService).map(i => i.label);
		assert.deepStrictEqual(
			labels,
			[],
			'Internal copilot models marked isUserSelectable: false must remain hidden from the picker.',
		);
	});

	test('regression: copilot model with omitted isUserSelectable defaults to visible', () => {
		// `isUserSelectable` defaults to `true` for every vendor, so a copilot
		// model that omits the flag is now treated as user-selectable.
		const model = createCopilotModel('public', 'Public', { isUserSelectable: undefined });
		const lmService = buildLmService([
			{ vendor: 'copilot', displayName: 'GitHub Copilot', modelIdentifiers: [model.identifier] },
		]);

		const labels = runPickerPipeline([model], lmService).map(i => i.label);
		assert.deepStrictEqual(labels, ['Public']);
	});

	test('regression: copilot public model (isUserSelectable: true) is shown in the picker', () => {
		const pub = createCopilotModel('gpt-4o', 'GPT-4o', { isUserSelectable: true });
		const lmService = buildLmService([
			{ vendor: 'copilot', displayName: 'GitHub Copilot', modelIdentifiers: [pub.identifier] },
		]);

		const labels = runPickerPipeline([pub], lmService).map(i => i.label);
		assert.deepStrictEqual(labels, ['GPT-4o']);
	});

	test('regression: mixed vendors - only explicit isUserSelectable: false models are hidden', () => {
		const copilotPublic = createCopilotModel('gpt-4o', 'GPT-4o', { isUserSelectable: true });
		const copilotInternal = createCopilotModel('internal', 'Internal', { isUserSelectable: false });
		const tpTrue = createThirdPartyModel('tp-true', 'TP True', { isUserSelectable: true });
		const tpFalse = createThirdPartyModel('tp-false', 'TP False', { isUserSelectable: false });
		const tpUndefined = createThirdPartyModel('tp-undef', 'TP Undef', { isUserSelectable: undefined });

		const lmService = buildLmService([
			{
				vendor: 'copilot',
				displayName: 'GitHub Copilot',
				modelIdentifiers: [copilotPublic.identifier, copilotInternal.identifier],
			},
			{
				vendor: 'my-vendor',
				displayName: 'My Vendor',
				modelIdentifiers: [tpTrue.identifier, tpFalse.identifier, tpUndefined.identifier],
			},
		]);

		const labels = runPickerPipeline(
			[copilotPublic, copilotInternal, tpTrue, tpFalse, tpUndefined],
			lmService,
		).map(i => i.label).sort();

		assert.deepStrictEqual(
			labels,
			['GPT-4o', 'TP True', 'TP Undef'],
			'Picker must show every model except those with an explicit isUserSelectable: false.',
		);
	});

	test('regression: third-party models without explicit opt-out match the configuration view', () => {
		// What the model configuration view shows: every model from
		// `getLanguageModelGroups`, regardless of `isUserSelectable`.
		// What the picker shows: the same set, minus models that the
		// extension explicitly opted out via `isUserSelectable: false`.
		const tpTrue = createThirdPartyModel('tp-true', 'TP True', { isUserSelectable: true });
		const tpUndefined = createThirdPartyModel('tp-undef', 'TP Undef', { isUserSelectable: undefined });
		const allThirdParty = [tpTrue, tpUndefined];

		const lmService = buildLmService([
			{
				vendor: 'my-vendor',
				displayName: 'My Vendor',
				modelIdentifiers: allThirdParty.map(m => m.identifier),
			},
		]);

		const configurationView = lmService.getLanguageModelGroups('my-vendor')
			.flatMap(g => g.modelIdentifiers)
			.sort();
		const picker = runPickerPipeline(allThirdParty, lmService)
			.map(i => allThirdParty.find(m => m.metadata.name === i.label)!.identifier)
			.sort();

		assert.deepStrictEqual(
			picker,
			configurationView,
			'When no third-party model opts out, the picker must show exactly the same models as the configuration view.',
		);
	});
});
