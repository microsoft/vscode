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

suite('SessionsDiffEditorCommandsService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	interface IWrite { readonly key: string; readonly value: unknown; readonly target?: ConfigurationTarget }

	function createService(activeEditorPane: IEditorPane | undefined, renderSideBySide: boolean): { service: SessionsDiffEditorCommandsService; workspaceWrites: IWrite[]; resourceWrites: IWrite[] } {
		const workspaceWrites: IWrite[] = [];
		const resourceWrites: IWrite[] = [];

		const editorService = new class extends mock<IEditorService>() {
			override get activeEditorPane() { return activeEditorPane as IVisibleEditorPane | undefined; }
			override get activeEditor() { return undefined; }
			override get visibleEditorPanes() { return []; }
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
				resourceWrites.push({ key, value });
				return Promise.resolve();
			}
		};
		const contextKeyService = new class extends mock<IContextKeyService>() {
			override getContextKeyValue<T>(): T | undefined { return undefined; }
		};

		const service = new SessionsDiffEditorCommandsService(editorService, textResourceConfigurationService, contextKeyService, configurationService);
		return { service, workspaceWrites, resourceWrites };
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

	test('falls back to the base path for a normal diff editor', async () => {
		const { service, workspaceWrites } = createService(undefined /* no Changes editor active */, true);

		await service.toggleRenderSideBySide([]);

		assert.strictEqual(workspaceWrites.length, 0, 'the workspace setting must not be written for a non-Changes editor');
	});
});
