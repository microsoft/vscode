/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok } from 'assert';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { ITunnelService } from '../../../../../../platform/tunnel/common/tunnel.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TerminalLinkManager } from '../../browser/terminalLinkManager.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { ITerminalConfiguration, ITerminalProcessManager } from '../../../../terminal/common/terminal.js';
import { ITerminalConfigurationService } from '../../../../terminal/browser/terminal.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { TerminalLinkResolver } from '../../browser/terminalLinkResolver.js';
import { ITerminalCapabilityImplMap, ITerminalCapabilityStore, TerminalCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import type { Terminal } from '@xterm/xterm';
import { importAMDNodeModule } from '../../../../../../amdX.js';

// Regex for checking for the "keyboard shortcut" text (appended in parentheses), e.g.:
//   "(alt + click)", "(ctrl + click)", "(command + click)", "(option + click)"
const KEYBOARD_SHORTCUT_REGEX = /\((alt|ctrl|command|option) \+ click\)/;

class TestTerminalLinkManager extends TerminalLinkManager {
	// Expose the protected method for testing
	public testGetLinkHoverString(uri: string, label: string | MarkdownString | undefined): string {
		// eslint-disable-next-line local/code-no-any-casts
		return (this as any)._getLinkHoverString(uri, label).value;
	}
}

suite('TerminalLinkManager - Tooltip Rendering', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let linkManager: TestTerminalLinkManager;
	let xterm: Terminal;

	setup(async () => {
		const defaultTerminalConfig: Partial<ITerminalConfiguration> = {
			fontFamily: 'monospace',
			fontWeight: 'normal',
			fontWeightBold: 'normal',
			gpuAcceleration: 'off',
			scrollback: 1000,
			fastScrollSensitivity: 2,
			mouseWheelScrollSensitivity: 1,
			unicodeVersion: '11',
			wordSeparators: ' ()[]{}\',"`─\'\'""',
			enableFileLinks: 'on',
		};
		configurationService = new TestConfigurationService({
			editor: { multiCursorModifier: 'ctrlCmd' },
			terminal: { integrated: defaultTerminalConfig },
		});

		instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITerminalLogService, new NullLogService());
		instantiationService.stub(ITerminalConfigurationService, {
			config: { allowedLinkSchemes: ['http', 'https', 'file'] },
		} as Partial<ITerminalConfigurationService>);
		instantiationService.stub(ITelemetryService, {
			publicLog2: () => { }
		} as Partial<ITelemetryService>);
		instantiationService.stub(INotificationService, {
			prompt: () => Promise.resolve(undefined)
		} as unknown as Partial<INotificationService>);
		instantiationService.stub(ITunnelService, {
			canTunnel: () => false
		} as Partial<ITunnelService>);

		const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
		xterm = store.add(new TerminalCtor({ allowProposedApi: true, cols: 80, rows: 30 }));

		const processInfo = <ITerminalProcessManager>{
			get initialCwd() { return '/home/user'; },
			os: OperatingSystem.Linux,
			remoteAuthority: undefined,
			userHome: '/home/user',
			backend: undefined,
		};

		const capabilities = <ITerminalCapabilityStore>{
			get<T extends TerminalCapability>(_cap: T): ITerminalCapabilityImplMap[T] | undefined {
				return undefined;
			}
		};

		linkManager = store.add(instantiationService.createInstance(
			TestTerminalLinkManager,
			xterm,
			processInfo,
			capabilities,
			instantiationService.createInstance(TerminalLinkResolver),
		));
	});

	test('should handle string tooltip (backward compatibility)', () => {
		const uri = 'https://example.com';
		const label = 'Visit example.com';
		const result = linkManager.testGetLinkHoverString(uri, label);

		const escapedLabel = new MarkdownString('', true).appendText(label).value;

		// Should contain the label text
		ok(result.length > 0, 'Result should not be empty');
		ok(result.includes(escapedLabel), 'Should contain the label text');
		ok(KEYBOARD_SHORTCUT_REGEX.test(result), 'Should contain keyboard shortcut');
		// Should contain the URI link
		ok(result.includes('https://example.com'), 'Should contain the URI');
	});

	test('should handle undefined tooltip', () => {
		const uri = 'https://example.com';
		const result = linkManager.testGetLinkHoverString(uri, undefined);

		// Should use fallback label
		ok(result.includes('Follow link'), 'Should use fallback label');
		ok(KEYBOARD_SHORTCUT_REGEX.test(result), 'Should contain keyboard shortcut');
		// Should contain the URI link
		ok(result.includes('https://example.com'), 'Should contain the URI');
	});

	test('should handle MarkdownString tooltip', () => {
		const uri = 'https://example.com';
		const markdownLabel = new MarkdownString('Open [example](https://example.com)');
		const result = linkManager.testGetLinkHoverString(uri, markdownLabel);

		// Should contain the markdown content
		ok(result.includes('Open [example](https://example.com)'), 'Should contain markdown content');
		ok(KEYBOARD_SHORTCUT_REGEX.test(result), 'Should contain keyboard shortcut');
		// Should contain the URI link
		ok(result.includes('https://example.com'), 'Should contain the URI');
	});

	test('should preserve MarkdownString properties', () => {
		const uri = 'https://example.com';
		const markdownLabel = new MarkdownString('**Bold text**', { isTrusted: true, supportThemeIcons: true });
		const result = linkManager.testGetLinkHoverString(uri, markdownLabel);

		// Should contain the markdown content
		ok(result.includes('**Bold text**'), 'Should contain markdown content');
		ok(KEYBOARD_SHORTCUT_REGEX.test(result), 'Should contain keyboard shortcut');
	});

	test('should handle MarkdownString with links', () => {
		const uri = 'https://example.com';
		const markdownLabel = new MarkdownString('Click [here](command:workbench.action.files.openFile) to open');
		const result = linkManager.testGetLinkHoverString(uri, markdownLabel);

		// Should contain the markdown link
		ok(result.includes('[here](command:workbench.action.files.openFile)'), 'Should contain markdown link');
		ok(KEYBOARD_SHORTCUT_REGEX.test(result), 'Should contain keyboard shortcut');
	});

	test('should handle empty string tooltip', () => {
		const uri = 'https://example.com';
		const result = linkManager.testGetLinkHoverString(uri, '');

		// Should use fallback label when empty string
		ok(result.includes('Follow link'), 'Should use fallback label');
		ok(KEYBOARD_SHORTCUT_REGEX.test(result), 'Should contain keyboard shortcut');
	});

	test('should handle file URI with spaces', () => {
		const uri = 'file:///path with spaces/file.txt';
		const label = 'Open file';
		const result = linkManager.testGetLinkHoverString(uri, label);

		// Should handle URI with spaces (replaced with "Link")
		ok(result.includes('Link') || result.includes('file:///path'), 'Should handle URI with spaces');
		ok(KEYBOARD_SHORTCUT_REGEX.test(result), 'Should contain keyboard shortcut');
	});

	test('should handle MarkdownString with code blocks', () => {
		const uri = 'https://example.com';
		const markdownLabel = new MarkdownString('Run `npm install` to install');
		const result = linkManager.testGetLinkHoverString(uri, markdownLabel);

		// Should contain the code block
		ok(result.includes('`npm install`'), 'Should contain code block');
		ok(KEYBOARD_SHORTCUT_REGEX.test(result), 'Should contain keyboard shortcut');
	});
});
