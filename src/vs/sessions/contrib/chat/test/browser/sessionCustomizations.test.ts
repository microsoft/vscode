/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildSessionCustomizationSections } from '../../browser/sessionCustomizations.js';
import { ISessionChatCustomization, SessionCustomizationKind } from '../../../../services/sessions/common/session.js';

suite('Session Customizations', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const customization = (id: string, kind: SessionCustomizationKind, name: string): ISessionChatCustomization =>
		({ id, kind, name, uri: URI.file(`/repo/${id}.md`) });

	test('groups into typed sections in a fixed order, keeping arrival order within a section', () => {
		const sections = buildSessionCustomizationSections([
			customization('c1', SessionCustomizationKind.Hook, 'pre-commit'),
			customization('c2', SessionCustomizationKind.Skill, 'sessions'),
			customization('c3', SessionCustomizationKind.Instruction, 'writing-tests'),
			customization('c4', SessionCustomizationKind.Skill, 'unit-tests'),
			customization('c5', SessionCustomizationKind.Agent, 'rubber-duck'),
		], () => { });

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
			target => revealed.push(target.id),
		);
		sections[0].entries[0].open();

		assert.deepStrictEqual(revealed, ['c1']);
	});

	test('no customizations yields no sections', () => {
		assert.deepStrictEqual(buildSessionCustomizationSections([], () => { }), []);
	});
});
