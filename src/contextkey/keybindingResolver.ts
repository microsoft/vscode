import { ContextKeyExpr, IContext } from './common/contextkey';

export class KeybindingResolver {
	public static contextMatchesRules(context: IContext, rules: ContextKeyExpr | null | undefined): boolean {
		if (!rules) {
			return true;
		}
		return rules.evaluate(context);
	}

	public static KEYBINDING_CONTEXT_ATTR = 'data-keybinding-context';
}