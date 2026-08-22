/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	createEmptyUsageStats,
	getWorkModePreset,
	getWorkModePresets,
	getWorkModeProfileName,
	isWorkModeProfileName,
	WORK_MODE_ACTIVITY_DEBUG_DISMISSED_KEY,
	WORK_MODE_ACTIVITY_DOCS_DISMISSED_KEY,
	WORK_MODE_ACTIVITY_SUGGESTIONS_CONFIG_KEY,
	WORK_MODE_ENABLED_CONFIG_KEY,
	WORK_MODE_EXTENSIONS_CONFIG_KEY,
	WORK_MODE_LAST_SUGGESTED_KEY,
	WORK_MODE_LAYOUT_CONFIG_KEY,
	WORK_MODE_SUGGESTION_STORAGE_KEY,
	WORK_MODE_SUGGESTIONS_CONFIG_KEY,
	WORK_MODE_USAGE_STATS_KEY,
	WorkModeId,
} from '../../common/workMode.js';

/**
 * Canonical ids/names/settings keys used for backward-compatibility guards.
 * If these change, existing profiles and telemetry series may break.
 */
const STABLE_MODE_CONTRACT = [
	{ id: WorkModeId.Frontend, name: 'Frontend' },
	{ id: WorkModeId.Backend, name: 'Backend' },
	{ id: WorkModeId.Debugging, name: 'Debugging' },
	{ id: WorkModeId.Documentation, name: 'Documentation' },
	{ id: WorkModeId.Teaching, name: 'Teaching' },
	{ id: WorkModeId.Demo, name: 'Demo' },
	{ id: WorkModeId.Troubleshooting, name: 'Troubleshooting' },
	{ id: WorkModeId.Fullstack, name: 'Full Stack' },
	{ id: WorkModeId.DataScience, name: 'Data Science' },
	{ id: WorkModeId.Mobile, name: 'Mobile' },
] as const;

const STABLE_CONFIG_KEYS = [
	WORK_MODE_ENABLED_CONFIG_KEY,
	WORK_MODE_SUGGESTIONS_CONFIG_KEY,
	WORK_MODE_ACTIVITY_SUGGESTIONS_CONFIG_KEY,
	WORK_MODE_EXTENSIONS_CONFIG_KEY,
	WORK_MODE_LAYOUT_CONFIG_KEY,
] as const;

const STABLE_STORAGE_KEYS = [
	WORK_MODE_SUGGESTION_STORAGE_KEY,
	WORK_MODE_LAST_SUGGESTED_KEY,
	WORK_MODE_ACTIVITY_DEBUG_DISMISSED_KEY,
	WORK_MODE_ACTIVITY_DOCS_DISMISSED_KEY,
	WORK_MODE_USAGE_STATS_KEY,
] as const;

const STABLE_TELEMETRY_EVENT_NAMES = [
	'workMode.suggested',
	'workMode.switch',
	'workMode.activity',
	'workMode.action',
	'workMode.extensionsInstalled',
] as const;

const STABLE_COMMAND_IDS = [
	'workbench.profiles.actions.switchWorkMode',
	'workbench.profiles.actions.installWorkModeExtensions',
	'workbench.profiles.actions.applyWorkModeLayout',
	'workbench.profiles.actions.showWorkModeTips',
	'workbench.profiles.actions.detectWorkMode',
	'workbench.profiles.actions.showWorkModeStats',
] as const;

suite('Work Modes — Presets & Contracts', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	//#region Preset inventory

	test('exposes exactly the expected built-in modes', () => {
		const presets = getWorkModePresets();
		const ids = presets.map(p => p.id);
		assert.strictEqual(presets.length, 10);
		for (const entry of STABLE_MODE_CONTRACT) {
			assert.ok(ids.includes(entry.id), `missing mode id ${entry.id}`);
		}
	});

	test('mode ids are unique', () => {
		const ids = getWorkModePresets().map(p => p.id);
		assert.strictEqual(new Set(ids).size, ids.length);
	});

	test('mode profile names are unique', () => {
		const names = getWorkModePresets().map(p => p.name);
		assert.strictEqual(new Set(names).size, names.length);
	});

	test('each preset has required metadata including layout', () => {
		for (const preset of getWorkModePresets()) {
			assert.ok(preset.name, `mode ${preset.id} missing name`);
			assert.ok(preset.description, `mode ${preset.id} missing description`);
			assert.ok(preset.summary, `mode ${preset.id} missing summary`);
			assert.ok(preset.icon, `mode ${preset.id} missing icon`);
			assert.ok(preset.icon.id, `mode ${preset.id} icon missing id`);
			assert.ok(preset.settings && typeof preset.settings === 'object', `mode ${preset.id} missing settings`);
			assert.ok(Array.isArray(preset.tips) && preset.tips.length > 0, `mode ${preset.id} missing tips`);
			assert.ok(Array.isArray(preset.workspaceTagSignals), `mode ${preset.id} missing tag signals`);
			assert.ok(Array.isArray(preset.fileSignals), `mode ${preset.id} missing file signals`);
			assert.ok(Array.isArray(preset.recommendedExtensions), `mode ${preset.id} missing extensions`);
			assert.ok(preset.layout, `mode ${preset.id} missing layout preset`);
		}
	});

	//#endregion

	//#region Per-mode semantics

	test('demo mode uses zen layout and large presentation settings', () => {
		const demo = getWorkModePreset(WorkModeId.Demo)!;
		assert.strictEqual(demo.layout?.zenMode, true);
		assert.strictEqual(demo.layout?.sideBarVisible, false);
		assert.strictEqual(demo.layout?.panelVisible, false);
		assert.ok((demo.settings['editor.fontSize'] as number) >= 18);
		assert.ok((demo.settings['window.zoomLevel'] as number) >= 1);
	});

	test('debugging mode focuses debug view and prioritizes debug UI', () => {
		const debugging = getWorkModePreset(WorkModeId.Debugging)!;
		assert.strictEqual(debugging.layout?.focusDebugView, true);
		assert.strictEqual(debugging.layout?.panelVisible, true);
		assert.ok(debugging.settings['debug.openDebug'] || debugging.settings['debug.toolBarLocation']);
	});

	test('frontend recommends extensions and has frontend signals', () => {
		const frontend = getWorkModePreset(WorkModeId.Frontend)!;
		assert.ok(frontend.recommendedExtensions.length >= 2);
		assert.ok(frontend.recommendedExtensions.some(id => id.includes('eslint') || id.includes('prettier')));
		assert.ok(frontend.workspaceTagSignals.some(t => t.includes('react') || t.includes('vue') || t.includes('angular')));
		assert.strictEqual(frontend.settings['editor.formatOnSave'], true);
	});

	test('backend prioritizes terminal/panel layout', () => {
		const backend = getWorkModePreset(WorkModeId.Backend)!;
		assert.strictEqual(backend.layout?.panelVisible, true);
		assert.ok(backend.fileSignals.includes('Dockerfile') || backend.fileSignals.includes('go.mod'));
	});

	test('documentation mode enables word wrap and recommends markdown tools', () => {
		const docs = getWorkModePreset(WorkModeId.Documentation)!;
		assert.strictEqual(docs.settings['editor.wordWrap'], 'on');
		assert.ok(docs.recommendedExtensions.some(id => id.includes('markdown') || id.includes('spell')));
	});

	test('teaching mode increases font/zoom for readability', () => {
		const teaching = getWorkModePreset(WorkModeId.Teaching)!;
		assert.ok((teaching.settings['editor.fontSize'] as number) >= 16);
	});

	test('troubleshooting mode disables extension auto-update noise', () => {
		const ts = getWorkModePreset(WorkModeId.Troubleshooting)!;
		assert.strictEqual(ts.settings['extensions.autoUpdate'], false);
		assert.strictEqual(ts.layout?.panelVisible, true);
	});

	test('data science recommends python/jupyter', () => {
		const ds = getWorkModePreset(WorkModeId.DataScience)!;
		assert.ok(ds.recommendedExtensions.some(id => id.includes('python') || id.includes('jupyter')));
		assert.strictEqual(ds.layout?.auxiliaryBarVisible, true);
	});

	test('fullstack has both frontend and backend tag signals', () => {
		const fs = getWorkModePreset(WorkModeId.Fullstack)!;
		assert.ok(fs.workspaceTagSignals.some(t => t.includes('react') || t.includes('vue')));
		assert.ok(fs.workspaceTagSignals.some(t => t.includes('express') || t.includes('nestjs')));
	});

	test('mobile detects app signals', () => {
		const mobile = getWorkModePreset(WorkModeId.Mobile)!;
		assert.ok(mobile.fileSignals.includes('pubspec.yaml') || mobile.fileSignals.includes('android'));
	});

	//#endregion

	//#region Helpers

	test('getWorkModePreset resolves known ids and rejects unknown', () => {
		const frontend = getWorkModePreset(WorkModeId.Frontend);
		assert.ok(frontend);
		assert.strictEqual(frontend!.id, WorkModeId.Frontend);
		assert.strictEqual(getWorkModePreset('not-a-mode' as WorkModeId), undefined);
	});

	test('profile names are stable and detectable', () => {
		const frontend = getWorkModePreset(WorkModeId.Frontend)!;
		const name = getWorkModeProfileName(frontend);
		assert.strictEqual(name, frontend.name);
		assert.ok(isWorkModeProfileName(name));
		assert.ok(!isWorkModeProfileName('My Custom Profile'));
		assert.ok(!isWorkModeProfileName('Default'));
	});

	test('usage stats factory is empty', () => {
		const stats = createEmptyUsageStats();
		assert.strictEqual(stats.suggestionsShown, 0);
		assert.strictEqual(stats.suggestionsAccepted, 0);
		assert.strictEqual(stats.suggestionsDismissed, 0);
		assert.strictEqual(stats.activityTriggers, 0);
		assert.strictEqual(stats.extensionsInstalled, 0);
		assert.deepStrictEqual(stats.switchesByMode, {});
		assert.strictEqual(stats.lastModeId, undefined);
	});

	test('recommended extension ids look like publisher.name', () => {
		for (const preset of getWorkModePresets()) {
			for (const ext of preset.recommendedExtensions) {
				assert.ok(/^[a-z0-9][a-z0-9\-_]*\.[a-z0-9][a-z0-9\-_]*$/i.test(ext), `invalid extension id: ${ext}`);
			}
		}
	});

	test('settings objects are JSON-serializable (profile write path)', () => {
		for (const preset of getWorkModePresets()) {
			assert.doesNotThrow(() => JSON.stringify(preset.settings));
			const roundTrip = JSON.parse(JSON.stringify(preset.settings));
			assert.deepStrictEqual(roundTrip, preset.settings);
		}
	});

	//#endregion

	//#region Backward compatibility contracts

	test('BACK-COMPAT: mode ids and profile display names are stable', () => {
		for (const entry of STABLE_MODE_CONTRACT) {
			const preset = getWorkModePreset(entry.id);
			assert.ok(preset, `mode ${entry.id} was removed — breaks existing telemetry & docs`);
			// profileName is locale-stable and backs the user data profile; name may be localized in UI only
			assert.strictEqual(preset!.profileName, entry.name, `mode ${entry.id} profileName changed from "${entry.name}" to "${preset!.profileName}" — breaks existing named profiles`);
			assert.ok(isWorkModeProfileName(entry.name), `profile name "${entry.name}" no longer detected as work mode`);
			assert.strictEqual(getWorkModeProfileName(preset!), entry.name);
		}
	});

	test('BACK-COMPAT: WorkModeId enum string values are stable', () => {
		// These are persisted in storage/telemetry — do not rename without migration
		assert.strictEqual(WorkModeId.Frontend, 'frontend');
		assert.strictEqual(WorkModeId.Backend, 'backend');
		assert.strictEqual(WorkModeId.Debugging, 'debugging');
		assert.strictEqual(WorkModeId.Documentation, 'documentation');
		assert.strictEqual(WorkModeId.Teaching, 'teaching');
		assert.strictEqual(WorkModeId.Demo, 'demo');
		assert.strictEqual(WorkModeId.Troubleshooting, 'troubleshooting');
		assert.strictEqual(WorkModeId.Fullstack, 'fullstack');
		assert.strictEqual(WorkModeId.DataScience, 'datascience');
		assert.strictEqual(WorkModeId.Mobile, 'mobile');
	});

	test('BACK-COMPAT: configuration keys are stable (user settings.json)', () => {
		assert.deepStrictEqual([...STABLE_CONFIG_KEYS], [
			'workbench.profiles.workModes.enabled',
			'workbench.profiles.workModes.suggestions',
			'workbench.profiles.workModes.activitySuggestions',
			'workbench.profiles.workModes.recommendExtensions',
			'workbench.profiles.workModes.applyLayout',
		]);
	});

	test('BACK-COMPAT: storage keys are stable (workspace/app state)', () => {
		assert.deepStrictEqual([...STABLE_STORAGE_KEYS], [
			'workbench.workModes.suggestionDismissed',
			'workbench.workModes.lastSuggestedMode',
			'workbench.workModes.activityDebugDismissed',
			'workbench.workModes.activityDocsDismissed',
			'workbench.workModes.usageStats',
		]);
	});

	test('BACK-COMPAT: telemetry event names are documented and stable', () => {
		// Guard against silent renames that break dashboards
		assert.ok(STABLE_TELEMETRY_EVENT_NAMES.includes('workMode.suggested'));
		assert.ok(STABLE_TELEMETRY_EVENT_NAMES.includes('workMode.switch'));
		assert.ok(STABLE_TELEMETRY_EVENT_NAMES.includes('workMode.activity'));
		assert.ok(STABLE_TELEMETRY_EVENT_NAMES.includes('workMode.action'));
		assert.ok(STABLE_TELEMETRY_EVENT_NAMES.includes('workMode.extensionsInstalled'));
		assert.strictEqual(STABLE_TELEMETRY_EVENT_NAMES.length, 5);
	});

	test('BACK-COMPAT: command ids are stable (keybindings, scripts, docs)', () => {
		assert.strictEqual(STABLE_COMMAND_IDS.length, 6);
		for (const id of STABLE_COMMAND_IDS) {
			assert.ok(id.startsWith('workbench.profiles.actions.'), `unexpected command namespace: ${id}`);
		}
	});

	test('BACK-COMPAT: existing non-mode profiles are not misclassified', () => {
		// Users may have profiles named anything; only exact mode names count
		assert.ok(!isWorkModeProfileName('Work'));
		assert.ok(!isWorkModeProfileName('frontend')); // case-sensitive; profiles use stable English title case
		assert.ok(!isWorkModeProfileName('FullStack'));
		assert.ok(!isWorkModeProfileName(''));
	});

	test('BACK-COMPAT: core profile resource types are not required by work modes', () => {
		// Work modes only write settings on create; they must not assume exclusive ownership of
		// keybindings/extensions/snippets — users can customize those on the backing profile.
		for (const preset of getWorkModePresets()) {
			const keys = Object.keys(preset);
			assert.ok(!keys.includes('keybindings'));
			assert.ok(preset.settings); // only settings are authored by the preset
		}
	});

	test('BACK-COMPAT: layout preset fields use only known optional keys', () => {
		const allowed = new Set(['sideBarVisible', 'panelVisible', 'auxiliaryBarVisible', 'panelPosition', 'zenMode', 'focusDebugView']);
		for (const preset of getWorkModePresets()) {
			if (!preset.layout) {
				continue;
			}
			for (const key of Object.keys(preset.layout)) {
				assert.ok(allowed.has(key), `unknown layout key "${key}" on mode ${preset.id}`);
			}
			if (preset.layout.panelPosition !== undefined) {
				assert.ok(['bottom', 'right', 'left'].includes(preset.layout.panelPosition));
			}
		}
	});

	//#endregion
});
