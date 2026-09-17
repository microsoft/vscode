/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { GlobalPointerMoveMonitor } from '../../../../base/browser/globalPointerMoveMonitor.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { HiddenItemStrategy, WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkflowRunViewModel } from '../common/workflowRunViewModel.js';

import './media/workflowStoppingPoint.css';

export class WorkflowStoppingPointWidget extends Disposable {
	readonly domNode: HTMLElement;
	readonly handle: HTMLElement;
	private readonly label: HTMLElement;
	private readonly confirmation: HTMLElement;
	private readonly confirmationToolbar: WorkbenchToolBar;
	private readonly movement: HTMLElement;
	private readonly apply: Action;
	private readonly cancel: Action;
	private readonly up: Action;
	private readonly down: Action;
	private readonly stop: Action;
	private confirmationIncludesCancel: boolean | undefined;
	private readonly monitor = this._register(new GlobalPointerMoveMonitor());
	private readonly scrollFrame = this._register(new MutableDisposable());
	private dragStartIndex = 0;

	constructor(
		container: HTMLElement,
		private readonly rows: readonly HTMLElement[],
		private readonly scrollContainer: HTMLElement,
		private readonly model: WorkflowRunViewModel,
		private readonly layout: () => void,
		@IHoverService hoverService: IHoverService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this.domNode = dom.append(container, dom.$('li.workflow-stop-line', { role: 'presentation' }));
		this.handle = dom.append(this.domNode, dom.$('.workflow-stop-handle', {
			role: 'slider', tabindex: '0', 'aria-orientation': 'vertical',
			'aria-label': localize('workflow.stoppingPoint', "Agent stopping point"),
			'data-workflow-focus': 'stop',
		}));
		dom.append(this.handle, renderIcon(Codicon.gripper)).setAttribute('aria-hidden', 'true');
		this.label = dom.append(this.handle, dom.$('span'));
		this.confirmation = dom.append(this.domNode, dom.$('.workflow-stop-confirmation.workflow-stop-toolbar', { 'data-workflow-focus': 'stop' }));
		this.apply = this._register(new Action('workflow.applyStop', localize('workflow.apply', "Apply"), undefined, true, () => this.confirm()));
		this.cancel = this._register(new Action('workflow.cancelStop', localize('workflow.cancel', "Cancel"), undefined, true, async () => { this.cancelEdit(); }));
		this.confirmationToolbar = this._register(instantiationService.createInstance(WorkbenchToolBar, this.confirmation, {
			ariaLabel: localize('workflow.stopConfirmation', "Stopping point confirmation"),
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			icon: false, label: true,
		}));
		this.movement = dom.append(this.domNode, dom.$('.workflow-stop-movement.workflow-stop-toolbar', { 'data-workflow-focus': 'stop' }));
		this.up = this._register(new Action('workflow.moveStopUp', localize('workflow.moveStopUp', "Move Stopping Point Up"), ThemeIcon.asClassName(Codicon.chevronUp), true, async () => this.move(this.model.stopIndex - 1, true)));
		this.down = this._register(new Action('workflow.moveStopDown', localize('workflow.moveStopDown', "Move Stopping Point Down"), ThemeIcon.asClassName(Codicon.chevronDown), true, async () => this.move(this.model.stopIndex + 1, true)));
		const movementToolbar = this._register(instantiationService.createInstance(WorkbenchToolBar, this.movement, {
			ariaLabel: localize('workflow.stopMovement', "Move stopping point"),
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
		}));
		movementToolbar.setActions([this.up, this.down]);
		this.stop = this._register(new Action('workflow.stop', localize('workflow.stopWorkflow', "Stop Workflow"), ThemeIcon.asClassName(Codicon.debugStop), true, async () => {
			this.handle.focus({ preventScroll: true });
			await this.model.stopWorkflow();
		}));
		const showContextMenu = (anchor: HTMLElement | StandardMouseEvent) => contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => [this.stop],
			onHide: () => {
				if (!this._store.isDisposed) {
					this.handle.focus({ preventScroll: true });
				}
			},
		});
		this._register(dom.addDisposableListener(this.domNode, 'contextmenu', (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			hoverService.hideHover(true);
			showContextMenu(new StandardMouseEvent(dom.getWindow(this.domNode), event));
		}, true));
		this._register(hoverService.setupDelayedHover(this.handle, {
			content: localize('workflow.stopHover', "Drag the line, use its Up and Down actions, or press the arrow keys. Enter applies; Escape cancels. The line cannot move above completed checkpoints. Right-click for Stop Workflow to interrupt work without changing the stopping point."),
		}));
		this._register(dom.addDisposableListener(this.handle, 'keydown', (event: KeyboardEvent) => {
			const index = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? this.model.stopIndex - 1
				: event.key === 'ArrowDown' || event.key === 'ArrowRight' ? this.model.stopIndex + 1
					: event.key === 'Home' ? this.model.minimumStopIndex
						: event.key === 'End' ? this.rows.length - 1 : undefined;
			if (index !== undefined) {
				event.preventDefault();
				event.stopPropagation();
				this.move(index, true);
			} else if ((event.key === 'Enter' || event.key === ' ') && !this.confirmation.hidden) {
				event.preventDefault();
				event.stopPropagation();
				void this.confirm();
			}
		}));
		this._register(dom.addDisposableListener(this.domNode, 'keydown', (event: KeyboardEvent) => {
			if (event.key === 'Escape' && this.cancelEdit()) {
				event.preventDefault();
				event.stopPropagation();
			} else if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) {
				event.preventDefault();
				event.stopPropagation();
				showContextMenu(this.handle);
			}
		}, true));
		this._register(dom.addDisposableListener(this.domNode, 'pointerdown', (event: PointerEvent) => {
			if (event.button !== 0 || !this.model.canChangeStop
				|| (dom.isHTMLElement(event.target) && (this.confirmation.contains(event.target) || this.movement.contains(event.target)))) {
				return;
			}
			event.preventDefault();
			hoverService.hideHover(true);
			this.model.proposeStop(this.model.run.get().snapshot.checkpoints[this.model.stopIndex].id);
			this.handle.focus({ preventScroll: true });
			this.dragStartIndex = this.model.stopIndex;
			const origin = this.scrollContainer.getBoundingClientRect().top - this.scrollContainer.scrollTop;
			const initialY = this.domNode.getBoundingClientRect().top - origin + this.domNode.offsetHeight / 2;
			const slots = this.rows.map((row, index) => ({
				index, y: index === this.dragStartIndex ? initialY : row.getBoundingClientRect().bottom - origin,
			})).filter(slot => slot.index >= this.model.minimumStopIndex);
			let pointerY = event.clientY;
			const snap = () => {
				const y = pointerY - this.scrollContainer.getBoundingClientRect().top + this.scrollContainer.scrollTop;
				const nearest = slots.reduce((nearest, slot) => Math.abs(slot.y - y) < Math.abs(nearest.y - y) ? slot : nearest);
				this.domNode.style.transform = `translateY(${nearest.y - initialY}px)`;
				this.move(nearest.index);
			};
			const scroll = () => {
				const bounds = this.scrollContainer.getBoundingClientRect();
				const delta = pointerY < bounds.top + 32 ? -12 : pointerY > bounds.bottom - 32 ? 12 : 0;
				if (delta) {
					this.scrollContainer.scrollTop += delta;
					snap();
				}
				if (this.monitor.isMonitoring()) {
					this.scrollFrame.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(this.domNode), scroll);
				}
			};
			this.monitor.startMonitoring(this.scrollContainer, event.pointerId, event.buttons, moveEvent => {
				pointerY = moveEvent.clientY;
				snap();
			}, () => this.stopDrag(false));
			this.domNode.classList.add('dragging');
			this.update();
			this.scrollFrame.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(this.domNode), scroll);
		}));
		this._register(dom.addDisposableListener(this.scrollContainer, 'pointercancel', () => this.stopDrag(true)));
		this._register(dom.addDisposableListener(dom.getWindow(this.domNode), 'blur', () => this.stopDrag(true)));
		this._register(autorun(reader => {
			model.run.read(reader);
			model.proposedStopAfter.read(reader);
			model.busy.read(reader);
			this.update();
		}));
	}

	private update(): void {
		const run = this.model.run.get();
		const target = this.model.stopIndex;
		const proposed = !!this.model.proposedStopAfter.get();
		this.domNode.classList.toggle('proposed', proposed);
		this.domNode.classList.toggle('readonly', !this.model.canChangeStop);
		this.domNode.dataset.stopAfter = run.snapshot.checkpoints[target].id;
		this.handle.setAttribute('aria-valuemin', String(this.model.minimumStopIndex + 1));
		this.handle.setAttribute('aria-valuemax', String(this.rows.length));
		this.handle.setAttribute('aria-valuenow', String(target + 1));
		this.handle.setAttribute('aria-disabled', String(!this.model.canChangeStop));
		this.handle.setAttribute('aria-valuetext', localize('workflow.stopValue', "After {0}: {1}. {2}", target + 1, run.snapshot.checkpoints[target].label,
			proposed ? localize('workflow.stopUnapplied', "Not yet applied") : localize('workflow.stopConfirmed', "Confirmed stopping point")));
		this.label.textContent = proposed ? localize('workflow.proposedStopLine', "Proposed stop") : localize('workflow.confirmedStopLine', "Agent stops here");
		this.confirmation.hidden = this.monitor.isMonitoring() || (!proposed && !this.model.canContinue);
		const applyLabel = proposed ? localize('workflow.apply', "Apply") : localize('workflow.continue', "Continue");
		this.apply.label = applyLabel;
		this.apply.tooltip = applyLabel;
		this.apply.enabled = !this.model.busy.get();
		this.cancel.enabled = !this.model.busy.get();
		if (this.confirmationIncludesCancel !== proposed) {
			this.confirmationIncludesCancel = proposed;
			this.confirmationToolbar.setActions(proposed ? [this.apply, this.cancel] : [this.apply]);
		}
		this.movement.hidden = !this.model.canChangeStop;
		this.up.enabled = target > this.model.minimumStopIndex;
		this.down.enabled = target < this.rows.length - 1;
		this.stop.enabled = !this.model.busy.get() && (run.status === 'running' || run.status === 'waiting');
		if (!this.monitor.isMonitoring() && this.rows[target].nextElementSibling !== this.domNode) {
			this.rows[target].after(this.domNode);
		}
		for (const [index, row] of this.rows.entries()) {
			row.classList.toggle('proposed', proposed && index === target);
		}
		this.layout();
	}

	private move(index: number, reveal = false): void {
		if (!this.model.canChangeStop) {
			return;
		}
		const previous = this.model.stopIndex;
		const target = Math.max(this.model.minimumStopIndex, Math.min(this.rows.length - 1, index));
		this.model.proposeStop(this.model.run.get().snapshot.checkpoints[target].id);
		this.handle.focus({ preventScroll: true });
		if (reveal) {
			this.domNode.scrollIntoView({ block: 'nearest' });
		}
		if (previous !== target && !this.monitor.isMonitoring()) {
			status(localize('workflow.stopMoved', "Stop after {0}. Choose Apply or press Enter to confirm; Escape cancels.", this.model.run.get().snapshot.checkpoints[target].label));
		}
	}

	private async confirm(): Promise<void> {
		if (this.model.proposedStopAfter.get()) {
			await this.model.applyProposal();
		} else {
			await this.model.continueWorkflow();
		}
	}

	private cancelEdit(): boolean {
		if (this.monitor.isMonitoring()) {
			this.stopDrag(true);
			return true;
		}
		if (this.model.proposedStopAfter.get() && !this.model.busy.get()) {
			this.model.cancelProposal();
			this.handle.focus();
			return true;
		}
		return false;
	}

	private stopDrag(cancelled: boolean): void {
		if (!this.monitor.isMonitoring() && !this.domNode.classList.contains('dragging')) {
			return;
		}
		this.monitor.stopMonitoring(false);
		this.scrollFrame.clear();
		this.domNode.classList.remove('dragging');
		this.domNode.style.transform = '';
		if (cancelled) {
			this.move(this.dragStartIndex);
		}
		this.update();
		this.handle.focus({ preventScroll: true });
	}
}
