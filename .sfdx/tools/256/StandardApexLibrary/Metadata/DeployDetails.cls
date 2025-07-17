global class DeployDetails {
	global List<Metadata.DeployMessage> componentFailures;
	global List<Metadata.DeployMessage> componentSuccesses;
	global DeployDetails() { }
	global Object clone() { }

}