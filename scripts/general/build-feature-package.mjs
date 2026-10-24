import { buildFeaturePackage, verifyFeaturePackage } from '../../src/feature-package.js';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2),
  flags = {},
  evidence = [];
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (
    !['--recipe', '--source', '--donor', '--out', '--route', '--verify', '--digest', '--evidence'].includes(key) ||
    !args[i + 1]
  )
    throw Error(
      'Use --donor <original build> --source <checkout> --out <new package> [--route source|bundle] [--evidence <REA json>] or --verify <package> [--digest <expected>]'
    );
  if (key === '--evidence') evidence.push(args[++i]);
  else flags[key.slice(2)] = args[++i];
}
const result = flags.verify
  ? await verifyFeaturePackage(flags.verify, { expectedDigest: flags.digest })
  : await buildFeaturePackage(
      flags.recipe ?? fileURLToPath(new URL('../../recipes/mqtt-raw-diff/recipe.json', import.meta.url)),
      { sourceRoot: flags.source, donorRoot: flags.donor, out: flags.out, route: flags.route, evidence }
    );
console.log(JSON.stringify(result, null, 2));
