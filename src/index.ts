import * as fs from 'fs-extra';
import * as ts from 'typescript';
import * as tstl from 'typescript-to-lua';

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { PipeWrenchConfig, PipeWrenchConfigSchema } from './config';

import Ajv from 'ajv';
import path from 'path';

const ajv = new Ajv();
type Scope = 'client' | 'server' | 'shared' | 'none';
const REIMPORT_TEMPLATE = fs
  .readFileSync(path.join(__dirname, '../lua/reimport_template.lua'))
  .toString();

const CLASSCREATE_TEMPLATE = fs
  .readFileSync(path.join(__dirname, '../lua/classcreate_template.lua'))
  .toString();

const PIPEWRENCH_FIXES = fs
  .readFileSync(path.join(__dirname, '../lua/pipewrench_fixes.lua'))
  .toString();

const fixRequire = (scope: Scope, lua: string): string => {
  if (lua.length === 0) return '';
  const fix = (fromImport: string): string => {
    let toImport = fromImport.replace(/\./g, '/');
    // Remove cross-references for client/server/shared.
    if (toImport.startsWith('shared/')) {
      toImport = toImport.substring('shared/'.length);
    } else if (toImport.startsWith('client/')) {
      if (scope === 'server') {
        console.warn(
          `Cannot reference code from src/client from src/server. ` +
            '(Code will fail when ran)'
        );
      }
      toImport = toImport.substring('client/'.length);
    } else if (toImport.startsWith('server/')) {
      if (scope === 'client') {
        console.warn(
          `Cannot reference code from src/server from src/client. ` +
            '(Code will fail when ran)'
        );
      }
      toImport = toImport.substring('server/'.length);
    }
    return toImport;
  };
  let index = -1;
  do {
    let fromImport = '';
    index = lua.indexOf('require("');
    if (index !== -1) {
      index += 9;
      // Grab the require string.
      while (index < lua.length) {
        const char = lua.charAt(index++);
        if (char === '"') break;
        fromImport += char;
      }
      const toImport = fix(fromImport);
      // Kahlua only works with '/', nor '.' in 'require(..)'.
      const from = 'require("' + fromImport + '")';
      const to = "require('" + toImport.replace(/\./g, '/') + "')";
      lua = lua.replace(from, to);
    }
  } while (index !== -1);

  return lua;
};

const applyReimportScript = (lua: string): string => {
  const assignments: string[] = [];
  let lines: (string | null)[] = lua.split('\n');
  lines = lines.reverse();
  lines.push(
    "local __PW__ClassExtends = require('pipewrench_fixes').__PW__ClassExtends"
  );
  lines = lines.reverse();

  type t = {
    name: string;
    extends: string;
    functions: string[][];
  };

  const classes: { [name: string]: t } = {};
  const classes_array: t[] = [];

  // Look for any PipeWrench assignments.
  for (const line of lines) {
    if (!line) continue;
    if (
      line.indexOf('local ') === 0 &&
      line.indexOf('____pipewrench.') !== -1
    ) {
      assignments.push(line.replace('local ', ''));
    }

    if (line.endsWith('__TS__Class()')) {
      let name = '';
      let line2 = line.trim();
      // Remove exports reference if needed.
      if (line2.startsWith('____exports.')) {
        line2 = line2.substring('____exports.'.length);
      }
      name = line2.split(' ')[0].trim();
      classes[name] = {
        name: '',
        extends: '',
        functions: []
      };
      classes_array.push(classes[name]);
    }
  }

  // Name phase.
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line) continue;
    if (line.indexOf('.name = ') !== 0) {
      const clazzObjName = line.split('.name = ')[0].trim();
      const clazz = classes[clazzObjName];
      if (clazz) {
        clazz.name = line.split('.name = ')[1].replaceAll('"', '').trim();
        lines[index] = null;
      }
    }
  }

  // Extends phase.
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line) continue;

    if (
      line.indexOf(
        'local __TS__ClassExtends = ____lualib.__TS__ClassExtends'
      ) === 0
    ) {
      lines[index] = null;
      continue;
    }

    if (line.indexOf('__TS__ClassExtends(') !== -1) {
      const line2 = line.split('TS__ClassExtends(')[1];
      const params = line2
        .split(')')[0]
        .split(',')
        .map((s) => s.trim());
      const clazz = classes[params[0]];
      if (clazz) {
        lines[index] = null;
        clazz.extends = params[1];
      }
    }
  }

  // Functions phase.
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line) continue;
    if (
      line.indexOf('.prototype.') !== -1 &&
      line.trim().indexOf('function ') === 0
    ) {
      const classObjName = line
        .substring('function '.length)
        .split('.prototype.')[0]
        .trim();
      const clazz = classes[classObjName];

      if (!clazz) continue;

      const startIndex = index;
      let endIndex = startIndex;

      while (index < lines.length - 1) {
        const line2 = lines[index];
        if (line2 && line2.indexOf('end') === 0) {
          break;
        }
        index++;
        endIndex = index;
      }

      const funcLines: string[] = [];
      for (let index2 = startIndex; index2 <= endIndex; index2++) {
        const line2 = lines[index2];
        if (line2) funcLines.push(line2);
        lines[index2] = null;
      }

      clazz.functions.push(funcLines);
    }
  }

  // Only generate a reimport codeblock if there's anything to import.
  if (!assignments.length) return lua;

  // Take out the returns statement so we can insert before it.
  lines.pop();
  const returnLine: string = lines.pop() as string;
  lines.push('');

  // Build the reimport event.
  let compiledImports = '';
  for (const assignment of assignments) compiledImports += `${assignment}\n`;
  const reimports = REIMPORT_TEMPLATE.replace(
    '-- {IMPORTS}',
    compiledImports.substring(0, compiledImports.length - 1)
  );

  let compiledClassCreate = '';
  for (const clazz of Object.values(classes)) {
    compiledClassCreate += `  __PW__ClassExtends(${clazz.name}, ${clazz.extends})\n`;
    const superCall = `${clazz.extends}.prototype.____constructor(`;

    for (const func of clazz.functions) {
      let inSuperClass = false;
      for (let fIndex = 0; fIndex < func.length; fIndex++) {
        const funcLine = func[fIndex];

        if (inSuperClass) {
          if (funcLine.startsWith('    )')) {
            compiledClassCreate += `  ${funcLine}\n`;
            compiledClassCreate += `      for key, value in pairs(__o__) do\n`;
            compiledClassCreate += `          self[key] = value\n`;
            compiledClassCreate += '      end\n';
            continue;
          }
        } else {
          if (funcLine.indexOf(superCall) !== -1) {
            if (funcLine.indexOf(superCall + ')') !== -1) {
              compiledClassCreate += `    local __o__ = ${funcLine.trimStart()})\n`;
              compiledClassCreate += `    for key, value in pairs(__o__) do\n`;
              compiledClassCreate += `        self[key] = value\n`;
              compiledClassCreate += '    end\n';
              continue;
            } else {
              compiledClassCreate += `      local __o__ = ${funcLine.trimStart()}\n`;
              inSuperClass = true;
              continue;
            }
          }
        }
        compiledClassCreate += `  ${funcLine}\n`;
      }

      // Wrap the constructor in an assignment and map it to self.
      if (func[0].startsWith(`${clazz.extends}.prototype.____constructor(`)) {
        func[0] = `local __o__ = (${func[0]}`;
        func[func.length - 1] = `${func[func.length - 1]})`;
      }
    }
  }

  const classCreates = CLASSCREATE_TEMPLATE.replace(
    '-- {CLASSES}',
    compiledClassCreate.substring(0, compiledClassCreate.length - 1)
  );

  return `${lines
    .filter((s: string | null) => s != null)
    .join('\n')}\n${reimports}\n\n${classCreates}\n\n${returnLine}\n`;
};

const handleFile = (file: tstl.EmitFile) => {
  if (file.code.length === 0) return;
  let scope: Scope = 'none';
  const fp = path.parse(file.outputPath);
  if (fp.dir.indexOf('client')) scope = 'client';
  else if (fp.dir.indexOf('server')) scope = 'server';
  else if (fp.dir.indexOf('shared')) scope = 'shared';
  const split = fp.dir.split('lua_modules');
  const isLuaModule = split.length > 1;
  if (fp.name === 'lualib_bundle') {
    file.outputPath = path.join(fp.dir, 'shared/lualib_bundle.lua');
  }
  if (isLuaModule) {
    file.outputPath = path.join(
      split[0],
      'shared',
      'lua_modules',
      ...split.slice(1),
      fp.base
    );
  }
  file.code = applyReimportScript(fixRequire(scope, file.code));
};
const copyMake = (src: string, dest: string) => {
  fs.ensureDirSync(dest);
  fs.copySync(src, dest, { recursive: true });
};

class PipeWrenchPlugin implements tstl.Plugin {
  config: PipeWrenchConfig;
  constructor() {
    const validateConfig = ajv.compile(PipeWrenchConfigSchema);

    const rawdata = fs.readFileSync('./pipewrench.json');
    const rawConfig = JSON.parse(rawdata.toString());
    if (validateConfig(rawConfig)) {
      this.config = rawConfig;
      console.log('Configuration:', this.config);
    } else {
      console.error(validateConfig.errors);
      throw 'Error parsing pipewrench.json';
    }
  }
  public beforeTransform(
    program: ts.Program,
    options: tstl.CompilerOptions,
    emitHost: tstl.EmitHost
  ) {
    if (!options.outDir) {
      throw 'Must specify outDir in tsconfig.json';
    }
    return;
  }

  beforeEmit(
    program: ts.Program,
    options: tstl.CompilerOptions,
    emitHost: tstl.EmitHost,
    result: tstl.EmitFile[]
  ) {
    if (options.outDir) {
      const modSubDir = path.join(options.outDir, this.config.modInfo.id);
      fs.ensureDirSync(modSubDir);

      if (existsSync(this.config.modelsDir))
        copyMake(
          this.config.modelsDir,
          path.join(modSubDir, 'media', 'models')
        );
      if (existsSync(this.config.texturesDir))
        copyMake(
          this.config.texturesDir,
          path.join(modSubDir, 'media', 'textures')
        );
      if (existsSync(this.config.soundDir))
        copyMake(this.config.soundDir, path.join(modSubDir, 'media', 'sound'));
      if (existsSync(this.config.scriptsDir))
        copyMake(
          this.config.scriptsDir,
          path.join(modSubDir, 'media', 'scripts')
        );
      if (existsSync(this.config.modInfo.poster)) {
        fs.copyFileSync(
          this.config.modInfo.poster,
          path.join(modSubDir, path.basename(this.config.modInfo.poster))
        );
      }
      const modInfoArray = Object.entries(this.config.modInfo).map(
        ([key, value]) => {
          return `${key}=${value}`;
        }
      );
      writeFileSync(path.join(modSubDir, 'mod.info'), modInfoArray.join('\n'));
      result.map((file) => {
        const { outDir } = options;
        if (outDir) {
          file.outputPath = path.join(
            modSubDir,
            'media',
            'lua',
            path.relative(outDir, file.outputPath)
          );
          handleFile(file);
        }
      });

      if (!existsSync(path.join(modSubDir, 'media'))) {
        mkdirSync(path.join(modSubDir, 'media'));
      }
      if (!existsSync(path.join(modSubDir, 'media/lua'))) {
        mkdirSync(path.join(modSubDir, 'media/lua'));
      }
      if (!existsSync(path.join(modSubDir, 'media/lua/shared'))) {
        mkdirSync(path.join(modSubDir, 'media/lua/shared'));
      }
      if (
        !existsSync(
          path.join(modSubDir, 'media/lua/shared/pipewrench_fixes.lua')
        )
      ) {
        writeFileSync(
          path.join(modSubDir, 'media/lua/shared/pipewrench_fixes.lua'),
          PIPEWRENCH_FIXES
        );
      }
    }
  }
}

const plugin = new PipeWrenchPlugin();
export default plugin;
