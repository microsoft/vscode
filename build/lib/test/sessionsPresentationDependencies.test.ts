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
const originalPicker = [
	'hostFilter.contribution.ts',
	'hostFilterActionViewItem.ts',
	'mobileHostFilterActionViewItem.ts',
	'media/hostFilter.css',
	'media/hostPickerSheet.css',
].map(file => hostPickerRoot + file);
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
const originalConfigurationPresenter = composerRoot + 'mobileChatPhoneInputPresenter.ts';
const experimentalConfigurationPresenter = composerRoot + 'experimentalMobileChatPhoneInputPresenter.ts';
const experimentalInputButton = composerRoot + 'experimentalMobileChatInputActionViewItem.ts';
const defaultRepositoryPicker = 'src/vs/sessions/services/presentation/browser/defaultSessionRepositoryPicker.ts';
const mobileRepositoryPicker = 'src/vs/sessions/contrib/mobile/browser/mobileRepositoryPicker.ts';
const defaultChatPresentation = 'src/vs/workbench/contrib/chat/browser/chatDefaultPresentation.contribution.ts';
const defaultEditPresentation = 'src/vs/workbench/contrib/chat/browser/widget/chatContentParts/defaultChatEditPresentation.ts';
const defaultListPresentation = 'src/vs/sessions/services/presentation/browser/defaultSessionsListPresentation.ts';
const mobilePresentationRoot = 'src/vs/sessions/contrib/mobile/browser/';

suite('Sessions presentation entry isolation', () => {
	for (const { entry, expected, configurationPresenter } of [
		{ entry: 'src/vs/sessions/sessions.web.main.ts', expected: originalPicker, configurationPresenter: originalConfigurationPresenter },
		{ entry: 'src/vs/sessions/sessions.web.mobile.main.ts', expected: experimentalPicker, configurationPresenter: experimentalConfigurationPresenter },
	]) {
		test(`${entry} reaches only its own host picker implementation and styles`, () => {
			const dependencies = collectSourceDependencies(entry);
			assert.deepStrictEqual([...originalPicker, ...experimentalPicker]
				.filter(file => dependencies.has(file)).sort(), [...expected].sort());
		});

		test(`${entry} reaches only its own Configure Session presenter`, () => {
			const dependencies = collectSourceDependencies(entry);
			assert.deepStrictEqual([originalConfigurationPresenter, experimentalConfigurationPresenter]
				.filter(file => dependencies.has(file)), [configurationPresenter]);
		});

		test(`${entry} registers only its own session repository picker implementation`, () => {
			const mobile = entry.includes('.mobile.');
			const dependencies = collectSourceDependencies(entry);
			const registrations = getSingletonRegistrations(mobile ? 'src/vs/sessions/contrib/mobile/browser/mobile.contribution.ts' : defaultRepositoryPicker);
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
				'src/vs/sessions/services/sessions/browser/sessionComparisonService.ts',
			];
			assert.deepStrictEqual(services.filter(file => dependencies.has(file)), services);
		});

		test(`${entry} selects edit, list, clipboard and chat-view presentation without importing the other entry`, () => {
			const mobile = entry.includes('.mobile.');
			const dependencies = collectSourceDependencies(entry);
			const normal = [defaultChatPresentation, defaultEditPresentation, defaultListPresentation];
			const experimental = ['mobileChatEditPresenter.ts', 'mobileSessionsListPresentation.ts', 'mobileClipboardImageContext.ts', 'mobileChatViewFactory.ts'].map(file => mobilePresentationRoot + file);
			const registrations = [
				...getSingletonRegistrations(mobile ? mobilePresentationRoot + 'mobile.contribution.ts' : defaultChatPresentation),
				...getSingletonRegistrations(mobile ? mobilePresentationRoot + 'mobile.contribution.ts' : defaultListPresentation),
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
				'src/vs/sessions/contrib/providers/agentHost/browser/agentHostPolicyContinuationPresenter.ts',
				'src/vs/sessions/contrib/chat/browser/sharedChatInputComposer.contribution.ts',
			];
			assert.deepStrictEqual(contributions.filter(file => dependencies.has(file)), contributions);
		});

		test(`${entry} includes redesigned input and edit rendering only for experimental mobile`, () => {
			const dependencies = collectSourceDependencies(entry);
			const mobile = entry.includes('.mobile.');
			const implementations = [
				experimentalInputButton,
				'src/vs/sessions/contrib/mobile/browser/mobileChatEditRow.ts',
				'src/vs/sessions/contrib/mobile/browser/mobileSessionsListPresentation.ts',
				hostPickerRoot + 'mobileAgentHostFilterService.ts',
			];
			assert.deepStrictEqual(implementations.map(file => dependencies.has(file)), implementations.map(() => mobile));
		});
	}

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
		test(`${entry} excludes experimental mobile UI, CSS and defaults`, () => {
			const dependencies = collectSourceDependencies(entry);
			const unexpected = [...dependencies].filter(isExperimentalMobileFile);
			assert.deepStrictEqual(unexpected, []);
		});
	}

	for (const target of ['web', 'desktop', 'server-web'] as const) {
		test(`${target} production resource copying excludes experimental mobile assets`, async () => {
			const resources = await getResourcePaths(path.join(repositoryRoot, 'src'), target);
			assert.deepStrictEqual(resources.map(file => `src/${file}`).filter(isExperimentalMobileFile), []);
		});
	}

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

function isExperimentalMobileFile(file: string): boolean {
	return file.startsWith('src/vs/sessions/contrib/mobile/') ||
		file.startsWith('src/vs/sessions/browser/mobile/') ||
		/^src\/vs\/sessions\/sessions\.core(?:\.web)?\.main\.ts$/.test(file) ||
		/\/experimentalMobile[^/]*\.(?:ts|css)$/.test(file) ||
		[...experimentalPicker, hostPickerRoot + 'mobileAgentHostFilterService.ts', hostPickerRoot + 'mobileTunnelConnection.ts'].includes(file);
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
