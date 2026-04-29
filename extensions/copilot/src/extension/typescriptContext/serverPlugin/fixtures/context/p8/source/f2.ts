import { Foo } from './f1';

/**
 * Javadoc
 */
export class Bar extends Foo {
	private name: string;
	constructor() {
		super();
		this.name = 'Bar';
	}
}