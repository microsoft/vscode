global class PostalAddress {
	global List<String> addressLines;
	global String administrativeArea;
	global String country;
	global String countryCode;
	global String locality;
	global String postalCode;
	global String subAdministrativeArea;
	global String subLocality;
	global PostalAddress(List<String> addressLines, String subLocality, String locality, String postalCode, String subAdministrativeArea, String administrativeArea, String country, String countryCode) { }
	global Object clone() { }

}