/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test runner. */
// Portable runner for environments that cannot spawn Vitest workers.
// Runs the same test cases and Node assertions with Node's built-in test API.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "../src/lib");
require.extensions[".ts"] = (module, filename) => {
  if (!filename.startsWith(root + path.sep)) throw new Error("Only league test modules may be compiled.");
  const source = fs.readFileSync(filename, "utf8").replace('from "vitest"', 'from "node:test"');
  const result = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  }, fileName: filename });
  module._compile(result.outputText, filename);
};
require("../src/lib/stats.test.ts");


require("../src/lib/screenshots.test.ts");
require("../src/lib/opendota.test.ts");

require("../src/lib/heroes.test.ts");
