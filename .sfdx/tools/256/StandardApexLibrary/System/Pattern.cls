global class Pattern {
	global Object clone() { }
	global static System.Pattern compile(String regex) { }
	global System.Matcher matcher(String input) { }
	global static Boolean matches(String regex, String input) { }
	global String pattern() { }
	global static String quote(String s) { }
	global List<String> split(String input, Integer n) { }
	global List<String> split(String input) { }

}