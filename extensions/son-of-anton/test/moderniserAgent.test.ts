/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('ModerniserAgent', () => {
	suite('Agent definition file', () => {
		const agentDefPath = path.join(__dirname, '..', '..', '..', '.son-of-anton', 'agents', 'moderniser.agent.md');

		test('definition file exists', () => {
			assert.ok(fs.existsSync(agentDefPath), `Expected agent definition at ${agentDefPath}`);
		});

		test('contains required frontmatter fields', () => {
			const content = fs.readFileSync(agentDefPath, 'utf-8');
			assert.ok(content.includes('name: Moderniser'));
			assert.ok(content.includes('model: sonnet'));
			assert.ok(content.includes('son-of-anton-graph'));
		});

		test('documents all six phases', () => {
			const content = fs.readFileSync(agentDefPath, 'utf-8');
			assert.ok(content.includes('Phase 1: Analysis'));
			assert.ok(content.includes('Phase 2: Type Annotations'));
			assert.ok(content.includes('Phase 3: Test Coverage'));
			assert.ok(content.includes('Phase 4: Structural Refactoring'));
			assert.ok(content.includes('Phase 5: Documentation'));
			assert.ok(content.includes('Phase 6: Validation'));
		});
	});

	suite('Chat participant registration', () => {
		let packageJson: {
			contributes: {
				chatParticipants: Array<{
					id: string;
					name: string;
					commands: Array<{ name: string }>;
				}>;
			};
		};

		suiteSetup(() => {
			const raw = fs.readFileSync(
				path.join(__dirname, '..', 'package.json'),
				'utf-8',
			);
			packageJson = JSON.parse(raw);
		});

		test('moderniser participant is registered', () => {
			const participant = packageJson.contributes.chatParticipants
				.find(p => p.id === 'sota.anton-moderniser');
			assert.ok(participant, 'Expected sota.anton-moderniser chat participant');
		});

		test('moderniser has modernise and next-phase commands', () => {
			const participant = packageJson.contributes.chatParticipants
				.find(p => p.id === 'sota.anton-moderniser');
			assert.ok(participant);

			const commandNames = participant.commands.map(c => c.name);
			assert.ok(commandNames.includes('modernise'));
			assert.ok(commandNames.includes('next-phase'));
			assert.ok(commandNames.includes('phase-status'));
		});
	});
});
