/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IHighlight } from '../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IDebugSession, IExpressionValue } from '../common/debug.js';
import { Expression, ExpressionContainer, Variable } from '../common/debugModel.js';
import { ReplEvaluationResult } from '../common/replModel.js';
import { IVariableTemplateData } from './baseDebugView.js';
import { handleANSIOutput } from './debugANSIHandling.js';
import { COPY_EVALUATE_PATH_ID, COPY_VALUE_ID } from './debugCommands.js';
import { DebugLinkHoverBehavior, DebugLinkHoverBehaviorTypeData, ILinkDetector, LinkDetector } from './linkDetector.js';

export interface IValueHoverOptions {
	/** Commands to show in the hover footer. */
	commands?: { id: string; args: unknown[] }[];
}

export interface IRenderValueOptions {
	showChanged?: boolean;
	maxValueLength?: number;
	/** If not false, a rich hover will be shown on the element. */
	hover?: false | IValueHoverOptions;
	colorize?: boolean;

	/** @deprecated */
	wasANSI?: boolean;
	session?: IDebugSession;
	locationReference?: number;
}

export interface IRenderVariableOptions {
	showChanged?: boolean;
	highlights?: IHighlight[];
}


const MAX_VALUE_RENDER_LENGTH_IN_VIEWLET = 1024;
const booleanRegex = /^(true|false)$/i;
const stringRegex = /^(['"]).*\1$/;

const enum Cls {
	Value = 'value',
	Unavailable = 'unavailable',
	Error = 'error',
	Changed = 'changed',
	Boolean = 'boolean',
	String = 'string',
	Number = 'number',
}

const allClasses: readonly Cls[] = Object.keys({
	[Cls.Value]: 0,
	[Cls.Unavailable]: 0,
	[Cls.Error]: 0,
	[Cls.Changed]: 0,
	[Cls.Boolean]: 0,
	[Cls.String]: 0,
	[Cls.Number]: 0,
} satisfies { [key in Cls]: unknown }) as Cls[];

export class DebugExpressionRenderer {
	private displayType: IObservable<boolean>;
	private readonly linkDetector: LinkDetector;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		this.linkDetector = instantiationService.createInstance(LinkDetector);
		this.displayType = observableConfigValue('debug.showVariableTypes', false, configurationService);
	}

	renderVariable(data: IVariableTemplateData, variable: Variable, options: IRenderVariableOptions = {}): IDisposable {
		const displayType = this.displayType.get();

		if (variable.available) {
			data.type.textContent = '';
			let text = variable.name;
			if (variable.value && typeof variable.name === 'string') {
				if (variable.type && displayType) {
					text += ': ';
					data.type.textContent = variable.type + ' =';
				} else {
					text += ' =';
				}
			}

			data.label.set(text, options.highlights, variable.type && !displayType ? variable.type : variable.name);
			data.name.classList.toggle('virtual', variable.presentationHint?.kind === 'virtual');
			data.name.classList.toggle('internal', variable.presentationHint?.visibility === 'internal');
		} else if (variable.value && typeof variable.name === 'string' && variable.name) {
			data.label.set(':');
		}

		data.expression.classList.toggle('lazy', !!variable.presentationHint?.lazy);
		const commands = [
			{ id: COPY_VALUE_ID, args: [variable, [variable]] as unknown[] }
		];
		if (variable.evaluateName) {
			commands.push({ id: COPY_EVALUATE_PATH_ID, args: [{ variable }] });
		}

		return this.renderValue(data.value, variable, {
			showChanged: options.showChanged,
			maxValueLength: MAX_VALUE_RENDER_LENGTH_IN_VIEWLET,
			hover: { commands },
			colorize: true,
			session: variable.getSession(),
		});
	}

	renderValue(container: HTMLElement, expressionOrValue: IExpressionValue | string, options: IRenderValueOptions = {}): IDisposable {
		const store = new DisposableStore();
		// Use remembered capabilities so REPL elements can render even once a session ends
		const supportsANSI = !!options.session?.rememberedCapabilities?.supportsANSIStyling;

		let value = typeof expressionOrValue === 'string' ? expressionOrValue : expressionOrValue.value;

		// remove stale classes
		for (const cls of allClasses) {
			container.classList.remove(cls);
		}
		container.classList.add(Cls.Value);
		// when resolving expressions we represent errors from the server as a variable with name === null.
		if (value === null || ((expressionOrValue instanceof Expression || expressionOrValue instanceof Variable || expressionOrValue instanceof ReplEvaluationResult) && !expressionOrValue.available)) {
			container.classList.add(Cls.Unavailable);
			if (value !== Expression.DEFAULT_VALUE) {
				container.classList.add(Cls.Error);
			}
		} else {
			if (typeof expressionOrValue !== 'string' && options.showChanged && expressionOrValue.valueChanged && value !== Expression.DEFAULT_VALUE) {
				// value changed color has priority over other colors.
				container.classList.add(Cls.Changed);
				expressionOrValue.valueChanged = false;
			}

			if (options.colorize && typeof expressionOrValue !== 'string') {
				if (expressionOrValue.type === 'number' || expressionOrValue.type === 'boolean' || expressionOrValue.type === 'string') {
					container.classList.add(expressionOrValue.type);
				} else if (!isNaN(+value)) {
					container.classList.add(Cls.Number);
				} else if (booleanRegex.test(value)) {
					container.classList.add(Cls.Boolean);
				} else if (stringRegex.test(value)) {
					container.classList.add(Cls.String);
				}
			}
		}

		if (options.maxValueLength && value && value.length > options.maxValueLength) {
			value = value.substring(0, options.maxValueLength) + '...';
		}
		if (!value) {
			value = '';
		}

		const session = options.session ?? ((expressionOrValue instanceof ExpressionContainer) ? expressionOrValue.getSession() : undefined);
		// Only use hovers for links if thre's not going to be a hover for the value.
		const hoverBehavior: DebugLinkHoverBehaviorTypeData = options.hover === false ? { type: DebugLinkHoverBehavior.Rich, store } : { type: DebugLinkHoverBehavior.None };
		dom.clearNode(container);
		const locationReference = options.locationReference ?? (expressionOrValue instanceof ExpressionContainer && expressionOrValue.valueLocationReference);

		let linkDetector: ILinkDetector = this.linkDetector;
		if (locationReference && session) {
			linkDetector = this.linkDetector.makeReferencedLinkDetector(locationReference, session);
		}

		if (supportsANSI) {
			container.appendChild(handleANSIOutput(value, linkDetector, session ? session.root : undefined));
		} else {
			container.appendChild(linkDetector.linkify(value, false, session?.root, true, hoverBehavior));
		}

		if (options.hover !== false) {
			const { commands = [] } = options.hover || {};
			store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), container, () => {
				const container = dom.$('div');
				const markdownHoverElement = dom.$('div.hover-row');
				const hoverContentsElement = dom.append(markdownHoverElement, dom.$('div.hover-contents'));
				const hoverContentsPre = dom.append(hoverContentsElement, dom.$('pre.debug-var-hover-pre'));
				if (supportsANSI) {
					// note: intentionally using `this.linkDetector` so we don't blindly linkify the
					// entire contents and instead only link file paths that it contains.
					hoverContentsPre.appendChild(handleANSIOutput(value, this.linkDetector, session ? session.root : undefined));
				} else {
					hoverContentsPre.textContent = value;
				}
				container.appendChild(markdownHoverElement);
				return container;
			}, {
				actions: commands.map(({ id, args }) => {
					const description = CommandsRegistry.getCommand(id)?.metadata?.description;
					return {
						label: typeof description === 'string' ? description : description ? description.value : id,
						commandId: id,
						run: () => this.commandService.executeCommand(id, ...args),
					};
				})
			}));
		}

		return store;
	}
}
