/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IAgentCustomizationInstallationAnswers, IAgentCustomizationInstallationChoice, IAgentCustomizationInstallationConfigurationRequest } from '../../../../../../../platform/agentHost/common/agent.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextViewService } from '../../../../../../../platform/contextview/browser/contextView.js';
import { McpServerInstallForm } from '../../../../browser/agentSessions/agentHost/mcpServerInstallForm.js';

suite('McpServerInstallForm', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const local: IAgentCustomizationInstallationChoice = {
		choiceId: 'package:0', transport: 'stdio', command: 'npx @example/local@1.2.3 ${input:directory}', configurationFields: ['args', 'command', 'env'],
		values: [
			{ key: 'directory', category: 'package-argument', valueType: 'path', required: true, isRepeated: false },
			{ key: '--port', category: 'package-argument', valueType: 'number', required: false, isRepeated: false, defaultValue: '3000' },
			{ key: '--headless', category: 'package-argument', valueType: 'boolean', required: true, isRepeated: false },
			{ key: '--verbose', category: 'package-argument', valueType: 'boolean', required: false, isRepeated: false },
			{ key: '--include', category: 'package-argument', valueType: 'string', required: false, isRepeated: true },
			{ key: 'LOG_LEVEL', category: 'environment-variable', valueType: 'enum', required: true, isRepeated: false, enumValues: ['info', 'debug'] },
			{ key: 'TAG', category: 'environment-variable', valueType: 'string', required: false, isRepeated: false },
		],
		secrets: [{ key: 'TOKEN', placeholder: '${secret:a}' }],
	};
	const remote: IAgentCustomizationInstallationChoice = {
		choiceId: 'remote:0', transport: 'streamable-http', endpointSummary: 'https://example.test/mcp', configurationFields: ['headers', 'url'],
		values: [{ key: 'X-Tenant', category: 'header', valueType: 'string', required: true, isRepeated: false }],
		secrets: [],
	};

	function createForm(choices: readonly IAgentCustomizationInstallationChoice[]) {
		const request: IAgentCustomizationInstallationConfigurationRequest = {
			kind: 'configuration', operationId: 'operation', hostGeneration: 'generation', ownershipToken: 'token',
			displayName: 'Example', serverName: 'owner/example', target: 'owner/example', choices,
		};
		const form = store.add(new McpServerInstallForm(document.createElement('div'), request, new class extends mock<IContextViewService>() { }(), new TestConfigurationService()));
		const submitted: IAgentCustomizationInstallationAnswers[] = [];
		store.add(form.onDidSubmit(answers => submitted.push(answers)));
		const field = <T extends HTMLElement>(label: string) => {
			const element = [...form.element.querySelectorAll<T>(`[aria-label="${label}"]`)].find(candidate => candidate.closest<HTMLElement>('.mcp-install-form-fields')?.style.display !== 'none');
			assert.ok(element, `No visible field labelled ${label}`);
			return element;
		};
		return {
			form,
			submitted,
			type: (label: string, text: string) => {
				const input = field<HTMLInputElement | HTMLTextAreaElement>(label);
				input.value = text;
				input.dispatchEvent(new InputEvent('input'));
			},
			choose: (label: string, option: string) => {
				const select = field<HTMLSelectElement>(label);
				select.selectedIndex = [...select.options].findIndex(candidate => candidate.text === option);
				select.dispatchEvent(new Event('change'));
			},
			click: (label: string) => field(label).click(),
			install: () => form.element.querySelector<HTMLElement>('.mcp-config-form-footer .monaco-button:last-child')!.click(),
			errors: () => [...form.element.querySelectorAll<HTMLElement>('.mcp-config-form-error')].filter(error => error.textContent).map(error => error.textContent),
		};
	}

	test('submits the answers of every kind of field in plan order', () => {
		const { submitted, type, choose, click, install } = createForm([local]);
		type('TOKEN', 's3cret');
		choose('LOG_LEVEL', 'debug');
		type('--include, optional', 'src\ntest');
		click('--verbose');
		type('directory', '/work');
		install();
		assert.deepStrictEqual(submitted, [{
			choiceId: 'package:0',
			inputs: [
				{ key: 'directory', category: 'package-argument', value: '/work' },
				// A required flag is sent even when it is off; a default is left to the server.
				{ key: '--headless', category: 'package-argument', value: 'false' },
				{ key: '--verbose', category: 'package-argument', value: 'true' },
				{ key: '--include', category: 'package-argument', value: 'src' },
				{ key: '--include', category: 'package-argument', value: 'test' },
				{ key: 'LOG_LEVEL', category: 'environment-variable', value: 'debug' },
			],
			secrets: [{ placeholder: '${secret:a}', value: 's3cret' }],
		}]);
	});

	test('shows every problem at once and submits nothing until they are fixed', () => {
		const { submitted, type, choose, install, errors } = createForm([local]);
		type('--port', 'eighty');
		type('TAG, optional', '${HOME}');
		type('--include, optional', 'src\n$HOME');
		type('TOKEN', 'a\0b');
		install();
		const shown = errors();
		type('directory', '/work');
		type('--port', '');
		type('TAG, optional', '');
		type('--include, optional', '');
		choose('LOG_LEVEL', 'info');
		type('TOKEN', 's3cret');
		assert.deepStrictEqual({ shown, submittedWhileInvalid: submitted.length, remaining: errors() }, {
			shown: [
				'A value is required.',
				'Enter a number, for example 42 or -1.5e3.',
				'Line 2: Variable references such as $NAME or ${NAME} are not allowed.',
				'A value is required.',
				'Variable references such as $NAME or ${NAME} are not allowed.',
				'This secret contains characters that are not allowed.',
			],
			submittedWhileInvalid: 0,
			remaining: [],
		});
	});

	test('keeps what was entered for a connection while another is selected, and submits only the selected one', () => {
		const { form, submitted, type, click, install } = createForm([local, remote]);
		type('directory', '/work');
		click('streamable-http');
		const summary = form.element.querySelector('.mcp-install-form-summary')?.textContent;
		type('X-Tenant', 'contoso');
		install();
		click('stdio');
		const kept = form.element.querySelector<HTMLInputElement>('[aria-label="directory"]')?.value;
		assert.deepStrictEqual({ summary, kept, submitted }, {
			summary: 'Serverowner/exampleEndpointhttps://example.test/mcp',
			kept: '/work',
			submitted: [{ choiceId: 'remote:0', inputs: [{ key: 'X-Tenant', category: 'header', value: 'contoso' }], secrets: [] }],
		});
	});

	test('Cancel and Escape cancel without submitting', () => {
		const { form, submitted } = createForm([remote]);
		let cancelled = 0;
		store.add(form.onDidCancel(() => cancelled++));
		form.element.querySelector<HTMLElement>('.mcp-config-form-footer .monaco-button')!.click();
		form.element.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		assert.deepStrictEqual({ cancelled, submitted }, { cancelled: 2, submitted: [] });
	});

	test('shows a field\'s key beside its title only when they differ', () => {
		const { form } = createForm([{ ...remote, values: [{ ...remote.values[0], key: '-d', title: '-d' }, { ...remote.values[0], title: 'Tenant' }] }]);
		assert.deepStrictEqual([...form.element.querySelectorAll('.mcp-config-form-label')].map(label => label.textContent), ['-d', 'TenantX-Tenant']);
	});

	test('shows text from the installation plan as plain text', () => {
		const markup = '<a href="command:workbench.action.files.newUntitledFile">$(alert) [Continue](command:workbench.action.files.newUntitledFile)</a>';
		const { form } = createForm([
			{ ...remote, transport: markup, endpointSummary: markup, values: [{ ...remote.values[0], title: markup, description: markup }], secrets: [{ key: 'TOKEN', placeholder: '${secret:a}', title: markup }] },
			remote,
		]);
		assert.deepStrictEqual({
			links: form.element.querySelectorAll('a[href]').length,
			icons: form.element.querySelectorAll('.codicon-alert').length,
			endpoint: form.element.querySelector('.mcp-install-form-code')?.textContent,
		}, { links: 0, icons: 0, endpoint: markup });
	});
});
