/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Registry} from 'vs/platform/platform';
import filters = require('vs/base/common/filters');
import strings = require('vs/base/common/strings');
import types = require('vs/base/common/types');
import URI from 'vs/base/common/uri';
import {EventType} from 'vs/base/common/events';
import comparers = require('vs/base/common/comparers');
import {Mode, IContext} from 'vs/base/parts/quickopen/browser/quickOpen';
import {QuickOpenEntry, QuickOpenModel, IHighlight} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {EditorInput, getUntitledOrFileResource} from 'vs/workbench/common/editor';
import {IEditorRegistry, Extensions} from 'vs/workbench/browser/parts/editor/baseEditor';
import {EditorQuickOpenEntry} from 'vs/workbench/browser/quickopen';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

const MAX_ENTRIES = 200;

export class EditorHistoryEntry extends EditorQuickOpenEntry {
	private input: EditorInput;
	private model: EditorHistoryModel;
	private resource: URI;

	constructor(
		editorService: IWorkbenchEditorService,
		private contextService: IWorkspaceContextService,
		input: EditorInput,
		highlights: IHighlight[],
		model: EditorHistoryModel
	) {
		super(editorService);

		this.input = input;
		this.model = model;

		let resource = getUntitledOrFileResource(input);
		if (resource) {
			this.resource = resource;
		} else {
			let inputWithResource: { getResource(): URI } = <any>input;
			if (types.isFunction(inputWithResource.getResource)) {
				this.resource = inputWithResource.getResource();
			}
		}

		this.setHighlights(highlights);
	}

	public clone(highlights: IHighlight[]): EditorHistoryEntry {
		return new EditorHistoryEntry(this.editorService, this.contextService, this.input, highlights, this.model);
	}

	public getLabel(): string {
		let status = this.input.getStatus();
		if (status && status.decoration) {
			return status.decoration + ' ' + this.input.getName();
		}

		return this.input.getName();
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

	public run(mode: Mode, context: IContext): boolean {
		if (mode === Mode.OPEN) {
			let event = context.event;
			let sideBySide = !context.quickNavigateConfiguration && (event && (event.ctrlKey || event.metaKey || (event.payload && event.payload.originalEvent && (event.payload.originalEvent.ctrlKey || event.payload.originalEvent.metaKey))));
			this.editorService.openEditor(this.input, null, sideBySide).done(() => {

				// Automatically clean up stale history entries when the input can not be opened
				if (!this.input.matches(this.editorService.getActiveEditorInput())) {
					this.model.remove(this.input);
				}
			});

			return true;
		}

		return false;
	}
}

interface ISerializedEditorInput {
	id: string;
	value: string;
}

export class EditorHistoryModel extends QuickOpenModel {

	constructor(
		private editorService: IWorkbenchEditorService,
		private instantiationService: IInstantiationService,
		private contextService: IWorkspaceContextService
	) {
		super();
	}

	public add(entry: EditorInput): void {

		// Ensure we have at least a name to show
		if (!entry.getName()) {
			return;
		}

		// Remove on Dispose
		let unbind = entry.addListener(EventType.DISPOSE, () => {
			this.remove(entry);
			unbind();
		});

		// Remove any existing entry and add to the beginning
		this.remove(entry);
		this.entries.unshift(new EditorHistoryEntry(this.editorService, this.contextService, entry, null, this));

		// Respect max entries setting
		if (this.entries.length > MAX_ENTRIES) {
			this.entries = this.entries.slice(0, MAX_ENTRIES);
		}
	}

	public remove(entry: EditorInput): void {
		let index = this.indexOf(entry);
		if (index >= 0) {
			this.entries.splice(index, 1);
		}
	}

	private indexOf(entryToFind: EditorInput): number {
		for (let i = 0; i < this.entries.length; i++) {
			let entry = this.entries[i];
			if ((<EditorHistoryEntry>entry).matches(entryToFind)) {
				return i;
			}
		}

		return -1;
	}

	public saveTo(memento: any): void {
		let registry = (<IEditorRegistry>Registry.as(Extensions.Editors));
		let entries: ISerializedEditorInput[] = [];
		for (let i = this.entries.length - 1; i >= 0; i--) {
			let entry = this.entries[i];
			let input = (<EditorHistoryEntry>entry).getInput();

			let factory = registry.getEditorInputFactory(input.getId());
			if (factory) {
				let value = factory.serialize(input);
				if (types.isString(value)) {
					entries.push({
						id: input.getId(),
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
		let registry = (<IEditorRegistry>Registry.as(Extensions.Editors));
		let entries: ISerializedEditorInput[] = memento.entries;
		if (entries && entries.length > 0) {
			for (let i = 0; i < entries.length; i++) {
				let entry = entries[i];

				let factory = registry.getEditorInputFactory(entry.id);
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
		searchValue = searchValue.trim();

		let results: QuickOpenEntry[] = [];
		for (let i = 0; i < this.entries.length; i++) {
			let entry = this.entries[i];
			if (!entry.getResource()) {
				continue; //For now, only support to match on inputs that provide resource information
			}

			let highlights = filters.matchesFuzzy(searchValue, (<EditorHistoryEntry>entry).getInput().getName());
			if (highlights) {
				results.push((<EditorHistoryEntry>entry).clone(highlights));
			}
		}

		// If user is searching, use the same sorting that is used for other quick open handlers
		if (searchValue) {
			let normalizedSearchValue = strings.stripWildcards(searchValue.toLowerCase());

			return results.sort((elementA, elementB) => comparers.compareAnything((<EditorHistoryEntry>elementA).getInput().getName(), (<EditorHistoryEntry>elementB).getInput().getName(), normalizedSearchValue));
		}

		// Leave default "most recently used" order if user is not actually searching
		return results;
	}
}
