import { assertIsDefined } from 'vs/base/common/types';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { MenuId, Action2, IAction2Options, IMenuService, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { createActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { parseLinkedText } from 'vs/base/common/linkedText';
import { IOpenerService } from 'vs/platform/opener/common/opener';