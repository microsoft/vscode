/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { SimpleIconLabel } from 'vs/base/browser/ui/iconLabel/simpleIconLabel';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStatusbarEntry, ShowTooltipCommand, StatusbarEntryKinds } from 'vs/workbench/services/statusbar/browser/statusbar';
import { WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification } from 'vs/base/common/actions';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ThemeColor } from 'vs/base/common/themables';
import { isThemeColor } from 'vs/editor/common/editorCommon';
import { addDisposableListener, EventType, hide, show, append, EventHelper } from 'vs/base/browser/dom';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { assertIsDefined } from 'vs/base/common/types';
import { Command } from 'vs/editor/common/languages';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { renderIcon, renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { spinningLoading, syncing } from 'vs/platform/theme/common/iconRegistry';
import { isMarkdownString, markdownStringEqual } from 'vs/base/common/htmlContent';
import { IHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegate';
import { Gesture, EventType as TouchEventType } from 'vs/base/browser/touch';
import type { IManagedHover } from 'vs/base/browser/ui/hover/hover';
import { IHoverService } from 'vs/platform/hover/browser/hover';

export class StatusbarEntryItem extends Disposable {

	private readonly label: StatusBarCodiconLabel;

	private entry: IStatusbarEntry | undefined = undefined;

	private readonly foregroundListener = this._register(new MutableDisposable());
	private readonly backgroundListener = this._register(new MutableDisposable());

	private readonly commandMouseListener = this._register(new MutableDisposable());
	private readonly commandTouchListener = this._register(new MutableDisposable());
	private readonly commandKeyboardListener = this._register(new MutableDisposable());
	private readonly focusListener = this._register(new MutableDisposable());
	private readonly focusOutListener = this._register(new MutableDisposable());

	private hover: IManagedHover | undefined = undefined;

	readonly labelContainer: HTMLElement;
	readonly beakContainer: HTMLElement;

	get name(): string {
		return assertIsDefined(this.entry).name;
	}

	get hasCommand(): boolean {
		return typeof this.entry?.command !== 'undefined';
	}

	constructor(
		private container: HTMLElement,
		entry: IStatusbarEntry,
		private readonly hoverDelegate: IHoverDelegate,
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService private readonly hoverService: IHoverService,
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IThemeService private readonly themeService: IThemeService
	) {
		super();

		// Label Container
		this.labelContainer = document.createElement('a');
		this.labelContainer.tabIndex = -1; // allows screen readers to read title, but still prevents tab focus.
		this.labelContainer.setAttribute('role', 'button');
		this.labelContainer.className = 'statusbar-item-label';
		this._register(Gesture.addTarget(this.labelContainer)); // enable touch

		// Label (with support for progress)
		this.label = this._register(new StatusBarCodiconLabel(this.labelContainer));
		this.container.appendChild(this.labelContainer);

		// Beak Container
		this.beakContainer = document.createElement('div');
		this.beakContainer.className = 'status-bar-item-beak-container';
		this.container.appendChild(this.beakContainer);

		this.update(entry);
	}

	update(entry: IStatusbarEntry): void {

		// Update: Progress
		this.label.showProgress = entry.showProgress ?? false;

		// Update: Text
		if (!this.entry || entry.text !== this.entry.text) {
			this.label.text = entry.text;

			if (entry.text) {
				show(this.labelContainer);
			} else {
				hide(this.labelContainer);
			}
		}

		// Update: ARIA label
		//
		// Set the aria label on both elements so screen readers would read
		// the correct thing without duplication #96210

		if (!this.entry || entry.ariaLabel !== this.entry.ariaLabel) {
			this.container.setAttribute('aria-label', entry.ariaLabel);
			this.labelContainer.setAttribute('aria-label', entry.ariaLabel);
		}

		if (!this.entry || entry.role !== this.entry.role) {
			this.labelContainer.setAttribute('role', entry.role || 'button');
		}

		// Update: Hover
		if (!this.entry || !this.isEqualTooltip(this.entry, entry)) {
			const hoverContents = isMarkdownString(entry.tooltip) ? { markdown: entry.tooltip, markdownNotSupportedFallback: undefined } : entry.tooltip;
			if (this.hover) {
				this.hover.update(hoverContents);
			} else {
				this.hover = this._register(this.hoverService.setupManagedHover(this.hoverDelegate, this.container, hoverContents));
			}
			if (entry.command !== ShowTooltipCommand /* prevents flicker on click */) {
				this.focusListener.value = addDisposableListener(this.labelContainer, EventType.FOCUS, e => {
					EventHelper.stop(e);
					this.hover?.show(false);
				});
				this.focusOutListener.value = addDisposableListener(this.labelContainer, EventType.FOCUS_OUT, e => {
					EventHelper.stop(e);
					this.hover?.hide();
				});
			}
		}

		// Update: Command
		if (!this.entry || entry.command !== this.entry.command) {
			this.commandMouseListener.clear();
			this.commandTouchListener.clear();
			this.commandKeyboardListener.clear();

			const command = entry.command;
			if (command && (command !== ShowTooltipCommand || this.hover) /* "Show Hover" is only valid when we have a hover */) {
				this.commandMouseListener.value = addDisposableListener(this.labelContainer, EventType.CLICK, () => this.executeCommand(command));
				this.commandTouchListener.value = addDisposableListener(this.labelContainer, TouchEventType.Tap, () => this.executeCommand(command));
				this.commandKeyboardListener.value = addDisposableListener(this.labelContainer, EventType.KEY_DOWN, e => {
					const event = new StandardKeyboardEvent(e);
					if (event.equals(KeyCode.Space) || event.equals(KeyCode.Enter)) {
						EventHelper.stop(e);

						this.executeCommand(command);
					} else if (event.equals(KeyCode.Escape) || event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.RightArrow)) {
						EventHelper.stop(e);

						this.hover?.hide();
					}
				});

				this.labelContainer.classList.remove('disabled');
			} else {
				this.labelContainer.classList.add('disabled');
			}
		}

		// Update: Beak
		if (!this.entry || entry.showBeak !== this.entry.showBeak) {
			if (entry.showBeak) {
				this.container.classList.add('has-beak');
			} else {
				this.container.classList.remove('has-beak');
			}
		}

		const hasBackgroundColor = !!entry.backgroundColor || (entry.kind && entry.kind !== 'standard');

		// Update: Kind
		if (!this.entry || entry.kind !== this.entry.kind) {
			for (const kind of StatusbarEntryKinds) {
				this.container.classList.remove(`${kind}-kind`);
			}

			if (entry.kind && entry.kind !== 'standard') {
				this.container.classList.add(`${entry.kind}-kind`);
			}

			this.container.classList.toggle('has-background-color', hasBackgroundColor);
		}

		// Update: Foreground
		if (!this.entry || entry.color !== this.entry.color) {
			this.applyColor(this.labelContainer, entry.color);
		}

		// Update: Background
		if (!this.entry || entry.backgroundColor !== this.entry.backgroundColor) {
			this.container.classList.toggle('has-background-color', hasBackgroundColor);
			this.applyColor(this.container, entry.backgroundColor, true);
		}

		// Remember for next round
		this.entry = entry;
	}

	private isEqualTooltip({ tooltip }: IStatusbarEntry, { tooltip: otherTooltip }: IStatusbarEntry) {
		if (tooltip === undefined) {
			return otherTooltip === undefined;
		}

		if (isMarkdownString(tooltip)) {
			return isMarkdownString(otherTooltip) && markdownStringEqual(tooltip, otherTooltip);
		}

		return tooltip === otherTooltip;
	}

	private async executeCommand(command: string | Command): Promise<void> {

		// Custom command from us: Show tooltip
		if (command === ShowTooltipCommand) {
			this.hover?.show(true /* focus */);
		}

		// Any other command is going through command service
		else {
			const id = typeof command === 'string' ? command : command.id;
			const args = typeof command === 'string' ? [] : command.arguments ?? [];

			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id, from: 'status bar' });
			try {
				await this.commandService.executeCommand(id, ...args);
			} catch (error) {
				this.notificationService.error(toErrorMessage(error));
			}
		}
	}

	private applyColor(container: HTMLElement, color: string | ThemeColor | undefined, isBackground?: boolean): void {
		let colorResult: string | undefined = undefined;

		if (isBackground) {
			this.backgroundListener.clear();
		} else {
			this.foregroundListener.clear();
		}

		if (color) {
			if (isThemeColor(color)) {
				colorResult = this.themeService.getColorTheme().getColor(color.id)?.toString();

				const listener = this.themeService.onDidColorThemeChange(theme => {
					const colorValue = theme.getColor(color.id)?.toString();

					if (isBackground) {
						container.style.backgroundColor = colorValue ?? '';
					} else {
						container.style.color = colorValue ?? '';
					}
				});

				if (isBackground) {
					this.backgroundListener.value = listener;
				} else {
					this.foregroundListener.value = listener;
				}
			} else {
				colorResult = color;
			}
		}

		if (isBackground) {
			container.style.backgroundColor = colorResult ?? '';
		} else {
			container.style.color = colorResult ?? '';
		}
	}
}

class StatusBarCodiconLabel extends SimpleIconLabel {

	private progressCodicon = renderIcon(syncing);

	private currentText = '';
	private currentShowProgress: boolean | 'loading' | 'syncing' = false;

	constructor(
		private readonly container: HTMLElement
	) {
		super(container);
	}

	set showProgress(showProgress: boolean | 'loading' | 'syncing') {
		if (this.currentShowProgress !== showProgress) {
			this.currentShowProgress = showProgress;
			this.progressCodicon = renderIcon(showProgress === 'syncing' ? syncing : spinningLoading);
			this.text = this.currentText;
		}
	}

	override set text(text: string) {

		// Progress: insert progress codicon as first element as needed
		// but keep it stable so that the animation does not reset
		if (this.currentShowProgress) {

			// Append as needed
			if (this.container.firstChild !== this.progressCodicon) {
				this.container.appendChild(this.progressCodicon);
			}

			// Remove others
			for (const node of Array.from(this.container.childNodes)) {
				if (node !== this.progressCodicon) {
					node.remove();
				}
			}

			// If we have text to show, add a space to separate from progress
			let textContent = text ?? '';
			if (textContent) {
				textContent = ` ${textContent}`;
			}

			// Append new elements
			append(this.container, ...renderLabelWithIcons(textContent));
		}

		// No Progress: no special handling
		else {
			super.text = text;
		}
	}
}
