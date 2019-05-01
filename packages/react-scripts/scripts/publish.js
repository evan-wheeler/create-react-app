'use strict';

// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'production';
process.env.NODE_ENV = 'production';

// Makes the script crash on unhandled rejections instead of silently
// ignoring them. In the future, promise rejections that are not handled will
// terminate the Node.js process with a non-zero exit code.
process.on('unhandledRejection', err => {
  throw err;
});

// Ensure environment variables are read.
require('../config/env');

const chalk = require('react-dev-utils/chalk');
const path = require('path');
const fs = require('fs-extra');
const paths = require('../config/paths');

const buildPath = path.relative(process.cwd(), paths.appBuild);

const appDirectory = fs.realpathSync(process.cwd());
const resolveApp = relativePath => path.resolve(appDirectory, relativePath);
const getPkgJson = pkgJson => require(pkgJson);

let installConfig = getPkgJson(resolveApp('./.install.json'));

if (!installConfig) {
  installConfig = getPkgJson(resolveApp('./.cs.json'));

  if (!installConfig) {
    console.log(
      chalk.red(
        'Skipping install -- you need to set installPath in your package.json file.'
      )
    );
    return;
  }
}

for (const part of ['base', 'module', 'version']) {
  if (!installConfig[part]) {
    console.log(
      chalk.red(
        `Skipping install -- you need to set installPath.${part} in your package.json file.`
      )
    );
    return;
  }
}

const modPaths = getModPaths(
  buildPath,
  installConfig.base,
  installConfig.module,
  installConfig.version,
  installConfig.targetMain || 'index.html'
);

publish(modPaths);

function copyAll(destImgPaths, modPaths, htmlBuild) {
  destImgPaths.forEach(
    async dstPath =>
      await fs.copy(path.join(modPaths.build), dstPath, {
        filter: function(f) {
          if (f === htmlBuild) {
            return false;
          }

          const stat = fs.lstatSync(f);
          const relPath = path.relative(modPaths.build, f);

          if (/^(css|fonts)/.test(relPath)) {
            if (stat.isDirectory()) {
              // if css or fonts and is a directory.
              console.log(
                `Copying ${chalk.underline(relPath)} to ${chalk.underline(
                  dstPath
                )}`
              );
            }
          } else if (stat.isFile()) {
            console.log(
              `Copying ${chalk.underline(relPath)} to ${chalk.underline(
                dstPath
              )}`
            );
          }

          return true;
        },
      })
  );
}

function getModPaths(buildPath, base, module, version, mainHTML) {
  const defaultMain = 'index.html';

  let normVer;

  if (Array.isArray(version) && version.length === 3) {
    normVer = version.join('_');
  } else if (typeof version === 'string') {
    normVer = version.split(/[.]/).join('_');
  } else {
    throw new Error('expected installPath.version to be array or string');
  }

  const fullMod = `${module}_${normVer}`;

  return {
    modImg: path.join(base, 'module', fullMod, 'support'),
    html: path.join(base, 'module', fullMod, 'html'),
    img: path.join(base, 'support', module),
    srcMain: path.join(buildPath, defaultMain),
    targetMain: path.join(
      base,
      'module',
      fullMod,
      'html',
      mainHTML || defaultMain
    ),
    build: buildPath,
  };
}

function publish(modPaths) {
  var destImgPaths = [modPaths.modImg, modPaths.img];

  // main html file in build directory
  var htmlBuild = path.join(modPaths.build, 'index.html');

  // copy the main html file with some substitutions...
  try {
    var data = fs.readFileSync(htmlBuild, 'utf8');

    // patch any href='/static/css/ code to be src='`modImg`static/css/
    let result = data.replace(
      /\s*href=(['"])\/?static\/css\//g,
      ' href=$1`modImg`static/css/'
    );

    // patch any src='/static/js/ code to be src='`modImg`static/js/
    result = result.replace(
      /\s*src=(['"])\/?static\/js\//g,
      ' src=$1`modImg`static/js/'
    );

    console.log(
      'Copying ' +
        chalk.underline(htmlBuild) +
        ' to ' +
        chalk.underline(modPaths.targetMain)
    );

    // write the target html file.
    fs.writeFileSync(modPaths.targetMain, result, 'utf8');
  } catch (e) {
    console.log(chalk.yellow('Warning: ' + e.message));
  }

  // copy everything except main html file to the module/support and the main support/module directories.
  try {
    console.log(
      `Copying files to support directories: ${chalk.cyan(
        destImgPaths.join(', ')
      )}`
    );
    copyAll(destImgPaths, modPaths, htmlBuild);
  } catch (e) {
    console.log(chalk.yellow('Warning: ' + e.message));
  }
}
