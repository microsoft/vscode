import { Name, NameLength } from './f1';

export class X implements Name, NameLength {
	name() {
		return 'x';
	}
	length() {
		return 'x'.length;
	}
}