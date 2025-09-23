/*
 * LinkPopup.tsx
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

import { DecorationSet, EditorView } from 'prosemirror-view';
import { Selection, PluginKey } from 'prosemirror-state';

import * as React from 'react';

import ClipboardJS from 'clipboard';

import { EditorUI } from '../../api/ui-types';
import { LinkProps } from 'editor-types';
import { CommandFn } from '../../api/command';

import { selectionIsImageNode } from '../../api/selection';

import { showTooltip } from '../../api/widgets/tooltip';

import { WidgetProps } from '../../api/widgets/react';
import { LinkButton, ImageButton } from '../../api/widgets/button';
import { Popup } from '../../api/widgets/popup';
import { EditorNavigation, NavigationType } from '../../api/navigation-types';
import { Schema } from 'prosemirror-model';
import { textPopupDecorationPlugin, TextPopupTarget } from '../../api/text-popup';
import { isHttpURL } from '../../api/url';

export function linkPopupPlugin(
  schema: Schema,
  ui: EditorUI,
  nav: EditorNavigation,
  linkCmd: CommandFn,
  removeLinkCmd: CommandFn,
) {
  const kPopupChromeWidth = 70;
  const kMaxLinkWidth = 300;
  const maxWidth = kMaxLinkWidth + kPopupChromeWidth;

  return textPopupDecorationPlugin({
    key: new PluginKey<DecorationSet>('link-popup'),
    markType: schema.marks.link,
    maxWidth,
    createPopup: (view: EditorView, target: TextPopupTarget<LinkProps>, style: React.CSSProperties) => {
      return Promise.resolve(
        <LinkPopup
          link={target.attrs}
          maxLinkWidth={kMaxLinkWidth - 10} // prevent off by pixel(s) overflow
          linkCmd={linkCmd}
          removeLinkCmd={removeLinkCmd}
          view={view}
          ui={ui}
          nav={nav}
          style={style}
        />,
      );
    },
    specKey: (target: TextPopupTarget<LinkProps>) => {
      const linkText = target.attrs.heading ? target.attrs.heading : target.attrs.href;
      return `link:${linkText}`;
    },
    filter: (selection: Selection) => {
      return !selectionIsImageNode(schema, selection);
    },
    onCmdClick: (target: TextPopupTarget<LinkProps>) => {
      ui.display.openURL(target.attrs.href);
    },
  });
}

interface LinkPopupProps extends WidgetProps {
  link: LinkProps;
  maxLinkWidth: number;
  view: EditorView;
  ui: EditorUI;
  nav: EditorNavigation;
  linkCmd: CommandFn;
  removeLinkCmd: CommandFn;
}

const LinkPopup: React.FC<LinkPopupProps> = props => {
  // link
  const linkText = props.link.heading ? props.link.heading : props.link.href;
  const onLinkClicked = () => {
    props.view.focus();
    if (props.link.heading) {
      props.nav.navigate(NavigationType.Heading, props.link.heading);
    } else if (props.link.href.startsWith('#')) {
      props.nav.navigate(NavigationType.Href, props.link.href.substr(1));
    } else if (isHttpURL(props.link.href)) {
      props.ui.display.openURL(props.link.href);
    } else {
      props.ui.display.navigateToFile(props.link.href);
    }
  };

  // copy
  const showCopyButton = !props.link.heading && ClipboardJS.isSupported();
  let clipboard: ClipboardJS;
  const setCopyButton = (button: HTMLButtonElement | null) => {
    if (button) {
      clipboard = new ClipboardJS(button, {
        text: () => linkText,
      });
      clipboard.on('success', () => {
        showTooltip(button, props.ui.context.translateText('Copied to Clipboard'), 's');
      });
    } else {
      if (clipboard) {
        clipboard.destroy();
      }
    }
  };

  // remove
  const onRemoveClicked = () => {
    // in rstudio (w/ webkit) removing the link during the click results
    // in a page-navigation! defer to next event cycle to avoid this
    window.setTimeout(() => {
      props.removeLinkCmd(props.view.state, props.view.dispatch, props.view);
      props.view.focus();
    }, 0);
  };

  // edit
  const onEditClicked = () => {
    props.linkCmd(props.view.state, props.view.dispatch, props.view);
  };

  return (
    <Popup classes={['pm-popup-link']} style={props.style}>
      <LinkButton text={linkText} onClick={onLinkClicked} maxWidth={props.maxLinkWidth} />
      {showCopyButton ? (
        <ImageButton
          image={props.ui.images.copy!}
          classes={['pm-image-button-copy-link']}
          title={props.ui.context.translateText('Copy Link to Clipboard')}
          ref={setCopyButton}
        />
      ) : null}
      <ImageButton
        image={props.ui.images.removelink!}
        classes={['pm-image-button-remove-link']}
        title={props.ui.context.translateText('Remove Link')}
        onClick={onRemoveClicked}
      />
      <ImageButton
        image={props.ui.images.properties!}
        classes={['pm-image-button-edit-properties']}
        title={props.ui.context.translateText('Edit Attributes')}
        onClick={onEditClicked}
      />
    </Popup>
  );
};
