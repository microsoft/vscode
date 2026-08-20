/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationOverrides, IConfigurationUpdateOverrides, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IEditorPane, IVisibleEditorPane } from '../../../../../workbench/common/editor.js';
import { SessionChangesEditor } from '../../../changes/browser/sessionChangesEditor.js';
import { SessionsDiffEditorCommandsService } from '../../browser/diffEditor.sessions.contribution.js';
import { TextDiffEditor } from '../../../../../workbench/browser/parts/editor/textDiffEditor.js';
import { IDiffEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { ICodeEditor, IDiffEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditorType } from '../../../../../editor/common/editorCommon.js';

suite('SessionsDiffEditorCommandsService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	interface IWrite { readonly resource?: URI; readonly key: string; readonly value: unknown; readonly target?: ConfigurationTarget }

	function createService(activeEditorPane: IEditorPane | undefined, renderSideBySide: boolean, visibleEditorPanes: readonly IVisibleEditorPane[] = []): { service: SessionsDiffEditorCommandsService; workspaceWrites: IWrite[]; resourceWrites: IWrite[] } {
		const workspaceWrites: IWrite[] = [];
		const resourceWrites: IWrite[] = [];

		const editorService = new class extends mock<IEditorService>() {
			override get activeEditorPane() { return activeEditorPane as IVisibleEditorPane | undefined; }
			override get activeEditor() { return undefined; }
			override get visibleEditorPanes() { return visibleEditorPanes; }
			override get visibleEditors() { return []; }
		};
		const configurationService = new class extends mock<IConfigurationService>() {
			override getValue<T>(arg1?: string | IConfigurationOverrides): T { return renderSideBySide as unknown as T; }
			override updateValue(key: string, value: unknown, arg3?: ConfigurationTarget | IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void> {
				workspaceWrites.push({ key, value, target: arg3 as ConfigurationTarget });
				return Promise.resolve();
			}
		};
		const textResourceConfigurationService = new class extends mock<ITextResourceConfigurationService>() {
			override getValue<T>(): T { return true as unknown as T; }
			override updateValue(resource: URI | undefined, key: string, value: unknown): Promise<void> {
				resourceWrites.push({ resource, key, value });
				return Promise.resolve();
			}
		};
		const contextKeyService = new class extends mock<IContextKeyService>() {
			override getContextKeyValue<T>(): T | undefined { return undefined; }
		};

		const service = new SessionsDiffEditorCommandsService(editorService, textResourceConfigurationService, contextKeyService, configurationService);
		return { service, workspaceWrites, resourceWrites };
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

	test('flips the workspace renderSideBySide setting when the Changes editor is active', async () => {
		// Use the prototype so `instanceof SessionChangesEditor` holds without constructing the heavy pane.
		const changesEditor = Object.create(SessionChangesEditor.prototype) as IEditorPane;
		const { service, workspaceWrites, resourceWrites } = createService(changesEditor, true /* currently side by side */);

		await service.toggleRenderSideBySide([]);

		assert.deepStrictEqual(workspaceWrites, [{ key: 'diffEditor.renderSideBySide', value: false, target: ConfigurationTarget.WORKSPACE }]);
		assert.strictEqual(resourceWrites.length, 0, 'the base resource-scoped path must not be used for the Changes editor');
	});

	test('toggles back to side by side when currently inline', async () => {
		const changesEditor = Object.create(SessionChangesEditor.prototype) as IEditorPane;
		const { service, workspaceWrites } = createService(changesEditor, false /* currently inline */);

		await service.toggleRenderSideBySide([]);

		assert.deepStrictEqual(workspaceWrites, [{ key: 'diffEditor.renderSideBySide', value: true, target: ConfigurationTarget.WORKSPACE }]);
	});

	test('toggles and persists the active single-file diff editor without forwarded arguments', async () => {
		const resource = URI.file('/workspace/file.ts');
		const controlUpdates: IDiffEditorOptions[] = [];
		const textDiffEditor = createTextDiffEditor(resource, false, controlUpdates);
		const { service, workspaceWrites, resourceWrites } = createService(textDiffEditor, true);

		await service.toggleRenderSideBySide([]);

		assert.deepStrictEqual({
			workspaceWrites,
			resourceWrites,
			controlUpdates,
		}, {
			workspaceWrites: [],
			resourceWrites: [{ resource, key: 'diffEditor.renderSideBySide', value: true }],
			controlUpdates: [{ renderSideBySide: true, useInlineViewWhenSpaceIsLimited: false }],
		});
	});

	test('toggles the visible single-file diff matching the forwarded resource', async () => {
		const activeResource = URI.file('/workspace/active.ts');
		const targetResource = URI.file('/workspace/target.ts');
		const activeControlUpdates: IDiffEditorOptions[] = [];
		const targetControlUpdates: IDiffEditorOptions[] = [];
		const activeEditor = createTextDiffEditor(activeResource, true, activeControlUpdates);
		const targetEditor = createTextDiffEditor(targetResource, true, targetControlUpdates);
		const { service, resourceWrites } = createService(activeEditor, true, [targetEditor as IVisibleEditorPane]);

		await service.toggleRenderSideBySide([targetResource]);

		assert.deepStrictEqual({
			resourceWrites,
			activeControlUpdates,
			targetControlUpdates,
		}, {
			resourceWrites: [{ resource: targetResource, key: 'diffEditor.renderSideBySide', value: false }],
			activeControlUpdates: [],
			targetControlUpdates: [{ renderSideBySide: false, useInlineViewWhenSpaceIsLimited: false }],
		});
	});

	test('prefers a forwarded single-file diff over the active Changes editor', async () => {
		const resource = URI.file('/workspace/target.ts');
		const controlUpdates: IDiffEditorOptions[] = [];
		const targetEditor = createTextDiffEditor(resource, true, controlUpdates);
		const changesEditor = Object.create(SessionChangesEditor.prototype) as IEditorPane;
		const { service, workspaceWrites, resourceWrites } = createService(changesEditor, true, [targetEditor as IVisibleEditorPane]);

		await service.toggleRenderSideBySide([resource]);

		assert.deepStrictEqual({
			workspaceWrites,
			resourceWrites,
			controlUpdates,
		}, {
			workspaceWrites: [],
			resourceWrites: [{ resource, key: 'diffEditor.renderSideBySide', value: false }],
			controlUpdates: [{ renderSideBySide: false, useInlineViewWhenSpaceIsLimited: false }],
		});
	});
});
