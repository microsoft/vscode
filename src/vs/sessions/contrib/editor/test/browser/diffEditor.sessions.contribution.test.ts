/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IEditorPane, IVisibleEditorPane } from '../../../../../workbench/common/editor.js';
import { SessionChangesEditor } from '../../../changes/browser/sessionChangesEditor.js';
import { SessionsDiffEditorCommandsService, SessionsDiffEditorLayoutContribution } from '../../browser/diffEditor.sessions.contribution.js';
import { TextDiffEditor } from '../../../../../workbench/browser/parts/editor/textDiffEditor.js';
import { DiffEditorViewMode, IDiffEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { ICodeEditor, IDiffEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditorType } from '../../../../../editor/common/editorCommon.js';
import { IDiffEditorOptionsService, SESSIONS_EDITOR_WORD_WRAP_SETTING, SessionsEditorWordWrap } from '../../common/diffEditorOptionsService.js';
import { MultiDiffEditor } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditor.js';

suite('SessionsDiffEditorCommandsService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers word wrap as an auto experiment', () => {
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		const property = configurationRegistry.getConfigurationProperties()[SESSIONS_EDITOR_WORD_WRAP_SETTING];

		assert.deepStrictEqual({
			type: property.type,
			enum: property.enum,
			default: property.default,
			experiment: property.experiment,
		}, {
			type: 'string',
			enum: ['off', 'on', 'inherit'],
			default: 'inherit',
			experiment: { mode: 'auto' },
		});
	});

	function createService(activeEditorPane: IEditorPane | undefined, visibleEditorPanes: readonly IVisibleEditorPane[] = []): { service: SessionsDiffEditorCommandsService; getToggleCount(): number; setModes: DiffEditorViewMode[] } {
		const editorService = new class extends mock<IEditorService>() {
			override get activeEditorPane() { return activeEditorPane as IVisibleEditorPane | undefined; }
			override get activeEditor() { return undefined; }
			override get visibleEditorPanes() { return visibleEditorPanes; }
			override get visibleEditors() { return []; }
		};
		const textResourceConfigurationService = new class extends mock<ITextResourceConfigurationService>() { };
		const contextKeyService = new class extends mock<IContextKeyService>() {
			override getContextKeyValue<T>(): T | undefined { return undefined; }
		};
		let toggleCount = 0;
		const setModes: DiffEditorViewMode[] = [];
		const diffEditorOptionsService = new class extends mock<IDiffEditorOptionsService>() {
			override toggleRenderSideBySide(): void { toggleCount++; }
			override setViewMode(mode: DiffEditorViewMode): void { setModes.push(mode); }
		};

		const service = new SessionsDiffEditorCommandsService(editorService, textResourceConfigurationService, contextKeyService, diffEditorOptionsService);
		return { service, getToggleCount: () => toggleCount, setModes };
	}

	function createTextDiffEditor(resource: URI, renderSideBySide: boolean, controlUpdates: IDiffEditorOptions[]): TextDiffEditor {
		const modifiedEditor = new class extends mock<ICodeEditor>() {
			override getModel() { return { uri: resource } as ReturnType<ICodeEditor['getModel']>; }
		};
		const control = new class extends mock<IDiffEditor>() {
			override getEditorType() { return EditorType.IDiffEditor; }
			override get renderSideBySide() { return renderSideBySide; }
			override getModifiedEditor() { return modifiedEditor; }
			override updateOptions(options: IDiffEditorOptions): void {
				controlUpdates.push(options);
			}
		};
		const pane = Object.create(TextDiffEditor.prototype) as TextDiffEditor;
		Object.defineProperty(pane, 'getControl', { value: () => control });
		return pane;
	}

	function createCodeEditor(controlUpdates: Array<{ wordWrapOverride2?: 'off' | 'on' | 'inherit' }>): IVisibleEditorPane {
		const control = new class extends mock<ICodeEditor>() {
			override getEditorType() { return EditorType.ICodeEditor; }
			override updateOptions(options: { wordWrapOverride2?: 'off' | 'on' | 'inherit' }): void {
				controlUpdates.push(options);
			}
		};
		return new class extends mock<IVisibleEditorPane>() {
			override getControl() { return control; }
		};
	}

	test('toggles the shared preference from the Changes editor', async () => {
		// Use the prototype so `instanceof SessionChangesEditor` holds without constructing the heavy pane.
		const changesEditor = Object.create(SessionChangesEditor.prototype) as IEditorPane;
		const { service, getToggleCount } = createService(changesEditor);

		await service.toggleRenderSideBySide([]);

		assert.strictEqual(getToggleCount(), 1);
	});

	test('sets an explicit shared view mode from the Changes editor', async () => {
		const changesEditor = Object.create(SessionChangesEditor.prototype) as IEditorPane;
		const { service, setModes } = createService(changesEditor);

		await service.setViewMode([], 'sideBySide');

		assert.deepStrictEqual(setModes, ['sideBySide']);
	});

	test('toggles the shared preference when a narrow single-file diff is effectively inline', async () => {
		const resource = URI.file('/workspace/file.ts');
		const controlUpdates: IDiffEditorOptions[] = [];
		const textDiffEditor = createTextDiffEditor(resource, false, controlUpdates);
		const { service, getToggleCount } = createService(textDiffEditor);

		await service.toggleRenderSideBySide([]);

		assert.deepStrictEqual({ toggleCount: getToggleCount(), controlUpdates }, { toggleCount: 1, controlUpdates: [] });
	});

	test('toggles the visible single-file diff matching the forwarded resource', async () => {
		const activeResource = URI.file('/workspace/active.ts');
		const targetResource = URI.file('/workspace/target.ts');
		const activeControlUpdates: IDiffEditorOptions[] = [];
		const targetControlUpdates: IDiffEditorOptions[] = [];
		const activeEditor = createTextDiffEditor(activeResource, true, activeControlUpdates);
		const targetEditor = createTextDiffEditor(targetResource, true, targetControlUpdates);
		const { service, getToggleCount } = createService(activeEditor, [targetEditor as IVisibleEditorPane]);

		await service.toggleRenderSideBySide([targetResource]);

		assert.deepStrictEqual({
			toggleCount: getToggleCount(),
			activeControlUpdates,
			targetControlUpdates,
		}, {
			toggleCount: 1,
			activeControlUpdates: [],
			targetControlUpdates: [],
		});
	});

	test('prefers a forwarded single-file diff over the active Changes editor', async () => {
		const resource = URI.file('/workspace/target.ts');
		const controlUpdates: IDiffEditorOptions[] = [];
		const targetEditor = createTextDiffEditor(resource, true, controlUpdates);
		const changesEditor = Object.create(SessionChangesEditor.prototype) as IEditorPane;
		const { service, getToggleCount } = createService(changesEditor, [targetEditor as IVisibleEditorPane]);

		await service.toggleRenderSideBySide([resource]);

		assert.deepStrictEqual({
			toggleCount: getToggleCount(),
			controlUpdates,
		}, {
			toggleCount: 1,
			controlUpdates: [],
		});
	});

	test('applies the shared view mode to all visible text diffs', () => {
		const activeControlUpdates: IDiffEditorOptions[] = [];
		const visibleControlUpdates: IDiffEditorOptions[] = [];
		const activeEditor = createTextDiffEditor(URI.file('/workspace/active.ts'), false, activeControlUpdates);
		const visibleEditor = createTextDiffEditor(URI.file('/workspace/visible.ts'), false, visibleControlUpdates);
		const editorService = new class extends mock<IEditorService>() {
			override readonly onDidActiveEditorChange = Event.None;
			override readonly onDidVisibleEditorsChange = Event.None;
			override get activeEditorPane() { return activeEditor as IVisibleEditorPane; }
			override get visibleEditorPanes() { return [visibleEditor as IVisibleEditorPane]; }
		};
		const viewMode = observableValue<DiffEditorViewMode>('test', 'automatic');
		const diffEditorOptionsService = new class extends mock<IDiffEditorOptionsService>() {
			override readonly viewMode = viewMode;
			override readonly renderSideBySide = viewMode.map(this, mode => mode !== 'inline');
			override readonly wordWrap = observableValue<SessionsEditorWordWrap>('test', 'inherit');
		};
		disposables.add(new SessionsDiffEditorLayoutContribution(editorService, diffEditorOptionsService));

		viewMode.set('sideBySide', undefined);
		viewMode.set('inline', undefined);

		assert.deepStrictEqual({
			activeControlUpdates,
			visibleControlUpdates,
		}, {
			activeControlUpdates: [
				{ renderSideBySide: true, useInlineViewWhenSpaceIsLimited: true, diffWordWrap: 'inherit' },
				{ renderSideBySide: true, useInlineViewWhenSpaceIsLimited: false, diffWordWrap: 'inherit' },
				{ renderSideBySide: false, useInlineViewWhenSpaceIsLimited: false, diffWordWrap: 'inherit' },
			],
			visibleControlUpdates: [
				{ renderSideBySide: true, useInlineViewWhenSpaceIsLimited: true, diffWordWrap: 'inherit' },
				{ renderSideBySide: true, useInlineViewWhenSpaceIsLimited: false, diffWordWrap: 'inherit' },
				{ renderSideBySide: false, useInlineViewWhenSpaceIsLimited: false, diffWordWrap: 'inherit' },
			],
		});
	});

	test('applies the experiment word wrap preference to code, text diff, and multi-diff editors', () => {
		const textControlUpdates: IDiffEditorOptions[] = [];
		const textEditor = createTextDiffEditor(URI.file('/workspace/active.ts'), true, textControlUpdates);
		const codeControlUpdates: Array<{ wordWrapOverride2?: 'off' | 'on' | 'inherit' }> = [];
		const codeEditor = createCodeEditor(codeControlUpdates);
		const multiDiffViewModes: DiffEditorViewMode[] = [];
		const multiDiffWordWrap: SessionsEditorWordWrap[] = [];
		const multiDiffEditor = Object.create(MultiDiffEditor.prototype) as MultiDiffEditor;
		Object.defineProperty(multiDiffEditor, 'setDiffEditorViewMode', { value: (mode: DiffEditorViewMode) => multiDiffViewModes.push(mode) });
		Object.defineProperty(multiDiffEditor, 'setDiffEditorWordWrap', { value: (wordWrap: SessionsEditorWordWrap) => multiDiffWordWrap.push(wordWrap) });
		const editorService = new class extends mock<IEditorService>() {
			override readonly onDidActiveEditorChange = Event.None;
			override readonly onDidVisibleEditorsChange = Event.None;
			override get activeEditorPane() { return textEditor as IVisibleEditorPane; }
			override get visibleEditorPanes() { return [codeEditor, multiDiffEditor as IVisibleEditorPane]; }
		};
		const viewMode = observableValue<DiffEditorViewMode>('test', 'automatic');
		const wordWrap = observableValue<SessionsEditorWordWrap>('test', 'inherit');
		const diffEditorOptionsService = new class extends mock<IDiffEditorOptionsService>() {
			override readonly viewMode = viewMode;
			override readonly renderSideBySide = viewMode.map(this, mode => mode !== 'inline');
			override readonly wordWrap = wordWrap;
		};
		disposables.add(new SessionsDiffEditorLayoutContribution(editorService, diffEditorOptionsService));

		wordWrap.set('on', undefined);
		wordWrap.set('off', undefined);

		assert.deepStrictEqual({
			textControlUpdates,
			codeControlUpdates,
			multiDiffViewModes,
			multiDiffWordWrap,
		}, {
			textControlUpdates: [
				{ renderSideBySide: true, useInlineViewWhenSpaceIsLimited: true, diffWordWrap: 'inherit' },
				{ renderSideBySide: true, useInlineViewWhenSpaceIsLimited: true, diffWordWrap: 'on' },
				{ renderSideBySide: true, useInlineViewWhenSpaceIsLimited: true, diffWordWrap: 'off' },
			],
			codeControlUpdates: [
				{ wordWrapOverride2: 'inherit' },
				{ wordWrapOverride2: 'on' },
				{ wordWrapOverride2: 'off' },
			],
			multiDiffViewModes: ['automatic', 'automatic', 'automatic'],
			multiDiffWordWrap: ['inherit', 'on', 'off'],
		});
	});
});
