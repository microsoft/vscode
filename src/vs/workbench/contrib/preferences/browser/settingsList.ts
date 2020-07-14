/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { IThemeService, registerThemingParticipant, IColorTheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ISettingsEditorViewState, SettingsTreeElement, SettingsTreeGroupElement, SettingsTreeSettingElement } from 'vs/workbench/contrib/preferences/browser/settingsTreeModels';
import { ITreeRenderer, ITreeElement } from 'vs/base/browser/ui/tree/tree';
import { isDefined } from 'vs/base/common/types';
import { SettingsTreeDelegate, ISettingItemTemplate } from 'vs/workbench/contrib/preferences/browser/settingsTree';
import { focusBorder, foreground, errorForeground, inputValidationErrorBackground, inputValidationErrorForeground, inputValidationErrorBorder } from 'vs/platform/theme/common/colorRegistry';
import { RGBA, Color } from 'vs/base/common/color';
import { settingsHeaderForeground } from 'vs/workbench/contrib/preferences/browser/settingsWidgets';

const $ = DOM.$;

interface ISettingsListCacheItem {
	container: HTMLElement;
	template: ISettingItemTemplate;
}

export class SettingsList extends Disposable {
	private settingGroups = new Map<string, SettingsTreeSettingElement[]>();
	private currentGroupId: string = '';
	private getTemplateId = new SettingsTreeDelegate().getTemplateId;
	private templateToRenderer = new Map<string, ITreeRenderer<SettingsTreeElement, never, ISettingItemTemplate>>();
	private freePool = new Map<string, ISettingsListCacheItem[]>();
	private usedPool = new Map<string, ISettingsListCacheItem[]>();

	dispose() {
		for (const items of this.usedPool.values()) {
			items.forEach(({ template }) => template.toDispose.dispose());
		}

		for (const items of this.freePool.values()) {
			items.forEach(({ template }) => template.toDispose.dispose());
		}

		this.usedPool.clear();
		this.freePool.clear();

		super.dispose();
	}

	get groupId(): string {
		return this.currentGroupId;
	}

	set groupId(groupId: string) {
		const shouldRerender = this.currentGroupId !== groupId;
		this.currentGroupId = groupId;

		if (shouldRerender) {
			for (const [templateId, usedItems] of this.usedPool.entries()) {
				const freeItems = this.freePool.get(templateId) ?? [];
				this.freePool.set(templateId, [...usedItems, ...freeItems]);
			}

			this.usedPool.clear();

			this.render();
		}
	}

	constructor(
		private container: HTMLElement,
		viewState: ISettingsEditorViewState,
		renderers: ITreeRenderer<SettingsTreeElement, never, any>[],
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		container.setAttribute('tabindex', '-1');
		container.classList.add('settings-editor-tree');
		renderers.forEach(renderer => this.templateToRenderer.set(renderer.templateId, renderer));

		this._register(registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
			const activeBorderColor = theme.getColor(focusBorder);
			if (activeBorderColor) {
				// TODO@rob - why isn't this applied when added to the stylesheet from tocTree.ts? Seems like a chromium glitch.
				collector.addRule(`.settings-editor > .settings-body > .settings-toc-container .monaco-list:focus .monaco-list-row.focused {outline: solid 1px ${activeBorderColor}; outline-offset: -1px;  }`);
			}

			const foregroundColor = theme.getColor(foreground);
			if (foregroundColor) {
				// Links appear inside other elements in markdown. CSS opacity acts like a mask. So we have to dynamically compute the description color to avoid
				// applying an opacity to the link color.
				const fgWithOpacity = new Color(new RGBA(foregroundColor.rgba.r, foregroundColor.rgba.g, foregroundColor.rgba.b, 0.9));
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-description { color: ${fgWithOpacity}; }`);

				collector.addRule(`.settings-editor > .settings-body .settings-toc-container .monaco-list-row:not(.selected) { color: ${fgWithOpacity}; }`);
			}

			const errorColor = theme.getColor(errorForeground);
			if (errorColor) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-deprecation-message { color: ${errorColor}; }`);
			}

			const invalidInputBackground = theme.getColor(inputValidationErrorBackground);
			if (invalidInputBackground) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-validation-message { background-color: ${invalidInputBackground}; }`);
			}

			const invalidInputForeground = theme.getColor(inputValidationErrorForeground);
			if (invalidInputForeground) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-validation-message { color: ${invalidInputForeground}; }`);
			}

			const invalidInputBorder = theme.getColor(inputValidationErrorBorder);
			if (invalidInputBorder) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-validation-message { border-style:solid; border-width: 1px; border-color: ${invalidInputBorder}; }`);
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item.invalid-input .setting-item-control .monaco-inputbox.idle { outline-width: 0; border-style:solid; border-width: 1px; border-color: ${invalidInputBorder}; }`);
			}

			const headerForegroundColor = theme.getColor(settingsHeaderForeground);
			if (headerForegroundColor) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .settings-group-title-label { color: ${headerForegroundColor}; }`);
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-label { color: ${headerForegroundColor}; }`);
			}

			const focusBorderColor = theme.getColor(focusBorder);
			if (focusBorderColor) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-markdown a:focus { outline-color: ${focusBorderColor} }`);
			}
		}));
	}

	getHTMLElement(): HTMLElement {
		return this.container;
	}

	setChildren(_: any, children: Iterable<ITreeElement<SettingsTreeElement>>) {
		this.settingGroups = new Map();

		for (const child of children) {
			if (child.element instanceof SettingsTreeGroupElement) {

				if (!this.currentGroupId) {
					this.currentGroupId = child.element.id;
				}

				this.storeSettingGroup(child.element);
			} else {
				// TODO@9at8 ???
			}
		}

		this.render();
	}

	private storeSettingGroup(group: SettingsTreeGroupElement) {
		// TODO@9at8 could these be something else?
		const leaves = group.children.filter(c => c instanceof SettingsTreeSettingElement) as SettingsTreeSettingElement[];
		const groups = group.children.filter(g => g instanceof SettingsTreeGroupElement) as SettingsTreeGroupElement[];

		if (leaves.length > 0) {
			this.settingGroups.set(group.id, leaves);
		}

		groups.forEach(group => this.storeSettingGroup(group));
	}

	private render() {
		const settings = this.settingGroups.get(this.currentGroupId);

		if (isDefined(settings)) {
			DOM.clearNode(this.container);

			settings
				.map(setting => this.renderSetting(setting))
				.forEach(element => this.container.append(element));
		} else {
			// TODO@09at8 what should we do if no settings in that group exist?
		}
	}

	private renderSetting(element: SettingsTreeSettingElement): HTMLElement {
		const templateId = this.getTemplateId(element);
		const renderer = this.templateToRenderer.get(this.getTemplateId(element))!;
		const freeItems = this.freePool.get(templateId);

		let container: HTMLElement;
		let template: ISettingItemTemplate;

		if (isDefined(freeItems) && freeItems.length > 0) {
			container = freeItems[0].container;
			template = freeItems[0].template;
			this.freePool.set(templateId, freeItems.slice(1));
		} else {
			container = $('div');
			template = renderer.renderTemplate(container);
		}

		this.usedPool.set(templateId, [
			...(this.usedPool.get(templateId) ?? []),
			{ container, template }
		]);

		renderer.renderElement({ element } as any, 0, template, undefined);

		return container;
	}

	// TODO@9at8 remove / implement these stubs

	scrollTop = 0;
	scrollHeight = 0;
	firstVisibleElement: SettingsTreeElement = { id: 'first visible', index: 0 };
	lastVisibleElement: SettingsTreeElement = { id: 'last visible', index: 0 };

	reveal(...args: any[]) {
		console.log('reveal...');
	}
	getRelativeTop(...args: any[]): number {
		return 0;
	}
	layout(...args: any[]) {
		console.log('layout');
	}
}
