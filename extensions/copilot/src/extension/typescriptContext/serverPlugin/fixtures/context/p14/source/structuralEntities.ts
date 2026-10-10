const shorthand = 1;
const defaults = { fallback: true };

export const assignedFunction = function () {
	return 0;
};

export const assignedArrow = () => {
	return 1;
};

export const AssignedClass = class InnerClass {
	method() {
		return 2;
	}
};

export class ClassFields {
	field = () => {
		return 3;
	};

	wrapped = ((() => {
		return 4;
	}) satisfies () => number);

	static {
		const staticValue = 5;
	}
}

export enum Choice {
	First,
	Second,
}

export interface Callable {
	(): number;
	new(): Callable;
	[key: string]: unknown;
}

export const config = {
	shorthand,
	...defaults,
	nested: true,
};

export const values = [
	'first',
	createValue(),
	...[3],
];

function createValue(): number {
	return 6;
}

export default createValue();

export class LiteralFields {
	options = {
		fieldValue: true,
	};
}

export const nestedConfig = {
	inner: {
		nestedValue: true,
	},
};

export const wrappedConfig = ({
	wrappedValue: true,
} satisfies object);
