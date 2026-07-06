class Bar {
	private hi() { }
}

class Foo extends Bar {
	constructor() {
		super();
		super.hi();
	}
}
