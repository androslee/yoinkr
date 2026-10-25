#!/usr/bin/env node
// Keep diagnostics available even before npm dependencies have been installed.
import { diagnose } from './doctor.js';
import { YOINKR_VERSION } from './version.js';

const args = process.argv.slice(2);
if (args.length === 1 && ['--version', '-v'].includes(args[0])) {
  console.log(YOINKR_VERSION);
} else if (args[0] === 'doctor') {
  const options = {};
  let json = false;
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (!['--example', '--firefox', '--sdk'].includes(arg))
      throw Error('doctor accepts --json, --example, --firefox and --sdk only');
    const value = args[++i];
    if (!value || value.startsWith('--')) throw Error(arg + ' requires a value');
    const key = arg.slice(2);
    if (options[key]) throw Error('Duplicate option: ' + arg);
    options[key] = value;
  }
  const report = await diagnose(options);
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Yoinkr ${report.version}: ${report.ready ? 'required prerequisites found' : 'prerequisites missing'}`);
    for (const check of report.checks) {
      console.log(`${check.status.toUpperCase()} ${check.name}: ${check.detail}`);
      if (check.remedy) console.log(`  ${check.remedy}`);
    }
    console.log(report.scope);
  }
  if (!report.ready) process.exitCode = 1;
} else {
  try {
    await import('./commands.js');
  } catch (error) {
    if (!['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'].includes(error.code)) throw error;
    console.error(
      error.message + '\nRun node src/cli.js doctor for prerequisite checks and installation instructions.'
    );
    process.exitCode = 1;
  }
}
