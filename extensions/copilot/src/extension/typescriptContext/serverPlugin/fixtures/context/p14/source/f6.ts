import { Calculator } from './f1';

interface DeepNest {
	a: { b: { c: { d: { e: { f: Calculator } } } } };
}

function test(obj: DeepNest): void {
	obj.a.b.c.d.e.f.getResult();
}
