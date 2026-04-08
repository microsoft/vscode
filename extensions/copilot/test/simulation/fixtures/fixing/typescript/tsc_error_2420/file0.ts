import { IFar } from './file1';

class Far implements IFar {

	constructor() { }

	bar(): void {
		console.log("This is the bar function.");
	}
}