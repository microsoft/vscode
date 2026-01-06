/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { CachedFunction } from '../../../../base/common/cache.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, mapObservableArrayCached, derived, IObservable, ISettableObservable, observableValue, derivedWithSetter, observableSignalFromEvent, observableFromEvent } from '../../../../base/common/observable.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { DynamicCssRules } from '../../../../editor/browser/editorDom.js';
import { observableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IModelDeltaDecoration } from '../../../../editor/common/model.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { EditorResourceAccessor } from '../../../common/editor.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { EditSource } from './documentWithAnnotatedEdits.js';
import { EditSourceTrackingImpl } from './editSourceTrackingImpl.js';
import { EDIT_TELEMETRY_DETAILS_SETTING_ID, EDIT_TELEMETRY_SHOW_DECORATIONS, EDIT_TELEMETRY_SHOW_STATUS_BAR } from './settings.js';
import { VSCodeWorkspace } from './vscodeObservableWorkspace.js';

export class EditTrackingFeature extends Disposable {

	private readonly _editSourceTrackingShowDecorations;
	private readonly _editSourceTrackingShowStatusBar;
	private readonly _editSourceDetailsEnabled;
	private readonly _showStateInMarkdownDoc = 'editTelemetry.showDebugDetails';
	private readonly _toggleDecorations = 'editTelemetry.toggleDebugDecorations';

	constructor(
		private readonly _workspace: VSCodeWorkspace,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStatusbarService private readonly _statusbarService: IStatusbarService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super();

		this._editSourceTrackingShowDecorations = makeSettable(observableConfigValue(EDIT_TELEMETRY_SHOW_DECORATIONS, false, this._configurationService));
		this._editSourceTrackingShowStatusBar = observableConfigValue(EDIT_TELEMETRY_SHOW_STATUS_BAR, false, this._configurationService);
		this._editSourceDetailsEnabled = observableConfigValue(EDIT_TELEMETRY_DETAILS_SETTING_ID, false, this._configurationService);

		const onDidAddGroupSignal = observableSignalFromEvent(this, this._editorGroupsService.onDidAddGroup);
		const onDidRemoveGroupSignal = observableSignalFromEvent(this, this._editorGroupsService.onDidRemoveGroup);
		const groups = derived(this, reader => {
			onDidAddGroupSignal.read(reader);
			onDidRemoveGroupSignal.read(reader);
			return this._editorGroupsService.groups;
		});
		const visibleUris: IObservable<Map<string, URI>> = mapObservableArrayCached(this, groups, g => {
			const editors = observableFromEvent(this, g.onDidModelChange, () => g.editors);
			return editors.map(e => e.map(editor => EditorResourceAccessor.getCanonicalUri(editor)));
		}).map((editors, reader) => {
			const map = new Map<string, URI>();
			for (const urisObs of editors) {
				for (const uri of urisObs.read(reader)) {
					if (isDefined(uri)) {
						map.set(uri.toString(), uri);
					}
				}
			}
			return map;
		});

		const impl = this._register(this._instantiationService.createInstance(EditSourceTrackingImpl, this._workspace, (doc, reader) => {
			const map = visibleUris.read(reader);
			return map.get(doc.uri.toString()) !== undefined;
		}, this._editSourceDetailsEnabled));

		this._register(autorun((reader) => {
			if (!this._editSourceTrackingShowDecorations.read(reader)) {
				return;
			}

			const visibleEditors = observableFromEvent(this, this._editorService.onDidVisibleEditorsChange, () => this._editorService.visibleTextEditorControls);

			mapObservableArrayCached(this, visibleEditors, (editor, store) => {
				if (editor instanceof CodeEditorWidget) {
					const obsEditor = observableCodeEditor(editor);

					const cssStyles = new DynamicCssRules(editor);
					const decorations = new CachedFunction((source: EditSource) => {
						const r = store.add(cssStyles.createClassNameRef({
							backgroundColor: source.getColor(),
						}));
						return r.className;
					});

					store.add(obsEditor.setDecorations(derived(reader => {
						const uri = obsEditor.model.read(reader)?.uri;
						if (!uri) { return []; }
						const doc = this._workspace.getDocument(uri);
						if (!doc) { return []; }
						const docsState = impl.docsState.read(reader).get(doc);
						if (!docsState) { return []; }

						const ranges = (docsState.longtermTracker.read(reader)?.getTrackedRanges(reader)) ?? [];

						return ranges.map<IModelDeltaDecoration>(r => ({
							range: doc.value.get().getTransformer().getRange(r.range),
							options: {
								description: 'editSourceTracking',
								inlineClassName: decorations.get(r.source),
							}
						}));
					})));
				}
			}).recomputeInitiallyAndOnChange(reader.store);
		}));

		this._register(autorun(reader => {
			if (!this._editSourceTrackingShowStatusBar.read(reader)) {
				return;
			}

			const statusBarItem = reader.store.add(this._statusbarService.addEntry(
				{
					name: '',
					text: '',
					command: this._showStateInMarkdownDoc,
					tooltip: 'Edit Source Tracking',
					ariaLabel: '',
				},
				'editTelemetry',
				StatusbarAlignment.RIGHT,
				100
			));

			const sumChangedCharacters = derived(reader => {
				const docs = impl.docsState.read(reader);
				let sum = 0;
				for (const state of docs.values()) {
					const t = state.longtermTracker.read(reader);
					if (!t) { continue; }
					const d = state.getTelemetryData(t.getTrackedRanges(reader));
					sum += d.totalModifiedCharactersInFinalState;
				}
				return sum;
			});

			const tooltipMarkdownString = derived(reader => {
				const docs = impl.docsState.read(reader);
				const docsDataInTooltip: string[] = [];
				const editSources: EditSource[] = [];
				for (const [doc, state] of docs) {
					const tracker = state.longtermTracker.read(reader);
					if (!tracker) {
						continue;
					}
					const trackedRanges = tracker.getTrackedRanges(reader);
					const data = state.getTelemetryData(trackedRanges);
					if (data.totalModifiedCharactersInFinalState === 0) {
						continue; // Don't include unmodified documents in tooltip
					}

					editSources.push(...trackedRanges.map(r => r.source));

					// Filter out unmodified properties as these are not interesting to see in the hover
					const filteredData = Object.fromEntries(
						Object.entries(data).filter(([_, value]) => !(typeof value === 'number') || value !== 0)
					);

					docsDataInTooltip.push([
						`### ${doc.uri.fsPath}`,
						'```json',
						JSON.stringify(filteredData, undefined, '\t'),
						'```',
						'\n'
					].join('\n'));
				}

				let tooltipContent: string;
				if (docsDataInTooltip.length === 0) {
					tooltipContent = 'No modified documents';
				} else if (docsDataInTooltip.length <= 3) {
					tooltipContent = docsDataInTooltip.join('\n\n');
				} else {
					const lastThree = docsDataInTooltip.slice(-3);
					tooltipContent = '...\n\n' + lastThree.join('\n\n');
				}

				const agenda = this._createEditSourceAgenda(editSources);

				const tooltipWithCommand = new MarkdownString(tooltipContent + '\n\n[View Details](command:' + this._showStateInMarkdownDoc + ')');
				tooltipWithCommand.appendMarkdown('\n\n' + agenda + '\n\nToggle decorations: [Click here](command:' + this._toggleDecorations + ')');
				tooltipWithCommand.isTrusted = { enabledCommands: [this._toggleDecorations] };
				tooltipWithCommand.supportHtml = true;

				return tooltipWithCommand;
			});

			reader.store.add(autorun(reader => {
				statusBarItem.update({
					name: 'editTelemetry',
					text: `$(edit) ${sumChangedCharacters.read(reader)} chars inserted`,
					ariaLabel: `Edit Source Tracking: ${sumChangedCharacters.read(reader)} modified characters`,
					tooltip: tooltipMarkdownString.read(reader),
					command: this._showStateInMarkdownDoc,
				});
			}));

			reader.store.add(CommandsRegistry.registerCommand(this._toggleDecorations, () => {
				this._editSourceTrackingShowDecorations.set(!this._editSourceTrackingShowDecorations.get(), undefined);
			}));
		}));
	}

	private _createEditSourceAgenda(editSources: EditSource[]): string {
		// Collect all edit sources from the tracked documents
		const editSourcesSeen = new Set<string>();
		const editSourceInfo = [];
		for (const editSource of editSources) {
			if (!editSourcesSeen.has(editSource.toString())) {
				editSourcesSeen.add(editSource.toString());
				editSourceInfo.push({ name: editSource.toString(), color: editSource.getColor() });
			}
		}

		const agendaItems = editSourceInfo.map(info =>
			`<span style="background-color:${info.color};border-radius:3px;">${info.name}</span>`
		);

		return agendaItems.join(' ');
	}
}

export function makeSettable<T>(obs: IObservable<T>): ISettableObservable<T> {
	const overrideObs = observableValue<T | undefined>('overrideObs', undefined);
	return derivedWithSetter(overrideObs, (reader) => {
		return overrideObs.read(reader) ?? obs.read(reader);
	}, (value, tx) => {
		overrideObs.set(value, tx);
	});
}
