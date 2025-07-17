global interface CanvasLifecycleHandler {
	Set<Canvas.ContextTypeEnum> excludeContextTypes();
	void onRender(Canvas.RenderContext param0);

}