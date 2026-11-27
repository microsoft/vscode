/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { DataTransfers } from '../../../../base/browser/dnd.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { basename } from '../../../../base/common/resources.js';
import Severity from '../../../../base/common/severity.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { CodeDataTransfers, containsDragType, extractEditorsDropData } from '../../../../platform/dnd/browser/dnd.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { AUTOMATION_BLUEPRINT_FILE_SUFFIX } from '../../../../workbench/contrib/chat/common/automations/automationBlueprint.js';
import { IAutomationDialogService } from '../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { AutomationCommands, importAutomationBlueprint, isAutomationBlueprintResource } from './automationCommands.js';
import './media/automationImportDropTarget.css';

const $ = DOM.$;

/**
 * What a drop would do, as far as a drag can tell while it hovers. Chromium hides a drag's files and data until
 * `drop`, but exposes its transfer types and the kind and MIME type of each item.
 */
type AutomationDragFeedback =
	| { readonly kind: 'ignore' }
	| { readonly kind: 'accept' }
	| { readonly kind: 'reject'; readonly reason: 'multiple'; readonly count: number }
	| { readonly kind: 'reject'; readonly reason: 'unsupportedType' };

/** What a drop carries, read once Chromium exposes its files and data. */
type AutomationDropData =
	| { readonly kind: 'resource'; readonly resource: URI }
	| { readonly kind: 'file'; readonly file: File }
	| { readonly kind: 'invalid'; readonly reason: 'multiple' }
	| { readonly kind: 'invalid'; readonly reason: 'unsupported'; readonly name: string | undefined }
	| { readonly kind: 'none' };

const IGNORE: AutomationDragFeedback = { kind: 'ignore' };

/**
 * Decides from what a hovering drag exposes whether a drop could import an automation file. A file whose MIME type
 * is empty counts as text, since some platforms report no type for Markdown; the file name is checked on drop.
 */
function getAutomationDragFeedback(event: DragEvent): AutomationDragFeedback {
	const fileTypes: string[] = [];
	const items = event.dataTransfer?.items;
	for (let index = 0; items && index < items.length; index++) {
		if (items[index].kind === 'file') {
			fileTypes.push(items[index].type);
		}
	}
	if (fileTypes.length > 1) {
		return { kind: 'reject', reason: 'multiple', count: fileTypes.length };
	}
	if (fileTypes.length === 1) {
		return fileTypes[0] === '' || fileTypes[0].startsWith('text/') ? { kind: 'accept' } : { kind: 'reject', reason: 'unsupportedType' };
	}
	return containsDragType(event, DataTransfers.RESOURCES, CodeDataTransfers.FILES, CodeDataTransfers.EDITORS) ? { kind: 'accept' } : IGNORE;
}

/** Reads the automation file a drop carries. Only valid during `drop`, the one event whose files and data are readable. */
function getAutomationDropData(event: DragEvent): AutomationDropData {
	const editors = extractEditorsDropData(event);
	if (editors.length > 1) {
		return { kind: 'invalid', reason: 'multiple' };
	}
	if (editors.length === 1) {
		const resource = editors[0].resource;
		if (!resource) {
			return { kind: 'invalid', reason: 'unsupported', name: undefined };
		}
		return isAutomationBlueprintResource(resource)
			? { kind: 'resource', resource }
			: { kind: 'invalid', reason: 'unsupported', name: basename(resource) };
	}

	const files = event.dataTransfer?.files;
	if (!files?.length) {
		return { kind: 'none' };
	}
	if (files.length > 1) {
		return { kind: 'invalid', reason: 'multiple' };
	}
	const file = files[0];
	return file.name.toLowerCase().endsWith(AUTOMATION_BLUEPRINT_FILE_SUFFIX)
		? { kind: 'file', file }
		: { kind: 'invalid', reason: 'unsupported', name: file.name };
}

/**
 * Makes `root` accept a dropped automation file. While a drag hovers, an overlay says whether a drop would import it;
 * a drop opens the same review flow as Import Automation.
 */
export class AutomationImportDropTarget extends Disposable {

	private readonly overlay: HTMLElement;
	private readonly label: HTMLElement;
	private feedback: AutomationDragFeedback = IGNORE;

	constructor(
		private readonly root: HTMLElement,
		@IAutomationDialogService private readonly automationDialogService: IAutomationDialogService,
		@IAutomationService private readonly automationService: IAutomationService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		root.classList.add('automation-import-drop-target');
		this.overlay = DOM.append(root, $('.automation-import-drop-overlay'));
		this.label = DOM.append(this.overlay, $('span.drop-overlay-label', { role: 'status', 'aria-live': 'polite' }));
		this._register(toDisposable(() => {
			this.overlay.remove();
			root.classList.remove('automation-import-drop-target');
		}));
		this._register(new DOM.DragAndDropObserver(root, {
			onDragEnter: event => this.onDragOver(event),
			onDragOver: event => this.onDragOver(event),
			onDragLeave: () => this.render(IGNORE),
			onDragEnd: () => this.render(IGNORE),
			onDrop: event => this.onDrop(event),
		}));
	}

	private onDragOver(event: DragEvent): void {
		const feedback = getAutomationDragFeedback(event);
		if (feedback.kind !== 'ignore' && event.dataTransfer) {
			event.dataTransfer.dropEffect = feedback.kind === 'accept' ? 'copy' : 'none';
		}
		// The overlay covers the root's visible box, which moves when the root itself scrolls (the narrow modal does).
		this.overlay.style.transform = this.root.scrollTop || this.root.scrollLeft ? `translate(${this.root.scrollLeft}px, ${this.root.scrollTop}px)` : '';
		this.render(feedback);
	}

	/** Renders only changes, so that the label's live region announces each change once. */
	private render(feedback: AutomationDragFeedback): void {
		if (equals(feedback, this.feedback)) {
			return;
		}
		this.feedback = feedback;
		this.overlay.classList.toggle('visible', feedback.kind !== 'ignore');
		this.overlay.classList.toggle('accept', feedback.kind === 'accept');
		this.overlay.classList.toggle('reject', feedback.kind === 'reject');
		switch (feedback.kind) {
			case 'ignore':
				DOM.clearNode(this.label);
				break;
			case 'accept':
				this.renderLabel(Codicon.cloudUploadCompact, localize('automationDragAccept', "Import Automation File"));
				break;
			case 'reject':
				this.renderLabel(Codicon.errorCompact, feedback.reason === 'multiple'
					? localize('automationDragMultiple', "Can't import {0} files. Drop one at a time.", feedback.count)
					: localize('automationDragUnsupportedType', "Can't import this file. Only .automation.md files can be imported."));
				break;
		}
	}

	private renderLabel(icon: ThemeIcon, text: string): void {
		const iconElement = renderIcon(icon);
		iconElement.classList.add('automation-import-drop-icon');
		iconElement.setAttribute('aria-hidden', 'true');
		DOM.reset(this.label, iconElement, $('span.automation-import-drop-text', undefined, text));
	}

	private onDrop(event: DragEvent): void {
		this.render(IGNORE);
		const dropData = getAutomationDropData(event);
		if (dropData.kind === 'none') {
			return;
		}
		DOM.EventHelper.stop(event, true);
		if (dropData.kind === 'invalid') {
			this.notifyInvalidDrop(dropData);
			return;
		}
		const readContent = dropData.kind === 'resource'
			? async () => (await this.fileService.readFile(dropData.resource)).value.toString()
			: async () => VSBuffer.wrap(new Uint8Array(await dropData.file.arrayBuffer())).toString();
		void importAutomationBlueprint(
			readContent,
			this.automationDialogService,
			this.automationService,
			this.configurationService,
			this.dialogService,
			this.logService,
			this.telemetryService,
		);
	}

	private notifyInvalidDrop(dropData: Extract<AutomationDropData, { kind: 'invalid' }>): void {
		const message = dropData.reason === 'multiple'
			? localize('automationDropMultiple', "Drop one automation file at a time.")
			: dropData.name !== undefined
				? localize('automationDropNotAutomationFile', "{0} isn't an automation file. Only .automation.md files can be imported.", dropData.name)
				: localize('automationDropUnsupported', "Only .automation.md files can be imported.");
		this.notificationService.prompt(Severity.Error, message, [{
			label: localize('automationDropImport', "Import Automation..."),
			run: () => { void this.commandService.executeCommand(AutomationCommands.import.id); },
		}]);
	}
}
