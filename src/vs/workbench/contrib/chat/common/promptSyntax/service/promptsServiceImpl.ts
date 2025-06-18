/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import {
  getPromptsTypeForLanguageId,
  PROMPT_LANGUAGE_ID,
  PromptsType,
} from '../promptTypes.js';
import { PromptParser } from '../parsers/promptParser.js';
import { match, splitGlobAware } from '../../../../../../base/common/glob.js';
import type { URI } from '../../../../../../base/common/uri.js';
import type { IPromptFileReference } from '../parsers/types.js';
import { assert } from '../../../../../../base/common/assert.js';
import { basename } from '../../../../../../base/common/path.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { PromptFilesLocator } from '../utils/promptFilesLocator.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../../base/common/event.js';
import type { ITextModel } from '../../../../../../editor/common/model.js';
import { ObjectCache } from '../utils/objectCache.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { TextModelPromptParser } from '../parsers/textModelPromptParser.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import type {
  IChatPromptSlashCommand,
  ICustomChatMode,
  IMetadata,
  IPromptParserResult,
  IPromptPath,
  IPromptsService,
  TPromptsStorage,
} from './promptsService.js';
import {
  getCleanPromptName,
  PROMPT_FILE_EXTENSION,
} from '../config/promptFileLocations.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { PromptsConfig } from '../config/config.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';

/**
 * Provides prompt services.
 */
export class PromptsService extends Disposable implements IPromptsService {
  declare public readonly _serviceBrand: undefined;

  /**
   * Cache of text model content prompt parsers.
   */
  private readonly cache: ObjectCache<TextModelPromptParser, ITextModel>;

  /**
   * Prompt files locator utility.
   */
  private readonly fileLocator: PromptFilesLocator;

  /**
   * Lazily created event that is fired when the custom chat modes change.
   */
  private onDidChangeCustomChatModesEvent: Event<void> | undefined;

  constructor(
    @ILogService public readonly logger: ILogService,
    @ILabelService private readonly labelService: ILabelService,
    @IModelService private readonly modelService: IModelService,
    @IInstantiationService
    private readonly instantiationService: IInstantiationService,
    @IUserDataProfileService
    private readonly userDataService: IUserDataProfileService,
    @ILanguageService private readonly languageService: ILanguageService,
    @IConfigurationService
    private readonly configurationService: IConfigurationService
  ) {
    super();

    this.fileLocator = this._register(
      this.instantiationService.createInstance(PromptFilesLocator)
    );

    this.cache = this._register(
      new ObjectCache((model) => {
        assert(
          model.isDisposed() === false,
          'Text model must not be disposed.'
        );

        const parser: TextModelPromptParser = instantiationService
          .createInstance(TextModelPromptParser, model, { seenReferences: [] })
          .start();

        parser.assertNotDisposed('Created prompt parser must not be disposed.');

        return parser;
      })
    );
  }

  public async findInstructionFilesFor(
    files: readonly URI[],
    ignoreInstructions?: ResourceSet
  ): Promise<readonly { uri: URI; reason: string }[]> {
    const instructionFiles = await this.listPromptFiles(
      PromptsType.instructions,
      CancellationToken.None
    );
    if (instructionFiles.length === 0) {
      this.logger.trace(
        '[PromptsService#findInstructionFilesFor] No instruction files available.'
      );
      return [];
    }
    this.logger.trace(
      `[PromptsService#findInstructionFilesFor] ${files.length} input files provided. ${instructionFiles.length} instruction files available.`
    );

    const result: { uri: URI; reason: string }[] = [];
    const foundFiles = new ResourceSet();

    for (const instructionFile of instructionFiles) {
      const { metadata, uri } = await this.parse(
        instructionFile.uri,
        CancellationToken.None
      );

      if (metadata?.promptType !== PromptsType.instructions) {
        this.logger.trace(
          `[PromptsService#findInstructionFilesFor] Not an instruction file: ${uri}`
        );
        continue;
      }

      if (ignoreInstructions?.has(uri) || foundFiles.has(uri)) {
        this.logger.trace(
          `[PromptsService#findInstructionFilesFor] Skipping already processed instruction file: ${uri}`
        );
        continue;
      }

      const { applyTo } = metadata;
      if (applyTo === undefined) {
        continue;
      }

      const patterns = splitGlobAware(applyTo, ',');
      let matches = false;

      const patternMatches = (pattern: string): URI | true | false => {
        pattern = pattern.trim();
        if (!pattern) return false;
        if (['**', '**/*', '*'].includes(pattern)) return true;
        if (!pattern.startsWith('/') && !pattern.startsWith('**/')) {
          pattern = '**/' + pattern;
        }
        for (const file of files) {
          if (match(pattern, file.path)) return file;
        }
        return false;
      };

      for (const pattern of patterns) {
        const matchResult = patternMatches(pattern);
        if (matchResult !== false) {
          const reason =
            matchResult === true
              ? localize(
                  'instruction.file.reason.allFiles',
                  'Automatically attached as pattern is **'
                )
              : localize(
                  'instruction.file.reason.specificFile',
                  'Automatically attached as pattern {0} matches {1}',
                  applyTo,
                  this.labelService.getUriLabel(matchResult, {
                    relative: true,
                  })
                );

          result.push({ uri, reason });
          foundFiles.add(uri);
          this.logger.trace(
            `[PromptsService#findInstructionFilesFor] ${uri} selected: ${reason}`
          );
          matches = true;
          break;
        }
      }

      if (!matches) {
        this.logger.trace(
          `[PromptsService#findInstructionFilesFor] ${uri} no match: pattern: ${applyTo}`
        );
      }
    }

    return result;
  }

  public async getAllMetadata(
    promptUris: readonly URI[]
  ): Promise<IMetadata[]> {
    const metadata = await Promise.all(
      promptUris.map(async (uri) => {
        let parser: PromptParser | undefined;
        try {
          parser = this.instantiationService
            .createInstance(PromptParser, uri, { allowNonPromptFiles: true })
            .start();

          await parser.allSettled();

          return collectMetadata(parser);
        } finally {
          parser?.dispose();
        }
      })
    );

    return metadata;
  }
}

/**
 * Collect all metadata from prompt file references
 * into a single hierarchical tree structure.
 */
function collectMetadata(
  reference: Pick<IPromptFileReference, 'uri' | 'metadata' | 'references'>
): IMetadata {
  const childMetadata: IMetadata[] = [];
  for (const child of reference.references) {
    if (child.errorCondition !== undefined) {
      continue;
    }

    childMetadata.push(collectMetadata(child));
  }

  const children = childMetadata.length > 0 ? childMetadata : undefined;

  return {
    uri: reference.uri,
    metadata: reference.metadata,
    children,
  };
}

export function getPromptCommandName(path: string): string {
  const name = basename(path, PROMPT_FILE_EXTENSION);
  return name;
}

/**
 * Utility to add a provided prompt `storage` and
 * `type` attributes to a prompt URI.
 */
function addType(
  storage: TPromptsStorage,
  type: PromptsType
): (uri: URI) => IPromptPath {
  return (uri) => {
    return { uri, storage, type };
  };
}

/**
 * Utility to add a provided prompt `type` to a list of prompt URIs.
 */
function withType(
  storage: TPromptsStorage,
  type: PromptsType
): (uris: readonly URI[]) => readonly IPromptPath[] {
  return (uris) => {
    return uris.map(addType(storage, type));
  };
}
