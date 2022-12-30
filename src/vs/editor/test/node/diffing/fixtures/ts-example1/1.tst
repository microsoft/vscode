export class EditorWorkerServiceDiffComputer implements IDiffComputer {
	constructor(@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService) { }

	async computeDiff(textModel1: ITextModel, textModel2: ITextModel): Promise<LineDiff[] | null> {
		const diffs = await this.editorWorkerService.computeDiff(textModel1.uri, textModel2.uri, false, 1000);
		if (!diffs || diffs.quitEarly) {
			return null;
		}
		return diffs.changes.map((c) => LineDiff.fromLineChange(c, textModel1, textModel2));
	}
}

function wait(ms: number): Promise<void> {
	return new Promise(r => setTimeout(r, ms));
}
