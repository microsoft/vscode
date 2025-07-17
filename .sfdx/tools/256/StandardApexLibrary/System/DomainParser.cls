global class DomainParser {
	global DomainParser() { }
	global Object clone() { }
	global static System.Domain parse(String hostname) { }
	global static System.Domain parse(System.Url url) { }

}