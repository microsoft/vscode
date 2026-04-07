import java.util.*;

public class Main {
	// Class variable
	private static String classVariable = "I am a class variable";

	/**
	 * This is a javadoc comment
	 */
	private String a;

	// Main method
	public static void main(String[] args) {
		// Local variable
		String localVariable = "I am a local variable";

		// Conditional statement
		if (localVariable.equals(classVariable)) {
			System.out.println("Variables are equal");
		} else {
			System.out.println("Variables are not equal");
		}

		// Loop
		for (int i = 0; i < 5; i++) {
			System.out.println("Loop iteration: " + i);
		}

		// Exception handling
		try {
			int result = 10 / 0;
		} catch (ArithmeticException e) {
			System.out.println("Caught an exception: " + e.getMessage());
		} finally {
			System.out.println("Finally block executed");
		}

		// Using a collection
		List<String> list = new ArrayList<>();
		list.add("Element 1");
		list.add("Element 2");

		// Using a stream
		list.stream().forEach(System.out::println);

		// Using a lambda
		Runnable r = () -> System.out.println("This is a lambda function");
		r.run();

		// Using an inner class
		InnerClass innerClass = new InnerClass();
		innerClass.display();
	}

	// Inner class
	static class InnerClass {
		void display() {
			System.out.println("This is an inner class");
		}
	}
}
