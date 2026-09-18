/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IChat } from '../../../services/sessions/common/session.js';
import { ProjectBoardMetadata, projectBoardMetadataLimits } from './projectBoardMetadata.js';
import { ProjectBoardQuestionPreview } from './projectBoardQuestions.js';

export interface IProjectBoardMetadataLease extends IDisposable, Pick<ProjectBoardMetadata, 'metadata' | 'credits' | 'creditsError' | 'configuration' | 'actions' | 'setIncludeCredits' | 'setIncludeConfiguration'> { }

export interface IProjectBoardQuestionLease extends IDisposable, Pick<ProjectBoardQuestionPreview, 'preview' | 'questionCarousels' | 'submit'> { }

interface IMetadataFeatures {
	includeCredits: boolean;
	includeConfiguration: boolean;
}

interface IMetadataEntry extends IMetadataFeatures {
	readonly key: string;
	readonly helper: ProjectBoardMetadata;
	readonly leases: Set<IMetadataFeatures>;
}

interface IQuestionEntry {
	readonly helper: ProjectBoardQuestionPreview;
	readonly leases: Set<object>;
}

const maxQuestionPreviews = 8;

/** One pool is shared by all boards; its quotas count chats, not views or leases. */
export class ProjectBoardPreviewPool extends Disposable {
	private readonly _metadata = new Map<string, IMetadataEntry>();
	private readonly _questions = new Map<string, IQuestionEntry>();
	private readonly _onDidChangeAvailability = this._register(new Emitter<void>());
	readonly onDidChangeAvailability: Event<void> = this._onDidChangeAvailability.event;
	// Lease disposal can happen inside a board autorun. Notify only after it unwinds.
	private readonly _availability = this._register(new RunOnceScheduler(() => this._onDidChangeAvailability.fire(), 0));
	private _isDisposed = false;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	acquireMetadata(chat: Pick<IChat, 'resource'>): IProjectBoardMetadataLease | undefined {
		if (this._isDisposed) {
			return undefined;
		}
		const key = chat.resource.toString();
		let entry = this._metadata.get(key);
		if (entry && !entry.leases.size && entry.helper.metadata.get().kind !== 'ready') {
			this._metadata.delete(key);
			entry.helper.dispose();
			entry = undefined;
		}
		if (!entry) {
			if (this._metadata.size >= projectBoardMetadataLimits.activeHelpers) {
				const idle = [...this._metadata].find(([, candidate]) => !candidate.leases.size);
				if (!idle) {
					return undefined;
				}
				this._metadata.delete(idle[0]);
				idle[1].helper.dispose();
			}
			entry = {
				key,
				helper: this._instantiationService.createInstance(ProjectBoardMetadata, chat),
				leases: new Set(), includeCredits: false, includeConfiguration: false,
			};
			this._metadata.set(key, entry);
		} else {
			this._metadata.delete(key);
			this._metadata.set(key, entry);
		}
		const retained = entry;
		const features: IMetadataFeatures = { includeCredits: false, includeConfiguration: false };
		retained.leases.add(features);
		const isActive = () => !this._isDisposed && retained.leases.has(features);
		return {
			metadata: retained.helper.metadata,
			credits: retained.helper.credits,
			creditsError: retained.helper.creditsError,
			configuration: retained.helper.configuration,
			actions: retained.helper.actions,
			setIncludeCredits: enabled => {
				if (isActive()) {
					features.includeCredits = enabled;
					this._updateMetadataFeatures(retained);
				}
			},
			setIncludeConfiguration: enabled => {
				if (isActive()) {
					features.includeConfiguration = enabled;
					this._updateMetadataFeatures(retained);
				}
			},
			dispose: () => {
				if (!isActive()) {
					return;
				}
				retained.leases.delete(features);
				if (retained.leases.size) {
					this._updateMetadataFeatures(retained);
				} else {
					// Ready previews stay warm within the same quota; unfinished loads still cancel.
					if (retained.helper.metadata.get().kind === 'ready') {
						this._metadata.delete(key);
						this._metadata.set(key, retained);
						this._updateMetadataFeatures(retained);
					} else {
						this._metadata.delete(key);
						retained.helper.dispose();
					}
					if (!this._isDisposed) {
						this._availability.schedule();
					}
				}
			},
		};
	}

	private _updateMetadataFeatures(entry: IMetadataEntry): void {
		const includeCredits = [...entry.leases].some(lease => lease.includeCredits);
		if (entry.includeCredits !== includeCredits) {
			entry.includeCredits = includeCredits;
			entry.helper.setIncludeCredits(includeCredits);
		}
		// Updating an observable can synchronously release the last lease or dispose the pool.
		if (this._isDisposed || this._metadata.get(entry.key) !== entry) {
			return;
		}

		const includeConfiguration = [...entry.leases].some(lease => lease.includeConfiguration);
		if (entry.includeConfiguration !== includeConfiguration) {
			entry.includeConfiguration = includeConfiguration;
			entry.helper.setIncludeConfiguration(includeConfiguration);
		}
	}

	clearIdleMetadata(): void {
		for (const [key, entry] of [...this._metadata]) {
			if (!entry.leases.size) {
				this._metadata.delete(key);
				entry.helper.dispose();
			}
		}
	}

	acquireQuestions(chat: Pick<IChat, 'resource' | 'status'>): IProjectBoardQuestionLease | undefined {
		if (this._isDisposed) {
			return undefined;
		}
		const key = chat.resource.toString();
		let entry = this._questions.get(key);
		if (!entry) {
			if (this._questions.size >= maxQuestionPreviews) {
				return undefined;
			}
			entry = {
				helper: this._instantiationService.createInstance(ProjectBoardQuestionPreview, chat),
				leases: new Set(),
			};
			this._questions.set(key, entry);
		}
		const retained = entry;
		const token = {};
		retained.leases.add(token);
		const isActive = () => !this._isDisposed && retained.leases.has(token);
		return {
			preview: retained.helper.preview,
			questionCarousels: retained.helper.questionCarousels,
			submit: (question, answers) => isActive() && retained.helper.submit(question, answers),
			dispose: () => {
				if (!isActive()) {
					return;
				}
				retained.leases.delete(token);
				if (!retained.leases.size) {
					this._questions.delete(key);
					retained.helper.dispose();
					if (!this._isDisposed) {
						this._availability.schedule();
					}
				}
			},
		};
	}

	override dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		super.dispose();
		for (const entry of this._metadata.values()) {
			entry.leases.clear();
			entry.helper.dispose();
		}
		this._metadata.clear();
		for (const entry of this._questions.values()) {
			entry.leases.clear();
			entry.helper.dispose();
		}
		this._questions.clear();
	}
}
