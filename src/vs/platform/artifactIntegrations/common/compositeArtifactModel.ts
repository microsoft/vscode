/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derived, IObservable, IReader } from '../../../base/common/observable.js';
import { ArtifactActor, ArtifactRun, ArtifactSnapshot, IArtifactModel } from './artifactIntegration.js';

/** Combines presentation without moving an integration's execution or persistence authority. */
export class CompositeArtifactModel implements IArtifactModel {
	readonly snapshot: IObservable<ArtifactSnapshot>;
	private readonly runOwners = new Map<string, IArtifactModel>();

	constructor(private readonly primary: IArtifactModel, private readonly secondary: IObservable<IArtifactModel | undefined>) {
		this.snapshot = derived(this, reader => {
			const snapshots = this.models(reader).map(model => model.snapshot.read(reader));
			const contributions = snapshots.flatMap(snapshot => snapshot.contributions.map(contribution => ({ ...contribution, authority: contribution.authority ?? snapshot.authority })));
			return {
				...snapshots[0],
				contributions,
				mainIntegrationId: snapshots.find(snapshot => snapshot.mainIntegrationId)?.mainIntegrationId,
				runs: snapshots.flatMap(snapshot => snapshot.runs).sort((a, b) => a.createdAt - b.createdAt).slice(-50),
			};
		});
	}

	requestAuthentication(integrationId: string) {
		return this.forIntegration(integrationId).requestAuthentication(integrationId);
	}

	configure(integrationId: string, revision: number, values: Readonly<Record<string, boolean | string>>, actor?: ArtifactActor) {
		return this.forIntegration(integrationId).configure(integrationId, revision, values, actor);
	}

	async invoke(integrationId: string, actionId: string, chat: string, requestId: string, actor?: ArtifactActor) {
		const model = this.forIntegration(integrationId);
		const run = await model.invoke(integrationId, actionId, chat, requestId, actor);
		this.runOwners.set(run.id, model);
		return run;
	}

	async cancel(runId: string) {
		await (await this.forRun(runId)).cancel(runId);
	}

	async reconcile(runId: string) {
		await (await this.forRun(runId)).reconcile(runId);
	}

	acquireDetails(integrationId: string, detailsId: string) {
		return this.forIntegration(integrationId).acquireDetails(integrationId, detailsId);
	}

	async getRuns(before?: string, limit = 50): Promise<{ readonly runs: readonly ArtifactRun[]; readonly next?: string }> {
		if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
			throw new Error('Invalid artifact history page size');
		}
		const sources = await Promise.all(this.models().map(async model => ({ model, page: await model.getRuns(undefined, 200), index: 0 })));
		const runs: ArtifactRun[] = [];
		let found = before === undefined;
		while (true) {
			await Promise.all(sources.map(async source => {
				if (source.index === source.page.runs.length && source.page.next) {
					source.page = await source.model.getRuns(source.page.next, 200);
					source.index = 0;
				}
			}));
			const source = sources.filter(source => source.index < source.page.runs.length)
				.sort((a, b) => compareRuns(a.page.runs[a.index], b.page.runs[b.index]))[0];
			if (!source) {
				if (!found) {
					throw new Error('Invalid artifact history cursor');
				}
				return { runs };
			}
			const run = source.page.runs[source.index++];
			this.runOwners.set(run.id, source.model);
			if (!found) {
				found = run.id === before;
			} else if (runs.length === limit) {
				return { runs, next: runs.at(-1)?.id };
			} else {
				runs.push(run);
			}
		}
	}

	private models(reader?: IReader): readonly IArtifactModel[] {
		const secondary = this.secondary.read(reader);
		return secondary ? [this.primary, secondary] : [this.primary];
	}

	private forIntegration(id: string): IArtifactModel {
		const models = this.models().filter(model => model.snapshot.get().contributions.some(contribution => contribution.integrationId === id));
		if (models.length !== 1) {
			throw new Error(`Missing or ambiguous artifact integration: ${id}`);
		}
		return models[0];
	}

	private async forRun(id: string): Promise<IArtifactModel> {
		const models = this.models();
		const cached = this.runOwners.get(id);
		const known = cached && models.includes(cached) ? cached : models.find(model => model.snapshot.get().runs.some(run => run.id === id));
		if (known) {
			this.runOwners.set(id, known);
			return known;
		}
		this.runOwners.delete(id);
		let cursor: string | undefined;
		do {
			const page = await this.getRuns(cursor, 200);
			const owner = this.runOwners.get(id);
			if (owner && this.models().includes(owner)) {
				return owner;
			}
			this.runOwners.delete(id);
			cursor = page.next;
		} while (cursor);
		throw new Error('Artifact run not found');
	}
}

function compareRuns(a: ArtifactRun, b: ArtifactRun): number {
	return b.createdAt - a.createdAt || a.id.localeCompare(b.id);
}
