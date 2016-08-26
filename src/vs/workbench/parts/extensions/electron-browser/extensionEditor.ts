/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/extensionEditor';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { marked } from 'vs/base/common/marked/marked';
import { always } from 'vs/base/common/async';
import * as arrays from 'vs/base/common/arrays';
import Event, { Emitter, once } from 'vs/base/common/event';
import Cache from 'vs/base/common/cache';
import { Action } from 'vs/base/common/actions';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable, empty, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { Builder } from 'vs/base/browser/builder';
import { domEvent } from 'vs/base/browser/event';
import { append, $, addClass, removeClass, finalHandler, join } from 'vs/base/browser/dom';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/common/viewletService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionGalleryService, IExtensionManifest, IKeyBinding } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { ExtensionsInput } from './extensionsInput';
import { IExtensionsWorkbenchService, IExtensionsViewlet, VIEWLET_ID, IExtension } from './extensions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITemplateData } from './extensionsList';
import { RatingsWidget, InstallWidget } from './extensionsWidgets';
import { EditorOptions } from 'vs/workbench/common/editor';
import { shell } from 'electron';
import product from 'vs/platform/product';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { CombinedInstallAction, UpdateAction, EnableAction } from './extensionsActions';
import WebView from 'vs/workbench/parts/html/browser/webview';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Keybinding } from 'vs/base/common/keyCodes';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';

function renderBody(body: string): string {
	return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<link rel="stylesheet" type="text/css" href="${ require.toUrl('./media/markdown.css') }" >
			</head>
			<body>${ body }</body>
		</html>`;
}

class NavBar {

	private _onChange = new Emitter<string>();
	get onChange(): Event<string> { return this._onChange.event; }

	private actions: Action[];
	private actionbar: ActionBar;

	constructor(container: HTMLElement) {
		const element = append(container, $('.navbar'));
		this.actions = [];
		this.actionbar = new ActionBar(element, { animated: false });
	}

	push(id: string, label: string): void {
		const run = () => {
			this._onChange.fire(id);
			this.actions.forEach(a => a.enabled = a.id !== action.id);
			return TPromise.as(null);
		};

		const action = new Action(id, label, null, true, run);

		this.actions.push(action);
		this.actionbar.push(action);

		if (this.actions.length === 1) {
			run();
		}
	}

	clear(): void {
		this.actions = dispose(this.actions);
		this.actionbar.clear();
	}

	dispose(): void {
		this.actionbar = dispose(this.actionbar);
	}
}

const NavbarSection = {
	Readme: 'readme',
	Contributions: 'contributions'
};

interface ILayoutParticipant {
	layout(): void;
}

export class ExtensionEditor extends BaseEditor {

	static ID: string = 'workbench.editor.extension';

	private icon: HTMLImageElement;
	private name: HTMLAnchorElement;
	private license: HTMLAnchorElement;
	private publisher: HTMLAnchorElement;
	private installCount: HTMLElement;
	private rating: HTMLAnchorElement;
	private description: HTMLElement;
	private extensionActionBar: ActionBar;
	private navbar: NavBar;
	private content: HTMLElement;

	private _highlight: ITemplateData;
	private highlightDisposable: IDisposable;

	private extensionReadme: Cache<string>;
	private extensionManifest: Cache<IExtensionManifest>;

	private layoutParticipants: ILayoutParticipant[] = [];
	private contentDisposables: IDisposable[] = [];
	private transientDisposables: IDisposable[] = [];
	private disposables: IDisposable[];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IExtensionGalleryService private galleryService: IExtensionGalleryService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IViewletService private viewletService: IViewletService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IThemeService private themeService: IThemeService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		super(ExtensionEditor.ID, telemetryService);
		this._highlight = null;
		this.highlightDisposable = empty;
		this.disposables = [];
		this.extensionReadme = null;
		this.extensionManifest = null;

		this.disposables.push(viewletService.onDidViewletOpen(this.onViewletOpen, this, this.disposables));
	}

	createEditor(parent: Builder): void {
		const container = parent.getHTMLElement();

		const root = append(container, $('.extension-editor'));
		const header = append(root, $('.header'));

		this.icon = append(header, $<HTMLImageElement>('img.icon'));

		const details = append(header, $('.details'));
		const title = append(details, $('.title'));
		this.name = append(title, $<HTMLAnchorElement>('a.name'));
		this.name.href = '#';

		const subtitle = append(details, $('.subtitle'));
		this.publisher = append(subtitle, $<HTMLAnchorElement>('a.publisher'));
		this.publisher.href = '#';

		this.installCount = append(subtitle, $('span.install'));

		this.rating = append(subtitle, $<HTMLAnchorElement>('a.rating'));
		this.rating.href = '#';

		this.license = append(subtitle, $<HTMLAnchorElement>('a.license'));
		this.license.href = '#';
		this.license.textContent = localize('license', 'License');
		this.license.style.display = 'none';

		this.description = append(details, $('.description'));

		const extensionActions = append(details, $('.actions'));
		this.extensionActionBar = new ActionBar(extensionActions, { animated: false });
		this.disposables.push(this.extensionActionBar);

		const body = append(root, $('.body'));
		this.navbar = new NavBar(body);

		this.content = append(body, $('.content'));
	}

	setInput(input: ExtensionsInput, options: EditorOptions): TPromise<void> {
		const extension = input.extension;

		this.transientDisposables = dispose(this.transientDisposables);

		this.telemetryService.publicLog('extensionGallery:openExtension', extension.telemetryData);

		this.extensionReadme = new Cache(() => extension.getReadme());
		this.extensionManifest = new Cache(() => extension.getManifest());

		const onError = once(domEvent(this.icon, 'error'));
		onError(() => this.icon.src = extension.iconUrlFallback, null, this.transientDisposables);
		this.icon.src = extension.iconUrl;

		this.name.textContent = extension.displayName;
		this.publisher.textContent = extension.publisherDisplayName;
		this.description.textContent = extension.description;

		if (product.extensionsGallery) {
			const extensionUrl = `${ product.extensionsGallery.itemUrl }?itemName=${ extension.publisher }.${ extension.name }`;

			this.name.onclick = finalHandler(() => shell.openExternal(extensionUrl));
			this.rating.onclick = finalHandler(() => shell.openExternal(`${ extensionUrl }#review-details`));
			this.publisher.onclick = finalHandler(() => {
				this.viewletService.openViewlet(VIEWLET_ID, true)
					.then(viewlet => viewlet as IExtensionsViewlet)
					.done(viewlet => viewlet.search(`publisher:"${ extension.publisherDisplayName }"`));
			});

			if (extension.licenseUrl) {
				this.license.onclick = finalHandler(() => shell.openExternal(extension.licenseUrl));
				this.license.style.display = 'initial';
			} else {
				this.license.onclick = null;
				this.license.style.display = 'none';
			}
		}

		const install = this.instantiationService.createInstance(InstallWidget, this.installCount, { extension });
		this.transientDisposables.push(install);

		const ratings = this.instantiationService.createInstance(RatingsWidget, this.rating, { extension });
		this.transientDisposables.push(ratings);

		const installAction = this.instantiationService.createInstance(CombinedInstallAction);
		const updateAction = this.instantiationService.createInstance(UpdateAction);
		const enableAction = this.instantiationService.createInstance(EnableAction);

		installAction.extension = extension;
		updateAction.extension = extension;
		enableAction.extension = extension;

		this.extensionActionBar.clear();
		this.extensionActionBar.push([enableAction, updateAction, installAction], { icon: true, label: true });
		this.transientDisposables.push(enableAction, updateAction, installAction);

		this.navbar.clear();
		this.navbar.onChange(this.onNavbarChange.bind(this, extension), this, this.transientDisposables);
		this.navbar.push(NavbarSection.Readme, localize('details', "Details"));
		this.navbar.push(NavbarSection.Contributions, localize('contributions', "Contributions"));

		this.content.innerHTML = '';

		return super.setInput(input, options);
	}

	private onNavbarChange(extension: IExtension, id: string): void {
		switch (id) {
			case NavbarSection.Readme: return this.openReadme(extension);
			case NavbarSection.Contributions: return this.openContributions(extension);
		}
	}

	private openReadme(extension: IExtension) {
		return this.loadContents(() => this.extensionReadme.get()
			.then(marked.parse)
			.then(renderBody)
			.then<void>(body => {
				const webview = new WebView(
					this.content,
					document.querySelector('.monaco-editor-background')
				);

				webview.style(this.themeService.getColorTheme());
				webview.contents = [body];

				const linkListener = webview.onDidClickLink(link => shell.openExternal(link.toString()));
				const themeListener = this.themeService.onDidColorThemeChange(themeId => webview.style(themeId));
				this.contentDisposables.push(webview, linkListener, themeListener);
			})
			.then(null, () => {
				const p = append(this.content, $('p'));
				p.textContent = localize('noReadme', "No README available.");
			}));
	}

	private openContributions(extension: IExtension) {
		return this.loadContents(() => this.extensionManifest.get()
			.then(manifest => {
				this.content.innerHTML = '';

				const content = $('div', { class: 'subcontent' });
				const scrollableContent = new DomScrollableElement(content, { canUseTranslate3d: false });
				append(this.content, scrollableContent.getDomNode());
				this.contentDisposables.push(scrollableContent);

				const layout = () => scrollableContent.scanDomNode();
				const removeLayoutParticipant = arrays.insert(this.layoutParticipants, { layout });
				this.contentDisposables.push(toDisposable(removeLayoutParticipant));

				ExtensionEditor.renderSettings(content, manifest, layout);
				this.renderCommands(content, manifest, layout);
				ExtensionEditor.renderLanguages(content, manifest, layout);
				ExtensionEditor.renderThemes(content, manifest, layout);
				ExtensionEditor.renderJSONValidation(content, manifest, layout);
				ExtensionEditor.renderDebuggers(content, manifest, layout);

				scrollableContent.scanDomNode();
			}));
	}

	private static renderSettings(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): void {
		const contributes = manifest.contributes;
		const configuration = contributes && contributes.configuration;
		const properties = configuration && configuration.properties;
		const contrib = properties ? Object.keys(properties) : [];

		if (!contrib.length) {
			return;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', null, localize('settings', "Settings ({0})", contrib.length)),
			$('table', null,
				$('tr', null, $('th', null, localize('setting name', "Name")), $('th', null, localize('description', "Description"))),
				...contrib.map(key => $('tr', null, $('td', null, $('code', null, key)), $('td', null, properties[key].description)))
			)
		);

		append(container, details);
	}

	private static renderDebuggers(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): void {
		const contributes = manifest.contributes;
		const contrib = contributes && contributes.debuggers || [];

		if (!contrib.length) {
			return;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', null, localize('debuggers', "Debuggers ({0})", contrib.length)),
			$('table', null,
				$('tr', null, $('th', null, localize('debugger name', "Name")), $('th', null, localize('runtime', "Runtime"))),
				...contrib.map(d => $('tr', null, $('td', null, d.label || d.type), $('td', null, d.runtime)))
			)
		);

		append(container, details);
	}

	private static renderThemes(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): void {
		const contributes = manifest.contributes;
		const contrib = contributes && contributes.themes || [];

		if (!contrib.length) {
			return;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', null, localize('themes', "Themes ({0})", contrib.length)),
			$('ul', null, ...contrib.map(theme => $('li', null, theme.label)))
		);

		append(container, details);
	}

	private static renderJSONValidation(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): void {
		const contributes = manifest.contributes;
		const contrib = contributes && contributes.jsonValidation || [];

		if (!contrib.length) {
			return;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', null, localize('JSON Validation', "JSON Validation ({0})", contrib.length)),
			$('ul', null, ...contrib.map(v => $('li', null, v.fileMatch)))
		);

		append(container, details);
	}

	private renderCommands(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): void {
		const contributes = manifest.contributes;
		const rawCommands = contributes && contributes.commands || [];
		const commands = rawCommands.map(c => ({
			id: c.command,
			title: c.title,
			keybindings: [],
			menus: []
		}));

		const byId = arrays.index(commands, c => c.id);

		const menus = contributes && contributes.menus || {};

		Object.keys(menus).forEach(context => {
			menus[context].forEach(menu => {
				let command = byId[menu.command];

				if (!command) {
					command = { id: menu.command, title: '', keybindings: [], menus: [context] };
					byId[command.id] = command;
					commands.push(command);
				} else {
					command.menus.push(context);
				}
			});
		});

		const rawKeybindings = contributes && contributes.keybindings || [];

		rawKeybindings.forEach(rawKeybinding => {
			const keyLabel = this.keybindingToLabel(rawKeybinding);
			let command = byId[rawKeybinding.command];

			if (!command) {
				command = { id: rawKeybinding.command, title: '', keybindings: [keyLabel], menus: [] };
				byId[command.id] = command;
				commands.push(command);
			} else {
				command.keybindings.push(keyLabel);
			}
		});

		if (!commands.length) {
			return;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', null, localize('commands', "Commands ({0})", commands.length)),
			$('table', null,
				$('tr', null,
					$('th', null, localize('command name', "Name")),
					$('th', null, localize('description', "Description")),
					$('th', null, localize('keyboard shortcuts', "Keyboard Shortcuts")),
					$('th', null, localize('menuContexts', "Menu Contexts"))
				),
				...commands.map(c => $('tr', null,
					$('td', null, $('code', null, c.id)),
					$('td', null, c.title),
					$('td', null, ...join(c.keybindings.map(keybinding => $('code', null, keybinding)), ' ')),
					$('td', null, ...c.menus.map(context => $('code', null, context)))
				))
			)
		);

		append(container, details);
	}

	private static renderLanguages(container: HTMLElement, manifest: IExtensionManifest, onDetailsToggle: Function): void {
		const contributes = manifest.contributes;
		const rawLanguages = contributes && contributes.languages || [];
		const languages = rawLanguages.map(l => ({
			id: l.id,
			name: (l.aliases || [])[0] || l.id,
			extensions: l.extensions || [],
			hasGrammar: false,
			hasSnippets: false
		}));

		const byId = arrays.index(languages, l => l.id);

		const grammars = contributes && contributes.grammars || [];

		grammars.forEach(grammar => {
			let language = byId[grammar.language];

			if (!language) {
				language = { id: grammar.language, name: grammar.language, extensions: [], hasGrammar: true, hasSnippets: false };
				byId[language.id] = language;
				languages.push(language);
			} else {
				language.hasGrammar = true;
			}
		});

		const snippets = contributes && contributes.snippets || [];

		snippets.forEach(snippet => {
			let language = byId[snippet.language];

			if (!language) {
				language = { id: snippet.language, name: snippet.language, extensions: [], hasGrammar: false, hasSnippets: true };
				byId[language.id] = language;
				languages.push(language);
			} else {
				language.hasSnippets = true;
			}
		});

		if (!languages.length) {
			return;
		}

		const details = $('details', { open: true, ontoggle: onDetailsToggle },
			$('summary', null, localize('languages', "Languages ({0})", languages.length)),
			$('table', null,
				$('tr', null,
					$('th', null, localize('command name', "Name")),
					$('th', null, localize('file extensions', "File Extensions")),
					$('th', null, localize('grammar', "Grammar")),
					$('th', null, localize('snippets', "Snippets"))
				),
				...languages.map(l => $('tr', null,
					$('td', null, l.name),
					$('td', null, ...join(l.extensions.map(ext => $('code', null, ext)), ' ')),
					$('td', null, document.createTextNode(l.hasGrammar ? '✔︎' : '—')),
					$('td', null, document.createTextNode(l.hasSnippets ? '✔︎' : '—'))
				))
			)
		);

		append(container, details);
	}

	private keybindingToLabel(rawKeyBinding: IKeyBinding): string {
		let key: string;

		switch(process.platform) {
			case 'win32': key = rawKeyBinding.win; break;
			case 'linux': key = rawKeyBinding.linux; break;
			case 'darwin': key = rawKeyBinding.mac; break;
		}

		const keyBinding = new Keybinding(Keybinding.fromUserSettingsLabel(key || rawKeyBinding.key));
		return this.keybindingService.getLabelFor(keyBinding);
	}

	private loadContents(loadingTask: ()=>TPromise<any>): void {
		this.contentDisposables = dispose(this.contentDisposables);

		this.content.innerHTML = '';
		addClass(this.content, 'loading');

		let promise = loadingTask();
		promise = always(promise, () => removeClass(this.content, 'loading'));

		this.contentDisposables.push(toDisposable(() => promise.cancel()));
	}

	layout(): void {
		this.layoutParticipants.forEach(p => p.layout());
	}

	private onViewletOpen(viewlet: IViewlet): void {
		if (!viewlet || viewlet.getId() === VIEWLET_ID) {
			return;
		}

		this.editorService.closeEditor(this.position, this.input).done(null, onUnexpectedError);
	}

	dispose(): void {
		this._highlight = null;
		this.transientDisposables = dispose(this.transientDisposables);
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}
