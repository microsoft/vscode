/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../mcp/browser/media/mcpServerConfigurationForm.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { ISelectOptionItem, SelectBox } from '../../../../../base/browser/ui/selectBox/selectBox.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getErrorMessage } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { formatTokenCount } from '../../../../../base/common/numbers.js';
import { equals } from '../../../../../base/common/objects.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { MODEL_ROUTER_MAX_ROUTES, ModelRouterContextSize, ModelRouterEffortLevel } from '../../../../../platform/agentHost/common/modelRouter.js';
import { getReasoningEffortLabel, reasoningEffortLevels } from '../../../../../platform/agentHost/common/reasoningEffort.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { hasNativeContextMenu } from '../../../../../platform/window/common/window.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { defaultButtonStyles, defaultSelectBoxStyles, getInputBoxStyle } from '../../../../../platform/theme/browser/defaultStyles.js';
import { settingsTextInputBorder } from '../../../preferences/common/settingsEditorColorRegistry.js';
import { IOpenedModelRouter, IRoutableModel, ModelRoutersViewModel } from './modelRoutersViewModel.js';

const $ = DOM.$;

// Match the Settings editor, whose inputs stay visible on themes with a faint `input.border`.
const formInputBoxStyles = getInputBoxStyle({ inputBorder: settingsTextInputBorder });

interface IModelRouterFormRoute {
	name: string;
	/** What the file writes for the route's models, in preference order. The first is the one shown. */
	models: readonly string[];
	effort: ModelRouterEffortLevel | undefined;
	contextSize: ModelRouterContextSize | undefined;
	when: string;
	guidance: string;
	/** Kept as read, as the form has no field for them. */
	readonly examples: readonly string[];
}

function newRoute(model: IRoutableModel | undefined): IModelRouterFormRoute {
	return { name: '', models: model ? [model.reference] : [], effort: undefined, contextSize: undefined, when: '', guidance: '', examples: [] };
}

/** The form for a model router, new or read from its file: its name, its description and its routes. The view model writes the file. */
export class ModelRouterForm extends Disposable {
	readonly element: HTMLElement;

	private readonly _onDidCancel = this._register(new Emitter<void>());
	readonly onDidCancel: Event<void> = this._onDidCancel.event;
	private readonly _onDidSave = this._register(new Emitter<URI>());
	/** Fires with the router's file once it is written. */
	readonly onDidSave: Event<URI> = this._onDidSave.event;

	private readonly nameInput: InputBox;
	private readonly descriptionInput: InputBox;
	private readonly fileHint: HTMLElement;
	private readonly routesElement: HTMLElement;
	private readonly addRouteButton: Button;
	private readonly errorElement: HTMLElement;
	private readonly saveButton: Button;
	private readonly routeDisposables = this._register(new DisposableStore());
	private models: readonly IRoutableModel[];
	private readonly routes: IModelRouterFormRoute[];
	private routeNameInputs: InputBox[] = [];
	/** The fields of the routes that take text, in the order they are drawn. */
	private routeInputs: InputBox[] = [];

	constructor(
		parent: HTMLElement,
		private readonly viewModel: ModelRoutersViewModel,
		/** The router to change. Without one the form is for a new router. */
		private readonly existing: IOpenedModelRouter | undefined,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super();
		this.models = viewModel.getRoutableModels();
		this.routes = existing
			? existing.router.routes.map(route => ({ name: route.name ?? '', models: route.models, effort: route.effort, contextSize: route.contextSize, when: route.when, guidance: route.mainAgentGuidance ?? '', examples: route.examples }))
			: [newRoute(this.models[0]), newRoute(this.models[1] ?? this.models[0])];
		const title = existing ? localize('modelRouterForm.editTitle', "Edit Model Router") : localize('modelRouterForm.title', "New Model Router");
		this.element = DOM.append(parent, $('.mcp-config-form.model-router-form', { role: 'form', 'aria-label': title }));
		DOM.append(this.element, $('h2.model-router-form-title', undefined, title));
		DOM.append(this.element, $('p.model-router-form-intro', undefined, existing
			? localize('modelRouterForm.editIntro', "Change the router's name, what it is for, and when to use each model.")
			: localize('modelRouterForm.intro', "Name the router and say when to use each model. Edit with AI, on the router's menu, can improve the wording later.")));

		const nameField = this.appendField(this.element, localize('modelRouterForm.name', "Name"));
		this.nameInput = this.appendInput(nameField, localize('modelRouterForm.name.placeholder', "Daily Driver"), localize('modelRouterForm.name.aria', "Router name"));
		this.nameInput.value = existing ? existing.router.displayName ?? existing.router.name : '';
		this.fileHint = DOM.append(nameField, $('.mcp-config-form-hint'));
		this._register(this.nameInput.onDidChange(() => this.updateFileHint()));
		this.updateFileHint();

		const descriptionField = this.appendField(this.element, localize('modelRouterForm.description', "Description"));
		this.descriptionInput = this.appendInput(descriptionField, localize('modelRouterForm.description.placeholder', "Opus for features, Haiku for quick questions"), localize('modelRouterForm.description.aria', "Router description"), this._store, true);
		this.descriptionInput.value = existing?.router.description ?? '';
		DOM.append(descriptionField, $('.mcp-config-form-hint', undefined, localize('modelRouterForm.description.hint', "Shown with the router in the model picker.")));

		const routesField = this.appendField(this.element, localize('modelRouterForm.routes', "Routes"));
		DOM.append(routesField, $('.mcp-config-form-hint', undefined, localize('modelRouterForm.routes.hint', "A chat runs on the route that fits its first message. For each route, describe the work a request involves, not just its topic.")));
		this.routesElement = DOM.append(routesField, $('.model-router-form-routes'));
		this.addRouteButton = this._register(new Button(DOM.append(routesField, $('.mcp-config-form-kv-add')), { ...defaultButtonStyles, secondary: true, small: true, supportIcons: true }));
		this.addRouteButton.label = `$(add) ${localize('modelRouterForm.addRoute', "Add Route")}`;
		this._register(this.addRouteButton.onDidClick(() => {
			this.routes.push(newRoute(this.models[0]));
			this.renderRoutes();
			this.routeNameInputs.at(-1)?.focus();
		}));
		this.renderRoutes();
		// The agent can list its models after the form opens, and change them while it is open.
		this._register(viewModel.onDidChange(() => {
			const models = viewModel.getRoutableModels();
			if (equals(models, this.models)) {
				return;
			}
			this.models = models;
			// A route drawn before there were models has none. The first two start on different models, as they do in a form opened later.
			this.routes.forEach((route, index) => {
				if (!route.models.length && models.length) {
					route.models = [(models[index === 1 ? 1 : 0] ?? models[0]).reference];
				}
			});
			this.renderRoutesKeepingFocus();
		}));

		this.errorElement = DOM.append(this.element, $('.mcp-config-form-error', { 'aria-live': 'polite' }));
		const footer = DOM.append(this.element, $('.mcp-config-form-footer'));
		const cancelButton = this._register(new Button(footer, { ...defaultButtonStyles, secondary: true }));
		cancelButton.label = localize('modelRouterForm.cancel', "Cancel");
		this._register(cancelButton.onDidClick(() => this._onDidCancel.fire()));
		this.saveButton = this._register(new Button(footer, defaultButtonStyles));
		this.saveButton.label = existing ? localize('modelRouterForm.save', "Save") : localize('modelRouterForm.create', "Create");
		this._register(this.saveButton.onDidClick(() => this.save()));
	}

	focus(): void {
		this.nameInput.focus();
	}

	/** Measures the fields again, as the text of one that grows with it wraps differently at another width. */
	layout(): void {
		this.descriptionInput.layout();
		for (const input of this.routeInputs) {
			input.layout();
		}
	}

	private appendField(parent: HTMLElement, label: string): HTMLElement {
		const field = DOM.append(parent, $('.mcp-config-form-field'));
		DOM.append(field, $('.mcp-config-form-label', undefined, label));
		return field;
	}

	/** An input for text a file can write over several lines is `multiline`, and grows with what it holds. */
	private appendInput(parent: HTMLElement, placeholder: string, ariaLabel: string, store: DisposableStore = this._store, multiline = false): InputBox {
		return store.add(new InputBox(parent, this.contextViewService, { placeholder, ariaLabel, inputBoxStyles: formInputBoxStyles, ...(multiline ? { flexibleHeight: true, flexibleMaxHeight: 160 } : {}) }));
	}

	private updateFileHint(): void {
		// A router that is changed keeps its file, whatever it is named in the form.
		const file = this.existing?.file ?? this.viewModel.getNewRouterFile(this.nameInput.value);
		this.fileHint.textContent = file ? localize('modelRouterForm.fileHint', "Saved as {0}", this.labelService.getUriLabel(file)) : '';
		this.fileHint.style.display = file ? '' : 'none';
	}

	private appendRouteField(parent: HTMLElement, label: string, optional = false): HTMLElement {
		const field = DOM.append(parent, $('.model-router-form-route-field'));
		const labelElement = DOM.append(field, $('.model-router-form-route-label', { 'aria-hidden': 'true' }, label));
		if (optional) {
			DOM.append(labelElement, $('span.mcp-config-form-optional', undefined, localize('modelRouterForm.optional', "(optional)")));
		}
		return field;
	}

	private appendSelect(parent: HTMLElement, options: ISelectOptionItem[], selected: number, ariaLabel: string, onSelect: (index: number) => void): SelectBox {
		const select = this.routeDisposables.add(new SelectBox(options, selected, this.contextViewService, defaultSelectBoxStyles, { useCustomDrawn: !hasNativeContextMenu(this.configurationService), ariaLabel }));
		select.render(DOM.append(parent, $('.model-router-form-route-select')));
		select.setEnabled(options.length > 1);
		this.routeDisposables.add(select.onDidSelect(event => onSelect(event.index)));
		return select;
	}

	private renderRoutes(focusModelOf?: number): void {
		this.routeDisposables.clear();
		DOM.clearNode(this.routesElement);
		this.routeNameInputs = [];
		this.routeInputs = [];
		this.addRouteButton.enabled = this.routes.length < MODEL_ROUTER_MAX_ROUTES;
		this.routes.forEach((route, index) => this.renderRoute(route, index, focusModelOf === index));
	}

	/** Draws the routes again without taking the keyboard focus, or the caret, from the field being typed in. */
	private renderRoutesKeepingFocus(): void {
		const index = this.routeInputs.findIndex(input => input.hasFocus());
		const { selectionStart, selectionEnd } = this.routeInputs[index]?.inputElement ?? {};
		this.renderRoutes();
		// The routes are the ones they were, so each has its fields where they were.
		const input = this.routeInputs[index];
		if (input) {
			input.focus();
			input.inputElement.setSelectionRange(selectionStart ?? null, selectionEnd ?? null);
		}
	}

	private renderRoute(route: IModelRouterFormRoute, index: number, focusModel: boolean): void {
		const position = index + 1;
		// A model the file names that the agent does not list, such as a family, is offered as it is written, with every setting a route can have.
		const written = route.models[0];
		const models = !written || this.models.some(candidate => candidate.reference === written) ? this.models : [...this.models, { reference: written, name: written, efforts: reasoningEffortLevels }];
		const model = models.find(candidate => candidate.reference === written);
		const isListed = !!model && this.models.includes(model);
		const defaultOption = localize('modelRouterForm.route.default', "Default");
		const card = DOM.append(this.routesElement, $('.model-router-form-route', { role: 'group', 'aria-label': localize('modelRouterForm.route.aria', "Route {0}", position) }));

		const header = DOM.append(card, $('.model-router-form-route-header'));
		DOM.append(header, $('span.model-router-form-route-title', undefined, localize('modelRouterForm.route.title', "Route {0}", position)));
		if (index === 0 && this.routes.length > 1) {
			DOM.append(header, $('span.model-router-form-route-note', undefined, localize('modelRouterForm.route.first', "Used when no route clearly fits")));
		}
		const removeAction = this.routeDisposables.add(new Action('modelRouterForm.removeRoute', localize('modelRouterForm.route.remove', "Remove Route {0}", position), ThemeIcon.asClassName(Codicon.close), this.routes.length > 1, () => {
			this.routes.splice(index, 1);
			this.renderRoutes();
			(this.routeNameInputs[Math.min(index, this.routeNameInputs.length - 1)] ?? this.addRouteButton).focus();
		}));
		this.routeDisposables.add(new ActionBar(DOM.append(header, $('.model-router-form-route-actions')))).push(removeAction, { icon: true, label: false });

		const settings = DOM.append(card, $('.model-router-form-route-settings'));
		const nameInput = this.appendInput(this.appendRouteField(settings, localize('modelRouterForm.route.name', "Name")), localize('modelRouterForm.route.name.placeholder', "feature"), localize('modelRouterForm.route.name.aria', "Route {0} name", position), this.routeDisposables);
		nameInput.value = route.name;
		this.routeDisposables.add(nameInput.onDidChange(value => route.name = value));
		this.routeNameInputs.push(nameInput);
		this.routeInputs.push(nameInput);

		const modelSelect = this.appendSelect(this.appendRouteField(settings, localize('modelRouterForm.route.model', "Model")), models.map(candidate => ({ text: candidate.name })), model ? models.indexOf(model) : 0, localize('modelRouterForm.route.model.aria', "Route {0} model", position), selected => {
			// Effort, context and the models to fall back to are per model, so they start over and the route is drawn again.
			route.models = [models[selected].reference];
			route.effort = undefined;
			route.contextSize = undefined;
			this.renderRoutes(index);
		});
		if (focusModel) {
			modelSelect.focus();
		}

		// What the file says is offered even where the model does not list it, so that saving changes nothing by itself.
		const efforts = [...(model?.efforts ?? []), ...(route.effort && !model?.efforts.includes(route.effort) ? [route.effort] : [])];
		const longContext = model?.longContextTokens
			? localize('modelRouterForm.route.context.long', "Long ({0})", formatTokenCount(model.longContextTokens))
			: route.contextSize === 'long' || !isListed && written ? localize('modelRouterForm.route.context.longUnknown', "Long") : undefined;
		this.appendSelect(
			this.appendRouteField(settings, localize('modelRouterForm.route.effort', "Effort")),
			[{ text: defaultOption }, ...efforts.map(level => ({ text: getReasoningEffortLabel(level) }))],
			route.effort ? efforts.indexOf(route.effort) + 1 : 0,
			localize('modelRouterForm.route.effort.aria', "Route {0} effort", position),
			selected => route.effort = selected === 0 ? undefined : efforts[selected - 1],
		);
		this.appendSelect(
			this.appendRouteField(settings, localize('modelRouterForm.route.context', "Context")),
			[{ text: defaultOption }, ...(longContext ? [{ text: longContext }] : [])],
			route.contextSize === 'long' ? 1 : 0,
			localize('modelRouterForm.route.context.aria', "Route {0} context size", position),
			selected => route.contextSize = selected === 1 ? 'long' : undefined,
		);

		const whenInput = this.appendInput(this.appendRouteField(card, localize('modelRouterForm.route.when', "When to use it")), localize('modelRouterForm.route.when.placeholder', "Building a feature or fixing a bug"), localize('modelRouterForm.route.when.aria', "When to use route {0}", position), this.routeDisposables, true);
		whenInput.value = route.when;
		this.routeDisposables.add(whenInput.onDidChange(value => route.when = value));
		this.routeInputs.push(whenInput);

		const guidanceInput = this.appendInput(this.appendRouteField(card, localize('modelRouterForm.route.guidance', "Guidance"), true), localize('modelRouterForm.route.guidance.placeholder', "How you want this work done, such as: Plan first, then run the tests"), localize('modelRouterForm.route.guidance.aria', "Guidance for route {0}", position), this.routeDisposables, true);
		guidanceInput.value = route.guidance;
		this.routeDisposables.add(guidanceInput.onDidChange(value => route.guidance = value));
		this.routeInputs.push(guidanceInput);
	}

	private setError(message: string | undefined): void {
		this.errorElement.textContent = message ?? '';
		this.errorElement.style.display = message ? '' : 'none';
	}

	private async save(): Promise<void> {
		this.setError(undefined);
		this.saveButton.enabled = false;
		const input = {
			name: this.nameInput.value,
			description: this.descriptionInput.value,
			routes: this.routes.map(route => ({ name: route.name, models: route.models, effort: route.effort, contextSize: route.contextSize, when: route.when, guidance: route.guidance, examples: route.examples })),
		};
		let file: URI;
		try {
			if (this.existing) {
				await this.viewModel.saveRouter(this.existing, input);
				file = this.existing.file;
			} else {
				file = await this.viewModel.createRouter(input);
			}
		} catch (error) {
			this.setError(getErrorMessage(error));
			return;
		} finally {
			this.saveButton.enabled = true;
		}
		this._onDidSave.fire(file);
	}
}
