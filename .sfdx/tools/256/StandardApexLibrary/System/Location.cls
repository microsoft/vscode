global class Location {
	global Double latitude;
	global Double longitude;
	global Location() { }
	global Boolean equals(Object obj) { }
	/**
	 * Calculates distance of this location to another location
	 */
	global Double getDistance(System.Location other, String unit) { }
	global Double getLatitude() { }
	global Double getLongitude() { }
	global Integer hashCode() { }
	global String toString() { }

}