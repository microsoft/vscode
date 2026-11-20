/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { autorun, constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IsPhoneLayoutContext } from '../../../../../workbench/common/contextkeys.js';
import { buildSessionCustomizationSections, SessionCustomizations } from '../../../../../workbench/contrib/chat/browser/sessionCustomizations.js';
import { ISessionChatCustomization, ISessionFolder, SessionCustomizationKind } from '../../../../../workbench/services/sessions/common/session.js';

suite('Session Customizations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const customization = (id: string, kind: SessionCustomizationKind, name: string): ISessionChatCustomization =>
	({ id, kind, name, uri: URI.file(`/repo/${id}.md`) });
	const sessionFolder = (name: string, workingDirectory: URI): ISessionFolder => ({
		root: workingDirectory,
		workingDirectory,
		name,
		description: undefined,
	});

	test('groups into typed sections in a fixed order, keeping arrival order within a section', () => {
		const sections = buildSessionCustomizationSections([
			customization('c1', SessionCustomizationKind.Hook, 'pre-commit'),
			customization('c2', SessionCustomizationKind.Skill, 'sessions'),
			customization('c3', SessionCustomizationKind.Instruction, 'writing-tests'),
			customization('c4', SessionCustomizationKind.Skill, 'unit-tests'),
			customization('c5', SessionCustomizationKind.Agent, 'rubber-duck'),
		], [], () => { });

		assert.deepStrictEqual(sections.map(section => ({ title: section.title, entries: section.entries.map(entry => entry.label) })), [
			{ title: 'Agents', entries: ['rubber-duck'] },
			{ title: 'Skills', entries: ['sessions', 'unit-tests'] },
			{ title: 'Instructions', entries: ['writing-tests'] },
			{ title: 'Hooks', entries: ['pre-commit'] },
		]);
	});

	test('activating an entry reveals its customization', () => {
		const revealed: string[] = [];
		const sections = buildSessionCustomizationSections(
			[customization('c1', SessionCustomizationKind.Skill, 'sessions')],
			[],
			target => revealed.push(target.id),
		);
		sections[0].entries[0].open();

		assert.deepStrictEqual(revealed, ['c1']);
	});

	test('shows paths relative to session working directories', () => {
		const singleFolder = [sessionFolder('repo', URI.file('/repo'))];
		const multipleFolders = [
			sessionFolder('client', URI.file('/work/client')),
			sessionFolder('server', URI.file('/work/server')),
		];
		const outside = URI.file('/global/customizations/global.md');
		const hover = (customization: ISessionChatCustomization, folders: readonly ISessionFolder[]) => {
			const entry = buildSessionCustomizationSections([customization], folders, () => { })[0].entries[0];
			const content = entry.hover?.content;
			return {
				ariaDescription: entry.ariaDescription,
				content: content instanceof HTMLElement ? content.textContent : undefined,
				sharedShell: content instanceof HTMLElement && content.classList.contains('chat-pill-hover-content'),
			};
		};

		assert.deepStrictEqual({
			singleFolder: hover(customization('c1', SessionCustomizationKind.Skill, 'sessions'), singleFolder),
			multipleFolders: hover({ ...customization('c2', SessionCustomizationKind.Instruction, 'instructions'), uri: URI.file('/work/server/.github/instructions/review.md') }, multipleFolders),
			outside: hover({ ...customization('c3', SessionCustomizationKind.Prompt, 'global'), uri: outside }, singleFolder),
		}, {
			singleFolder: { ariaDescription: 'c1.md', content: 'c1.md', sharedShell: true },
			multipleFolders: { ariaDescription: 'server/.github/instructions/review.md', content: 'server/.github/instructions/review.md', sharedShell: true },
			outside: { ariaDescription: outside.fsPath, content: outside.fsPath, sharedShell: true },
		});
	});

	test('removes phone management links on resize and reports a stale entry rejection', async () => {
		const instantiation = store.add(new TestInstantiationService());
		const config = new TestConfigurationService();
		store.add(config.onDidChangeConfigurationEmitter);
		const context = store.add(new ContextKeyService(config));
		const phoneLayout = IsPhoneLayoutContext.bindTo(context);
		instantiation.set(IContextKeyService, context);
		const failure = new Error('Management unavailable');
		instantiation.stub(ICommandService, { executeCommand: async () => { throw failure; } });
		const notifications: Parameters<INotificationService['error']>[0][] = [];
		instantiation.stub(INotificationService, { error: error => { notifications.push(error); } });
		const model = store.add(instantiation.createInstance(SessionCustomizations, constObservable([
			customization('c1', SessionCustomizationKind.Skill, 'sessions'),
		]), constObservable([])));
		const visibleEntries: string[][] = [];
		store.add(autorun(reader => visibleEntries.push(model.sections.read(reader).flatMap(section => section.entries.map(entry => entry.label)))));
		const desktopEntry = model.sections.get()[0].entries[0];
		phoneLayout.set(true);
		desktopEntry.open();
		await Promise.resolve();
		phoneLayout.set(false);
		assert.deepStrictEqual({ visibleEntries, notifications }, { visibleEntries: [['sessions'], [], ['sessions']], notifications: [failure] });
	});

	test('no customizations yields no sections', () => {
		assert.deepStrictEqual(buildSessionCustomizationSections([], [], () => { }), []);
	});
});
