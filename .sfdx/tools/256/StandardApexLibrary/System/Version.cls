global class Version {
	global Version(Integer major, Integer minor, Integer patch) { }
	global Version(Integer major, Integer minor) { }
	/**
	 * Compares this version against the one given
	 */
	global Integer compareTo(System.Version other) { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	/**
	 * Return the major version number
	 */
	global Integer major() { }
	/**
	 * Return the minor version number
	 */
	global Integer minor() { }
	/**
	 * Return the patch number
	 */
	global Integer patch() { }
	global String toString() { }

}