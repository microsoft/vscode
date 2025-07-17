global class Test {
	global static String KEY_CANVAS_URL;
	global static String KEY_DEVELOPER_NAME;
	global static String KEY_DISPLAY_LOCATION;
	global static String KEY_LOCATION_URL;
	global static String KEY_NAME;
	global static String KEY_NAMESPACE;
	global static String KEY_SUB_LOCATION;
	global static String KEY_VERSION;
	global Test() { }
	global Object clone() { }
	global static Canvas.RenderContext mockRenderContext(Map<String,String> appContextTestValues, Map<String,String> envContextTestValues) { }
	global static void testCanvasLifecycle(Canvas.CanvasLifecycleHandler handler, Canvas.RenderContext mockRenderContext) { }

}