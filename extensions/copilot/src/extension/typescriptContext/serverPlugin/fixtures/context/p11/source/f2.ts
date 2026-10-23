import { Foo } from './f1';

export class Bar implements Foo {
	public name(): string {
		return 'Bar';
	}
}