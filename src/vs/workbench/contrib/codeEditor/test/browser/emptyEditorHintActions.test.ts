/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IEditorResolverService, RegisteredEditorInfo } from '../../../../services/editor/common/editorResolverService.js';
import { IUntitledDocumentTelemetryService } from '../../../../services/untitled/common/untitledDocumentTelemetry.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { IChatAgentService } from '../../../chat/common/participants/chatAgents.js';
import { EmptyEditorHintActionsWidget } from '../../browser/emptyTextEditorHint/emptyEditorHintActions.js';

suite('EmptyEditorHintActionsWidget', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('lists the available actions and logs the ones that are used', async () => {
		const events: unknown[] = [];
		const commands: unknown[][] = [];
		const callbacks: string[] = [];

		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ITelemetryService, upcastPartial<ITelemetryService>({
			...NullTelemetryService,
			publicLog2: (eventName: string, data?: unknown) => { events.push({ eventName, data }); },
		}));
		instantiationService.stub(IUntitledDocumentTelemetryService, upcastPartial<IUntitledDocumentTelemetryService>({ getUntitledDocumentId: () => 'doc-1' }));
		instantiationService.stub(IChatAgentService, upcastPartial<IChatAgentService>({ getActivatedAgents: () => [], onDidChangeAgents: Event.None }));
		instantiationService.stub(IEditorResolverService, upcastPartial<IEditorResolverService>({
			getEditors: () => [upcastPartial<RegisteredEditorInfo>({ id: 'vscode.markdown.editor' })],
			onDidChangeEditorRegistrations: Event.None,
		}));
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({
			executeCommand: async (...args: unknown[]) => { commands.push(args); return undefined; },
			onWillExecuteCommand: Event.None,
			onDidExecuteCommand: Event.None,
		}));
		const contextKeyService = store.add(new ContextKeyService(instantiationService.get(IConfigurationService)));
		contextKeyService.createKey(ChatContextKeys.enabled.key, true);
		instantiationService.stub(IContextKeyService, contextKeyService);

		const model = store.add(createTextModel('', undefined, undefined, URI.from({ scheme: 'untitled', path: 'Untitled-1' })));
		const editor = store.add(createTestCodeEditor(model));
		const widget = store.add(instantiationService.createInstance(EmptyEditorHintActionsWidget, editor, {
			close: () => callbacks.push('close'),
			dontShowAgain: () => callbacks.push('dontShowAgain'),
		}));

		const domNode = widget.getDomNode();
		const rows = [...domNode.querySelectorAll<HTMLElement>('.watermark-entry, .separator')];
		const rowLabels = rows.map(row => row.classList.contains('separator') ? '---' : row.textContent);

		const click = async (label: string) => {
			rows.find(row => row.textContent === label)!.click();
			await timeout(0);
		};
		await click('Open in Markdown Editor');
		domNode.querySelector<HTMLElement>('.empty-editor-hint-actions-close .action-label')!.click();
		await timeout(0);

		assert.deepStrictEqual({ rowLabels, commands, callbacks, events }, {
			rowLabels: ['New Chat Editor', 'Select a Language', '---', 'Open in Markdown Editor', 'Open With Another Editor...'],
			commands: [['reopenActiveEditorWith', 'vscode.markdown.editor']],
			callbacks: ['close'],
			events: [
				{ eventName: 'emptyEditorHint', data: { kind: 'shown', action: undefined, variant: 'actions', scheme: 'untitled', untitledDocumentId: 'doc-1' } },
				{ eventName: 'emptyEditorHint', data: { kind: 'action', action: 'openMarkdownEditor', variant: 'actions', scheme: 'untitled', untitledDocumentId: 'doc-1' } },
				{ eventName: 'emptyEditorHint', data: { kind: 'action', action: 'close', variant: 'actions', scheme: 'untitled', untitledDocumentId: 'doc-1' } },
			],
		});
	});
});
