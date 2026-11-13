/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { suite, test } from 'node:test';
import ts from 'typescript';
import { getResourcePaths } from '../../next/resources.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const hostPickerRoot = 'src/vs/sessions/contrib/providers/remoteAgentHost/browser/';
const sharedHostPickerRoot = 'src/vs/workbench/contrib/sessions/providers/remoteAgentHost/browser/';
const originalPicker = [
	'hostFilterActionViewItem.ts',
	'mobileHostFilterActionViewItem.ts',
	'media/hostFilter.css',
	'media/hostPickerSheet.css',
].map(file => sharedHostPickerRoot + file).concat(hostPickerRoot + 'hostFilter.contribution.ts');
const experimentalPicker = [
	'mobileHostFilter.contribution.ts',
	'mobileHostDrawerHeaderViewItem.ts',
	'mobileHostPlaceChipViewItem.ts',
	'mobileHostPickerSheet.ts',
	'media/hostDrawerHeader.css',
	'media/hostPlaceChip.css',
	'media/mobileHostPickerSheet.css',
].map(file => hostPickerRoot + file);
const dependenciesByFile = new Map<string, readonly string[]>();
const composerRoot = 'src/vs/sessions/contrib/providers/agentHost/browser/mobile/';
const originalConfigurationPresenter = 'src/vs/workbench/contrib/sessions/providers/agentHost/browser/mobile/mobileChatPhoneInputPresenter.ts';
const mobileConfigurationPresenter = composerRoot + 'mobileChatPhoneInputPresenter.ts';
const mobileInputButton = composerRoot + 'mobileChatInputActionViewItem.ts';
const defaultRepositoryPicker = 'src/vs/workbench/contrib/sessions/browser/defaultSessionRepositoryPicker.ts';
const mobileRepositoryPicker = 'src/vs/sessions/contrib/mobile/browser/mobileRepositoryPicker.ts';
const defaultChatPresentation = 'src/vs/workbench/contrib/chat/browser/chatDefaultPresentation.contribution.ts';
const defaultEditPresentation = 'src/vs/workbench/contrib/chat/browser/widget/chatContentParts/defaultChatEditPresentation.ts';
const defaultListPresentation = 'src/vs/workbench/contrib/sessions/browser/defaultSessionsListPresentation.ts';
const mobilePresentationRoot = 'src/vs/sessions/contrib/mobile/browser/';
const defaultSessionsRegistrations = 'src/vs/sessions/services/sessions/browser/sessionsServices.registration.ts';
const coreSessionsRegistrations = 'src/vs/sessions/services/sessions/browser/sessionsCoreServices.registration.ts';
const chatBackgroundPresentation = [
	'src/vs/sessions/contrib/chat/browser/chatBackground.contribution.ts',
	'src/vs/sessions/contrib/chat/browser/chatBackgroundTint.ts',
	'src/vs/sessions/contrib/chat/browser/getThemeColorsTool.ts',
	'src/vs/workbench/contrib/sessions/browser/chat/defaultChatViewFactory.ts',
	'src/vs/workbench/contrib/sessions/browser/chatBackgroundService.ts',
	'src/vs/workbench/contrib/sessions/browser/chatBackgroundRenderer.ts',
	'src/vs/workbench/contrib/sessions/browser/sessionsChatSurface.ts',
	'src/vs/workbench/contrib/sessions/browser/media/chatBackground.css',
];

suite('Sessions presentation entry isolation', () => {
	for (const { entry, expected, configurationPresenter } of [
		{ entry: 'src/vs/sessions/sessions.web.main.ts', expected: originalPicker, configurationPresenter: originalConfigurationPresenter },
		{ entry: 'src/vs/sessions/agents.web.mobile.main.ts', expected: experimentalPicker, configurationPresenter: mobileConfigurationPresenter },
	]) {
		test(`${entry} reaches only its own host picker implementation and styles`, () => {
			const dependencies = collectSourceDependencies(entry);
			assert.deepStrictEqual([...originalPicker, ...experimentalPicker]
				.filter(file => dependencies.has(file)).sort(), [...expected].sort());
		});

		test(`${entry} reaches only its own Configure Session presenter`, () => {
			const dependencies = collectSourceDependencies(entry);
			assert.deepStrictEqual([originalConfigurationPresenter, mobileConfigurationPresenter]
				.filter(file => dependencies.has(file)), [configurationPresenter]);
		});

		test(`${entry} registers only its own session repository picker implementation`, () => {
			const mobile = entry.includes('.mobile.');
			const dependencies = collectSourceDependencies(entry);
			const registrations = getSingletonRegistrations(mobile ? 'src/vs/sessions/contrib/mobile/browser/mobile.contribution.ts' : defaultSessionsRegistrations);
			assert.deepStrictEqual({
				implementations: [defaultRepositoryPicker, mobileRepositoryPicker].filter(file => dependencies.has(file)),
				registration: registrations.find(([service]) => service === 'ISessionRepositoryPicker'),
			}, {
				implementations: [mobile ? mobileRepositoryPicker : defaultRepositoryPicker],
				registration: ['ISessionRepositoryPicker', mobile ? 'MobileRepositoryPicker' : 'DefaultSessionRepositoryPicker'],
			});
		});

		test(`${entry} registers the shared GitHub and comparison services required by its views`, () => {
			const dependencies = collectSourceDependencies(entry);
			const services = [
				'src/vs/workbench/services/github/browser/githubService.ts',
				'src/vs/workbench/contrib/sessions/browser/sessionComparisonService.ts',
			];
			assert.deepStrictEqual(services.filter(file => dependencies.has(file)), services);
		});

		test(`${entry} registers shared session and host services without relying on implementation side effects`, () => {
			const dependencies = collectSourceDependencies(entry);
			const registrations = dependencies.has(coreSessionsRegistrations) ? getSingletonRegistrations(coreSessionsRegistrations) : [];
			const required = [
				['ISessionsProvidersService', 'SessionsProvidersService'],
				['ISessionsService', 'SessionsService'],
				['ISessionsManagementService', 'SessionsManagementService'],
				['ISessionHostService', 'SessionHostService'],
				['IFocusedSessionHostService', 'FocusedSessionHostService'],
			];
			assert.deepStrictEqual(required.map(([id]) => registrations.find(([service]) => service === id)), required);
		});

		test(`${entry} shares skills while selecting chat backgrounds only for the regular workbench`, () => {
			const mobile = entry.includes('.mobile.');
			const dependencies = collectSourceDependencies(entry);
			const registrations = [
				'src/vs/sessions/contrib/chat/browser/chat.contribution.ts',
				'src/vs/sessions/contrib/chat/browser/chat.desktop.contribution.ts',
				'src/vs/sessions/contrib/chat/browser/chatBackground.contribution.ts',
				mobilePresentationRoot + 'mobile.contribution.ts',
			].filter(file => dependencies.has(file)).flatMap(getSingletonRegistrations);
			assert.deepStrictEqual({
				backgroundModules: chatBackgroundPresentation.filter(file => dependencies.has(file)),
				factory: registrations.filter(([id]) => id === 'IChatViewFactory'),
				backgroundService: registrations.filter(([id]) => id === 'ISessionsChatBackgroundService'),
				promptsService: registrations.filter(([id]) => id === 'IPromptsService'),
			}, {
				backgroundModules: mobile ? [] : chatBackgroundPresentation,
				factory: [['IChatViewFactory', mobile ? 'MobileChatViewFactory' : 'DefaultChatViewFactory']],
				backgroundService: mobile ? [] : [['ISessionsChatBackgroundService', 'SessionsChatBackgroundService']],
				promptsService: [['IPromptsService', 'AgenticPromptsService']],
			});
		});

		test(`${entry} supplies required window services without loading desktop presentation on mobile`, () => {
			const mobile = entry.includes('.mobile.');
			const dependencies = collectSourceDependencies(entry);
			const modules = mobile ? [mobilePresentationRoot + 'mobile.contribution.ts'] : [
				'src/vs/sessions/contrib/canvases/browser/windowCanvases.contribution.ts',
				'src/vs/sessions/contrib/canvases/browser/pinnedCanvases.contribution.ts',
				'src/vs/workbench/contrib/chatWindow/browser/chatWindow.contribution.ts',
			];
			const registrations = modules.filter(file => dependencies.has(file)).flatMap(getSingletonRegistrations);
			const desktopPresentation = [
				'src/vs/sessions/contrib/canvases/browser/windowCanvasEditor.ts',
				'src/vs/sessions/contrib/canvases/browser/pinnedCanvasService.ts',
				'src/vs/workbench/contrib/chatWindow/browser/chatWindowService.ts',
				'src/vs/workbench/contrib/chatWindow/browser/media/chatWindow.css',
			];
			assert.deepStrictEqual({
				canvas: registrations.find(([id]) => id === 'IWindowCanvasService'),
				pinnedCanvas: registrations.find(([id]) => id === 'IPinnedCanvasService'),
				chatWindow: registrations.find(([id]) => id === 'IChatWindowService'),
				presentation: desktopPresentation.filter(file => dependencies.has(file)),
			}, {
				canvas: ['IWindowCanvasService', 'WindowCanvasService'],
				pinnedCanvas: mobile ? undefined : ['IPinnedCanvasService', 'PinnedCanvasService'],
				chatWindow: ['IChatWindowService', mobile ? 'MobileNullChatWindowService' : 'ChatWindowService'],
				presentation: mobile ? [] : desktopPresentation,
			});
		});

		test(`${entry} supplies layout and chat-input services without desktop features on mobile`, () => {
			const mobile = entry.includes('.mobile.');
			const dependencies = collectSourceDependencies(entry);
			const registrations = [
				'src/vs/sessions/contrib/layout/browser/sessions.layout.contribution.ts',
				'src/vs/sessions/contrib/layout/browser/sessions.mobile.layout.contribution.ts',
				'src/vs/workbench/contrib/screenshotTool/browser/screenshotTool.contribution.ts',
				'src/vs/sessions/contrib/worktreeSuggestion/browser/worktreeSuggestion.contribution.ts',
				mobilePresentationRoot + 'mobile.contribution.ts',
			].filter(file => dependencies.has(file)).flatMap(getSingletonRegistrations);
			assert.deepStrictEqual({
				workingSet: registrations.filter(([id]) => id === 'ISessionEditorWorkingSetService'),
				screenshot: registrations.filter(([id]) => id === 'IScreenshotToolService'),
				worktreeSuggestion: registrations.filter(([id]) => id === 'IWorktreeSuggestionService'),
				desktopLayout: dependencies.has('src/vs/sessions/contrib/layout/browser/desktopLayoutController.ts'),
				desktopScreenshot: dependencies.has('src/vs/workbench/contrib/screenshotTool/browser/screenshotToolService.ts'),
				worktreeContribution: dependencies.has('src/vs/sessions/contrib/worktreeSuggestion/browser/worktreeSuggestion.contribution.ts'),
			}, {
				workingSet: [['ISessionEditorWorkingSetService', 'SessionEditorWorkingSetService']],
				screenshot: [['IScreenshotToolService', mobile ? 'MobileNullScreenshotToolService' : 'ScreenshotToolService']],
				worktreeSuggestion: [['IWorktreeSuggestionService', mobile ? 'MobileNullWorktreeSuggestionService' : 'WorktreeSuggestionService']],
				desktopLayout: !mobile,
				desktopScreenshot: !mobile,
				worktreeContribution: !mobile,
			});
		});

		test(`${entry} selects edit, list, clipboard and chat-view presentation without importing the other entry`, () => {
			const mobile = entry.includes('.mobile.');
			const dependencies = collectSourceDependencies(entry);
			const normal = [defaultChatPresentation, defaultEditPresentation, defaultListPresentation];
			const experimental = ['mobileChatEditPresenter.ts', 'mobileSessionsListPresentation.ts', 'mobileClipboardImageContext.ts', 'mobileChatViewFactory.ts'].map(file => mobilePresentationRoot + file);
			const registrations = [
				...getSingletonRegistrations(mobile ? mobilePresentationRoot + 'mobile.contribution.ts' : defaultChatPresentation),
				...getSingletonRegistrations(mobile ? mobilePresentationRoot + 'mobile.contribution.ts' : defaultSessionsRegistrations),
			];
			assert.deepStrictEqual({
				files: [...normal, ...experimental].filter(file => dependencies.has(file)),
				edit: registrations.find(([id]) => id === 'IChatEditPresentationService'),
				list: registrations.find(([id]) => id === 'ISessionsListPresentation'),
			}, {
				files: mobile ? experimental : normal,
				edit: ['IChatEditPresentationService', mobile ? 'MobileChatEditPresenter' : 'DefaultChatEditPresentationService'],
				list: ['ISessionsListPresentation', mobile ? 'MobileSessionsListPresentation' : 'DefaultSessionsListPresentation'],
			});
		});

		test(`${entry} loads policy-continuation and shared composer contributions`, () => {
			const dependencies = collectSourceDependencies(entry);
			const contributions = [
				'src/vs/sessions/contrib/providers/agentHost/browser/agentHostPolicyContinuationPresenter.contribution.ts',
				'src/vs/sessions/contrib/chat/browser/sharedChatInputComposer.contribution.ts',
				'src/vs/sessions/browser/parts/sessionsPartContent.registration.ts',
				'src/vs/sessions/contrib/providers/agentHost/browser/agentHostSessionConfigPicker.contribution.ts',
				'src/vs/sessions/contrib/providers/agentHost/browser/mobile/mobileChatInputConfigPicker.contribution.ts',
			];
			assert.deepStrictEqual(contributions.filter(file => dependencies.has(file)), contributions);
		});

		test(`${entry} keeps clipboard registration outside the restore-blocking phase`, () => {
			const file = entry.includes('.mobile.')
				? mobilePresentationRoot + 'mobileClipboardImageContext.ts'
				: defaultChatPresentation;
			assert.match(fs.readFileSync(path.join(repositoryRoot, file), 'utf8'),
				/registerWorkbenchContribution2\('chat\.(?:mobileClipboardImageContext|clipboardImageContext)', \w+, WorkbenchPhase\.AfterRestored\);/);
		});

		test(`${entry} includes redesigned input and edit rendering only for the mobile entry`, () => {
			const dependencies = collectSourceDependencies(entry);
			const mobile = entry.includes('.mobile.');
			const implementations = [
				mobileInputButton,
				'src/vs/sessions/contrib/mobile/browser/mobileChatEditRow.ts',
				'src/vs/sessions/contrib/mobile/browser/mobileSessionsListPresentation.ts',
				hostPickerRoot + 'mobileAgentHostFilterService.ts',
			];
			assert.deepStrictEqual(implementations.map(file => dependencies.has(file)), implementations.map(() => mobile));
		});
	}

	test('mobile embedder and mock bootstrap share the Agents mobile entry', () => {
		const entries = [
			'src/vs/sessions/agents.web.mobile.main.internal.ts',
			'src/vs/sessions/test/agents.web.mobile.test.internal.ts',
		];
		assert.deepStrictEqual(entries.filter(entry => collectSourceDependencies(entry)
			.has('src/vs/sessions/agents.web.mobile.main.ts')), entries);
	});

	test('mobile core registers the artifact and MCP OAuth services required by shared customers', () => {
		const registrations = getSingletonRegistrations('src/vs/sessions/sessions.core.main.ts');
		const required = [
			['IArtifactIntegrationRegistry', 'ArtifactIntegrationRegistry'],
			['IAgentHostMcpOAuthMetadataService', 'AgentHostMcpOAuthMetadataService'],
		];
		assert.deepStrictEqual(required.map(([id]) => registrations.find(([service]) => service === id)), required);
	});

	for (const entry of [
		'src/vs/sessions/sessions.web.main.internal.ts',
		'src/vs/sessions/sessions.desktop.main.ts',
		'src/vs/workbench/workbench.web.main.internal.ts',
		'src/vs/workbench/workbench.desktop.main.ts',
	]) {
		test(`${entry} excludes dedicated mobile UI, CSS and defaults`, () => {
			const dependencies = collectSourceDependencies(entry);
			const unexpected = [...dependencies].filter(isMobileEntryFile);
			assert.deepStrictEqual(unexpected, []);
		});
	}

	for (const target of ['web', 'desktop', 'server-web'] as const) {
		test(`${target} production resource copying excludes dedicated mobile assets`, async () => {
			const resources = await getResourcePaths(path.join(repositoryRoot, 'src'), target);
			assert.deepStrictEqual(resources.map(file => `src/${file}`).filter(isMobileEntryFile), []);
		});
	}

	test('background assets stay in regular workbenches and out of the mobile package', async () => {
		const backgrounds = ['koi-dark-static.webp', 'koi-dark.webp', 'koi-light-static.webp', 'koi-light.webp']
			.map(file => `vs/sessions/services/chatBackground/browser/media/${file}`);
		const resources = await Promise.all((['web', 'desktop', 'server-web', 'mobile'] as const).map(target =>
			getResourcePaths(path.join(repositoryRoot, 'src'), target)));
		assert.deepStrictEqual(resources.map(files => files.filter(file => backgrounds.includes(file))), [
			backgrounds, backgrounds, backgrounds, [],
		]);
	});

	test('full chat imports retain the original script-widget CSS precedence', () => {
		const source = fs.readFileSync(path.join(repositoryRoot, 'src/vs/sessions/sessions.common.main.ts'), 'utf8');
		const imports = ts.preProcessFile(source, true).importedFiles.map(reference => reference.fileName);
		const desktop = imports.indexOf('./contrib/chat/browser/chat.desktop.contribution.js');
		const shared = imports.indexOf('./contrib/chat/browser/chat.contribution.js');
		assert.ok(desktop >= 0 && shared > desktop);
	});
});

function getSingletonRegistrations(file: string): string[][] {
	const source = ts.createSourceFile(file, fs.readFileSync(path.join(repositoryRoot, file), 'utf8'), ts.ScriptTarget.Latest, true);
	return source.statements.flatMap(statement => {
		if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)
			|| !ts.isIdentifier(statement.expression.expression) || statement.expression.expression.text !== 'registerSingleton') {
			return [];
		}
		return [statement.expression.arguments.slice(0, 2).map(argument => argument.getText(source))];
	});
}

function isMobileEntryFile(file: string): boolean {
	return file.startsWith('src/vs/sessions/contrib/mobile/') ||
		file.startsWith('src/vs/sessions/browser/mobile/') ||
		/^src\/vs\/sessions\/sessions\.core(?:\.web)?\.main\.ts$/.test(file) ||
		[
			...experimentalPicker,
			mobileConfigurationPresenter,
			mobileInputButton,
			hostPickerRoot + 'mobileAgentHostFilterService.ts',
			hostPickerRoot + 'mobileTunnelConnection.ts',
		].includes(file);
}

/** Includes type imports conservatively: neither source graph may depend on the other presentation. */
function collectSourceDependencies(entry: string): Set<string> {
	const visited = new Set<string>();
	const pending = [entry];
	while (pending.length > 0) {
		const file = pending.pop()!;
		if (visited.has(file)) {
			continue;
		}
		visited.add(file);
		if (!file.endsWith('.ts') && !file.endsWith('.js')) {
			continue;
		}
		let dependencies = dependenciesByFile.get(file);
		if (!dependencies) {
			const source = fs.readFileSync(path.join(repositoryRoot, file), 'utf8');
			dependencies = ts.preProcessFile(source, true).importedFiles
				.map(reference => reference.fileName)
				.filter(specifier => specifier.startsWith('.'))
				.map(specifier => {
					const resolved = path.resolve(repositoryRoot, path.dirname(file), specifier);
					const candidates = [resolved.replace(/\.js$/, '.ts'), resolved.replace(/\.js$/, '.tsx'), resolved.replace(/\.js$/, '.d.ts'), resolved];
					const dependency = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
					assert.ok(dependency, `Cannot resolve ${specifier} from ${file}`);
					return path.relative(repositoryRoot, dependency).replaceAll('\\', '/');
				});
			dependenciesByFile.set(file, dependencies);
		}
		pending.push(...dependencies);
	}
	return visited;
}
