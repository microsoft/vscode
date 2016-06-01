/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {Registry} from 'vs/platform/platform';
import filters = require('vs/base/common/filters');
import types = require('vs/base/common/types');
import paths = require('vs/base/common/paths');
import URI from 'vs/base/common/uri';
import {IDisposable} from 'vs/base/common/lifecycle';
import labels = require('vs/base/common/labels');
import {EventType} from 'vs/base/common/events';
import {IEditorInput} from 'vs/platform/editor/common/editor';
import {Mode, IEntryRunContext} from 'vs/base/parts/quickopen/common/quickOpen';
import {QuickOpenEntry, QuickOpenModel, IHighlight} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {EditorInput, getUntitledOrFileResource} from 'vs/workbench/common/editor';
import {IEditorRegistry, Extensions} from 'vs/workbench/browser/parts/editor/baseEditor';
import {EditorQuickOpenEntry} from 'vs/workbench/browser/quickopen';
import {KeyMod} from 'vs/base/common/keyCodes';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

const MAX_ENTRIES = 200;

export class EditorHistoryEntry extends EditorQuickOpenEntry {
	private input: EditorInput;
	private model: EditorHistoryModel;
	private resource: URI;
	private toUnbind: IDisposable;

	constructor(
		editorService: IWorkbenchEditorService,
		private contextService: IWorkspaceContextService,
		input: EditorInput,
		labelHighlights: IHighlight[],
		descriptionHighlights: IHighlight[],
		model: EditorHistoryModel
	) {
		super(editorService);

		this.input = input;
		this.model = model;
		this.resource = getUntitledOrFileResource(input);

		this.setHighlights(labelHighlights, descriptionHighlights);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toUnbind = this.input.addOneTimeDisposableListener(EventType.DISPOSE, () => this.onInputDispose());
	}

	private onInputDispose(): void {
		this.model.restore(this.input); // handle the case of input getting disposed by restoring it from factory
	}

	public clone(labelHighlights: IHighlight[], descriptionHighlights?: IHighlight[]): EditorHistoryEntry {
		return new EditorHistoryEntry(this.editorService, this.contextService, this.input, labelHighlights, descriptionHighlights, this.model);
	}

	public getIcon(): string {
		return this.input.isDirty() ? 'dirty' : '';
	}

	public getLabel(): string {
		return this.input.getName();
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, recently opened", this.getLabel());
	}

	public getDescription(): string {
		return this.input.getDescription();
	}

	public getResource(): URI {
		return this.resource;
	}

	public getInput(): EditorInput {
		return this.input;
	}

	public matches(input: EditorInput): boolean {
		return this.input.matches(input);
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			let sideBySide = !context.quickNavigateConfiguration && context.keymods.indexOf(KeyMod.CtrlCmd) >= 0;
			this.editorService.openEditor(this.input, null, sideBySide).done(() => {
				if (!this.input.matches(this.editorService.getActiveEditorInput())) {
					this.model.remove(this.input); // Automatically clean up stale history entries when the input can not be opened
				}
			});

			return true;
		}

		return false;
	}

	public dispose(): void {
		if (this.toUnbind) {
			this.toUnbind.dispose();
			this.toUnbind = null;
		}
	}
}

interface ISerializedEditorInput {
	id: string;
	value: string;
}

export class EditorHistoryModel extends QuickOpenModel {
	private registry: IEditorRegistry;

	constructor(
		private editorService: IWorkbenchEditorService,
		private instantiationService: IInstantiationService,
		private contextService: IWorkspaceContextService
	) {
		super();

		this.registry = Registry.as<IEditorRegistry>(Extensions.Editors);
	}

	public add(input: IEditorInput, index?: number): void {

		// Ensure we have at least a name to show
		if (!input.getName()) {
			return;
		}

		const entry = new EditorHistoryEntry(this.editorService, this.contextService, <EditorInput>input, null, null, this);

		// Remove any existing entry and add to the beginning if we do not get an index
		if (typeof index !== 'number') {
			this.remove(input);
			this.entries.unshift(entry);
		}

		// Otherwise replace at index
		else {
			const previousEntry = this.entries[index];
			if (previousEntry) {
				(<EditorHistoryEntry>previousEntry).dispose();
			}

			this.entries[index] = entry;
		}

		// Respect max entries setting
		if (this.entries.length > MAX_ENTRIES) {
			for (let i = MAX_ENTRIES; i < this.entries.length; i++) {
				(<EditorHistoryEntry>this.entries[i]).dispose();
			}

			this.entries = this.entries.slice(0, MAX_ENTRIES);
		}
	}

	public restore(input: EditorInput): void {
		let index = this.indexOf(input);
		if (index < 0) {
			return;
		}

		// Using the factory we try to recreate the input
		const factory = this.registry.getEditorInputFactory(input.getTypeId());
		if (factory) {
			const inputRaw = factory.serialize(input);
			if (inputRaw) {
				this.add(factory.deserialize(this.instantiationService, inputRaw), index);

				return;
			}
		}

		// Factory failed, just remove entry then
		this.remove(input);
	}

	public remove(input: IEditorInput): void {
		let index = this.indexOf(<EditorInput>input);
		if (index >= 0) {
			const entry = <EditorHistoryEntry>this.entries[index];
			if (entry) {
				entry.dispose();
			}

			this.entries.splice(index, 1);
		}
	}

	private indexOf(input: EditorInput): number {
		for (let i = 0; i < this.entries.length; i++) {
			let entry = this.entries[i];
			if ((<EditorHistoryEntry>entry).matches(input)) {
				return i;
			}
		}

		return -1;
	}

	public saveTo(memento: any): void {
		let entries: ISerializedEditorInput[] = [];
		for (let i = this.entries.length - 1; i >= 0; i--) {
			let entry = this.entries[i];
			let input = (<EditorHistoryEntry>entry).getInput();

			let factory = this.registry.getEditorInputFactory(input.getTypeId());
			if (factory) {
				let value = factory.serialize(input);
				if (types.isString(value)) {
					entries.push({
						id: input.getTypeId(),
						value: value
					});
				}
			}
		}

		if (entries.length > 0) {
			memento.entries = entries;
		}
	}

	public loadFrom(memento: any): void {
		let entries: ISerializedEditorInput[] = memento.entries;
		if (entries && entries.length > 0) {
			for (let i = 0; i < entries.length; i++) {
				let entry = entries[i];

				let factory = this.registry.getEditorInputFactory(entry.id);
				if (factory && types.isString(entry.value)) {
					let input = factory.deserialize(this.instantiationService, entry.value);
					if (input) {
						this.add(input);
					}
				}
			}
		}
	}

	public getEntries(): EditorHistoryEntry[] {
		return <EditorHistoryEntry[]>this.entries.slice(0);
	}

	public getResults(searchValue: string): QuickOpenEntry[] {
		searchValue = searchValue.replace(/ /g, ''); // get rid of all whitespace

		const searchInPath = searchValue.indexOf(paths.nativeSep) >= 0;

		let results: QuickOpenEntry[] = [];
		for (let i = 0; i < this.entries.length; i++) {
			let entry = <EditorHistoryEntry>this.entries[i];
			if (!entry.getResource()) {
				continue; //For now, only support to match on inputs that provide resource information
			}

			// Check if this entry is a match for the search value
			let targetToMatch = searchInPath ? labels.getPathLabel(entry.getResource(), this.contextService) : entry.getLabel();
			if (!filters.matchesFuzzy(searchValue, targetToMatch)) {
				continue;
			}

			// Apply highlights
			const {labelHighlights, descriptionHighlights} = QuickOpenEntry.highlight(entry, searchValue);
			results.push(entry.clone(labelHighlights, descriptionHighlights));
		}

		// Sort
		return results.sort((elementA: EditorHistoryEntry, elementB: EditorHistoryEntry) => QuickOpenEntry.compare(elementA, elementB, searchValue));
	}
}