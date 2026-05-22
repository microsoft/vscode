/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint consistent-this: "error" */
import { List } from './eslint_class_methods_use_this'
class IterList<T> extends List<T> {
	iterate(): () => Iterable<T> {
		const self = this
		return function* iterate(): Iterable<T> {
			yield self.a
			yield* (self.d as IterList<T>).iterate()()
		}
	}
}
