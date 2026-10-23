export class A {

	/**
	 * The private length of the line.
	 */
	private __length: number;

	/**
	 * The length of the line.
	 */
	protected _length: number;

	/**
	 * Returns the occurrence of 'foo'.
	 *
	 * @returns the occurrence of 'foo'.
	 */
	public foo(): number {
		return 0;
	}
}

export class B extends A {
	/**
	 * The distance between two points.
	 */
	protected distance: number;
}