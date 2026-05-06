/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isWellKnownModeSchema, SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import type { SessionConfigPropertySchema } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { buildModeOptionGroup, getModeIcon, getModeSchemaFingerprint, getSelectedModeOptionItem } from '../../../browser/agentSessions/agentHost/agentHostModeOptionGroup.js';

function modeSchema(overrides: Partial<SessionConfigPropertySchema> = {}): SessionConfigPropertySchema {
	return {
		type: 'string',
		title: 'Mode',
		enum: ['interactive', 'plan', 'autopilot'],
		enumLabels: ['Interactive', 'Plan', 'Autopilot'],
		default: 'interactive',
		sessionMutable: true,
		...overrides,
	};
}

suite('agentHostModeOptionGroup', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('buildModeOptionGroup', () => {

		test('produces a group when schema is well-known + mutable + static', () => {
			const group = buildModeOptionGroup(modeSchema());
			assert.ok(group);
			assert.strictEqual(group!.id, SessionConfigKey.Mode);
			assert.deepStrictEqual(group!.items.map(i => ({ id: i.id, name: i.name, icon: i.icon })), [
				{ id: 'interactive', name: 'Interactive', icon: Codicon.comment },
				{ id: 'plan', name: 'Plan', icon: Codicon.checklist },
				{ id: 'autopilot', name: 'Autopilot', icon: Codicon.rocket },
			]);
		});

		test('returns undefined when schema is dynamic', () => {
			assert.strictEqual(buildModeOptionGroup(modeSchema({ enumDynamic: true })), undefined);
		});

		test('returns undefined when schema is not mutable', () => {
			assert.strictEqual(buildModeOptionGroup(modeSchema({ sessionMutable: false })), undefined);
			assert.strictEqual(buildModeOptionGroup(modeSchema({ sessionMutable: undefined })), undefined);
		});

		test('returns undefined when schema is read-only', () => {
			assert.strictEqual(buildModeOptionGroup(modeSchema({ readOnly: true })), undefined);
		});

		test('returns undefined when schema is not well-known (no `interactive`)', () => {
			assert.strictEqual(buildModeOptionGroup(modeSchema({ enum: ['plan', 'autopilot'] })), undefined);
		});

		test('items follow schema.enum exactly when agent omits a value', () => {
			const group = buildModeOptionGroup(modeSchema({ enum: ['interactive', 'plan'], enumLabels: ['Interactive', 'Plan'] }));
			assert.ok(group);
			assert.deepStrictEqual(group!.items.map(i => i.id), ['interactive', 'plan']);
		});
	});

	suite('isWellKnownModeSchema', () => {
		test('accepts a string enum containing `interactive`', () => {
			assert.strictEqual(isWellKnownModeSchema(modeSchema()), true);
		});
		test('rejects an enum without `interactive`', () => {
			assert.strictEqual(isWellKnownModeSchema(modeSchema({ enum: ['plan', 'autopilot'] })), false);
		});
		test('rejects an empty enum', () => {
			assert.strictEqual(isWellKnownModeSchema(modeSchema({ enum: [] })), false);
		});
	});

	suite('getModeIcon', () => {
		test('maps known values to codicons and unknowns to undefined', () => {
			assert.strictEqual(getModeIcon('interactive'), Codicon.comment);
			assert.strictEqual(getModeIcon('plan'), Codicon.checklist);
			assert.strictEqual(getModeIcon('autopilot'), Codicon.rocket);
			assert.strictEqual(getModeIcon('something-else'), undefined);
		});
	});

	suite('getSelectedModeOptionItem', () => {
		test('prefers currentValue over default', () => {
			const schema = modeSchema();
			const group = buildModeOptionGroup(schema)!;
			assert.strictEqual(getSelectedModeOptionItem(group, 'plan', schema)?.id, 'plan');
		});
		test('falls back to schema.default when currentValue is missing', () => {
			const schema = modeSchema({ default: 'plan' });
			const group = buildModeOptionGroup(schema)!;
			assert.strictEqual(getSelectedModeOptionItem(group, undefined, schema)?.id, 'plan');
		});
		test('falls back to first enum value when default is missing', () => {
			const schema = modeSchema({ default: undefined });
			const group = buildModeOptionGroup(schema)!;
			assert.strictEqual(getSelectedModeOptionItem(group, undefined, schema)?.id, 'interactive');
		});
	});

	suite('getModeSchemaFingerprint', () => {
		test('is stable for equivalent schemas', () => {
			assert.strictEqual(
				getModeSchemaFingerprint(modeSchema()),
				getModeSchemaFingerprint(modeSchema()),
			);
		});
		test('changes when enum changes', () => {
			assert.notStrictEqual(
				getModeSchemaFingerprint(modeSchema()),
				getModeSchemaFingerprint(modeSchema({ enum: ['interactive', 'plan'] })),
			);
		});
		test('changes when sessionMutable changes', () => {
			assert.notStrictEqual(
				getModeSchemaFingerprint(modeSchema({ sessionMutable: true })),
				getModeSchemaFingerprint(modeSchema({ sessionMutable: false })),
			);
		});
	});
});
