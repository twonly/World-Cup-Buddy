const { execFileSync } = require('node:child_process');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = context.appOutDir.endsWith('.app')
    ? context.appOutDir
    : `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;

  // CI currently has no Developer ID certificate. Without signing the bundle at
  // all, macOS can report the downloaded app as "damaged" even after quarantine
  // is removed because the Electron executable carries a partial ad-hoc
  // signature but the app bundle has no sealed resources. A full ad-hoc deep
  // signature makes the bundle internally consistent. It is still not notarized.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });

  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=4', appPath], {
    stdio: 'inherit',
  });
};
