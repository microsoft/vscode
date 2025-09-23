/*
 * insert_xref.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */
import { Node as ProsemirrorNode } from 'prosemirror-model';
import React, { ChangeEvent } from 'react';
import { createRoot } from 'react-dom/client';

import { FixedSizeList, ListChildComponentProps } from 'react-window';
import uniqBy from 'lodash.uniqby';
import debounce from 'lodash.debounce';

import { EditorUI } from "../../api/ui-types";
import { WidgetProps } from '../../api/widgets/react';
import { DialogButtons } from '../../api/widgets/dialog-buttons';
import { xrefKey } from '../../api/xref';
import { TextInput } from '../../api/widgets/text';
import { SelectInput } from '../../api/widgets/select';
import { NavigationTree, NavigationTreeNode } from '../../api/widgets/navigation-tree';
import { kQuartoXRefTypes } from '../../marks/xref/xref-completion';

import { xrefIndex } from './insert_xref_index';
import './insert_xref-styles.css';
import { EditorServer, XRef, kAlertTypeError } from 'editor-types';

// Keep the most recently used selected style around
let lastSelectedStyleIndex = 0;

// Height of textbox including border
const kXrefSearchBoxHeight = 30;

// constants
const kStyleDefault = "Default";
const kStyleCustom = "Custom";
const kStyleCapital = "Capitalize";
const kStyleNone = "(None)";

// Styles used for xrefs
const kXRefStyles: XRefStyle[] = [
  {
    key: kStyleDefault,
    fn: (key: string) => {
      return `@${key}`;
    }
  },
  {
    key: kStyleCapital,
    fn: (key: string) => {
      return `@${key.charAt(0).toUpperCase() + key.slice(1)}`;
    }
  },
  {
    key: kStyleCustom,
    fn: (key: string) => {
      return `@${key}`;
    }
  },
  {
    key: kStyleNone,
    fn: (key: string) => {
      return `-@${key}`;
    }
  },
];

interface XRefStyle {
  key: string;
  fn: (key: string) => string;
}

// Types (prefixes + display) for xrefs
const kTheoremTypes = ["thm", "lem", "cor", "prp", "cnj", "def", "exm", "exr"];
const kSecType = "sec";
const kFigType = "fig";
const kTableType = "tbl";
const kEquationType = "eq";
const kListingtype = "lst";

const xRefTypes = [
  {
    type: "All Types",
    prefix: [kSecType, kFigType, kTableType, kEquationType, kListingtype, ...kTheoremTypes],
    image: (ui: EditorUI) => {
      return ui.images.xrefs?.type_all;
    }
  },
  {
    type: "Sections",
    prefix: [kSecType],
    image: (ui: EditorUI) => {
      return ui.images.xrefs?.type_section;
    }
  },
  {
    type: "Figures",
    prefix: [kFigType],
    image: (ui: EditorUI) => {
      return ui.images.xrefs?.type_figure;
    }
  },
  {
    type: "Tables",
    prefix: [kTableType],
    image: (ui: EditorUI) => {
      return ui.images.xrefs?.type_table;
    }
  },
  {
    type: "Equations",
    prefix: [kEquationType],
    image: (ui: EditorUI) => {
      return ui.images.xrefs?.type_equation;
    }
  },
  {
    type: "Listings",
    prefix: [kListingtype],
    image: (ui: EditorUI) => {
      return ui.images.xrefs?.type_listing;
    }
  },
  {
    type: "Theorems",
    prefix: kTheoremTypes,
    image: (ui: EditorUI) => {
      return ui.images.xrefs?.type_theorem;
    }
  },
];


export async function insertXref(
  ui: EditorUI,
  doc: ProsemirrorNode,
  server: EditorServer,
  onInsertXref: (key: string, prefix?: string) => void
) {
  await ui.dialogs.htmlDialog(
    'Insert Cross Reference',
    'Insert',
    (
      containerWidth: number,
      containerHeight: number,
      confirm: VoidFunction,
      cancel: VoidFunction,
      _showProgress: (message: string) => void, 
      _hideProgress: VoidFunction,
      themed?: boolean
    ) => {
      const kMaxHeight = 400;
      const kMaxWidth = 650;
      const kMaxHeightProportion = 0.9;
      const kdialogPaddingIncludingButtons = 70;

      const windowHeight = containerHeight;
      const windowWidth = containerWidth;

      const height = Math.min(kMaxHeight, windowHeight * kMaxHeightProportion) - kdialogPaddingIncludingButtons;
      const width = Math.max(Math.min(kMaxWidth, windowWidth * 0.9), 550);

      const container = window.document.createElement('div');
      if (!themed) {
        container.className = 'pm-default-theme';
      }
   
      container.style.width = width + 'px';
      container.style.height = height + 75 + 'px';
      const root = createRoot(container);

      // Look up the document and initialize the state
      const docPath = ui.context.getDocumentPath() || "";

      // Read the xrefs
      const loadXRefs = async () => {
        if (docPath) {
          await ui.context.withSavedDocument();
          return (await server.xref.quartoIndexForFile(docPath)).refs;
        } else {
          return [];
        }
      };

      const onCancel = () => {
        root.unmount();
        cancel();
      };

      const onInsert = (xref: XRef, style: XRefStyle, prefix?: string) => {
        onInsertXref(style.fn(xrefKey(xref, "quarto")), prefix);
        root.unmount();
        confirm();
      };

      // REnder the panel
      root.render(
        <InsertXrefPanel
          height={height}
          width={width}
          themed={!!themed}
          styleIndex={lastSelectedStyleIndex}
          onOk={onInsert}
          onCancel={onCancel}
          doc={doc}
          ui={ui}
          loadXRefs={loadXRefs}
        />
      );
      return container;
    },
    () => {
      // Focus
      // dealt with in the React Component itself
    },
    () => {
      // Validation
      return null;
    },
  );
}

interface InsertXrefPanelProps extends WidgetProps {
  ui: EditorUI;
  doc: ProsemirrorNode;
  height: number;
  width: number;
  themed: boolean;
  styleIndex: number;
  loadXRefs: () => Promise<XRef[]>;
  onOk: (xref: XRef, style: XRefStyle, prefix?: string) => void;
  onCancel: () => void;
}

const InsertXrefPanel: React.FC<InsertXrefPanelProps> = props => {

  // State
  const [xrefs, setXrefs] = React.useState<XRef[]>();
  const [selectedXRefIndex, setSelectedXRefIndex] = React.useState<number>(0);
  const [selectedTypeIndex, setSelectedTypeIndex] = React.useState<number>(0);
  const [selectedStyleIndex, setSelectedStyleIndex] = React.useState<number>(props.styleIndex);
  const [filterText, setFilterText] = React.useState<string>("");

  // References to key controls
  const textRef = React.useRef<HTMLInputElement>(null);
  const fixedList = React.useRef<FixedSizeList>(null);
  const styleSelectRef = React.useRef<HTMLSelectElement>(null);
  const prefixRef = React.useRef<HTMLInputElement>(null);

  // Focus the custom prefix textbox when the user selects custom
  React.useEffect(() => {
    const option = styleSelectRef.current?.options[selectedStyleIndex];
    const key = option?.value || "";
    if (key === kStyleCustom) {
      prefixRef.current?.focus();
    }
  }, [selectedStyleIndex]);

  // Load the cross ref data when the dialog loads
  React.useEffect(() => {
    props.loadXRefs().then(values => {

      // Sort the data
      const sorted = values.sort((a, b) => {
        const typeOrder = a.type.localeCompare(b.type);
        if (typeOrder !== 0) {
          return typeOrder;
        } else {
          return a.id.localeCompare(b.id);
        }
      });

      // Ensure that the items are unique
      const unique = uniqBy(sorted, (xref => {
        return `${xref.type}-${xref.id}${xref.suffix}`;
      }));

      setXrefs(unique);
    });

    window.setTimeout(() => {
      textRef.current?.focus();
      if (styleSelectRef.current) {
        styleSelectRef.current.selectedIndex = lastSelectedStyleIndex;
      }
    });
  }, []);

  // The styles
  const styleOptions = kXRefStyles.map(style => (
    <option key={style.key} value={style.key}>
      {props.ui.context.translateText(style.key)}
    </option>
  ));


  // Filter the xrefs (by type or matching user typed text)
  const filterXrefs = () => {
    if (!xrefs) {
      return [];
    }

    let filtered = xrefs;
    if (selectedTypeIndex !== 0) {
      filtered = filtered.filter(xref => xRefTypes[selectedTypeIndex].prefix.includes(xref.type));
    }

    if (filterText) {
      const search = xrefIndex(filtered);
      filtered = search.search(filterText, 1000);
    }
    return filtered;
  };
  const filteredXrefs = filterXrefs();

  // The Types
  const typeNodes = xRefTypes.map(type => {
    return {
      key: type.type,
      image: type.image(props.ui),
      name: type.type,
      type: type.type,
      children: [],
      expanded: true,
    };
  });
  const selectedNode = typeNodes[selectedTypeIndex];


  // The current index (adjusted to ensure it is in bounds)
  const currentIndex = Math.min(selectedXRefIndex, filteredXrefs.length - 1);

  // Increments or decrements the index
  const incrementIndex = (increment: number) => {
    let newIndex = currentIndex;
    if (increment > 0) {
      newIndex = Math.min(currentIndex + increment, filteredXrefs.length - 1);
    } else {
      newIndex = Math.max(currentIndex + increment, 0);
    }
    if (newIndex !== currentIndex) {
      setSelectedXRefIndex(newIndex);
      fixedList.current?.scrollToItem(newIndex);
    }
  };

  const currentStyle = () => {
    const option = styleSelectRef.current?.options[selectedStyleIndex];
    const key = option?.value || "";
    return kXRefStyles.find(style => style.key === key) || kXRefStyles[0];
  };

  const currentPrefix = () => {
    return prefixRef.current?.value || undefined;
  };

  const placeholderText = () => {
    if (xrefs === undefined) {
      return props.ui.context.translateText("Loading Cross References");
    }
    return props.ui.context.translateText("No Matching Cross References Found.");
  };

  // Insert the item
  const insertItem = (index: number) => {
    const xref = filteredXrefs[index];
    const style = currentStyle();
    const prefix = style.key === kStyleCustom ? currentPrefix() : undefined;

    if (xref === undefined) {
      // There is no item selected
      props.ui.dialogs
        .alert(
          props.ui.context.translateText('Validation Error'),
          props.ui.context.translateText("Please select a cross reference to insert."),
          kAlertTypeError,
        );
    } else if (style.key === kStyleCustom && !prefix) {
      // Custom was selected, but no prefix provided
      props.ui.dialogs
        .alert(
          props.ui.context.translateText('Validation Error'),
          props.ui.context.translateText("Please enter a custom prefix for this reference."),
          kAlertTypeError,
        )
        .then(() => {
          prefixRef.current?.focus();
        });
    } else {
      lastSelectedStyleIndex = styleSelectRef.current?.selectedIndex || 0;
      props.onOk(xref, style, prefix);
    }
  };

  // debounce the text filtering
  const memoizedTextFilter = React.useCallback(
    debounce(
      (txt: string) => {
        setFilterText(txt);
      },
      30,
    ),
    [],
  );

  const kPageSize = 5;
  const handleKeyboardEvent = (event: React.KeyboardEvent<HTMLElement>) => {
    // Global Key Handling
    switch (event.key) {
      case 'ArrowUp':
        incrementIndex(-1);
        event.preventDefault();
        break;
      case 'ArrowDown':
        incrementIndex(1);
        event.preventDefault();
        break;
      case 'PageUp':
        incrementIndex(-kPageSize);
        event.preventDefault();
        break;
      case 'PageDown':
        incrementIndex(kPageSize);
        event.preventDefault();
        break;
      case 'Enter':
        acceptSelected();
        event.preventDefault();
        break;
      case 'Escape':
        props.onCancel();
        event.preventDefault();
        break;
      default:
        break;
    }
  };

  // Select the item
  const handleItemClicked = (index: number) => {
    setSelectedXRefIndex(index);
  };


  const handleItemDoubleClicked = (index: number) => {
    insertItem(index);
  };

  const acceptSelected = () => {
    insertItem(currentIndex);
  };

  // The user typed some text
  const handleTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    memoizedTextFilter(event?.target.value);
  };

  // Handle the updating type selection
  const handleStyleChanged = (event: ChangeEvent<Element>) => {
    const index = (event.target as HTMLSelectElement).selectedOptions[0].index;
    setSelectedStyleIndex(index);
  };

  const handleNodeSelected = (node: NavigationTreeNode) => {
    setSelectedTypeIndex(xRefTypes.findIndex(type => type.type === node.key));
  };

  const classes = ["pm-insert-xref-container"];
  if (!props.themed) {
    classes.push("pm-default-theme");
  }

  return (
    <div className="pm-insert-xref">
      <div className={classes.join(' ')}>
        <div className="pm-insert-xref-type-container pm-block-border-color pm-background-color">
          <NavigationTree
            height={props.height + kXrefSearchBoxHeight}
            nodes={typeNodes}
            selectedNode={selectedNode}
            onSelectedNodeChanged={handleNodeSelected}
          />
        </div>

        <div className="pm-insert-xref-list-container">
          <TextInput
            onKeyDown={handleKeyboardEvent}
            width={20 + 'ch'}
            iconAdornment={props.ui.images.search}
            tabIndex={0}
            className="pm-insert-xref-search-textbox"
            placeholder={props.ui.context.translateText("Search for Cross Reference")}
            onChange={handleTextChange}
            ref={textRef}
          />


          {filteredXrefs && filteredXrefs.length > 0 ? (
            <div
              onKeyDown={handleKeyboardEvent}
              tabIndex={0}
            >
              <FixedSizeList
                className="pm-insert-xref-list pm-block-border-color pm-background-color"
                height={props.height}
                width="100%"
                itemCount={filteredXrefs.length}
                itemSize={66}
                itemData={{
                  xrefs: filteredXrefs,
                  selectedIndex: currentIndex,
                  ui: props.ui,
                  onclick: handleItemClicked,
                  ondoubleclick: handleItemDoubleClicked
                }}
                ref={fixedList}
              >
                {XRefItem}
              </FixedSizeList>
            </div>

          ) : (
              <div
                className="pm-insert-xref-list-placeholder pm-block-border-color pm-background-color"
                style={{ height: props.height + "px" }}
              >
                <div>{placeholderText()}</div>
              </div>
            )}

        </div>
      </div>
      <div className='pm-insert-xref-insert-options'>

        <div className='pm-insert-xref-prefix'>
          <div>{[props.ui.context.translateText("Prefix")]}</div>
          <SelectInput
            tabIndex={0}
            ref={styleSelectRef}
            className="pm-insert-xref-select-style"
            onChange={handleStyleChanged}
          >
            {styleOptions}
          </SelectInput>
          {kXRefStyles[selectedStyleIndex].key === kStyleCustom ? (
            <TextInput
              width={20 + 'ch'}
              tabIndex={0}
              className="pm-insert-xref-custom-prefix"
              placeholder={props.ui.context.translateText("Enter Prefix")}
              ref={prefixRef}
            />) : (
              null
            )}
        </div>
        <div>
          <DialogButtons
            okLabel={props.ui.context.translateText('Insert')}
            cancelLabel={props.ui.context.translateText('Cancel')}
            onOk={acceptSelected}
            onCancel={props.onCancel}
          />
        </div>
      </div>
    </div>
  );
};

interface XRefItemProps extends ListChildComponentProps {
  data: {
    xrefs: XRef[],
    selectedIndex: number
    ui: EditorUI,
    onclick: (index: number) => void,
    ondoubleclick: (index: number) => void
  };
}

const XRefItem = (props: XRefItemProps) => {
  const thisXref: XRef = props.data.xrefs[props.index];

  // The type (e.g. fig)
  const type = kQuartoXRefTypes[thisXref.type];

  // The id (e.g. fig-foobar)
  const id = xrefKey(thisXref, "quarto");

  // The display text for the entry
  const primaryText = `@${id}`;
  const secondaryText = thisXref.file;
  const detailText = thisXref.title || "";

  // The image and adornment
  const image = type?.image(props.data.ui) || props.data.ui.images.omni_insert.generic;

  // Click handlers
  const onItemClick = () => {
    props.data.onclick(props.index);
  };

  const onItemDoubleClick = () => {
    props.data.ondoubleclick(props.index);
  };

  // Whether this node is selected
  const selected = props.data.selectedIndex === props.index;
  const selectedClassName = `pm-xref-item${selected ? ' pm-list-item-selected' : ''}`;
  return (
    <div key={thisXref.id} style={props.style} className={selectedClassName} onClick={onItemClick} onDoubleClick={onItemDoubleClick}>
      <div className={`pm-xref-item-image-container ${thisXref.type}`}>
        <img src={image} className={'pm-xref-item-image pm-border-color'} draggable="false"/>
      </div>
      <div className={'pm-xref-item-body pm-text-color'}>
        <div className="pm-xref-item-title">
          <div className="pm-xref-item-primary pm-fixedwidth-font">{primaryText}</div>
          <div className="pm-xref-item-secondary">{secondaryText}</div>
        </div>
        <div>
          <div className="pm-xref-item-detail">{detailText}</div>
        </div>
      </div>
    </div>
  );
};
