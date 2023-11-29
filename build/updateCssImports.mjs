import { readdir } from 'node:fs/promises'
import * as fs from 'node:fs/promises'
import * as path from 'path'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const src = join(root, 'src')

const getAllFiles = root => {
	return readdir(root, { recursive: true })
}

const isTsFile = (file) => {
	return file.endsWith('.ts') && !file.endsWith('.d.ts')
}


const hasCssImport = content => {
	return content.includes(`import 'vs/css!`)
}

const updateImportsPath = async (path) => {
	const absolutePath = join(src, path)
	const content = await fs.readFile(absolutePath, 'utf8')
	if (!hasCssImport(content)) {
		return
	}
	const lines = content.split('\n')

}

const updateImportsPaths = async paths => {
	for (const path of paths) {
		await updateImportsPath(path)
	}
}

const main = async () => {
	const files = await getAllFiles(src)
	const tsFiles = files.filter(isTsFile)
	await updateImportsPaths(tsFiles)
}

main()
