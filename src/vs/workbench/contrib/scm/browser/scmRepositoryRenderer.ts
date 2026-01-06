/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/scm.css';
import { IDisposable, DisposableStore, combinedDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { append, $ } from '../../../../base/browser/dom.js';
import { ISCMProvider, ISCMRepository, ISCMViewService } from '../common/scm.js';
import { CountBadge } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ActionRunner, IAction } from '../../../../base/common/actions.js';
import { connectPrimaryMenu, getRepositoryResourceCount, isSCMRepository, StatusBarAction } from './util.js';
import { ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { ICompressibleTreeRenderer } from '../../../../base/browser/ui/tree/objectTree.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { IListRenderer } from '../../../../base/browser/ui/list/list.js';
import { IActionViewItemProvider } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { defaultCountBadgeStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { shorten } from '../../../../base/common/labels.js';
import { dirname } from '../../../../base/common/resources.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { Codicon } from '../../../../base/common/codicons.js';

export class RepositoryActionRunner extends ActionRunner {
	constructor(private readonly getSelectedRepositories: () => ISCMRepository[]) {
		super();
	}

	protected override async runAction(action: IAction, context: ISCMProvider): Promise<void> {
		if (!(action instanceof MenuItemAction)) {
			return super.runAction(action, context);
		}

		const actionContext = [context];

		// If the selection contains the repository, add the
		// other selected repositories to the action context
		const selection = this.getSelectedRepositories().map(r => r.provider);
		if (selection.some(s => s === context)) {
			actionContext.push(...selection.filter(s => s !== context));
		}

		await action.run(...actionContext);
	}
}

interface RepositoryTemplate {
	readonly icon: HTMLElement;
	readonly label: IconLabel;
	readonly countContainer: HTMLElement;
	readonly count: CountBadge;
	readonly toolBar: WorkbenchToolBar;
	readonly elementDisposables: DisposableStore;
	readonly templateDisposable: IDisposable;
}

export class RepositoryRenderer implements ICompressibleTreeRenderer<ISCMRepository, FuzzyScore, RepositoryTemplate>, IListRenderer<ISCMRepository, RepositoryTemplate>, ITreeRenderer<ISCMRepository, FuzzyScore, RepositoryTemplate> {

	static readonly TEMPLATE_ID = 'repository';
	get templateId(): string { return RepositoryRenderer.TEMPLATE_ID; }

	private readonly onDidChangeVisibleRepositoriesSignal: IObservable<void>;

	constructor(
		private readonly toolbarMenuId: MenuId,
		private readonly actionViewItemProvider: IActionViewItemProvider,
		@ICommandService private commandService: ICommandService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@ILabelService private labelService: ILabelService,
		@IMenuService private menuService: IMenuService,
		@ISCMViewService private scmViewService: ISCMViewService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IUriIdentityService private uriIdentityService: IUriIdentityService
	) {
		this.onDidChangeVisibleRepositoriesSignal = observableSignalFromEvent(this, this.scmViewService.onDidChangeVisibleRepositories);
	}

	renderTemplate(container: HTMLElement): RepositoryTemplate {
		const provider = append(container, $('.scm-provider'));
		const icon = append(provider, $('.icon'));
		const label = new IconLabel(provider, { supportIcons: false });

		const actions = append(provider, $('.actions'));
		const toolBar = new WorkbenchToolBar(actions, { actionViewItemProvider: this.actionViewItemProvider, resetMenu: this.toolbarMenuId, responsiveBehavior: { enabled: true, minItems: 2 } }, this.menuService, this.contextKeyService, this.contextMenuService, this.keybindingService, this.commandService, this.telemetryService);
		const countContainer = append(provider, $('.count'));
		const count = new CountBadge(countContainer, {}, defaultCountBadgeStyles);
		const visibilityDisposable = toolBar.onDidChangeDropdownVisibility(e => provider.classList.toggle('active', e));

		const templateDisposable = combinedDisposable(label, visibilityDisposable, toolBar);

		return { icon, label, countContainer, count, toolBar, elementDisposables: new DisposableStore(), templateDisposable };
	}

	renderElement(arg: ISCMRepository | ITreeNode<ISCMRepository, FuzzyScore>, index: number, templateData: RepositoryTemplate): void {
		const repository = isSCMRepository(arg) ? arg : arg.element;

		templateData.elementDisposables.add(autorun(reader => {
			this.onDidChangeVisibleRepositoriesSignal.read(reader);

			const isVisible = this.scmViewService.isVisible(repository);
			const icon = ThemeIcon.isThemeIcon(repository.provider.iconPath)
				? repository.provider.iconPath
				: Codicon.repo;

			// Only show the selected icon if there are multiple repositories in the workspace
			const showSelectedIcon = icon.id === Codicon.repo.id && isVisible && this.scmViewService.repositories.length > 1;

			templateData.icon.className = showSelectedIcon
				? `icon ${ThemeIcon.asClassName(Codicon.repoSelected)}`
				: `icon ${ThemeIcon.asClassName(icon)}`;
		}));

		// Use the description to disambiguate repositories with the same name and have
		// a `rootUri`. Use the `provider.rootUri` for disambiguation. If they have the
		// same path, we will use the provider label to disambiguate.
		let description: string | undefined = undefined;
		if (repository.provider.rootUri) {
			const repositoriesWithRootUri = this.scmViewService.repositories
				.filter(r => r.provider.rootUri !== undefined &&
					this.uriIdentityService.extUri.isEqual(r.provider.rootUri, repository.provider.rootUri));

			const repositoriesWithSameName = this.scmViewService.repositories
				.filter(r => r.provider.rootUri !== undefined &&
					r.provider.name === repository.provider.name);

			if (repositoriesWithRootUri.length > 1) {
				description = repository.provider.label;
			} else if (repositoriesWithSameName.length > 1) {
				const repositoryIndex = repositoriesWithSameName.findIndex(r => r === repository);
				const shortDescription = shorten(repositoriesWithSameName
					.map(r => this.labelService.getUriLabel(dirname(r.provider.rootUri!), { relative: true })));

				description = shortDescription[repositoryIndex];
			}
		}

		let label: string;
		if (this.scmViewService.explorerEnabledConfig.get() === false) {
			label = repository.provider.name;
		} else {
			const parentRepository = this.scmViewService.repositories
				.find(r => r.provider.id === repository.provider.parentId);

			label = parentRepository
				? `${parentRepository.provider.name} / ${repository.provider.name}`
				: repository.provider.name;
		}

		const title = repository.provider.rootUri
			? `${repository.provider.label}: ${this.labelService.getUriLabel(repository.provider.rootUri)}`
			: repository.provider.label;

		templateData.label.setLabel(label, description, { title });

		let statusPrimaryActions: IAction[] = [];
		let menuPrimaryActions: IAction[] = [];
		let menuSecondaryActions: IAction[] = [];
		const updateToolbar = () => {
			templateData.toolBar.setActions([...statusPrimaryActions, ...menuPrimaryActions], menuSecondaryActions);
		};

		templateData.elementDisposables.add(autorun(reader => {
			const commands = repository.provider.statusBarCommands.read(reader) ?? [];
			statusPrimaryActions = commands.map(c => reader.store.add(new StatusBarAction(c, this.commandService)));
			updateToolbar();
		}));

		templateData.elementDisposables.add(autorun(reader => {
			const count = repository.provider.count.read(reader) ?? getRepositoryResourceCount(repository.provider);
			templateData.countContainer.setAttribute('data-count', String(count));
			templateData.count.setCount(count);
		}));

		templateData.elementDisposables.add(autorun(reader => {
			repository.provider.contextValue.read(reader);

			const repositoryMenus = this.scmViewService.menus.getRepositoryMenus(repository.provider);
			const menu = this.toolbarMenuId === MenuId.SCMTitle
				? repositoryMenus.titleMenu.menu
				: repositoryMenus.getRepositoryMenu(repository);

			reader.store.add(connectPrimaryMenu(menu, (primary, secondary) => {
				menuPrimaryActions = primary;
				menuSecondaryActions = secondary;
				updateToolbar();
			}, this.toolbarMenuId === MenuId.SCMTitle ? 'navigation' : 'inline'));
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
		templateData.count.dispose();
	}
}
