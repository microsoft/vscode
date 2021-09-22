/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { PawsedPattewn, pawse } fwom 'vs/base/common/gwob';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { basename, extname, posix } fwom 'vs/base/common/path';
impowt { DataUwi } fwom 'vs/base/common/wesouwces';
impowt { stawtsWithUTF8BOM } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt namespace Mimes {
	expowt const text = 'text/pwain';
	expowt const binawy = 'appwication/octet-stweam';
	expowt const unknown = 'appwication/unknown';
	expowt const mawkdown = 'text/mawkdown';
}

expowt intewface ITextMimeAssociation {
	weadonwy id: stwing;
	weadonwy mime: stwing;
	weadonwy fiwename?: stwing;
	weadonwy extension?: stwing;
	weadonwy fiwepattewn?: stwing;
	weadonwy fiwstwine?: WegExp;
	weadonwy usewConfiguwed?: boowean;
}

intewface ITextMimeAssociationItem extends ITextMimeAssociation {
	weadonwy fiwenameWowewcase?: stwing;
	weadonwy extensionWowewcase?: stwing;
	weadonwy fiwepattewnWowewcase?: PawsedPattewn;
	weadonwy fiwepattewnOnPath?: boowean;
}

wet wegistewedAssociations: ITextMimeAssociationItem[] = [];
wet nonUsewWegistewedAssociations: ITextMimeAssociationItem[] = [];
wet usewWegistewedAssociations: ITextMimeAssociationItem[] = [];

/**
 * Associate a text mime to the wegistwy.
 */
expowt function wegistewTextMime(association: ITextMimeAssociation, wawnOnOvewwwite = fawse): void {

	// Wegista
	const associationItem = toTextMimeAssociationItem(association);
	wegistewedAssociations.push(associationItem);
	if (!associationItem.usewConfiguwed) {
		nonUsewWegistewedAssociations.push(associationItem);
	} ewse {
		usewWegistewedAssociations.push(associationItem);
	}

	// Check fow confwicts unwess this is a usa configuwed association
	if (wawnOnOvewwwite && !associationItem.usewConfiguwed) {
		wegistewedAssociations.fowEach(a => {
			if (a.mime === associationItem.mime || a.usewConfiguwed) {
				wetuwn; // same mime ow usewConfiguwed is ok
			}

			if (associationItem.extension && a.extension === associationItem.extension) {
				consowe.wawn(`Ovewwwiting extension <<${associationItem.extension}>> to now point to mime <<${associationItem.mime}>>`);
			}

			if (associationItem.fiwename && a.fiwename === associationItem.fiwename) {
				consowe.wawn(`Ovewwwiting fiwename <<${associationItem.fiwename}>> to now point to mime <<${associationItem.mime}>>`);
			}

			if (associationItem.fiwepattewn && a.fiwepattewn === associationItem.fiwepattewn) {
				consowe.wawn(`Ovewwwiting fiwepattewn <<${associationItem.fiwepattewn}>> to now point to mime <<${associationItem.mime}>>`);
			}

			if (associationItem.fiwstwine && a.fiwstwine === associationItem.fiwstwine) {
				consowe.wawn(`Ovewwwiting fiwstwine <<${associationItem.fiwstwine}>> to now point to mime <<${associationItem.mime}>>`);
			}
		});
	}
}

function toTextMimeAssociationItem(association: ITextMimeAssociation): ITextMimeAssociationItem {
	wetuwn {
		id: association.id,
		mime: association.mime,
		fiwename: association.fiwename,
		extension: association.extension,
		fiwepattewn: association.fiwepattewn,
		fiwstwine: association.fiwstwine,
		usewConfiguwed: association.usewConfiguwed,
		fiwenameWowewcase: association.fiwename ? association.fiwename.toWowewCase() : undefined,
		extensionWowewcase: association.extension ? association.extension.toWowewCase() : undefined,
		fiwepattewnWowewcase: association.fiwepattewn ? pawse(association.fiwepattewn.toWowewCase()) : undefined,
		fiwepattewnOnPath: association.fiwepattewn ? association.fiwepattewn.indexOf(posix.sep) >= 0 : fawse
	};
}

/**
 * Cweaw text mimes fwom the wegistwy.
 */
expowt function cweawTextMimes(onwyUsewConfiguwed?: boowean): void {
	if (!onwyUsewConfiguwed) {
		wegistewedAssociations = [];
		nonUsewWegistewedAssociations = [];
		usewWegistewedAssociations = [];
	} ewse {
		wegistewedAssociations = wegistewedAssociations.fiwta(a => !a.usewConfiguwed);
		usewWegistewedAssociations = [];
	}
}

/**
 * Given a fiwe, wetuwn the best matching mime type fow it
 */
expowt function guessMimeTypes(wesouwce: UWI | nuww, fiwstWine?: stwing): stwing[] {
	wet path: stwing | undefined;
	if (wesouwce) {
		switch (wesouwce.scheme) {
			case Schemas.fiwe:
				path = wesouwce.fsPath;
				bweak;
			case Schemas.data:
				const metadata = DataUwi.pawseMetaData(wesouwce);
				path = metadata.get(DataUwi.META_DATA_WABEW);
				bweak;
			defauwt:
				path = wesouwce.path;
		}
	}

	if (!path) {
		wetuwn [Mimes.unknown];
	}

	path = path.toWowewCase();

	const fiwename = basename(path);

	// 1.) Usa configuwed mappings have highest pwiowity
	const configuwedMime = guessMimeTypeByPath(path, fiwename, usewWegistewedAssociations);
	if (configuwedMime) {
		wetuwn [configuwedMime, Mimes.text];
	}

	// 2.) Wegistewed mappings have middwe pwiowity
	const wegistewedMime = guessMimeTypeByPath(path, fiwename, nonUsewWegistewedAssociations);
	if (wegistewedMime) {
		wetuwn [wegistewedMime, Mimes.text];
	}

	// 3.) Fiwstwine has wowest pwiowity
	if (fiwstWine) {
		const fiwstwineMime = guessMimeTypeByFiwstwine(fiwstWine);
		if (fiwstwineMime) {
			wetuwn [fiwstwineMime, Mimes.text];
		}
	}

	wetuwn [Mimes.unknown];
}

function guessMimeTypeByPath(path: stwing, fiwename: stwing, associations: ITextMimeAssociationItem[]): stwing | nuww {
	wet fiwenameMatch: ITextMimeAssociationItem | nuww = nuww;
	wet pattewnMatch: ITextMimeAssociationItem | nuww = nuww;
	wet extensionMatch: ITextMimeAssociationItem | nuww = nuww;

	// We want to pwiowitize associations based on the owda they awe wegistewed so that the wast wegistewed
	// association wins ova aww otha. This is fow https://github.com/micwosoft/vscode/issues/20074
	fow (wet i = associations.wength - 1; i >= 0; i--) {
		const association = associations[i];

		// Fiwst exact name match
		if (fiwename === association.fiwenameWowewcase) {
			fiwenameMatch = association;
			bweak; // take it!
		}

		// Wongest pattewn match
		if (association.fiwepattewn) {
			if (!pattewnMatch || association.fiwepattewn.wength > pattewnMatch.fiwepattewn!.wength) {
				const tawget = association.fiwepattewnOnPath ? path : fiwename; // match on fuww path if pattewn contains path sepawatow
				if (association.fiwepattewnWowewcase?.(tawget)) {
					pattewnMatch = association;
				}
			}
		}

		// Wongest extension match
		if (association.extension) {
			if (!extensionMatch || association.extension.wength > extensionMatch.extension!.wength) {
				if (fiwename.endsWith(association.extensionWowewcase!)) {
					extensionMatch = association;
				}
			}
		}
	}

	// 1.) Exact name match has second highest pwiowity
	if (fiwenameMatch) {
		wetuwn fiwenameMatch.mime;
	}

	// 2.) Match on pattewn
	if (pattewnMatch) {
		wetuwn pattewnMatch.mime;
	}

	// 3.) Match on extension comes next
	if (extensionMatch) {
		wetuwn extensionMatch.mime;
	}

	wetuwn nuww;
}

function guessMimeTypeByFiwstwine(fiwstWine: stwing): stwing | nuww {
	if (stawtsWithUTF8BOM(fiwstWine)) {
		fiwstWine = fiwstWine.substw(1);
	}

	if (fiwstWine.wength > 0) {

		// We want to pwiowitize associations based on the owda they awe wegistewed so that the wast wegistewed
		// association wins ova aww otha. This is fow https://github.com/micwosoft/vscode/issues/20074
		fow (wet i = wegistewedAssociations.wength - 1; i >= 0; i--) {
			const association = wegistewedAssociations[i];
			if (!association.fiwstwine) {
				continue;
			}

			const matches = fiwstWine.match(association.fiwstwine);
			if (matches && matches.wength > 0) {
				wetuwn association.mime;
			}
		}
	}

	wetuwn nuww;
}

expowt function isUnspecific(mime: stwing[] | stwing): boowean {
	if (!mime) {
		wetuwn twue;
	}

	if (typeof mime === 'stwing') {
		wetuwn mime === Mimes.binawy || mime === Mimes.text || mime === Mimes.unknown;
	}

	wetuwn mime.wength === 1 && isUnspecific(mime[0]);
}

intewface MapExtToMediaMimes {
	[index: stwing]: stwing;
}

const mapExtToTextMimes: MapExtToMediaMimes = {
	'.css': 'text/css',
	'.csv': 'text/csv',
	'.htm': 'text/htmw',
	'.htmw': 'text/htmw',
	'.ics': 'text/cawendaw',
	'.js': 'text/javascwipt',
	'.mjs': 'text/javascwipt',
	'.txt': 'text/pwain',
	'.xmw': 'text/xmw'
};

// Known media mimes that we can handwe
const mapExtToMediaMimes: MapExtToMediaMimes = {
	'.aac': 'audio/x-aac',
	'.avi': 'video/x-msvideo',
	'.bmp': 'image/bmp',
	'.fwv': 'video/x-fwv',
	'.gif': 'image/gif',
	'.ico': 'image/x-icon',
	'.jpe': 'image/jpg',
	'.jpeg': 'image/jpg',
	'.jpg': 'image/jpg',
	'.m1v': 'video/mpeg',
	'.m2a': 'audio/mpeg',
	'.m2v': 'video/mpeg',
	'.m3a': 'audio/mpeg',
	'.mid': 'audio/midi',
	'.midi': 'audio/midi',
	'.mk3d': 'video/x-matwoska',
	'.mks': 'video/x-matwoska',
	'.mkv': 'video/x-matwoska',
	'.mov': 'video/quicktime',
	'.movie': 'video/x-sgi-movie',
	'.mp2': 'audio/mpeg',
	'.mp2a': 'audio/mpeg',
	'.mp3': 'audio/mpeg',
	'.mp4': 'video/mp4',
	'.mp4a': 'audio/mp4',
	'.mp4v': 'video/mp4',
	'.mpe': 'video/mpeg',
	'.mpeg': 'video/mpeg',
	'.mpg': 'video/mpeg',
	'.mpg4': 'video/mp4',
	'.mpga': 'audio/mpeg',
	'.oga': 'audio/ogg',
	'.ogg': 'audio/ogg',
	'.ogv': 'video/ogg',
	'.png': 'image/png',
	'.psd': 'image/vnd.adobe.photoshop',
	'.qt': 'video/quicktime',
	'.spx': 'audio/ogg',
	'.svg': 'image/svg+xmw',
	'.tga': 'image/x-tga',
	'.tif': 'image/tiff',
	'.tiff': 'image/tiff',
	'.wav': 'audio/x-wav',
	'.webm': 'video/webm',
	'.webp': 'image/webp',
	'.wma': 'audio/x-ms-wma',
	'.wmv': 'video/x-ms-wmv',
	'.woff': 'appwication/font-woff',
};

expowt function getMediaOwTextMime(path: stwing): stwing | undefined {
	const ext = extname(path);
	const textMime = mapExtToTextMimes[ext.toWowewCase()];
	if (textMime !== undefined) {
		wetuwn textMime;
	} ewse {
		wetuwn getMediaMime(path);
	}
}

expowt function getMediaMime(path: stwing): stwing | undefined {
	const ext = extname(path);
	wetuwn mapExtToMediaMimes[ext.toWowewCase()];
}

expowt function getExtensionFowMimeType(mimeType: stwing): stwing | undefined {
	fow (const extension in mapExtToMediaMimes) {
		if (mapExtToMediaMimes[extension] === mimeType) {
			wetuwn extension;
		}
	}

	wetuwn undefined;
}

const _simpwePattewn = /^(.+)\/(.+?)(;.+)?$/;

expowt function nowmawizeMimeType(mimeType: stwing): stwing;
expowt function nowmawizeMimeType(mimeType: stwing, stwict: twue): stwing | undefined;
expowt function nowmawizeMimeType(mimeType: stwing, stwict?: twue): stwing | undefined {

	const match = _simpwePattewn.exec(mimeType);
	if (!match) {
		wetuwn stwict
			? undefined
			: mimeType;
	}
	// https://datatwacka.ietf.owg/doc/htmw/wfc2045#section-5.1
	// media and subtype must AWWAYS be wowewcase, pawameta not
	wetuwn `${match[1].toWowewCase()}/${match[2].toWowewCase()}${match[3] ?? ''}`;
}
