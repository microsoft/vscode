package foo;

import org.junit.Test;
import org.junit.runners.*;

/*
 * Multi line comment
 */
public class TestClass {

	private String aString;

	/**
	 * @param args
	 */
	public void doSomething(int a) {
		double b = 0.0;
		double c = 10e3;
		long l = 134l;
	}

	/*
	 * multiline comment
	 */
	@SuppressWarnings(value = "aString")
	private long privateMethod(long b){
		for (int i = 0; i < 9; i++) {
			System.out.println("Hello" + i);
		}
		return 10;
	}

	//single line comment
	@Test
	public void someTests() {
		int hex = 0x5;
		Vector<Number> v = new Vector();
	}


}
