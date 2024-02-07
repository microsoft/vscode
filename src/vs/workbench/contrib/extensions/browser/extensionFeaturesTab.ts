/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { $, append, clearNode } from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { ExtensionIdentifier, IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { Orientation, Sizing, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { IExtensionFeatureDescriptor, Extensions, IExtensionFeaturesRegistry, IExtensionFeatureRenderer, IExtensionFeaturesManagementService, IExtensionFeatureTableRenderer, IExtensionFeatureMarkdownRenderer, ITableData } from 'vs/workbench/services/extensionManagement/common/extensionFeatures';
import { Registry } from 'vs/platform/registry/common/platform';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { localize } from 'vs/nls';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { getExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Button } from 'vs/base/browser/ui/button/button';
import { defaultButtonStyles, defaultKeybindingLabelStyles } from 'vs/platform/theme/browser/defaultStyles';
import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { PANEL_SECTION_BORDER } from 'vs/workbench/common/theme';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ThemeIcon } from 'vs/base/common/themables';
import Severity from 'vs/base/common/severity';
import { errorIcon, infoIcon, warningIcon } from 'vs/workbench/contrib/extensions/browser/extensionsIcons';
import { SeverityIcon } from 'vs/platform/severityIcon/browser/severityIcon';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { OS } from 'vs/base/common/platform';
import { IMarkdownString, isMarkdownString } from 'vs/base/common/htmlContent';
import { Color } from 'vs/base/common/color';

interface ILayoutParticipant {
	layout(height?: number, width?: number): void;
}

export class ExtensionFeaturesTab extends Themable {

	readonly domNode: HTMLElement;

	private readonly featureView = this._register(new MutableDisposable<ExtensionFeatureView>());
	private featureViewDimension?: { height?: number; width?: number };

	private readonly layoutParticipants: ILayoutParticipant[] = [];
	private readonly extensionId: ExtensionIdentifier;

	constructor(
		private readonly manifest: IExtensionManifest,
		private readonly feature: string | undefined,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(themeService);

		this.extensionId = new ExtensionIdentifier(getExtensionId(manifest.publisher, manifest.name));
		this.domNode = $('div.subcontent.feature-contributions');
		this.create();
	}

	layout(height?: number, width?: number): void {
		this.layoutParticipants.forEach(participant => participant.layout(height, width));
	}

	private create(): void {
		const features = this.getFeatures();
		if (features.length === 0) {
			append($('.no-features'), this.domNode).textContent = localize('noFeatures', "No features contributed.");
			return;
		}

		const splitView = new SplitView<number>(this.domNode, {
			orientation: Orientation.HORIZONTAL,
			proportionalLayout: true
		});
		this.layoutParticipants.push({
			layout: (height: number, width: number) => {
				splitView.el.style.height = `${height - 14}px`;
				splitView.layout(width);
			}
		});

		const featuresListContainer = $('.features-list-container');
		const list = this.createFeaturesList(featuresListContainer);
		list.splice(0, list.length, features);

		const featureViewContainer = $('.feature-view-container');
		this._register(list.onDidChangeSelection(e => {
			const feature = e.elements[0];
			if (feature) {
				this.showFeatureView(feature, featureViewContainer);
			}
		}));

		const index = this.feature ? features.findIndex(f => f.id === this.feature) : 0;
		list.setSelection([index === -1 ? 0 : index]);

		splitView.addView({
			onDidChange: Event.None,
			element: featuresListContainer,
			minimumSize: 100,
			maximumSize: Number.POSITIVE_INFINITY,
			layout: (width, _, height) => {
				featuresListContainer.style.width = `${width}px`;
				list.layout(height, width);
			}
		}, 200, undefined, true);

		splitView.addView({
			onDidChange: Event.None,
			element: featureViewContainer,
			minimumSize: 500,
			maximumSize: Number.POSITIVE_INFINITY,
			layout: (width, _, height) => {
				featureViewContainer.style.width = `${width}px`;
				this.featureViewDimension = { height, width };
				this.layoutFeatureView();
			}
		}, Sizing.Distribute, undefined, true);

		splitView.style({
			separatorBorder: this.theme.getColor(PANEL_SECTION_BORDER)!
		});
	}

	private createFeaturesList(container: HTMLElement): WorkbenchList<IExtensionFeatureDescriptor> {
		const renderer = this.instantiationService.createInstance(ExtensionFeatureItemRenderer, this.extensionId);
		const delegate = new ExtensionFeatureItemDelegate();
		const list = this.instantiationService.createInstance(WorkbenchList, 'ExtensionFeaturesList', append(container, $('.features-list-wrapper')), delegate, [renderer], {
			multipleSelectionSupport: false,
			setRowLineHeight: false,
			horizontalScrolling: false,
			accessibilityProvider: <IListAccessibilityProvider<IExtensionFeatureDescriptor | null>>{
				getAriaLabel(extensionFeature: IExtensionFeatureDescriptor | null): string {
					return extensionFeature?.label ?? '';
				},
				getWidgetAriaLabel(): string {
					return localize('extension features list', "Extension Features");
				}
			},
			openOnSingleClick: true
		}) as WorkbenchList<IExtensionFeatureDescriptor>;
		return list;
	}

	private layoutFeatureView(): void {
		this.featureView.value?.layout(this.featureViewDimension?.height, this.featureViewDimension?.width);
	}

	private showFeatureView(feature: IExtensionFeatureDescriptor, container: HTMLElement): void {
		if (this.featureView.value?.feature.id === feature.id) {
			return;
		}
		clearNode(container);
		this.featureView.value = this.instantiationService.createInstance(ExtensionFeatureView, this.extensionId, this.manifest, feature);
		container.appendChild(this.featureView.value.domNode);
		this.layoutFeatureView();
	}

	private getFeatures(): IExtensionFeatureDescriptor[] {
		const features = Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).getExtensionFeatures();
		return features.filter(feature => {
			const renderer = this.getRenderer(feature);
			const shouldRender = renderer.shouldRender(this.manifest);
			renderer.dispose();
			return shouldRender;
		}).sort((a, b) => a.label.localeCompare(b.label));
	}

	private getRenderer(feature: IExtensionFeatureDescriptor): IExtensionFeatureRenderer {
		return this.instantiationService.createInstance(feature.renderer);
	}

}

interface IExtensionFeatureItemTemplateData {
	readonly label: HTMLElement;
	readonly disabledElement: HTMLElement;
	readonly statusElement: HTMLElement;
	readonly disposables: DisposableStore;
}

class ExtensionFeatureItemDelegate implements IListVirtualDelegate<IExtensionFeatureDescriptor> {
	getHeight() { return 22; }
	getTemplateId() { return 'extensionFeatureDescriptor'; }
}

class ExtensionFeatureItemRenderer implements IListRenderer<IExtensionFeatureDescriptor, IExtensionFeatureItemTemplateData> {

	readonly templateId = 'extensionFeatureDescriptor';

	constructor(
		private readonly extensionId: ExtensionIdentifier,
		@IExtensionFeaturesManagementService private readonly extensionFeaturesManagementService: IExtensionFeaturesManagementService
	) { }

	renderTemplate(container: HTMLElement): IExtensionFeatureItemTemplateData {
		container.classList.add('extension-feature-list-item');
		const label = append(container, $('.extension-feature-label'));
		const disabledElement = append(container, $('.extension-feature-disabled-label'));
		disabledElement.textContent = localize('revoked', "No Access");
		const statusElement = append(container, $('.extension-feature-status'));
		return { label, disabledElement, statusElement, disposables: new DisposableStore() };
	}

	renderElement(element: IExtensionFeatureDescriptor, index: number, templateData: IExtensionFeatureItemTemplateData) {
		templateData.disposables.clear();
		templateData.label.textContent = element.label;
		templateData.disabledElement.style.display = this.extensionFeaturesManagementService.isEnabled(this.extensionId, element.id) ? 'none' : 'inherit';

		templateData.disposables.add(this.extensionFeaturesManagementService.onDidChangeEnablement(({ extension, featureId, enabled }) => {
			if (ExtensionIdentifier.equals(extension, this.extensionId) && featureId === element.id) {
				templateData.disabledElement.style.display = enabled ? 'none' : 'inherit';
			}
		}));

		const statusElementClassName = templateData.statusElement.className;
		const updateStatus = () => {
			const accessData = this.extensionFeaturesManagementService.getAccessData(this.extensionId, element.id);
			if (accessData?.current?.status) {
				templateData.statusElement.style.display = 'inherit';
				templateData.statusElement.className = `${statusElementClassName} ${SeverityIcon.className(accessData.current.status.severity)}`;
			} else {
				templateData.statusElement.style.display = 'none';
			}
		};
		updateStatus();
		templateData.disposables.add(this.extensionFeaturesManagementService.onDidChangeAccessData(({ extension, featureId }) => {
			if (ExtensionIdentifier.equals(extension, this.extensionId) && featureId === element.id) {
				updateStatus();
			}
		}));
	}

	disposeElement(element: IExtensionFeatureDescriptor, index: number, templateData: IExtensionFeatureItemTemplateData, height: number | undefined): void {
		templateData.disposables.dispose();
	}

	disposeTemplate(templateData: IExtensionFeatureItemTemplateData) {
		templateData.disposables.dispose();
	}

}

class ExtensionFeatureView extends Disposable {

	readonly domNode: HTMLElement;
	private readonly layoutParticipants: ILayoutParticipant[] = [];

	constructor(
		private readonly extensionId: ExtensionIdentifier,
		private readonly manifest: IExtensionManifest,
		readonly feature: IExtensionFeatureDescriptor,
		@IOpenerService private readonly openerService: IOpenerService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionFeaturesManagementService private readonly extensionFeaturesManagementService: IExtensionFeaturesManagementService,
		@IDialogService private readonly dialogService: IDialogService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super();

		this.domNode = $('.extension-feature-content');
		this.create(this.domNode);
	}

	private create(content: HTMLElement): void {
		const header = append(content, $('.feature-header'));
		const title = append(header, $('.feature-title'));
		title.textContent = this.feature.label;

		if (this.feature.access.canToggle) {
			const actionsContainer = append(header, $('.feature-actions'));
			const button = new Button(actionsContainer, defaultButtonStyles);
			this.updateButtonLabel(button);
			this._register(this.extensionFeaturesManagementService.onDidChangeEnablement(({ extension, featureId }) => {
				if (ExtensionIdentifier.equals(extension, this.extensionId) && featureId === this.feature.id) {
					this.updateButtonLabel(button);
				}
			}));
			this._register(button.onDidClick(async () => {
				const enabled = this.extensionFeaturesManagementService.isEnabled(this.extensionId, this.feature.id);
				const confirmationResult = await this.dialogService.confirm({
					title: localize('accessExtensionFeature', "Enable '{0}' Feature", this.feature.label),
					message: enabled
						? localize('disableAccessExtensionFeatureMessage', "Would you like to revoke '{0}' extension to access '{1}' feature?", this.manifest.displayName ?? this.extensionId.value, this.feature.label)
						: localize('enableAccessExtensionFeatureMessage', "Would you like to allow '{0}' extension to access '{1}' feature?", this.manifest.displayName ?? this.extensionId.value, this.feature.label),
					custom: true,
					primaryButton: enabled ? localize('revoke', "Revoke Access") : localize('grant', "Allow Access"),
					cancelButton: localize('cancel', "Cancel"),
				});
				if (confirmationResult.confirmed) {
					this.extensionFeaturesManagementService.setEnablement(this.extensionId, this.feature.id, !enabled);
				}
			}));
		}

		const body = append(content, $('.feature-body'));

		const bodyContent = $('.feature-body-content');
		const scrollableContent = this._register(new DomScrollableElement(bodyContent, {}));
		append(body, scrollableContent.getDomNode());
		this.layoutParticipants.push({ layout: () => scrollableContent.scanDomNode() });
		scrollableContent.scanDomNode();

		if (this.feature.description) {
			const description = append(bodyContent, $('.feature-description'));
			description.textContent = this.feature.description;
		}

		const accessData = this.extensionFeaturesManagementService.getAccessData(this.extensionId, this.feature.id);
		if (accessData?.current?.status) {
			append(bodyContent, $('.feature-status', undefined,
				$(`span${ThemeIcon.asCSSSelector(accessData.current.status.severity === Severity.Error ? errorIcon : accessData.current.status.severity === Severity.Warning ? warningIcon : infoIcon)}`, undefined),
				$('span', undefined, accessData.current.status.message)));
		}

		const featureContentElement = append(bodyContent, $('.feature-content'));
		const renderer = this.instantiationService.createInstance<IExtensionFeatureRenderer>(this.feature.renderer);
		if (renderer.type === 'table') {
			this.renderTableData(featureContentElement, <IExtensionFeatureTableRenderer>renderer);
		} else if (renderer.type === 'markdown') {
			this.renderMarkdownData(featureContentElement, <IExtensionFeatureMarkdownRenderer>renderer);
		}
	}

	private updateButtonLabel(button: Button): void {
		button.label = this.extensionFeaturesManagementService.isEnabled(this.extensionId, this.feature.id) ? localize('revoke', "Revoke Access") : localize('enable', "Allow Access");
	}

	private renderTableData(container: HTMLElement, renderer: IExtensionFeatureTableRenderer): void {
		const tableData = this._register(renderer.render(this.manifest));
		if (tableData.onDidChange) {
			this._register(tableData.onDidChange(data => {
				clearNode(container);
				this.renderTable(data, container);
			}));
		}
		this.renderTable(tableData.data, container);
	}

	private renderTable(tableData: ITableData, container: HTMLElement): void {
		append(container,
			$('table', undefined,
				$('tr', undefined,
					...tableData.headers.map(header => $('th', undefined, header))
				),
				...tableData.rows
					.map(row => {
						return $('tr', undefined,
							...row.map(rowData => {
								if (typeof rowData === 'string') {
									return $('td', undefined, rowData);
								}
								if (isMarkdownString(rowData)) {
									const element = $('td', undefined);
									this.renderMarkdown(rowData, element);
									return element;
								}
								const data = Array.isArray(rowData.data) ? rowData.data : [rowData.data];
								if (rowData.type === 'code') {
									return $('td', undefined, ...data.map(c => $('code', undefined, c)));
								} else if (rowData.type === 'keybinding') {
									return $('td', undefined, ...data.map(keybinding => {
										const element = $('');
										const kbl = new KeybindingLabel(element, OS, defaultKeybindingLabelStyles);
										kbl.set(this.keybindingService.resolveUserBinding(keybinding)[0]);
										return element;
									}));
								} else if (rowData.type === 'color') {
									return $('td', undefined, ...data.map(colorReference => {
										const result: Node[] = [];
										if (colorReference && colorReference[0] === '#') {
											const color = Color.fromHex(colorReference);
											if (color) {
												result.push($('span', { class: 'colorBox', style: 'background-color: ' + Color.Format.CSS.format(color) }, ''));
											}
										}
										result.push($('code', undefined, colorReference));
										return result;
									}).flat());
								} else {
									return $('td', undefined, rowData.data[0]);
								}
							})
						);
					})));
	}

	private renderMarkdownData(container: HTMLElement, renderer: IExtensionFeatureMarkdownRenderer): void {
		container.classList.add('markdown');
		const markdownData = this._register(renderer.render(this.manifest));
		if (markdownData.onDidChange) {
			this._register(markdownData.onDidChange(data => {
				clearNode(container);
				this.renderMarkdown(data, container);
			}));
		}
		this.renderMarkdown(markdownData.data, container);
	}

	private renderMarkdown(markdown: IMarkdownString, container: HTMLElement): void {
		const { element, dispose } = renderMarkdown(
			{
				value: markdown.value,
				isTrusted: markdown.isTrusted,
				supportThemeIcons: true
			},
			{
				actionHandler: {
					callback: (content) => this.openerService.open(content, { allowCommands: !!markdown.isTrusted }).catch(onUnexpectedError),
					disposables: this._store
				},
			});
		this._register(toDisposable(dispose));
		append(container, element);
	}

	layout(height?: number, width?: number): void {
		this.layoutParticipants.forEach(p => p.layout(height, width));
	}

}
