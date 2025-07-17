global class Matcher {
	global Object clone() { }
	global Integer end(Integer grp) { }
	global Integer end() { }
	global Boolean find(Integer start) { }
	global Boolean find() { }
	global String group(Integer start) { }
	global String group() { }
	global Integer groupCount() { }
	global Boolean hasAnchoringBounds() { }
	global Boolean hasTransparentBounds() { }
	global Boolean hitEnd() { }
	global Boolean lookingAt() { }
	global Boolean matches() { }
	global System.Pattern pattern() { }
	global static String quoteReplacement(String s) { }
	global System.Matcher region(Integer start, Integer ending) { }
	global Integer regionEnd() { }
	global Integer regionStart() { }
	global String replaceAll(String replacement) { }
	global String replaceFirst(String replacement) { }
	global Boolean requireEnd() { }
	global System.Matcher reset(String input) { }
	global System.Matcher reset() { }
	global Integer start(Integer grp) { }
	global Integer start() { }
	global System.Matcher useAnchoringBounds(Boolean b) { }
	global System.Matcher usePattern(System.Pattern p) { }
	global System.Matcher useTransparentBounds(Boolean b) { }

}