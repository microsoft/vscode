/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IAgentCustomizationInstallationChoice, IAgentCustomizationInstallationConfigurationRequest } from '../../../../../platform/agentHost/common/agent.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { McpServerInstallForm } from '../../../../contrib/chat/browser/agentSessions/agentHost/mcpServerInstallForm.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

function createRequest(displayName: string, serverName: string, choices: readonly IAgentCustomizationInstallationChoice[], overrides: Partial<IAgentCustomizationInstallationConfigurationRequest> = {}): IAgentCustomizationInstallationConfigurationRequest {
	return {
		kind: 'configuration',
		operationId: 'operation',
		hostGeneration: 'generation',
		ownershipToken: 'ownership',
		displayName,
		serverName,
		target: serverName,
		choices,
		...overrides,
	};
}

/** A server that needs nothing: the form only shows what will be installed. */
const reviewOnly = createRequest('Contoso Notes', 'com.contoso/notes', [{
	choiceId: 'operation',
	transport: 'http',
	endpointSummary: 'https://mcp.contoso.com/notes',
	configurationFields: ['tools', 'type', 'url'],
	values: [],
	secrets: [],
}]);

/** A remote server that only needs an API key. */
const singleSecret = createRequest('Contoso Docs', 'com.contoso/docs', [{
	choiceId: 'remote:0',
	transport: 'streamable-http',
	endpointSummary: 'https://mcp.contoso.com/docs',
	configurationFields: ['headers', 'type', 'url'],
	values: [],
	secrets: [{ key: 'api_key', placeholder: '${secret:1}', title: 'API key' }],
}]);

/** A local package that uses every kind of single value: path, number, boolean, enum and text. */
const localPackage = createRequest('Contoso Files', 'io.github.contoso/files', [{
	choiceId: 'package:0',
	transport: 'stdio',
	command: 'npx @contoso/files-mcp@1.2.3 ${input:directory} --port ${input:port} --headless --verbose',
	env: { LOG_LEVEL: '${input:LOG_LEVEL}', CONTOSO_REGION: '${input:CONTOSO_REGION}', CONTOSO_TAG: '${input:CONTOSO_TAG}' },
	configurationFields: ['args', 'command', 'env', 'type'],
	values: [
		{ key: 'directory', category: 'package-argument', valueType: 'path', required: true, isRepeated: false, title: 'Root directory', description: 'The only directory the server can read and write.' },
		{ key: '--port', category: 'package-argument', valueType: 'number', required: false, isRepeated: false, defaultValue: '3000', description: 'Port the server listens on.' },
		{ key: '--headless', category: 'package-argument', valueType: 'boolean', required: true, isRepeated: false, description: 'Run without opening a browser window.' },
		{ key: '--verbose', category: 'package-argument', valueType: 'boolean', required: false, isRepeated: false },
		{ key: 'LOG_LEVEL', category: 'environment-variable', valueType: 'enum', required: false, isRepeated: false, defaultValue: 'info', enumValues: ['error', 'info', 'debug'] },
		{ key: 'CONTOSO_REGION', category: 'environment-variable', valueType: 'enum', required: true, isRepeated: false, title: 'Region', enumValues: ['us', 'eu', 'asia'] },
		{ key: 'CONTOSO_TAG', category: 'environment-variable', valueType: 'string', required: false, isRepeated: false, description: 'Label added to every file the server creates.' },
	],
	secrets: [{ key: 'CONTOSO_TOKEN', placeholder: '${secret:1}' }],
}]);

/** A remote server with URL variables, headers and a secret. */
const remoteServer = createRequest('Contoso Cloud', 'com.contoso/cloud', [{
	choiceId: 'remote:0',
	transport: 'streamable-http',
	endpointSummary: 'https://{region}.api.contoso.com/{workspace}/mcp',
	configurationFields: ['headers', 'type', 'url'],
	values: [
		{ key: 'region', category: 'url-variable', valueType: 'enum', required: true, isRepeated: false, enumValues: ['us', 'eu'] },
		{ key: 'workspace', category: 'url-variable', valueType: 'string', required: true, isRepeated: false, title: 'Workspace', description: 'The workspace name from your Contoso Cloud URL.' },
		{ key: 'X-Tenant', category: 'header', valueType: 'string', required: false, isRepeated: false },
		{ key: 'X-Debug', category: 'header', valueType: 'boolean', required: false, isRepeated: false, defaultValue: 'false' },
	],
	secrets: [{ key: 'api_key', placeholder: '${secret:1}', title: 'API key' }],
}], { target: 'contoso-cloud' });

/** Several ways to connect. The recommended one needs nothing, so the form is only a review. */
const transportChoice = createRequest('Contoso Search', 'io.github.contoso/search', [
	{
		choiceId: 'package:0',
		transport: 'stdio',
		command: 'docker run -i --rm contoso/search-mcp:2.0.1',
		configurationFields: ['args', 'command', 'type'],
		values: [],
		secrets: [],
	},
	{
		choiceId: 'remote:0',
		transport: 'streamable-http',
		endpointSummary: 'https://search.contoso.com/mcp',
		configurationFields: ['headers', 'type', 'url'],
		values: [],
		secrets: [{ key: 'api_key', placeholder: '${secret:1}', title: 'API key' }],
	},
	{
		choiceId: 'remote:1',
		transport: 'sse',
		endpointSummary: 'https://search.contoso.com/sse',
		configurationFields: ['headers', 'type', 'url'],
		values: [{ key: 'X-Tenant', category: 'header', valueType: 'string', required: true, isRepeated: false }],
		secrets: [{ key: 'api_key', placeholder: '${secret:1}', title: 'API key' }],
	},
], { recommendedChoiceId: 'package:0' });

/** Values that can be given more than once. */
const repeatedValues = createRequest('Contoso Files', 'io.github.contoso/files', [{
	choiceId: 'package:0',
	transport: 'stdio',
	command: 'npx @contoso/files-mcp@1.2.3 --allow-dir ${input:allow-dir} --scope ${input:scope}',
	configurationFields: ['args', 'command', 'type'],
	values: [
		{ key: '--allow-dir', category: 'package-argument', valueType: 'path', required: true, isRepeated: true, title: 'Allowed directories', description: 'Directories the server can read and write.' },
		{ key: '--scope', category: 'package-argument', valueType: 'enum', required: false, isRepeated: true, enumValues: ['read', 'write', 'admin'] },
	],
	secrets: [],
}]);

/** Long, unbroken text in every place a server card can put it. */
const longContent = createRequest('Contoso Enterprise Knowledge Graph and Document Intelligence Connector', 'io.github.contoso-enterprise-platform/knowledge-graph-document-intelligence', [{
	choiceId: 'package:0',
	transport: 'stdio',
	command: 'uvx contoso-knowledge-graph-document-intelligence@12.4.0 --index-url https://packages.contoso.com/simple --workspace ${input:workspace} --cache-directory ${input:cache-directory}',
	env: { CONTOSO_KNOWLEDGE_GRAPH_TELEMETRY_ENDPOINT: 'https://telemetry.contoso.com/v2/ingest', CONTOSO_LOG_LEVEL: '${input:CONTOSO_LOG_LEVEL}' },
	configurationFields: ['args', 'command', 'env', 'type'],
	values: [
		{ key: '--workspace', category: 'package-argument', valueType: 'string', required: true, isRepeated: false, title: 'Workspace identifier', description: 'The identifier of the Contoso workspace whose documents are indexed. Find it under Settings, Workspace, General in the Contoso admin portal.' },
		{ key: '--cache-directory', category: 'package-argument', valueType: 'path', required: false, isRepeated: false, description: 'Where downloaded documents are cached between runs.' },
		{ key: 'CONTOSO_LOG_LEVEL', category: 'environment-variable', valueType: 'enum', required: false, isRepeated: false, defaultValue: 'warning', enumValues: ['error', 'warning', 'info', 'debug'] },
	],
	secrets: [{ key: 'CONTOSO_KNOWLEDGE_GRAPH_SERVICE_PRINCIPAL_SECRET', placeholder: '${secret:1}' }],
}], { target: 'contoso-knowledge-graph' });

interface IRenderOptions {
	readonly width?: number;
	/** A fixed height, as a host shorter than the form gives it. */
	readonly height?: number;
	/** Drives the rendered form the way a user would. */
	readonly interact?: (container: HTMLElement) => void;
}

function renderForm({ container, disposableStore, theme }: ComponentFixtureContext, request: IAgentCustomizationInstallationConfigurationRequest, options: IRenderOptions = {}): void {
	container.style.boxSizing = 'border-box';
	container.style.width = `${options.width ?? 520}px`;
	container.style.height = options.height ? `${options.height}px` : '';
	container.style.padding = '20px';
	container.style.backgroundColor = 'var(--vscode-editorWidget-background)';

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registration.defineInstance(ILayoutService, new class extends mock<ILayoutService>() {
				override readonly mainContainer = container;
				override readonly activeContainer = container;
				override readonly onDidLayoutContainer = Event.None;
				override getContainer(): HTMLElement { return container; }
			}());
			registration.define(IContextViewService, ContextViewService);
		},
	});

	const form = disposableStore.add(instantiationService.createInstance(McpServerInstallForm, container, request));

	// Shows what the form hands to its host, to try the form out in the explorer.
	const result = dom.append(container, dom.$('pre'));
	result.style.display = 'none';
	result.style.margin = '16px 0 0';
	result.style.whiteSpace = 'pre-wrap';
	result.style.overflowWrap = 'anywhere';
	result.style.color = 'var(--vscode-descriptionForeground)';
	const showResult = (text: string) => {
		result.textContent = text;
		result.style.display = '';
	};
	disposableStore.add(form.onDidSubmit(answers => showResult(`Submitted:\n${JSON.stringify(answers, undefined, 2)}`)));
	disposableStore.add(form.onDidCancel(() => showResult('Cancelled')));

	options.interact?.(container);
}

function type(container: HTMLElement, ariaLabelPrefix: string, text: string): void {
	const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`.mcp-install-form [aria-label^="${ariaLabelPrefix}"]`);
	if (!input) {
		throw new Error(`No field labelled ${ariaLabelPrefix}`);
	}
	input.value = text;
	input.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

function clickInstall(container: HTMLElement): void {
	const buttons = container.querySelectorAll<HTMLElement>('.mcp-config-form-footer .monaco-button');
	buttons[buttons.length - 1].click();
}

export default defineThemedFixtureGroup({ path: 'chat/aiCustomizations/' }, {
	ReviewOnly: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderForm(context, reviewOnly),
	}),
	SingleSecret: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderForm(context, singleSecret),
	}),
	LocalPackage: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderForm(context, localPackage),
	}),
	RemoteServer: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderForm(context, remoteServer),
	}),
	TransportChoice: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderForm(context, transportChoice),
	}),
	RepeatedValues: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderForm(context, repeatedValues, {
			interact: container => type(container, 'Allowed directories', '/home/me/projects\n/home/me/notes'),
		}),
	}),
	ValidationErrors: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderForm(context, localPackage, {
			interact: container => {
				type(container, '--port', 'eighty');
				type(container, 'CONTOSO_TAG', '${HOME}');
				clickInstall(container);
			},
		}),
	}),
	NarrowAndScrolling: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderForm(context, longContent, { width: 340, height: 520 }),
	}),
});
