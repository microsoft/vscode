class InstantiationService1 {

	private readonly _children = new Set<InstantiationService1>();

	constructor(private readonly _parent?: InstantiationService1) {}

	createChild(): InstantiationService1 {
		const child = new class extends InstantiationService1 {
			override dispose(): void {
				this._children.delete(child);
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