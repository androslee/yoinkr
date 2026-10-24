import { runSharedAcceptance } from '../../src/feature-acceptance.js';
const flags = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (
    !['--donor', '--feature', '--recipient', '--out', '--suite', '--xvfb'].includes(process.argv[i]) ||
    !process.argv[i + 1]
  )
    throw Error(
      'Use --donor <build> --feature <package> --recipient <adapter> --out <new proof> --xvfb <binary> [--suite <json>]'
    );
  flags[process.argv[i].slice(2)] = process.argv[i + 1];
}
for (const key of ['donor', 'feature', 'recipient', 'out', 'xvfb'])
  if (!flags[key]) throw Error('--' + key + ' required');
const result = await runSharedAcceptance({
  donorRoot: flags.donor,
  featurePackage: flags.feature,
  recipient: flags.recipient,
  out: flags.out,
  suitePath: flags.suite,
  xvfb: flags.xvfb
});
if (result.status !== 'passed') process.exitCode = 1;
