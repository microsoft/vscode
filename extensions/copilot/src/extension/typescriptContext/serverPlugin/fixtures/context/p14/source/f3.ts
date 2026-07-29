import { Calculator } from './f1';

function test(): void {
	const calc = new Calculator(10);
	calc.add(5).getResult();
}
