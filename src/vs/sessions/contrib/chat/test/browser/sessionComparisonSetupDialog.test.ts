/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ReasoningEffortConfigKey } from '../../../../../platform/agentHost/common/reasoningEffort.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { applySessionComparisonModelConfigurationDefaults, getSessionComparisonModelConfigurationLabel, getSessionComparisonModelPickerPresentationOptions, getSessionComparisonWorkspaceError, resolveSessionComparisonHarnessModel, SessionComparisonDialogResizeController, SessionComparisonSetupDialog, selectSessionComparisonPermission } from '../../browser/sessionComparisonSetupDialog.js';
import { getSessionComparisonHarnessDisplayLabel, ISessionComparisonAttemptConfiguration, ISessionComparisonHarness } from '../../../../services/sessions/common/sessionComparison.js';

const WIDTH_STORAGE_KEY = 'sessions.comparisonSetupDialog.width';
const HEIGHT_STORAGE_KEY = 'sessions.comparisonSetupDialog.height';

suite('SessionComparisonDialogResizeController', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createController(storageService: TestStorageService): { dialog: HTMLElement; body: HTMLElement } {
		const dialog = dom.append(mainWindow.document.body, dom.$('.session-comparison-setup-dialog'));
		const body = dom.append(dialog, dom.$('.session-comparison-setup-body'));
		disposables.add({ dispose: () => dialog.remove() });
		disposables.add(new SessionComparisonDialogResizeController(dialog, body, storageService));
		return { dialog, body };
	}

	test('keeps the default size when no dimensions are stored', () => {
		const storageService = disposables.add(new TestStorageService());
		const { dialog } = createController(storageService);

		assert.deepStrictEqual({
			width: dialog.style.width,
			height: dialog.style.height,
		}, {
			width: '',
			height: '',
		});

	});

	test('restores stored dimensions and clamps them to the viewport', () => {
		const storageService = disposables.add(new TestStorageService());
		storageService.store(WIDTH_STORAGE_KEY, mainWindow.innerWidth * 2, StorageScope.PROFILE, StorageTarget.MACHINE);
		storageService.store(HEIGHT_STORAGE_KEY, 480, StorageScope.PROFILE, StorageTarget.MACHINE);

		const { dialog } = createController(storageService);

		assert.deepStrictEqual({
			width: dialog.style.width,
			height: dialog.style.height,
		}, {
			width: `${Math.floor(mainWindow.innerWidth * 0.9)}px`,
			height: '480px',
		});
	});

	test('places the content scrollbar at the dialog edge without moving the form content', () => {
		const storageService = disposables.add(new TestStorageService());
		const { body } = createController(storageService);
		body.style.width = '400px';
		body.style.setProperty('--vscode-spacing-size320', '32px');
		const scroll = dom.append(body, dom.$('.session-comparison-setup-content-scroll'));
		const content = dom.append(scroll, dom.$('.session-comparison-setup-content'));

		assert.deepStrictEqual({
			scrollWidth: scroll.getBoundingClientRect().width,
			scrollRightOffset: scroll.getBoundingClientRect().right - body.getBoundingClientRect().right,
			contentRightPadding: mainWindow.getComputedStyle(content).paddingRight,
		}, {
			scrollWidth: 432,
			scrollRightOffset: 32,
			contentRightPadding: '32px',
		});
	});

	test('keeps the title and description spacing stable between setup steps', () => {
		const dialog = dom.append(mainWindow.document.body, dom.$('.monaco-dialog-box.session-comparison-setup-dialog'));
		const messageRow = dom.append(dialog, dom.$('.dialog-message-row'));
		const messageContainer = dom.append(messageRow, dom.$('.dialog-message-container'));
		const message = dom.append(messageContainer, dom.$('.dialog-message'));
		const detail = dom.append(messageContainer, dom.$('.dialog-message-detail'));
		disposables.add({ dispose: () => dialog.remove() });

		assert.deepStrictEqual({
			message: {
				grow: mainWindow.getComputedStyle(message).flexGrow,
				shrink: mainWindow.getComputedStyle(message).flexShrink,
			},
			detail: {
				grow: mainWindow.getComputedStyle(detail).flexGrow,
				shrink: mainWindow.getComputedStyle(detail).flexShrink,
			},
		}, {
			message: { grow: '0', shrink: '0' },
			detail: { grow: '0', shrink: '0' },
		});
	});

	suite('SessionComparisonPermissions', () => {
		const options = [{
			id: 'default',
			label: 'Default',
			description: 'Default permissions.',
			isDefault: true,
		}, {
			id: 'assisted',
			label: 'Assisted',
			description: 'Assisted permissions.',
		}, {
			id: 'allowAll',
			label: 'Allow all',
			description: 'Allow all permissions.',
			isAllowAll: true,
		}];

		test('selects provider permissions from checked, unchecked, and mixed bulk state', () => {
			assert.deepStrictEqual({
				checked: selectSessionComparisonPermission(options, 'default', true)?.id,
				unchecked: selectSessionComparisonPermission(options, 'allowAll', false)?.id,
				mixed: selectSessionComparisonPermission(options, 'assisted', 'mixed')?.id,
				mixedMissing: selectSessionComparisonPermission(options, 'missing', 'mixed')?.id,
				lockedAllowAll: selectSessionComparisonPermission(options.map(option => option.isAllowAll ? { ...option, locked: true } : option), 'default', true)?.id,
			}, {
				checked: 'allowAll',
				unchecked: 'default',
				mixed: 'assisted',
				mixedMissing: 'default',
				lockedAllowAll: 'default',
			});
		});
	});

	test('resizes and persists dimensions with the keyboard', () => {
		const storageService = disposables.add(new TestStorageService());
		const { dialog, body } = createController(storageService);
		dialog.style.width = '560px';
		dialog.style.height = '400px';
		const widthHandle = body.querySelector<HTMLElement>('.session-comparison-setup-resize-width');
		assert.ok(widthHandle);

		widthHandle.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

		assert.deepStrictEqual({
			width: dialog.style.width,
			storedWidth: storageService.getNumber(WIDTH_STORAGE_KEY, StorageScope.PROFILE),
			storedHeight: storageService.getNumber(HEIGHT_STORAGE_KEY, StorageScope.PROFILE),
			ariaValue: widthHandle.getAttribute('aria-valuenow'),
		}, {
			width: '580px',
			storedWidth: 580,
			storedHeight: 400,
			ariaValue: '580',
		});
	});

	suite('setup behavior', () => {
		test('uses grouped model picker presentation options for comparison setup', () => {
			assert.deepStrictEqual({
				withAuto: getSessionComparisonModelPickerPresentationOptions(true),
				withoutAuto: getSessionComparisonModelPickerPresentationOptions(false),
			}, {
				withAuto: {
					useGroupedModelPicker: true,
					showFeatured: false,
					showUnavailableFeatured: false,
					showManageModelsAction: false,
					showAutoModel: true,
					showModelIcon: false,
				},
				withoutAuto: {
					useGroupedModelPicker: true,
					showFeatured: false,
					showUnavailableFeatured: false,
					showManageModelsAction: false,
					showAutoModel: false,
					showModelIcon: false,
				},
			});
		});

		test('selects a concrete default model for harnesses without Auto', () => {
			const auto = upcastPartial<ILanguageModelChatMetadataAndIdentifier>({
				identifier: 'copilot/auto',
				metadata: upcastPartial<ILanguageModelChatMetadata>({ id: 'auto', name: 'Auto' }),
			});
			const claude = upcastPartial<ILanguageModelChatMetadataAndIdentifier>({
				identifier: 'claude/opus',
				metadata: upcastPartial<ILanguageModelChatMetadata>({ id: 'opus', name: 'Claude Opus' }),
			});
			const harness: ISessionComparisonHarness = {
				providerId: 'provider',
				sessionTypeId: 'claude',
				label: 'Claude',
			};
			const withAuto = resolveSessionComparisonHarnessModel(harness, [auto, claude]);
			const withoutAuto = resolveSessionComparisonHarnessModel(harness, [claude]);
			const unavailable = resolveSessionComparisonHarnessModel({
				...harness,
				modelId: 'claude/removed',
				modelLabel: 'Removed',
				modelConfiguration: { thinkingLevel: 'high' },
			}, [claude]);

			assert.deepStrictEqual({
				withAuto: {
					modelId: withAuto.harness.modelId,
					selected: withAuto.selectedModel?.identifier,
				},
				withoutAuto: {
					modelId: withoutAuto.harness.modelId,
					modelLabel: withoutAuto.harness.modelLabel,
					selected: withoutAuto.selectedModel?.identifier,
				},
				unavailable: {
					modelId: unavailable.harness.modelId,
					modelConfiguration: unavailable.harness.modelConfiguration,
					hadUnavailableModel: unavailable.hadUnavailableModel,
				},
			}, {
				withAuto: {
					modelId: undefined,
					selected: 'copilot/auto',
				},
				withoutAuto: {
					modelId: 'claude/opus',
					modelLabel: 'Claude Opus',
					selected: 'claude/opus',
				},
				unavailable: {
					modelId: 'claude/opus',
					modelConfiguration: undefined,
					hadUnavailableModel: true,
				},
			});
		});

		test('captures the model defaults displayed in comparison setup', () => {
			const model = upcastPartial<ILanguageModelChatMetadataAndIdentifier>({
				identifier: 'claude/opus',
				metadata: upcastPartial<ILanguageModelChatMetadata>({
					id: 'opus',
					name: 'Claude Opus',
					configurationSchema: {
						type: 'object',
						properties: {
							thinkingLevel: { type: 'string', default: 'high' },
							contextSize: { type: 'number', default: 272000 },
							unsupported: { type: 'object', default: { enabled: true } },
						},
					},
				}),
			});
			const harness: ISessionComparisonHarness = {
				providerId: 'provider',
				sessionTypeId: 'claude',
				label: 'Claude',
				modelId: model.identifier,
				modelLabel: model.metadata.name,
			};

			assert.deepStrictEqual({
				defaults: applySessionComparisonModelConfigurationDefaults(harness, model).modelConfiguration,
				override: applySessionComparisonModelConfigurationDefaults({
					...harness,
					modelConfiguration: { thinkingLevel: 'max' },
				}, model).modelConfiguration,
			}, {
				defaults: {
					thinkingLevel: 'high',
					contextSize: 272000,
				},
				override: {
					thinkingLevel: 'max',
					contextSize: 272000,
				},
			});
		});

		test('labels Auto attempts with their effective Optimize for value', () => {
			const auto = upcastPartial<ILanguageModelChatMetadataAndIdentifier>({
				identifier: 'copilot/auto',
				metadata: upcastPartial<ILanguageModelChatMetadata>({
					id: 'auto',
					name: 'Auto',
					configurationSchema: {
						type: 'object',
						properties: {
							tier: {
								type: 'string',
								group: 'navigation',
								enum: ['eco', 'balanced', 'max'],
								enumItemLabels: ['Efficiency', 'Balance', 'Intelligence'],
								default: 'balanced',
							},
						},
					},
				}),
			});
			const harness: ISessionComparisonHarness = {
				providerId: 'provider',
				sessionTypeId: 'copilot',
				label: 'Copilot',
			};
			const balanced = applySessionComparisonModelConfigurationDefaults(harness, auto);
			const intelligence = applySessionComparisonModelConfigurationDefaults({
				...harness,
				modelConfiguration: { tier: 'max' },
			}, auto);

			assert.deepStrictEqual({
				balanced: {
					configuration: balanced.modelConfiguration,
					configurationLabel: balanced.modelConfigurationLabel,
					harnessLabel: getSessionComparisonHarnessDisplayLabel(balanced),
				},
				intelligence: {
					configurationLabel: getSessionComparisonModelConfigurationLabel(intelligence, auto),
					harnessLabel: getSessionComparisonHarnessDisplayLabel(intelligence),
				},
				concreteModelLabel: getSessionComparisonHarnessDisplayLabel({
					...harness,
					modelId: 'grok/4.6',
					modelLabel: 'Grok 4.6',
					modelConfiguration: { [ReasoningEffortConfigKey]: 'medium' },
				}),
			}, {
				balanced: {
					configuration: { tier: 'balanced' },
					configurationLabel: 'Balance',
					harnessLabel: 'Copilot · Balance',
				},
				intelligence: {
					configurationLabel: 'Intelligence',
					harnessLabel: 'Copilot · Intelligence',
				},
				concreteModelLabel: 'Copilot · Grok 4.6 · Medium',
			});
		});

		test('applies and clears bulk permissions for attempts and evaluators', () => {
			const applyBulkPermissionSelection = Reflect.get(SessionComparisonSetupDialog.prototype, '_applyBulkPermissionSelection') as (
				this: object,
				attempts: readonly ISessionComparisonAttemptConfiguration[],
				judgeHarness: ISessionComparisonHarness,
				synthesisHarness: ISessionComparisonHarness,
				allowAll: boolean,
			) => {
				readonly attempts: readonly ISessionComparisonAttemptConfiguration[];
				readonly judgeHarness: ISessionComparisonHarness;
				readonly synthesisHarness: ISessionComparisonHarness;
			};
			const dialog = Object.create(SessionComparisonSetupDialog.prototype);
			Reflect.set(dialog, 'sessionsProvidersService', {
				getProvider: () => ({
					getPermissionOptionsForCreation: (sessionTypeId: string) => [
						{ id: 'default', label: 'Default', description: 'Default permissions', isDefault: true },
						{ id: 'allowAll', label: 'Allow All', description: 'Allow all permissions', isAllowAll: true, comparisonModeId: sessionTypeId === 'copilotcli' ? 'autopilot' : undefined },
					],
				}),
			});
			const attempts = [
				{ id: 'one', harness: { providerId: 'provider', sessionTypeId: 'copilotcli', label: 'One', permissionId: 'default', permissionLabel: 'Default' } },
				{ id: 'two', harness: { providerId: 'provider', sessionTypeId: 'two', label: 'Two', permissionId: 'default', permissionLabel: 'Default' } },
			];
			const judgeHarness = { providerId: 'provider', sessionTypeId: 'judge', label: 'Judge', permissionId: 'default', permissionLabel: 'Default' };
			const synthesisHarness = { providerId: 'provider', sessionTypeId: 'synthesis', label: 'Synthesizer', permissionId: 'default', permissionLabel: 'Default' };

			const allowed = applyBulkPermissionSelection.call(dialog, attempts, judgeHarness, synthesisHarness, true);
			const defaults = applyBulkPermissionSelection.call(dialog, allowed.attempts, allowed.judgeHarness, allowed.synthesisHarness, false);

			assert.deepStrictEqual({
				allowed: [...allowed.attempts.map(attempt => attempt.harness.permissionId), allowed.judgeHarness.permissionId, allowed.synthesisHarness.permissionId],
				allowedModes: [...allowed.attempts.map(attempt => attempt.harness.modeId), allowed.judgeHarness.modeId, allowed.synthesisHarness.modeId],
				defaults: [...defaults.attempts.map(attempt => attempt.harness.permissionId), defaults.judgeHarness.permissionId, defaults.synthesisHarness.permissionId],
				defaultModes: [...defaults.attempts.map(attempt => attempt.harness.modeId), defaults.judgeHarness.modeId, defaults.synthesisHarness.modeId],
			}, {
				allowed: ['allowAll', 'allowAll', 'allowAll', 'allowAll'],
				allowedModes: ['autopilot', undefined, undefined, undefined],
				defaults: ['default', 'default', 'default', 'default'],
				defaultModes: [undefined, undefined, undefined, undefined],
			});
		});

		test('keeps setup dialog controls in the keyboard focus loop', () => {
			const dialogElement = dom.append(mainWindow.document.body, dom.$('.session-comparison-setup-dialog'));
			const first = dom.append(dialogElement, dom.$('button'));
			const second = dom.append(dialogElement, dom.$('select'));
			const third = dom.append(dialogElement, dom.$('button'));
			for (const element of [first, second, third]) {
				Object.defineProperty(element, 'getClientRects', { value: () => [{}] });
			}
			disposables.add({ dispose: () => dialogElement.remove() });
			const store = disposables.add(new DisposableStore());
			const registerFocusNavigation = Reflect.get(SessionComparisonSetupDialog.prototype, '_registerFocusNavigation') as (this: object, dialogElement: HTMLElement, store: DisposableStore) => void;
			registerFocusNavigation.call(Object.create(SessionComparisonSetupDialog.prototype), dialogElement, store);
			let fallbackEvents = 0;
			store.add(dom.addDisposableListener(mainWindow, dom.EventType.KEY_DOWN, () => fallbackEvents++, true));

			first.focus();
			first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }));
			const afterTab = mainWindow.document.activeElement;
			third.focus();
			third.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }));
			const afterWrap = mainWindow.document.activeElement;
			first.focus();
			first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, shiftKey: true, bubbles: true, cancelable: true }));
			const afterReverseWrap = mainWindow.document.activeElement;

			assert.deepStrictEqual({
				afterTab,
				afterWrap,
				afterReverseWrap,
				fallbackEvents,
			}, {
				afterTab: second,
				afterWrap: first,
				afterReverseWrap: third,
				fallbackEvents: 0,
			});
		});

		test('keeps focus on information buttons when showing their hover', () => {
			const target = mainWindow.document.createElement('button');
			let hoverFocus: boolean | undefined = true;
			const dialog = Object.create(SessionComparisonSetupDialog.prototype);
			Reflect.set(dialog, 'hoverService', {
				showInstantHover: (_options: object, focus?: boolean) => {
					hoverFocus = focus;
				},
			});
			const showInfoHover = Reflect.get(SessionComparisonSetupDialog.prototype, '_showInfoHover') as (this: object, target: HTMLElement, content: string) => void;

			showInfoHover.call(dialog, target, 'Description');

			assert.strictEqual(hoverFocus, undefined);
		});

		test('requires a Git remote after resolving the repository', () => {
			assert.deepStrictEqual({
				noRepository: getSessionComparisonWorkspaceError(undefined, false),
				noRemote: getSessionComparisonWorkspaceError('main', false),
				unknownRemote: getSessionComparisonWorkspaceError('main', undefined),
				ready: getSessionComparisonWorkspaceError('main', true),
			}, {
				noRepository: 'Run and Compare Agents requires a Git repository with at least one commit.',
				noRemote: 'Comparisons require a Git remote.',
				unknownRemote: undefined,
				ready: undefined,
			});
		});

	});
});
