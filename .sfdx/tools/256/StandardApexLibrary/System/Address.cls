global class Address {
	global String city;
	global String country;
	global String countrycode;
	global String geocodeaccuracy;
	global String postalcode;
	global String state;
	global String statecode;
	global String street;
	global Address() { }
	global Boolean equals(Object obj) { }
	global String getCity() { }
	global String getCountry() { }
	global String getCountryCode() { }
	/**
	 * Calculates distance of this location to another location
	 */
	global Double getDistance(System.Location other, String unit) { }
	global String getGeocodeAccuracy() { }
	global Double getLatitude() { }
	global Double getLongitude() { }
	global String getPostalCode() { }
	global String getState() { }
	global String getStateCode() { }
	global String getStreet() { }
	global Integer hashCode() { }
	global String toString() { }

}