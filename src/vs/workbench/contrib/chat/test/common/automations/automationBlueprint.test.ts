/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAutomationDescriptor } from '../../../common/automations/automation.js';
import { AutomationBlueprintParseError, automationToBlueprint, createAutomationBlueprintFileName, parseAutomationBlueprint, serializeAutomationBlueprint } from '../../../common/automations/automationBlueprint.js';

suite('Automation blueprints', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('does not silently export custom or UTC wall-clock schedules as local schedules', () => {
		for (const interval of ['custom', 'daily', 'weekdays', 'weekly'] as const) {
			assert.throws(() => serializeAutomationBlueprint({
				version: 1, id: 'cloud', name: 'Cloud', prompt: 'Review',
				schedule: { interval, timeZone: 'UTC', scheduleHour: 7, scheduleMinute: 15, scheduleDay: 1 },
			}), AutomationBlueprintParseError);
		}
	});

	test('round trips weekdays using one canonical local cron expression', () => {
		const blueprint = {
			version: 1 as const,
			id: 'weekday-review',
			name: 'Weekday review',
			prompt: 'Review the workspace.',
			schedule: { interval: 'weekdays' as const, scheduleHour: 9, scheduleMinute: 35, scheduleDay: 0 },
		};
		const document = [
			'---',
			'version: 1',
			'id: "weekday-review"',
			'name: "Weekday review"',
			'schedule:',
			'  kind: cron',
			'  expression: "35 9 * * 1-5"',
			'  timeZone: local',
			'---',
			'',
			'Review the workspace.',
			'',
		].join('\n');

		assert.deepStrictEqual({
			serialized: serializeAutomationBlueprint(blueprint),
			parsed: parseAutomationBlueprint(document),
		}, { serialized: document, parsed: blueprint });
		assert.throws(() => parseAutomationBlueprint(document.replace('timeZone: local', 'timeZone: UTC')), AutomationBlueprintParseError);
	});

	test('exports weekdays without an unused weekly day', () => {
		const automation: IAutomationDescriptor = {
			id: 'runtime-id',
			name: 'Weekday review',
			prompt: 'Review the workspace.',
			schedule: { interval: 'weekdays', scheduleHour: 18, scheduleMinute: 7, scheduleDay: 6 },
			target: { kind: 'workspace', folderUri: URI.file('/workspace'), isolation: { kind: 'default' } },
			enabled: true,
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
		};
		const blueprint = automationToBlueprint(automation);
		assert.deepStrictEqual({
			normalized: blueprint.schedule,
			roundTripped: parseAutomationBlueprint(serializeAutomationBlueprint(blueprint)).schedule,
			originalDay: automation.schedule.scheduleDay,
		}, {
			normalized: { interval: 'weekdays', scheduleHour: 18, scheduleMinute: 7, scheduleDay: 0 },
			roundTripped: { interval: 'weekdays', scheduleHour: 18, scheduleMinute: 7, scheduleDay: 0 },
			originalDay: 6,
		});
		assert.throws(() => automationToBlueprint({ ...automation, schedule: { ...automation.schedule, timeZone: 'UTC' } }), AutomationBlueprintParseError);
	});

	test('parses a portable automation blueprint', () => {
		const blueprint = parseAutomationBlueprint([
			'---',
			'version: 1',
			'id: issue-triage',
			'name: "Issue triage"',
			'description: "Review new issues"',
			'schedule:',
			'  kind: cron',
			'  expression: "30 9 * * 1"',
			'  timeZone: local',
			'---',
			'Review new issues using repository precedents.',
		].join('\n'));

		assert.deepStrictEqual(blueprint, {
			version: 1,
			id: 'issue-triage',
			name: 'Issue triage',
			description: 'Review new issues',
			prompt: 'Review new issues using repository precedents.',
			schedule: { interval: 'weekly', scheduleHour: 9, scheduleMinute: 30, scheduleDay: 1 },
		});
	});

	test('round trips supported schedules and quoted metadata', () => {
		const blueprints = [
			{
				version: 1 as const,
				id: 'manual-review',
				name: 'Manual "review"',
				description: 'Review: on demand',
				prompt: 'Review the workspace.',
				schedule: { interval: 'manual' as const, scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			},
			{
				version: 1 as const,
				id: 'daily-review',
				name: 'Daily review',
				prompt: 'Review the workspace daily.',
				schedule: { interval: 'daily' as const, scheduleHour: 13, scheduleMinute: 5, scheduleDay: 0 },
			},
			{
				version: 1 as const,
				id: 'hourly-review',
				name: 'Hourly review',
				prompt: 'Review the workspace every hour.',
				schedule: { interval: 'hourly' as const, scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			},
		];

		assert.deepStrictEqual({
			roundTripped: blueprints.map(blueprint => parseAutomationBlueprint(serializeAutomationBlueprint(blueprint))),
			manualDocument: serializeAutomationBlueprint(blueprints[0]),
			hourlyDocument: serializeAutomationBlueprint(blueprints[2]),
		}, {
			roundTripped: blueprints,
			manualDocument: [
				'---',
				'version: 1',
				'id: "manual-review"',
				'name: "Manual \\"review\\""',
				'description: "Review: on demand"',
				'schedule:',
				'  kind: manual',
				'---',
				'',
				'Review the workspace.',
				'',
			].join('\n'),
			hourlyDocument: [
				'---',
				'version: 1',
				'id: "hourly-review"',
				'name: "Hourly review"',
				'schedule:',
				'  kind: hourly',
				'---',
				'',
				'Review the workspace every hour.',
				'',
			].join('\n'),
		});
	});

	test('rejects invalid authority and schedule fields', () => {
		const documents = [
			'Review the workspace.',
			'---\nversion: 2\nid: review\nname: Review\nschedule:\n  kind: manual\n---\nReview.',
			'---\nversion: 1\nid: Review Task\nname: Review\nschedule:\n  kind: manual\n---\nReview.',
			'---\nversion: 1\nid: review\nname: Review\nenabled: true\nschedule:\n  kind: manual\n---\nReview.',
			'---\nversion: 1\nid: review\nname: Review\nschedule:\n  kind: cron\n  expression: "20 * * * *"\n  timeZone: local\n---\nReview.',
			'---\nversion: 1\nid: review\nname: Review\nschedule:\n  kind: cron\n  expression: "0 24 * * *"\n  timeZone: local\n---\nReview.',
			'---\nversion: 1\nid: review\nname: Review\nschedule:\n  kind: cron\n  expression: "0 9 * * 1"\n  timeZone: Europe/Berlin\n---\nReview.',
		];

		assert.deepStrictEqual(documents.map(document => {
			try {
				parseAutomationBlueprint(document);
				return undefined;
			} catch (error) {
				assert.ok(error instanceof AutomationBlueprintParseError);
				return { code: error.code, property: error.property };
			}
		}), [
			{ code: 'invalidFrontmatter', property: undefined },
			{ code: 'unsupportedVersion', property: '2' },
			{ code: 'invalidId', property: 'Review Task' },
			{ code: 'unknownProperty', property: 'enabled' },
			{ code: 'unsupportedSchedule', property: '20 * * * *' },
			{ code: 'unsupportedSchedule', property: '0 24 * * *' },
			{ code: 'unsupportedTimeZone', property: 'Europe/Berlin' },
		]);
	});

	test('exports only portable automation state', () => {
		const automation: IAutomationDescriptor = {
			id: 'runtime-id',
			name: 'Résumé Review',
			prompt: 'Review the workspace.',
			schedule: { interval: 'hourly', scheduleHour: 14, scheduleMinute: 99, scheduleDay: 4 },
			target: { kind: 'workspace', folderUri: URI.file('/workspace'), isolation: { kind: 'default' } },
			enabled: true,
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
		};

		assert.deepStrictEqual({
			blueprint: automationToBlueprint(automation),
			fileName: createAutomationBlueprintFileName(automation.name),
			serialized: serializeAutomationBlueprint(automationToBlueprint(automation)),
		}, {
			blueprint: {
				version: 1,
				id: 'resume-review',
				name: 'Résumé Review',
				prompt: 'Review the workspace.',
				schedule: { interval: 'hourly', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			},
			fileName: 'resume-review.automation.md',
			serialized: [
				'---',
				'version: 1',
				'id: "resume-review"',
				'name: "Résumé Review"',
				'schedule:',
				'  kind: hourly',
				'---',
				'',
				'Review the workspace.',
				'',
			].join('\n'),
		});
	});
});
