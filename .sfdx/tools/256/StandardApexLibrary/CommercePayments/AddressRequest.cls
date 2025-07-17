global class AddressRequest {
	global String city;
	global String companyName;
	global String country;
	global String postalCode;
	global String state;
	global String street;
	global AddressRequest(String street, String city, String state, String country, String postalCode) { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}