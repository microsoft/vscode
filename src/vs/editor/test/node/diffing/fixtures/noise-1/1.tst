this._sash = derivedWithStore('sash', (reader, store) => {
	const showSash = this._options.renderSideBySide.read(reader);
	this.elements.root.classList.toggle('side-by-side', showSash);
	if (!showSash) { return undefined; }
	const result = store.add(new DiffEditorSash(
		this._options,
		this.elements.root,
		{
			height: this._rootSizeObserver.height,
			width: this._rootSizeObserver.width.map((w, reader) => w - (this._options.renderOverviewRuler.read(reader) ? OverviewRulerPart.ENTIRE_DIFF_OVERVIEW_WIDTH : 0)),
		}
	));
	store.add(autorun('setBoundarySashes', reader => {
		const boundarySashes = this._boundarySashes.read(reader);
		if (boundarySashes) {
			result.setBoundarySashes(boundarySashes);
		}
	}));
	return result;
});
this._register(keepAlive(this._sash, true));

this._register(autorunWithStore2('UnchangedRangesFeature', (reader, store) => {
	this.unchangedRangesFeature = store.add(new (readHotReloadableExport(UnchangedRangesFeature, reader))(this._editors, this._diffModel, this._options));
}));

this._register(autorunWithStore2('DiffEditorDecorations', (reader, store) => {
	store.add(new (readHotReloadableExport(DiffEditorDecorations, reader))(this._editors, this._diffModel, this._options));
}));
this._register(autorunWithStore2('ViewZoneManager', (reader, store) => {
	store.add(this._instantiationService.createInstance(
		readHotReloadableExport(ViewZoneManager, reader),
		this._editors,
		this._diffModel,
		this._options,
		this,
		() => this.unchangedRangesFeature.isUpdatingViewZones,
	));
}));

this._register(autorunWithStore2('OverviewRulerPart', (reader, store) => {
	store.add(this._instantiationService.createInstance(readHotReloadableExport(OverviewRulerPart, reader), this._editors,
		this.elements.root,
		this._diffModel,
		this._rootSizeObserver.width,
		this._rootSizeObserver.height,
		this._layoutInfo.map(i => i.modifiedEditor),
		this._options,
	));
}));

this._reviewPane = this._register(this._instantiationService.createInstance(DiffReview2, this));
this.elements.root.appendChild(this._reviewPane.domNode.domNode);
this.elements.root.appendChild(this._reviewPane.actionBarContainer.domNode);
reviewPaneObservable.set(this._reviewPane, undefined);

this._createDiffEditorContributions();
