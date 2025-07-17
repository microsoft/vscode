global class NavigationMenuItem {
	global ConnectApi.NavigationMenuItemActionType actionType;
	global String actionValue;
	global String imageUrl;
	global String label;
	global ConnectApi.NavigationMenuPageReference pageReference;
	global List<ConnectApi.NavigationMenuItem> subMenu;
	global ConnectApi.NavigationMenuItemOpenTarget target;
	global NavigationMenuItem() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}