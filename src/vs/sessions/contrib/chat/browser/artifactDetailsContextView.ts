/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, DisposableResizeObserver, EventHelper, EventType, getActiveElement, getDomNodePagePosition, getWindow, isAncestorOfActiveElement, isHTMLElement, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { AnchorAlignment } from '../../../../base/browser/ui/contextview/contextview.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { AnchorPosition } from '../../../../base/common/layout.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService, IOpenContextView } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ArtifactDetailsPanel } from './artifactDetailsPanel.js';
import { ArtifactDetailsModel } from './artifactDetailsModel.js';
import { ArtifactDetailsSelection } from './artifactDetailsView.js';
import { ArtifactIntegrationPresentation, IArtifactDetailsHost } from './artifactIntegrationPresentation.js';

const artifactDetailsFocused = new RawContextKey<boolean>('artifactDetailsFocused', false);
const controllers = new WeakMap<HTMLElement, ArtifactDetailsContextView>();
const gap = 8;

export class ArtifactDetailsContextView extends Disposable implements IArtifactDetailsHost {
	readonly id = `artifact-details-${generateUuid()}`;
	readonly selected = observableValue<ArtifactIntegrationPresentation | undefined>(this, undefined);
	private readonly element = $('.artifact-details-context-view', { id: this.id, role: 'dialog', 'aria-modal': 'false' });
	private readonly panel = this._register(new MutableDisposable<ArtifactDetailsPanel>());
	private readonly model = this._register(new MutableDisposable<ArtifactDetailsModel>());
	private readonly visibleStore = this._register(new MutableDisposable<DisposableStore>());
	private readonly pendingLayout = this._register(new MutableDisposable());
	private view: IOpenContextView | undefined;
	private target: HTMLElement | undefined;
	private suspended = false;
	private readonly scopedInstantiationService: IInstantiationService;

	constructor(
		private readonly getInput: () => HTMLElement | undefined,
		private readonly getPills: () => HTMLElement,
		private readonly focusFallback: (() => void) | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IHoverService private readonly hoverService: IHoverService,
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super();
		const scopedContext = this._register(contextKeyService.createScoped(this.element));
		artifactDetailsFocused.bindTo(scopedContext).set(true);
		this.scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContext])));
		controllers.set(this.element, this);
		this._register(toDisposable(() => {
			this.close(false);
			controllers.delete(this.element);
		}));
		this._register(autorun(reader => {
			if (entitlementService.sentimentObs.read(reader).hidden) {
				this.close(false);
			}
		}));
		const updateHint = () => {
			const binding = keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
			this.element.setAttribute('aria-description', configurationService.getValue<boolean>(AccessibilityVerbositySettingId.Chat) && binding
				? localize('artifactDetailsHelpHint', "Use {0} for artifact details accessibility help.", binding) : '');
		};
		updateHint();
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AccessibilityVerbositySettingId.Chat)) {
				updateHint();
			}
		}));
		this._register(keybindingService.onDidUpdateKeybindings(updateHint));
		this._register(addDisposableListener(this.element, EventType.KEY_DOWN, event => {
			const keyboard = new StandardKeyboardEvent(event);
			if (keyboard.equals(KeyCode.Escape)) {
				EventHelper.stop(event, true);
				this.close(true);
			} else if (keyboard.keyCode === KeyCode.Tab) {
				const elements = this.panel.value?.tabbableElements ?? [];
				const active = getActiveElement();
				const index = isHTMLElement(active) ? elements.indexOf(active) : -1;
				if (elements.length && (active === this.panel.value?.element || (keyboard.shiftKey ? index === 0 : index === elements.length - 1))) {
					EventHelper.stop(event, true);
					elements[keyboard.shiftKey ? elements.length - 1 : 0].focus();
				}
			}
		}, true));
	}

	toggle(presentation: ArtifactIntegrationPresentation, target: HTMLElement, section?: ArtifactDetailsSelection): void {
		if (this.entitlementService.sentiment.hidden || this._store.isDisposed) {
			return;
		}
		if (this.selected.get() === presentation && !section) {
			this.close(true);
			return;
		}
		this.hoverService.hideHover(true);
		this.target = target;
		this.suspended = false;
		if (this.selected.get() !== presentation) {
			this.panel.clear();
			this.model.value = this.scopedInstantiationService.createInstance(ArtifactDetailsModel, presentation, () => this.close(false));
			this.panel.value = this.scopedInstantiationService.createInstance(ArtifactDetailsPanel, this.model.value.data, restoreFocus => this.close(restoreFocus), () => this.scheduleLayout(), getWindow(target));
			append(this.element, this.panel.value.element);
			this.element.setAttribute('aria-labelledby', this.panel.value.title.id);
			this.selected.set(presentation, undefined);
		}
		if (!this.view) {
			this.show();
		} else {
			this.contextViewService.layout();
		}
		if (section) {
			this.panel.value?.focusSection(section);
		} else {
			this.panel.value?.element.focus({ preventScroll: true });
		}
	}

	release(presentation: ArtifactIntegrationPresentation): void {
		if (this.selected.get() === presentation) {
			const hadFocus = isAncestorOfActiveElement(this.element);
			this.close(false);
			if (hadFocus) {
				this.focusFallback?.();
			}
		}
	}

	private show(): void {
		const pills = this.getPills();
		const input = this.getInput() ?? pills;
		const targetWindow = getWindow(input);
		this.view = this.contextViewService.showContextView({
			anchorPosition: AnchorPosition.ABOVE,
			anchorAlignment: AnchorAlignment.LEFT,
			// Context views start at 2575; Quick Input must remain above this panel at 2550.
			layer: -50,
			canRelayout: true,
			getAnchor: () => {
				const anchor = getDomNodePagePosition(input);
				return { x: anchor.left, y: getDomNodePagePosition(pills).top - gap, width: anchor.width, height: 1 };
			},
			render: container => {
				append(container, this.element);
				const store = new DisposableStore();
				this.visibleStore.value = store;
				const observer = store.add(new DisposableResizeObserver('ArtifactDetailsAnchor', () => this.scheduleLayout(), targetWindow));
				store.add(observer.observe(input));
				store.add(observer.observe(pills));
				store.add(addDisposableListener(targetWindow.document, 'pointerdown', event => this.onOutsideClick(event), true));
				store.add(addDisposableListener(targetWindow.document, EventType.SCROLL, event => {
					if (!event.composedPath().includes(this.element)) {
						this.scheduleLayout();
					}
				}, true));
				store.add(addDisposableListener(targetWindow, EventType.RESIZE, () => this.scheduleLayout()));
				this.layout();
				return toDisposable(() => this.element.remove());
			},
			onDOMEvent: event => {
				if (event instanceof targetWindow.MouseEvent && event.type === EventType.CLICK) {
					this.onOutsideClick(event);
				}
			},
			layout: () => this.layout(),
			onHide: () => {
				this.view = undefined;
				this.visibleStore.clear();
				this.pendingLayout.clear();
				if (!this.suspended) {
					this.clear();
				}
			},
		}, this.layoutService.getContainer(targetWindow));
	}

	private onOutsideClick(event: MouseEvent): void {
		const path = event.composedPath();
		if (path.some(element => isHTMLElement(element) && element.classList.contains('quick-input-widget'))) {
			return;
		}
		if (!path.includes(this.element) && !path.some(element => isHTMLElement(element) && element.dataset.artifactDetailsOwner === this.id)) {
			this.close(false);
		}
	}

	private layout(): void {
		const pills = this.getPills();
		const input = this.getInput() ?? pills;
		if (!input.isConnected || !this.target?.isConnected || !input.getClientRects().length) {
			this.close(false);
			return;
		}
		const window = getWindow(input);
		this.element.style.width = `${input.getBoundingClientRect().width}px`;
		const top = Math.max(0, this.layoutService.getContainer(window).getBoundingClientRect().top);
		this.panel.value?.layout(Math.max(0, pills.getBoundingClientRect().top - top - gap * 2 - 2));
	}

	private scheduleLayout(): void {
		if (!this.view || this.pendingLayout.value) {
			return;
		}
		this.pendingLayout.value = scheduleAtNextAnimationFrame(getWindow(this.element), () => {
			this.pendingLayout.clear();
			if (this.view) {
				this.contextViewService.layout();
			}
		});
	}

	private clear(): void {
		this.panel.clear();
		this.model.clear();
		this.selected.set(undefined, undefined);
		this.target = undefined;
	}

	private close(restoreFocus: boolean): void {
		const target = this.target;
		this.suspended = false;
		if (this.view) {
			this.view.close();
		} else {
			this.clear();
		}
		if (restoreFocus) {
			if (target?.isConnected) {
				target.focus({ preventScroll: true });
			} else {
				this.focusFallback?.();
			}
		}
	}

	getAccessibilityProvider(type: AccessibleViewType): AccessibleContentProvider | undefined {
		const panel = this.panel.value;
		const selected = this.selected.get();
		if (!panel || !selected) {
			return undefined;
		}
		const previousFocus = getActiveElement();
		const content = type === AccessibleViewType.Help ? artifactDetailsHelp() : panel.getAccessibleText();
		let opened = false;
		let returning = false;
		const provider = new AccessibleContentProvider(
			AccessibleViewProviderId.ArtifactDetails, { type, language: 'plaintext' }, () => content,
			() => {
				returning = true;
				// Accessible View hides its context view after calling onClose.
				queueMicrotask(() => {
					if (!this._store.isDisposed && this.selected.get() === selected && this.target?.isConnected && !this.entitlementService.sentiment.hidden) {
						this.suspended = false;
						this.show();
						(isHTMLElement(previousFocus) && previousFocus.isConnected ? previousFocus : panel.element).focus({ preventScroll: true });
					}
				});
			},
			AccessibilityVerbositySettingId.Chat,
			() => { opened = true; this.suspended = true; },
		);
		provider.onDispose = () => {
			if (opened && !returning && this.selected.get() === selected) {
				this.close(false);
			}
		};
		return provider;
	}
}

function artifactDetailsHelp(): string {
	return [
		localize('artifactDetailsHelp.overview', "Artifact details show the full resource title and state icon, its description, tabbed state lists, actions, Autopilot, and Activities. Activate the linked title to open the resource. Copy Link and Remove Artifact are available in the footer."),
		localize('artifactDetailsHelp.description', "Descriptions show at most three lines. The Accessible View includes the full description. When a provider supplies more information about a list, use Tab to reach its information icon and Enter or Space to read the hover."),
		localize('artifactDetailsHelp.controls', "Use Tab and Shift+Tab to move between controls. Buttons below the state lists run actions once. Enabled actions come first in provider order, and the first action is primary. List rows show a single line; their full text and state remain available to screen readers and in hovers. Use Space to change an Autopilot switch. Enabling a rule grants permission for future automatic runs; it can run immediately if its condition already holds. Turning it off prevents new runs, but does not cancel work already started."),
		localize('artifactDetailsHelp.focus', "A temporarily unavailable switch moves focus to its explanation, then back when available, unless you move focus elsewhere. Enabled automation remains available to turn off."),
		localize('artifactDetailsHelp.dismiss', "Escape or Close returns focus to the invoking pill. Clicking outside, including in the chat input, dismisses details without moving focus back. Clicking another artifact switches this panel; clicking its status section selects and focuses the corresponding list, or focuses its action."),
		localize('artifactDetailsHelp.view', "Open the Accessible View{0} to read the full description and current lists as text. The chat accessibility verbosity setting controls the help hint.", '<keybinding:editor.action.accessibleView>'),
		localize('artifactDetailsHelp.autopilot', "All Available Autopilot Rules applies only to its provider's currently available rules. The enabled count describes partial enablement. Enabling a group requests confirmation and uses the policies shown in the dropdowns. Disabling a group revokes enabled rules without enabling unavailable ones."),
		localize('artifactDetailsHelp.tabs', "Left and Right Arrow, Home, and End select a state-list tab and keep keyboard focus on the full tab. Clicking a tab moves focus to the first item in its list. Tab moves through the information buttons beside each tab label and into the selected list. Enter or Space on an information button shows that list's details without selecting its tab. The list area keeps its height when you change tabs. Use arrow keys in a list and Enter to open its selected item. A pill's status section selects and focuses its list. Autopilot is collapsed by default; its heading expands or collapses its rules, and its separate switch enables all available rules or turns them off. Policy dropdowns remain visible while rules are off. Selecting a policy while off does not enable the rule; turning the switch on uses the displayed policy without asking again. Policy selections, selected tabs, and Autopilot expansion choices are remembered when reopening the artifact."),
		localize('artifactDetailsHelp.automationPill', "Artifacts with enabled Autopilot rules have a trailing pill section with an Autopilot icon and the number of enabled rules. Select it to open and focus Autopilot. This count includes saved enabled rules even when new enablement is temporarily unavailable."),
		localize('artifactDetailsHelp.activities', "Activities appears below Autopilot when an artifact has activity. It starts collapsed. Its heading shows the number of loaded activities, which increases when Earlier Activities loads older history. Use Enter or Space on its heading to expand it, then arrow keys to read the newest activity first. Scrolling past either end of the list scrolls the surrounding panel. Only rows with a chat destination respond to clicking or Enter; they reveal the related message. Other rows are informational. Pending actions offer Cancel Action, and uncertain outcomes offer Reconcile Outcome. The Accessible View includes the activity count and text."),
	].join('\n\n');
}

function focusedController(): ArtifactDetailsContextView | undefined {
	const active = getActiveElement();
	const element = isHTMLElement(active) ? active.closest<HTMLElement>('.artifact-details-context-view') : undefined;
	return element ? controllers.get(element) : undefined;
}

export class ArtifactDetailsAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 130;
	readonly name = 'artifactDetails';
	readonly type = AccessibleViewType.Help;
	readonly when = artifactDetailsFocused;
	getProvider(): AccessibleContentProvider | undefined {
		return focusedController()?.getAccessibilityProvider(this.type);
	}
}

export class ArtifactDetailsAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 130;
	readonly name = 'artifactDetails';
	readonly type = AccessibleViewType.View;
	readonly when = artifactDetailsFocused;
	getProvider(): AccessibleContentProvider | undefined {
		return focusedController()?.getAccessibilityProvider(this.type);
	}
}
