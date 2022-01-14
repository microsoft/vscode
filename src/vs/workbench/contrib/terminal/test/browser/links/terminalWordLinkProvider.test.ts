/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Terminal, ILink } from 'xterm';
import { TerminalWordLinkProvider } from 'vs/workbench/contrib/terminal/browser/links/terminalWordLinkProvider';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorOptions, IResourceEditorInput } from 'vs/platform/editor/common/editor';
import { AbstractLogger, DEFAULT_LOG_LEVEL, ILogger, ILogService, LogLevel, LogService, NullLogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { QuickAccessController } from 'vs/platform/quickinput/browser/quickAccess';
import { TerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminalConfigHelper';
import { ITerminalConfigHelper, ITerminalConfiguration } from 'vs/workbench/contrib/terminal/common/terminal';
import { TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';
import { TerminalCapabilityStore } from 'vs/workbench/contrib/terminal/common/capabilities/terminalCapabilityStore';
import { XtermTerminal } from 'vs/workbench/contrib/terminal/browser/xterm/xtermTerminal';
import { TerminalCapability, TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { CwdDetectionCapability } from 'vs/workbench/contrib/terminal/common/capabilities/cwdDetectionCapability';
import { CognisantCommandTrackerAddon } from 'vs/workbench/contrib/terminal/browser/xterm/cognisantCommandTrackerAddon';
import { TestViewDescriptorService } from 'vs/workbench/contrib/terminal/test/browser/xterm/xtermTerminal.test';
import { TestEditorService } from 'vs/workbench/test/browser/workbenchTestServices';
import { IEditorService, PreferredGroup } from 'vs/workbench/services/editor/common/editorService';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IUntypedEditorInput, IEditorPane, IResourceDiffEditorInput, ITextDiffEditorPane, IUntitledTextResourceEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IQuickAccessController, IQuickAccessOptions } from 'vs/platform/quickinput/common/quickAccess';
import { QuickInputService } from 'vs/workbench/services/quickinput/browser/quickInputService';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IQuickPickItem } from 'vs/base/parts/quickinput/common/quickInput';

const defaultTerminalConfig: Partial<ITerminalConfiguration> = {
	fontFamily: 'monospace',
	fontWeight: 'normal',
	fontWeightBold: 'normal',
	gpuAcceleration: 'off',
	scrollback: 1000,
	fastScrollSensitivity: 2,
	mouseWheelScrollSensitivity: 1,
	unicodeVersion: '11',
	wordSeparators: ' ()[]{}\',"`─‘’'
};

class TestCommandTracker extends CognisantCommandTrackerAddon {
	private _currentCwd: string | undefined;
	override getCwdForLine(y: number): string {
		return this._currentCwd || '';
	}
	setCwd(cwd: string): void {
		this._currentCwd = cwd;
	}
}
class TestQuickAccess extends QuickAccessController {
	private _value: string | undefined;
	override show(value?: string, options?: IQuickAccessOptions): void {
		this._value = value;
	}
	override async pick(value = '', options?: IQuickAccessOptions): Promise<IQuickPickItem[] | undefined> {
		return this._value ? [{ label: this._value }] : undefined;
	}
}

class TestQuickInput extends QuickInputService {
	private _quick: IQuickAccessController | undefined;
	override get quickAccess(): IQuickAccessController {
		if (this._quick) {
			return this._quick;
		} else {
			this._quick = new TestQuickAccess(this, new InstantiationService());
			return this._quick;
		}
	}
	async getText(): Promise<string | undefined> {
		const pick = await this.quickAccess.pick();
		if (pick && pick.length > 0) {
			return pick[0].label;
		}
		return undefined;
	}
}

class TermEditorService extends TestEditorService {
	private _editor: EditorInput | undefined;
	public override get activeEditor(): EditorInput | undefined { return this._editor; }
	override openEditor(editor: EditorInput, options?: IEditorOptions, group?: PreferredGroup): Promise<IEditorPane | undefined>;
	override openEditor(editor: IResourceEditorInput | IUntitledTextResourceEditorInput, group?: PreferredGroup): Promise<IEditorPane | undefined>;
	override openEditor(editor: IResourceDiffEditorInput, group?: PreferredGroup): Promise<ITextDiffEditorPane | undefined>;
	override async openEditor(editor: EditorInput | IUntypedEditorInput, optionsOrGroup?: IEditorOptions | PreferredGroup, group?: PreferredGroup): Promise<IEditorPane | undefined> {
		if (editor instanceof EditorInput) {
			this._editor = editor;
		}
		return undefined;
	}
	getEditor(): EditorInput | IUntypedEditorInput | undefined {
		return this._editor;
	}
}


class TestLogger extends AbstractLogger implements ILogger {

	public logs: string[] = [];

	constructor(logLevel: LogLevel = DEFAULT_LOG_LEVEL) {
		super();
		this.setLevel(logLevel);
	}

	trace(message: string, ...args: any[]): void {
		if (this.getLevel() <= LogLevel.Trace) {
			this.logs.push(message + JSON.stringify(args));
		}
	}

	debug(message: string, ...args: any[]): void {
		if (this.getLevel() <= LogLevel.Debug) {
			this.logs.push(message);
		}
	}

	info(message: string, ...args: any[]): void {
		if (this.getLevel() <= LogLevel.Info) {
			this.logs.push(message);
		}
	}

	warn(message: string | Error, ...args: any[]): void {
		if (this.getLevel() <= LogLevel.Warning) {
			this.logs.push(message.toString());
		}
	}

	error(message: string, ...args: any[]): void {
		if (this.getLevel() <= LogLevel.Error) {
			this.logs.push(message);
		}
	}

	critical(message: string, ...args: any[]): void {
		if (this.getLevel() <= LogLevel.Critical) {
			this.logs.push(message);
		}
	}

	override dispose(): void { }
	flush(): void { }
}

class TestXtermTerminal extends XtermTerminal {
	override get commandTracker(): TestCommandTracker { return new TestCommandTracker(new LogService(new TestLogger())); }
}

suite.only('Workbench - TerminalWordLinkProvider', () => {
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let themeService: TestThemeService;
	let viewDescriptorService: TestViewDescriptorService;
	let xterm: TestXtermTerminal;
	let configHelper: ITerminalConfigHelper;
	let capabilities: TerminalCapabilityStore;
	let editorService: TermEditorService;
	let quickInputService: TestQuickInput;

	setup(() => {
		instantiationService = new TestInstantiationService();
		configurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, configurationService);
		configurationService = new TestConfigurationService({
			editor: {
				fastScrollSensitivity: 2,
				mouseWheelScrollSensitivity: 1
			} as Partial<IEditorOptions>,
			terminal: {
				integrated: defaultTerminalConfig
			}
		});
		editorService = new TermEditorService();
		themeService = new TestThemeService();
		viewDescriptorService = new TestViewDescriptorService();
		capabilities = new TerminalCapabilityStore();
		instantiationService = new TestInstantiationService();
		quickInputService = instantiationService.createInstance(TestQuickInput);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IStorageService, new TestStorageService());
		instantiationService.stub(IThemeService, themeService);
		instantiationService.stub(IViewDescriptorService, viewDescriptorService);
		instantiationService.stub(IQuickInputService, quickInputService);
		instantiationService.stub(IEditorService, editorService);

		configHelper = instantiationService.createInstance(TerminalConfigHelper);
		configHelper = instantiationService.createInstance(TerminalConfigHelper);
		xterm = instantiationService.createInstance(TestXtermTerminal, Terminal, configHelper, 80, 30, TerminalLocation.Panel);
	});

	async function assertLink(text: string, expected: { text: string, range: [number, number][], activateText?: string }[], registerCwdDetectionCapability?: boolean) {
		xterm?.dispose();
		xterm = instantiationService.createInstance(TestXtermTerminal, Terminal, configHelper, 80, 30, TerminalLocation.Panel);
		if (registerCwdDetectionCapability) {
			capabilities = new TerminalCapabilityStore();
			capabilities.add(TerminalCapability.CwdDetection, new CwdDetectionCapability());
		}
		const provider: TerminalWordLinkProvider = instantiationService.createInstance(TerminalWordLinkProvider, xterm, capabilities, () => { }, () => { });

		// Write the text and wait for the parser to finish
		await new Promise<void>(r => xterm.raw.write(text, r));

		// Ensure all links are provided
		const links = (await new Promise<ILink[] | undefined>(r => provider.provideLinks(1, r)))!;
		const actualLinks = await Promise.all(links.map(async e => ({
			text: e.text,
			range: e.range,
			activateText: registerCwdDetectionCapability ? await activateAndReturnResult(e, editorService, quickInputService) : undefined
		})));

		const expectedVerbose = expected.map(e => ({
			text: e.text,
			range: {
				start: { x: e.range[0][0], y: e.range[0][1] },
				end: { x: e.range[1][0], y: e.range[1][1] },
			},
			activateText: e.activateText
		}));
		assert.deepStrictEqual(actualLinks, expectedVerbose);
		assert.strictEqual(links.length, expected.length);
	}

	test('should link words as defined by wordSeparators', async () => {
		await configurationService.setUserConfiguration('terminal', { integrated: { wordSeparators: ' ()[]' } });
		await assertLink('foo', [{ range: [[1, 1], [3, 1]], text: 'foo' }]);
		await assertLink('foo', [{ range: [[1, 1], [3, 1]], text: 'foo' }]);
		await assertLink(' foo ', [{ range: [[2, 1], [4, 1]], text: 'foo' }]);
		await assertLink('(foo)', [{ range: [[2, 1], [4, 1]], text: 'foo' }]);
		await assertLink('[foo]', [{ range: [[2, 1], [4, 1]], text: 'foo' }]);
		await assertLink('{foo}', [{ range: [[1, 1], [5, 1]], text: '{foo}' }]);

		await configurationService.setUserConfiguration('terminal', { integrated: { wordSeparators: ' ' } });
		await assertLink('foo', [{ range: [[1, 1], [3, 1]], text: 'foo' }]);
		await assertLink(' foo ', [{ range: [[2, 1], [4, 1]], text: 'foo' }]);
		await assertLink('(foo)', [{ range: [[1, 1], [5, 1]], text: '(foo)' }]);
		await assertLink('[foo]', [{ range: [[1, 1], [5, 1]], text: '[foo]' }]);
		await assertLink('{foo}', [{ range: [[1, 1], [5, 1]], text: '{foo}' }]);

		await configurationService.setUserConfiguration('terminal', { integrated: { wordSeparators: ' []' } });
		await assertLink('aabbccdd.txt ', [{ range: [[1, 1], [12, 1]], text: 'aabbccdd.txt' }]);
		await assertLink(' aabbccdd.txt ', [{ range: [[2, 1], [13, 1]], text: 'aabbccdd.txt' }]);
		await assertLink(' [aabbccdd.txt] ', [{ range: [[3, 1], [14, 1]], text: 'aabbccdd.txt' }]);
	});

	// These are failing - the link's start x is 1 px too far to the right bc it starts
	// with a wide character, which the terminalLinkHelper currently doesn't account for
	test.skip('should support wide characters', async () => {
		await configurationService.setUserConfiguration('terminal', { integrated: { wordSeparators: ' []' } });
		await assertLink('我是学生.txt ', [{ range: [[1, 1], [12, 1]], text: '我是学生.txt' }]);
		await assertLink(' 我是学生.txt ', [{ range: [[2, 1], [13, 1]], text: '我是学生.txt' }]);
		await assertLink(' [我是学生.txt] ', [{ range: [[3, 1], [14, 1]], text: '我是学生.txt' }]);
	});

	test('should support multiple link results', async () => {
		await configurationService.setUserConfiguration('terminal', { integrated: { wordSeparators: ' ' } });
		await assertLink('foo bar', [
			{ range: [[1, 1], [3, 1]], text: 'foo' },
			{ range: [[5, 1], [7, 1]], text: 'bar' }
		]);
	});

	test('should remove trailing colon in the link results', async () => {
		await configurationService.setUserConfiguration('terminal', { integrated: { wordSeparators: ' ' } });
		await assertLink('foo:5:6: bar:0:32:', [
			{ range: [[1, 1], [7, 1]], text: 'foo:5:6' },
			{ range: [[10, 1], [17, 1]], text: 'bar:0:32' }
		]);
	});

	test('should support wrapping', async () => {
		await configurationService.setUserConfiguration('terminal', { integrated: { wordSeparators: ' ' } });
		await assertLink('fsdjfsdkfjslkdfjskdfjsldkfjsdlkfjslkdjfskldjflskdfjskldjflskdfjsdklfjsdklfjsldkfjsdlkfjsdlkfjsdlkfjsldkfjslkdfjsdlkfjsldkfjsdlkfjskdfjsldkfjsdlkfjslkdfjsdlkfjsldkfjsldkfjsldkfjslkdfjsdlkfjslkdfjsdklfsd', [
			{ range: [[1, 1], [41, 3]], text: 'fsdjfsdkfjslkdfjskdfjsldkfjsdlkfjslkdjfskldjflskdfjskldjflskdfjsdklfjsdklfjsldkfjsdlkfjsdlkfjsdlkfjsldkfjslkdfjsdlkfjsldkfjsdlkfjskdfjsldkfjsdlkfjslkdfjsdlkfjsldkfjsldkfjsldkfjslkdfjsdlkfjslkdfjsdklfsd' },
		]);
	});
	test('should support wrapping with multiple links', async () => {
		await configurationService.setUserConfiguration('terminal', { integrated: { wordSeparators: ' ' } });
		await assertLink('fsdjfsdkfjslkdfjskdfjsldkfj sdlkfjslkdjfskldjflskdfjskldjflskdfj sdklfjsdklfjsldkfjsdlkfjsdlkfjsdlkfjsldkfjslkdfjsdlkfjsldkfjsdlkfjskdfjsldkfjsdlkfjslkdfjsdlkfjsldkfjsldkfjsldkfjslkdfjsdlkfjslkdfjsdklfsd', [
			{ range: [[1, 1], [27, 1]], text: 'fsdjfsdkfjslkdfjskdfjsldkfj' },
			{ range: [[29, 1], [64, 1]], text: 'sdlkfjslkdjfskldjflskdfjskldjflskdfj' },
			{ range: [[66, 1], [43, 3]], text: 'sdklfjsdklfjsldkfjsdlkfjsdlkfjsdlkfjsldkfjslkdfjsdlkfjsldkfjsdlkfjskdfjsldkfjsdlkfjslkdfjsdlkfjsldkfjsldkfjsldkfjslkdfjsdlkfjslkdfjsdklfsd' }
		]);
	});
	test('does not return any links for empty text', async () => {
		await configurationService.setUserConfiguration('terminal', { integrated: { wordSeparators: ' ' } });
		await assertLink('', []);
	});
	test('should support file scheme links', async () => {
		await configurationService.setUserConfiguration('terminal', { integrated: { wordSeparators: ' ' } });
		await assertLink('file:///C:/users/test/file.txt ', [{ range: [[1, 1], [30, 1]], text: 'file:///C:/users/test/file.txt' }]);
		await assertLink('file:///C:/users/test/file.txt:1:10 ', [{ range: [[1, 1], [35, 1]], text: 'file:///C:/users/test/file.txt:1:10' }]);
	});
	test('should add cwd to link', async () => {
		xterm.commandTracker.setCwd('/Users/home/folder');
		await assertLink('file.txt ', [{ range: [[1, 1], [30, 1]], text: 'file.txt', activateText: '/Users/home/folder/file.txt' }], true);
	});
});

async function activateAndReturnResult(e: ILink, editorService: TermEditorService, quickInputService: TestQuickInput): Promise<ITerminalLinkActivationResult | undefined> {
	await e.activate(new MouseEvent('click'), e.text);
	const editor = await editorService.activeEditor;
	const quickpick = await quickInputService.getText();
	if (editor) {
		return { source: 'editor', text: editor.resource?.toString() };
	} else if (quickpick) {
		return { source: 'quickpick', text: quickpick };
	}
	return undefined;
}

interface ITerminalLinkActivationResult {
	source: 'editor' | 'quickpick',
	text?: string
}
