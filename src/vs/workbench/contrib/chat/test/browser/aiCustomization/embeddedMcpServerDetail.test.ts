/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, getWindow } from '../../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Event } from '../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CodeEditorWidget } from '../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IResourceEditorInput } from '../../../../../../platform/editor/common/editor.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IFileContent, IFileService } from '../../../../../../platform/files/common/files.js';
import { IMcpServerConfiguration, McpServerType } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IEditableMcpServerConfiguration, IMcpWorkbenchService, McpServerInstallState } from '../../../../mcp/common/mcpTypes.js';
import { McpResourceFormat } from '../../../../../../platform/mcp/common/mcpWorkspaceConfiguration.js';
import { EmbeddedMcpServerDetail, IMcpServerDetailInput } from '../../../browser/aiCustomization/embeddedMcpServerDetail.js';
import { createVSCodeHarnessDescriptor, ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';

suite('EmbeddedMcpServerDetail', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const uri = URI.file('/home/test/.copilot/mcp-config.json');
	const definition = '{ "command": "memory-server", "args": [] }';
	const content = `{\n\t"mcpServers": {\n\t\t"local-memory": ${definition},\n\t\t"other": { "command": "other-server" }\n\t}\n}`;

	function createDetail(editable?: (source: URI, name: string) => IEditableMcpServerConfiguration | undefined) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const reads: { uri: URI; result: DeferredPromise<IFileContent> }[] = [];
		const executedCommands: unknown[][] = [];
		const openedEditors: IResourceEditorInput[] = [];
		let model: ITextModel | null = null;
		instantiationService.stub(ICommandService, {
			executeCommand: async (...args: unknown[]) => { executedCommands.push(args); return undefined; },
		});
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<undefined> {
				openedEditors.push(args[0] as IResourceEditorInput);
				return undefined;
			}
		}());
		instantiationService.stub(IFileService, {
			readFile: resource => {
				const result = new DeferredPromise<IFileContent>();
				reads.push({ uri: resource, result });
				return result.p;
			},
		});
		instantiationService.stub(IMcpWorkbenchService, {
			onChange: Event.None,
			resolveEditableMcpServerConfiguration: async (source, name) => editable?.(source, name),
		});
		instantiationService.stub(ICustomizationHarnessService, {
			activeSessionResource: constObservable(URI.parse('copilot:/session')),
			availableHarnesses: constObservable([createVSCodeHarnessDescriptor()]),
			getActiveDescriptor: () => createVSCodeHarnessDescriptor(),
		});
		instantiationService.stubInstance(CodeEditorWidget, {
			setModel: value => {
				assert.ok(value === null || (value && hasKey(value, { getValue: true })));
				model = value;
			},
			updateOptions: () => { },
			dispose: () => { },
		});
		const detail = store.add(instantiationService.createInstance(EmbeddedMcpServerDetail, $('div'), {
			openMigrationPage: () => { },
		}));
		const input: IMcpServerDetailInput = {
			id: 'memory', name: 'local-memory', label: 'Local Memory',
			installState: McpServerInstallState.Installed,
			source: { uri },
		};
		const snapshot = () => ({
			definition: model?.getValue(),
			emptyMessage: detail.element.querySelector<HTMLElement>('.mcp-detail-definition-empty')!.textContent,
			editorVisible: detail.element.querySelector<HTMLElement>('.mcp-detail-definition-editor')!.style.display !== 'none',
		});
		const complete = (index: number, text = content) => reads[index].result.complete(new class extends mock<IFileContent>() {
			override readonly value = VSBuffer.fromString(text);
		}());
		return { detail, input, reads, snapshot, complete, executedCommands, openedEditors };
	}

	test('loads only the selected definition after migration metadata changes during the read', async () => {
		const { detail, input, reads, snapshot, complete } = createDetail();
		detail.setInput(input);
		detail.setMigratable(false);
		await complete(0);

		assert.deepStrictEqual({
			...snapshot(),
			source: reads[0].uri,
			label: detail.element.querySelector('.editor-item-path')!.textContent,
		}, {
			definition,
			emptyMessage: 'No definition is available for this MCP server.',
			editorVisible: true,
			source: uri,
			label: 'mcp-config.json',
		});
	});

	test('shows read failures after migration metadata changes', async () => {
		const { detail, input, reads, snapshot } = createDetail();
		detail.setInput(input);
		detail.setMigratable(false);
		await reads[0].result.error(new Error('File unavailable'));

		assert.deepStrictEqual(snapshot(), {
			definition: undefined,
			emptyMessage: 'The MCP server definition could not be loaded.',
			editorVisible: false,
		});
	});

	test('prefers an explicit source range to the server name lookup', async () => {
		const { detail, input, snapshot, complete } = createDetail();
		detail.setInput({ ...input, source: { uri, range: new Range(4, 12, 4, 41) } });
		await complete(0);

		assert.strictEqual(snapshot().definition, '{ "command": "other-server" }');
	});

	test('shows the source document when no server entry can be located', async () => {
		const { detail, input, snapshot, complete } = createDetail();
		detail.setInput({ ...input, name: 'missing' });
		await complete(0);

		assert.strictEqual(snapshot().definition, content);
	});

	for (const fail of [false, true]) {
		test(`ignores stale read ${fail ? 'failures' : 'results'} after selecting another server`, async () => {
			const { detail, input, reads, snapshot, complete } = createDetail();
			detail.setInput(input);
			detail.setInput({ ...input, id: 'other', name: 'other' });
			await complete(1);
			const current = snapshot();
			if (fail) {
				await reads[0].result.error(new Error('Old read failed'));
			} else {
				await complete(0);
			}

			assert.deepStrictEqual({ definition: current.definition, afterOldRead: snapshot() }, {
				definition: '{ "command": "other-server" }',
				afterOldRead: current,
			});
		});
	}

	test('ignores pending reads after clearing the input', async () => {
		const { detail, input, snapshot, complete } = createDetail();
		detail.setInput(input);
		detail.clearInput();
		await complete(0);

		assert.deepStrictEqual(snapshot(), {
			definition: undefined,
			emptyMessage: 'No definition is available for this MCP server.',
			editorVisible: false,
		});
	});

	test('shows where a server comes from when it has no configuration file', async () => {
		const { detail, input, complete } = createDetail();
		const opened: string[] = [];
		const path = detail.element.querySelector<HTMLAnchorElement>('.editor-item-path')!;
		const editConfiguration = detail.element.querySelector<HTMLElement>('.embedded-detail-title-actions .monaco-button')!;
		const header = () => ({
			label: path.style.display === 'none' ? undefined : path.textContent,
			link: path.hasAttribute('href'),
			ariaLabel: path.getAttribute('aria-label'),
			provenance: path.classList.contains('provenance'),
			editConfiguration: editConfiguration.style.display !== 'none',
		});
		const builtin = { label: 'Built-in: Copilot' };
		const extension = { label: 'Built-in: GitHub Copilot Chat', ariaLabel: 'Open extension details for GitHub Copilot Chat', open: () => opened.push('extension') };

		detail.setInput({ ...input, source: undefined, provenance: builtin });
		const agent = header();
		detail.setInput({ ...input, source: undefined, provenance: extension });
		const contributed = header();
		path.click();
		detail.setInput({ ...input, source: undefined });
		const unknown = header();
		detail.setInput({ ...input, provenance: builtin });
		const file = header();
		await complete(0);

		assert.deepStrictEqual({ agent, contributed, unknown, file, opened }, {
			agent: { label: 'Built-in: Copilot', link: false, ariaLabel: null, provenance: true, editConfiguration: false },
			contributed: { label: 'Built-in: GitHub Copilot Chat', link: true, ariaLabel: 'Open extension details for GitHub Copilot Chat', provenance: true, editConfiguration: false },
			unknown: { label: undefined, link: false, ariaLabel: null, provenance: false, editConfiguration: false },
			file: { label: 'mcp-config.json', link: true, ariaLabel: 'Open mcp-config.json', provenance: false, editConfiguration: true },
			opened: ['extension'],
		});
	});

	test('explains a missing definition and links to the setting that controls the server', () => {
		const { detail, input, snapshot, executedCommands } = createDetail();
		const empty = detail.element.querySelector<HTMLElement>('.mcp-detail-definition-empty')!;
		const settingsLink = () => empty.querySelector<HTMLAnchorElement>('.mcp-detail-definition-settings-link');
		const read = () => ({ message: empty.querySelector('.mcp-detail-definition-message')?.textContent, link: settingsLink()?.textContent, ariaLabel: settingsLink()?.getAttribute('aria-label'), editorVisible: snapshot().editorVisible });
		const builtin = { id: 'github', name: 'github-mcp-server', label: 'github-mcp-server', installState: McpServerInstallState.Installed };
		const message = 'Copilot configures this server automatically, so its definition can\'t be viewed or edited.';

		detail.setInput({ ...builtin, definitionUnavailable: { message, settingId: 'chat.agentHost.githubMcpServer.enabled' } });
		const withSetting = read();
		settingsLink()!.click();
		detail.setInput({ ...builtin, definitionUnavailable: { message } });
		const withoutSetting = read();
		detail.setInput({ ...builtin });
		const unexplained = read();
		detail.setInput({ ...input, source: undefined, config: { type: McpServerType.LOCAL, command: 'memory-server' }, definitionUnavailable: { message, settingId: 'chat.agentHost.githubMcpServer.enabled' } });

		assert.deepStrictEqual({ withSetting, withoutSetting, unexplained, withDefinition: read(), executedCommands }, {
			withSetting: { message, link: 'Open Settings', ariaLabel: 'Open Settings for github-mcp-server', editorVisible: false },
			withoutSetting: { message, link: undefined, ariaLabel: undefined, editorVisible: false },
			unexplained: { message: 'No definition is available for this MCP server.', link: undefined, ariaLabel: undefined, editorVisible: false },
			withDefinition: { message: 'No definition is available for this MCP server.', link: undefined, ariaLabel: undefined, editorVisible: true },
			executedCommands: [['workbench.action.openSettings', '@id:chat.agentHost.githubMcpServer.enabled']],
		});
	});

	test('updates an open detail when the host enriches a restored server, keeping migration state', () => {
		const { detail } = createDetail();
		const name = () => detail.element.querySelector('.editor-item-name')?.textContent;
		const path = () => detail.element.querySelector('.editor-item-path')?.textContent;
		const message = () => detail.element.querySelector('.mcp-detail-definition-message')?.textContent;
		const settingsLink = () => detail.element.querySelector('.mcp-detail-definition-settings-link')?.textContent;
		const read = () => ({ name: name(), path: path(), message: message(), settingsLink: settingsLink() });
		const restored: IMcpServerDetailInput = {
			id: 'session:server-7', name: 'github-copilot-connector-1', label: 'github-copilot-connector-1',
			installState: McpServerInstallState.Installed,
		};
		const enriched: IMcpServerDetailInput = {
			...restored,
			label: 'Linear',
			provenance: { label: 'Managed by Copilot' },
			definitionUnavailable: { message: 'Copilot manages this server, so its definition can\'t be viewed or edited.', settingId: 'chat.example.enabled' },
		};

		detail.setInput(restored);
		detail.setMigratable(true);
		const before = read();
		const definitionEmpty = detail.element.querySelector('.mcp-detail-definition-message');
		detail.updateInput({ ...enriched, id: 'session:other-server', label: 'Other' });
		const otherServer = read();
		detail.updateInput(enriched);
		const after = read();
		const migration = detail.element.querySelector<HTMLElement>('.mcp-detail-diagnostic-card.migration')?.closest<HTMLElement>('section')?.style.display;
		const renderedMessage = detail.element.querySelector('.mcp-detail-definition-message');
		detail.updateInput({ ...enriched, provenance: { label: 'Managed by Copilot' }, error: undefined });

		assert.deepStrictEqual({
			before,
			otherServer,
			after,
			migrationKept: migration !== 'none',
			rerendered: definitionEmpty !== renderedMessage,
			unchangedKeepsNodes: detail.element.querySelector('.mcp-detail-definition-message') === renderedMessage,
		}, {
			before: { name: 'github-copilot-connector-1', path: '', message: 'No definition is available for this MCP server.', settingsLink: undefined },
			otherServer: { name: 'github-copilot-connector-1', path: '', message: 'No definition is available for this MCP server.', settingsLink: undefined },
			after: { name: 'Linear', path: 'Managed by Copilot', message: 'Copilot manages this server, so its definition can\'t be viewed or edited.', settingsLink: 'Open Settings' },
			migrationKept: true,
			rerendered: true,
			unchangedKeepsNodes: true,
		});
	});

	test('shows a host configuration that arrives after the detail opened', () => {
		const { detail, snapshot } = createDetail();
		const read = () => ({ ...snapshot(), path: detail.element.querySelector('.editor-item-path')?.textContent });
		const restored: IMcpServerDetailInput = {
			id: 'session:server-8', name: 'my-mcp-server', label: 'my-mcp-server',
			installState: McpServerInstallState.Installed,
		};

		detail.setInput(restored);
		const before = read();
		detail.updateInput({ ...restored, provenance: { label: 'Agent host configuration' }, config: { type: McpServerType.LOCAL, command: 'my-mcp-server' } });

		assert.deepStrictEqual({ before, after: read() }, {
			before: { definition: undefined, emptyMessage: 'No definition is available for this MCP server.', editorVisible: false, path: '' },
			after: {
				definition: '{\n\t"servers": {\n\t\t"my-mcp-server": {\n\t\t\t"type": "stdio",\n\t\t\t"command": "my-mcp-server"\n\t\t}\n\t}\n}\n',
				emptyMessage: 'No definition is available for this MCP server.',
				editorVisible: true,
				path: 'Agent host configuration',
			},
		});
	});

	test('keeps servers from VS Code mcp.json files read-only', async () => {
		const { detail, input, snapshot } = createDetail();
		detail.setInput({ ...input, source: { uri: URI.file('/home/test/.vscode/mcp.json') }, config: { type: McpServerType.LOCAL, command: 'memory-server' } });
		await timeout(0);

		assert.deepStrictEqual({
			editorVisible: snapshot().editorVisible,
			formVisible: detail.element.querySelector<HTMLElement>('.mcp-detail-configuration-form')!.style.display !== 'none',
			heading: detail.element.querySelector<HTMLElement>('.mcp-detail-section-title')!.style.display !== 'none',
			diagnosticsText: detail.element.querySelector('.mcp-detail-diagnostics')!.textContent,
		}, {
			editorVisible: true,
			formVisible: false,
			heading: true,
			diagnosticsText: '',
		});
	});

	for (const { format, types, envFile, workingDirectory } of [
		{ format: McpResourceFormat.CopilotGlobal, types: ['stdio', 'http', 'sse'], envFile: false, workingDirectory: true },
		{ format: McpResourceFormat.WorkspaceRoot, types: ['stdio', 'http'], envFile: false, workingDirectory: false },
	]) {
		test(`edits a server from a shared ${format} configuration through the configuration form`, async () => {
			const saves: { previous: IMcpServerConfiguration; config: IMcpServerConfiguration }[] = [];
			// `envFile` is hidden for both shared formats; keeping its existing value must not block saving.
			const config: IMcpServerConfiguration = { type: McpServerType.LOCAL, command: 'memory-server', envFile: '.env', env: { TOKEN: 'old' } };
			const { detail, input, snapshot, openedEditors } = createDetail((source, name) => isEqual(source, uri) && name === 'local-memory' ? {
				config,
				format,
				save: async (previous, next) => { saves.push({ previous, config: next }); },
			} : undefined);
			const range = new Range(3, 3, 3, 40);
			detail.setInput({ ...input, source: { uri, range } });
			await timeout(0);

			const form = detail.element.querySelector<HTMLElement>('.mcp-detail-configuration-form')!;
			form.querySelector<HTMLElement>('.mcp-config-form-other-properties')!.click();
			await timeout(0);
			const field = (label: string) => [...form.querySelectorAll<HTMLElement>('.mcp-config-form-field')].find(field => field.querySelector('.mcp-config-form-label')?.firstChild?.textContent === label)!;
			const valueInput = form.querySelector<HTMLInputElement>('.mcp-config-form-kv-value input')!;
			valueInput.value = 'new';
			valueInput.dispatchEvent(new (getWindow(valueInput).Event)('input'));
			const [, , saveButton] = form.querySelectorAll<HTMLElement>('.mcp-config-form-footer .monaco-button');
			saveButton.click();
			await timeout(0);

			assert.deepStrictEqual({
				openedEditors,
				formVisible: form.style.display !== 'none',
				editorVisible: snapshot().editorVisible,
				heading: detail.element.querySelector<HTMLElement>('.mcp-detail-section-title')!.style.display !== 'none',
				types: [...form.querySelectorAll('.monaco-custom-radio .monaco-button')].map(button => button.textContent),
				addVariable: form.querySelector('.mcp-config-form-kv-add .monaco-button')!.textContent,
				envFile: field('Environment File').style.display !== 'none',
				workingDirectory: field('Working Directory').style.display !== 'none',
				saves,
			}, {
				openedEditors: [{ resource: uri, options: { selection: range, pinned: true } }],
				formVisible: true,
				editorVisible: false,
				heading: false,
				types,
				addVariable: 'Add Variable',
				envFile,
				workingDirectory,
				saves: [{ previous: config, config: { type: McpServerType.LOCAL, command: 'memory-server', envFile: '.env', env: { TOKEN: 'new' } } }],
			});
		});
	}
});
