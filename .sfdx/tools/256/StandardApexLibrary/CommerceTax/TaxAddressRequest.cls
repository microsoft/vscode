global class TaxAddressRequest {
	global String city;
	global String country;
	global Double latitude;
	global String locationCode;
	global Double longitude;
	global String postalCode;
	global String state;
	global String street;
	global TaxAddressRequest(String city, String country, Double latitude, Double longitude, String postalCode, String state, String street, String locationCode) { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}