const path = require('path');

function pathStartsWith(filePath, prefix) {
  const resolved = path.resolve(filePath);
  const resolvedPrefix = path.resolve(prefix) + path.sep;

  if (process.platform === 'win32') {
    return resolved.toLowerCase() === path.resolve(prefix).toLowerCase() ||
           resolved.toLowerCase().startsWith(resolvedPrefix.toLowerCase());
  }
  return resolved === path.resolve(prefix) || resolved.startsWith(resolvedPrefix);
}

module.exports = { pathStartsWith };
