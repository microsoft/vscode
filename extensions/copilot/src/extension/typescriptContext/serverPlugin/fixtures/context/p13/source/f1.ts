export type Age = {
	value: number;
};

export class Street {
	private name: string;
	constructor(name: string) {
		this.name = name;
	}
	public getName() {
		return this.name;
	}
}