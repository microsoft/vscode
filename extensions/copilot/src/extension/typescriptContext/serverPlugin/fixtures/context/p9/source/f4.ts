import { Foo } from './f1';

/**
 * Javadoc
 */
export abstract class Baz implements Foo {
	abstract name(): string;
}

export abstract class Bar extends Baz {
}