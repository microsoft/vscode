/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Schemas } from '../../../../../base/common/network.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { isObject } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { fromAgentHostUri, toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IStat } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { TestColorTheme, TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING, SessionsChatBackgroundService } from '../../../../services/chatBackground/browser/chatBackgroundService.js';
import { IChat, ISession, ISessionFolder, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SetChatBackgroundTool } from '../../browser/chatBackgroundTool.js';
import { AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING } from '../../common/constants.js';

class WritableConfigurationService extends TestConfigurationService {
	override updateValue(key: string, value: unknown): Promise<void> {
		return this.setUserConfiguration(key, value);
	}
}

/** Reports every file as last modified long ago, so that pruning does not spare it as a fresh import. */
class AgedFileSystemProvider extends InMemoryFileSystemProvider {
	override async stat(resource: URI): Promise<IStat> {
		return { ...await super.stat(resource), mtime: 0 };
	}
}

const AGENT_HOST_SCHEME = 'vscode-agent-host';
const chatResource = URI.parse('test-chat:/chat');
const importFolder = URI.file('/storage/agentsChatBackgrounds/profile');

interface IInvokeResult {
	readonly error?: string | boolean;
	/** The output as the model receives it. */
	readonly raw?: {
		readonly background: { readonly image?: string; readonly layout?: string };
		readonly previous: { readonly image?: string };
	};
	/** The output with stable placeholders, see {@link redact}. */
	readonly output?: unknown;
	readonly message?: unknown;
}

/** Replaces the import folder and content hashes, which vary by platform and content, with stable placeholders. */
function redact(value: unknown): unknown {
	if (typeof value === 'string') {
		const redacted = value.startsWith(importFolder.fsPath) ? `<store>/${basename(URI.file(value))}` : value;
		return redacted.replace(/-[\da-f]{12}\./, '-<hash>.');
	}
	if (Array.isArray(value)) {
		return value.map(redact);
	}
	if (isObject(value)) {
		return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redact(entry)]));
	}
	return value;
}

suite('Sessions - Set Chat Background tool', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function setup(workingDirectory: URI | undefined = URI.file('/work'), beforeMeasure?: () => Promise<void>) {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new AgedFileSystemProvider())));
		disposables.add(fileService.registerProvider(AGENT_HOST_SCHEME, disposables.add(new InMemoryFileSystemProvider())));
		const configurationService = new WritableConfigurationService({ [AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING]: true });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const themeService = new TestThemeService();
		const backgroundService = disposables.add(new SessionsChatBackgroundService(configurationService, themeService, disposables.add(new MockContextKeyService()), disposables.add(new InMemoryStorageService())));
		const workspace = constObservable(workingDirectory && upcastPartial<ISessionWorkspace>({ folders: [upcastPartial<ISessionFolder>({ workingDirectory })] }));
		const managementService = upcastPartial<ISessionsManagementService>({
			getSessionForChatResource: resource => isEqual(resource, chatResource)
				? { session: upcastPartial<ISession>({ workspace }), chat: upcastPartial<IChat>({ workspace }) }
				: undefined,
			getSession: () => undefined,
		});
		const tool = new class extends SetChatBackgroundTool {
			protected override async measureImage(image: URI) {
				await beforeMeasure?.();
				const size = /^image:(?<width>\d+)x(?<height>\d+)$/.exec((await fileService.readFile(image)).value.toString())?.groups;
				if (!size) {
					throw new Error('Could not decode the image.');
				}
				return { width: Number(size.width), height: Number(size.height) };
			}
		}(() => importFolder, backgroundService, managementService, fileService, themeService, new NullLogService(), configurationService);

		return {
			tool,
			fileService,
			configurationService,
			backgroundService,
			themeService,
			writeFile: (resource: URI, content: string) => fileService.writeFile(resource, VSBuffer.fromString(content)),
			/** Invokes the tool from the test chat, or without a chat context when `withContext` is false. */
			invoke: async (parameters: Record<string, unknown>, withContext = true): Promise<IInvokeResult> => {
				const result = await tool.invoke({ callId: 'call', toolId: 'tool', parameters, context: withContext ? { sessionResource: chatResource } : undefined }, async () => 0, { report: () => { } }, CancellationToken.None);
				const part = result.content[0];
				assert.ok(part?.kind === 'text');
				return result.toolResultError
					? { error: result.toolResultError }
					: { raw: JSON.parse(part.value), output: redact(JSON.parse(part.value)), message: redact(result.toolResultMessage) };
			},
			listStore: async () => {
				const exists = await fileService.exists(importFolder);
				const children = exists ? (await fileService.resolve(importFolder)).children ?? [] : [];
				return children.map(child => redact(child.name)).sort();
			},
		};
	}

	test('blocks all operations when disabled without clearing the configured background', async () => {
		const t = setup();
		const original = URI.file('/work/original.png');
		await t.backgroundService.setBackground(original);
		await t.configurationService.setUserConfiguration(AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING, false);
		const errors = [];
		for (const parameters of [{ preset: 'none' }, { preset: 'codicons' }, { layout: 'stretch' }, { image: '/work/new.png' }]) {
			errors.push((await t.invoke(parameters)).error);
		}

		assert.deepStrictEqual({
			errors,
			sameBackground: isEqual(t.backgroundService.getConfiguredBackgroundImage(), original),
			layout: t.backgroundService.getBackgroundImageLayout(),
			imports: await t.listStore(),
		}, {
			errors: Array(4).fill(`Appearance tools are disabled by ${AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING}.`),
			sameBackground: true,
			layout: 'repeat',
			imports: [],
		});
	});

	test('rechecks the setting after image preparation and before a queued operation', async () => {
		const measuring = new DeferredPromise<void>();
		const measured = new DeferredPromise<void>();
		const t = setup(URI.file('/work'), async () => {
			await measuring.complete();
			await measured.p;
		});
		await t.writeFile(URI.file('/work/new.png'), 'image:64x64');
		await t.backgroundService.setBackground(URI.file('/work/original.png'));
		const image = t.invoke({ image: 'new.png', layout: 'stretch' });
		await measuring.p;
		const queued = t.invoke({ preset: 'none' });
		await t.configurationService.setUserConfiguration(AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING, false);
		await measured.complete();
		const results = await Promise.all([image, queued]);

		assert.deepStrictEqual({
			errors: results.map(result => result.error),
			background: t.backgroundService.getConfiguredBackgroundImage()?.fsPath,
			layout: t.backgroundService.getBackgroundImageLayout(),
		}, {
			errors: Array(2).fill(`Appearance tools are disabled by ${AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING}.`),
			background: URI.file('/work/original.png').fsPath,
			layout: 'repeat',
		});
	});

	test('describes applying backgrounds without embedding generation guidance', () => {
		const { modelDescription } = setup().tool.getToolData();

		assert.deepStrictEqual({
			existingImageOnly: modelDescription.includes('does not generate images'),
			persistentScope: modelDescription.includes('persist across chats for the active color scheme'),
			preservesLayout: modelDescription.includes('Omitting layout keeps the current layout'),
			designGuidance: /getThemeColors|Pattern option|Atmospheric option|palette/.test(modelDescription),
		}, {
			existingImageOnly: true,
			persistentScope: true,
			preservesLayout: true,
			designGuidance: false,
		});
	});

	test('keeps the description static across theme changes', () => {
		const { tool, themeService } = setup();
		const original = tool.getToolData().modelDescription;
		const schemes = [ColorScheme.DARK, ColorScheme.LIGHT, ColorScheme.HIGH_CONTRAST_DARK, ColorScheme.HIGH_CONTRAST_LIGHT];
		const descriptions = schemes.map(colorScheme => {
			themeService.setTheme(new TestColorTheme({ 'agents.background': '#123456' }, colorScheme));
			return tool.getToolData().modelDescription;
		});

		assert.deepStrictEqual(descriptions, schemes.map(() => original));
	});

	test('keeps undo, layout, pruning and output on the scheme selected after image preparation', async () => {
		const measuring = new DeferredPromise<void>();
		const measured = new DeferredPromise<void>();
		const t = setup(URI.file('/work'), async () => {
			await measuring.complete();
			await measured.p;
		});
		const dark = URI.file('/work/dark.png');
		const light = URI.joinPath(importFolder, 'previous-light.png');
		await t.writeFile(light, 'image:20x20');
		await t.writeFile(URI.file('/work/new.png'), 'image:64x64');
		await t.backgroundService.setBackground(dark);
		await t.backgroundService.setBackgroundImageLayout('top');
		const pending = t.invoke({ image: 'new.png', layout: 'stretch' });
		await measuring.p;
		t.themeService.setTheme(new TestColorTheme({}, ColorScheme.LIGHT));
		await t.backgroundService.setBackgroundImageLayout('bottom');
		await t.configurationService.setUserConfiguration(AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING, light.fsPath);
		sinon.stub(t.configurationService, 'updateValue').callsFake(async (key, value) => {
			await t.configurationService.setUserConfiguration(key, value);
			if (key === AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING) {
				t.themeService.setTheme(new TestColorTheme({}, ColorScheme.DARK));
			}
		});
		await measured.complete();
		const result = await pending;

		assert.deepStrictEqual({
			output: result.output,
			dark: t.configurationService.getValue(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING),
			darkLayout: t.backgroundService.getBackgroundImageLayout(),
			lightLayout: t.configurationService.getValue(AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING),
			store: await t.listStore(),
		}, {
			output: {
				colorScheme: 'light',
				background: { kind: 'image', image: '<store>/new-<hash>.png', layout: 'stretch', width: 64, height: 64 },
				previous: { kind: 'image', image: '<store>/previous-light.png', layout: 'bottom' },
			},
			dark: dark.fsPath,
			darkLayout: 'top',
			lightLayout: 'stretch',
			store: ['new-<hash>.png', 'previous-light.png'],
		});
	});

	test('imports an agent image, reuses the copy, and restores a previous background by its reported path', async () => {
		const t = setup();
		await t.writeFile(URI.file('/work/art/sunset.png'), 'image:1920x1080');
		await t.writeFile(URI.file('/work/other/sunset.png'), 'image:1920x1080');

		const first = await t.invoke({ image: 'art/sunset.png', layout: 'stretch' });
		// The agent deletes its file, for example with its worktree.
		await t.fileService.del(URI.file('/work/art/sunset.png'));
		const sameContent = await t.invoke({ image: URI.file('/work/other/sunset.png').fsPath });
		// Models sometimes send `null` for omitted properties.
		const codicons = await t.invoke({ preset: 'codicons', layout: null });
		const restored = await t.invoke({ image: first.raw?.background.image, layout: first.raw?.background.layout });

		assert.deepStrictEqual({
			results: [first, sameContent, codicons, restored].map(({ message, output }) => ({ message, output })),
			setting: redact(t.configurationService.getValue(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING)),
			layout: t.configurationService.getValue(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING),
			store: await t.listStore(),
		}, {
			results: [{
				message: 'Set the chat background to sunset.png',
				output: {
					colorScheme: 'dark',
					background: { kind: 'image', image: '<store>/sunset-<hash>.png', layout: 'stretch', width: 1920, height: 1080 },
					previous: { kind: 'none' },
				},
			}, {
				message: 'Set the chat background to sunset.png',
				output: {
					colorScheme: 'dark',
					background: { kind: 'image', image: '<store>/sunset-<hash>.png', layout: 'stretch', width: 1920, height: 1080 },
					previous: { kind: 'image', image: '<store>/sunset-<hash>.png', layout: 'stretch' },
				},
			}, {
				message: 'Set the chat background to Codicons',
				output: {
					colorScheme: 'dark',
					background: { kind: 'codicons' },
					previous: { kind: 'image', image: '<store>/sunset-<hash>.png', layout: 'stretch' },
				},
			}, {
				message: 'Set the chat background to sunset-<hash>.png',
				output: {
					colorScheme: 'dark',
					background: { kind: 'image', image: '<store>/sunset-<hash>.png', layout: 'stretch', width: 1920, height: 1080 },
					previous: { kind: 'codicons' },
				},
			}],
			setting: '<store>/sunset-<hash>.png',
			layout: 'stretch',
			store: ['sunset-<hash>.png'],
		});
	});

	test('reads images from the file system of a remote agent host', async () => {
		const workingDirectory = URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'host', path: '/home/me/project', query: '_ah=meta' });
		const t = setup(workingDirectory);
		await t.writeFile(workingDirectory.with({ path: '/home/me/project/assets/bg.webp' }), 'image:800x600');

		const absolute = await t.invoke({ image: '/home/me/project/assets/bg.webp' });
		const fileUri = await t.invoke({ image: 'file:///home/me/project/assets/bg.webp' });
		const relative = await t.invoke({ image: 'assets/bg.webp' });

		assert.deepStrictEqual({
			backgrounds: [absolute, fileUri, relative].map(result => (result.output as { background: unknown }).background),
			store: await t.listStore(),
		}, {
			backgrounds: [
				{ kind: 'image', image: '<store>/bg-<hash>.webp', layout: 'repeat', width: 800, height: 600 },
				{ kind: 'image', image: '<store>/bg-<hash>.webp', layout: 'repeat', width: 800, height: 600 },
				{ kind: 'image', image: '<store>/bg-<hash>.webp', layout: 'repeat', width: 800, height: 600 },
			],
			store: ['bg-<hash>.webp'],
		});
	});

	test('preserves remote Windows drive and UNC image identities', async () => {
		const t = setup(toAgentHostUri(URI.from({ scheme: Schemas.file, path: '/C:/work' }), 'host'));
		const drive = URI.from({ scheme: Schemas.file, path: '/C:/work/drive.png' });
		const unc = URI.from({ scheme: Schemas.file, authority: 'server', path: '/share/background.png' });
		await t.writeFile(toAgentHostUri(drive, 'host'), 'image:800x600');
		await t.writeFile(toAgentHostUri(unc, 'host'), 'image:64x64');
		const reads = sinon.spy(t.fileService, 'readFile');
		const results = [];
		for (const image of ['C:\\work\\drive.png', 'drive.png', '\\\\server\\share\\background.png', 'file://server/share/background.png']) {
			results.push(await t.invoke({ image }));
		}

		assert.deepStrictEqual({
			errors: results.map(result => result.error),
			sources: reads.getCalls().map(call => call.args[0]).filter(uri => uri.scheme === AGENT_HOST_SCHEME).map(uri => {
				const source = fromAgentHostUri(uri);
				return { authority: source.authority, path: source.path };
			}),
			store: await t.listStore(),
		}, {
			errors: [undefined, undefined, undefined, undefined],
			sources: [
				{ authority: '', path: '/C:/work/drive.png' },
				{ authority: '', path: '/C:/work/drive.png' },
				{ authority: 'server', path: '/share/background.png' },
				{ authority: 'server', path: '/share/background.png' },
			],
			store: ['background-<hash>.png', 'drive-<hash>.png'],
		});
	});

	test('rejects invalid requests with actionable errors and leaves the background unchanged', async () => {
		const t = setup();
		await t.writeFile(URI.file('/work/notes.txt'), 'text');
		await t.writeFile(URI.file('/work/broken.png'), 'not an image');
		await t.fileService.createFolder(URI.file('/work/folder.png'));

		const errors: IInvokeResult['error'][] = [];
		for (const parameters of [
			{},
			{ image: '  ' },
			{ preset: 'stars' },
			{ layout: 'cover' },
			{ image: 'a.png', preset: 'none' },
			{ preset: 'codicons', layout: 'center' },
			{ layout: 'center' },
			{ image: 'https://example.com/a.png' },
			{ image: '~/Pictures/a.png' },
			{ image: 'notes.txt' },
			{ image: 'missing.png' },
			{ image: 'folder.png' },
			{ image: 'broken.png' },
		]) {
			errors.push((await t.invoke(parameters)).error);
		}
		errors.push((await t.invoke({ image: 'relative.png' }, false)).error);
		errors.push((await t.invoke({ image: URI.file('/remote/only.png').fsPath }, false)).error);

		assert.deepStrictEqual({
			errors,
			setting: t.configurationService.getValue(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING),
			store: await t.listStore(),
		}, {
			errors: [
				'Pass "image", "preset", or "layout".',
				'"image" must be a non-empty file path.',
				'"preset" must be one of: codicons, none.',
				'"layout" must be one of: repeat, stretch, center, top, top-right, top-left, bottom, bottom-right, bottom-left, left, right.',
				'Pass either "image" or "preset", not both.',
				'"layout" applies only to images; omit it when passing "preset".',
				'There is no background image to lay out. Pass "image" together with "layout".',
				'"image" must be a file path. Save images from the web to a file first.',
				'Expand "~" to an absolute path.',
				'".txt" images are not supported. Use one of: avif, bmp, gif, ico, jpeg, jpg, png, svg, webp.',
				`${URI.file('/work/missing.png').fsPath} does not exist.`,
				`${URI.file('/work/folder.png').fsPath} is a folder, not an image file.`,
				`${URI.file('/work/broken.png').fsPath} is not a valid png image.`,
				'"relative.png" is relative, but this chat has no working directory. Pass an absolute path.',
				`${URI.file('/remote/only.png').fsPath} does not exist. No working directory is known for this call, so the path was resolved on the machine running VS Code.`,
			],
			setting: undefined,
			store: [],
		});
	});

	test('deletes imported images that nothing refers to, but keeps the replaced one for undo', async () => {
		const t = setup();
		t.themeService.setTheme(new TestColorTheme({}, ColorScheme.LIGHT));
		await t.writeFile(URI.file('/work/a.png'), 'image:1x1');
		await t.invoke({ image: 'a.png' });
		t.themeService.setTheme(new TestColorTheme({}, ColorScheme.DARK));
		for (const name of ['b', 'c', 'd', 'e', 'f', 'g']) {
			await t.writeFile(URI.file(`/work/${name}.png`), `image:${name.charCodeAt(0)}x1`);
			await t.invoke({ image: `${name}.png` });
		}
		// b is neither a preference nor among the five recently used images.
		const afterImports = await t.listStore();

		// a is only the light preference, so replacing it leaves nothing referring to it.
		t.themeService.setTheme(new TestColorTheme({}, ColorScheme.LIGHT));
		const replaced = await t.invoke({ preset: 'codicons' });
		const afterReplace = await t.listStore();
		const restored = await t.invoke({ image: replaced.raw?.previous.image });

		assert.deepStrictEqual({
			afterImports,
			afterReplace,
			restored: restored.message,
			light: redact(t.configurationService.getValue(AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING)),
			dark: redact(t.configurationService.getValue(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING)),
			// a's return to the recently used list pushes c out.
			store: await t.listStore(),
		}, {
			afterImports: ['a-<hash>.png', 'c-<hash>.png', 'd-<hash>.png', 'e-<hash>.png', 'f-<hash>.png', 'g-<hash>.png'],
			afterReplace: ['a-<hash>.png', 'c-<hash>.png', 'd-<hash>.png', 'e-<hash>.png', 'f-<hash>.png', 'g-<hash>.png'],
			restored: 'Set the chat background to a-<hash>.png',
			light: '<store>/a-<hash>.png',
			dark: '<store>/g-<hash>.png',
			store: ['a-<hash>.png', 'd-<hash>.png', 'e-<hash>.png', 'f-<hash>.png', 'g-<hash>.png'],
		});
	});

	test('changes only the layout and notes when a high contrast theme hides the background', async () => {
		const t = setup();
		await t.writeFile(URI.file('/work/texture.png'), 'image:64x64');
		await t.invoke({ image: 'texture.png' });
		t.themeService.setTheme(new TestColorTheme({}, ColorScheme.HIGH_CONTRAST_DARK));

		const result = await t.invoke({ layout: 'center' });

		assert.deepStrictEqual({ message: result.message, output: result.output }, {
			message: 'Changed the chat background layout',
			output: {
				colorScheme: 'dark',
				background: { kind: 'image', image: '<store>/texture-<hash>.png', layout: 'center' },
				previous: { kind: 'image', image: '<store>/texture-<hash>.png', layout: 'repeat' },
				note: 'The active high contrast theme hides chat backgrounds. This background shows when the user uses a dark theme.',
			},
		});
	});
});
