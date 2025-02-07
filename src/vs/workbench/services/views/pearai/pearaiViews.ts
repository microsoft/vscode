import { ViewContainer, ViewContainerLocation } from '../../../common/views.js';

import { IExtensionService } from '../../extensions/common/extensions.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ILoggerService } from '../../../../platform/log/common/log.js';
import { ViewDescriptorService } from '../browser/viewDescriptorService.js';
import { auxiliaryBarAllowedViewContainerIDs } from './pearaiViewsShared.js';

export class PearAIViewDescriptorService extends ViewDescriptorService implements IViewDescriptorService {
	constructor(
        @IInstantiationService instantiationService: IInstantiationService,
        @IContextKeyService contextKeyService: IContextKeyService,
        @IStorageService storageService: IStorageService,
        @IExtensionService extensionService: IExtensionService,
        @ITelemetryService telemetryService: ITelemetryService,
        @ILoggerService loggerService: ILoggerService,
    ) {
        super(instantiationService, contextKeyService, storageService, extensionService, telemetryService, loggerService);
	}

  override moveViewContainerToLocation(
    viewContainer: ViewContainer,
    location: ViewContainerLocation,
  ): void {
    const isAllowed = () => {
        return auxiliaryBarAllowedViewContainerIDs.some(id => viewContainer.id.includes(id));
    };

    // Prevent non-allowed containers from moving to AuxiliaryBar
    if (location === ViewContainerLocation.AuxiliaryBar && !isAllowed()) {
      return;
    }

    // Prevent PearAI integrations from moving out of AuxiliaryBar
    if (location !== ViewContainerLocation.AuxiliaryBar && isAllowed()) {
      return;
    }

    super.moveViewContainerToLocation(viewContainer, location);
  }
}
