#include <iostream>

/** */

// Namespace declaration
namespace MyNamespace {

	// Enum declaration
	enum MyEnum {
		FIRST_VALUE,
		SECOND_VALUE
	};

	// Struct declaration
	struct MyStruct {
		int x;
		double y;
	};

	// Template declaration
	template <typename T>
	T add(T a, T b) {
		return a + b;
	}

	// Exception class
	class MyException : public std::exception {
	public:
		const char* what() const throw() {
			return "MyException occurred";
		}
	};

	// Base class
	class MyBaseClass {
	public:
		virtual void print() const {
			std::cout << "Base class" << std::endl;
		}
	};

	// Derived class
	class MyDerivedClass : public MyBaseClass {
	public:
		void print() const override {
			std::cout << "Derived class" << std::endl;
		}
	};

} // namespace MyNamespace

int main() {
	// Using enum
	MyNamespace::MyEnum myEnum = MyNamespace::FIRST_VALUE;

	// Using struct
	MyNamespace::MyStruct myStruct = {10, 20.5};

	// Using template
	int sum = MyNamespace::add(10, 20);

	// Using exception
	try {
		throw MyNamespace::MyException();
	} catch (const MyNamespace::MyException& e) {
		std::cout << e.what() << std::endl;
	}

	// Using inheritance and polymorphism
	MyNamespace::MyBaseClass* myBaseClass = new MyNamespace::MyDerivedClass();
	myBaseClass->print();
	delete myBaseClass;

	// Using lambda function
	auto myLambda = [](int x, int y) { return x + y; };
	int lambdaSum = myLambda(10, 20);

	// Using pointers and references
	int x = 10;
	int* ptr = &x;
	int& ref = x;

	// If statement
	if (x == 9) {
		x++;
	}

	// If-else statement
	if (x == 10) {
		x += 1;
	} else {
		--x;
	}

	// Traditional for loop
	for (int i = 0; i < 10; ++i) {
		std::cout << "Traditional for loop, iteration: " << i << std::endl;
	}

	// Range-based for loop
	std::vector<int> numbers = {1, 2, 3, 4, 5};
	for (const auto& number : numbers) {
		std::cout << "Range-based for loop, number: " << number << std::endl;
	}

	// For loop with multiple initialization
	for (int i = 0, j = 10; i < 10; ++i, --j) {
		std::cout << "For loop with multiple initialization, i: " << i << ", j: " << j << std::endl;
	}

	// While loop example
	int counter = 0;
	while (counter < 5) {
		std::cout << "While loop iteration: " << counter << std::endl;
		++counter;
	}

	// Do-while loop example
	int doCounter = 0;
	do {
		std::cout << "Do-while loop iteration: " << doCounter << std::endl;
		++doCounter;
	} while (doCounter < 3);

	// Using goto statement
	int i = 0;
	start:
	if (i >= 5) {
		std::cout << "Done with goto loop" << std::endl;
	} else {
		std::cout << "Using goto, iteration: " << i << std::endl;
		i++;
		goto start;
	}

	return 0;
}
