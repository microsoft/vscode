import { Calculator } from './f1';

function test(): void {
	const calcs = [new Calculator(), new Calculator()];
	calcs[0].getResult();
}
