/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/scm';
import { IDisposable, DisposableStore, combinedDisposable } from 'vs/base/common/lifecycle';
import { autorun } from 'vs/base/common/observable';
import { append, $ } from 'vs/base/browser/dom';
import { ISCMProvider, ISCMRepository, ISCMViewService } from 'vs/workbench/contrib/scm/common/scm';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ActionRunner, IAction } from 'vs/base/common/actions';
import { connectPrimaryMenu, getRepositoryResourceCount, isSCMRepository, StatusBarAction } from './util';
import { ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { ICompressibleTreeRenderer } from 'vs/base/browser/ui/tree/objectTree';
import { FuzzyScore } from 'vs/base/common/filters';
import { IListRenderer } from 'vs/base/browser/ui/list/list';
import { IActionViewItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { defaultCountBadgeStyles } from 'vs/platform/theme/browser/defaultStyles';
import { WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IManagedHover } from 'vs/base/browser/ui/hover/hover';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';

export class RepositoryActionRunner extends ActionRunner {
	constructor(private readonly getSelectedRepositories: () => ISCMRepository[]) {
		super();
	}

	protected override async runAction(action: IAction, context: ISCMProvider): Promise<void> {
		if (!(action instanceof MenuItemAction)) {
			return super.runAction(action, context);
		}

		const selection = this.getSelectedRepositories().map(r => r.provider);
		const actionContext = selection.some(s => s === context) ? selection : [context];

		await action.run(...actionContext);
	}
}

interface RepositoryTemplate {
	readonly label: HTMLElement;
	readonly labelCustomHover: IManagedHover;
	readonly name: HTMLElement;
	readonly description: HTMLElement;
	readonly countContainer: HTMLElement;
	readonly count: CountBadge;
	readonly toolBar: WorkbenchToolBar;
	readonly elementDisposables: DisposableStore;
	readonly templateDisposable: IDisposable;
}

export class RepositoryRenderer implements ICompressibleTreeRenderer<ISCMRepository, FuzzyScore, RepositoryTemplate>, IListRenderer<ISCMRepository, RepositoryTemplate> {

	static readonly TEMPLATE_ID = 'repository';
	get templateId(): string { return RepositoryRenderer.TEMPLATE_ID; }

	constructor(
		private readonly toolbarMenuId: MenuId,
		private readonly actionViewItemProvider: IActionViewItemProvider,
		@ICommandService private commandService: ICommandService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IHoverService private hoverService: IHoverService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IMenuService private menuService: IMenuService,
		@ISCMViewService private scmViewService: ISCMViewService,
		@ITelemetryService private telemetryService: ITelemetryService
	) { }

	renderTemplate(container: HTMLElement): RepositoryTemplate {
		// hack
		if (container.classList.contains('monaco-tl-contents')) {
			(container.parentElement!.parentElement!.querySelector('.monaco-tl-twistie')! as HTMLElement).classList.add('force-twistie');
		}

		const provider = append(container, $('.scm-provider'));
		const label = append(provider, $('.label'));
		const labelCustomHover = this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), label, '', {});
		const name = append(label, $('span.name'));
		const description = append(label, $('span.description'));
		const actions = append(provider, $('.actions'));
		const toolBar = new WorkbenchToolBar(actions, { actionViewItemProvider: this.actionViewItemProvider, resetMenu: this.toolbarMenuId }, this.menuService, this.contextKeyService, this.contextMenuService, this.keybindingService, this.commandService, this.telemetryService);
		const countContainer = append(provider, $('.count'));
		const count = new CountBadge(countContainer, {}, defaultCountBadgeStyles);
		const visibilityDisposable = toolBar.onDidChangeDropdownVisibility(e => provider.classList.toggle('active', e));

		const templateDisposable = combinedDisposable(labelCustomHover, visibilityDisposable, toolBar);

		return { label, labelCustomHover, name, description, countContainer, count, toolBar, elementDisposables: new DisposableStore(), templateDisposable };
	}

	renderElement(arg: ISCMRepository | ITreeNode<ISCMRepository, FuzzyScore>, index: number, templateData: RepositoryTemplate, height: number | undefined): void {
		const repository = isSCMRepository(arg) ? arg : arg.element;

		templateData.name.textContent = repository.provider.name;
		if (repository.provider.rootUri) {
			templateData.labelCustomHover.update(`${repository.provider.label}: ${repository.provider.rootUri.fsPath}`);
			templateData.description.textContent = repository.provider.label;
		} else {
			templateData.labelCustomHover.update(repository.provider.label);
			templateData.description.textContent = '';
		}

		let statusPrimaryActions: IAction[] = [];
		let menuPrimaryActions: IAction[] = [];
		let menuSecondaryActions: IAction[] = [];
		const updateToolbar = () => {
			templateData.toolBar.setActions([...statusPrimaryActions, ...menuPrimaryActions], menuSecondaryActions);
		};

		templateData.elementDisposables.add(autorun(reader => {
			const commands = repository.provider.statusBarCommands.read(reader) ?? [];
			statusPrimaryActions = commands.map(c => new StatusBarAction(c, this.commandService));
			updateToolbar();
		}));

		templateData.elementDisposables.add(autorun(reader => {
			const count = repository.provider.count.read(reader) ?? getRepositoryResourceCount(repository.provider);
			templateData.countContainer.setAttribute('data-count', String(count));
			templateData.count.setCount(count);
		}));

		const repositoryMenus = this.scmViewService.menus.getRepositoryMenus(repository.provider);
		const menu = this.toolbarMenuId === MenuId.SCMTitle ? repositoryMenus.titleMenu.menu : repositoryMenus.repositoryMenu;
		templateData.elementDisposables.add(connectPrimaryMenu(menu, (primary, secondary) => {
			menuPrimaryActions = primary;
			menuSecondaryActions = secondary;
			updateToolbar();
		}));

		templateData.toolBar.context = repository.provider;
	}

	renderCompressedElements(): void {
		throw new Error('Should never happen since node is incompressible');
	}

	disposeElement(group: ISCMRepository | ITreeNode<ISCMRepository, FuzzyScore>, index: number, template: RepositoryTemplate): void {
		template.elementDisposables.clear();
	}

	disposeTemplate(templateData: RepositoryTemplate): void {
		templateData.elementDisposables.dispose();
		templateData.templateDisposable.dispose();
	}
}
