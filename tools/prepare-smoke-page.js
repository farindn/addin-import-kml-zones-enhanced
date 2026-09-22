const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const templatePath = path.join(__dirname, 'smoke.html');
const runPath = path.join(__dirname, '.smoke-run.html');

const prepareSmokePage = () => {
  const bundle = fs.readdirSync(dist).find((name) => /^bundle-.+\.js$/.test(name));
  const styles = fs.readdirSync(dist).find((name) => /^styles-.+\.css$/.test(name));
  const productionHtml = fs.readFileSync(path.join(dist, 'importKmlZones.html'), 'utf8');

  if (!bundle || !styles) throw new Error('Versioned production bundle or stylesheet is missing.');
  if (!productionHtml.includes(bundle) || !productionHtml.includes(styles)) {
    throw new Error('Generated production HTML does not reference its emitted assets.');
  }
  if (!new RegExp(`<script(?: defer)? src=${bundle.replace('.', '\\.')}`).test(productionHtml)) {
    throw new Error('Generated production HTML does not reference the Add-In bundle.');
  }
  if (!productionHtml.includes('importKmlZones-app') || !productionHtml.includes('importKmlZones')) {
    throw new Error('Generated production HTML is missing the MyGeotab mount structure.');
  }

  const html = fs.readFileSync(templatePath, 'utf8')
    .replace('__STYLES_FILE__', styles)
    .replace('__BUNDLE_FILE__', bundle);
  fs.writeFileSync(runPath, html);
  return runPath;
};

module.exports = prepareSmokePage;
