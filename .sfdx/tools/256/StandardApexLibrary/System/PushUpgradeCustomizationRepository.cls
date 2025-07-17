global class PushUpgradeCustomizationRepository {
	global PushUpgradeCustomizationRepository() { }
	global Object clone() { }
	global static String create(String packageId, String subscriberOrgId, Boolean customUpgradeAllowed) { }
	global static void deleteById(String id) { }
	global static void deleteByIndex(String packageId, String subscriberOrgId) { }
	global static Boolean getCustomUpgradeAllowedForId(String id) { }
	global static Boolean getCustomUpgradeAllowedForIndex(String packageId, String subscriberOrgId) { }
	global static System.CustomizationType getCustomUpgradeTypeForId(String id) { }
	global static System.CustomizationType getCustomUpgradeTypeForIndex(String packageId, String subscriberOrgId) { }
	global static void setCustomUpgradeAllowedForId(String id, Boolean customUpgradeAllowed) { }
	global static void setCustomUpgradeAllowedForIndex(String packageId, String subscriberOrgId, Boolean customUpgradeAllowed) { }

}