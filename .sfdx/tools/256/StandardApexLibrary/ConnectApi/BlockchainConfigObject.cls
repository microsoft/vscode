global class BlockchainConfigObject {
	global String blockchainLabel;
	global Long chainIdentifier;
	global String currencyCode;
	global Boolean isEnabled;
	global Boolean isTestnet;
	global String name;
	global String networkDeveloperName;
	global String rpcUrl;
	global String scanUrl;
	global String signatureVerifierContract;
	global String type;
	global BlockchainConfigObject() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}