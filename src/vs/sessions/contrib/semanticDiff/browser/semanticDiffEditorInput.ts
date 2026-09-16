/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { deepFreeze } from '../../../../base/common/objects.js';
import { derived, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IMultiDiffEditorViewState } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidgetImpl.js';
import { localize } from '../../../../nls.js';
import { SemanticDiffChangeType, validateSemanticDiffReport } from '../../../../platform/agentHost/common/semanticDiff.js';
import { projectSemanticDiffFiles } from '../../../../platform/agentHost/common/semanticDiffProjection.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorInputCapabilities, IEditorSerializer, IUntypedEditorInput } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { ISemanticDiffEditorRequest, ISemanticDiffEditorSource, ISemanticDiffSourceResolverService } from '../../../../workbench/contrib/chat/common/semanticDiffEditor.js';

export type SemanticDiffFilter = SemanticDiffChangeType;
export const semanticDiffFilterOrder: readonly SemanticDiffFilter[] = ['logic', 'test', 'supporting'];

type SourceState = { readonly kind: 'initial' | 'loading' } | { readonly kind: 'error'; readonly message: string } | { readonly kind: 'ready'; readonly source: ISemanticDiffEditorSource };

export class SemanticDiffEditorInput extends EditorInput {
	static readonly ID = 'workbench.input.semanticDiff';
	static readonly EDITOR_ID = 'workbench.editor.semanticDiff';

	readonly request: ISemanticDiffEditorRequest;
	readonly availableTypes: readonly SemanticDiffFilter[];
	private readonly _selectedTypes = observableValue<ReadonlySet<SemanticDiffFilter>>(this, new Set());
	readonly selectedTypes = this._selectedTypes;
	private readonly _sourceState = observableValue<SourceState>(this, { kind: 'initial' });
	readonly sourceState = this._sourceState;
	readonly projections = derived(this, reader => {
		const state = this.sourceState.read(reader);
		const types = this.selectedTypes.read(reader);
		return state.kind === 'ready' ? projectSemanticDiffFiles(state.source.files, this.request.groupId, types) : [];
	});
	private readonly loading = this._register(new MutableDisposable());
	private resolution: Promise<void> | undefined;
	viewState: IMultiDiffEditorViewState | undefined;

	constructor(request: ISemanticDiffEditorRequest) {
		if (!request || !URI.isUri(request.sessionResource) || !request.sessionResource.scheme ||
			typeof request.responseId !== 'string' || !request.responseId ||
			typeof request.toolCallId !== 'string' || !request.toolCallId ||
			typeof request.groupId !== 'string' ||
			(request.repositoryUri !== undefined && typeof request.repositoryUri !== 'string')) {
			throw new Error(localize('semanticDiff.invalidRequest', "The semantic diff source binding is invalid."));
		}
		const validation = validateSemanticDiffReport(request.report);
		if (!validation.ok) {
			throw new Error(validation.error.error.message);
		}
		if (!validation.report.analysis.groups.some(group => group.id === request.groupId)) {
			throw new Error(localize('semanticDiff.unknownGroup', "This group is not present in the classification report."));
		}
		super();
		this.request = Object.freeze({
			sessionResource: request.sessionResource,
			responseId: request.responseId,
			toolCallId: request.toolCallId,
			groupId: request.groupId,
			report: deepFreeze(validation.report),
			repositoryUri: request.repositoryUri,
		});
		const present = new Set(this.hunks.map(hunk => hunk.classification.changeType));
		this.availableTypes = Object.freeze(semanticDiffFilterOrder.filter(type => present.has(type)));
		this.setSelectedTypes(this.availableTypes.slice(0, 1));
	}

	get hunks() { return this.request.report.analysis.hunks.filter(hunk => hunk.classification.groupId === this.request.groupId); }
	get group() { return this.request.report.analysis.groups.find(group => group.id === this.request.groupId)!; }
	override get typeId() { return SemanticDiffEditorInput.ID; }
	override get editorId() { return SemanticDiffEditorInput.EDITOR_ID; }
	override get capabilities() { return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton; }
	override getName() { return this.group.title; }
	override getIcon() { return Codicon.diffMultiple; }
	override get resource(): URI {
		return URI.from({
			scheme: 'semantic-diff',
			path: '/group',
			query: JSON.stringify([this.request.sessionResource.toString(), this.request.responseId, this.request.toolCallId, this.request.groupId]),
		});
	}

	getProjectionUri(fileId: string, side: 'original' | 'modified'): URI {
		const file = this.request.report.analysis.files.find(file => file.id === fileId);
		const path = file ? (side === 'original' ? file.oldPath ?? file.path : file.path) : encodeURIComponent(fileId);
		return this.resource.with({
			path: `/${path}`,
			query: JSON.stringify([this.resource.query, fileId, side]),
		});
	}

	setSelectedTypes(types: Iterable<SemanticDiffFilter>): void {
		this._selectedTypes.set(new Set([...types].filter(type => this.availableTypes.includes(type))), undefined);
	}

	toggleType(type: SemanticDiffFilter): void {
		const next = new Set(this.selectedTypes.get());
		if (next.has(type)) {
			next.delete(type);
		} else {
			next.add(type);
		}
		this.setSelectedTypes(next);
	}

	showAll(): void { this.setSelectedTypes(this.availableTypes); }

	async resolveSource(resolver: ISemanticDiffSourceResolverService, retry = false): Promise<void> {
		if (this.resolution) {
			return this.resolution;
		}
		const state = this.sourceState.get();
		if (state.kind === 'ready' || (state.kind === 'error' && !retry) || this.isDisposed()) {
			return;
		}
		const cancellation = new CancellationTokenSource();
		this.loading.value = toDisposable(() => cancellation.dispose(true));
		this._sourceState.set({ kind: 'loading' }, undefined);
		this.resolution = (async () => {
			try {
				const source = await resolver.resolve(this.request, cancellation.token);
				if (!cancellation.token.isCancellationRequested) {
					this._sourceState.set({ kind: 'ready', source }, undefined);
				}
			} catch (error) {
				if (!cancellation.token.isCancellationRequested) {
					this._sourceState.set({ kind: 'error', message: toErrorMessage(error) }, undefined);
				}
			}
		})();
		try {
			await this.resolution;
		} finally {
			this.resolution = undefined;
			this.loading.clear();
		}
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return other instanceof SemanticDiffEditorInput &&
			isEqual(this.request.sessionResource, other.request.sessionResource) &&
			this.request.responseId === other.request.responseId &&
			this.request.toolCallId === other.request.toolCallId &&
			this.request.groupId === other.request.groupId;
	}
}

export class SemanticDiffEditorSerializer implements IEditorSerializer {
	canSerialize(input: EditorInput): boolean { return input instanceof SemanticDiffEditorInput; }

	serialize(input: EditorInput): string | undefined {
		if (!(input instanceof SemanticDiffEditorInput)) {
			return undefined;
		}
		const state = input.sourceState.get();
		return JSON.stringify({
			version: 1,
			request: {
				...input.request,
				sessionResource: input.request.sessionResource.toString(),
				repositoryUri: state.kind === 'ready' ? state.source.repository.toString() : input.request.repositoryUri,
			},
			selectedTypes: [...input.selectedTypes.get()],
			viewState: input.viewState,
		});
	}

	deserialize(_instantiationService: IInstantiationService, serialized: string): EditorInput | undefined {
		let input: SemanticDiffEditorInput | undefined;
		try {
			const data = JSON.parse(serialized);
			if (data.version !== 1 || typeof data.request?.sessionResource !== 'string' || !Array.isArray(data.selectedTypes) ||
				!data.selectedTypes.every((type: SemanticDiffFilter) => semanticDiffFilterOrder.includes(type))) {
				return undefined;
			}
			input = new SemanticDiffEditorInput({ ...data.request, sessionResource: URI.parse(data.request.sessionResource) });
			input.setSelectedTypes(data.selectedTypes);
			// Restore only presentation data; source text must be resolved and verified again.
			if (data.viewState && Number.isFinite(data.viewState.scrollState?.top) && Number.isFinite(data.viewState.scrollState?.left)) {
				const docStates: NonNullable<IMultiDiffEditorViewState['docStates']> = Object.create(null);
				for (const [key, value] of Object.entries(data.viewState.docStates ?? {})) {
					const collapsed: unknown = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, 'collapsed')?.value : undefined;
					if (typeof collapsed === 'boolean') {
						docStates[key] = { collapsed };
					}
				}
				input.viewState = {
					scrollState: { top: Math.max(0, data.viewState.scrollState.top), left: Math.max(0, data.viewState.scrollState.left) },
					docStates,
				};
			}
			return input;
		} catch {
			input?.dispose();
			return undefined;
		}
	}
}
