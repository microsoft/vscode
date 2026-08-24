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
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IEditorPane, IVisibleEditorPane } from '../../../../../workbench/common/editor.js';
import { SessionChangesEditor } from '../../../changes/browser/sessionChangesEditor.js';
import { SessionsDiffEditorCommandsService, SessionsDiffEditorLayoutContribution } from '../../browser/diffEditor.sessions.contribution.js';
import { TextDiffEditor } from '../../../../../workbench/browser/parts/editor/textDiffEditor.js';
import { IDiffEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { ICodeEditor, IDiffEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditorType } from '../../../../../editor/common/editorCommon.js';
import { IDiffEditorOptionsService } from '../../common/diffEditorOptionsService.js';

suite('SessionsDiffEditorCommandsService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(activeEditorPane: IEditorPane | undefined, visibleEditorPanes: readonly IVisibleEditorPane[] = []): { service: SessionsDiffEditorCommandsService; getToggleCount(): number } {
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
		const diffEditorOptionsService = new class extends mock<IDiffEditorOptionsService>() {
			override toggleRenderSideBySide(): void { toggleCount++; }
		};

		const service = new SessionsDiffEditorCommandsService(editorService, textResourceConfigurationService, contextKeyService, diffEditorOptionsService);
		return { service, getToggleCount: () => toggleCount };
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

	test('toggles the shared preference from the Changes editor', async () => {
		// Use the prototype so `instanceof SessionChangesEditor` holds without constructing the heavy pane.
		const changesEditor = Object.create(SessionChangesEditor.prototype) as IEditorPane;
		const { service, getToggleCount } = createService(changesEditor);

		await service.toggleRenderSideBySide([]);

		assert.strictEqual(getToggleCount(), 1);
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

	test('applies the shared responsive preference to all visible text diffs', () => {
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
		const renderSideBySide = observableValue('test', true);
		const diffEditorOptionsService = new class extends mock<IDiffEditorOptionsService>() {
			override readonly renderSideBySide = renderSideBySide;
		};
		disposables.add(new SessionsDiffEditorLayoutContribution(editorService, diffEditorOptionsService));

		renderSideBySide.set(false, undefined);

		assert.deepStrictEqual({
			activeControlUpdates,
			visibleControlUpdates,
		}, {
			activeControlUpdates: [
				{ renderSideBySide: true, useInlineViewWhenSpaceIsLimited: true },
				{ renderSideBySide: false, useInlineViewWhenSpaceIsLimited: true },
			],
			visibleControlUpdates: [
				{ renderSideBySide: true, useInlineViewWhenSpaceIsLimited: true },
				{ renderSideBySide: false, useInlineViewWhenSpaceIsLimited: true },
			],
		});
	});
});
