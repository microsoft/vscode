/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildSessionCustomizationSections } from '../../browser/sessionCustomizations.js';
import { ISessionChatCustomization, ISessionFolder, SessionCustomizationKind } from '../../../../services/sessions/common/session.js';

suite('Session Customizations', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

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
				content: isMarkdownString(content) ? content.value : undefined,
			};
		};

		assert.deepStrictEqual({
			singleFolder: hover(customization('c1', SessionCustomizationKind.Skill, 'sessions'), singleFolder),
			multipleFolders: hover({ ...customization('c2', SessionCustomizationKind.Instruction, 'instructions'), uri: URI.file('/work/server/.github/instructions/review.md') }, multipleFolders),
			outside: hover({ ...customization('c3', SessionCustomizationKind.Prompt, 'global'), uri: outside }, singleFolder),
		}, {
			singleFolder: { ariaDescription: 'c1.md', content: 'c1.md' },
			multipleFolders: { ariaDescription: 'server/.github/instructions/review.md', content: 'server/.github/instructions/review.md' },
			outside: { ariaDescription: outside.fsPath, content: new MarkdownString().appendText(outside.fsPath).value },
		});
	});

	test('no customizations yields no sections', () => {
		assert.deepStrictEqual(buildSessionCustomizationSections([], [], () => { }), []);
	});
});
