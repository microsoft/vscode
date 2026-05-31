/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from '../../../common/contributions.js';
import { Disposable, DisposableStore, IDisposable, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { IFilesConfigurationService, AutoSaveMode, AutoSaveDisabledReason } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { SaveReason, IEditorIdentifier, GroupIdentifier, EditorInputCapabilities } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
import { IWorkingCopy, WorkingCopyCapabilities } from '../../../services/workingCopy/common/workingCopy.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMarkerService } from '../../../../platform/markers/common/markers.js';
import { URI } from '../../../../base/common/uri.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';

export class EditorAutoSave extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.editorAutoSave';

	// Auto save: after delay
	private readonly scheduledAutoSavesAfterDelay = new Map<IWorkingCopy, IDisposable>();

	// Auto save: focus change & window change
	private lastActiveEditor: EditorInput | undefined = undefined;
	private lastActiveGroupId: GroupIdentifier | undefined = undefined;
	private readonly lastActiveEditorControlDisposable = this._register(new DisposableStore());

	// Auto save: waiting on specific condition
	private readonly waitingOnConditionAutoSaveWorkingCopies = new ResourceMap<{ readonly workingCopy: IWorkingCopy; readonly reason: SaveReason; condition: AutoSaveDisabledReason }>(resource => this.uriIdentityService.extUri.getComparisonKey(resource));
	private readonly waitingOnConditionAutoSaveEditors = new ResourceMap<{ readonly editor: IEditorIdentifier; readonly reason: SaveReason; condition: AutoSaveDisabledReason }>(resource => this.uriIdentityService.extUri.getComparisonKey(resource));

	constructor(
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IHostService private readonly hostService: IHostService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@ILogService private readonly logService: ILogService,
		@IMarkerService private readonly markerService: IMarkerService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService
	) {
		super();

		// Fill in initial dirty working copies
		for (const dirtyWorkingCopy of this.workingCopyService.dirtyWorkingCopies) {
			this.onDidRegister(dirtyWorkingCopy);
		}

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.hostService.onDidChangeFocus(focused => this.onWindowFocusChange(focused)));
		this._register(this.hostService.onDidChangeActiveWindow(() => this.onActiveWindowChange()));
		this._register(this.editorService.onDidActiveEditorChange(() => this.onDidActiveEditorChange()));
		this._register(this.filesConfigurationService.onDidChangeAutoSaveConfiguration(() => this.onDidChangeAutoSaveConfiguration()));

		// Working Copy events
		this._register(this.workingCopyService.onDidRegister(workingCopy => this.onDidRegister(workingCopy)));
		this._register(this.workingCopyService.onDidUnregister(workingCopy => this.onDidUnregister(workingCopy)));
		this._register(this.workingCopyService.onDidChangeDirty(workingCopy => this.onDidChangeDirty(workingCopy)));
		this._register(this.workingCopyService.onDidChangeContent(workingCopy => this.onDidChangeContent(workingCopy)));

		// Condition changes
		this._register(this.markerService.onMarkerChanged(e => this.onConditionChanged(e, AutoSaveDisabledReason.ERRORS)));
		this._register(this.filesConfigurationService.onDidChangeAutoSaveDisabled(resource => this.onConditionChanged([resource], AutoSaveDisabledReason.DISABLED)));
	}

	private onConditionChanged(resources: readonly URI[], condition: AutoSaveDisabledReason.ERRORS | AutoSaveDisabledReason.DISABLED): void {
		for (const resource of resources) {

			// Waiting working copies
			const workingCopyResult = this.waitingOnConditionAutoSaveWorkingCopies.get(resource);
			if (workingCopyResult?.condition === condition) {
				if (
					workingCopyResult.workingCopy.isDirty() &&
					this.filesConfigurationService.getAutoSaveMode(workingCopyResult.workingCopy.resource, workingCopyResult.reason).mode !== AutoSaveMode.OFF
				) {
					this.discardAutoSave(workingCopyResult.workingCopy);

					this.logService.trace(`[editor auto save] running auto save from condition change event`, workingCopyResult.workingCopy.resource.toString(), workingCopyResult.workingCopy.typeId);
					workingCopyResult.workingCopy.save({ reason: workingCopyResult.reason });
				}
			}

			// Waiting editors
			else {
				const editorResult = this.waitingOnConditionAutoSaveEditors.get(resource);
				if (
					editorResult?.condition === condition &&
					!editorResult.editor.editor.isDisposed() &&
					editorResult.editor.editor.isDirty() &&
					this.filesConfigurationService.getAutoSaveMode(editorResult.editor.editor, editorResult.reason).mode !== AutoSaveMode.OFF
				) {
					this.waitingOnConditionAutoSaveEditors.delete(resource);

					this.logService.trace(`[editor auto save] running auto save from condition change event with reason ${editorResult.reason}`);
					this.editorService.save(editorResult.editor, { reason: editorResult.reason });
				}
			}
		}
	}

	private onWindowFocusChange(focused: boolean): void {
		if (!focused) {
			this.maybeTriggerAutoSave(SaveReason.WINDOW_CHANGE);
		}
	}

	private onActiveWindowChange(): void {
		this.maybeTriggerAutoSave(SaveReason.WINDOW_CHANGE);
	}

	private onDidActiveEditorChange(): void {

		// Treat editor change like a focus change for our last active editor if any
		if (this.lastActiveEditor && typeof this.lastActiveGroupId === 'number') {
			this.maybeTriggerAutoSave(SaveReason.FOCUS_CHANGE, { groupId: this.lastActiveGroupId, editor: this.lastActiveEditor });
		}

		// Remember as last active
		const activeGroup = this.editorGroupService.activeGroup;
		const activeEditor = this.lastActiveEditor = activeGroup.activeEditor ?? undefined;
		this.lastActiveGroupId = activeGroup.id;

		// Dispose previous active control listeners
		this.lastActiveEditorControlDisposable.clear();

		// Listen to focus changes on control for auto save
		const activeEditorPane = this.editorService.activeEditorPane;
		if (activeEditor && activeEditorPane) {
			this.lastActiveEditorControlDisposable.add(activeEditorPane.onDidBlur(() => {
				this.maybeTriggerAutoSave(SaveReason.FOCUS_CHANGE, { groupId: activeGroup.id, editor: activeEditor });
			}));
		}
	}

	private maybeTriggerAutoSave(reason: SaveReason.WINDOW_CHANGE | SaveReason.FOCUS_CHANGE, editorIdentifier?: IEditorIdentifier): void {
		if (editorIdentifier) {
			if (
				!editorIdentifier.editor.isDirty() ||
				editorIdentifier.editor.isReadonly() ||
				editorIdentifier.editor.hasCapability(EditorInputCapabilities.Untitled)
			) {
				return; // no auto save for non-dirty, readonly or untitled editors
			}

			const autoSaveMode = this.filesConfigurationService.getAutoSaveMode(editorIdentifier.editor, reason);
			if (autoSaveMode.mode !== AutoSaveMode.OFF) {
				// Determine if we need to save all. In case of a window focus change we also save if
				// auto save mode is configured to be ON_FOCUS_CHANGE (editor focus change)
				if (
					(reason === SaveReason.WINDOW_CHANGE && (autoSaveMode.mode === AutoSaveMode.ON_FOCUS_CHANGE || autoSaveMode.mode === AutoSaveMode.ON_WINDOW_CHANGE)) ||
					(reason === SaveReason.FOCUS_CHANGE && autoSaveMode.mode === AutoSaveMode.ON_FOCUS_CHANGE)
				) {
					this.logService.trace(`[editor auto save] triggering auto save with reason ${reason}`);
					this.editorService.save(editorIdentifier, { reason });
				}
			} else if (editorIdentifier.editor.resource && (autoSaveMode.reason === AutoSaveDisabledReason.ERRORS || autoSaveMode.reason === AutoSaveDisabledReason.DISABLED)) {
				this.waitingOnConditionAutoSaveEditors.set(editorIdentifier.editor.resource, { editor: editorIdentifier, reason, condition: autoSaveMode.reason });
			}
		} else {
			this.saveAllDirtyAutoSaveables(reason);
		}
	}

	private onDidChangeAutoSaveConfiguration(): void {

		// Trigger a save-all when auto save is enabled
		let reason: SaveReason | undefined = undefined;
		switch (this.filesConfigurationService.getAutoSaveMode(undefined).mode) {
			case AutoSaveMode.ON_FOCUS_CHANGE:
				reason = SaveReason.FOCUS_CHANGE;
				break;
			case AutoSaveMode.ON_WINDOW_CHANGE:
				reason = SaveReason.WINDOW_CHANGE;
				break;
			case AutoSaveMode.AFTER_SHORT_DELAY:
			case AutoSaveMode.AFTER_LONG_DELAY:
				reason = SaveReason.AUTO;
				break;
		}

		if (reason) {
			this.saveAllDirtyAutoSaveables(reason);
		}
	}

	private saveAllDirtyAutoSaveables(reason: SaveReason): void {
		for (const workingCopy of this.workingCopyService.dirtyWorkingCopies) {
			if (workingCopy.capabilities & WorkingCopyCapabilities.Untitled) {
				continue; // we never auto save untitled working copies
			}

			const autoSaveMode = this.filesConfigurationService.getAutoSaveMode(workingCopy.resource, reason);
			if (autoSaveMode.mode !== AutoSaveMode.OFF) {
				workingCopy.save({ reason });
			} else if (autoSaveMode.reason === AutoSaveDisabledReason.ERRORS || autoSaveMode.reason === AutoSaveDisabledReason.DISABLED) {
				this.waitingOnConditionAutoSaveWorkingCopies.set(workingCopy.resource, { workingCopy, reason, condition: autoSaveMode.reason });
			}
		}
	}

	private onDidRegister(workingCopy: IWorkingCopy): void {
		if (workingCopy.isDirty()) {
			this.scheduleAutoSave(workingCopy);
		}
	}

	private onDidUnregister(workingCopy: IWorkingCopy): void {
		this.discardAutoSave(workingCopy);
	}

	private onDidChangeDirty(workingCopy: IWorkingCopy): void {
		if (workingCopy.isDirty()) {
			this.scheduleAutoSave(workingCopy);
		} else {
			this.discardAutoSave(workingCopy);
		}
	}

	private onDidChangeContent(workingCopy: IWorkingCopy): void {
		if (workingCopy.isDirty()) {
			// this listener will make sure that the auto save is
			// pushed out for as long as the user is still changing
			// the content of the working copy.
			this.scheduleAutoSave(workingCopy);
		}
	}

	private scheduleAutoSave(workingCopy: IWorkingCopy): void {
		if (workingCopy.capabilities & WorkingCopyCapabilities.Untitled) {
			return; // we never auto save untitled working copies
		}

		const autoSaveAfterDelay = this.filesConfigurationService.getAutoSaveConfiguration(workingCopy.resource).autoSaveDelay;
		if (typeof autoSaveAfterDelay !== 'number') {
			return; // auto save after delay must be enabled
		}

		// Clear any running auto save operation
		this.discardAutoSave(workingCopy);

		this.logService.trace(`[editor auto save] scheduling auto save after ${autoSaveAfterDelay}ms`, workingCopy.resource.toString(), workingCopy.typeId);

		// Schedule new auto save
		const handle = setTimeout(() => {

			// Clear pending
			this.discardAutoSave(workingCopy);

			// Save if dirty and unless prevented by other conditions such as error markers
			if (workingCopy.isDirty()) {
				const reason = SaveReason.AUTO;
				const autoSaveMode = this.filesConfigurationService.getAutoSaveMode(workingCopy.resource, reason);
				if (autoSaveMode.mode !== AutoSaveMode.OFF) {
					this.logService.trace(`[editor auto save] running auto save`, workingCopy.resource.toString(), workingCopy.typeId);
					workingCopy.save({ reason });
				} else if (autoSaveMode.reason === AutoSaveDisabledReason.ERRORS || autoSaveMode.reason === AutoSaveDisabledReason.DISABLED) {
					this.waitingOnConditionAutoSaveWorkingCopies.set(workingCopy.resource, { workingCopy, reason, condition: autoSaveMode.reason });
				}
			}
		}, autoSaveAfterDelay);

		// Keep in map for disposal as needed
		this.scheduledAutoSavesAfterDelay.set(workingCopy, toDisposable(() => {
			this.logService.trace(`[editor auto save] clearing pending auto save`, workingCopy.resource.toString(), workingCopy.typeId);

			clearTimeout(handle);
		}));
	}

	private discardAutoSave(workingCopy: IWorkingCopy): void {
		dispose(this.scheduledAutoSavesAfterDelay.get(workingCopy));
		this.scheduledAutoSavesAfterDelay.delete(workingCopy);

		this.waitingOnConditionAutoSaveWorkingCopies.delete(workingCopy.resource);
		this.waitingOnConditionAutoSaveEditors.delete(workingCopy.resource);
	}
}
