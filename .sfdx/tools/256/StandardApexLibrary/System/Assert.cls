global class Assert {
	global Assert() { }
	global static void areEqual(Object expected, Object actual, String msg) { }
	global static void areEqual(Object expected, Object actual) { }
	global static void areNotEqual(Object notExpected, Object actual, String msg) { }
	global static void areNotEqual(Object notExpected, Object actual) { }
	global Object clone() { }
	global static void fail(String msg) { }
	global static void fail() { }
	global static void isFalse(Boolean condition, String msg) { }
	global static void isFalse(Boolean condition) { }
	global static void isInstanceOfType(Object instance, System.Type expectedType, String msg) { }
	global static void isInstanceOfType(Object instance, System.Type expectedType) { }
	global static void isNotInstanceOfType(Object instance, System.Type notExpectedType, String msg) { }
	global static void isNotInstanceOfType(Object instance, System.Type notExpectedType) { }
	global static void isNotNull(Object value, String msg) { }
	global static void isNotNull(Object value) { }
	global static void isNull(Object value, String msg) { }
	global static void isNull(Object value) { }
	global static void isTrue(Boolean condition, String msg) { }
	global static void isTrue(Boolean condition) { }

}