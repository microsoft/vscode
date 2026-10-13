/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { outdent } from 'outdent';
import { afterAll, describe, expect, test } from 'vitest';
import type * as vscode from 'vscode';
import { StringTextDocument } from '../../../editing/common/abstractText';
import { getStructureUsingIndentation } from '../../node/indentationStructure';
import { OverlayNode } from '../../node/nodes';
import { _dispose } from '../../node/parserImpl';
import { insertRangeMarkers } from './markers';

describe('getStructure', () => {
	afterAll(() => _dispose());

	function treeToFlatList(
		node: OverlayNode
	): { startIndex: number; endIndex: number; kind: string }[] {
		const result: { startIndex: number; endIndex: number; kind: string }[] =
			[];
		for (const child of node.children) {
			result.push({
				startIndex: child.startIndex,
				endIndex: child.endIndex,
				kind: child.kind.toUpperCase(),
			});
			result.push(...treeToFlatList(child));
		}
		return result;
	}

	async function srcWithAnnotatedStructure(
		source: string,
		languageId: string,
		formattingOptions: vscode.FormattingOptions
	) {
		const structure = await getStructureUsingIndentation(
			new StringTextDocument(source),
			languageId,
			formattingOptions
		);
		const flatList = structure ? treeToFlatList(structure) : [];
		return insertRangeMarkers(source, flatList);
	}

	describe('indentation structure', () => {
		test('csharp file', async () => {
			const source = outdent`
				using System.Collections.Generic;
				using System.Threading.Tasks;
				using Ardalis.GuardClauses;
				using Ardalis.Result;
				using Microsoft.eShopWeb.ApplicationCore.Entities.BasketAggregate;
				using Microsoft.eShopWeb.ApplicationCore.Interfaces;
				using Microsoft.eShopWeb.ApplicationCore.Specifications;

				namespace Microsoft.eShopWeb.ApplicationCore.Services;

				public class BasketService : IBasketService
				{
					private readonly IRepository<Basket> _basketRepository;
					private readonly IAppLogger<BasketService> _logger;

					public BasketService(IRepository<Basket> basketRepository,
						IAppLogger<BasketService> logger)
					{
						_basketRepository = basketRepository;
						_logger = logger;
					}

					public async Task<Basket> AddItemToBasket(string username, int catalogItemId, decimal price, int quantity = 1)
					{
						var basketSpec = new BasketWithItemsSpecification(username);
						var basket = await _basketRepository.FirstOrDefaultAsync(basketSpec);

						if (basket == null)
						{
							basket = new Basket(username);
							await _basketRepository.AddAsync(basket);
						}

						basket.AddItem(catalogItemId, price, quantity);

						await _basketRepository.UpdateAsync(basket);
						return basket;
					}

					public async Task DeleteBasketAsync(int basketId)
					{
						var basket = await _basketRepository.GetByIdAsync(basketId);
						Guard.Against.Null(basket, nameof(basket));
						await _basketRepository.DeleteAsync(basket);
					}

					public async Task<Result<Basket>> SetQuantities(int basketId, Dictionary<string, int> quantities)
					{
						var basketSpec = new BasketWithItemsSpecification(basketId);
						var basket = await _basketRepository.FirstOrDefaultAsync(basketSpec);

						foreach (var item in basket.Items)
						{
							if (quantities.TryGetValue(item.Id.ToString(), out var quantity))
							{
								_logger.LogInformation($"Updating quantity of item ID:{item.Id} to {quantity}.");
								item.SetQuantity(quantity);
							}
						}
						basket.RemoveEmptyItems();
						await _basketRepository.UpdateAsync(basket);
						return basket;
					}

					public async Task TransferBasketAsync(string anonymousId, string userName)
					{
						var anonymousBasketSpec = new BasketWithItemsSpecification(anonymousId);
						var anonymousBasket = await _basketRepository.FirstOrDefaultAsync(anonymousBasketSpec);
						if (anonymousBasket == null) return;
						var userBasketSpec = new BasketWithItemsSpecification(userName);
						var userBasket = await _basketRepository.FirstOrDefaultAsync(userBasketSpec);
						if (userBasket == null)
						{
							userBasket = new Basket(userName);
							await _basketRepository.AddAsync(userBasket);
						}
						foreach (var item in anonymousBasket.Items)
						{
							userBasket.AddItem(item.CatalogItemId, item.UnitPrice, item.Quantity);
						}
						await _basketRepository.UpdateAsync(userBasket);
						await _basketRepository.DeleteAsync(anonymousBasket);
					}
				}
				`;
			expect(
				await srcWithAnnotatedStructure(source, 'csharp', {
					tabSize: 4,
					insertSpaces: false,
				})
			).toMatchInlineSnapshot(`
				"<LINE>using System.Collections.Generic;
				</LINE><LINE-1>using System.Threading.Tasks;
				</LINE-1><LINE-2>using Ardalis.GuardClauses;
				</LINE-2><LINE-3>using Ardalis.Result;
				</LINE-3><LINE-4>using Microsoft.eShopWeb.ApplicationCore.Entities.BasketAggregate;
				</LINE-4><LINE-5>using Microsoft.eShopWeb.ApplicationCore.Interfaces;
				</LINE-5><LINE-6>using Microsoft.eShopWeb.ApplicationCore.Specifications;
				</LINE-6><LINE-7>
				</LINE-7><LINE-8>namespace Microsoft.eShopWeb.ApplicationCore.Services;
				</LINE-8><LINE-9>
				</LINE-9><LINE-10>public class BasketService : IBasketService
				</LINE-10><FOLD>{
				<LINE-11>	private readonly IRepository<Basket> _basketRepository;
				</LINE-11><LINE-12>	private readonly IAppLogger<BasketService> _logger;
				</LINE-12><LINE-13>
				</LINE-13><FOLD-1>	public BasketService(IRepository<Basket> basketRepository,
						IAppLogger<BasketService> logger)
				</FOLD-1><FOLD-2>	{
				<LINE-14>		_basketRepository = basketRepository;
				</LINE-14><LINE-15>		_logger = logger;
				</LINE-15>	}
				</FOLD-2><LINE-16>
				</LINE-16><LINE-17>	public async Task<Basket> AddItemToBasket(string username, int catalogItemId, decimal price, int quantity = 1)
				</LINE-17><FOLD-3>	{
				<LINE-18>		var basketSpec = new BasketWithItemsSpecification(username);
				</LINE-18><LINE-19>		var basket = await _basketRepository.FirstOrDefaultAsync(basketSpec);
				</LINE-19><LINE-20>
				</LINE-20><LINE-21>		if (basket == null)
				</LINE-21><FOLD-4>		{
				<LINE-22>			basket = new Basket(username);
				</LINE-22><LINE-23>			await _basketRepository.AddAsync(basket);
				</LINE-23>		}
				</FOLD-4><LINE-24>
				</LINE-24><LINE-25>		basket.AddItem(catalogItemId, price, quantity);
				</LINE-25><LINE-26>
				</LINE-26><LINE-27>		await _basketRepository.UpdateAsync(basket);
				</LINE-27><LINE-28>		return basket;
				</LINE-28>	}
				</FOLD-3><LINE-29>
				</LINE-29><LINE-30>	public async Task DeleteBasketAsync(int basketId)
				</LINE-30><FOLD-5>	{
				<LINE-31>		var basket = await _basketRepository.GetByIdAsync(basketId);
				</LINE-31><LINE-32>		Guard.Against.Null(basket, nameof(basket));
				</LINE-32><LINE-33>		await _basketRepository.DeleteAsync(basket);
				</LINE-33>	}
				</FOLD-5><LINE-34>
				</LINE-34><LINE-35>	public async Task<Result<Basket>> SetQuantities(int basketId, Dictionary<string, int> quantities)
				</LINE-35><FOLD-6>	{
				<LINE-36>		var basketSpec = new BasketWithItemsSpecification(basketId);
				</LINE-36><LINE-37>		var basket = await _basketRepository.FirstOrDefaultAsync(basketSpec);
				</LINE-37><LINE-38>
				</LINE-38><LINE-39>		foreach (var item in basket.Items)
				</LINE-39><FOLD-7>		{
				<LINE-40>			if (quantities.TryGetValue(item.Id.ToString(), out var quantity))
				</LINE-40><FOLD-8>			{
				<LINE-41>				_logger.LogInformation($"Updating quantity of item ID:{item.Id} to {quantity}.");
				</LINE-41><LINE-42>				item.SetQuantity(quantity);
				</LINE-42>			}
				</FOLD-8>		}
				</FOLD-7><LINE-43>		basket.RemoveEmptyItems();
				</LINE-43><LINE-44>		await _basketRepository.UpdateAsync(basket);
				</LINE-44><LINE-45>		return basket;
				</LINE-45>	}
				</FOLD-6><LINE-46>
				</LINE-46><LINE-47>	public async Task TransferBasketAsync(string anonymousId, string userName)
				</LINE-47><FOLD-9>	{
				<LINE-48>		var anonymousBasketSpec = new BasketWithItemsSpecification(anonymousId);
				</LINE-48><LINE-49>		var anonymousBasket = await _basketRepository.FirstOrDefaultAsync(anonymousBasketSpec);
				</LINE-49><LINE-50>		if (anonymousBasket == null) return;
				</LINE-50><LINE-51>		var userBasketSpec = new BasketWithItemsSpecification(userName);
				</LINE-51><LINE-52>		var userBasket = await _basketRepository.FirstOrDefaultAsync(userBasketSpec);
				</LINE-52><LINE-53>		if (userBasket == null)
				</LINE-53><FOLD-10>		{
				<LINE-54>			userBasket = new Basket(userName);
				</LINE-54><LINE-55>			await _basketRepository.AddAsync(userBasket);
				</LINE-55>		}
				</FOLD-10><LINE-56>		foreach (var item in anonymousBasket.Items)
				</LINE-56><FOLD-11>		{
				<LINE-57>			userBasket.AddItem(item.CatalogItemId, item.UnitPrice, item.Quantity);
				</LINE-57>		}
				</FOLD-11><LINE-58>		await _basketRepository.UpdateAsync(userBasket);
				</LINE-58><LINE-59>		await _basketRepository.DeleteAsync(anonymousBasket);
				</LINE-59>	}
				</FOLD-9>}</FOLD>"
			`);
		});

		test('issue #1034', async () => {
			const source = outdent`
				if(something) {
					console.log('something')
				} else {
					console.log('!something');
				}
					console.log('a line');
				`;
			expect(
				await srcWithAnnotatedStructure(source, 'plaintext', {
					tabSize: 4,
					insertSpaces: false,
				})
			).toMatchInlineSnapshot(`
				"<FOLD>if(something) {
					console.log('something')
				</FOLD><FOLD-1>} else {
					console.log('!something');
				</FOLD-1><FOLD-2>}
					console.log('a line');</FOLD-2>"
			`);
		});

		test('issue #6614', async () => {
			const source = outdent`
				<!-- Copyright (C) Microsoft Corporation. All rights reserved. -->
				<!DOCTYPE html>
				<html>
					<head>
						<meta charset="utf-8" />
					</head>

					<body aria-label="">
					</body>

					<!-- Startup (do not modify order of script tags!) -->
					<script src="../../../../bootstrap.js"></script>
					<script src="../../../../vs/loader.js"></script>
					<script src="../../../../bootstrap-window.js"></script>
					<script src="workbench.js"></script>
				</html>
				`;
			expect(
				await srcWithAnnotatedStructure(source, 'plaintext', {
					tabSize: 4,
					insertSpaces: false,
				})
			).toMatchInlineSnapshot(`
				"<LINE><!-- Copyright (C) Microsoft Corporation. All rights reserved. -->
				</LINE><LINE-1><!DOCTYPE html>
				</LINE-1><FOLD><html>
				<FOLD-1>	<head>
				<LINE-2>		<meta charset="utf-8" />
				</LINE-2>	</head>
				</FOLD-1><LINE-3>
				</LINE-3><LINE-4>	<body aria-label="">
				</LINE-4><LINE-5>	</body>
				</LINE-5><LINE-6>
				</LINE-6><LINE-7>	<!-- Startup (do not modify order of script tags!) -->
				</LINE-7><LINE-8>	<script src="../../../../bootstrap.js"></script>
				</LINE-8><LINE-9>	<script src="../../../../vs/loader.js"></script>
				</LINE-9><LINE-10>	<script src="../../../../bootstrap-window.js"></script>
				</LINE-10><LINE-11>	<script src="workbench.js"></script>
				</LINE-11></html></FOLD>"
			`);
		});

		test('issue #12306', async () => {
			const source = outdent`
				/*---------------------------------------------------------------------------------------------
				*  Copyright (c) Microsoft Corporation. All rights reserved.
				*  Licensed under the MIT License. See License.txt in the project root for license information.
				*--------------------------------------------------------------------------------------------*/

				/*
					@keyframes blink { 50% { border-color: orange; }  }
				*/

				.monaco-editor {
					.inline-edits-view-indicator {
						display: flex;

						z-index: 34; /* Below the find widget */
						height: 20px;

						color: var(--vscode-inlineEdit-indicator-foreground);
						background-color: var(--vscode-inlineEdit-indicator-background);
						border: 1px solid var(--vscode-inlineEdit-indicator-border);
						border-radius: 3px;

						align-items: center;
						padding: 2px;
						padding-right: 10px;
						margin: 0 4px;

						/*
						animation: blink 1s;
						animation-iteration-count: 3;
						*/

						opacity: 0;

						&.contained {
							transition: opacity 0.2s ease-in-out;
							transition-delay: 0.4s;
						}

						&.visible {
							opacity: 1;
						}

						&.top {
							opacity: 1;

							.icon {
								transform: rotate(90deg);
							}
						}

						&.bottom {
							opacity: 1;

							.icon {
								transform: rotate(-90deg);
							}
						}

						.icon {
							display: flex;
							align-items: center;
							margin: 0 2px;
							transform: none;
							transition: transform 0.2s ease-in-out;
							.codicon {
								color: var(--vscode-inlineEdit-indicator-foreground);
							}
						}

						.label {
							margin: 0 2px;

							display: flex;
							justify-content: center;
							width: 100%;
						}
					}

					.inline-edits-view {
						&.toolbarDropdownVisible, .editorContainer.showHover:hover {
							.toolbar {
								display: block;
							}
						}

						.editorContainer {
							color: var(--vscode-editorHoverWidget-foreground);

							.toolbar {
								display: none;
								border-top: 1px solid rgba(69, 69, 69, 0.5);
								background-color: var(--vscode-editorHoverWidget-statusBarBackground);

								a {
									color: var(--vscode-foreground);
								}

								a:hover {
									color: var(--vscode-foreground);
								}

								.keybinding {
									display: flex;
									margin-left: 4px;
									opacity: 0.6;
								}

								.keybinding .monaco-keybinding-key {
									font-size: 8px;
									padding: 2px 3px;
								}

								.availableSuggestionCount a {
									display: flex;
									min-width: 19px;
									justify-content: center;
								}

								.inlineSuggestionStatusBarItemLabel {
									margin-right: 2px;
								}

							}

							.preview {
								.monaco-editor {
									.view-overlays .current-line-exact {
										border: none;
									}

									.current-line-margin {
										border: none;
									}
								}
							}

							.inline-edits-view-zone.diagonal-fill {
								opacity: 0.5;
							}
						}
					}

					.strike-through {
						text-decoration: line-through;
					}

					.inlineCompletions-line-insert {
						background: var(--vscode-inlineEdit-modifiedChangedLineBackground);
					}

					.inlineCompletions-line-delete {
						background: var(--vscode-inlineEdit-originalChangedLineBackground);
					}

					.inlineCompletions-char-insert {
						background: var(--vscode-inlineEdit-modifiedChangedTextBackground);
					}

					.inlineCompletions-char-delete {
						background: var(--vscode-inlineEdit-originalChangedTextBackground);
					}

					.inlineCompletions-char-delete.diff-range-empty {
						margin-left: -1px;
						border-left: solid var(--vscode-inlineEdit-originalChangedTextBackground) 3px;
					}

					.inlineCompletions-char-insert.diff-range-empty {
						border-left: solid var(--vscode-inlineEdit-modifiedChangedTextBackground) 3px;
					}

					.inlineCompletions-char-delete.single-line-inline,
					.inlineCompletions-char-insert.single-line-inline {
						border-radius: 4px;
						border: 1px solid var(--vscode-editorHoverWidget-border);
						padding: 2px;
					}

					.inlineCompletions-char-delete.single-line-inline.empty,
					.inlineCompletions-char-insert.single-line-inline.empty {
						display: none;
					}

					/* Adjustments due to being a decoration */
					.inlineCompletions-char-delete.single-line-inline {
						margin: -2px 0 0 -2px;
					}

					.inlineCompletions.strike-through {
						text-decoration-thickness: 1px;
					}

					/* line replacement bubbles */

					.inlineCompletions-modified-bubble{
						background: var(--vscode-inlineEdit-modifiedChangedTextBackground);
					}

					.inlineCompletions-original-bubble{
						background: var(--vscode-inlineEdit-originalChangedTextBackground);
						border-radius: 4px;
					}

					.inlineCompletions-modified-bubble,
					.inlineCompletions-original-bubble {
						pointer-events: none;
					}

					.inlineCompletions-modified-bubble.start {
						border-top-left-radius: 4px;
						border-bottom-left-radius: 4px;
					}

					.inlineCompletions-modified-bubble.end {
						border-top-right-radius: 4px;
						border-bottom-right-radius: 4px;
					}

					.inline-edit.ghost-text,
					.inline-edit.ghost-text-decoration,
					.inline-edit.ghost-text-decoration-preview,
					.inline-edit.suggest-preview-text .ghost-text {
						&.syntax-highlighted {
							opacity: 1 !important;
						}
						background: var(--vscode-inlineEdit-modifiedChangedTextBackground) !important;
						outline: 2px slid var(--vscode-inlineEdit-modifiedChangedTextBackground) !important;

						font-style: normal !important;
					}
				}

				.monaco-menu-option {
					color: var(--vscode-editorActionList-foreground);
					font-size: 13px;
					padding: 0 10px;
					line-height: 26px;
					display: flex;
					gap: 8px;
					align-items: center;
					border-radius: 4px;
					cursor: pointer;

					&.active {
						background: var(--vscode-editorActionList-focusBackground);
						color: var(--vscode-editorActionList-focusForeground);
						outline: 1px solid var(--vscode-menu-selectionBorder, transparent);
						outline-offset: -1px;
					}
				}

				.inline-edits-view-gutter-indicator .codicon {
					margin-top: 1px; /* TODO: Move into gutter DOM initialization */
				}

				@keyframes wiggle {
					0% {
						transform: rotate(0) scale(1);
					}

					15%,
					45% {
						transform: rotate(.04turn) scale(1.1);
					}

					30%,
					60% {
						transform: rotate(-.04turn) scale(1.2);
					}

					100% {
						transform: rotate(0) scale(1);
					}
				}

				.inline-edits-view-gutter-indicator.wiggle .icon {
					animation-duration: .8s;
					animation-iteration-count: 1;
					animation-name: wiggle;
				}
				`;
			expect(
				await srcWithAnnotatedStructure(source, 'css', {
					tabSize: 4,
					insertSpaces: false,
				})
			).toMatchInlineSnapshot(`
				"<LINE>/*---------------------------------------------------------------------------------------------
				</LINE><LINE-1>*  Copyright (c) Microsoft Corporation. All rights reserved.
				</LINE-1><LINE-2>*  Licensed under the MIT License. See License.txt in the project root for license information.
				</LINE-2><LINE-3>*--------------------------------------------------------------------------------------------*/
				</LINE-3><LINE-4>
				</LINE-4><FOLD>/*
					@keyframes blink { 50% { border-color: orange; }  }
				</FOLD><LINE-5>*/
				</LINE-5><LINE-6>
				</LINE-6><FOLD-1>.monaco-editor {
				<FOLD-2>	.inline-edits-view-indicator {
				<LINE-7>		display: flex;
				</LINE-7><LINE-8>
				</LINE-8><LINE-9>		z-index: 34; /* Below the find widget */
				</LINE-9><LINE-10>		height: 20px;
				</LINE-10><LINE-11>
				</LINE-11><LINE-12>		color: var(--vscode-inlineEdit-indicator-foreground);
				</LINE-12><LINE-13>		background-color: var(--vscode-inlineEdit-indicator-background);
				</LINE-13><LINE-14>		border: 1px solid var(--vscode-inlineEdit-indicator-border);
				</LINE-14><LINE-15>		border-radius: 3px;
				</LINE-15><LINE-16>
				</LINE-16><LINE-17>		align-items: center;
				</LINE-17><LINE-18>		padding: 2px;
				</LINE-18><LINE-19>		padding-right: 10px;
				</LINE-19><LINE-20>		margin: 0 4px;
				</LINE-20><LINE-21>
				</LINE-21><LINE-22>		/*
				</LINE-22><LINE-23>		animation: blink 1s;
				</LINE-23><LINE-24>		animation-iteration-count: 3;
				</LINE-24><LINE-25>		*/
				</LINE-25><LINE-26>
				</LINE-26><LINE-27>		opacity: 0;
				</LINE-27><LINE-28>
				</LINE-28><FOLD-3>		&.contained {
				<LINE-29>			transition: opacity 0.2s ease-in-out;
				</LINE-29><LINE-30>			transition-delay: 0.4s;
				</LINE-30>		}
				</FOLD-3><LINE-31>
				</LINE-31><FOLD-4>		&.visible {
				<LINE-32>			opacity: 1;
				</LINE-32>		}
				</FOLD-4><LINE-33>
				</LINE-33><FOLD-5>		&.top {
				<LINE-34>			opacity: 1;
				</LINE-34><LINE-35>
				</LINE-35><FOLD-6>			.icon {
				<LINE-36>				transform: rotate(90deg);
				</LINE-36>			}
				</FOLD-6>		}
				</FOLD-5><LINE-37>
				</LINE-37><FOLD-7>		&.bottom {
				<LINE-38>			opacity: 1;
				</LINE-38><LINE-39>
				</LINE-39><FOLD-8>			.icon {
				<LINE-40>				transform: rotate(-90deg);
				</LINE-40>			}
				</FOLD-8>		}
				</FOLD-7><LINE-41>
				</LINE-41><FOLD-9>		.icon {
				<LINE-42>			display: flex;
				</LINE-42><LINE-43>			align-items: center;
				</LINE-43><LINE-44>			margin: 0 2px;
				</LINE-44><LINE-45>			transform: none;
				</LINE-45><LINE-46>			transition: transform 0.2s ease-in-out;
				</LINE-46><FOLD-10>			.codicon {
				<LINE-47>				color: var(--vscode-inlineEdit-indicator-foreground);
				</LINE-47>			}
				</FOLD-10>		}
				</FOLD-9><LINE-48>
				</LINE-48><FOLD-11>		.label {
				<LINE-49>			margin: 0 2px;
				</LINE-49><LINE-50>
				</LINE-50><LINE-51>			display: flex;
				</LINE-51><LINE-52>			justify-content: center;
				</LINE-52><LINE-53>			width: 100%;
				</LINE-53>		}
				</FOLD-11>	}
				</FOLD-2><LINE-54>
				</LINE-54><FOLD-12>	.inline-edits-view {
				<FOLD-13>		&.toolbarDropdownVisible, .editorContainer.showHover:hover {
				<FOLD-14>			.toolbar {
				<LINE-55>				display: block;
				</LINE-55>			}
				</FOLD-14>		}
				</FOLD-13><LINE-56>
				</LINE-56><FOLD-15>		.editorContainer {
				<LINE-57>			color: var(--vscode-editorHoverWidget-foreground);
				</LINE-57><LINE-58>
				</LINE-58><FOLD-16>			.toolbar {
				<LINE-59>				display: none;
				</LINE-59><LINE-60>				border-top: 1px solid rgba(69, 69, 69, 0.5);
				</LINE-60><LINE-61>				background-color: var(--vscode-editorHoverWidget-statusBarBackground);
				</LINE-61><LINE-62>
				</LINE-62><FOLD-17>				a {
				<LINE-63>					color: var(--vscode-foreground);
				</LINE-63>				}
				</FOLD-17><LINE-64>
				</LINE-64><FOLD-18>				a:hover {
				<LINE-65>					color: var(--vscode-foreground);
				</LINE-65>				}
				</FOLD-18><LINE-66>
				</LINE-66><FOLD-19>				.keybinding {
				<LINE-67>					display: flex;
				</LINE-67><LINE-68>					margin-left: 4px;
				</LINE-68><LINE-69>					opacity: 0.6;
				</LINE-69>				}
				</FOLD-19><LINE-70>
				</LINE-70><FOLD-20>				.keybinding .monaco-keybinding-key {
				<LINE-71>					font-size: 8px;
				</LINE-71><LINE-72>					padding: 2px 3px;
				</LINE-72>				}
				</FOLD-20><LINE-73>
				</LINE-73><FOLD-21>				.availableSuggestionCount a {
				<LINE-74>					display: flex;
				</LINE-74><LINE-75>					min-width: 19px;
				</LINE-75><LINE-76>					justify-content: center;
				</LINE-76>				}
				</FOLD-21><LINE-77>
				</LINE-77><FOLD-22>				.inlineSuggestionStatusBarItemLabel {
				<LINE-78>					margin-right: 2px;
				</LINE-78>				}
				</FOLD-22><LINE-79>
				</LINE-79>			}
				</FOLD-16><LINE-80>
				</LINE-80><FOLD-23>			.preview {
				<FOLD-24>				.monaco-editor {
				<FOLD-25>					.view-overlays .current-line-exact {
				<LINE-81>						border: none;
				</LINE-81>					}
				</FOLD-25><LINE-82>
				</LINE-82><FOLD-26>					.current-line-margin {
				<LINE-83>						border: none;
				</LINE-83>					}
				</FOLD-26>				}
				</FOLD-24>			}
				</FOLD-23><LINE-84>
				</LINE-84><FOLD-27>			.inline-edits-view-zone.diagonal-fill {
				<LINE-85>				opacity: 0.5;
				</LINE-85>			}
				</FOLD-27>		}
				</FOLD-15>	}
				</FOLD-12><LINE-86>
				</LINE-86><FOLD-28>	.strike-through {
				<LINE-87>		text-decoration: line-through;
				</LINE-87>	}
				</FOLD-28><LINE-88>
				</LINE-88><FOLD-29>	.inlineCompletions-line-insert {
				<LINE-89>		background: var(--vscode-inlineEdit-modifiedChangedLineBackground);
				</LINE-89>	}
				</FOLD-29><LINE-90>
				</LINE-90><FOLD-30>	.inlineCompletions-line-delete {
				<LINE-91>		background: var(--vscode-inlineEdit-originalChangedLineBackground);
				</LINE-91>	}
				</FOLD-30><LINE-92>
				</LINE-92><FOLD-31>	.inlineCompletions-char-insert {
				<LINE-93>		background: var(--vscode-inlineEdit-modifiedChangedTextBackground);
				</LINE-93>	}
				</FOLD-31><LINE-94>
				</LINE-94><FOLD-32>	.inlineCompletions-char-delete {
				<LINE-95>		background: var(--vscode-inlineEdit-originalChangedTextBackground);
				</LINE-95>	}
				</FOLD-32><LINE-96>
				</LINE-96><FOLD-33>	.inlineCompletions-char-delete.diff-range-empty {
				<LINE-97>		margin-left: -1px;
				</LINE-97><LINE-98>		border-left: solid var(--vscode-inlineEdit-originalChangedTextBackground) 3px;
				</LINE-98>	}
				</FOLD-33><LINE-99>
				</LINE-99><FOLD-34>	.inlineCompletions-char-insert.diff-range-empty {
				<LINE-100>		border-left: solid var(--vscode-inlineEdit-modifiedChangedTextBackground) 3px;
				</LINE-100>	}
				</FOLD-34><LINE-101>
				</LINE-101><LINE-102>	.inlineCompletions-char-delete.single-line-inline,
				</LINE-102><FOLD-35>	.inlineCompletions-char-insert.single-line-inline {
				<LINE-103>		border-radius: 4px;
				</LINE-103><LINE-104>		border: 1px solid var(--vscode-editorHoverWidget-border);
				</LINE-104><LINE-105>		padding: 2px;
				</LINE-105>	}
				</FOLD-35><LINE-106>
				</LINE-106><LINE-107>	.inlineCompletions-char-delete.single-line-inline.empty,
				</LINE-107><FOLD-36>	.inlineCompletions-char-insert.single-line-inline.empty {
				<LINE-108>		display: none;
				</LINE-108>	}
				</FOLD-36><LINE-109>
				</LINE-109><LINE-110>	/* Adjustments due to being a decoration */
				</LINE-110><FOLD-37>	.inlineCompletions-char-delete.single-line-inline {
				<LINE-111>		margin: -2px 0 0 -2px;
				</LINE-111>	}
				</FOLD-37><LINE-112>
				</LINE-112><FOLD-38>	.inlineCompletions.strike-through {
				<LINE-113>		text-decoration-thickness: 1px;
				</LINE-113>	}
				</FOLD-38><LINE-114>
				</LINE-114><LINE-115>	/* line replacement bubbles */
				</LINE-115><LINE-116>
				</LINE-116><FOLD-39>	.inlineCompletions-modified-bubble{
				<LINE-117>		background: var(--vscode-inlineEdit-modifiedChangedTextBackground);
				</LINE-117>	}
				</FOLD-39><LINE-118>
				</LINE-118><FOLD-40>	.inlineCompletions-original-bubble{
				<LINE-119>		background: var(--vscode-inlineEdit-originalChangedTextBackground);
				</LINE-119><LINE-120>		border-radius: 4px;
				</LINE-120>	}
				</FOLD-40><LINE-121>
				</LINE-121><LINE-122>	.inlineCompletions-modified-bubble,
				</LINE-122><FOLD-41>	.inlineCompletions-original-bubble {
				<LINE-123>		pointer-events: none;
				</LINE-123>	}
				</FOLD-41><LINE-124>
				</LINE-124><FOLD-42>	.inlineCompletions-modified-bubble.start {
				<LINE-125>		border-top-left-radius: 4px;
				</LINE-125><LINE-126>		border-bottom-left-radius: 4px;
				</LINE-126>	}
				</FOLD-42><LINE-127>
				</LINE-127><FOLD-43>	.inlineCompletions-modified-bubble.end {
				<LINE-128>		border-top-right-radius: 4px;
				</LINE-128><LINE-129>		border-bottom-right-radius: 4px;
				</LINE-129>	}
				</FOLD-43><LINE-130>
				</LINE-130><LINE-131>	.inline-edit.ghost-text,
				</LINE-131><LINE-132>	.inline-edit.ghost-text-decoration,
				</LINE-132><LINE-133>	.inline-edit.ghost-text-decoration-preview,
				</LINE-133><FOLD-44>	.inline-edit.suggest-preview-text .ghost-text {
				<FOLD-45>		&.syntax-highlighted {
				<LINE-134>			opacity: 1 !important;
				</LINE-134>		}
				</FOLD-45><LINE-135>		background: var(--vscode-inlineEdit-modifiedChangedTextBackground) !important;
				</LINE-135><LINE-136>		outline: 2px slid var(--vscode-inlineEdit-modifiedChangedTextBackground) !important;
				</LINE-136><LINE-137>
				</LINE-137><LINE-138>		font-style: normal !important;
				</LINE-138>	}
				</FOLD-44>}
				</FOLD-1><LINE-139>
				</LINE-139><FOLD-46>.monaco-menu-option {
				<LINE-140>	color: var(--vscode-editorActionList-foreground);
				</LINE-140><LINE-141>	font-size: 13px;
				</LINE-141><LINE-142>	padding: 0 10px;
				</LINE-142><LINE-143>	line-height: 26px;
				</LINE-143><LINE-144>	display: flex;
				</LINE-144><LINE-145>	gap: 8px;
				</LINE-145><LINE-146>	align-items: center;
				</LINE-146><LINE-147>	border-radius: 4px;
				</LINE-147><LINE-148>	cursor: pointer;
				</LINE-148><LINE-149>
				</LINE-149><FOLD-47>	&.active {
				<LINE-150>		background: var(--vscode-editorActionList-focusBackground);
				</LINE-150><LINE-151>		color: var(--vscode-editorActionList-focusForeground);
				</LINE-151><LINE-152>		outline: 1px solid var(--vscode-menu-selectionBorder, transparent);
				</LINE-152><LINE-153>		outline-offset: -1px;
				</LINE-153>	}
				</FOLD-47>}
				</FOLD-46><LINE-154>
				</LINE-154><FOLD-48>.inline-edits-view-gutter-indicator .codicon {
				<LINE-155>	margin-top: 1px; /* TODO: Move into gutter DOM initialization */
				</LINE-155>}
				</FOLD-48><LINE-156>
				</LINE-156><FOLD-49>@keyframes wiggle {
				<FOLD-50>	0% {
				<LINE-157>		transform: rotate(0) scale(1);
				</LINE-157>	}
				</FOLD-50><LINE-158>
				</LINE-158><LINE-159>	15%,
				</LINE-159><FOLD-51>	45% {
				<LINE-160>		transform: rotate(.04turn) scale(1.1);
				</LINE-160>	}
				</FOLD-51><LINE-161>
				</LINE-161><LINE-162>	30%,
				</LINE-162><FOLD-52>	60% {
				<LINE-163>		transform: rotate(-.04turn) scale(1.2);
				</LINE-163>	}
				</FOLD-52><LINE-164>
				</LINE-164><FOLD-53>	100% {
				<LINE-165>		transform: rotate(0) scale(1);
				</LINE-165>	}
				</FOLD-53>}
				</FOLD-49><LINE-166>
				</LINE-166><FOLD-54>.inline-edits-view-gutter-indicator.wiggle .icon {
				<LINE-167>	animation-duration: .8s;
				</LINE-167><LINE-168>	animation-iteration-count: 1;
				</LINE-168><LINE-169>	animation-name: wiggle;
				</LINE-169>}</FOLD-54>"
			`);
		});
	});
});
