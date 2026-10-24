import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { investigate } from '../../src/research.js';
import { runRea } from '../../src/rea.js';
import { validateFeatureRecipe } from '../../src/feature-session.js';
const args = process.argv.slice(2),
  flags = {};
for (let i = 0; i < args.length; i++) {
  if (!['--source', '--code', '--out', '--recipe'].includes(args[i]) || !args[i + 1])
    throw Error(
      'use --source <clean donor checkout> --code <recipient install> --out <new case> [--recipe <recipe.json>]'
    );
  flags[args[i].slice(2)] = args[++i];
}
if (!flags.source || !flags.code || !flags.out) throw Error('--source, --code and --out are required');
const recipe = validateFeatureRecipe(
  JSON.parse(
    await readFile(
      flags.recipe ?? fileURLToPath(new URL('../../recipes/mqtt-payload-baseline/recipe.json', import.meta.url))
    )
  )
);
const source = resolve(flags.source);
if (execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== recipe.donor.revision)
  throw Error('donor revision differs from recipe');
const r = await investigate(
  {
    donor: source,
    recipient: resolve(flags.code),
    feature: recipe.title,
    seed: recipe.donor.sourceFiles[0],
    out: resolve(flags.out),
    route: 'direct',
    donorSources: recipe.donor.sourceFiles,
    recipientSources: ['package.json', 'out/main.js']
  },
  (args, path) =>
    runRea(
      args[0] === 'analyze-javascript-application'
        ? [
            ...args,
            '--max-semantic-nodes',
            '3000',
            '--max-semantic-nodes-per-file',
            '1000',
            '--max-semantic-unknowns',
            '3000',
            '--max-semantic-unknowns-per-file',
            '1000'
          ]
        : args,
      path
    )
);
console.log(
  JSON.stringify(
    {
      id: r.id,
      status: r.status,
      donorFiles: r.donor.files.length,
      scope: 'Selected original donor feature sources and two recipient startup files. Static Evidence only.'
    },
    null,
    2
  )
);
