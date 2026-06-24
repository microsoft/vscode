import { Foo } from './f1';

interface Fooo extends Foo {
}

export class Bar implements Fooo {
	public name(): string {
		return 'Bar';
	}
}