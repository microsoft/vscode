/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { ITextFileService } from '../../../../../services/textfile/common/textfiles.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ModelRoutersWidget } from '../../../browser/chatManagement/modelRoutersWidget.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../common/languageModels.js';

suite('ModelRoutersWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const harnessId = 'agent-host-copilotcli';

	function model(id: string, name: string, overrides: Partial<ILanguageModelChatMetadata> = {}): ILanguageModelChatMetadata {
		return {
			extension: new ExtensionIdentifier('test.agent-host'),
			id, name, vendor: harnessId, version: '1', family: id,
			maxInputTokens: 0, maxOutputTokens: 0,
			isDefaultForLocation: {},
			targetChatSessionType: harnessId,
			...overrides,
		};
	}

	const models = new Map<string, ILanguageModelChatMetadata>([
		['opus', model('claude-opus', 'Opus', {
			configurationSchema: { properties: { thinkingLevel: { enum: ['low', 'high'] }, contextSize: { enum: [200_000, 1_000_000] } } },
		})],
		['haiku', model('claude-haiku', 'Haiku')],
		['auto', model('auto', 'Auto')],
		['daily', model('model-router:daily-driver', 'Daily Driver', {
			tooltip: 'Opus for features, Haiku for the rest.',
			detailsResource: URI.file('/home/.agents/model-routers/daily-driver.model-router.yaml'),
			modelRouterRoutes: [{ name: 'feature', model: 'Opus', when: 'Building a feature.', effort: 'high' }, { model: 'Haiku', when: 'Quick questions.' }],
			modelRouterSwitching: 'first-turn',
		})],
		['broken', model('model-router:broken', 'broken', {
			// The agent keeps a router's description, and says what it warns about beside it.
			tooltip: 'Broken on purpose.',
			warningText: { modelRouter: 'broken.model-router.yaml has errors: Add `version: 1`.' },
			statusIcon: Codicon.warning,
			detailsResource: URI.file('/home/.agents/model-routers/broken.model-router.yaml'),
			modelRouterRoutes: [],
		})],
		['other-agent', model('model-router:elsewhere', 'Elsewhere', { targetChatSessionType: 'agent-host-claude', modelRouterRoutes: [] })],
	]);

	function createWidget(hasUnsavedChanges = false, hasListedModels = true) {
		const container = DOM.append(mainWindow.document.body, DOM.$('div'));
		container.style.width = '900px';
		container.style.height = '600px';
		store.add({ dispose: () => container.remove() });
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		const instantiationService = workbenchInstantiationService({ fileService: () => fileService }, store);
		const onDidListModels = store.add(new Emitter<string>());
		const laterModels = new Map<string, ILanguageModelChatMetadata>();
		/** The agent lists its models, with `another` that it did not have before. */
		const listModels = (another?: ILanguageModelChatMetadata) => {
			hasListedModels = true;
			if (another) {
				laterModels.set(another.id, another);
			}
			onDidListModels.fire(harnessId);
		};
		instantiationService.stub(ILanguageModelsService, new class extends mock<ILanguageModelsService>() {
			override readonly onDidChangeLanguageModels = onDidListModels.event;
			override getLanguageModelIds() { return hasListedModels ? [...models.keys(), ...laterModels.keys()] : []; }
			override lookupLanguageModel(id: string) { return models.get(id) ?? laterModels.get(id); }
		}());
		instantiationService.stub(ITextFileService, new class extends mock<ITextFileService>() {
			override isDirty() { return hasUnsavedChanges; }
		}());
		const onDidError = store.add(new Emitter<string>());
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override error(message: string) { onDidError.fire(message); }
		}());
		const widget = store.add(instantiationService.createInstance(ModelRoutersWidget, { beforeNavigate: async () => true }));
		container.appendChild(widget.element);
		widget.layout(600, 900);
		const rows = () => [...container.querySelectorAll<HTMLElement>('.monaco-list-row')].map(row => row.getAttribute('aria-label'));
		const search = (query: string) => {
			const input = container.querySelector<HTMLInputElement>('.model-routers-search-container input')!;
			input.value = query;
			input.dispatchEvent(new InputEvent('input'));
			return rows();
		};
		const button = (label: string) => [...container.querySelectorAll<HTMLElement>('.monaco-button')].find(candidate => candidate.textContent === label)!;
		const type = (ariaLabel: string, value: string) => {
			const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${ariaLabel}"]`)!;
			input.value = value;
			input.dispatchEvent(new InputEvent('input'));
		};
		/** Resolves once the widget has changed what it shows so that `condition` holds, as it does after reading a file. */
		const shows = (condition: () => boolean) => new Promise<void>(resolve => {
			if (condition()) {
				resolve();
				return;
			}
			const observer = new mainWindow.MutationObserver(() => {
				if (condition()) {
					observer.disconnect();
					resolve();
				}
			});
			observer.observe(container, { childList: true, subtree: true, characterData: true });
		});
		return { container, fileService, rows, search, button, type, shows, listModels, nextError: () => Event.toPromise(onDidError.event) };
	}

	test('lists this agent\'s routers with their routes, and finds them by a spaced or dashed query', () => {
		const { container, rows, search } = createWidget();
		assert.deepStrictEqual({
			description: container.querySelector('.model-routers-description')!.textContent,
			all: rows(),
			spaced: search('daily driver'),
			dashed: search('daily-driver'),
			route: search('quick questions'),
			none: search('nothing like this'),
		}, {
			description: 'A model router sends each chat to the route that best matches your request. Vague or overlapping routes send chats to the wrong model, so run the /model-router skill on a new router to tighten its wording.',
			all: [
				'Daily Driver. Opus for features, Haiku for the rest.',
				'feature (default). Opus \u00b7 High \u00b7 Building a feature.',
				'Haiku. Quick questions.',
				'broken. Broken on purpose. broken.model-router.yaml has errors: Add `version: 1`.',
			],
			spaced: ['Daily Driver. Opus for features, Haiku for the rest.', 'feature (default). Opus \u00b7 High \u00b7 Building a feature.', 'Haiku. Quick questions.'],
			dashed: ['Daily Driver. Opus for features, Haiku for the rest.', 'feature (default). Opus \u00b7 High \u00b7 Building a feature.', 'Haiku. Quick questions.'],
			route: ['Daily Driver. Opus for features, Haiku for the rest.', 'feature (default). Opus \u00b7 High \u00b7 Building a feature.', 'Haiku. Quick questions.'],
			none: [],
		});
	});

	test('the switch on a router\'s row writes route switching to its file, and a router with nothing to switch between has none to turn on', async () => {
		const { container, fileService } = createWidget();
		const file = URI.file('/home/.agents/model-routers/daily-driver.model-router.yaml');
		await fileService.writeFile(file, VSBuffer.fromString('# Mine\nversion: 1\ndescription: d\nroutes:\n  - model: a\n    when: One.\n  - model: b\n    when: Two.\n'));
		const switches = [...container.querySelectorAll<HTMLButtonElement>('.model-router-router-row [role="switch"]')];
		const written = Event.toPromise(fileService.onDidRunOperation);
		switches[0].click();
		await written;
		assert.deepStrictEqual({
			switches: switches.map(element => [element.getAttribute('aria-label'), element.disabled]),
			content: (await fileService.readFile(file)).value.toString(),
		}, {
			switches: [['Turn Off Route Switching for Daily Driver', false], ['Turn On Route Switching for broken', true]],
			content: '# Mine\nversion: 1\ndescription: d\nswitching: auto\nroutes:\n  - model: a\n    when: One.\n  - model: b\n    when: Two.\n',
		});
	});

	test('the form writes a new router to the user\'s folder', async () => {
		const { container, fileService, button, type, shows } = createWidget();
		button('Add Router').click();
		// Routes can run on the agent's models, not on ones that route themselves.
		const selects = () => [...container.querySelector('.model-router-form-route')!.querySelectorAll('select')];
		const choose = (select: HTMLSelectElement, index: number) => {
			select.selectedIndex = index;
			select.dispatchEvent(new UIEvent('change'));
		};
		const offered = selects().map(select => [...select.options].map(option => option.textContent));
		// Opus can be fixed to High on its long window. Haiku, the second route's model, has neither to choose.
		choose(selects()[1], 2);
		choose(selects()[2], 1);
		type('Guidance for route 1', 'Plan first.\nThen run the tests.');
		type('Router name', 'Daily Driver');
		type('Router description', 'Opus for features, Haiku for the rest.');
		button('Create').click();
		await shows(() => !!container.querySelector('.model-router-form .mcp-config-form-error')!.textContent);
		const taken = container.querySelector('.model-router-form .mcp-config-form-error')!.textContent;
		type('Router name', 'Work Day');
		type('Router description', 'Opus for features, Haiku for the rest.');
		type('Route 1 name', 'Feature');
		type('When to use route 1', 'Building a feature.');
		button('Create').click();
		await shows(() => !!container.querySelector('.model-router-form .mcp-config-form-error')!.textContent);
		const incomplete = container.querySelector('.model-router-form .mcp-config-form-error')!.textContent;
		type('When to use route 2', 'Quick questions.');
		const written = Event.toPromise(fileService.onDidRunOperation);
		button('Create').click();
		await written;
		assert.deepStrictEqual({
			offered,
			taken,
			incomplete,
			content: (await fileService.readFile(URI.file('/.agents/model-routers/work-day.model-router.yaml'))).value.toString(),
		}, {
			offered: [['Opus', 'Haiku'], ['Default', 'Low', 'High'], ['Default', 'Long (1M)']],
			taken: 'A router named daily-driver already exists.',
			incomplete: 'Say when to use each route.',
			content: [
				'version: 1',
				'display-name: Work Day',
				'description: Opus for features, Haiku for the rest.',
				'routes:',
				'  - name: feature',
				'    model: claude-opus',
				'    effort: high',
				'    context-size: long',
				'    when: Building a feature.',
				'    guidance: |',
				'      Plan first.',
				'      Then run the tests.',
				'  - model: claude-haiku',
				'    when: Quick questions.',
				'',
			].join('\n'),
		});
	});

	test('a router opens in the form from its file, and saving keeps what the form does not show', async () => {
		const { container, fileService, button, type, shows } = createWidget();
		const file = URI.file('/home/.agents/model-routers/daily-driver.model-router.yaml');
		const content = (changes: { description: string; when: string }) => [
			'version: 1',
			'display-name: Daily Driver',
			`description: ${changes.description}`,
			'effort: off',
			'switching: auto',
			'guidance: Prefer the cheapest model.',
			'routes:',
			'  - name: feature',
			'    model: [opus, claude-opus]',
			`    when: ${changes.when}`,
			'    examples:',
			'      - add a setting',
			'  - model: claude-haiku',
			'    context-size: long',
			'    when: Quick questions.',
			'',
		].join('\n');
		await fileService.writeFile(file, VSBuffer.fromString(`# Mine\n${content({ description: 'Opus for features.', when: 'Building a feature.' })}`));
		const row = container.querySelector<HTMLElement>('.monaco-list-row')!;
		row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		await shows(() => !!container.querySelector('.model-router-form'));
		const shown = {
			title: container.querySelector('.model-router-form-title')!.textContent,
			name: container.querySelector<HTMLInputElement>('[aria-label="Router name"]')!.value,
			// A model the agent does not list is offered as the file writes it, and a context size the model does not have stays.
			selects: [...container.querySelectorAll<HTMLSelectElement>('.model-router-form select')].map(select => select.selectedOptions[0]?.textContent),
		};
		type('Router description', 'Opus for features, Haiku for the rest.');
		type('When to use route 1', 'Building or changing a feature.');
		// The file changes under the form: the save is refused, though the file is as long as it was.
		await fileService.writeFile(file, VSBuffer.fromString(`# Ours\n${content({ description: 'Opus for features.', when: 'Building a feature.' })}`));
		button('Save').click();
		await shows(() => !!container.querySelector('.model-router-form .mcp-config-form-error')!.textContent);
		const refused = container.querySelector('.model-router-form .mcp-config-form-error')!.textContent;
		button('Cancel').click();
		container.querySelector<HTMLElement>('.monaco-list-row')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		await shows(() => !!container.querySelector('.model-router-form'));
		type('Router description', 'Opus for features, Haiku for the rest.');
		type('When to use route 1', 'Building or changing a feature.');
		const written = Event.toPromise(fileService.onDidRunOperation);
		button('Save').click();
		await written;
		assert.deepStrictEqual({ shown, refused, saved: (await fileService.readFile(file)).value.toString() }, {
			shown: { title: 'Edit Model Router', name: 'Daily Driver', selects: ['opus', 'Default', 'Default', 'Haiku', 'Default', 'Long'] },
			refused: 'daily-driver.model-router.yaml has changed since it was opened here. Cancel, and edit the router again.',
			saved: content({ description: 'Opus for features, Haiku for the rest.', when: 'Building or changing a feature.' }),
		});
	});

	test('a form follows the agent\'s models as they are listed, without taking the focus from the field being typed in', () => {
		const { container, button, type, listModels } = createWidget(false, false);
		button('Add Router').click();
		const name = () => container.querySelector<HTMLInputElement>('[aria-label="Route 1 name"]')!;
		const selects = () => [...container.querySelectorAll('.model-router-form-route')].map(route => route.querySelector('select')!);
		const offered = () => [...selects()[0].querySelectorAll('option')].map(option => option.textContent);
		type('Route 1 name', 'feature');
		name().focus();
		name().setSelectionRange(2, 4);
		const before = offered();
		listModels();
		const first = offered();
		// The two routes start on different models, which routes without a name need, and keep them when another is listed.
		listModels(model('claude-sonnet', 'Sonnet'));
		assert.deepStrictEqual({ before, first, later: offered(), chosen: selects().map(select => select.selectedOptions[0]?.textContent), focused: mainWindow.document.activeElement === name(), value: name().value, selection: [name().selectionStart, name().selectionEnd] }, {
			before: [],
			first: ['Opus', 'Haiku'],
			later: ['Opus', 'Haiku', 'Sonnet'],
			chosen: ['Opus', 'Haiku'],
			focused: true,
			value: 'feature',
			selection: [2, 4],
		});
	});

	test('a router the agent warns about opens in the form when its file reads as a router, and its only route needs no when', async () => {
		const { container, fileService, button, type, shows } = createWidget();
		const file = URI.file('/home/.agents/model-routers/broken.model-router.yaml');
		await fileService.writeFile(file, VSBuffer.fromString('version: 1\ndescription: Haiku.\nroutes:\n  - model: claude-haiku\n    guidance: Keep answers short.\n'));
		container.querySelectorAll<HTMLElement>('.monaco-list-row')[3].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		await shows(() => !!container.querySelector('.model-router-form'));
		type('Router description', 'Haiku for everything.');
		const written = Event.toPromise(fileService.onDidRunOperation);
		button('Save').click();
		await written;
		assert.strictEqual((await fileService.readFile(file)).value.toString(), 'version: 1\ndescription: Haiku for everything.\nroutes:\n  - model: claude-haiku\n    guidance: Keep answers short.\n');
	});

	test('a file that route switching cannot be written to as it stands is left as it is', async () => {
		const { container, fileService, nextError } = createWidget();
		const file = URI.file('/home/.agents/model-routers/daily-driver.model-router.yaml');
		const content = 'version: 1\nswitching: >-\n  first-turn\nroutes:\n  - model: a\n    when: One.\n  - model: b\n    when: Two.\n';
		await fileService.writeFile(file, VSBuffer.fromString(content));
		const notSwitched = nextError();
		container.querySelector<HTMLElement>('.model-router-router-row [role="switch"]')!.click();
		assert.deepStrictEqual({ error: await notSwitched, content: (await fileService.readFile(file)).value.toString() }, {
			error: 'Route switching could not be changed for Daily Driver. Change `switching` in daily-driver.model-router.yaml instead.',
			content,
		});
	});

	test('a router whose file has unsaved changes in an editor is neither opened in the form nor switched', async () => {
		const { container, fileService, nextError } = createWidget(true);
		const file = URI.file('/home/.agents/model-routers/daily-driver.model-router.yaml');
		const content = 'version: 1\ndescription: d\nroutes:\n  - model: a\n    when: One.\n  - model: b\n    when: Two.\n';
		await fileService.writeFile(file, VSBuffer.fromString(content));
		const notOpened = nextError();
		container.querySelector<HTMLElement>('.monaco-list-row')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const errors = [await notOpened];
		const notSwitched = nextError();
		container.querySelector<HTMLElement>('.model-router-router-row [role="switch"]')!.click();
		errors.push(await notSwitched);
		assert.deepStrictEqual({ errors, form: !!container.querySelector('.model-router-form'), content: (await fileService.readFile(file)).value.toString() }, {
			errors: [
				'Daily Driver could not be opened to edit. daily-driver.model-router.yaml has unsaved changes in an editor. Save or revert them first.',
				'Route switching could not be changed for Daily Driver. daily-driver.model-router.yaml has unsaved changes in an editor. Save or revert them first.',
			],
			form: false,
			content,
		});
	});
});
