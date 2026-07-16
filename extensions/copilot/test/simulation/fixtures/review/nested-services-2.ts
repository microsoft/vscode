class InstantiationService2 {

	private readonly _children = new Set<InstantiationService2>();

	constructor(private readonly _parent?: InstantiationService2) {}

	createChild(): InstantiationService2 {
		const child = new class extends InstantiationService2 {
			override dispose(): void {
				if (this._parent) {
					this._parent._children.delete(this);
				}
				super.dispose();
			}
		}(this);
		this._children.add(child);

		return child;
	}

	dispose(): void {
		this._children.forEach(child => child.dispose());
	}
}