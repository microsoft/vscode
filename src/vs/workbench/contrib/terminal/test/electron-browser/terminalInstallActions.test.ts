/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok, strictEqual } from 'assert';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ICommandActionTitle } from '../../../../../platform/action/common/action.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Context } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import product from '../../../../../platform/product/common/product.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { TerminalLocation } from '../../../../../platform/terminal/common/terminal.js';
import { ChatEntitlementContextKeys, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ICreateTerminalOptions, ITerminalGroupService, ITerminalInstance, ITerminalService } from '../../browser/terminal.js';
import { InstallShellScriptAction } from '../../../../electron-browser/actions/installActions.js';
import { ChatConfiguration } from '../../../chat/common/constants.js';
import { InstallShellScriptWithCopilotAction, registerInstallShellScriptWithCopilotMenu } from '../../electron-browser/terminalInstallActions.js';

interface IRecordedPick {
	readonly items: readonly string[];
	readonly activeItem: string | undefined;
}

interface ISetupOptions {
	readonly shimExists?: boolean;
	readonly chatHidden?: boolean;
	readonly copilotCliEnabled?: boolean;
	readonly appRoot?: string;
	readonly userHome?: URI;
	readonly createTerminalError?: Error;
	readonly revealTerminalError?: Error;
	readonly fileError?: Error;
	readonly onPick?: () => void;
	readonly onFileExists?: () => void;
	readonly getCopilotCliEnabled?: () => boolean;
	readonly nativeInstallError?: Error;
}

function titleValue(title: string | ICommandActionTitle): string {
	return typeof title === 'string' ? title : title.value;
}

suite('TerminalInstallActions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createServices(pick: (IQuickPickItem & { readonly installCopilot: boolean }) | undefined, setup: ISetupOptions = {}) {
		const instantiationService = store.add(new TestInstantiationService());
		let nativeInstallCount = 0;
		let terminalCreateCount = 0;
		const recordedPicks: IRecordedPick[] = [];
		const terminalConfigs: ICreateTerminalOptions[] = [];
		const errors: string[] = [];
		const infos: string[] = [];
		const terminals: ITerminalInstance[] = [];

		instantiationService.stub(IConfigurationService, upcastPartial<IConfigurationService>({
			getValue: () => setup.getCopilotCliEnabled?.() ?? setup.copilotCliEnabled ?? true
		}));
		instantiationService.stub(IChatEntitlementService, upcastPartial<IChatEntitlementService>({
			sentiment: { hidden: setup.chatHidden }
		}));
		instantiationService.stub(IQuickInputService, upcastPartial<IQuickInputService>({
			pick: async (picks, options) => {
				const items = await picks;
				const pickItems = items.filter(item => item.type !== 'separator');
				const activeItem = options?.activeItem;
				recordedPicks.push({ items: pickItems.map(item => item.label), activeItem: activeItem instanceof Promise ? undefined : activeItem?.label });
				setup.onPick?.();
				const selected = pickItems.find(item => item.label === pick?.label);
				return selected;
			}
		}));
		instantiationService.stub(INativeHostService, upcastPartial<INativeHostService>({
			installShellCommand: async () => {
				nativeInstallCount++;
				if (setup.nativeInstallError) {
					throw setup.nativeInstallError;
				}
			}
		}));
		instantiationService.stub(IProductService, upcastPartial<IProductService>({
			applicationName: 'Code Insiders'
		}));
		instantiationService.stub(INativeEnvironmentService, upcastPartial<INativeEnvironmentService>({
			appRoot: setup.appRoot ?? '/Applications/Code Insiders.app/Contents/Resources/app',
			userHome: setup.userHome ?? URI.file('/Users/tester')
		}));
		instantiationService.stub(IFileService, upcastPartial<IFileService>({
			exists: async () => {
				setup.onFileExists?.();
				if (setup.fileError) {
					throw setup.fileError;
				}
				return setup.shimExists ?? true;
			}
		}));
		instantiationService.stub(IDialogService, upcastPartial<IDialogService>({
			info: async message => { infos.push(message); },
			error: async message => { errors.push(message); }
		}));
		instantiationService.stub(ITerminalService, upcastPartial<ITerminalService>({
			createTerminal: async terminalOptions => {
				terminalCreateCount++;
				ok(terminalOptions);
				terminalConfigs.push(terminalOptions);
				if (setup.createTerminalError) {
					throw setup.createTerminalError;
				}
				const terminal = upcastPartial<ITerminalInstance>({
					exitCode: undefined,
					onExit: Event.None
				});
				terminals.push(terminal);
				return terminal;
			},
			setActiveInstance: () => undefined
		}));
		instantiationService.stub(ITerminalGroupService, upcastPartial<ITerminalGroupService>({
			showPanel: async () => {
				if (setup.revealTerminalError) {
					throw setup.revealTerminalError;
				}
			}
		}));

		return {
			instantiationService,
			recordedPicks,
			terminalConfigs,
			errors,
			infos,
			terminals,
			get nativeInstallCount() { return nativeInstallCount; },
			get terminalCreateCount() { return terminalCreateCount; }
		};
	}

	test('uses a typed Yes/No pick with Yes initially active', async () => {
		const services = createServices({ label: 'No', installCopilot: false });
		await services.instantiationService.invokeFunction(accessor => new InstallShellScriptWithCopilotAction().run(accessor));

		strictEqual(services.recordedPicks.length, 1);
		const [pick] = services.recordedPicks;
		deepStrictEqual(pick.items, ['Yes', 'No']);
		strictEqual(pick.activeItem, 'Yes');
		strictEqual(services.terminalCreateCount, 0);
		strictEqual(services.nativeInstallCount, 1);
	});

	test('registers mutually exclusive palette labels for enabled, disabled, hidden, and unactivated Chat', () => {
		store.add(registerInstallShellScriptWithCopilotMenu());
		const legacyAction = new InstallShellScriptAction();
		const paletteEntries = MenuRegistry.getMenuItems(MenuId.CommandPalette)
			.filter(isIMenuItem)
			.filter(item => item.command.id === legacyAction.desc.id);
		strictEqual(paletteEntries.length, 2);
		const registeredCommand = MenuRegistry.getCommand(legacyAction.desc.id);
		ok(registeredCommand);
		strictEqual(registeredCommand.id, legacyAction.desc.id);
		strictEqual(titleValue(registeredCommand.title), titleValue(legacyAction.desc.title));
		strictEqual(registeredCommand.category, legacyAction.desc.category);

		const visibleTitles = (chatHidden: boolean, copilotCliEnabled: boolean) => {
			const context = new Context(-1, null);
			context.setValue(ChatEntitlementContextKeys.Setup.hidden.key, chatHidden);
			context.setValue(`config.${ChatConfiguration.CopilotCliCommandEnabled}`, copilotCliEnabled);
			return paletteEntries
				.filter(item => item.when?.evaluate(context))
				.map(item => titleValue(item.command.title));
		};

		deepStrictEqual(visibleTitles(false, true), [`Install '${product.applicationName}' and optionally 'copilot' commands in PATH`]);
		deepStrictEqual(visibleTitles(false, false), [titleValue(legacyAction.desc.title)]);
		deepStrictEqual(visibleTitles(true, true), [titleValue(legacyAction.desc.title)]);
		deepStrictEqual(visibleTitles(false, true), [`Install '${product.applicationName}' and optionally 'copilot' commands in PATH`]);
		deepStrictEqual(paletteEntries.find(item => titleValue(item.command.title) === titleValue(legacyAction.desc.title))?.command.category, legacyAction.desc.category);
	});

	test('does nothing when the optional-install pick is dismissed', async () => {
		const services = createServices(undefined);
		await services.instantiationService.invokeFunction(accessor => new InstallShellScriptWithCopilotAction().run(accessor));

		strictEqual(services.terminalCreateCount, 0);
		strictEqual(services.nativeInstallCount, 0);
	});

	test('starts a local terminal with the shipped shim argv before the native install', async () => {
		const services = createServices({ label: 'Yes', installCopilot: true });
		await services.instantiationService.invokeFunction(accessor => new InstallShellScriptWithCopilotAction().run(accessor));

		strictEqual(services.terminalCreateCount, 1);
		strictEqual(services.nativeInstallCount, 1);
		deepStrictEqual(services.terminalConfigs, [{
			config: {
				name: 'Install GitHub Copilot CLI',
				executable: URI.file('/Applications/Code Insiders.app/Contents/Resources/app/bin/copilot-shim/copilot').fsPath,
				args: ['--vscode-shim', 'install', '--interactive'],
				useShellEnvironment: true,
				isFeatureTerminal: true,
				isTransient: true,
				waitOnExit: true
			},
			cwd: URI.file('/Users/tester'),
			location: TerminalLocation.Panel,
			skipContributedProfileCheck: true
		}]);
		strictEqual(services.terminals[0].exitCode, undefined);
		strictEqual(services.infos.length, 1);
		strictEqual(services.infos[0].includes('Copilot'), false);
	});

	test('completes native installation while the Copilot terminal remains unfinished', async () => {
		const services = createServices({ label: 'Yes', installCopilot: true });
		await services.instantiationService.invokeFunction(accessor => new InstallShellScriptWithCopilotAction().run(accessor));

		strictEqual(services.nativeInstallCount, 1);
		strictEqual(services.terminals.length, 1);
		strictEqual(services.terminals[0].exitCode, undefined);
	});

	test('continues with the native install when the shipped shim is missing', async () => {
		const services = createServices({ label: 'Yes', installCopilot: true }, { shimExists: false });
		await services.instantiationService.invokeFunction(accessor => new InstallShellScriptWithCopilotAction().run(accessor));

		strictEqual(services.terminalCreateCount, 0);
		strictEqual(services.nativeInstallCount, 1);
		strictEqual(services.errors.length, 1);
	});

	test('uses the unchanged code-only action when Chat is hidden or policy disables the CLI command', async () => {
		for (const setup of [{ chatHidden: true }, { copilotCliEnabled: false }]) {
			const services = createServices({ label: 'Yes', installCopilot: true }, setup);
			await services.instantiationService.invokeFunction(accessor => new InstallShellScriptWithCopilotAction().run(accessor));

			strictEqual(services.recordedPicks.length, 0);
			strictEqual(services.terminalCreateCount, 0);
			strictEqual(services.nativeInstallCount, 1);
		}
	});

	test('preserves local executable and home URIs containing spaces and apostrophes', async () => {
		const services = createServices({ label: 'Yes', installCopilot: true }, {
			appRoot: '/Applications/Code Insiders\' Test.app/Contents/Resources/app',
			userHome: URI.file('/Users/tester\'s home')
		});
		await services.instantiationService.invokeFunction(accessor => new InstallShellScriptWithCopilotAction().run(accessor));

		deepStrictEqual(services.terminalConfigs, [{
			config: {
				name: 'Install GitHub Copilot CLI',
				executable: URI.file('/Applications/Code Insiders\' Test.app/Contents/Resources/app/bin/copilot-shim/copilot').fsPath,
				args: ['--vscode-shim', 'install', '--interactive'],
				useShellEnvironment: true,
				isFeatureTerminal: true,
				isTransient: true,
				waitOnExit: true
			},
			cwd: URI.file('/Users/tester\'s home'),
			location: TerminalLocation.Panel,
			skipContributedProfileCheck: true
		}]);
	});

	test('reports terminal creation and reveal failures while continuing native installation', async () => {
		for (const setup of [
			{ createTerminalError: new Error('create failed') },
			{ revealTerminalError: new Error('reveal failed') }
		]) {
			const services = createServices({ label: 'Yes', installCopilot: true }, setup);
			await services.instantiationService.invokeFunction(accessor => new InstallShellScriptWithCopilotAction().run(accessor));

			strictEqual(services.errors.length, 1);
			strictEqual(services.nativeInstallCount, 1);
		}
	});

	test('creates a separate terminal for each accepted optional installation', async () => {
		const services = createServices({ label: 'Yes', installCopilot: true });
		await services.instantiationService.invokeFunction(accessor => new InstallShellScriptWithCopilotAction().run(accessor));
		await services.instantiationService.invokeFunction(accessor => new InstallShellScriptWithCopilotAction().run(accessor));

		strictEqual(services.terminalCreateCount, 2);
		strictEqual(services.nativeInstallCount, 2);
		strictEqual(services.terminals.length, 2);
		strictEqual(services.terminals[0] === services.terminals[1], false);
		strictEqual(services.terminals[0].exitCode, undefined);
		strictEqual(services.terminals[1].exitCode, undefined);
	});

	test('does not start Copilot installation when permission changes during asynchronous preparation', async () => {
		let enabled = true;
		const services = createServices({ label: 'Yes', installCopilot: true }, {
			getCopilotCliEnabled: () => enabled,
			onFileExists: () => { enabled = false; }
		});
		await services.instantiationService.invokeFunction(accessor => new InstallShellScriptWithCopilotAction().run(accessor));

		strictEqual(services.terminalCreateCount, 0);
		strictEqual(services.nativeInstallCount, 1);
	});

	test('does not start Copilot installation when permission changes while the picker is open', async () => {
		let enabled = true;
		const services = createServices({ label: 'Yes', installCopilot: true }, {
			getCopilotCliEnabled: () => enabled,
			onPick: () => { enabled = false; }
		});
		await services.instantiationService.invokeFunction(accessor => new InstallShellScriptWithCopilotAction().run(accessor));

		strictEqual(services.terminalCreateCount, 0);
		strictEqual(services.nativeInstallCount, 1);
	});

	test('reports an invalid shipped shim and still installs the native command', async () => {
		const services = createServices({ label: 'Yes', installCopilot: true }, { fileError: new Error('invalid shim') });
		await services.instantiationService.invokeFunction(accessor => new InstallShellScriptWithCopilotAction().run(accessor));

		strictEqual(services.errors.length, 1);
		strictEqual(services.terminalCreateCount, 0);
		strictEqual(services.nativeInstallCount, 1);
	});

	test('retains legacy native error and cancellation handling after the optional flow', async () => {
		const nativeError = createServices({ label: 'No', installCopilot: false }, { nativeInstallError: new Error('native failed') });
		await nativeError.instantiationService.invokeFunction(accessor => new InstallShellScriptWithCopilotAction().run(accessor));
		strictEqual(nativeError.nativeInstallCount, 1);
		strictEqual(nativeError.errors.length, 1);

		const cancellation = createServices({ label: 'No', installCopilot: false }, { nativeInstallError: new CancellationError() });
		await cancellation.instantiationService.invokeFunction(accessor => new InstallShellScriptWithCopilotAction().run(accessor));
		strictEqual(cancellation.nativeInstallCount, 1);
		strictEqual(cancellation.errors.length, 0);
	});
});
