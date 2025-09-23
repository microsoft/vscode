/*
 * auto-id.ts
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

// emulate pandoc behavior (https://pandoc.org/MANUAL.html#headings-and-sections)
export function pandocAutoIdentifier(text: string, asciify = false) {
  if (asciify) {
    text = pandocAsciify(text);
  }

  return (
    text
      // Remove all non-alphanumeric characters, except underscores, hyphens, and periods.
      .replace(/[!"#$%&')*+,/:;<=>?@[\\\]^`{|}~]/g, "") // filterPunct
      // Replace all spaces with hyphens
      .replace(/\s/g, "-")
      // Convert all alphabetic characters to lowercase
      .toLowerCase()
      // Remove everything up to the first letter
      .replace(/^[^A-Za-z]+/, "")
  );
}

// emulate github behavior (note that unemoji should be done prior to calling this)
// https://pandoc.org/MANUAL.html#extension-gfm_auto_identifiers
// https://github.com/jgm/pandoc/blob/83880b0dbc318703babfbb6905b1046fa48f1216/src/Text/Pandoc/Shared.hs#L539
export function gfmAutoIdentifier(text: string, asciify: boolean) {
  if (asciify) {
    text = pandocAsciify(text);
  }

  return text
    .replace(/[!"#$%&')*+,./:;<=>?@[\\\]^`{|}~]/g, "") // filterPunct (all but underscore and hyphen)
    .replace(/\s/g, "-") // spaceToDash
    .toLowerCase(); // toLower
}

// https://github.com/jgm/pandoc/blob/a5fa55969f1b4afc0ca3e38be50b69c65d43a460/src/Text/Pandoc/Asciify.hs
export function pandocAsciify(text: string) {
  const chars: number[] = [];
  const len = text.length;
  let newch;
  for (let i = 0; i < len; i++) {
    newch = "";
    const ch = text.charCodeAt(i);
    switch (ch) {
      case 192:
      case 193:
      case 194:
      case 195:
      case 196:
      case 197:
      case 256:
      case 258:
      case 260:
      case 461:
      case 512:
      case 514:
      case 550:
      case 7680:
      case 7840:
      case 7842:
        newch = "A";
        break;

      case 7682:
      case 7684:
      case 7686:
        newch = "B";
        break;

      case 199:
      case 262:
      case 264:
      case 266:
      case 268:
        newch = "C";
        break;

      case 270:
      case 7690:
      case 7692:
      case 7694:
      case 7696:
      case 7698:
        newch = "D";
        break;

      case 200:
      case 201:
      case 203:
      case 274:
      case 276:
      case 278:
      case 280:
      case 282:
      case 516:
      case 518:
      case 552:
      case 7704:
      case 7706:
      case 7864:
      case 7866:
      case 7868:
        newch = "E";
        break;

      case 7710:
        newch = "F";
        break;

      case 284:
      case 286:
      case 288:
      case 290:
      case 486:
      case 500:
      case 7712:
        newch = "G";
        break;

      case 292:
      case 542:
      case 7714:
      case 7716:
      case 7718:
      case 7720:
      case 7722:
        newch = "H";
        break;

      case 204:
      case 205:
      case 206:
      case 207:
      case 296:
      case 298:
      case 300:
      case 302:
      case 304:
      case 463:
      case 520:
      case 522:
      case 7724:
      case 7880:
      case 7882:
        newch = "I";
        break;

      case 308:
        newch = "J";
        break;

      case 310:
      case 488:
      case 7728:
      case 7730:
      case 7732:
      case 8490:
        newch = "K";
        break;

      case 313:
      case 315:
      case 317:
      case 7734:
      case 7738:
      case 7740:
        newch = "L";
        break;

      case 7742:
      case 7744:
      case 7746:
        newch = "M";
        break;

      case 209:
      case 323:
      case 325:
      case 327:
      case 504:
      case 7748:
      case 7750:
      case 7752:
      case 7754:
        newch = "N";
        break;

      case 210:
      case 211:
      case 212:
      case 213:
      case 214:
      case 332:
      case 334:
      case 336:
      case 416:
      case 465:
      case 490:
      case 524:
      case 526:
      case 558:
      case 7884:
      case 7886:
        newch = "O";
        break;

      case 7764:
      case 7766:
        newch = "P";
        break;

      case 340:
      case 342:
      case 344:
      case 528:
      case 530:
      case 7768:
      case 7770:
      case 7774:
        newch = "R";
        break;

      case 346:
      case 348:
      case 350:
      case 352:
      case 536:
      case 7776:
      case 7778:
        newch = "S";
        break;

      case 354:
      case 356:
      case 538:
      case 7786:
      case 7788:
      case 7790:
      case 7792:
        newch = "T";
        break;

      case 217:
      case 218:
      case 219:
      case 220:
      case 360:
      case 362:
      case 364:
      case 366:
      case 368:
      case 370:
      case 431:
      case 467:
      case 532:
      case 534:
      case 7794:
      case 7796:
      case 7798:
      case 7908:
      case 7910:
        newch = "U";
        break;

      case 7804:
      case 7806:
        newch = "V";
        break;

      case 372:
      case 7808:
      case 7810:
      case 7812:
      case 7814:
      case 7816:
        newch = "W";
        break;

      case 7818:
      case 7820:
        newch = "X";
        break;

      case 221:
      case 374:
      case 376:
      case 562:
      case 7822:
      case 7922:
      case 7924:
      case 7926:
      case 7928:
        newch = "Y";
        break;

      case 377:
      case 379:
      case 381:
      case 7824:
      case 7826:
      case 7828:
        newch = "Z";
        break;

      case 224:
      case 225:
      case 226:
      case 227:
      case 228:
      case 229:
      case 257:
      case 259:
      case 261:
      case 462:
      case 513:
      case 515:
      case 551:
      case 553:
      case 7681:
      case 7841:
      case 7843:
        newch = "a";
        break;

      case 7683:
      case 7685:
      case 7687:
        newch = "b";
        break;

      case 231:
      case 263:
      case 265:
      case 267:
      case 269:
        newch = "c";
        break;

      case 271:
      case 7691:
      case 7693:
      case 7695:
      case 7697:
      case 7699:
        newch = "d";
        break;

      case 232:
      case 233:
      case 234:
      case 235:
      case 275:
      case 277:
      case 279:
      case 281:
      case 283:
      case 517:
      case 519:
      case 7705:
      case 7707:
      case 7865:
      case 7867:
      case 7869:
        newch = "e";
        break;

      case 7711:
        newch = "f";
        break;

      case 285:
      case 287:
      case 289:
      case 291:
      case 487:
      case 501:
      case 7713:
        newch = "g";
        break;

      case 293:
      case 543:
      case 7715:
      case 7717:
      case 7719:
      case 7721:
      case 7723:
      case 7830:
        newch = "h";
        break;

      case 236:
      case 237:
      case 238:
      case 239:
      case 297:
      case 299:
      case 301:
      case 303:
      case 305:
      case 464:
      case 521:
      case 523:
      case 7725:
      case 7881:
      case 7883:
        newch = "i";
        break;

      case 309:
      case 496:
        newch = "j";
        break;

      case 311:
      case 489:
      case 7729:
      case 7731:
      case 7733:
        newch = "k";
        break;

      case 314:
      case 316:
      case 318:
      case 7735:
      case 7739:
      case 7741:
        newch = "l";
        break;

      case 7743:
      case 7745:
      case 7747:
        newch = "m";
        break;

      case 241:
      case 324:
      case 326:
      case 328:
      case 505:
      case 7749:
      case 7751:
      case 7753:
      case 7755:
        newch = "n";
        break;

      case 242:
      case 243:
      case 244:
      case 245:
      case 246:
      case 333:
      case 335:
      case 337:
      case 417:
      case 432:
      case 466:
      case 491:
      case 525:
      case 527:
      case 559:
      case 7885:
      case 7887:
        newch = "o";
        break;

      case 7765:
      case 7767:
        newch = "p";
        break;

      case 341:
      case 343:
      case 345:
      case 529:
      case 531:
      case 7769:
      case 7771:
      case 7775:
        newch = "r";
        break;

      case 347:
      case 349:
      case 351:
      case 353:
      case 537:
      case 7777:
      case 7779:
        newch = "s";
        break;

      case 355:
      case 357:
      case 539:
      case 7787:
      case 7789:
      case 7791:
      case 7793:
      case 7831:
        newch = "t";
        break;

      case 249:
      case 250:
      case 251:
      case 252:
      case 361:
      case 363:
      case 365:
      case 367:
      case 369:
      case 371:
      case 468:
      case 533:
      case 535:
      case 7795:
      case 7797:
      case 7799:
      case 7909:
      case 7911:
        newch = "u";
        break;

      case 7805:
      case 7807:
        newch = "v";
        break;

      case 373:
      case 7809:
      case 7811:
      case 7813:
      case 7815:
      case 7817:
      case 7832:
        newch = "w";
        break;

      case 7819:
      case 7821:
        newch = "x";
        break;

      case 253:
      case 255:
      case 375:
      case 563:
      case 7833:
      case 7923:
      case 7925:
      case 7927:
      case 7929:
        newch = "y";
        break;

      case 378:
      case 380:
      case 382:
      case 7825:
      case 7827:
      case 7829:
        newch = "z";
        break;

      case 894:
        newch = ";";
        break;

      case 8175:
        newch = "`";
        break;

      case 8800:
        newch = "=";
        break;

      case 8814:
        newch = "<";
        break;

      case 8815:
        newch = ">";
        break;
    }
    if (newch) {
      chars.push(newch.charCodeAt(0));
    } else if (ch < 128) {
      chars.push(ch);
    }
  }

  // return string
  return String.fromCharCode(...chars);
}
