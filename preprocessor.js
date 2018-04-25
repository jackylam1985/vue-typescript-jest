const fs = require('fs')
const path = require('path')

var defaultBabelOptions = {
	presets: ['es2015'],
	plugins: ['transform-runtime'],
}

function ts(src, filePath) {
	// Microsoft's ts.findConfigFilepath does not work under Windows (hard coded '/' as directory separator)
	// https://github.com/Microsoft/TypeScript/pull/9625 probably fixes this but is open since July 11th
	function findConfigFile(filePath) {
		let prev = null
		do {
			const testPath = path.join(filePath, 'tsconfig.json')
			if (fs.existsSync(testPath)) {
				return testPath
			}
			prev = filePath
			filePath = path.dirname(filePath)
		} while (prev !== filePath)
		return undefined
	}
	const ts = require('typescript')
	const tsConfigPath = findConfigFile(filePath)
	if (!tsConfigPath) {
		throw 'tsconfig.json not found for ' + filePath
	}
	const tsOptions = require(tsConfigPath)
	const options = {
		compilerOptions: tsOptions.compilerOptions,
		moduleName: '',
		reportDiagnostics: true,
		fileName: filePath,
	}
	const res = ts.transpileModule(src, options)
	if (res.diagnostics.length > 0) {
		let err = ''
		res.diagnostics.forEach(diagnostic => {
			const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
			const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
			err += `${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}\n`
		})
		throw err
	}
	return res.outputText
}

function babel(src) {
	let babelc
	try {
		babelc = require('babel-core')
	} catch (e) {
		// do nothing
	}
	if (babelc) {
		return babelc.transform(src, defaultBabelOptions).code
	} else {
		return src
	}
}

// this is heavily based on vueify (Copyright (c) 2014-2016 Evan You)
function vue(src, filePath) {
	function toFunction (code) {
		const transpile = require('vue-template-es2015-compiler')
		return transpile('function render () {' + code + '}')
	}
	const vueCompiler = require('vue-template-compiler')
	const parts = vueCompiler.parseComponent(src, { pad: true })
	let script = ''
	if (script) {
		if (!parts.script.lang) {
			script = babel(parts.script.content)
		} else if (parts.script.lang === 'ts') {
			script = babel(ts(parts.script.content, filePath))
		} else {
			throw filePath + ': unknown <script lang="' + parts.script.lang + '">'
		}
	}
	let html = ''
	if (!parts.template.lang || parts.template.lang === 'html') {
		html = parts.template.content
	} else if (parts.template.lang === 'pug') {
		html = require('pug').compile(parts.template.content)()
	} else {
		throw filePath + ': unknown <template lang="' + parts.template.lang + '">'
	}
	// mostly copy & paste from vueify
	const compiled = vueCompiler.compile(html)
	const template = {
		render: toFunction(compiled.render),
		staticRenderFns: '[' + compiled.staticRenderFns.map(toFunction).join(',') + ']'
	}
	let output = ''
	output +=
			';(function(){\n' + script + '\n})()\n' +
			// babel 6 compat
			'if (module.exports.__esModule) module.exports = module.exports.default\n'
	output += 'var __vue__options__ = (typeof module.exports === "function"' +
			'? module.exports.options' +
			': module.exports)\n'
	output +=
			'__vue__options__.render = ' + template.render + '\n' +
			'__vue__options__.staticRenderFns = ' + template.staticRenderFns + '\n'
	return output
}

module.exports = {
	process(src, filePath) {
		let output = src
		if (filePath.endsWith('.ts')) {
			output = ts(src, filePath)
		} else if (filePath.endsWith('.vue')) {
			output = vue(src, filePath)
		} else if (filePath.endsWith('.js')) {
			output = babel(src, filePath)
		}
		return output
	},
}